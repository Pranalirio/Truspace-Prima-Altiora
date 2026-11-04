/**
 * Truspace Prima Altiora – OTP + lead backend (Google Apps Script Web App)
 *
 * What it does
 *  - send_otp   : sends an SMS OTP through 2Factor.in and records the lead as "OTP sent"
 *  - verify_otp : checks the OTP with 2Factor.in and marks the lead "Verified"
 *  - save_lead  : records a lead verified by the MSG91 widget (token checked server-side),
 *                 a demo-mode lead, or a returning visitor's site-visit request
 *  - optional email alert to the sales team for every verified lead
 *
 * Setup (full steps in README.md):
 *  1. Create a Google Sheet → Extensions → Apps Script → paste this file.
 *  2. Project Settings → Script properties:
 *       TWOFACTOR_API_KEY   (required for OTP_PROVIDER "2factor")
 *       TWOFACTOR_TEMPLATE  (optional, your approved 2Factor OTP template name)
 *       MSG91_AUTHKEY       (optional, for OTP_PROVIDER "msg91")
 *       NOTIFY_EMAIL        (optional, comma-separated emails for lead alerts)
 *       DAILY_OTP_LIMIT     (optional, default 300 – protects your SMS credits)
 *       ALLOW_DEMO_LEADS    (optional, "true"/"false", default "true")
 *  3. Run setup() once and approve the permissions.
 *  4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *  5. Paste the /exec URL into APPS_SCRIPT_URL in assets/js/config.js.
 */

var SHEET_NAME = 'Leads';
var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'gbraid', 'wbraid'];
var HEADERS = ['Timestamp', 'Name', 'Mobile', 'Intent', 'Status', 'Verified at', 'OTP provider',
  'Configuration', 'Visit preference',
  'UTM source', 'UTM medium', 'UTM campaign', 'UTM term', 'UTM content', 'GCLID', 'FBCLID', 'GBRAID', 'WBRAID',
  'Page', 'Landing page', 'Referrer', 'User agent'];
var COL = { TIMESTAMP: 1, NAME: 2, MOBILE: 3, INTENT: 4, STATUS: 5, VERIFIED_AT: 6, PROVIDER: 7 };

/* ---------------- entry points ---------------- */

function doGet() {
  return json_({ ok: true, service: 'prima-altiora-leads' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Bad request.' });
  }
  // Honeypot field filled in → almost certainly a bot. Pretend success, do nothing.
  if (body.hp) return json_({ ok: true });

  try {
    switch (body.action) {
      case 'send_otp':   return json_(sendOtp_(body));
      case 'verify_otp': return json_(verifyOtp_(body));
      case 'save_lead':  return json_(saveLead_(body));
      default:           return json_({ ok: false, error: 'Unknown request.' });
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'Something went wrong on our side. Please try again or call the sales team.' });
  }
}

/** Run once from the editor: creates the Leads sheet and triggers the permission prompt. */
function setup() {
  var sh = sheet_();
  UrlFetchApp.fetch('https://2factor.in', { muteHttpExceptions: true });
  if (prop_('NOTIFY_EMAIL', '')) MailApp.getRemainingDailyQuota();
  Logger.log('Ready. Leads sheet: ' + sh.getParent().getUrl());
}

/* ---------------- 2Factor OTP ---------------- */

function sendOtp_(b) {
  var phone = cleanPhone_(b.phone);
  var name = clean_(b.name, 60);
  if (!/^[6-9]\d{9}$/.test(phone)) return { ok: false, error: 'Enter a valid 10-digit mobile number.' };
  if (name.length < 2) return { ok: false, error: 'Enter your full name.' };

  var key = prop_('TWOFACTOR_API_KEY', '');
  if (!key) return { ok: false, error: "The verification service isn't set up yet. Please call the sales team." };

  var cache = CacheService.getScriptCache();
  if (cache.get('cool_' + phone)) return { ok: false, error: 'Please wait a few seconds before asking for another OTP.' };
  var sends = Number(cache.get('sends_' + phone) || 0);
  if (sends >= 3) return { ok: false, error: 'Too many OTP requests for this number. Try again in 15 minutes or call us.' };
  if (!takeDailyBudget_()) return { ok: false, error: 'We are getting a lot of requests right now. Please call or WhatsApp the sales team.' };

  var tpl = prop_('TWOFACTOR_TEMPLATE', '');
  var url = 'https://2factor.in/API/V1/' + encodeURIComponent(key) + '/SMS/+91' + phone + '/AUTOGEN' +
    (tpl ? '/' + encodeURIComponent(tpl) : '');
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var data = parse_(res.getContentText());
  if (data.Status !== 'Success' || !data.Details) {
    console.warn('2Factor send failed: ' + res.getResponseCode() + ' ' + res.getContentText());
    return { ok: false, error: "We couldn't send the OTP. Check the number and try again." };
  }

  cache.put('sess_' + phone, String(data.Details), 600);   // OTP session valid for 10 minutes
  cache.put('tries_' + phone, '0', 600);
  cache.put('cool_' + phone, '1', 25);
  cache.put('sends_' + phone, String(sends + 1), 900);

  upsertLead_(phone, b, 'OTP sent', '2Factor', false, false);
  return { ok: true };
}

function verifyOtp_(b) {
  var phone = cleanPhone_(b.phone);
  var otp = String(b.otp || '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(phone) || !/^\d{4,8}$/.test(otp)) return { ok: false, error: 'Enter the OTP from the SMS.' };

  var cache = CacheService.getScriptCache();
  var sess = cache.get('sess_' + phone);
  if (!sess) return { ok: false, error: 'This OTP has expired. Tap "Resend OTP" to get a new one.' };

  var tries = Number(cache.get('tries_' + phone) || 0);
  if (tries >= 5) {
    cache.remove('sess_' + phone);
    return { ok: false, error: 'Too many wrong attempts. Tap "Resend OTP" to get a new code.' };
  }
  cache.put('tries_' + phone, String(tries + 1), 600);

  var key = prop_('TWOFACTOR_API_KEY', '');
  var url = 'https://2factor.in/API/V1/' + encodeURIComponent(key) + '/SMS/VERIFY/' + encodeURIComponent(sess) + '/' + otp;
  var data = parse_(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());

  if (data.Status === 'Success' && String(data.Details).trim().toLowerCase() === 'otp matched') {
    cache.remove('sess_' + phone);
    markVerified_(phone, '2Factor');
    return { ok: true };
  }
  return { ok: false, error: "That code doesn't match. Check the OTP and try again." };
}

/* ---------------- MSG91 / demo / returning ---------------- */

function saveLead_(b) {
  var phone = cleanPhone_(b.phone);
  var name = clean_(b.name, 60);
  if (!/^[6-9]\d{9}$/.test(phone) || name.length < 2) return { ok: false, error: 'Enter your name and a valid mobile number.' };

  var cache = CacheService.getScriptCache();
  var saves = Number(cache.get('saves_' + phone) || 0);
  if (saves >= 6) return { ok: false, error: 'We already have your request. Our team will call you shortly.' };
  cache.put('saves_' + phone, String(saves + 1), 3600);

  var provider = String(b.provider || '');
  var row;
  if (provider === 'msg91') {
    var authkey = prop_('MSG91_AUTHKEY', '');
    if (authkey) {
      if (!b.token || !verifyMsg91Token_(authkey, String(b.token))) {
        return { ok: false, error: "We couldn't confirm the verification. Please request a new OTP." };
      }
      row = upsertLead_(phone, b, 'Verified', 'MSG91', true, true);
    } else {
      row = upsertLead_(phone, b, 'Verified (token not checked – add MSG91_AUTHKEY)', 'MSG91', true, true);
    }
    notify_(row);
  } else if (provider === 'demo') {
    if (prop_('ALLOW_DEMO_LEADS', 'true') !== 'true') return { ok: true };
    upsertLead_(phone, b, 'Demo (not verified)', 'Demo', false, true);
  } else if (provider === 'returning') {
    row = upsertLead_(phone, b, 'Returning visitor (verified earlier on this browser)', 'Returning', false, true);
    notify_(row);
  } else {
    return { ok: false, error: 'Unknown request.' };
  }
  return { ok: true };
}

/**
 * Checks an MSG91 OTP-widget access token on the server.
 * Endpoint per MSG91's "Verify Access Token" API – confirm it in your MSG91 panel
 * (OTP → Widget → Server-side integration) if MSG91 changes it.
 */
function verifyMsg91Token_(authkey, token) {
  var res = UrlFetchApp.fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ authkey: authkey, 'access-token': token }),
    muteHttpExceptions: true
  });
  var d = parse_(res.getContentText());
  if (d.type !== 'success') console.warn('MSG91 token check failed: ' + res.getContentText());
  return d.type === 'success';
}

/* ---------------- sheet helpers ---------------- */

function sheet_() {
  var id = prop_('SHEET_ID', '');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

/** Writes a lead. Re-uses the same row for one OTP session (so resends don't create duplicates). */
function upsertLead_(phone, b, status, provider, verified, forceNew) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = sheet_();
    var now = new Date();
    var row = [
      now, safe_(clean_(b.name, 60)), safe_('+91 ' + phone), safe_(clean_(b.intent, 40)), status,
      verified ? now : '', provider, safe_(clean_(b.config, 20)), safe_(clean_(b.visit, 40))
    ];
    UTM_KEYS.forEach(function (k) { row.push(safe_(clean_(b[k], 200))); });
    row.push(safe_(clean_(b.page, 500)), safe_(clean_(b.landing, 500)), safe_(clean_(b.referrer, 300)), safe_(clean_(b.ua, 300)));

    var r = forceNew ? 0 : cachedRow_(sh, phone);
    if (r) {
      row[0] = sh.getRange(r, COL.TIMESTAMP).getValue() || now;
      sh.getRange(r, 1, 1, row.length).setValues([row]);
    } else {
      sh.appendRow(row);
      r = sh.getLastRow();
    }
    CacheService.getScriptCache().put('row_' + phone, String(r), 21600);
    return r;
  } finally {
    lock.releaseLock();
  }
}

function markVerified_(phone, provider) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var r;
  try {
    var sh = sheet_();
    r = cachedRow_(sh, phone) || searchRow_(sh, phone);
    if (r) {
      sh.getRange(r, COL.STATUS, 1, 3).setValues([['Verified', new Date(), provider]]);
    } else {
      var row = [new Date(), '', safe_('+91 ' + phone), '', 'Verified', new Date(), provider];
      while (row.length < HEADERS.length) row.push('');
      sh.appendRow(row);
      r = sh.getLastRow();
    }
  } finally {
    lock.releaseLock();
  }
  notify_(r);
  return r;
}

function cachedRow_(sh, phone) {
  var r = Number(CacheService.getScriptCache().get('row_' + phone) || 0);
  if (r > 1 && r <= sh.getLastRow() && String(sh.getRange(r, COL.MOBILE).getValue()) === '+91 ' + phone) return r;
  return 0;
}

/** Fallback when the cache was evicted: newest "OTP sent" row for this number in the last 500 rows. */
function searchRow_(sh, phone) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var start = Math.max(2, last - 499);
  var vals = sh.getRange(start, COL.MOBILE, last - start + 1, 3).getValues(); // Mobile, Intent, Status
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === '+91 ' + phone && String(vals[i][2]) === 'OTP sent') return start + i;
  }
  return 0;
}

function notify_(r) {
  var to = prop_('NOTIFY_EMAIL', '');
  if (!to || !r) return;
  try {
    var sh = sheet_();
    var v = sh.getRange(r, 1, 1, HEADERS.length).getValues()[0];
    var lines = HEADERS.map(function (h, i) { return h + ': ' + (v[i] === '' ? '-' : v[i]); });
    MailApp.sendEmail({
      to: to,
      subject: 'New lead – Prima Altiora: ' + v[COL.NAME - 1] + ' (' + v[COL.INTENT - 1] + ')',
      body: lines.join('\n') + '\n\nSheet: ' + sh.getParent().getUrl()
    });
  } catch (err) {
    console.warn('Lead email failed: ' + err);
  }
}

/* ---------------- small utilities ---------------- */

/** Daily SMS cap so a bot can't drain your 2Factor credits. */
function takeDailyBudget_() {
  var limit = Number(prop_('DAILY_OTP_LIMIT', '300'));
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var key = 'otp_count_' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMdd');
    var props = PropertiesService.getScriptProperties();
    var n = Number(props.getProperty(key) || 0);
    if (n >= limit) return false;
    props.setProperty(key, String(n + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function prop_(k, d) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  return v === null || v === '' ? d : v;
}
function cleanPhone_(v) {
  v = String(v || '').replace(/\D/g, '');
  if (v.length === 12 && v.indexOf('91') === 0) v = v.slice(2);
  if (v.length === 11 && v.charAt(0) === '0') v = v.slice(1);
  return v;
}
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, max || 200); }
/** Stops spreadsheet formula injection (values starting with = + - @). */
function safe_(v) { return /^[=+\-@]/.test(v) ? "'" + v : v; }
function parse_(t) { try { return JSON.parse(t); } catch (e) { return {}; } }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Truspace Prima Altiora – page behaviour
   - OTP gate in front of price and floor plans (demo / 2Factor / MSG91)
   - lead capture to Google Sheets via Apps Script
   - UTM capture and conversion events                                  */
(function () {
  "use strict";

  var CFG = Object.assign(
    { OTP_PROVIDER: "demo", RESEND_SECONDS: 30, UNLOCK_DAYS: 30 },
    window.PA_CONFIG || {}
  );
  var root = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var fld = function (form, n) { return form.querySelector('[name="' + n + '"]'); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- storage (never throws) ---------- */
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    sget: function (k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- cost sheet (Tower C) ---------- */
  var UNITS = {
    "2bhk-t3": { agreement: 9372000,  stamp: 656100, reg: 36000, gst: 468600, total: 10532700 },
    "2bhk-t2": { agreement: 9750400,  stamp: 682600, reg: 36000, gst: 487520, total: 10956520 },
    "2bhk-t1": { agreement: 9820800,  stamp: 687600, reg: 36000, gst: 491040, total: 11035440 },
    "3bhk-t1": { agreement: 13261600, stamp: 928400, reg: 36000, gst: 663080, total: 14889080 },
    "3bhk-t2": { agreement: 13296800, stamp: 930800, reg: 36000, gst: 664840, total: 14928440 },
    "3bhk-t3": { agreement: 13314400, stamp: 932100, reg: 36000, gst: 665720, total: 14948220 }
  };

  var PAYMENT = [
    [10, "Before execution of the agreement for sale"],
    [1, "TDS within 7 days after execution of the agreement"],
    [9, "On or after execution of the agreement for sale"],
    [10, "Within 8 days of completion of excavation work"],
    [15, "Within 8 days of completion of plinth work"],
    [2.5, "Completion of the 1st podium floor slab"],
    [2.5, "Completion of the 2nd podium floor slab"],
    [2, "Completion of the 2nd floor slab"],
    [2, "Completion of the 5th floor slab"],
    [2, "Completion of the 8th floor slab"],
    [2, "Completion of the 11th floor slab"],
    [2, "Completion of the 14th floor slab"],
    [2, "Completion of the 17th floor slab"],
    [2, "Completion of the 20th floor slab"],
    [2, "Completion of the 23rd floor slab"],
    [2, "Completion of the 26th floor slab"],
    [2, "Completion of the 30th floor slab"],
    [2.5, "Walls, internal plaster, flooring, doors and windows of the flat"],
    [2.5, "Completion of flooring, doors and windows of the flat"],
    [2.5, "Sanitary fittings and staircase up to the floor of the flat"],
    [2.5, "Lift well and lobbies up to the floor of the flat"],
    [2.5, "External plumbing and external plaster of the building"],
    [2.5, "Elevation and terraces with waterproofing"],
    [4, "Electrical fittings of the building"],
    [4, "Lifts, water pumps, entrance lobby, plinth protection and paving"],
    [2, "Electro-mechanical and environment requirements, entrance lobby and paving"],
    [5, "On possession"]
  ];

  var SUB_DEFAULT = "Verify your mobile number once to see the full cost sheet and every unit plan.";
  var INTENTS = {
    price: { intent: "Price & floor plans", target: "#price", title: "Unlock price & floor plans", sub: SUB_DEFAULT, go: "View price" },
    plans: { intent: "Floor plans", target: "#floor-plans", title: "Unlock floor plans", sub: SUB_DEFAULT, go: "View floor plans" },
    visit: { intent: "Site visit", target: "#price", title: "Book a site visit", sub: "Verify your mobile number to request a site visit.", go: "View price" },
    call: { intent: "Call request", target: "#price", title: "Get the sales number", sub: "Verify your mobile number to see our sales number. The price sheet and floor plans open too.", go: "View price & floor plans", reveal: "call" },
    whatsapp: { intent: "WhatsApp request", target: "#price", title: "Chat with us on WhatsApp", sub: "Verify your mobile number to get our WhatsApp number. The price sheet and floor plans open too.", go: "View price & floor plans", reveal: "whatsapp" }
  };

  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "gbraid", "wbraid"];

  /* ---------- formatting ---------- */
  function inr(n) { return "₹" + Number(n).toLocaleString("en-IN"); }
  function shortInr(n) {
    var v = n >= 1e7 ? (n / 1e7).toFixed(2) + " Cr" : (n / 1e5).toFixed(2) + " L";
    return "₹" + v.replace(/\.00 /, " ");
  }
  function maskPhone(p) { return p ? p.slice(0, 2) + "xxxxx" + p.slice(7) : ""; }

  /* ---------- toast ---------- */
  var toastEl = $(".toast"), toastTimer = null;
  function toast(msg, ms) {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, ms || 3800);
  }

  /* ---------- tracking ---------- */
  function track(name, params) {
    params = params || {};
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: name }, params));
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params);
      if (name === "generate_lead" && CFG.GOOGLE_ADS_SEND_TO) window.gtag("event", "conversion", { send_to: CFG.GOOGLE_ADS_SEND_TO });
    }
    if (typeof window.fbq === "function" && name === "generate_lead") window.fbq("track", "Lead", { content_name: params.intent || "" });
  }
  function loadTracking() {
    var gId = CFG.GA4_ID || (CFG.GOOGLE_ADS_SEND_TO ? CFG.GOOGLE_ADS_SEND_TO.split("/")[0] : "");
    if (gId) {
      var s = document.createElement("script");
      s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(gId);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      if (CFG.GA4_ID) window.gtag("config", CFG.GA4_ID);
      if (CFG.GOOGLE_ADS_SEND_TO) window.gtag("config", CFG.GOOGLE_ADS_SEND_TO.split("/")[0]);
    }
    if (CFG.META_PIXEL_ID) {
      /* Meta Pixel base code */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", CFG.META_PIXEL_ID);
      window.fbq("track", "PageView");
    }
  }

  /* ---------- UTM capture ---------- */
  function captureUtm() {
    var p = new URLSearchParams(location.search);
    var u = store.sget("pa_utm") || {};
    UTM_KEYS.forEach(function (k) { if (p.get(k)) u[k] = p.get(k).slice(0, 200); });
    if (!u.landing) { u.landing = location.href.slice(0, 500); u.referrer = (document.referrer || "").slice(0, 300); }
    store.sset("pa_utm", u);
  }

  /* ---------- contact links ----------
     The sales number is never printed in the HTML. Call / WhatsApp buttons open the
     OTP gate first; once the visitor is verified they dial / open chat directly and
     show the number.                                                              */
  var SALES_TEL = (CFG.PHONE || "").replace(/[^\d+]/g, "");
  var SALES_WA = (CFG.WHATSAPP || "").replace(/\D/g, "");
  function telHref() { return "tel:" + SALES_TEL; }
  function waHref() { return "https://wa.me/" + SALES_WA + "?text=" + encodeURIComponent(CFG.WHATSAPP_TEXT || ""); }
  function displayTel() {
    var d = SALES_TEL.replace(/\D/g, "");
    if (d.length === 12 && d.indexOf("91") === 0) return "+91 " + d.slice(2, 7) + " " + d.slice(7);
    return SALES_TEL;
  }

  function renderContacts(unlocked) {
    $$("[data-call]").forEach(function (a) {
      var label = $("[data-call-text]", a);
      if (label && !a.dataset.lockedText) a.dataset.lockedText = label.textContent;
      if (!SALES_TEL) { a.hidden = true; return; }
      if (unlocked) {
        a.href = telHref();
        if (label) label.textContent = a.getAttribute("data-call") === "short" ? displayTel().replace(/^\+91 /, "") : "Call " + displayTel();
      } else {
        a.href = "#enquire";
        if (label) label.textContent = a.dataset.lockedText;
      }
    });
    $$("[data-whatsapp]").forEach(function (a) {
      if (!SALES_WA) { a.hidden = true; return; }
      if (unlocked) { a.href = waHref(); a.target = "_blank"; a.rel = "noopener"; }
      else { a.href = "#enquire"; a.removeAttribute("target"); }
    });
  }

  /* Call / WhatsApp clicks: gate first, then dial or chat */
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-call], [data-whatsapp], [data-reveal-tel], [data-reveal-wa]");
    if (!a) return;
    var isWa = a.hasAttribute("data-whatsapp") || a.hasAttribute("data-reveal-wa");
    if (!isUnlocked() && (a.hasAttribute("data-call") || a.hasAttribute("data-whatsapp"))) {
      e.preventDefault();
      openGate(isWa ? "whatsapp" : "call");
      return;
    }
    track(isWa ? "click_whatsapp" : "click_call");
  });

  function setupContacts() {
    if (CFG.MAPS_LINK) $$("[data-maps]").forEach(function (a) { a.href = CFG.MAPS_LINK; });
    $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
    if (CFG.AGENT_NAME || CFG.AGENT_RERA) {
      $$("[data-agent]").forEach(function (el) {
        el.textContent = "";
        if (CFG.AGENT_NAME) {
          el.appendChild(document.createTextNode("This page is operated by "));
          var n = document.createElement("strong"); n.textContent = CFG.AGENT_NAME; el.appendChild(n);
        }
        if (CFG.AGENT_RERA) {
          if (CFG.AGENT_NAME) el.appendChild(document.createElement("br"));
          el.appendChild(document.createTextNode("MahaRERA Agent Registration No. "));
          var r = document.createElement("strong"); r.textContent = CFG.AGENT_RERA; el.appendChild(r);
        }
        el.hidden = false;
      });
    }
  }

  /* ---------- lock state ---------- */
  function getLead() {
    var l = store.get("pa_lead");
    if (!l || !l.verified) return null;
    if (Date.now() - (l.ts || 0) > CFG.UNLOCK_DAYS * 864e5) return null;
    return l;
  }
  function isUnlocked() { return !!getLead(); }

  var LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  function renderPrices(unlocked) {
    $$("#price-rows tr[data-unit]").forEach(function (tr) {
      var u = UNITS[tr.getAttribute("data-unit")];
      $$("td.p", tr).forEach(function (td) {
        var k = td.getAttribute("data-k");
        if (unlocked) {
          td.innerHTML = k === "total"
            ? '<span>' + inr(u[k]) + '</span> <small class="short">(' + shortInr(u[k]) + ")</small>"
            : inr(u[k]);
        } else if (k === "agreement" || k === "total") {
          td.innerHTML = '<button type="button" class="price-lock" data-gate="price">' + LOCK_SVG + "Unlock</button>";
        } else {
          td.innerHTML = '<span class="price-blur" aria-hidden="true">₹0,00,000</span><span class="sr-only">Hidden until verified</span>';
        }
      });
    });
  }

  function renderPayment() {
    var ol = $("#payment-rows");
    if (!ol || ol.children.length) return;
    ol.innerHTML = PAYMENT.map(function (r) { return "<li><b>" + r[0] + "%</b><span>" + r[1] + "</span></li>"; }).join("");
  }

  function renderPlans(unlocked) {
    $$(".plan-card").forEach(function (card) {
      var img = $("img", card), plan = card.getAttribute("data-plan");
      var want = unlocked ? "assets/img/" + plan + ".webp" : "assets/img/locked/" + plan + "-preview.webp";
      if (img.getAttribute("src") !== want) img.setAttribute("src", want);
    });
  }

  function applyLockState() {
    var u = isUnlocked();
    root.classList.toggle("is-unlocked", u);
    root.classList.toggle("is-locked", !u);
    renderPrices(u);
    renderPlans(u);
    renderContacts(u);
    if (u) renderPayment();
    $$("[data-unlocked-only]").forEach(function (el) { el.hidden = !u; });
  }

  function scrollToTarget(sel) {
    var el = sel && $(sel);
    if (el) el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  /* ---------- backend (Google Apps Script) ---------- */
  function api(payload) {
    if (!CFG.APPS_SCRIPT_URL) return Promise.reject(new Error("The verification service isn't set up yet. Please call or WhatsApp the sales team."));
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    // text/plain body keeps this a "simple" request, so Apps Script needs no CORS preflight
    return fetch(CFG.APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload), redirect: "follow", signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) { return res.text(); })
      .then(function (txt) { return JSON.parse(txt); })
      .catch(function () { throw new Error("We couldn't reach the server. Check your connection and try again."); })
      .finally(function () { clearTimeout(t); });
  }

  /* ---------- OTP providers ---------- */
  var demoCode = null;
  var demoNote = $(".demo-note");

  function errText(err, fallback) {
    if (!err) return fallback;
    if (typeof err === "string") return err.length < 140 ? err : fallback;
    var m = err.message || err.msg;
    return m && String(m).length < 140 ? String(m) : fallback;
  }

  var msg91Ready = null;
  function loadMsg91() {
    if (msg91Ready) return msg91Ready;
    msg91Ready = new Promise(function (resolve, reject) {
      if (!CFG.MSG91_WIDGET_ID || !CFG.MSG91_TOKEN_AUTH) return reject(new Error("The verification service isn't set up yet. Please call or WhatsApp the sales team."));
      var s = document.createElement("script");
      s.src = "https://verify.msg91.com/otp-provider.js"; s.async = true;
      s.onload = function () {
        try {
          window.initSendOTP({
            widgetId: CFG.MSG91_WIDGET_ID,
            tokenAuth: CFG.MSG91_TOKEN_AUTH,
            exposeMethods: true,
            captchaRenderId: "msg91-captcha",
            success: function () {},
            failure: function () {}
          });
        } catch (e) { return reject(new Error("Couldn't start the OTP service. Please try again.")); }
        var t0 = Date.now();
        (function poll() {
          if (typeof window.sendOtp === "function") return resolve();
          if (Date.now() - t0 > 8000) return reject(new Error("Couldn't start the OTP service. Please try again."));
          setTimeout(poll, 120);
        })();
      };
      s.onerror = function () { reject(new Error("Couldn't load the OTP service. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
    msg91Ready.catch(function () { msg91Ready = null; });
    return msg91Ready;
  }

  var PROVIDERS = {
    demo: {
      send: function () {
        demoCode = String(Math.floor(100000 + Math.random() * 900000));
        demoNote.hidden = false;
        demoNote.innerHTML = "<strong>Demo mode.</strong> No SMS is sent. Your OTP is <strong>" + demoCode +
          "</strong>. Switch OTP_PROVIDER in assets/js/config.js before going live.";
        return wait(450);
      },
      verify: function (otp, lead) {
        return wait(350).then(function () {
          if (otp !== demoCode) throw new Error("That code doesn't match. Check the OTP and try again.");
          if (CFG.APPS_SCRIPT_URL) return api(Object.assign({ action: "save_lead", provider: "demo" }, lead)).catch(function () {});
        });
      },
      resend: function () { return this.send(); }
    },

    "2factor": {
      send: function (lead) {
        return api(Object.assign({ action: "send_otp" }, lead)).then(function (r) {
          if (!r || !r.ok) throw new Error((r && r.error) || "We couldn't send the OTP. Try again in a minute.");
        });
      },
      verify: function (otp, lead) {
        return api({ action: "verify_otp", phone: lead.phone, otp: otp }).then(function (r) {
          if (!r || !r.ok) throw new Error((r && r.error) || "That code doesn't match. Check the OTP and try again.");
        });
      },
      resend: function (lead) { return this.send(lead); }
    },

    msg91: {
      send: function (lead) {
        return loadMsg91().then(function () {
          return new Promise(function (res, rej) {
            window.sendOtp("91" + lead.phone,
              function () { res(); },
              function (err) { rej(new Error(errText(err, "We couldn't send the OTP. Try again in a minute."))); });
          });
        });
      },
      verify: function (otp, lead) {
        return new Promise(function (res, rej) {
          window.verifyOtp(otp,
            function (data) { res(data && (data.message || data.token || data["access-token"])); },
            function (err) { rej(new Error(errText(err, "That code doesn't match. Check the OTP and try again."))); });
        }).then(function (token) {
          if (!CFG.APPS_SCRIPT_URL) return;
          return api(Object.assign({ action: "save_lead", provider: "msg91", token: token || "" }, lead)).then(function (r) {
            if (!r || !r.ok) throw new Error((r && r.error) || "We couldn't confirm the verification. Please try again.");
          });
        });
      },
      resend: function () {
        return new Promise(function (res, rej) {
          window.retryOtp(null, function () { res(); },
            function (err) { rej(new Error(errText(err, "We couldn't resend the OTP. Try again shortly."))); });
        });
      }
    }
  };
  var provider = PROVIDERS[CFG.OTP_PROVIDER] || PROVIDERS.demo;

  /* ---------- gate dialog ---------- */
  var gate = $("#gate");
  var detailsForm = $("#gate-details");
  var otpForm = $("#gate-otp");
  var resendBtn = $("[data-resend]");
  var ctx = Object.assign({ extra: {} }, INTENTS.price);
  var pending = { name: "", phone: "", hp: "" };
  var resendTimer = null;

  function showStep(step) {
    $$(".gate-step", gate).forEach(function (s) { s.hidden = s.getAttribute("data-step") !== step; });
  }
  function setError(form, msg) { var e = $(".form-error", form); if (e) e.textContent = msg || ""; }
  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  function cleanPhone(v) {
    v = String(v || "").replace(/\D/g, "");
    if (v.length === 12 && v.indexOf("91") === 0) v = v.slice(2);
    if (v.length === 11 && v.charAt(0) === "0") v = v.slice(1);
    return v;
  }
  function validate(name, phone) {
    if (!name || name.replace(/\s+/g, " ").trim().length < 2) return "Enter your full name.";
    if (!/^[6-9]\d{9}$/.test(phone)) return "Enter a 10-digit mobile number starting with 6, 7, 8 or 9.";
    return "";
  }

  function leadPayload() {
    var utm = store.sget("pa_utm") || {};
    var p = {
      name: pending.name, phone: pending.phone, intent: ctx.intent,
      config: (ctx.extra && ctx.extra.config) || "", visit: (ctx.extra && ctx.extra.visit) || "",
      page: location.href.split("#")[0].slice(0, 500),
      landing: utm.landing || "", referrer: utm.referrer || "",
      ua: navigator.userAgent.slice(0, 300), hp: pending.hp || ""
    };
    UTM_KEYS.forEach(function (k) { p[k] = utm[k] || ""; });
    return p;
  }

  function openGate(kind, opts) {
    opts = opts || {};
    ctx = Object.assign({ extra: {} }, INTENTS[kind] || INTENTS.price, opts);
    if (isUnlocked() && !opts.prefill) { scrollToTarget(ctx.target); return; }

    $("#gate-title").textContent = ctx.title;
    $("[data-gate-sub]").textContent = ctx.sub || SUB_DEFAULT;
    setError(detailsForm, ""); setError(otpForm, "");
    demoNote.hidden = true;
    showStep("details");

    var draft = opts.prefill || store.get("pa_draft") || {};
    fld(detailsForm, "name").value = draft.name || fld(detailsForm, "name").value || "";
    fld(detailsForm, "phone").value = draft.phone || fld(detailsForm, "phone").value || "";

    if (!gate.open) { if (gate.showModal) gate.showModal(); else gate.setAttribute("open", ""); }
    track("gate_open", { intent: ctx.intent });
    if (CFG.OTP_PROVIDER === "msg91") loadMsg91().catch(function (e) { setError(detailsForm, e.message); });

    if (opts.autoSend) {
      startOtp(draft.name, draft.phone, opts.hp);
    } else {
      setTimeout(function () { (fld(detailsForm, "name").value ? fld(detailsForm, "phone") : fld(detailsForm, "name")).focus(); }, 60);
    }
  }

  function closeGate() { if (gate.open) { if (gate.close) gate.close(); else gate.removeAttribute("open"); } }

  function startResendTimer() {
    var s = CFG.RESEND_SECONDS;
    resendBtn.disabled = true;
    resendBtn.innerHTML = 'Resend OTP in <span data-countdown>' + s + "</span>s";
    clearInterval(resendTimer);
    resendTimer = setInterval(function () {
      s -= 1;
      if (s <= 0) { clearInterval(resendTimer); resendBtn.disabled = false; resendBtn.textContent = "Resend OTP"; }
      else { var c = $("[data-countdown]", resendBtn); if (c) c.textContent = s; }
    }, 1000);
  }

  function startOtp(name, phone, hp) {
    name = String(name || "").replace(/\s+/g, " ").trim();
    phone = cleanPhone(phone);
    var msg = validate(name, phone);
    if (msg) { setError(detailsForm, msg); return Promise.resolve(false); }
    pending = { name: name, phone: phone, hp: hp || "" };
    store.set("pa_draft", { name: name, phone: phone });
    setError(detailsForm, "");
    var btn = $('button[type="submit"]', detailsForm);
    setBusy(btn, true, "Sending OTP…");
    return provider.send(leadPayload()).then(function () {
      $("[data-phone-echo]").textContent = phone;
      fld(otpForm, "otp").value = "";
      setError(otpForm, "");
      showStep("otp");
      startResendTimer();
      track("otp_sent", { intent: ctx.intent });
      setTimeout(function () { fld(otpForm, "otp").focus(); }, 60);
      return true;
    }).catch(function (e) {
      setError(detailsForm, e.message);
      return false;
    }).finally(function () { setBusy(btn, false); });
  }

  function onVerified() {
    store.set("pa_lead", { verified: true, name: pending.name, phone: pending.phone, ts: Date.now() });
    store.del("pa_draft");
    clearInterval(resendTimer);
    applyLockState();
    track("generate_lead", { intent: ctx.intent });

    var title = $("[data-done-title]"), text = $("[data-done-text]"), go = $("[data-done-go]");
    if (ctx.intent === "Site visit") {
      title.textContent = "Site visit requested";
      text.textContent = "Our team will call +91 " + maskPhone(pending.phone) + " to confirm a time. Price and floor plans are now open on this page.";
    } else if (ctx.reveal) {
      title.textContent = "Number verified";
      text.textContent = ctx.reveal === "whatsapp"
        ? "Message our sales team on WhatsApp. Price and floor plans are now open on this page too."
        : "Call our sales team now. Price and floor plans are now open on this page too.";
    } else {
      title.textContent = "Number verified";
      text.textContent = "Price and floor plans are now open on this page.";
    }

    // reveal the sales number after every successful verification
    var reveal = $("[data-reveal]");
    if (SALES_TEL) {
      $$("[data-reveal-tel]", reveal).forEach(function (a) { a.href = telHref(); });
      $("[data-reveal-tel]:not([data-reveal-call])", reveal).textContent = displayTel();
      var waBtn = $("[data-reveal-wa]", reveal);
      if (SALES_WA) waBtn.href = waHref(); else waBtn.hidden = true;
      reveal.hidden = false;
    } else {
      reveal.hidden = true;
    }
    // when the visitor asked to call / chat, those are the main actions; "view price" becomes secondary
    go.textContent = ctx.go || "View price";
    go.className = "btn btn-block " + (ctx.reveal && SALES_TEL ? "btn-outline" : "btn-primary");

    showStep("done");
    var focusEl = ctx.reveal === "whatsapp" && SALES_WA ? $("[data-reveal-wa]", reveal)
      : ctx.reveal && SALES_TEL ? $("[data-reveal-call]", reveal) : go;
    focusEl.focus();
  }

  detailsForm.addEventListener("submit", function (e) {
    e.preventDefault();
    startOtp(fld(detailsForm, "name").value, fld(detailsForm, "phone").value, fld(detailsForm, "website").value);
  });

  otpForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var otp = fld(otpForm, "otp").value.replace(/\D/g, "");
    if (!/^\d{4,8}$/.test(otp)) { setError(otpForm, "Enter the OTP from the SMS."); return; }
    var btn = $('button[type="submit"]', otpForm);
    setBusy(btn, true, "Verifying…");
    setError(otpForm, "");
    provider.verify(otp, leadPayload())
      .then(onVerified)
      .catch(function (err) { setError(otpForm, err.message); track("otp_failed"); })
      .finally(function () { setBusy(btn, false); });
  });

  resendBtn.addEventListener("click", function () {
    resendBtn.disabled = true;
    provider.resend(leadPayload()).then(function () {
      toast("A new OTP has been sent to +91 " + pending.phone + ".");
      startResendTimer();
    }).catch(function (err) { setError(otpForm, err.message); resendBtn.disabled = false; });
  });

  $("[data-change-number]").addEventListener("click", function () {
    clearInterval(resendTimer);
    demoNote.hidden = true;
    showStep("details");
    fld(detailsForm, "phone").focus();
  });

  $("[data-done-go]").addEventListener("click", function () { closeGate(); scrollToTarget(ctx.target); });

  /* close on ✕ and on backdrop click */
  $$("[data-close]").forEach(function (b) {
    b.addEventListener("click", function () { var d = b.closest("dialog"); if (d && d.close) d.close(); });
  });
  $$("dialog").forEach(function (d) {
    d.addEventListener("click", function (e) {
      if (e.target !== d) return;
      var r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
    });
  });

  /* keep phone fields to digits; a pasted "+91 98765 43210" or "098765 43210" becomes 9876543210 */
  $$('input[type="tel"], .otp-input').forEach(function (inp) {
    inp.addEventListener("input", function () {
      var v = inp.value.replace(/\D/g, "");
      if (inp.classList.contains("otp-input")) v = v.slice(0, 8);
      else v = cleanPhone(v).slice(0, 12);
      if (v !== inp.value) inp.value = v;
    });
  });

  /* ---------- page lead forms (hero + site visit) ---------- */
  $$("form.lead-form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = fld(form, "name").value.replace(/\s+/g, " ").trim();
      var phone = cleanPhone(fld(form, "phone").value);
      var msg = validate(name, phone);
      if (msg) { setError(form, msg); return; }
      setError(form, "");
      var kind = form.getAttribute("data-intent") === "Site visit" ? "visit" : "price";
      var extra = { config: fld(form, "config") ? fld(form, "config").value : "", visit: fld(form, "visit") ? fld(form, "visit").value : "" };
      var hp = fld(form, "website") ? fld(form, "website").value : "";

      var lead = getLead();
      if (lead && lead.phone === phone) {
        // already verified on this browser: record the request without another OTP
        ctx = Object.assign({ extra: extra }, INTENTS[kind]);
        pending = { name: name, phone: phone, hp: hp };
        var btn = $('button[type="submit"]', form);
        setBusy(btn, true, "Sending…");
        var send = CFG.APPS_SCRIPT_URL ? api(Object.assign({ action: "save_lead", provider: "returning" }, leadPayload())) : Promise.resolve({ ok: true });
        send.then(function () {
          track("generate_lead", { intent: ctx.intent, returning: true });
          toast(kind === "visit" ? "Thanks, " + name.split(" ")[0] + ". Our team will call you to confirm the visit." : "You're verified. Here are the prices.");
          if (kind !== "visit") scrollToTarget("#price");
          form.reset();
        }).catch(function (err) { setError(form, err.message); })
          .finally(function () { setBusy(btn, false); });
        return;
      }
      openGate(kind, { prefill: { name: name, phone: phone }, autoSend: true, extra: extra, hp: hp });
    });
  });

  /* ---------- buttons that open the gate ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-gate]");
    if (!t) return;
    e.preventDefault();
    openGate(t.getAttribute("data-gate"));
  });

  /* ---------- floor plan cards ---------- */
  var lightbox = $("#lightbox");
  function openLightbox(src, caption) {
    var img = $("img", lightbox);
    img.src = src; img.alt = caption;
    $("figcaption", lightbox).textContent = caption;
    if (lightbox.showModal) lightbox.showModal(); else lightbox.setAttribute("open", "");
  }
  $$(".plan-card .plan-media").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var card = btn.closest(".plan-card");
      if (!isUnlocked()) { openGate("plans"); return; }
      openLightbox("assets/img/" + card.getAttribute("data-plan") + ".webp", $("h3", card).textContent);
      track("view_floor_plan", { plan: card.getAttribute("data-plan") });
    });
  });
  $$(".zoomable").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openLightbox(btn.getAttribute("data-full"), btn.closest("figure").querySelector("figcaption").textContent);
    });
  });

  /* plan filter */
  $$(".plan-filter [data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      var f = b.getAttribute("data-filter");
      $$(".plan-filter [data-filter]").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
      $$(".plan-card").forEach(function (c) {
        var bhk = c.getAttribute("data-bhk");
        c.classList.toggle("is-hidden", f !== "all" && bhk !== f && bhk !== "all");
      });
    });
  });

  /* ---------- init ---------- */
  captureUtm();
  setupContacts();
  applyLockState();
  loadTracking();
  if (CFG.OTP_PROVIDER === "demo" && /localhost|127\.0\.0\.1|github\.io$/.test(location.hostname) === false) {
    // a gentle console reminder; the popup itself also says "Demo mode"
    try { console.warn("[Prima Altiora] OTP_PROVIDER is 'demo'. Set it to '2factor' or 'msg91' in assets/js/config.js before launch."); } catch (e) {}
  }
})();

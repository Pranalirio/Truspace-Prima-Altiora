/* ------------------------------------------------------------------
   Truspace Prima Altiora landing page – site settings
   Edit this file only. Everything the page needs to change lives here.
   ------------------------------------------------------------------ */
window.PA_CONFIG = {
  /* Sales contact shown on Call / WhatsApp buttons.
     PHONE: full number with country code, e.g. "+919876543210"
     WHATSAPP: digits only with country code, e.g. "919876543210"        */
  PHONE: "+919309707070",
  WHATSAPP: "919309707070",
  WHATSAPP_TEXT:
    "Hi, I'm interested in Truspace Prima Altiora, Wakad. Please share the price sheet and floor plans.",

  /* OTP provider
     "demo"    – no SMS is sent; the OTP is shown inside the popup. For testing only.
     "2factor" – SMS OTP via 2Factor.in, sent and checked by the Google Apps Script backend.
     "msg91"   – SMS OTP via the MSG91 OTP widget; lead saved by the Apps Script backend.   */
  OTP_PROVIDER: "demo",

  /* Google Apps Script Web App URL (see backend/google-apps-script/Code.gs).
     Required for "2factor". Optional but recommended for "msg91" and "demo"
     (that is where leads are saved to your Google Sheet).                    */
  APPS_SCRIPT_URL: "",

  /* MSG91 OTP widget – only used when OTP_PROVIDER is "msg91" */
  MSG91_WIDGET_ID: "",
  MSG91_TOKEN_AUTH: "",

  RESEND_SECONDS: 30,   // wait before "Resend OTP" becomes active
  UNLOCK_DAYS: 30,      // a verified visitor stays unlocked on that browser for this many days

  /* Tracking (leave blank to disable) */
  GA4_ID: "",                 // e.g. "G-XXXXXXXXXX"
  GOOGLE_ADS_SEND_TO: "",     // e.g. "AW-123456789/AbCdEfGhIj" – fired on verified lead
  META_PIXEL_ID: "",          // e.g. "123456789012345"

  /* Shown on the privacy policy page for data requests */
  CONTACT_EMAIL: "",          // e.g. "sales@your-domain.com"

  /* If you are a MahaRERA-registered agent / channel partner, MahaRERA expects your
     agent registration number on your adverts. Fill these and they appear in the footer. */
  AGENT_NAME: "Realty Inside Out Private Limited",             // e.g. "ABC Realty"
  AGENT_RERA: "A041262604396",             // e.g. "A51800000000"

  /* Location link from the brochure QR code */
  MAPS_LINK: "https://maps.app.goo.gl/EK8otE49KZLizn3W9"
};

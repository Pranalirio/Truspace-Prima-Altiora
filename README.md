# Truspace Prima Altiora – landing page

SEO landing page for **Truspace Prima Altiora, premium 2 & 3 BHK flats in Wakad, Pune** (MahaRERA No. PR1260002602057).
Operated by **Realty Inside Out Private Limited** (MahaRERA Agent Registration No. A041262604396).

- Static site: plain HTML, CSS and JavaScript. No build step, runs on GitHub Pages.
- Price sheet and floor plans open only after the visitor enters **name + mobile number and verifies an SMS OTP**.
- The **sales number is hidden** too: Call and WhatsApp buttons open the same OTP check, then show the number with *Call now* / *WhatsApp* buttons. These leads are saved with intent `Call request` / `WhatsApp request`.
- Every enquiry lands in a **Google Sheet** (with UTM / ad-click data), with an optional email alert to sales.

---

## What's in the repo

```
index.html                     Landing page (SEO meta, Open Graph, schema.org JSON-LD, FAQ)
privacy-policy.html            Privacy policy linked from every form
404.html                       Not-found page for GitHub Pages
robots.txt, sitemap.xml        Search engine files
set-domain.sh                  Replaces the placeholder domain in all SEO files
.nojekyll                      Tells GitHub Pages to serve files as-is
assets/css/style.css
assets/js/config.js            ← the only file you normally edit (phone, OTP provider, tracking)
assets/js/main.js              OTP gate, price table, floor-plan viewer, lead capture
assets/img/                    Renders, unit plans, location map, logo, icons (WebP)
assets/img/locked/             Blurred previews shown before verification
backend/google-apps-script/    Code.gs + appsscript.json – OTP + Google Sheet backend
```

---

## 1. Put it on GitHub Pages

1. Create a new repository on GitHub (public, or private on a paid plan).
2. **Add file → Upload files**, drag in everything **inside** this folder (not the folder itself, and not the zip). Commit.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. After a minute the site is live at `https://<username>.github.io/<repo>/`.

**Custom domain (recommended for SEO):** Settings → Pages → Custom domain → enter `www.yourdomain.com`, add the DNS record GitHub shows you (a `CNAME` to `<username>.github.io`), then tick **Enforce HTTPS**.

## 2. Set your live URL (important for SEO)

All canonical, Open Graph, schema, robots and sitemap URLs use the placeholder `https://your-domain.com`. Replace it with your real address:

```bash
./set-domain.sh https://www.yourdomain.com
# or, without a custom domain:
./set-domain.sh https://username.github.io/repo
```

No terminal? Use GitHub's web editor (press `.` on the repo page) → Search → replace `https://your-domain.com` across all files.

## 3. Edit `assets/js/config.js`

| Setting | What to put |
|---|---|
| `PHONE` | Sales number with country code, e.g. `+919876543210`. Never printed in the HTML; shown only after OTP |
| `WHATSAPP` | Digits only, e.g. `919876543210` |
| `OTP_PROVIDER` | `demo` (testing) → `2factor` or `msg91` before launch |
| `APPS_SCRIPT_URL` | Web App URL from step 4 |
| `MSG91_WIDGET_ID`, `MSG91_TOKEN_AUTH` | Only for `msg91` |
| `GA4_ID`, `GOOGLE_ADS_SEND_TO`, `META_PIXEL_ID` | Optional tracking. A verified OTP fires `generate_lead`, the Google Ads conversion and Meta `Lead` |
| `CONTACT_EMAIL` | Shown on the privacy policy |
| `AGENT_NAME`, `AGENT_RERA` | If you advertise as a channel partner, MahaRERA expects your agent registration number on ads. Fill these and it appears in the footer |

> **Demo mode** sends no SMS – the popup shows the OTP so you can test the flow. Don't launch ads in demo mode.

## 4. OTP + lead backend (Google Apps Script, free)

The OTP must be sent from a server so your SMS API key stays secret. A Google Apps Script Web App does that for free and writes leads to a Google Sheet.

1. Create a Google Sheet (e.g. "Prima Altiora Leads") → **Extensions → Apps Script**.
2. Delete the sample code, paste `backend/google-apps-script/Code.gs`, save.
3. **Project Settings** (gear icon): set **Time zone** to `(GMT+05:30) India Standard Time`. Under **Script properties** add:
   - `TWOFACTOR_API_KEY` – your 2Factor.in API key (for `2factor`)
   - `TWOFACTOR_TEMPLATE` – optional, your approved OTP template name in 2Factor
   - `MSG91_AUTHKEY` – for `msg91` (lets the server confirm the widget's token)
   - `NOTIFY_EMAIL` – optional, e.g. `sales@yourdomain.com,manager@yourdomain.com`
   - `DAILY_OTP_LIMIT` – optional, default `300` (stops bots draining SMS credits)
4. In the editor choose the function **`setup`** → **Run** → approve the permissions. A `Leads` tab appears.
5. **Deploy → New deployment →** type **Web app**, *Execute as:* **Me**, *Who has access:* **Anyone** → **Deploy**. Copy the URL ending in `/exec`.
6. Paste it into `APPS_SCRIPT_URL` in `config.js`, set `OTP_PROVIDER` to `2factor` (or `msg91`), commit.
7. Check: opening the `/exec` URL in a browser shows `{"ok":true,...}`.

When you change `Code.gs` later: **Deploy → Manage deployments → Edit → Version: New version → Deploy** (the URL stays the same).

### Option A – 2Factor.in (default)
Sign up at 2factor.in, add credit, copy your API key into `TWOFACTOR_API_KEY`. The backend calls 2Factor's `AUTOGEN` and `VERIFY` endpoints. Indian SMS needs DLT-approved sender/templates – use 2Factor's default OTP route or register your own template and put its name in `TWOFACTOR_TEMPLATE`.

### Option B – MSG91 OTP widget
In MSG91 create an **OTP Widget**, copy the **Widget ID** and **Token** into `config.js`, set `OTP_PROVIDER: "msg91"`. Put your MSG91 **Auth key** in the `MSG91_AUTHKEY` script property so the server confirms each verification before saving the lead. If MSG91 changes its token-check endpoint, update `verifyMsg91Token_()` in `Code.gs` (see *Server-side integration* in the MSG91 panel).

### What gets saved
Sheet columns: timestamp, name, mobile, intent (price / floor plans / site visit), status (`OTP sent` → `Verified`), provider, configuration, visit preference, UTM source/medium/campaign/term/content, gclid, fbclid, gbraid, wbraid, page, landing page, referrer, browser.
`OTP sent` rows that never verify are still useful call-backs.

Built-in protection: honeypot field, 25 s cooldown, max 3 OTPs per number per 15 min, 5 wrong attempts per OTP, daily SMS cap, formula-injection guard.

## 5. SEO – what's already done and what to do after launch

Done in the page:
- Title, meta description and keywords built around *Truspace Prima Altiora*, *TrueSpaces Prima Wakad*, *2/3 BHK in Wakad*, *premium flats in Wakad*, *new launch projects in Wakad Pune*, *2/3 BHK near Bhumkar Chowk*, *2/3 BHK in Hinjewadi*, *flats near Hinjewadi IT Park*, *price and floor plan*.
- One H1, keyword-led H2s, descriptive image file names and alt text, FAQ written for those searches (including the "TrueSpaces" spelling people use).
- JSON-LD: `ApartmentComplex` (with `alternateName` spellings, amenities, 2 BHK / 3 BHK carpet ranges), `Organization`, `WebPage`, `FAQPage`.
- Canonical, Open Graph / Twitter cards, image sitemap, robots.txt, WebP images, lazy loading, preloaded hero, mobile-first layout.
- Prices are **not** in the HTML or schema, so they don't show in Google results – they render only after OTP.

After launch:
1. Add the site to **Google Search Console**, submit `sitemap.xml`, request indexing of the home page.
2. Test the page in Google's **Rich Results Test** (FAQ + structured data).
3. Create / link a **Google Business Profile** for the site office.
4. Link to the page from the developer's site, social profiles and listing portals.

## Before you go live – checklist

- [ ] Domain replaced (`set-domain.sh`)
- [x] `PHONE` / `WHATSAPP` set (sales number)
- [ ] `CONTACT_EMAIL` filled
- [ ] Apps Script deployed, `APPS_SCRIPT_URL` set, `OTP_PROVIDER` is **not** `demo`
- [ ] Sent yourself a real OTP and saw the row turn `Verified` in the sheet
- [x] Operator (Realty Inside Out Private Limited) and agent MahaRERA No. A041262604396 shown in hero, footer, privacy policy and schema
- [ ] Developer has approved the renders, plans and prices for public use (the source brochure is marked "For internal use only")
- [ ] Privacy policy reviewed by your legal adviser

## Good to know

- The OTP gate is a **lead-capture gate**, not a vault. On a static site, prices live in `main.js`, the sales number in `config.js` and plan images are public files, so a technical visitor could find them. For strict protection, serve prices and plans from the Apps Script only after verification.
- A verified visitor stays unlocked on that browser for `UNLOCK_DAYS` (default 30).
- Prices shown are the Tower C cost sheet. Update the `UNITS` table at the top of `assets/js/main.js` when the price list changes.
- The `backend/` folder is published with the site but holds no secrets – keys live only in Script properties.

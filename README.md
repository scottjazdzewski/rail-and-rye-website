# V4.1 POLICY REVIEW PACKAGE — OCTOBER 28, 2026

**REVIEW BEFORE DEPLOYMENT.** This builds on the already-deployed V4 website. Only the three HTML legal-policy pages and this README have been changed from V4. No Worker backend, Stripe, Cloudflare, D1, R2, email, Access rules, branding, journal or storefront files changed.

- Site owner confirmed: Rail & Rye Racing is presently a **Georgia sole proprietorship** operating from **Paulding County**, and trade-name (DBA) registration is **pending, not yet filed**. This package does **not** assert the brand is an LLC or registered DBA.
- Site owner approved: five successful PDF downloads within 30 days per paid non-refunded order; replacement access links normally expire after 24 hours and never reset the limit. Confirmed these rules against the original V4 `src/commerce.js`.
- Changed refund policy to describe billing and access problems, refund/correction, and revocation of access after refunds.
- Changed terms to explain no sportsbook or bet handling, no outcome guarantees, personal-use license, customer access rules and help links.
- Changed privacy policy to accurately describe existing **active** Resend transactional emails, Stripe payment processing, Cloudflare infrastructure, available privacy requests and data retention descriptions. Removed outdated "Resend after V3 enabled" language.
- Removed pre-launch DRAFT banners and explicit "real-money payments are not enabled" statements **from the policy pages only**; the public store remains sandbox-labeled and backend checkout remains *test-only*.
- Seller legal-identity disclosure, merchant public contact information (Stripe may request phone/address), DBA filing, local business license, jurisdictional legal counsel review, applicable taxes and direct confirmation of Stripe's acceptance of the precise business model still need independent verification before **real sales**. These drafts are publication candidates, not an attorney's legal opinion.

**CRITICAL:** Pushing this ZIP to GitHub DOES NOT enable live payments. The V4 backend deliberately checks `cs_test_` and `livemode === false` and accepts only a configured ADMIN_EMAIL in the test email workflow. Switching live keys without a separately engineered and tested live release will break the checkout/webhook flow. Do not change Cloudflare secrets, toggle live payments or remove the store's TEST CHECKOUT ONLY notice as part of this V4.1 update.

**Deployment (after owner and appropriate legal review):** extract the contents of this ZIP, copy the six existing root items `README.md`, `test-v3.mjs`, `wrangler.jsonc`, `migrations/`, `public/`, `src/` into the local GitHub Desktop checkout of `rail-and-rye-website`, choose Replace/merge, inspect GitHub Desktop Changes (expected: three policy HTML files + README ONLY), then commit and push main. If more files appear changed, STOP and investigate. Verify Cloudflare Ready and each policy page. Do not rerun SQL migrations.

---

# RAIL & RYE — V3 AUTOMATIC EMAIL & PDF RECOVERY (SANDBOX)

Prepared October 28, 2026 from the **exact latest GitHub ZIP** uploaded by the owner (`rail-and-rye-website-main.zip`, commit `d0a98fba036d0ae72aee3365d8e77bdc489cbd7a`). This is a source-code update package, **not yet deployed**. Preserve the existing Cloudflare Worker `rail-and-rye-website`, existing D1/R2, Cloudflare Access and Stripe test settings. **Never put API secrets into GitHub or this ZIP.**

## What V3 changes

- Sends a branded purchase-confirmation and PDF-access email as **Rail & Rye Racing <orders@railandryeracing.com>** after a *verified paid Stripe sandbox webhook*. Resend API key is a Worker secret `RESEND_API_KEY` already reported installed. Sender domain was reported verified.
- Uses transactional D1 `email_jobs` outbox + provider idempotency keys; retries failures via Cloudflare cron every 10 minutes (maximum six attempts) and after the webhook via `waitUntil()`. Stripe webhook success does not depend on Resend availability.
- Email links are 256-bit HMAC signed, use an opaque job identifier (not a Stripe Checkout session ID), point to `/store/access.html`, are valid **24 hours after email was sent**, are not auto-downloaded on opening, and grant PDF access only while the purchased D1 order is paid and within the 30-day/five-download quota. Each authorized PDF remains private in R2. Refunds and disputes revoke all links, including recovery links.
- `/store/recover.html`: purchase email request form; same-origin POST `/api/recovery/request`, generic non-enumerating responses, per-email / per-IP throttling, new 24-hour emailed links for paid unexpired orders. The form never directly reveals purchase history.
- **SANDBOX SAFETY:** Outbound email is strictly allowed **only to the same address as `ADMIN_EMAIL`**; all other checkout emails are ignored for delivery (even if the Stripe test checkout succeeds). This makes it safe for limited sandbox tests, not a production commerce release.
- Preserves `/store/`, `/store/success.html`, `/admin`, `/api/admin/*`, `/api/stripe/webhook`, `products`, `orders`, R2 bindings, the old workers.dev address, and the existing custom domain. The old Stripe session success/download link still works (and is revoked on refund).
- No extra customer mailbox is required to **send** transactional email; replies to orders@ will not reliably reach anyone until inbound routing or mail hosting is separately set up.

## DEPLOY IN THIS ORDER — ONE EXISTING WEBSITE

**1. Cloudflare D1 migration FIRST.** Navigate to https://dash.cloudflare.com/ → Storage & databases → D1 → `rail-and-rye-store` → Console. Run the four statements in `migrations/002_email_delivery.sql` one at a time. This creates `email_jobs`, two indexes and `recovery_limits` without touching existing records. Confirm all succeed before uploading code, as the new webhook would otherwise fail when referencing the new table.

**2. GitHub upgrade.** Extract this ZIP and upload its contents into the ROOT of your existing repo https://github.com/scottjazdzewski/rail-and-rye-website (main branch). Do not upload the ZIP itself or create another Cloudflare application. Files updated are `src/commerce.js`, `src/index.js`, `public/store/index.html`, `public/store/success.html`, `README.md`, `wrangler.jsonc`; files added are `public/store/access.html`, `public/store/recover.html`, `migrations/002_email_delivery.sql`, `test-v3.mjs`. Unchanged homepage/admin/migration 001 must remain intact. Cloudflare should auto-deploy. The `wrangler.jsonc` retains `keep_vars: true` and the exact R2/D1 bindings and adds a cron `*/10 * * * *`.

**3. Cloudflare verify.** Confirm `rail-and-rye-website` latest deployment green; Worker variables still include `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `ADMIN_EMAIL`, `STRIPE_SECRET_KEY` (`sk_test_`), `STRIPE_WEBHOOK_SECRET` (`whsec_`), `RESEND_API_KEY` (`re_`). Do NOT screenshot any secret values. Do not enable `sk_live_`. Verify `/admin` on the custom domain still presents Cloudflare Access login in a private browsing session; verify `/api/admin/products` is not anonymously readable.

**4. SANDBOX purchase email test.** The older TEST – KEENELAND RACE CARD was archived; create/publish a harmless new $1 test product with a sample PDF. Visit https://railandryeracing.com/store/ and use a Stripe sandbox test card (`4242 4242 4242 4242`, future expiry). Crucially, enter **the exact same email currently set as `ADMIN_EMAIL` in the Worker** to allow test sending. Confirm Stripe sandbox checkout success, a branded Resend email arriving, and the email's ACCESS YOUR PDF button downloading the test PDF. If no email arrives, inspect Resend Emails and D1:

```sql
SELECT id,purpose,state,attempts,sent_at,last_error FROM email_jobs ORDER BY created_at DESC LIMIT 10;
```

Wait for Cloudflare's scheduled retries if a provider call is temporarily unavailable; if an email failed six attempts, the job needs manual review. Do not expose customer email addresses or signed links in public logs or support tickets.

**5. Recovery + refunds.** After downloading, open https://railandryeracing.com/store/recover.html and enter the checkout email. Confirm a new access link arrives. Requests are limited to one per email every 15 minutes and six per IP every 15 minutes; the page intentionally gives the same acknowledgment for unknown emails. Then refund the test payment in Stripe Sandbox and check:

```sql
SELECT product_title,status,revoked_at FROM orders ORDER BY created_at DESC LIMIT 5;
```

Verify original emailed link and recovered emailed link both reject PDF access (HTTP 403). A previously downloaded PDF cannot be recalled.

## Important limits BEFORE LIVE LAUNCH

- **NOT a live storefront**: V3 is strictly test-only with existing Stripe `sk_test_` guard and admin-only mail restriction. Other customers will NOT receive emails until a separately reviewed production release deliberately enables broader recipients and Stripe live mode.
- Existing Stripe customer payment receipts are separate from Rail & Rye's PDF delivery emails. Sandbox mode may not generate real Stripe customer receipts.
- This version does not provide inbound `orders@` or `support@` mailbox handling. If replies are desired, configure Cloudflare Email Routing + a branded reply solution separately.
- Confirm Stripe account and category eligibility for horse-racing research/analysis; complete taxes, terms, privacy, refunds, chargeback and account compliance. Do not accept real purchases until approved.
- Service monitors should alert on failed webhook deliveries, stale queued emails, exhausted retries and bounced messages before launch.
- Access emails use a one-day bearer link, which can be forwarded; keep it private. Refunds, the five-download/30-day limit and the HTTP no-store/no-referrer headers reduce exposure.
- Existing Stripe Checkout session success link remains a bearer download credential, valid under the original five-download/30-day policy. Future live release should address account-based access and long-term support.
- Existing admin Access application must cover BOTH workers.dev and custom domain `/admin*` and `/api/admin*`; owner confirmed this previously.

## Local validation

`node --no-warnings test-v3.mjs` (Node 22+) uses an in-memory SQLite DB with migration 001 + 002 and a mocked Stripe/Resend network. Tests: published product checkout, Stripe signature, duplicate webhook idempotency, branded outgoing email, authenticated email link, wrong-origin/tampered links, email-recovery throttling, refunded order revocation. **Passing local mocks are NOT a substitute for a real Stripe sandbox + Resend delivery test.**

---

## Previous V2 checkout instructions / notes

# RAIL & RYE WEBSITE — STRIPE SANDBOX CHECKOUT V2

Created October 28, 2026. **TEST ONLY: no real charges.** This is an upgrade for the EXISTING `rail-and-rye-website` Cloudflare Worker; it is not another website or Stripe store. Original public homepage layout is retained, original admin access/production bindings are preserved. It does not activate live Stripe payments.

## Features delivered

- `/store/`: new refined Rail & Rye product list, querying only **published products with an attached PDF**; no product setup required in Stripe.
- Stripe Checkout Sessions for single PDF purchases, created server-side from the product's current D1 price. Test-mode secret only (`sk_test_...` enforced).
- `/api/stripe/webhook`: signature-verified Stripe webhook, raw body preservation, five-minute timestamp window, reject live events, durable D1 event log and order fulfillment. Handles paid checkout, delayed-payment events, failed checkout, full refunds, disputes.
- `/store/success.html`: test payment status and download button, only after signed webhook has recorded the payment.
- `/api/orders/:session_id/download`: private R2 file streamed **after D1 paid-entitlement check**. No public R2 bucket or file URLs. Five download attempts during 30 days after payment, blocked on refunds/disputes.
- Existing `/admin` dashboard and `src/index.js` preserved, plus updated admin copy/link to test store.
- `keep_vars: true` in Wrangler prevents later deploys from removing `ADMIN_EMAIL`, `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` set through Cloudflare Dashboard.

## IMPORTANT LIMITS / DON'T LAUNCH YET

- The first test must use a **harmless sample PDF** and a **draft test product**; do not publish genuine premium PDFs while building.
- Only a sandbox Checkout session is supported. There is NO live Stripe key path and real customers cannot pay using this build.
- The confirmation URL with the unpredictable `cs_test_...` session ID acts as the purchaser's temporary access link. It must be kept private. **Receipt email and download recovery are not built yet**. Add these before production (with email provider and proof of ownership).
- Tax compliance, sales tax settings, policies/refunds/terms, chargeback operations, monitoring, reconciliation of missing webhooks, and Stripe account approval are not complete. User sells research/analysis, not bets, entry fees or prizes, but Stripe must confirm account eligibility for this category.
- Changes to a published product's PDF will NOT change the existing order snapshot: a buyer receives the version purchased. The V2 uploader retains old R2 PDF objects when replacing a file; schedule safe cleanup of files not referenced by any active orders before production to avoid storage growth.
- The published product list is intentionally accessible via `/store/` but NOT linked from the public homepage, so the test interface isn't promoted.
- Stronger session ownership or email-based delivery is required before real customers. Download requests may be cached by external browsers only if misconfigured; response headers here explicitly deny caching.

## ONE-TIME DEPLOYMENT — DO IN THIS ORDER

### 1. Cloudflare D1: add orders + Stripe event tables

Go to https://dash.cloudflare.com/ → Storage & databases → D1 → **rail-and-rye-store** → Console. Run the SQL in `migrations/001_stripe_orders.sql`. You can run each statement one at a time; verify success. This is additive and does not alter the existing `products` table.

### 2. Upload V2 to the same GitHub repo

Target: https://github.com/scottjazdzewski/rail-and-rye-website on `main`.
Upload package contents, NOT the ZIP. Folders `src`, `public`, `migrations`, and `wrangler.jsonc`/`README.md` must be at the repository ROOT. This adds `src/commerce.js`, `public/store/index.html`, `public/store/success.html`, and the SQL migration. It also updates existing `src/index.js`, `public/admin/index.html`, `wrangler.jsonc`. Existing homepage `public/index.html` is preserved. Do not create another Cloudflare app.

Verify successful Cloudflare deployment of `rail-and-rye-website`, website homepage still public and `/admin` still requires Cloudflare Access. Both `CARDS_BUCKET` and `STORE_DB` production bindings must remain present. Worker-first routing already covers `/api/*`; `/store/` is served as static assets.

### 3. Stripe TEST secret (never paste secrets into chat or GitHub)

In the Stripe sandbox/test Dashboard https://dashboard.stripe.com/test/apikeys find **Secret key** beginning `sk_test_...`. In Cloudflare → Workers & Pages → rail-and-rye-website → Settings → Runtime variables and secrets → Add variable, add **Secret** named `STRIPE_SECRET_KEY`, set it to the Stripe **test** secret. Keep Production selected for the Worker; Production Cloudflare is running *sandbox Stripe only*. Never use `sk_live_...` here. `STRIPE_SECRET_KEY` must be secret type, not plaintext.

### 4. Stripe TEST webhook

In Stripe sandbox open https://dashboard.stripe.com/test/webhooks (may be under Workbench → Webhooks or Developers → Webhooks). Add a destination/end-point for exact URL:
`https://rail-and-rye-website.scottjazdzewski.workers.dev/api/stripe/webhook`
Listen to the events:
`checkout.session.completed`
`checkout.session.async_payment_succeeded`
`checkout.session.async_payment_failed`
`charge.refunded`
`charge.dispute.created`

Set event payload type to **snapshot** events (standard full object), not thin events. Retrieve the specific endpoint's **signing secret** `whsec_...`. In Cloudflare Worker settings add **Secret** `STRIPE_WEBHOOK_SECRET` = the dashboard endpoint's signing secret. The Stripe CLI's `whsec_` and Dashboard endpoint `whsec_` are different; choose the correct one. Do not publish this secret anywhere. Test the webhook endpoint with Stripe's delivery tester.

### 5. End-to-end sandbox test

From the protected dashboard https://rail-and-rye-website.scottjazdzewski.workers.dev/admin, create or use a harmless **TEST** product at **$1.00** with a small harmless PDF, then Publish (do not use real paid cards). Open https://rail-and-rye-website.scottjazdzewski.workers.dev/store/, check the test product displays and has test-purchase button. Purchase using a Stripe published test card number (e.g. test `4242 4242 4242 4242`, future expiry, any CVC; use only on Stripe sandbox). On successful redirection, wait for verified webhook; the download button should appear. Download PDF once. Without payment, `/api/orders/.../download` should return 403; after refund, should return 403. Confirm R2 remains private. Test the root homepage public in Incognito and `/admin` blocked without sign-in.

## Database schema

See `migrations/001_stripe_orders.sql`. It adds `orders` and `stripe_events`, plus an index on payment intent. Existing `products` table and R2 objects unchanged.

## Risk / next production tasks

1. Get clear Stripe eligibility/merchant account approval for paid racing analytics before live payments.
2. Add transaction emails + durable recovery; do not rely exclusively on the session URL in live use.
3. Add safe cleanup/retention for replaced PDFs, retaining all objects referenced by active orders.
4. Add public privacy/refund/terms policies; sales tax and appropriate Stripe tax settings.
5. Reconciliation jobs for missed webhook events, payout/chargeback reporting, fraud controls and testing.
6. Only after all signoffs deliberately create a separate production-mode release with `sk_live_` support; do not enable live accidentally.

---

# V4 COMPACT RESPONSIVE BRAND WEBSITE — DEPLOYMENT HANDOFF

**Status:** Prepared, NOT deployed. Built from the V3 email & recovery source and the user's exact approved TBS Rail & Rye brand kit. This upgrade is ONE deployment to the existing Cloudflare Worker/GitHub repo; do not deploy the obsolete V3 ZIP separately after V4.

## What was added or changed

- `public/index.html`: compact, accessible homepage. Actual official R&R horseshoe logo and traditional saddle chips 1–8 (clearly labelled as illustrative program colors, NOT today's entries or handicapping results). All homepage CTAs lead directly to a working route. Product availability text comes from `/api/products` instead of invented inventory.
- `public/assets/site.css`: one responsive site theme. Single domain and site; screen widths <=560px get a dense phone layout and touch-friendly action buttons, 561–780px tablet navigation adapts, and larger desktop widths show side-by-side Race Cards and Journal. Core palette exactly navy `#072B67`, gold `#BE7C04`, ivory `#FEFDF6` per TBS locked authority. Supporting accessible variations may be used for readability.
- `public/assets/brand/chip_1.png` ... `chip_20.png`: exact approved static customer chip PNG bytes copied without modification. All twenty matched SHA-256 in the source brand authority manifest.
- `public/assets/brand/rail_rye_official_horseshoe_logo.png`: exact official master bytes, unchanged. `rail_rye_logo_header.png` and `public/favicon.png` are cropped-to-visible-content/rescaled display derivatives of the original artwork for tiny browser contexts; the original master is retained unmodified.
- `public/store/index.html`: a fully functional reskin of existing V3 test storefront, using the same API endpoints and Stripe `POST /api/checkout`. Category filter reads `?category=` and filters only published real items returned by the existing `/api/products` endpoint; it does not invent products. Includes no real-money checkout and clear sandbox banner. Script escaped by text DOM methods, not injected HTML.
- `public/journal/index.html`: dedicated Journal destination (not invented articles; explicitly states none published yet). Future articles require owner-supplied content and publishing process.
- `public/policies/refunds.html`, `terms.html`, `privacy.html`: visible clearly labelled **pre-launch draft** policies (not final legal advice, real-money payments remain disabled). Review and approve details with applicable laws/business operations before accepting real payments.
- All existing V3 backend, D1/R2 bindings, Cloudflare Access protections, Resend sandbox-only email restrictions, Stripe sandbox-only webhook/checkout, recovery and admin remain intact. `migrations/001_*` and `002_*` are unchanged and user confirmed already executed; DO NOT rerun the migrations unless necessary.

## Why it isn't live yet

The available connected GitHub account cannot access private repository `scottjazdzewski/rail-and-rye-website` (repo search returned no results, contents API returned 404), and no Cloudflare deployment connector is available. No authorized direct production deployment action could be taken. **Do not claim live until owner updates GitHub main and Cloudflare deployment passes.**

## Next one-time deployment

1. From a laptop, open the latest V4 ZIP in Google Drive, download and extract it.
2. Go to **existing** repository `https://github.com/scottjazdzewski/rail-and-rye-website` (do not create a new repo). In GitHub's file uploader, upload the **contents** of the extracted V4 ZIP into the repository root, preserving `public/`, `src/`, `migrations/` directory paths. Commit to main. This single deployment supersedes the previous V3 ZIP.
3. In Cloudflare Workers, confirm new green deployment. Test `/` (desktop/mobile), `/store/`, category filters, `/journal/`, `/policies/`, `/admin` Access login, `/api/products` and Stripe test checkout. `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and Access variables remain Cloudflare secrets, not committed files.
4. Complete V3 end-to-end test purchase using **ADMIN_EMAIL** in Stripe sandbox, confirm receipt, recovery and refund revocation. Never put real payment keys in sandbox. Stripe under review; no live payments yet.

## Published safety disclaimers

Do not assume these designs are legal/business approval, transaction integration proof or photo licensing. Website currently uses no racing photos. Seller's real identity, legal jurisdiction, consent/retention, and effective policy text must be reviewed before real-money production. Client tests based on actual old V2/V3 code and mock test path are useful but not end-to-end live deployment evidence.

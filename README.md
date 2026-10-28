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

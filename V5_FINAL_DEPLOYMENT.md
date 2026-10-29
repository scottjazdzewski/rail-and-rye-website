# RAIL & RYE — V5 FINAL DEPLOYMENT & ACTIVATION CHECKLIST

**Owner workflow: one action at a time with screenshots.** This is a release package, not an invitation to flip live payments immediately. V4.1 continues working until you push this code. Keep all existing Cloudflare test secrets and Access rules. Stripe has reportedly confirmed that the specific paid racing-publication business is acceptable; retain that written reply for records. Paulding County DBA and local license filings remain separate administrative items.

## Phase A — One-time database migration **BEFORE** uploading V5

1. In Cloudflare Dashboard > Workers & Pages > D1 > database `rail-and-rye-store`, take a backup/snapshot if available. Cloudflare D1 Time Travel provides a recovery option; for a full export, official CLI `npx wrangler d1 export rail-and-rye-store --remote --output=./rail-and-rye-pre-v5.sql` (only from an authenticated environment; do not publish this export — it contains orders/buyer emails).
2. Open the database's SQL Console and paste **ONLY** the contents of `migrations/003_live_readiness.sql`:

```sql
CREATE TABLE IF NOT EXISTS payment_revocations (
  payment_intent TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK(reason IN ('refund','dispute')),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

3. Verify a successful execution and query `SELECT name FROM sqlite_master WHERE type='table' AND name='payment_revocations';` to confirm one row. This change is additive and safe while V4.1 is still live. **Do not upload V5 first**, because V5 webhook completion queries require this table.

## Phase B — Deploy code with live checkout OFF

4. Extract the provided ZIP. Inside are `migrations`, `public`, `src`, `README.md`, `V5_FINAL_DEPLOYMENT.md`, `test-v3.mjs`, `test-v5.mjs`, and (unchanged) `wrangler.jsonc`.
5. Open GitHub Desktop repo `rail-and-rye-website` on `main`; Fetch origin / Pull if needed; Show in Explorer. Copy the **contents** of the extracted ZIP into the existing repository folder, replacing files; keep `public/`, `src/`, `migrations/` folders. Preview Changes, commit with `Rail & Rye V5 Commerce Engine`, Push origin.
6. In Cloudflare Worker `rail-and-rye-website`, check newest Deployment **Ready** and 100% serving. Confirm store `/api/products` has `checkout_mode: "test"` and `checkout_ready: true`, with old test credentials intact. Check fresh incognito `/admin` still requires Cloudflare Access sign-in. Test one Stripe sandbox purchase using only your existing authorized ADMIN_EMAIL, email link, recovery, and full test refund revocation. Archive the test product again. **No real charges so far.**

## Phase C — Configure separate live payment infrastructure (do not activate yet)

7. In Stripe Dashboard **LIVE** mode, obtain a live secret API key for this Stripe account (begins `sk_live_`; never screenshot or paste it into chat). Add to Cloudflare Worker settings **as a Secret** named `STRIPE_LIVE_SECRET_KEY`. Do **not** replace the existing `STRIPE_SECRET_KEY` (test).
8. In Stripe Dashboard **LIVE** mode, create a webhook destination for `https://railandryeracing.com/api/stripe/live-webhook` (separate from the existing **TEST** webhook endpoint `/api/stripe/webhook`). Subscribe to these five events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, and `charge.dispute.created`. Save its signing secret (begins `whsec_`) as Cloudflare **Secret** `STRIPE_LIVE_WEBHOOK_SECRET`. Leave the existing `STRIPE_WEBHOOK_SECRET` (test) unchanged. Be sure the new webhook is active / events are delivered in **LIVE** mode.
9. Generate a strong cryptographically random 32-byte value (64 hexadecimal characters), store it **privately** as Cloudflare Worker **Secret** `RR_DELIVERY_SIGNING_KEY`. Use a trusted password manager or local system cryptographic generator. Never share its value. Leave the other Resend, R2, D1, Access, and mail settings as they are. Keep both `RR_PAYMENT_MODE` and `RR_LIVE_ACTIVATION` unset at this point (default test).
10. After verification of all settings, place Worker variable `RR_PAYMENT_MODE` = `live` while activation is still unset: storefront enters **PAUSED** mode and refuses purchases until the final activation variable is added. Confirm this is what the store shows; recovery of previously purchased PDFs still works. `GET /api/products` should show `checkout_mode: "paused"` and `checkout_ready: false`.

## Phase D — Deliberate activation and real-world validation

11. Only after Stripe's specific business-model clearance, local administrative requirements, site policies, test-mode regression checks, live webhook setup and secrets are complete, add Worker variable `RR_LIVE_ACTIVATION` = `CONFIRM_LIVE_SALES`. **THIS ENABLES REAL CREDIT-CARD CHARGES.** `GET /api/products` should now show `checkout_mode: "live"` and `checkout_ready: true`. On the store the banner becomes “Secure checkout via Stripe”; published products become purchasable by the public.
12. Publish one legitimate low-priced internal launch-check publication temporarily and make a real, small purchase with your own card/email. This is an **actual charge**, not a Stripe test card. Verify live Stripe payment, order status, customer-branded Resend purchase email, PDF download, 24-hour link renewal, and full refund plus link revocation. Real fees/refund accounting may apply. Archive the launch-check publication. Monitor Cloudflare logs and Stripe webhook event deliveries.
13. Only after the full paid test passes and the actual catalog is ready should you publish commercial editions and announce the store.

## Safe pause, troubleshooting and rollback

- To stop **new** sales immediately, keep `RR_PAYMENT_MODE=live` and remove/unset `RR_LIVE_ACTIVATION`, or set `RR_PAYMENT_MODE=paused`. The storefront should say “Purchases temporarily unavailable.” Webhooks, existing live order emails, and prior purchase recovery continue to work.
- A `503 Checkout unavailable` when live is active indicates at least one required secret/binding is missing or invalid. Check the private Worker variables and that the live signing key is 32+ characters; do not troubleshoot by pasting values into chat.
- If purchase payment is marked paid in Stripe but no email arrives, check Stripe's LIVE webhook delivery log for `/api/stripe/live-webhook`, Cloudflare Worker logs, Resend logs, and D1 `orders` / `email_jobs` with care not to expose buyer PII. Stripe retries failed webhook deliveries, but this release does NOT run an independent Stripe payment reconciliation job; unresolved paid purchases may require manual support handling.
- The `payment_revocations` table is intentionally permanent and should remain after rollback; it is safe to leave in D1. **Do not revert code all the way to V4.1 once real live orders have occurred**: V4.1 does not support live customer recovery and live webhook fulfillment. Pause V5 instead. Keep private backups of the previous production code.
- Existing `support@railandryeracing.com` must remain monitored. Never make an unverified claim about refunds or tax compliance; business and policy requirements remain owner responsibilities.

## QA receipt

Local checks cover D1 schema compatibility on SQLite, synthetic Stripe webhook HMAC validation, live/test isolation, email idempotency and recipient rules, signed links/legacy link continuity, download limits/expiry, purchase recovery when sales paused, refund/dispute revocation, and static asset preservation. Only Stripe, Cloudflare and Resend **live end-to-end** operations can certify the complete production rollout.

# RAIL & RYE RACING — V5 LIVE CHECKOUT RELEASE

**Release package:** Rail & Rye V5.0 Commerce — sandbox-safe deployment with separately controlled live activation. 2026-10-28.

This release upgrades the deployed V4.1 website's commerce engine and preserves its visual design. It is **fully engineered and locally regression-tested**, but **NOT DEPLOYED**. Live sales cannot start merely by copying the ZIP: the owner must apply a one-time additive D1 migration, install the website update, configure private Stripe LIVE secrets, register the separate LIVE webhook in Stripe, and explicitly activate sales. Until then the tested storefront remains in sandbox mode. No secrets, buyer data, or private PDF downloads are bundled.

**READ FIRST:** `V5_FINAL_DEPLOYMENT.md` — the one-time migration, no-surprises GitHub Desktop steps, separate test/live Stripe configuration, activation and rollback procedure.

## Stable existing features preserved

- Cloudflare Worker connected to D1 `STORE_DB`, R2 private `CARDS_BUCKET`, Access-protected `/admin` and `/api/admin/*`, and scheduled email retry.
- Stripe **TEST** checkout, signed webhooks, Resend admin-only sandbox receipts, buyer PDF link, recovery, refund revocation.
- Homepage / responsive CSS / official logo and original chips 1–20, Journal, and V4.1 Terms, Refund and Privacy policy pages **byte-for-byte identical** to V4.1.

## V5 features

- Stripe LIVE checkout Sessions supported only with the exact two-step activation; incomplete live setup *pauses* sales instead of falling back to sandbox.
- Separate `STRIPE_LIVE_SECRET_KEY`, `STRIPE_LIVE_WEBHOOK_SECRET`, and `/api/stripe/live-webhook`; original test endpoint and secrets stay unchanged.
- Signed live event validates Stripe signature, timeliness, event mode, paid status, USD exact order amount, stored order ID + session ID, before delivery; idempotent outbox and refund/dispute revocations.
- Email to actual verified live Checkout buyer; existing sandbox purchase emails remain restricted to ADMIN_EMAIL.
- Separate randomly-generated `RR_DELIVERY_SIGNING_KEY` for signing new 24-hour download links; legacy V4/V4.1 links remain valid for their original remaining 24h.
- Five lifetime PDF downloads per purchase within 30 days; secure recovery works even when new live sales are temporarily paused; full refunds and disputes revoke access.
- `GET /api/products` shows `checkout_mode` test/live/paused and `checkout_ready` to render the right store notice. Access-protected admin status displays the same operational mode and readiness boolean.
- One safe schema addition `migrations/003_live_readiness.sql` for out-of-order refund/dispute prevention. Older database tables and existing orders are never deleted or reset.

## Tests

Run with Node 22+ (includes built-in experimental `node:sqlite`):

    node test-v3.mjs
    node test-v5.mjs

Both suites passed locally with a true in-memory SQLite schema, simulated Stripe API and HMAC-signed webhooks, simulated Resend sending, simulated R2 PDF, and no real charges. Tests include duplicate events, wrong-mode signatures, sending to the right live/test recipient, five-download limit, 24-hour expiry, old signing key link migration, recoverability when sales are paused, refunds, and refund-before-purchase ordering. **Remote Stripe/Cloudflare live integration remains to be configured and tested by the owner.**

## Do not change

Do not paste API keys into GitHub, email, screenshots or public pages. Do not delete the old test webhook or replace its secret with the live one. Do not alter Cloudflare Access admin security. Do not run old 001/002 migrations again; those were already applied.

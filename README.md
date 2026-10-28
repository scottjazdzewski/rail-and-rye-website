# RAIL & RYE WEBSITE — ADMIN DASHBOARD v1

Prepared 2026-10-28. This package upgrades the **existing** Rail & Rye Cloudflare Worker. It preserves the original `public/index.html` homepage and the existing R2 / D1 binding names.

## What is built

- `/admin` — polished owner-only publishing interface for Race Cards, Longshot Radar, Stable Notes and Target List.
- Create, edit, save drafts, publish and archive product records in the existing D1 `products` table.
- Upload and replace private PDF files (max 75 MB) in `CARDS_BUCKET` using a streaming upload.
- Upload JPG, PNG, WebP cover images (max 6 MB). Draft images stay private; published covers are served by `/media/cover/:id`.
- Server-side Cloudflare Access JWT validation (RS256 signature, issuer, audience, expiry and owner email); fails closed if not configured.
- CSRF protection via strict same-origin checks on write requests.
- Existing `/api/health` retained and expanded with a database-binding presence indicator.
- **NOT included yet:** Stripe checkout, paid customer PDF downloads, order and entitlements tables, product storefront pages, email delivery. `published` only changes product status in D1; it cannot initiate sales yet.

## Files

- `public/index.html` — existing homepage retained unchanged from the previously provided starter package.
- `public/admin/index.html` — new owner dashboard UI.
- `src/index.js` — replacement Worker backend.
- `wrangler.jsonc` — retains existing bindings, adds Worker-first routing on `/admin*`, `/api/*`, and `/media/*`.

## DO NOT deploy admin unsecured

The Worker will *refuse* requests to `/admin` and `/api/admin/*` until all three vars below are set. That fail-closed behavior is intentional. Do not weaken it or put credentials in GitHub. Your public homepage continues to work.

### 1. Deploy code into the EXISTING private GitHub repo

Target: https://github.com/scottjazdzewski/rail-and-rye-website (branch: `main`).

Copy the *contents* of this package to the repository root: `public/`, `src/`, `wrangler.jsonc`, and `README.md`. GitHub should show the new `public/admin/index.html` and the updated `src/index.js`. Upload extracted files, NOT the zip archive. Do not create a new Cloudflare application. Cloudflare will build with the existing `npx wrangler deploy` command.

Because the connected GitHub app did not expose this private repository to this ChatGPT session, the package was prepared as a downloadable ZIP rather than pushed to the repository directly.

### 2. Set up the Cloudflare Access sign-in app

In Cloudflare dashboard open **Zero Trust → Access → Applications → Add an application → Self-hosted**. Protect the following paths using one self-hosted Access application so both receive the same application AUD:

- Hostname `rail-and-rye-website.scottjazdzewski.workers.dev`, path `/admin*`.
- Same hostname, path `/api/admin*`.

Configure an **Allow** policy for your specific owner email (do NOT grant Everyone). Use an email one-time PIN or another identity provider. Confirm that an unauthenticated browser is blocked. Cloudflare dashboard form labels may vary; follow current docs: https://developers.cloudflare.com/workers/configuration/cloudflare-access/

Cloudflare Access may normalize paths differently depending on its UI; ensure `/admin`, `/admin/`, `/admin/index.html`, and the `/api/admin` routes are protected, and prevent a bypass through the other public hostname when the custom domain is added. The Worker independently verifies token and email as defense in depth.

### 3. Set Worker runtime variables

In Cloudflare **Workers & Pages → rail-and-rye-website → Settings → Variables and secrets**, add:

- `ACCESS_TEAM_DOMAIN` = your Cloudflare Zero Trust team hostname, like `your-team.cloudflareaccess.com` (no example value should be used as a real setting)
- `ACCESS_AUD` = the **Application Audience (AUD) Tag** copied from your Access application, NOT the app name
- `ADMIN_EMAIL` = the precise email allowed by your Access policy

You do not need to share these with ChatGPT. They belong in Cloudflare runtime settings, not GitHub. `ACCESS_AUD` is not a Stripe secret, and no Stripe keys should be configured until checkout is built.

### 4. Test admin securely

- Visit `https://rail-and-rye-website.scottjazdzewski.workers.dev/admin` using your browser.
- Sign in through Cloudflare Access. Verify only the intended owner can access it.
- Create a **draft** using a sample title and `price=0.00` (test item only).
- Upload a small TEST PDF; confirm that D1 has the `pdf_key` for the record and R2 contains `cards/<id>/<uuid>.pdf`.
- Upload a cover and edit the draft; archive or keep it as a test item. Do NOT sell anything yet.
- Confirm a signed-out/incognito browser cannot fetch `/api/admin/products`, cannot open `/admin/index.html`, and cannot fetch private PDF objects directly.

### 5. Next work

Build public catalog and product detail pages; connect Stripe Checkout **only after merchant eligibility approval**; verify Stripe signed webhooks and durable orders in D1; gate private PDF downloads by paid entitlements. Add email delivery and a complete test purchase before accepting payment.

## Current D1 table expected

The production database already contains a `products` table, created earlier using:

```sql
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  race_date TEXT,
  track TEXT,
  description TEXT DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  pdf_key TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

No extra D1 SQL is required for this admin v1. Never expose private files through a public R2 URL.

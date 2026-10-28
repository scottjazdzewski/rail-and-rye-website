# Rail & Rye — website starter

This repository contains a **preview homepage only**. It does not collect payments or sell products yet.

## Deploy on Cloudflare Workers

1. Upload the `public/` directory and `wrangler.jsonc` to the root of your GitHub repository. Keep the folder names and locations unchanged.
2. In Cloudflare, go to **Workers & Pages → Create application → Connect GitHub**.
3. Choose this repository (`rail-and-rye-website`) and the `main` branch.
4. Give the Worker the name `rail-and-rye-website` to match `wrangler.jsonc`.
5. Leave Build command blank (no build step is needed); use the default deploy command `npx wrangler deploy`.
6. Click **Save and Deploy**. You will receive a `workers.dev` preview address.

## Editing

The first page is `public/index.html`. It includes temporary color choices and a text wordmark until the official logo/brand artwork is supplied. No customer payment integration exists yet.

## Next development stages

- Connect approved Stripe Checkout with secure payment-verification webhooks.
- Store PDFs privately in Cloudflare R2, not inside the public assets directory.
- Build a protected admin upload dashboard with product catalog and prices.
- Issue expiring download links only after server-side purchase verification.
- Test checkout, access permissions, order emails, and refunds before launch.

# Page six — Racing Intelligence Hub

The public storefront is `/store/`. Preserve the approved page-six hero, shared header and footer, saddlecloth 6, heritage serif and sans tokens, and existing approved product imagery. Four product panels and the Universal Access bar replace the old publication inventory. The Journal remains separate. The internal private review hub remains protected.

Availability comes exclusively from `/api/products` (published, tab-data-ready, unexpired catalog products) and current entitlement from `/api/product-tabs/library`. Checkout uses only the existing server-issued product IDs and `/api/checkout`. The Universal Access button requires a published bundle covering all four categories for the selected racing date. Never invent a price, create a checkout SKU client-side, or mark private data as published. Membership remains a distinct existing product.

## Customer navigation and desktop layout

The Intelligence Hub is the customer entry point; no separate My Tabs pill. Keep /my-products/ as the protected product reader and existing links functional. Successful purchase activation returns customers to /store/. Product cards open the selected reader category/date. Desktop uses a compact two-by-two horizontal-art grid near the top; retain the mobile presentation. Do not hardcode product availability or alter entitlements.

## Shared product purchase controls

Race Cards, Pick Tickets, Longshot Radar and Target List retain their individual landing pages and approved artwork. All four pages and the Hub share rr-commerce-hub.js and the live catalog/entitlement/checkout logic, with no active legacy PDF checkout script on these pages. The public header uses Intelligence Hub rather than a redundant Race Cards pill. Hub product cards use the approved dark navy, ivory and gold palette.

## Direct purchased-product readers

The Hub Open action navigates directly to `/intelligence/{race-cards|pick-tickets|longshot-radar|target-list}/?date=YYYY-MM-DD`. The Worker serves the approved existing reader shell with customer navigation and a customer-mode marker; paid data is fetched only through the existing category/date entitlement API. Private publisher routes remain protected. The legacy `/my-products/` route redirects to a matching direct reader or the Hub. F4 ordered data also requires the published Race Cards entitlement and matching track/race. Do not send paying customers to a duplicate selection page. Missing certified values must remain unavailable rather than fabricated.

## Track entitlement lock

Authorize each purchased SKU by ID, category, race date and exact track. Bundles unlock only their recorded order components. Blank tracks are day-wide only for daily research. Filter server data before sending it to the customer; F4 uses the same authorized edition. Retain up to 24 signed order tokens for additional purchases. The Hub distinguishes partial and full access, and includes track-bundle purchase choices.

## Lifetime owner access

The configured Cloudflare ADMIN_EMAIL receives non-expiring, complimentary all-product access through the existing verified membership magic-link session. No synthetic Stripe subscription or hardcoded email. Every request revalidates the configured owner email and normal session expiration. Billing controls are hidden for owner accounts without a paid subscription; existing real subscriptions remain manageable. The owner uses the customer-facing Intelligence Hub. Product publication and retention rules remain in force.

### Owner single sign-on

An existing, cryptographically verified Cloudflare Access administrator session automatically establishes the normal customer membership session when an admin page is opened. The owner can also select Owner sign in on the Membership page, which navigates to the protected /admin/owner-access/ route and returns to /store/. The Worker must verify JWT signature, issuer, audience, expiry and exact configured ADMIN_EMAIL before issuing the HttpOnly customer cookie. Email entry alone must never grant access. Regular members retain their existing verified email flow. No payment or entitlement rules are altered.

### Desktop storefront priority

Page six places Universal Access immediately under the left-hand overview on desktop, alongside the compact right-hand 2×2 product grid. Product artwork is constrained to its card rather than determining card height. Preserve the original mobile order, approved art, navy/gold palette, shared header/footer and all commerce behavior. Never use a fixed viewport height or overflow clipping that can hide checkout controls.

Recover Access is centered inside the race-date/access-status overview as a secondary gold text link, not a standalone purchase-style pill. Preserve the recovery destination and all authorization behavior.

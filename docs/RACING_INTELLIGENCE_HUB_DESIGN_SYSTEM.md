# RAIL & RYE — RACING INTELLIGENCE HUB
**Cross-product design and integration contract · 2026-11-23**

## One company, one account, four products
The customer should experience **one Rail & Rye Racing Intelligence Hub**, with four entitled modules:
1. **Projections** — full-field TRI V4.1 / F4 V2 race intelligence.
2. **Pick Tickets** — approved horizontal multi-race sequences/tickets.
3. **Longshot Radar** — proprietary ranked/curated value candidates.
4. **Target List** — compact editorial / research lists.

This is ONE application shell with four product views, NOT four independent sites, standalone PDFs, separate subscriptions, or competing visual identities. Product content/layout may differ, but primary shell, typography, menus, state labels, mobile behavior and permissions must be shared.

## Canonical website and routes
- Public site/repository: `scottjazdzewski/rail-and-rye-website`, Cloudflare deployment and existing private R2.
- **Proposed** hub landing route: `/racing-intelligence/` with four navigation modules. Module paths under `/racing-intelligence/projections/`, `pick-tickets/`, `longshot-radar/`, `target-list/` are **targets, not deployed pages yet**.
- Existing current production preview: `/admin/projections-preview/`. Existing private member-dashboard route: `/membership/dashboard/`. Preserve them until the shared hub migration is built and tested. Do not break current purchases, account navigation, or legacy links.
- Four cards/tabs in hub landing; show each product's entitlement state (Available / Locked / Purchase). User sees only content they have purchased; locked products may have a clearly labeled overview/upgrade pathway without leaking paid data.
- Shared header, Rail & Rye logo, brand pill/navigation, member identity/sign-in status, consistent back-to-hub affordance; shared footer. Do not rebuild global header or footer in each module.

## Design tokens and production appearance
- Core palette: dark navy `#102d53` / `#123567`; ivory `#f4f0e6`; white `#fff`; restrained antique gold `#c99831`; subdued text `#637483`.
- Data colors: **green `#18835a`**, neutral **gray `#88929d`**, **red `#b54842`**. These are data states, not product identity colors.
- Keep the current brand aesthetic but use **app-like density**: no ornamental gradients, oversized iconography, overly tall card wrappers, paper-like page reproductions, or fake dashboard charts.
- Typography: one crisp sans-serif (Inter / Arial / system-ui) for headings, names, tabs, body, connections and controls. **Tinos Bold** only for authoritative large win percentages, fair-odds numerics and related approved race-card statistical displays as appropriate. Avoid Georgia for titles and other decorative serif faces.
- Preserve actual approved saddlecloth PNGs for horse identities where needed; no recreated saddlecloths, no fake badges, no AI imagery used as data.
- Projections factor readout: **five labeled columns SPEED / FORM / CLASS / PACE / SURF-DIST**, each with **three small flat dashes**, colored by the exact approved evaluator state. Do not use the big illustrated five-factor PNGs on the dashboard; they remain in printed/card-art assets.
- Product-specific statuses are NOT interchangeable. Pick Tickets uses **green PLAY / gray CONDITIONAL / red PASS**; Projections factor dashes use **green favorable / gray neutral / red concern**. Longshot Radar and Target List should use the same palette only for explicitly defined meanings, not invent a universal score.
- Icons sparingly, consistent stroke weight, clear labels, sufficient tap targets and contrast. Focus on readable data.

## Canonical chip system + single-race exotic builder
The single source of truth for **horse saddle chips**, authentic saddlecloth-backed **race chips**, compact editorial track marks, and the exacta/trifecta **Bet Builder** component is [RAIL_RYE_CHIP_SYSTEM_AND_BET_BUILDER.md](RAIL_RYE_CHIP_SYSTEM_AND_BET_BUILDER.md).

- Horse selections everywhere use `/assets/approved/saddlecloths/{1..20}.png` and preserve legitimate coupled-entry suffixes; no recreated chip colors.
- Race navigation tabs and the header race-number marker use the **exact approved saddlecloth image corresponding to the race number** (#1–20), preserving color/number art. Only the selected tab adds an outside gold ring; remove the stacked RACE caption and thick fake CSS chip borders.
- Keep the approved Rail & Rye horseshoe and track name/date visible, and **restore the existing authentic track-logo artwork** from `/assets/approved/track-logos/*.webp` (where available). Show it uncropped on an ivory background with white-tile blending; do not use the interim invented `FL`/`MV`/`PRX` racing monograms. Where no approved logo exists, show the full track name and Rail & Rye horseshoe rather than inventing one.
- The Bet Builder is part of Projections, not a separate product or purchase. Its model-only exacta/trifecta UI never displays made-up probability/payoff values. Exact F4 joint probabilities require a verified server-side production receipt and private, entitlement-checked delivery.
- The user consults any actual tote prices independently; Rail & Rye does not connect to tote services or accept wagers.

## Stakes naming and graded trophy display — locked
- Use a **balanced, full-width title row** for long stakes titles. Runner count/purse and post time have their own space on phones rather than competing with a two-line race name. Example: source `Hollywood Gaming Mahoning Distaff S.` → **Mahoning Distaff Stakes** (known sponsor omitted, Stakes written out). Do not strip unfamiliar proper names.
- The authentic race saddlecloth in a dark navy header sits on an **ivory backing** matching the navigation tab so transparent image pixels do not change number or cloth colors.

- **Regression safeguard for real Nov 23 Mahoning Valley Race 5:** source title `FIRST LADY S.` must display **First Lady Stakes** even if the standalone title utility fails to load. Any abbreviated terminal `S.` for a verified stakes race is never a finished customer-facing name.


- Always display the **full canonical stakes race name**. Example: **Belmont S. → Belmont Stakes**, **Frizette Stks. → Frizette Stakes**, and **Carter H. → Carter Handicap** when the source confirms it is a stakes race. Never leave bare abbreviation `S.` as the stakes suffix.
- Remove separate sponsor language such as `Presented by …`, `Sponsored by …`, `Powered by …`, and named sponsor prefixes/suffixes where a separately supplied sponsor field makes removal unambiguous. Do **not** guess or delete words that may be part of an actual named race.
- Prefer independently supplied source-certified `stakes_name` for the clean official name, then `race_name`, then legacy `conditions`. Keep original event attributes and TRI/F4 model data unchanged. Future publication uploads may additionally supply `stakes_grade`, `sponsor_name`, and `is_stakes`; these are presentation metadata only.
- Graded stakes show the existing racing **trophy**, distinguished as **G1 gold**, **G2 silver**, and **G3 bronze**, only when actual source grade metadata or an explicit grade suffix supports it. Do not infer grade from a purse amount, race reputation, or a missing label. Ungraded stakes do not receive a trophy.
- Render full title in readable editorial case without forced all-caps CSS; let names wrap naturally on mobile without hiding purse, race number, time or runner count. Share the identical naming and trophy treatment across Projections, Pick Tickets, Longshot Radar and Target List.
- The canonical client utility is `/assets/rr-race-titles.js`. Its behavior is regression-tested with sponsor, legacy abbreviation, nongraded and G1/G2/G3 examples. A conflict between explicit grade and source title's grade **must not** silently display the wrong trophy.
- **Locked in production on all three race readers:** Projections uses `rr-race-titles.js`; Longshot Radar (`public/assets/longshot-radar.js`) and Target List (`public/assets/target-list-dashboard.js`) both call the same utility to render full sponsor-free names in their navy race-facts header. Target List also uses it in the detail drawer; do not print raw `conditions` where the public/customer-facing full race title belongs.
- **Shared visual treatment:** Longshot Radar and Target List load `/assets/rr-stakes-inline.css`. Show the G1 gold, G2 silver, and G3 bronze trophy only when sourced exact race-grade metadata or a printed grade in the official race name supports it. Ungraded stakes have no trophy.
- **Source-only certification:** Radar may enrich a PDF-reference horse only by an exact private R2 match of track, race, saddlecloth and horse name; it carries `stakes_name`, `race_name`, `stakes_grade`, `sponsor_name` and `is_stakes` only from that matched race. Target List's private publisher may carry the same validated presentation metadata, but must never infer grades from favorites, odds, prices or purses.
- **Immutable production check:** `test-longshot-radar.mjs`, `tests/longshot-radar-browser.mjs`, `test-target-list-hub.mjs` and `test-rr-race-titles.mjs` verify canonical title and grade provenance. Dedicated live production workflow compares deployed canonical helper, Radar and Target JS, and trophy CSS to source-controlled bytes. No customer access is enabled by this naming change.


## Mobile-first layout rules
- Build for narrow phone first (320, 375, 390, 430px), then 768px/tablet, then desktop. Responsive layouts must avoid horizontal page overflow (only the race-tab strip may scroll horizontally).
- Compact Projections runner rows target **about 114–135px** for ordinary names on a normal phone: first line actual saddlecloth, horse/ML, probability/fair odds; trainer | jockey directly beneath horse; the five-factor dashed strip beneath; tap anywhere to open details, with NO repeated Analysis buttons. Long names wrap; never truncate critical horse name or model %.
- Tap a runner/card to open a consistent bottom drawer/detail panel on mobile. Never require a PDF or separate download to learn the data; same drawer style and dismiss behavior across modules.
- Race navigation: **By Track** displays the selected track's race tabs in actual post-time order (NOT numerical race order); **All Tracks · Post Time** offers a single chronological selectable timeline across every accessible track/race on that date, with previous/next controls. Always use published source ET times; place missing times last and never invent them.
- Keep the exact approved Rail & Rye horseshoe header graphic visible next to the track name. Size with object-fit:contain; do not replace/crop/recolor it. If actual source-certified track-specific artwork is integrated later, it must come from approved production assets rather than a synthetic substitute.
- **Fair odds must always display in conventional US tote-style fractions**, e.g., FAIR 3-2, FAIR 5-2, FAIR 6-1, FAIR 18-1, never research net-decimal strings such as 1.52/1 or 6.36/1. Derive the display from exact signed TRI PWIN when available; never round PWIN or overwrite its source net fair odds for scoring, ranking, price screens, recordkeeping or analytics.
- The entire horse row is tappable to open the same verified detail drawer. Remove repetitive "Analysis" button/link text on every runner. Maintain a keyboard-accessible named horse-details button.
- Compact row height follows content (~114–135px for ordinary rows on phone), expanding naturally for long names or connections. Five factor dashes remain source-authentic, with enough type contrast to read labels.
- Track header/date, race title/purse/time/runner count and pace/surface/distance should be tight.
- Pick Tickets, Longshot Radar and Target List should use **equivalently compact panels**, not force a projection-specific row template or extra graphs.
- Do not crowd dark backgrounds or dark overlays onto editorial hero art. Keep users out of needless scrolling before the first meaningful data.

## Data and fidelity contract
- The last source-verified race projections remain the authoritative results until superseded by a properly verified scratch revision. Preserve all production status and revision evidence in private source metadata, **never render internal edition-stage labels** on any customer-facing page.
- The TRI engine and approved five-factor evaluator are frozen authority. Do not re-score, infer indicators, round/rebase individual PWIN or F4, invent handicapping ratings, horse IDs, race titles, purses, status, or times.
- Pick Tickets display verified sequence legs, denominations, ALL numbers on each authorized ticket, and a best-possible ticket even on PASS, if production has supplied it. Never change the separately frozen product rules in the website renderer.
- Longshot Radar and Target List likewise consume their respective certified production outputs and preserve native methodologies. No placeholder customer-facing data, synthetic results or silent fallback.
- Display race date, track, race, post time and a neutral last-updated timestamp when trustworthy. Internal publication states, edition labels, revision numbers, scoring-review notes and scratch-processing terminology are production metadata only; never show them as customer-facing status banners.
- Private product content resides behind server-enforced auth/entitlement checks in Cloudflare Worker and private R2; **never** store actual paid data in public HTML, GitHub sources, JS bundles or open JSON endpoints. Never implement access control only by hiding tabs client-side.


### Permanent customer-copy lock — applies to all four products and future publications
- Projections, Pick Tickets, Longshot Radar, and Target List must never render `INITIAL`, `PRESCRATCH`, `PRE-SCRATCH`, `INITIAL · CURRENT`, `SCRATCH UPDATED · CURRENT`, `MODEL REVIEW`, `TEST WINDOW`, `PRIVATE PREVIEW`, `CERTIFIED SOURCE TICKET`, or similar production/review-stage labels. This includes headers, race cards, tooltips, dialogs, fallback/loading/empty states and revisions.
- Do not add customer-side JSON/file upload controls, test data toggles, production-source gates or revision receipts to those four pages. The user publishes through the existing backend and Publication Desk workflow, not by manually uploading JSON to product pages.
- Preserve underlying `projection_status`, `status`, `revision`, `factor_basis`, scratch arrays, provenance, receipt checks, R2 storage, and security gating exactly as source metadata. The presentation cleanup **must not** imply that stale selections are updated, alter TRI/F4 probabilities, or bypass a source verification gate.
- Display official scratches as genuine racing information and allow clear, user-relevant uncertainty disclosures when appropriate, without revealing internal production terminology. A plain race-date or neutral `Updated` timestamp is acceptable.
- Before each production push, run `node test-racing-intelligence-customer-copy.mjs`; the CI gate covers all four HTML pages and renderers. New product windows must follow this shared lock. Changes to the lock require an explicit design-policy decision.

## Commerce and Publication Desk integration
- Reuse the existing Rail & Rye sign-in, Stripe commerce, membership/bundle/product entitlements and recovery flow. Do not create four payment systems or duplicate customer accounts.
- One customer entitlement map determines which hub modules and individual products they can open; memberships and purchased singles/bundles must resolve under the same rules. Admin preview access remains separate from customer access.
- Publication Desk should offer **one publish interface** that routes to product type: projections / pick_tickets / longshot_radar / target_list. Upload/replace/update/revoke/scratch revision without PDF requirements; use versioned, checksum-verified structured output in R2, with simple publish controls.
- Product publication can use different structured schemas, but share stable metadata: `product_type`, `date`, `track` or scope, `revision`, `status`, `published_at`, `model/production_receipt`, access/entitlement key. Only add fields as legitimately supplied; no invented values.
- UI components should be reusable: hub shell/nav, product tile, tab strip, status chip, date/track selector, card/row, drawer, source/updated metadata, empty/loading/error state and accessibility conventions.

## Release/engineering instructions for parallel production windows
1. Read this file and inspect current deployed Projections DOM/CSS and existing website auth/commerce routes first. Do not copy a screenshot into a wholly separate design system.
2. Implement modules in the SAME website repository. Coordinate file ownership/branches/PRs to avoid overwriting concurrent dashboard work. Prefer module-scoped files plus shared hub components; do not edit Projections CSS/JS while its own window owns them unless coordinated.
3. Do NOT publish publicly or enable `PROJECTIONS_MEMBER_LAUNCH` (or future product launch flags) without explicit customer-launch instruction. Admin/private previews are okay under correct access controls.
4. Run CI, validate 320/375/390/430px and desktop; explicitly inspect for clipping, full field coverage, percent/font consistency, data integrity, exact current status and product-only access. Do not claim "pushed" just because a PR merged: confirm Cloudflare Workers deployment.
5. This contract establishes shared UI/product infrastructure, NOT any new scoring, ticket construction or marketing entitlement assumptions.

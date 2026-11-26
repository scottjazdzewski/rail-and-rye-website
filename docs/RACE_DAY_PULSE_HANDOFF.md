# RAIL & RYE — RACE-DAY PULSE — ENGINEERING HANDOFF
Date: 2026-11-26
Status: DEVELOPMENT BRANCH ONLY. NOT LIVE. NO AUTOMATED X POSTS.
Owner: Rail & Rye Racing
Repository: https://github.com/scottjazdzewski/rail-and-rye-website
Feature branch: feature/race-day-pulse-v1
Draft PR: https://github.com/scottjazdzewski/rail-and-rye-website/pull/245 — NOT MERGED, NOT DEPLOYED.
Parent engineering: docs/WEBSITE_RACECARD_PRODUCTION_LOCK_V1.md, docs/TRI_DASHBOARD_AUTO_SYNC.md, docs/HOMEPAGE_PRODUCTION_LOCK.md.

## USER-APPROVED PRODUCT DECISIONS
Race-Day Pulse is a FREE, automatically refreshed homepage scroller with real, approved saddlecloth images, factual scratch-driven intelligence, and selected actual horse identities and PWIN changes. No generic teasers or forced six items. Show up to six only if supported. Final scroller card calls visitors to Intelligence Hub. Each alert has a shareable page link, native mobile Share, X web intent (NOT X API), Copy Link and Save Image. Screenshot sharing is a key use. No added subscriptions, social bot, Equibase scraping, or AI prose. The user continues to provide official scratches exactly as in current workflow; nothing new to manually enter.

The Underneath File is a separate possible paid product based on existing frozen F4; not part of this feature. Return to the Rail, historical report, and bots are deferred.

## IMPLEMENTATION ALREADY COMMITTED IN THE FEATURE BRANCH
src/race-day-pulse.js — Worker-side date-scoped public feed derivation. Input: immutable private prescratch snapshot and verified scratch-final dashboard. Output: at most six derived teaser objects; never raw matrix, full field, all probabilities, source receipt or engine. Types: NEW_FAVORITE, WIN_SHIFT (>=4 PWIN points), F4_SHIFT (>=7 second+third probability points). Each source-backed sentence names track, race, scratch programs, relevant horse and actual before/after values. It intentionally does NOT infer a pace cause from a scratch alone. Builds individual /pulse/YYYY-MM-DD/track-race-N pages with dynamic SEO/OG summaries and link to Hub.

src/projections.js — nonblocking captureInitialPulseSnapshot() inserted in both direct single and batch uploads. Captures prescratch baseline BEFORE a verified scratch-final edition replaces it. Does not tamper with proprietary scorer, F4, scratch integrity or existing product publication. Prescratch snapshots can also be captured upon initial Worker upload. Private R2 path: race-day-pulse/prescratch/YYYY-MM-DD/track-slug.json. First writer wins. The approved direct prescratch R2 publisher, scripts/tri_dashboard_sync.py, NOW preserves the same private immutable baseline. Existing direct scratch-final scripts use uppercase SCRATCH_FINAL metadata; src/race-day-pulse.js handles both variants. Confirm future alternate direct publishers retain certified ancestry and immutable base behavior.

src/index.js — public GET /api/race-day-pulse and /pulse/YYYY-MM-DD/slug routes. Existing admin/customer/commerce routing untouched otherwise.

public/index.html — ONE additive, initially hidden Pulse section between the approved hero and primary product tiles; an independent stylesheet and deferred script, no hero/photo/product tile rebuild.
public/assets/race-day-pulse.css — namespaced navy/gold responsive horizontal snap scroller and standalone share page.
public/assets/race-day-pulse.js — every-minute feed refresh, automatic progression, manual arrows/swipe, pause on interaction, accessible alerts, genuine saddlecloths 1–20, fallback for coupled/lettered programs, Share/Copy/X Web Intent/Save PNG. Local canvas image generation, no paid API.
test-homepage-lock.mjs — validates the full ORIGINAL pre-Pulse homepage Git blob after removing precisely the three additive Pulse entries. Existing owner-approved baseline hash unchanged until visual signoff.
test-race-day-pulse.mjs — source integrity, metadata release, prescratch immutability, no public receipt leak, 3 AM ET gating, routes and screenshot controls.
.github/workflows/verify-homepage-lock.yml — new Pulse tests added to existing GitHub CI job.

## SOURCE AND RELEASE SAFETY
* Frozen private TRI/F4 run remains entirely OUTSIDE the website/GitHub repository; Cloudflare only serves verified output. Website makes NO scoring changes.
* No public insights without BOTH prescratch snapshot and complete scratch-final certification: projection_status=scratch_final; factor_basis=verified_scratch_final; model_receipts with four valid SHA256 tokens.
* Publication metadata must be customer_publish_approved=true or stage=scratch_final; future release_at blocks public display.
* New race-day results cannot display before 3:00 AM America/New_York; feeds are scoped to the active ET race date. At most six distinct race insights, ordered by source-derived importance.
* No invented cause-and-effect pace explanations. A future pace impact story requires separately authenticated source and rule, not just a changed PWIN.
* On missing original or new source, corrupt race/field, unverified metadata, or failed QA: no Pulse post. It MUST NOT block core Race Card posting.
* Scratches must be supplied by user or an authorized existing source, never scrape Equibase.
* Sharing is manual and free. X Web Intent is a user click, not automated posting; no API key, cost, or social media posting bot.

## IMPORTANT OPEN QA / FUTURE WORK
1. Verified CI checkpoint: the additive homepage lock passes; test-race-day-pulse.mjs passes (certified feed, no leak, cutoff, immutable base, direct-R2 stage); the website racecard production lock passes; the Python direct-R2 model receipt tests pass after snapshot fixture update. Broader CI still fails in unrelated preexisting tests (for example formatToteOdds in dashboard mobile regression). Diagnose independently; DO NOT suppress or mask those failures. No live merge yet.
2. Confirm future alternate R2 publishers use the now-implemented snapshot path and complete source/lineage proof, without modifying the scorer. The original F4 receipt vs scratch parent receipt is checked when available; missing/suspect inputs suppress Pulse. Never restore snapshot from a later final card.
3. Complete a full synthetic end-to-end Worker test verifying a real certified prescratch+scratch_final R2 path and authorized release, plus no leakage before release. Verify actual screenshot on desktop and mobile using Cloudflare preview (not live).
4. Preview original approved homepage and inserted banner side-by-side. Owner must visually approve before merging, updating visual baseline, or deploying. Preserve gold/navy branding, existing artwork and placement.
5. QA critical behaviors: coupled 1A/2B chip treatment, single/multiple scratches, no scratch, favorite swap, unchanged favorite, F4 movement, unusual race identifiers, cancelled races/abandoned events, timezones/DST, no items, one item, six items, all times, share URL, safe image download on iPhone, accessibility and reduced motion.
6. Improve per-race paid deep linking if the current Intelligence reader supports exact track/race parameters; initial CTA uses date-scoped /store/ reliably.
7. Verify post time/expired-race handling and whether Pulse should hide completed races. Avoid using post time as factual off timing if race delayed. Document acceptance criteria.
8. Add lightweight click attribution via existing first-party analytics only after user approves; do not buy a new marketing service.
9. User-approved visual release required. This is not permission to push unfinished feature to public site.
10. After successful launch, keep authoritative handoff and tests updated with exact deployed SHA, readback receipt and Rollback path.

## NEW-WINDOW INSTRUCTION
Continue from feature/race-day-pulse-v1. READ THIS FILE, inspect the latest PR/code/check results, repair remaining defects, test and get visual approval. Do not brainstorm from scratch or infer that staging means live. Do not ask user to upload new JSON, Equibase PDFs or API secrets. Do not run private TRI/F4 code in Cloudflare. Keep main untouched pending visual review.

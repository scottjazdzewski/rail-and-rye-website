# Pick Tickets — private Racing Intelligence Hub module (review branch)
The shared authority remains [RACING_INTELLIGENCE_HUB_DESIGN_SYSTEM.md](./RACING_INTELLIGENCE_HUB_DESIGN_SYSTEM.md).
This module reads **source-certified** horizontal Pick Tickets; it does not score races or create tickets.

## Branch scope / launch safety
- Private URL after branch deployment: /admin/pick-tickets-preview/ (Cloudflare Access verified by the existing site Worker). **Do not enable customer/public access.**
- Admin-only JSON endpoint: GET/POST /api/admin/pick-tickets; existing signed Cloudflare Access identity and same-origin validation apply.
- There is NO new customer login, checkout, product gate, public JSON endpoint, scheduled uploader, or standalone paid portal.
- Source remains private R2 under pick-tickets/dashboard/YYYY-MM-DD/{track}.json; immutable revisions under pick-tickets/revisions/.
- The *shared* /racing-intelligence/ route, product-level purchases/bundles/member permissions, central Publication Desk, launch switch, and any PDF-retirement migration belong to the hub/commerce integration work. Do not turn this preview into a disconnected store.
- No real picks, test accounts or customer data are committed to GitHub.

## Version 1 input schema
Admin can load one object, an array of objects, or { "cards": [objects] } for up to 25 tracks at a time (3MB max).
The **production system** must provide each field. The renderer never picks runners, computes probability, infers source status, or determines PLAY/CONDITIONAL/PASS.
- schema_version: 1; product_type: pick_tickets
- date: real YYYY-MM-DD; track: published racecourse name
- revision: source-issued monotonically increasing integer
- status: initial_current | scratch_updated. Initial is labeled "INITIAL · CURRENT" until receipt-verified scratches supersede it.
- scratch_verified_at: ISO timestamp required for scratch_updated
- source_receipt: { reference, sha256 }. Both must refer to the authentic external production receipt. **The site validates their format but cannot cryptographically prove the external scorer ran**; that evidence must be checked by the trusted production exporter.
- sequences: complete source-selected array of names, race ranges, recommendation state and tickets

Each sequence:
- name (official name), start_race, end_race, play_status: PLAY | CONDITIONAL | PASS
- hit_rate_display: source-provided display percentage if available; blank when not certified
- recommendation: source-provided narrative if available (never authored by the website)
- tickets: one or more certified source tickets; each may be LEAN, FULL_COVERAGE, or BEST_POSSIBLE; no duplicated role
- PASS **must** include a BEST_POSSIBLE source ticket; it remains labeled PASS, never recategorized
- All legs must be consecutive; all selected program numbers must be explicit, including every runner in an ALL leg; no abstract "ALL", ranges, or invented numbers

Each ticket:
- role: LEAN | FULL_COVERAGE | BEST_POSSIBLE
- title: official source tier label; notes: source remarks if present
- unit_cents: wager denomination in integer cents
- combinations: source-provided whole number; total_cents: source-provided exact total
- legs: [{ race_number, programs: ["1", "1A", "12"] }, ...]
- The server audits multiplication of each leg's selections and verifies unit_cents × combinations = total_cents. **It never reduces a ticket or applies arbitrary combo/spend caps.**
- Only straight horizontal ticket grids are represented in v1; if an approved construction has multiple distinct lines, extend the versioned schema and its receipt/QA coverage rather than flattening it inaccurately.

## Example for validator tests ONLY — NEVER a customer selection
The source below is synthetic and deliberately not shipped as a UI fixture.
{
  "schema_version": 1,
  "product_type": "pick_tickets",
  "date": "2026-11-23",
  "track": "Synthetic QA Track",
  "revision": 1,
  "status": "initial_current",
  "source_receipt": {"reference": "SYNTHETIC-TEST-ONLY", "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
  "sequences": [{
    "name": "Synthetic Pick 3",
    "start_race": 1, "end_race": 3, "play_status": "PASS",
    "hit_rate_display": "12.345%",
    "recommendation": "Test only",
    "tickets": [{
      "role": "BEST_POSSIBLE", "title": "Synthetic example",
      "unit_cents": 50, "combinations": 2, "total_cents": 100,
      "legs": [
        {"race_number": 1, "programs": ["1","1A"]},
        {"race_number": 2, "programs": ["3"]},
        {"race_number": 3, "programs": ["10"]}
      ]
    }]
  }]
}

## QA / review gates
- node --check src/pick-tickets.js
- node --check public/assets/pick-tickets-dashboard.js
- node test-pick-tickets.mjs
- Run existing commerce/membership tests on the PR because src/index.js has a minimal protected admin dispatch addition.
- For **visual** acceptance, branch-deploy privately and inspect 320, 375, 390, 430, 768 and desktop widths with actual source-certified editions, including 1A, chips 11–20, long track/sequence labels, multiple tickets, 6-leg sequences, PASS cards, and modal focus/scroll. CI syntax checks are not visual acceptance.
- Validate no page overflow, no cut-off numbers, no fixed ticket caps and no leaked paid JSON before any launch. Actual R2 writes and customer permission mapping require environment-level checks and owner approval.

## 2026-11-23: Grouped Pick wager / race-range private review
The administrator preview now presents **track and date → wager type (Pick 3/4/5/6 when present) → source-provided sequence tabs (for example Races 1–3, 4–6, 7–9) → full ticket selection with approved saddlecloth art**, plus a separate Full Ticket Analysis bottom drawer. No wager type is shown without available sequences. The website uses existing Rail & Rye logos and approved PNG saddlecloths; it does not select runners.

The private admin-only `GET /api/admin/pick-tickets?demo=1` response contains **five-track, clearly labeled, fictional display data**. Its projected hit rate is intentionally absent. Demo fixtures are generated at request time, never written to R2 or supplied to customers, and the POST endpoint rejects their marker and receipt. In the private preview the source selector lets administrators switch between mocked layout data and real, receipt-gated private R2 editions (if present). **This is not a customer launch or a replacement for production rules.**

Before enabling a paid customer view, remove demo controls from the customer shell, verify certified ticket outputs and entitlements, then approve the module separately. The admin preview remains protected by the existing signed Cloudflare Access verification.


## Branded reviewer and ticket builder — 2026-11-23

The private module now uses a sticky Rail & Rye identity and original track marks cropped from the user-supplied PDF for Finger Lakes, Mahoning Valley, Mountaineer, Parx Racing and Zia Park. Official Rail & Rye saddlecloth PNGs 1–20 are unchanged. Typography and spacing overrides are scoped to Pick Tickets; other product modules remain untouched.

**Rail & Rye Ticket** displays immutable source-provided ticket selections, the approved PLAY/CONDITIONAL/PASS badge, combinations, wager denomination, total cost, and a prominent **per-ticket projected hit chance only if the trusted producer provides it**. The mock fixture deliberately provides no hit rate.

**Build My Ticket** starts with a copy of that source ticket. Clicking a selected runner removes it; selecting Add runners on an individual race reveals other eligible runner chips. Each change recalculates combinations as the Cartesian product of leg selections and total cost as combinations multiplied by the verified base wager. The original recommendation and private R2 data are never modified. Reset restores the source ticket. Comparisons show model chance only when the custom selection exactly matches a source-certified ticket with its own verified hit rate. Arbitrary custom tickets remain without a hit estimate until the approved multi-race outcome engine supplies it. We do not multiply individual PWIN percentages or invent a likelihood.

**Value estimates** remain unavailable until independently verified payoff/pool data and model calibration are integrated. The builder never places wagers.

**Backward-compatible optional schema inputs:**
- ticket.hit_rate_display, a validated source-certified percentage string between 0 and 100 inclusive.
- sequence.race_fields, an ordered set of race_number/programs objects for every sequence leg. The private validator checks order, formatting, duplicate programs, and that every submitted ticket selection belongs to that certified field.
- If race_fields is absent, the builder can expose only runners from the supplied ticket variants, never invented full-field options.

Mock selections and extra runner choices are exclusively administrator-visible. The production upload blocks the mock fixture marker, and customer launch remains disabled.

Before customer access: verify authenticated entitlements, match the shared Hub shell across all four products, acquire and calibrate the trusted custom-ticket probability API, and authorize payout/value sources separately.

## 2026-11-23 — User authority update: no payouts or pool-size estimates in Pick Tickets

Supersedes the earlier speculative "value estimate" idea. **Payout information is excluded entirely from the website's Pick Tickets module and customer comparison screens**: no expected payouts, estimated pools, projected ROI/EV, break-even payout hurdle, or profitability declarations. The absence of verifiable pool and combination-price evidence cannot be filled with morning-line prices, purse totals, or invented payout assumptions.

The ticket screen retains only approved source selections, status, full-precision TRI-derived **certified ticket hit chance when available**, exact combination count, official denomination, and exact cost. The custom builder shows the same four values plus **Cost Change** compared with Rail & Rye's ticket. For arbitrary custom selections, hit probability stays unshown until the trusted model has provided a certified ticket-specific estimate. Marginal cost is arithmetic, not a payout or value forecast.

The administrator preview now defaults **only to certified private R2 editions** and no longer exposes a mock source selector or mock-serving API endpoint; source/QA-only synthetic fixtures remain in automated tests and are rejected from private R2. If no certified real tickets are staged, the page communicates that fact instead of showing hypothetical selections.

PLAY/CONDITIONAL/PASS remains a recommendation classification, **not a promise of positive expected return**. Without validated payout evidence, do not call a ticket profitable or imply an overlay. This change does not bypass TRI source gates or authorize commercial launch.

## November 23, 2026 verified real-source intake (admin preview only)

The user-provided `1123 TIMEFORM.zip` was reopened from the original conversation and its five member PDFs confirmed: FL, MVR, MNR, PRX, ZIA. Archive SHA-256 is stored in `src/pick-tickets-intake.js`. The separately produced `TRI_1123_PRESCRATCH_367_RUNNERS.csv` was reopened as source and its **45 race-level full-precision PWIN sums** checked to approximately 100%. The dataset contains 367 runner rows: FL 8 races/60, MVR 10/92, MNR 8/77, PRX 9/65, ZIA 10/73.

**Important:** A 100% PWIN mass sum is a numerical completeness check and DOES NOT certify the model's exact current-field inputs, scratches, authenticated trainer/jockey evidence, or the scoring receipt. The separate nine-page `RAIL_RYE_1123_ALL_5_TRACKS_PICK_TICKETS_EFFICIENCY_REVIEW.pdf` contains conflicting overlaid ticket figures and explicit `TRI HIT ESTIMATE: RE-SCORE PENDING` notices; it is NOT an approved source for publication.

The protected `GET /api/admin/pick-tickets` includes a non-proprietary source intake summary (date, track names, race/runner counts, archive hash, missing source gates) alongside the private R2 certified ticket list. It includes no paid PWINs, selections, or ticket probabilities. When no certified tickets exist, the mobile UI now presents the actual date/track selectors, official track marks, and a visible **TICKETS ON HOLD** source card instead of a blank dashboard or fabricated plays. Certified R2 tickets take precedence automatically if properly staged later.

This does not create, claim to optimize, or publish any new ticket. No R2 writes occur from the intake ledger. No PUBLIC/customer hub, checkout, login or production engine is modified. Owner review and validated certified per-sequence tickets are still required before real tickets can be posted.

## November 23 release: source-driven interim tickets in the existing admin preview

The website constructs **real model-based prescratch tickets** automatically on authenticated private page loads using exact TRI win-probability distributions **already staged in the private Projections R2 source**. The code does not copy TRI paid records into GitHub, a public JS bundle, or a public JSON URL. The read route stays under the existing signed Cloudflare Access admin gate.

**Input gate:** race_date 2026-11-23, exact one of the five expected tracks, every actual race present (8 FL, 10 MVR, 8 MNR, 9 PRX, 10 ZIA), full active program number list, `projection_status=prescratch`, zero scratch claims, every entry has finite full-precision exact PWIN and a corroborating F4 first-place result, no duplicate runners, and each race totals 100% within 0.000001. This is an operational data gate, not a full source-/trainer-/jockey-receipt certification claim.

**Wager menu:** 42 distinct win-based horizontal sequences transcribed from the user-supplied 1123 Timeform PDFs and cross-checked where the minimum was not legibly stated (e.g. Parx $1 Pick 3 and Mahoning Buckeye $0.20 Pick 6). FL 7, MVR 12, MNR 5, PRX 12, ZIA 6. Wager-specific minimums are preserved; no vertical or place-probability bets.

**Interim construction method:** one recommended ticket per sequence. Per race, sort every active runner descending by exact PWIN and use the prefix maximizing **selected PWIN mass / sqrt(selected runner count)**. This gives an explicit probability-vs-ticket-complexity tradeoff rather than a forced 8/16/32 size or fixed dollar budget. Alternatives at stronger cost weight (0.65) and wider coverage weight (0.35) are computed and reported in notes for comparison, while the submitted recommendation uses the interim 0.5 weight. Exact combinations equal the product of runner counts, total cost is combinations times the actual denomination, and complete-sequence model hit chance equals the product of each leg's exact selected PWIN mass (independent-leg assumption). The weight is a **provisional efficiency heuristic, not empirical ROI optimization**; no payout or value model exists. Each addition must improve the coverage-to-complexity objective to survive inclusion. The user can add/remove real runners and the on-page builder recomputes both cost and the model-implied hit rate from private exact PWIN; source selection stays untouched.

**Recommendation classification:** the automatically constructed review-only tickets are CONDITIONAL because payout/value evidence and date-matched final scorer receipts are not independently verified. This is not the old blank HOLD view: full selections, cost, runner coverage, and model-implied chance are displayed. Do not claim PLAY/profitability based solely on PWIN or pool size. Verify official scratches and exact scorer/person-role receipts before promoting an edition to certified customer delivery. If a certified private R2 ticket edition is available for the same track/date, it overrides the provisional auto-construction.

No customer-facing launch flags, products, purchases, Stripe/entitlement logic, or public paths are changed. Admin preview only.

## Interim focused construction V2 — 2026-11-23

**Supersedes the prior broad 0.50 coverage-per-sqrt-combination default for the private review.** The user observed too many horses and asked for a provisional choice between lean and wide while the permanent independent Pick Tickets production window continues tuning selection criteria.

**Method:** From exact, unchanged private TRI PWIN, calculate the previously defined lean (cost exponent 0.65), former balanced (0.50), and wide (0.35) constructions. Start the ticket with **lean** selections. Evaluate the next-best horse in each leg, one at a time, up to the former balanced selections. Include it **only if** it strictly increases the leg's selected model win-probability mass divided by `number_of_selected_horses^0.60`. Stop adding to that leg at the first non-improving horse; ties stay on the lower-cost ticket. This yields an interim **Focused** ticket between the lean and former balanced ticket without fixed ticket sizes, spending caps, singles quotas or forced PLAY counts. The selected-ticket hit chance remains the product of the exact selected leg PWIN masses, with the independent-race assumption. Cost remains official wager denomination × exact combination count.

**Audit:** `review_meta` now records lean, focused, former balanced and wide alternatives (deduplicated), amount saved versus the previous balanced ticket, model hit-rate change, and the additional combinations, cost, and model-implied complete-sequence hit probability contributed by each added horse beyond the lean base. All calculations are model coverage/cost comparisons, **not profit, overlay, or expected-return estimates**. An additional runner may improve hit probability and still be excluded if its incremental combination burden fails the 0.60 rule.

**Classification separation:** The independent selection-calibration window still owns the approved PLAY/CONDITIONAL/PASS policy. Until reviewed, this V2 preview retains CONDITIONAL and labels `review_meta.classification_method=AWAITING_APPROVED_CLASSIFICATION`; it does not invent profitable PLAY recommendations. Once the authorized scorer and classification decisions are available, replace the interim heuristic rather than stacking further front-end rules.

**Security and lifecycle:** Private admin endpoint, protected R2 PWIN, unchanged member authorization/checkout, no source overwrite, no public JSON scores, no changes to other Racing Intelligence modules. Prescratch reviews remain clearly marked and not promoted as scratch-final.

## November 23 official scratch source update — data protection + site state

The owner supplied the five official race-day changes screenshots (Finger Lakes 11:59 ET, Mahoning Valley 11:30 ET, Mountaineer 11:50 ET, Parx Racing 11:49 ET, Zia Park 12:16 ET), all locally SHA256-sealed. `src/pick-tickets-scratch-1123.js` lists the official dated public facts: **50 withdrawals over 28 races** and additional jockey/apprentice/weight changes. The PWIN/F4 data and the screenshot images are not committed to this public GitHub repository.

**Actual frozen TRI V4.1 source reruns executed locally** with the original Nov23 Timeform PDFs, immutable same-day prescratch sidecars, 79-feature frozen parent and corrected source-only runtime. For all five tracks the scratch-only execution returned `PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME`, with original active counts 60/92/77/65/73 reduced to **55/85/56/54/67** respectively. Across all five, current scratch-only PWIN mass checks pass. These runs do **not** claim official post-scratch F4 V2 scoring, nor do they resolve rider input changes on FL/MVR/PRX. Source-level rider changes must be reconstructed with current same-provider proof (do not inherit outgoing ratings). Pending F4 V2 exact-run receipts and matching current horse/order proof, the 42 related tickets remain nonreleaseable, and no old PWIN or old best finish order should be presented as if it were new.

**Protected website behavior:** the existing `GET /api/admin/pick-tickets` now includes a nonproprietary dated `scratch_update` metadata object with the public scratch runner program numbers, input-change flags, 5 source screenshot SHA256s, all 42 impacted menu sequences and real active counts; it does not leak paid probabilities, and the member routes remain disabled. Prescratch `initial_current` tickets for any of the five affected tracks are excluded from the current review response once official source changes are known. Any `scratch_updated` edition accepted into R2 must pass the existing date/revision/signed-source receipt gate and must omit every reported withdrawn horse from all displayed ticket legs AND eligible full-field lists. When no valid scratch-updated edition exists, the same Rail & Rye-branded private page shows the official scratch chips and exact dependency status rather than a misleading prescratch percentage. This is a **scratch intake/update page, not a completed F4/ticket customer release**.

**Completion gate:** rebuild changed rider features for FL/MVR/PRX from signed evidence; rerun exact F4 V2 using new TRI receipt for affected races, preserve untouched race scores, assemble scratch-updated Projections in private R2, rescore all 42 overlapping Pick sequences with focused/authorized ticket construction, validate new exact costs and hit rates, and publish only source-verified revisions. No payout/ROI/pool estimates.

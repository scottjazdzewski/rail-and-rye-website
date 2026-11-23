# Longshot Radar → Racing Intelligence Hub: private module contract

**Stage:** private admin review; **not customer launched or certified by this website code.**
**Design authority:** [RACING_INTELLIGENCE_HUB_DESIGN_SYSTEM.md](RACING_INTELLIGENCE_HUB_DESIGN_SYSTEM.md)
**Owning code:** `src/longshot-radar.js`, `public/admin/longshot-radar.html`, `public/assets/longshot-radar.{js,css}`.

## Protected review
- Route: `/admin/longshot-radar/` — uses the **existing Cloudflare Access admin JWT verification** in `src/index.js`.
- Private API: `GET /api/admin/longshot-radar`, `POST /api/admin/longshot-radar`.
- Data stays in the existing **private** `CARDS_BUCKET` at `intelligence/longshot-radar/review/YYYY-MM-DD.json`. There is no public feed for this review.
- `POST` validates a complete JSON edition and refuses stale revisions or replacement of `scratch_updated` results with earlier `prescratch` data. No public product, Stripe entitlement or customer launch flag is changed.
- **No manual user JSON uploads.** The native admin Radar page reads protected published editions directly from Cloudflare R2. Radar selections are pushed from the production/chat workflow to R2 via the existing owner-authorized encrypted GitHub Actions handoff; the browser has no file picker, upload button, fake data or second publishing step. **No PDF parser, invented source or browser-side re-scoring.**
- A text receipt hash is an *attestation reference*, not an independent cryptographic check of the referenced model-run artifact. The production engine must authenticate and approve the actual source/feature/role/probability/QA receipts before this review JSON is created.

## Accepted JSON (schema_version=1)
One object per **daily slate**; there is no arbitrary eight-horse cap. Empty `candidates` is legitimate. Fields:

| Field | Type / requirement |
|---|---|
| `schema_version` | exact integer `1` |
| `product_type` | exact `"longshot_radar"` |
| `race_date` | actual race date `YYYY-MM-DD` |
| `revision` | positive integer, increases on every replacement |
| `status` | `"prescratch"` or `"scratch_updated"` |
| `generated_at` | true production time in UTC ISO format |
| `receipts` | `release_status:"PASS"`, and 64-hex `model_sha256`, `source_sha256`, `editorial_qa_sha256` |
| `candidates` | 0 or more source-approved candidates in the **production-approved editorial order** |

Each candidate requires:
- `track`, `race_number`, `program_number`, `horse_name`.
- `original_morning_line`: **unaltered original Timeform fraction**, e.g. `"8/1"`; never market-live odds.
- `pwin_exact`: the original signed TRI fractional win probability (e.g. `0.16`, **not** 16), used solely for **non-mutating acceptance validation**; no score computation in the UI.
- `pwin_display`: the *source-approved* one-decimal number to print with a % sign; must agree with exact PWIN to rounding precision.
- `fair_odds_display`: authoritative American-style fair price string from the production output. At 5/1 or longer, whole-number `n/1` format only.
- `betting_case`: the approved single-sentence, causal, race-specific reason. The UI displays this exactly and wraps rather than truncating.
- `source_causal_evidence` and `counterargument_checked`: verifiable production-authored details used in the analysis drawer.
- Optional `post_time_et`, `trainer`, `jockey`, only if verified by production.

## Daily research presentation — shared with Target List

As approved for both Longshot Radar and Target List, the primary screen is a **date-specific daily research list**, not a document reproduction, separate product portal, or wide dashboard table. One **Race date** selector and one **Sort** selector control the list:

- **Post time · Earliest first** (default) sorts across ALL source tracks as one chronological sequence, regardless of track. Parse only declared Eastern post times; missing/unparseable times go last in original editorial order.
- **Track · A to Z** groups tracks alphabetically, with races ordered within track. Sorting affects presentation only, never the source-certified editorial choices, rank, scoring or numerical values.
- Each Radar result uses the same navy/gold **track / race / post time** header, authentic saddlecloth, readable horse name, **ML ODDS / WIN % / FAIR ODDS** columns, and the source one-sentence betting case. **No Race details button or drawer**: full analysis is visible directly on every horse card. When authenticated production provides evidence and counterarguments, they also appear inline.
- Target List's corresponding result retains its **ML FAVORITE / ATTACK / optional ALSO LIVE** comparison rows, with the same saddlecloth/stat/analysis conventions. Never force Radar into the Target List's specific selection methodology or vice versa.
- Do not add extra sort by model percentage, rank or horse name. Existing source publication order remains intact in storage. At phone widths, metric cells wrap beneath the identity without horizontal overflow.
- Radar code changes reside in this branch. Target List owns its own branch [draft PR #149](https://github.com/scottjazdzewski/rail-and-rye-website/pull/149); the shared design direction was communicated there rather than overwriting another module's concurrent work.

## November 23 loading fix and push-only authority

- On November 23, a newer private HTML page still referenced `longshot-radar.js?v=1`, allowing iPhone/browser caches to retain legacy JavaScript expecting UI elements that were removed. That prevented initialization, leaving “Checking private Radar editions…” visible indefinitely.
- The revised HTML uses a fresh versioned JavaScript asset, removes the JSON-upload accordion entirely, and loads the **10 actual 2026-11-23 published horses automatically** via the existing Access-gated read-only `/api/admin/longshot-radar-editorial` R2 endpoint.
- A 12-second client timeout and explicit error/retry state replace an indefinite blank page. If Cloudflare Access sends a login HTML redirect instead of JSON, the page reports that authentication is needed. Browser tests exercise the same 10-horse API response structure and deliberate 503 recovery on six screen widths.
- The private editorial transfer already wrote the real 10-source-horse R2 object with readback confirmation and 10/10 identity and displayed win-percentage matches to frozen TRI projections. For subsequent dates, the assistant must arrange a new verified, encrypted, server-side production source handoff; **never instruct the customer to choose or upload JSON**. Exact unrounded TRI release certification and customer entitlement launch remain independent gates.

## November 23 authentic published-card private reader

- Owner publication: LONGSHOT_RADAR_11_23_26.pdf (10 horses, 2 pages). PDF SHA256: 99fc4df3807b2713afc2043ebacf2360b93943ad0ecfdc25bce9378fa67edb1d. Source Timeform ZIP SHA256: 5d4f1bdeefc07ef85445a0168cea064867c10a3342dbefbded510e96a97e89e1.
- Preserve printed horse names, actual saddlecloth numbers, track/race/post, original Timeform morning line, approved PDF win %, published fair odds and the complete one-sentence evidence. Do not invent trainer, jockey, scratches or exact PWIN.
- Admin-only GET /api/admin/longshot-radar-editorial reads from private R2 racing-intelligence/longshot-radar-pdf-review/2026-11-23/revision-0001.json after the existing Cloudflare Access JWT gate. No paid selections live in public HTML, GitHub JS, or a public endpoint.
- The owner-only PR #173 sealed-box comment transfers encrypted source rows to a GitHub Action that validates source hashes, writes an immutable R2 record and checks readback integrity. The old unlisted public design address now redirects directly to the protected actual-data reader; it never includes actual paid selections in its public HTML.
- Published PDF values are labeled published_pdf_reference and production_receipt_verified:false. They are original one-decimal printed percentages and MUST NOT be treated as independently confirmed original unrounded TRI probabilities. Any matching TRI display check is not a full receipt certification.
- Source analyst prose remains completely readable at approximately 15px on phones; saddlecloth sizing is fixed; no Race details button or hidden analysis drawer.
## Additional exact TRI cross-check on private uploads

The Radar admin POST now reads the existing private `projections/dashboard/YYYY-MM-DD/*.json` projection cards for that race date. It refuses an upload unless the complete TRI card is available and every source race sums to 100% exact PWIN with matching F4 first-place probabilities. For every proposed candidate, server-side checks require the **same original track, race number, saddlecloth/program number, horse identity, unrounded exact TRI PWIN, displayed win percentage and original Timeform morning line**. No matching private projection card means **HOLD**, including an approved empty day. A scratch-updated Radar cannot be matched to a prescratch-only projection. This is provenance cross-checking, **not scoring** and does not verify independent handicapping rationale or actual source receipts.

Do not upload a review JSON created by transcribing rounded values from an existing Radar PDF; it cannot pass as a signed exact-PWIN source. See the canonical TRI direct-to-R2 publisher in `scripts/tri_dashboard_sync.py`.

## Frozen Longshot Radar selection gates

The current controlling November 20 evidence-first authority (in the permanent Longshot Radar Google Drive production folder) requires **all four**:
1. Timeform **original** morning line of 6/1 or longer.
2. Official exact TRI PWIN >= 1/7, meaning model fair odds **6/1 or shorter**. No exceptions.
3. Exact provisional theoretical ML edge `PWIN * (1 + ML_net) - 1 >= 0.50`.
4. Independent opponent-aware causal handicapping thesis, with counterarguments checked.

**The website never decides to add a candidate or recalibrate a probability.** The server's numerical checks only reject impossible or superseded inputs. The source engine and release authority remain responsible for verifying all four gates, authentication of the Timeform card/whole-field model receipt, scratch reruns, one-sentence editorial quality, order and full-day selection coverage.

For prescratch, customer language is **INITIAL · CURRENT** until an approved scratch update supersedes it. Do not misrepresent a morning line as a bet currently available; the 50% figure is theoretical, not backtested ROI.

## Exact boundaries for parallel windows
- Projections owners retain exclusive edit control of `public/assets/projections-dashboard.{js,css}`, `src/projections.js` and their current review pages. This branch changes none of those.
- Shared Hub navigation, single-purchase and membership entitlements, unified Publication Desk, customer data route, and `/racing-intelligence/*` launch pages belong to the **shared shell/auth integration**. Do not implement a second login or separate checkout here.
- After the shared entitlement verifier is complete, add a read-only customer API that **rechecks the existing authenticated user’s product/edition entitlement server-side** before returning Radar content, and add this native renderer as a view in the unified shell.
- Keep the private review and published customer data in **separate R2 prefixes**. Do not treat an uploaded review as approved for release.
- Old purchased PDF access remains intact until the promised purchase window ends; do not silently remove legacy routes.

## QA
- `node test-longshot-radar.mjs` tests admission logic, no pick cap, revision safety, R2 behavior, the private route and static UI contract.
- `node tests/longshot-radar-browser.mjs` tests ten source-shaped (synthetic) private Radar rows at 320/375/390/430/768/1280px, cross-track post time/track sorting, inline analysis, absence of JSON file pickers, timeout/error recovery via retry, responsive saddlecloths, and no horizontal overflow.
- `.github/workflows/verify-longshot-radar.yml` runs these checks and uploads synthetic screenshots for human inspection.
- The review is **not** a claim of actual card source certification, R2 deployment, Stripe entitlement completion, or customer launch.

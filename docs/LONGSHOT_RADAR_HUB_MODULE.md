# Longshot Radar → Racing Intelligence Hub: private module contract

**Stage:** private admin review; **not customer launched or certified by this website code.**
**Design authority:** [RACING_INTELLIGENCE_HUB_DESIGN_SYSTEM.md](RACING_INTELLIGENCE_HUB_DESIGN_SYSTEM.md)
**Owning code:** `src/longshot-radar.js`, `public/admin/longshot-radar.html`, `public/assets/longshot-radar.{js,css}`.

## Protected review
- Route: `/admin/longshot-radar/` — uses the **existing Cloudflare Access admin JWT verification** in `src/index.js`.
- Private API: `GET /api/admin/longshot-radar`, `POST /api/admin/longshot-radar`.
- Data stays in the existing **private** `CARDS_BUCKET` at `intelligence/longshot-radar/review/YYYY-MM-DD.json`. There is no public feed for this review.
- `POST` validates a complete JSON edition and refuses stale revisions or replacement of `scratch_updated` results with earlier `prescratch` data. No public product, Stripe entitlement or customer launch flag is changed.
- Admin UI includes an optional file uploader for already-authorized structured production outputs. **No PDF parser, no invented source, no browser-side re-scoring, and no PDF viewer.**
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
- `node tests/longshot-radar-browser.mjs` tests the real browser at 320/375/390/430/768/1280px, card coverage, overflow, analysis drawer, Escape and filtering using only synthetic test fixtures.
- `.github/workflows/verify-longshot-radar.yml` runs these checks and uploads synthetic screenshots for human inspection.
- The review is **not** a claim of actual card source certification, R2 deployment, Stripe entitlement completion, or customer launch.

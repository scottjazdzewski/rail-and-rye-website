# Target List — private native hub module contract (review branch)

**Authority:** [RACING_INTELLIGENCE_HUB_DESIGN_SYSTEM.md](RACING_INTELLIGENCE_HUB_DESIGN_SYSTEM.md).
**Status:** draft PR, admin preview only. No public or customer route, no pricing changes, no PDFs in the new module.

## Producer handoff, not scoring

The existing frozen Target List production process must emit a **source-verified JSON export** directly alongside its trusted TRI V4.1 receipt checks. The website **does not** discover candidates, score horses, calculate fair odds, assign PRIME/STRONG, create narratives, or force a 12-target count. If no races qualify, emit an empty `targets` array.

The private import requires these verified producer-supplied fields:

| Field | Requirement |
|---|---|
| `schema_version` | integer `1` |
| `product_type` | literal `target_list` |
| `race_date` | valid YYYY-MM-DD for the selections |
| `revision` | starting `1`, increment one per scratch revision |
| `status` | `initial` for revision 1, `scratch_update` afterward |
| `source.receipt_id` | non-empty certified production receipt reference |
| `source.sha256` | 64-character hex checksum of the producer source (not an assertion that the website verified that source) |
| `targets` | ordered array of selected races; zero is valid |
| `targets[].rank` | unique positive integer from approved production; no website re-ranking |
| `targets[].track` / `race_number` | exact source labels/number, unique track+race |
| `targets[].tier` | optional `PRIME` or `STRONG`, only as actually assigned by production |
| `targets[].post_time_et`, `surface`, `distance`, `conditions` | optional exact source values, never invented by renderer |
| `targets[].favorite` / `attack` | required horse records: `program_number`, `horse_name`, `morning_line`, numerical exact published `win_probability` (percentage, not fraction), `fair_odds`; optional `trainer` and `jockey` |
| `targets[].also_live` | optional same horse record when an additional alternative qualified |
| `targets[].analysis` | required original approved full commentary |
| `targets[].scratches` | optional official scratch records (`program_number`, `horse_name`) on scratch update, not on initial |

The existing Target List selection gate remains **ATTACK certified PWIN strictly greater than the morning-line favorite**, with a compelling handicapping case. This is an ingest integrity rule, **not** a source of new candidates or handicapping.

## Private Cloudflare flow

1. Trusted production validates TimeformUS and TRI source receipts and writes the structured Target List export.
2. Administrator uploads the JSON in **private admin preview** `/admin/target-list-preview/` (or sends it to `POST /api/admin/target-list` under existing Cloudflare Access authentication).
3. Server rejects malformed records and incompatible revisions; writes a SHA-256-fingerprinted JSON object to existing private `CARDS_BUCKET` at `racing-intelligence/target-list/YYYY-MM-DD/revision-NNNN.json`.
4. Admin preview reads the latest revision per date from `GET /api/admin/target-list?date=YYYY-MM-DD`. No public JSON asset or shared data URL is created.

**Important:** `source.receipt_id` and `source.sha256` are evidence references only. The website does *not* independently inspect, verify, or certify the upstream scorer ZIP. Public release must remain blocked until a trusted receipt-verifying publisher is integrated, rather than relying on a manual claim.

## UI and access integration

- Renderer uses same navy `#102d53`, ivory `#f4f0e6`, restrained gold `#c99831`, Inter/system type and Tinos Bold win/fair odds as the compact Projections baseline.
- Source rank and optional tier; exact official saddle PNGs (suffix displayed without inventing a new image); favorite vs ATTACK with source ML/PWIN/fair; optional ALSO LIVE; full commentary in a native accessible dialog/bottom sheet.
- Filtering by source date/track/horse only. No invented classifications or source fallback. Phone presentation remains dense with explicit wrap and no body-wide horizontal scrolling.
- This module is **not a new customer portal**. Future common hub shell and server entitlement service must authenticate both membership and bought singles/bundles under the same site account. In current code, membership sessions do not authorize standalone purchases. Do not enable a public Target List route until unified access, recovery, refunds, expiry and checkout are reviewed.
- Keep all legacy paid PDFs available under their current terms during migration. No change to Projections renderer or existing Stripe webhook processing.

## QA and release

`node test-target-list-hub.mjs` covers validator, existing-revision protection, zero targets, no invention, private data path, and static/mobile DOM. PR workflow runs the test. Additional prelaunch gates: production source receipt verification, real authorized edition, no data leaks, actual browser viewport and full-field checks at 320, 375, 390, 430 and desktop, purchase/refund entitlement QA, and explicit owner approval. Do not merge or deploy this draft PR as a customer feature until these checks are satisfied.

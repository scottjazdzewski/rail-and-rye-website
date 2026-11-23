# TRI → Rail & Rye dashboard: automatic private sync

## Outcome

The approved scorer output ZIP in the existing **TBS CARD PRODUCTION LOCK — CURRENT** Drive folder is the authoritative input. GitHub Actions checks that folder automatically every two hours, validates the frozen TRI V4.1 and F4 V2 source/receipt hashes, converts the scored ZIP to the dashboard schema and writes only to the private Cloudflare R2 bucket `rail-and-rye-private-cards`.

No one needs to download and re-upload JSON when a validated scorer ZIP appears in the Drive production folder. The job does not produce or publish customer PDFs, change the site membership-launch flag, promote a card to post-scratch, or colorize uncertified five-factor ratings.

**Status:** Code installed; automatic syncing will remain intentionally disabled until the one-time permissions below are configured. A passing GitHub build is NOT proof that a particular scoring date was uploaded into R2.

## One-time connection

1. Create a Google Cloud service account with **Drive API enabled** for its project. Generate a JSON service-account key *privately*. Share the private Drive production folder with its `client_email` as **Viewer**. Never make that folder public. The current production folder ID is `1yR79Mp8BndMd1KQfGEsbUOKvq-BJ2Vzd`.
2. In Cloudflare, create an R2 API token scoped only to object read/write for **rail-and-rye-private-cards**. Note the Cloudflare account ID and R2 key ID and secret key. Do not give the token global account permissions.
3. In GitHub `scottjazdzewski/rail-and-rye-website` → Settings → Secrets and variables → Actions → Repository secrets, configure:
   - `TRI_GOOGLE_SERVICE_ACCOUNT_JSON`: complete Google service-account JSON (private key included).
   - `TRI_CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
   - `TRI_R2_ACCESS_KEY_ID`: scoped R2 API key ID.
   - `TRI_R2_SECRET_ACCESS_KEY`: scoped R2 API secret key.
   Optional Actions repository variable `TRI_DRIVE_FOLDER_ID` can override the pinned private production folder ID.
4. From GitHub → Actions → **Sync verified TRI prescratch projections to private R2**, choose **Run workflow**. Optionally enter exact source Drive ZIP ID to target a particular signed-off package, such as `1tdF_-eVLVRR4P7olyMWIG02-0c5E0OZx` for November 23. For normal recurring runs, leave this blank.
5. Verify the job reports `TRI_SYNC date=... tracks=... races=... runners=... written=... mode=PRIVATE_R2`. Check the Access-protected `/admin/projections-preview/` date and track menus. The November 23 expected totals are **5 tracks, 45 races, 367 runners**.
6. Once configured, automatic checks run every 2 hours. The job skips unchanged source hashes, and refuses to overwrite any newer finalized/scratch-updated card.

## Guardrails and scope

- Source ZIP name pattern: `RAIL_RYE_MMDD_TRI_V4_F4_V2_ROLE_RATING_REPAIR_ALL_FIVE_PASS.zip`. Do **not** add unverified/failing packages matching this filename.
- The source file must contain `RESOLUTION_RECEIPT.json`, all matching `*_VERIFIED_TRI_F4_SOURCE.json` files, each track's original TRI/F4 receipts, role-audit SHA, and verified current trainer/jockey sidecar. Model math is never regenerated or changed.
- The normalized JSON must pass full-field 100%-PWIN, F4 outcome normalization, exact PWIN=F4 winner, source hash, date, field-count and role-coverage checks.
- Scratch status stays unknown (`scratch_count:null`), with visible **PRESCRATCH** labeling. Official scratches can be applied later by the scoring production pipeline.
- The Worker app already reads these private R2 objects via `/api/admin/projections-preview`. No new public data-serving endpoint is introduced.
- This process intentionally does not alter the `PROJECTIONS_MEMBER_LAUNCH=off` setting.
- All private data stays in Google Drive, in the ephemeral runner during sync, and in Cloudflare R2. The public GitHub repository holds code and synthetic tests only.
- The scheduled workflow executes at most every two hours and may be delayed by GitHub scheduling. For immediate delivery after a scored run, the scoring workflow can invoke its authenticated `workflow_dispatch` or use the run-workflow action; the secured source ZIP must already be in Drive.

### Troubleshooting

- `TRI_AUTO_SYNC_DISABLED`: missing one-time GitHub secrets. Nothing is published.
- `TRI_SYNC_HOLD`: validation failure, missing/failing receipt, role coverage mismatch, unsupported package, or conflict with an existing finalized card. No new publish is accepted.
- `NO_APPROVED_SOURCE_PACKAGES`: the authenticated service account cannot see any matching ZIP in the configured folder.
- `NO_CURRENT_PRESCRATCH_PACKAGE`: the latest model ZIP is outside the current/tomorrow date window. Run a manually specified source ID only for deliberate historical review.
- `unchanged=N`: all N R2 objects already match the current ZIP hash. This is expected on repeat checks.

## Developer QA (no private credentials)

Run `python -m unittest discover -s tests -p 'test_tri_dashboard_sync.py' -v`.
Offline verification of a local real package is `python scripts/tri_dashboard_sync.py --verify-zip /path/to/private.zip` (do **not** add that ZIP to the Git repo). 

# Rail & Rye — direct TRI → R2 dashboard delivery

**Current design:** Frozen TRI V4.1 + F4 V2 produces a fully receipt-verified, prescratch ZIP. A single publisher uploads the resulting dashboard cards directly to the existing private Cloudflare R2 bucket. The website reads those R2 objects.

```text
TRI scoring run + certified badge-evaluator QA → direct private R2 publisher → Rail & Rye admin dashboard
```

**Removed:** Google Cloud project, Google Drive API service account, Google Drive folder polling, Google Drive-to-R2 transfer, recurring manual JSON file conversions, and the unused two-hour GitHub Actions polling job. Keep Google Drive only for the existing production archive if desired.

## What is running, what is pending

- The direct publisher exists at `scripts/tri_dashboard_sync.py` and is regression-tested with synthetic TRI evidence and a simulated private R2 client.
- The Cloudflare Worker and dashboard already read from `rail-and-rye-private-cards`; the Worker does not need new endpoints or deployment configuration.
- **The actual TRI scorer does not run in this GitHub website repo.** The CLI must be invoked automatically by the trusted runtime that currently produces each verified scored package. Until that integration is executed, the website will **not** receive new model data automatically.
- The user has already saved their R2 credentials in GitHub Actions repository secrets, but those secrets **are not automatically available** to the separate TRI scoring environment. Never request them in chat or commit them to the public repository.
- For November 23, the verified 5-track/45-race/367-runner source ZIP already exists. Publishing it requires running the direct publisher in a trusted environment with scoped R2 credentials; no extra Google project is needed.

## One production post-score step

After the scorer generates the same validated package that contains the `RESOLUTION_RECEIPT.json`, `*_VERIFIED_TRI_F4_SOURCE.json`, per-track TRI/F4 model receipts, role audit and verified connection sidecar:

```bash
# Validate all receipts and produce a local preview; requires no credentials:
python scripts/tri_dashboard_sync.py --zip "/path/to/VERIFIED_TRI_SOURCE.zip"

# Certify the scorer AND exact five-color badge evidence offline:
python scripts/tri_dashboard_sync.py --zip "/path/to/VERIFIED_TRI_SOURCE.zip" \
  --badge-source-zip "/path/to/APPROVED_RACECARD_BADGE_QA.zip"

# The production scorer calls this once after both current-source gates PASS:
python scripts/tri_dashboard_sync.py --zip "/path/to/VERIFIED_TRI_SOURCE.zip" \
  --badge-source-zip "/path/to/APPROVED_RACECARD_BADGE_QA.zip" --publish
```

The publishing command **requires** the second source-verified badge QA ZIP. It will not publish an incomplete initial card that is missing its five factors. The QA ZIP must contain `SHA256_MANIFEST.json`, `output/FINAL_QA_RECEIPT.json`, all `data/<TRACK>/badge_audit_ledger.json` and `data/<TRACK>/<TRACK>_RACE_ONLY_INPUT.json`, and current-root renderer self-test proof. The exact evaluator release is `TBS_FACTOR_BADGE_EVALUATOR_V1_2_6_FIT_CLASS_FORM_GUARDS`. The publisher crosschecks every race, purse, original program/horse, frozen PWIN and all five colors against both evidence sets. No re-scoring or new color thresholds are performed.

This command must be invoked **once, automatically, by the model runner**, only after its frozen scoring, badge-evaluator and receipt gates pass. It is idempotent by scored source SHA-256. For a no-write R2 permission/preflight test add `--dry-run` to `--publish`.

Run `python -m unittest discover -s tests -p 'test_tri_dashboard_sync.py' -v` for the synthetic QA.

## Environment variables used ONLY by the publishing process

- `TRI_CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `TRI_R2_ACCESS_KEY_ID` — a token restricted to **Object Read & Write** on `rail-and-rye-private-cards`.
- `TRI_R2_SECRET_ACCESS_KEY` — matching secret access key.

Use an encrypted environment/secret manager where the **scorer runs**. Do not paste private values into GitHub source files or chat. If the scorer is moved into an authenticated GitHub Actions runner, it can use the three existing repository secrets without another provider. Otherwise configure the R2 credentials in the trusted scorer runtime. This is the only remaining integration dependency.

Requires `boto3` in the publishing runtime (`pip install boto3`). No `google-auth`, Google Cloud project, `requests`, or Drive folder credentials required.

## Fail-closed safety

- Reject any failed or missing frozen TRI V4.1/F4 V2 receipt, resolution status, 79-feature-gated model run, trainer/jockey role evidence, source identity, exact 100% field PWIN, or F4 finishing distribution.
- Keep `PRESCRATCH` status. Do **not** assert zero scratches or invent five-factor color badges; official scratches are handled in the separate later scoring pass.
- Only private bucket path `projections/dashboard/YYYY-MM-DD/track-slug.json`; no public race-data assets committed to GitHub.
- Preflight all target R2 objects before writing; never replace scratch-updated or finalized cards with an older prescratch source. Repeated SHA-256 packages do not re-write R2.
- Model delivery is **not** certification of a customer PDF or public member access. Existing member-launch flag stays off until separately authorized.
- Always verify the actual R2 operation and protected admin preview before saying the data is live.

## Notes on operational simplicity

A service that cannot access the scorer's verified ZIP cannot perform this upload just because a GitHub secret was created. Adding another file transfer/polling service does not solve that. The integration point must be the process that actually **has the scored ZIP**. Keep the current production archive where convenient, but avoid introducing extra credential providers for a copy.

## November 23 implementation confirmation

The initial 2026-11-23 private R2 dashboard (45 races, 367 horses) was updated separately from an authenticated, encrypted source-backed badge patch. GitHub Actions receipt `45106762595` confirmed **1,835 badges / 445 green / 1,216 gray / 174 red, 5 track objects written and read back**. The original verified model PWIN and F4 entries remained unchanged. The front end displays the exact existing badge PNG assets and uses **Tinos Bold**, the approved racecard numeric face, for win percentages/fair odds. It labels the scored prescratch initial card as current until scratches; this does not assert scratch-final status.

The scorer's external hosting/execution remains outside the website repo. For future dates it must provide BOTH current source packages and call the publisher. No Google Cloud account or Drive service account is necessary.

# Rail & Rye — direct TRI → R2 dashboard delivery

**Current design:** Frozen TRI V4.1 + F4 V2 produces a fully receipt-verified, prescratch ZIP. A single publisher uploads the resulting dashboard cards directly to the existing private Cloudflare R2 bucket. The website reads those R2 objects.

```text
TRI scoring run → verified source ZIP → private Cloudflare R2 → Rail & Rye admin dashboard
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

# Send it directly into the same private R2 bucket as the website's dashboard:
python scripts/tri_dashboard_sync.py --zip "/path/to/VERIFIED_TRI_SOURCE.zip" --publish
```

The second command should be invoked **once, automatically, by the model runner**, only after its frozen scoring and receipt gates pass. It is idempotent by scored source SHA-256. For a no-write R2 permission/preflight test add `--dry-run` to `--publish`.

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

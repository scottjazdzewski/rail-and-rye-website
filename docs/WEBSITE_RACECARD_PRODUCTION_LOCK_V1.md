# Rail & Rye — Website Race Card Production Lock V1
Approved mobile baseline: selected-race underline commit b8915f17fa3a0695a6afc6a01eb1d293ed574f21; user-approved November 23, 2026. Current repository remains the UI authority; the baseline is a reference, not a command to roll back later authorized UI work.

## Controlling decision — November 23, 2026
The operator approved the existing PDF production process as the authority for website data production. ChatGPT is the operator-facing execution environment, not the website. Resolve the same private frozen runtime and input/evidence packages as the PDF card window. Do not install, migrate, schedule, host or expose the TRI engine, F4 engine, feature matrices, historical database, scoring weights or proprietary evaluator on the website, Cloudflare Worker, R2 or public GitHub. No engine migration or automatic external scoring integration is authorized.
 
**One production run, two possible output formats.** Reuse the exact PDF intake, parser, source joins, trainer/jockey resolution, class and purse verification, TRI/F4 scoring, five-factor evaluation, scratch handling, and source/field QA. Branch only after the common certified race-data record is ready:
- PDF request: invoke the existing approved PDF renderer and PDF-specific QA.
- Website request: serialize that same certified record to the existing website schema, use the approved private transfer path, verify the stored and displayed edition. Do not generate customer PDF pages as a routine intermediate output. Retain any existing mandatory badge/root evidence gate until a replacement is independently qualified.
- Both requested: reuse the same verified run; no duplicate scoring.
The existing PDF authority is the single source for scoring and evidence, not the PDF artwork or a separate web model. Website presentation stays under the approved UI authority.

## Operator commands
- A Timeform ZIP/link with a request to run/publish means execute the full private prescratch pipeline in the ChatGPT production session and push the verified results, not merely prepare instructions or create a GitHub commit.
- Official scratch notices mean rerun the affected races through the same frozen private runtime and publish the revised verified records, preserving unaffected races.
- On missing runtime, source, receipt, or authenticated transfer access, report the specific blocker and retain last verified data. Do not ask the operator to upload JSON or supply extra source files that production can independently resolve. Do not claim a run or push occurred unless tool receipts support it.

## Single daily intake
- A dated TimeformUS ZIP is the prescratch trigger. Official scratch screenshots/change notices are the scratch-rerun trigger. The operator does not create or upload JSON, supply separate Equibase files, or perform GitHub releases.
- Inventory each track/race/program/horse from the actual source; preserve source hashes and complete identity joins. Verify class, named stakes, grade, surface, distance, post time and actual advertised purse (not claiming price). Use explicit source purse when available; otherwise independently verify official date/track/race entry pages. Unresolved facts remain HOLD; do not guess.
- Reuse the exact approved PDF production authorities and badge evaluator. Start at https://docs.google.com/document/d/1mf1hXT7UmJvNiuCVZjmALRgmt7YQOmLMn1kQKpdMvm8/edit ; resolve current root and verified source packages. PDF rendering remains a separate deliverable, not a prerequisite to a fresh website layout.
- Frozen TRI V4.1 + F4 V2; exact current approved trainer/jockey role resolver, 79-feature evidence, full field, receipt-verified probabilities, frozen finishing order and five-factor evaluator. No fallback math, invented statuses or renormalization-only scratch updates.
- One date/track race record feeds all website modules and PDF production. A dated repair overlay is not a reusable source for subsequent dates.

## Prescratch fast path
In the private ChatGPT production session, run the existing PDF scoring workflow to obtain the verified TRI/F4 source ZIP and approved badge-QA ZIP. Invoke the existing publisher only if its authorized environment and credentials are available:
```sh
python scripts/tri_dashboard_sync.py --zip "$VERIFIED_TRI_ZIP" --badge-source-zip "$BADGE_QA_ZIP" --publish
```
For validation only omit --publish; for no-write R2 preflight append --dry-run to --publish. Use the existing scoped secret environment or the previously approved authenticated, encrypted output-only handoff. Never put private inputs, engine code, unencrypted projections or credentials in public GitHub. The handoff must publish the verified output only; it must not run or receive the scoring engine.
The website reads private R2; no daily source-code push, new HTML, CSS, public JSON, or redeployment should be necessary. Preserve entitlement and private review gates. See TRI_DASHBOARD_AUTO_SYNC.md for the exact integration and receipt requirements.

## Scratch fast path
Match each official change to date/track/race/program/horse. Rescore affected fields in the frozen external TRI/F4 runtime; re-evaluate factors and verify changed model receipts, scratch identity and surviving runners. Preserve untouched races. Use approved certified scratch-final F4 upload plus authenticated projection batch route; see TRI_DASHBOARD_AUTO_SYNC.md. Never use the prescratch CLI to overwrite a scratch-final card. Reconcile dependent products only through their respective locked authorities.

## Visual contract
- Existing mobile layout; exact approved saddle art, constant chip size, gold 28×3px selected-race underline, no halo. Existing scratch lane and card heights.
- Full race class/name, sponsor-free named stakes and verified trophy grade. Hide dollar suffix on generic class titles only; keep raw claiming amounts internally. Purse remains in existing gold slot. Exact approved five-factor artwork and current typography.
- Existing track logos retained. Changes to logo registry, desktop layout, CSS or artwork belong to the UI window only. Do not reconstruct the approved PDF artwork or add explainer copy.
- Admin and member renderer parity; access controls remain unchanged.

## Release checklist and operator receipt
Record actual date, source hashes, tracks/races/runners, verified purse coverage, scratch state, TRI/F4 and badge receipts, private R2 write and readback outcome, protected dashboard readback and holds. Verify each expected track and race and compare actual visible data against source. A GitHub commit is not a daily data publication; a successful R2 put alone is not proof that the protected dashboard displays the right edition. Use precise statuses VERIFIED / PRIVATE_R2_READBACK / LIVE_VERIFIED / HOLD, not inferred success. Never release incomplete affected cards as FINAL.

## Remaining engineering
The website-side publisher and guardrails exist. The only remaining qualification is the ChatGPT-operated output handoff: prove one complete private prescratch execution and one official scratch rerun using the existing PDF production runtime, then authenticated publication and readback of the finished data. No autonomous scoring integration, engine hosting, polling service or engine migration is requested. Daily race data should not require edits to website source code. If the private execution session or secure transfer route is unavailable, report HOLD instead of claiming delivery.

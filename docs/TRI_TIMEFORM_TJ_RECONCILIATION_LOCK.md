# RAIL & RYE / TRI — PERMANENT TRAINER & JOCKEY RECONCILIATION LOCK

Status: approved operating protocol; November 25, 2026 implementation. Applies to **every race and every runner** in daily TimeformUS prescratch cards and every scratch/replacement rerun. This is a **source-input proof layer**. It does NOT change promoted TRI V4.1, the frozen TRI V1.3.7.2 feature set, coefficients, normalizer, or F4.

## Immutable decision order (both roles, every runner)

1. Bind the current date, original PDF SHA-256 and page, track, race, program, **horse**, and the horse's own **trainer and jockey**. Use native PDF text coordinates/geometry, not flattened column text, neighboring entries or a historical name guess. Audit a complete active-field roster, including AE/MTO status, before scoring.
2. Recover a **valid same-provider, same-scale, as-of-pre-race** trainer/jockey rating when source-proven; use it unchanged with the correct known indicator.
3. Treat a **genuine printed zero** as zero. Only an explicitly source-proven provider-coverage zero may use the V4 neutral exception; foreign birth/circuit alone is never proof of unsupported coverage.
4. For a **verified empty Ratings cell**, use disposition `VERIFIED_UNRATED`. For foreign-native-only without a validated crosswalk, preserve native data separately. Neutralize BOTH model connection features—rating and rating-known—to their frozen TRAINING FEATURE MEANS, before scaling. **Never substitute 0, 50, or a made-up foreign conversion.**
5. Where identity, source date/roster, page geometry, name-role binding, or source rating is unverified, mark **HOLD only the affected race**. Continue verified other races/tracks. No model PASS or manufactured PWIN/F4 for held races.
6. Any change of jockey/trainer, starter/AE/scratch status, or verified rating requires recalculation of the **full affected race** with the promoted scorer and a fresh source-to-score gate. Recompute PWIN to 100% and downstream F4 together; never carry an old probability across changed inputs.

## Exact PDF extraction bug locked out

Some native TimeformUS PDF pages merge the trainer's printed name with the adjacent column title, producing strings such as `Earnings Top Fig B. Colebrook`. The current true name is **B. Colebrook**, corroborated by the `Ratings` header and matching original PDF page coordinates. The audited reconciliation can strip exactly the **verified** heading prefix. It must not strip free text or guess a person. Similarly, the `Past Yr`/`Starts` column must not be mistaken for the `Ratings` value when that rating cell is genuinely blank.

Use `scripts/tri_timeform_tj_reconcile.py` to produce **new** corrected sidecar/source snapshots, and `scripts/tri_timeform_tj_reconcile_gate.py` to audit those snapshots before scoring. Preserve originals. These are not substitute scoring engines. The canonical scorer remains `CODE/score_current_runtime_v1_3_7.py` + `CODE/run_tri_tj_scoring.py` from the **authenticated promoted TRI V4.1 package**, with `CODE/permanent_tj_gate.py` run to verify the actual 79-feature matrix consumed by the model.

```
python scripts/tri_timeform_tj_reconcile.py --roster source_roster_geometry.json --source-dir original-pdfs --sidecars-dir sidecars --race-date YYYY-MM-DD --out-dir reconciled
python scripts/tri_timeform_tj_reconcile_gate.py --roster reconciled/source_roster_reconciled.json --source-dir original-pdfs --sidecars-dir reconciled/sidecars --race-date YYYY-MM-DD --out reconciled/tj_gate.json
```

**November 25 source proof:** 630 printed runners across 9 tracks; 23 incorrectly concatenated trainer headings resolved directly from original native PDF geometry. Original T/J ratings unchanged. Four jockey assignments absent from original Parx Racing PDF; only Parx Races 4, 7, 8 stay on a source HOLD pending verified original-date rider evidence. The remaining eight track source gates PASS, with independently verified rating/identity states. These facts do **not** by themselves certify or stage any predictions; new source-linked scorer receipts and staging QA remain mandatory.

## Required future QA

- Original ZIP SHA-256 and unique nine-track/race PDF audit, date, program, horse and roles reconciled one-to-one.
- Native `Ratings` column captured by geometry; separately count verified unrated, printed zeros, and resolved exact-rated fields.
- All source-person strings equal the corrected per-horse sidecars; no leaked headings or neighboring runner labels.
- Canonical V4 scorer gate confirms no unresolved roles, approved neutral means in the **actual consumed** model feature matrix, original zeros preserved, race PWIN total reconciled, and same-run F4 receipt.
- Preserve prescratch vs scratch-update status honestly. Stage next-day output only after all applicable source/scoring/editorial/visual checks. Never advance the customer-facing day before the established 3 AM rollover.

## Mandatory one-command daily launcher (not optional manual QA)

Future card-production windows MUST invoke `scripts/tri_timeform_tj_verified_score.py` instead of calling `CODE/score_current_runtime_v1_3_7.py` directly. The launcher automatically repairs only geometrically proven merged trainer headings, audits both roles for every original-card starter, holds source-unverified races, scores only fully verified tracks through the unchanged promoted runtime, and verifies actual consumed model-role receipts. It writes a source-to-score custody report; no customer/staging upload is performed by this launcher.

```
python scripts/tri_timeform_tj_verified_score.py \
  --roster source_roster_geometry.json --source-dir original-pdfs \
  --sidecars-dir original-dated-sidecars --engine-dir TRI_V4_1_promoted \
  --runtime-zip TRI_V1372_FROZEN_PARENT.zip --race-date YYYY-MM-DD \
  --out-dir verified-scored-output
```

Never bypass the launcher to turn a missing-jockey track into a PASS. Where one PDF contains some source-held races, the custody report identifies **the exact held race numbers** so verified unaffected races can be run in a separately scoped source-preserving batch rather than misrepresented as part of the complete-track receipt.

## Reconciled operator rule — confirmed unassigned is not unverified identity
A horse with a genuinely unassigned jockey is not an extraction failure: where the original Timeform PDF has no jockey row/name and an independently checked exact date/track/race/program/horse official entry row also has an empty jockey field, retain the horse, display Not assigned, preserve the empty identity, and use VERIFIED_UNRATED with both frozen neutral feature means. No invented names or ratings. The sidecar may carry an explicit jockey_unassigned_proof with date, track_code, race, program, horse, source_pdf_sha256, pdf_page (1-based), official_entry_url, official_jockey:null, status:VERIFIED_UNASSIGNED, checked_at and observation. This is a source-observation record, not a substitute for actually checking the official entry. Missing/ambiguous proof continues to HOLD. An assigned jockey can never use this exception. Run the full affected race on actual assignment changes.

November 25 clarification: fresh official Parx R4, R7 and R8 entry checks still showed four empty jockey cells (Maximus Meridius #3 R4, Beyond Belief #2 and Boutwell Time #9 R7, Eternal City #1 R8). The earlier private prescratch archive already scored these exact four as VERIFIED_UNRATED with the frozen neutral means and exact consumed-matrix parity. The existing nine-track staging is therefore eligible for the requested prescratch release, with no named rider invented and no changed input requiring a new model run. This disposition supersedes the earlier unconditional hold for these four specifically verified unassigned slots. Recheck upon official changes.

# Rail & Rye — Website Race Card Production Lock V1
Approved mobile baseline: selected-race underline commit b8915f17fa3a0695a6afc6a01eb1d293ed574f21; user-approved November 23, 2026. Current repository remains the UI authority; the baseline is a reference, not a command to roll back later authorized UI work.

## Single daily intake
- A dated TimeformUS ZIP is the prescratch trigger. Official scratch screenshots/change notices are the scratch-rerun trigger. The operator does not create or upload JSON, supply separate Equibase files, or perform GitHub releases.
- Inventory each track/race/program/horse from the actual source; preserve source hashes and complete identity joins. Verify class, named stakes, grade, surface, distance, post time and actual advertised purse (not claiming price). Use explicit source purse when available; otherwise independently verify official date/track/race entry pages. Unresolved facts remain HOLD; do not guess.
- Reuse the exact approved PDF production authorities and badge evaluator. Start at https://docs.google.com/document/d/1mf1hXT7UmJvNiuCVZjmALRgmt7YQOmLMn1kQKpdMvm8/edit ; resolve current root and verified source packages. PDF rendering remains a separate deliverable, not a prerequisite to a fresh website layout.
- Frozen TRI V4.1 + F4 V2; exact current approved trainer/jockey role resolver, 79-feature evidence, full field, receipt-verified probabilities, frozen finishing order and five-factor evaluator. No fallback math, invented statuses or renormalization-only scratch updates.
- One date/track race record feeds all website modules and PDF production. A dated repair overlay is not a reusable source for subsequent dates.

## Prescratch fast path
The trusted scorer produces the verified TRI/F4 source ZIP and approved badge-QA ZIP. From that same environment run:
```sh
python scripts/tri_dashboard_sync.py --zip "$VERIFIED_TRI_ZIP" --badge-source-zip "$BADGE_QA_ZIP" --publish
```
For validation only omit --publish; for no-write R2 preflight append --dry-run to --publish. Use existing scoped secret environment; never put private data or credentials in GitHub.
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
The website-side publisher and guardrails exist; the external scoring runtime still must be connected to the existing publisher automatically (both ZIPs available with scoped credentials), and its certified scratch-final upload must be wired and tested. This document and CI are not evidence that the external automation is complete. No new polling service required. Next qualification: one real full prescratch run and one real official scratch change end-to-end without a code commit.

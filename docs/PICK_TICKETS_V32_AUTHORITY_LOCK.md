# RAIL & RYE — PICK TICKETS MATHEMATICAL PRODUCTION LOCK

**Authority:** V3.2 SINGLE-TICKET TRI-ONLY, November 23, 2026

**Official source folder:** https://drive.google.com/drive/folders/1tcRg1IY7lPtLNpi0s4iioV-l8NijY_BP

**Original archive:** RAIL_RYE_PICK_ENGINE_V3_2_SINGLE_TICKET_CURRENT_20261123.zip

**Archive SHA-256:** `7c0365467e339099ae9432db22f175d73c6b3e6cd9b77821a73cdf6717d99c9e`

The source package is the mathematical authority, not earlier V3 research, V3.1 layered research, market model or the website's former Focused 0.60 heuristic.

## Frozen implementation

- One rectangular ticket per official sequence. All eligible current betting interests must be represented in the source, with unique stable program identifiers.
- Per leg, sort by descending exact certified TRI PWIN, using **lexicographic program name** to break ties. At each selectable prefix length, the coverage is the cumulative PWIN.
- For every attainable combination count, exact dynamic programming retains the prefix choices with maximum hit coverage, then drops dominated candidate points. No hard cost limit or arbitrary combinations cap.
- **One selected ticket maximizes `ln(H)-C/S` with `S=15.0 USD`.** S is a locked soft-cost preference, not a bankroll, payout, or profit estimate. Modifying it requires an explicit version change.
- Sequence model hit chance `H=Π(leg selected PWIN sums)`, conditional independence assumed. Combinations `N=Π(selected count per leg)`, cost `C=N × exact official denomination`.
- The source engine also computes the dividend hurdle `C/H` and each add/remove interest's marginal cost, hit-probability effect, and hurdle. **Do not display projected payouts, market ROI, guaranteed profit, or a public wager-value estimate.** Internal hurdle arithmetic is not a payout forecast.
- The runtime is `src/pick-tickets-v32.js` with exact Python-parity acceptance vectors from the unmodified Drive Python modules. `src/pick-tickets-auto.js` is the private-source adapter; it may not change the mathematical objective.
- Use the **same method and $15 scale** for both prescratch and postscratch. Do not reuse or renormalize stale prescratch PWIN, delete scratched runners to synthesize an updated ticket, or guess replacement jockey probabilities.
- Postscratch requires a fresh complete current-field TRI+F4 score, confirmed official scratch/activation manifest, matched before/after source hashes and precisely reconciled betting interests. Missing proof blocks that sequence, not the full model.
- A PASS/CONDITIONAL/PLAY classification is separate. No automatically green PLAY from this formula or from coverage alone. The private preview must not be mistaken for a customer-approved publication.
- Exactly one native Rail & Rye ticket displayed per official sequence. Existing saddlecloth artwork, Cloudflare Access/private R2, customer entitlements and purchasing infrastructure remain unchanged.

## Source provenance and acceptance tests

The original Python modules, unchanged, passed **30 of 30** included tests from `python -m unittest -v test_v3 test_v3_2` in the source archive.

File identities, from the original archive:
- `single_ticket_prescratch_postscratch.py`: `502e85033f2b5dd9d82ffa42e0177490e35adf255c617999d78a82b1e4c2f285`
- `tri_only_construct.py`: `4c8c26b05b0853ed022eb2bdf68c7e0b4ad9f7f02777729f22b9de71e74f31b7`
- `pick_ticket_engine.py`: `8699a7aa7a04ae4f1d92a6d60bce8e660c1d43d96412373926fd36e9c4abd112`
- `test_v3.py`: `f8f0e39869244b836fbcfdf740f0fee88215d652ae572e20f5c45b4ff7c34994`
- `test_v3_2.py`: `ca6d746daf869d0895b9092c8d02f1ec0c9385ac0507f0b854e6092d28e6a4e1`

The website tests are:
- `node test-pick-tickets-v32.mjs` — Python numerical parity, full frontier and $15 objective, post-scratch manifest gates
- `node test-pick-tickets-auto.mjs` — official 42-sequence menu, exact TRI PWIN/F4 inputs, single ticket per sequence and stage transitions
- `node test-pick-tickets.mjs` — private R2, formula-versioned editions, scratch integrity and admin auth
- `node test-pick-tickets-browser.mjs` — six responsive widths and module behavior.

**Actual 2026-11-23 source status:** The Drive V3.2 ZIP's 42-sequence audit itself states runner-level PWIN and source receipts are not included. It is not a verified current-field scoring release. Regeneration is allowed from independently certified private TRI score files and hash-matched official scratch manifests only, never from audit ticket selections. All source data must remain in protected R2, not public repo JSON.

## Future revisions

Keep V3.2 mathematical implementation unchanged until a new approved version is explicitly supplied by the owner. Profitability validation and model development belong to separate workstreams. Do not silently retune S or change the live website back to the V2 Focused strategy.

## Private V3.2 coverage comparison (not a formula change)

Ticket Insights in the Access-gated admin review offers a read-only diagnostic at cost scales $15, $20, $25, $30, and $40, calculated from the same exact V3.2 DP frontier and protected TRI scores. It displays combinations, complete-sequence hit probability, cost, and singles count. The **S=$15 ticket stays the sole approved selection**; comparisons do not create an alternate product or a claim about profitability.

Any decision to revise S requires explicit owner approval, new versioning and testing. No arbitrary minimum ticket cost, fixed combination count, or minimum horses per leg has been added.

# RAIL & RYE — CHIP SYSTEM AND SINGLE-RACE BET BUILDER
**Production UI contract · 2026-11-23**

## Chip hierarchy (mandatory across all four Hub modules)

### Horse saddle chips = source horse identities
- Reuse the **actual approved saddlecloth art** from `/assets/approved/saddlecloths/{1..20}.png`, preserving its native number/color, aspect ratio and dark edge. Never draw a colored imitation; a race tab explicitly uses that race number's actual approved saddlecloth artwork.
- Render horse chip before the name in Projections, Pick Tickets, Longshot Radar and Target List. Use `.rr-horse-chip` and `.rr-horse-chip__suffix`; for 1A, use #1 approved artwork plus a clear **A** suffix. For program numbers outside the available approved art, use a clearly identified navy fallback number—not an invented cloth/color.
- Use the same source program identity in selections, ticket combinations, saved ticket summaries and full-field cards. Do not silently remove leading zeroes or coupled-entry suffixes.

### Race chips = the SAME actual saddlecloth artwork used for horse numbers
- Owner-approved correction: race tabs and the race-number badge in the header use the **actual corresponding approved numbered saddlecloth** at `/assets/approved/saddlecloths/<race-number>.png`, not branded navy/gold CSS replicas. Race 1 uses the #1 saddlecloth graphic, Race 10 uses the #10 saddlecloth graphic, etc.
- The **active race** has a subtle outside gold focus ring **without recoloring** the approved saddlecloth chip. Do not add a second numeric label or a stacked `RACE` caption inside the graphic; its number is already part of the artwork. Accessible labels remain `Race N · <post time>` on tabs and `Race N` in the race header.
- Remove or override obsolete `.rr-race-chip`/legacy `.rr-dash-race-number` CSS that creates thick gold/gray double borders, extra shadow plaques or squashes two-digit labels. Use `.rr-race-saddle-tab`, `.rr-race-saddle-header` and `.rr-race-saddle-image` for the current implementation.
- This is **racing-themed navigation**, not horse identity. Its function remains selecting that race; the tab and header number simply share the same visual saddlecloth source that customers already know from horse rows.
- The race navigation order remains true post-time order and a valid 44px+ phone touch target. If a program-number image is not part of the approved art (outside #1–20), use a clearly identified accessible fallback, not fabricated colors.
- Bet Builder selections still always show the same approved saddlecloth program numbers and native coupled suffixes.

### Track identity in headers — approved real artwork restored
- Keep the Rail & Rye horseshoe and the full track name and race date.
- Display **the existing approved authentic venue logo** when the venue has a source file: `/assets/approved/track-logos/finger-lakes.webp`, `mahoning-valley.webp`, `mountaineer.webp`, `parx-racing.webp` and `zia-park.webp`. Do not replace real track logos with fabricated venue initials or the interim R&R `RACECOURSE` monogram.
- Present the complete logo in a consistent, unobtrusive ivory area with `object-fit: contain` and `mix-blend-mode: multiply` to reduce source white rectangular backgrounds. Never clip or distort official branding; no large generic frames or thick borders.
- For an unrecognized venue with no approved logo, display the Rail & Rye horseshoe and full track name/date only. Never borrow another track's image.
- Race-header saddlecloth chips retain their actual approved PNG art. Some PNG color/lettering pixels are transparent, so the race-header version **must** have an ivory underlay matching the navigation chips, not dark navy shining through its transparent text.
- Long stakes race names are full, sponsor-free and **balanced at natural word boundaries**. The title gets its own grid row; runner count, purse, source-status and post time receive distinct rows in the mobile layout. No truncated names or orphaned fragments.

## Bet Builder identity and location

- Bet Builder is a **single-race research extension inside Projections**, NOT a fifth intelligence module and NOT the multi-race Pick Tickets product.
- Entry point: a single `Build Exotic Ticket` button beside `WIN PROJECTIONS` for the **currently selected race**. It opens a full-height mobile drawer / compact desktop dialog. No links to an external wagering service and no bet placement.
- Every horse selection uses the actual approved saddlecloth chip, full source horse name, native program number and current scratch eligibility. Do not create new colors or numbers. A clicked horse is highlighted independently of its saddlecloth color.
- Begin with **Exacta** and **Trifecta**, allowing **Straight, Box, 1st-Place Key, Part-Wheel**. The customer explicitly selects the positions (1st, 2nd, 3rd); a runner cannot occupy two places in one combination.
- An exacta key is one first-place runner over one or more second-place runners. Trifecta keys and part-wheels allow independent place selections. A box includes every distinct ordered permutation of the selected horses. A `$0.50 / $1 / $2 / $5` base chooser controls ticket-cost calculations; track minimum wager rules may vary and are not certified by the UI.
- The UI automatically expands combinations, deduplicates them, removes impossible repeated-horse combinations and calculates **combination count × selected stake**. It never suggests tickets from invented forecasts.
- Changing race resets selections; a revised scratch card must be treated as a new model snapshot.

## Proprietary F4 probability contract — do not infer from runner marginals

The November 23 source-backed F4 V2 ordered exacta/trifecta probabilities have now been published to the **private R2** bucket. The model uses the already-certified conditional P2 and P3+ coefficients independently reconstructed against **all 45 races, 367 horses and their original exacta/trifecta/superfecta prefixes**, with maximum absolute prefix reconstruction error less than 1e-15.

The currently deployed protected endpoints are:
- `GET /api/admin/projections-f4?date=YYYY-MM-DD&track=TRACK&race=N`: existing verified Cloudflare Access administrator authentication.
- `GET /api/membership/projections-f4?date=YYYY-MM-DD&track=TRACK&race=N`: existing member login, current-card eligibility and `PROJECTIONS_MEMBER_LAUNCH` gate (launch remains OFF).

The exact **private** single-race response is derived from a compact source-certified F4 V2 conditional law:

```json
{
  "f4": {
    "schema_version": 2,
    "model_id": "TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET",
    "status": "verified",
    "date": "YYYY-MM-DD",
    "track": "TRACK",
    "race_number": 1,
    "scratch_state": "PRESCRATCH",
    "receipt_sha256": "<64-character scorer receipt hash>",
    "prefix_sha256": "<64-character ordered-prefix SHA-256>",
    "source_sha256": "<64-character model-source SHA-256>",
    "programs": ["4", "2", "6"],
    "pwin": [0.4, 0.35, 0.25],
    "p2_weights": [1, 2, 3],
    "p3_weights": [3, 2, 1]
  }
}
```

This is **schema illustration only, not the current real model scores**. The signed model source is not embedded in publicly accessible code or documents. The actual verified coefficients for the selected date/track/race are only delivered through the authenticated private R2-backed API, which crosschecks the current source and badge hashes, unchanged runner roster, prescratch state and F4 P1/P2/P3 marginals.

For an exacta `A-B`: `P(A,B) = P1(A) × W2(B) / sum(W2 of runners except A)`. For a trifecta `A-B-C`, multiply the exacta probability by `W3(C) / sum(W3 of runners except A and B)`. These are the **existing frozen F4 V2 ordered-prefix probabilities**, not independent PWIN products or new ratings. Any mismatched current race, missing receipt or changed scratches fails closed.

Builder behavior:
- **Model unavailable or mismatched**: show only verified ticket combinations and ticket cost. Clearly say matching joint F4 probabilities are not published for this current race. Do not display placeholder hit chances, fake fair payoffs, recommendation badges or a ROI claim.
- **Model verified**: `P(ticket hits) = sum of exact ordered F4 probabilities for each distinct combination`. The builder displays **Projected hit chance** and **Required gross payout to break even**, rounded up to whole cents. For a single $1 combination, the fair *gross* payout threshold is `1 / P(combo)`. For multi-combination tickets, an **equal-gross-payout** break-even illustration is `ticket cost / P(ticket hits)`, explicitly labeled with that assumption.
- Show per-combination F4 chance and individual fair gross payout when certified; actual exotic payouts differ per winning combination. Do NOT call a multi-combo ticket profitable unless true tote payout information for every relevant combo exists, which this product does not connect to.
- **Never confuse a complete key with 100% coverage**: if #4 is the only first-place selection and every other horse is selected for second, the exacta ticket hits if and only if #4 wins. Its aggregate hit chance must equal #4's exact frozen TRI PWIN. For the six-runner November 23 Finger Lakes illustration, a 31.41% key with five $1 combinations costs $5 and requires **$15.92 gross equal payout** to break even under our model; this is not a prediction of a tote payoff.
- **100% belongs only to complete finish-order coverage**: a full-field exacta box (N × (N−1) combinations) or full-field trifecta box (N × (N−1) × (N−2)) covers every modeled ordered result, so its hit chance is 100%. This does NOT imply positive return; the actual gross payout for the winning combo may be below the ticket cost. A partial ticket near 100% may display `>99.99%`, but must never round up to `100.00%`.
- **Empty ticket**: chance and fair payout remain unavailable rather than displaying 0.00% or dividing by zero. Per-combination fair gross prices and the multi-combination equal-payout assumption must stay clearly separated.
- **No tote integration**: customer consults live tote/pool data separately; no time/price feed, bookmaker service, wagering or guarantee of profit.
- Late scratches/changes: fail closed until an updated matching certified joint distribution is available; never reuse stale ordered prefixes.

## Bet Builder mobile readability and live feedback (locked)

- Show a clean, compact top bar with **Rail & Rye · Bet Builder**, source track/race/date and a visible Close action.
- Put the **certified F4 projected hit chance** and the **required break-even gross payout** in the largest number hierarchy, above horse-selection grids. Display cost and number of distinct combinations immediately beneath.
- Keep the decision summary sticky while the customer scrolls through long selection grids; preserve dialog scroll offset when selecting, clearing or changing the ticket. Never clear all user choices just from a redraw.
- Keep the source state explicit: Checking F4 / Verified F4 / F4 unavailable. A blank or incomplete ticket displays a dash for model-derived numbers until eligible picks are made; never invent a probability or payout.
- Always label the payout **gross**, not net profit. When more than one combination is selected, visibly state that the ticket-level break-even number assumes the **same gross payout for every covered winning combination**. Actual tote returns differ. Keep the full mathematical explanation under a user-openable disclosure.
- A full second-place key still needs the keyed horse to **win**; show that near the percent. Full-field 100% coverage must explicitly say **NOT guaranteed profit**.
- Horse-selection controls use approved saddlecloth images and a readable name. On phones present three columns where practical, with selected count, a working Clear action for each finishing-position bucket and 44px-or-larger controls; long horse names should wrap rather than disappear.
- Keep the conventional navy/ivory/gold Rail & Rye treatment without adding decorative badges. All descriptions, cost and probability values remain text-selectable, accessible and screen-reader meaningful.
- The test suite must verify the real screenshot's model calculation (31.41% hit chance, five $1 combinations, $5 ticket cost, $15.92 rounded-up equal-payout threshold) in the **rendered summary**, not only the calculator. It must also verify full boxes and prevent misleading rounded 100% claims.

## Quality gate
- Test 320, 360, 390, 430 and desktop width for 1–20 artwork, two-digit 11–20 legibility and coupled-entry suffixes.
- Test that selecting #4 over #2/#6 creates 2 exactas; a 3-horse exacta box creates 6 ordered combinations; a 4-horse trifecta box creates 24; a horse entered in more than one position never creates impossible repeated-horse tickets.
- Validate source F4 normalization, receipt and scratch matching server-side before any live probability display. Log that the builder never places bets, makes market claims or modifies frozen TRI/F4.
- Keep this shared contract available to Pick Tickets, Longshot Radar and Target List windows. Share the **chip language**, not their independent product scoring or access rules.

## November 23 verified production receipt

On 2026-11-23, encrypted one-time R2 transfer job `45125942622` completed with `TRI_F4_EXOTICS_PRIVATE_R2_SUCCESS`: all five track objects written, 45 races / 367 runners, original F4 P2/P3/P4 prefixes matched, complete read-back, temporary RSA private key deleted. The temporary encrypted transfer file and workflows were subsequently deleted from the public website repository. The permanent scorer integration (`scripts/tri_f4_exotics.py` and `scripts/tri_dashboard_sync.py`) remains for future source-certified model days.

## Permanent scratch-final Bet Builder availability contract — November 23, 2026

**Do not remove Projected Hit Chance or Break-Even Gross Payout from the Bet Builder.** Both remain prominent above the horse-selection grid for every certified race; a missing verified source must not be replaced with fabricated values.

- Prescratch release: only use a matching authenticated `PRESCRATCH` F4 ordered source and original live source/badge hashes.
- Scratch-final release: only use a matching authenticated `SCRATCH_FINAL` ordered source containing **identical** `tri_sha256`, `f4_sha256`, `prescratch_parent_sha256` and `official_changes_sha256` receipt hashes as the current private dashboard, and exact active roster, scratch count, PWIN, P2 and P3 marginals.
- **Publication order is mandatory: certified ordered F4 first, scratch-adjusted Projections second.** The dashboard batch publisher must preflight matching F4 for every race in each scratch-final card, and reject changes without a matching verified source. Re-uploading older prescratch cards must not silently downgrade a scratch-final release.
- The immutable scoring model is unchanged. Exacta/trifecta probabilities derive from certified frozen F4 conditional P2/P3 weights, **not independent products of runner win percentages**; hit chance is the sum over covered permutations, and the displayed break-even payout is a gross equal-winning-payout threshold.
- An all-second-place first-place key is **not** a 100% hit unless the first-place runner itself has a 100% win chance. Display 100% only for complete coverage of all ordered outcomes, with the explicit warning that profit is not assured.
- The continuous integration workflow `.github/workflows/verify-bet-builder-f4-live.yml` regression-tests source receipts, stale/missing F4 rejection, rendered ticket summary, current private R2 F4 snapshots, the protected model validator for every current scratch-final race, and the actual deployed Bet Builder assets.
- Completed November 23 recovery: **5 tracks, 45 races, 317 active runners, 50 scratches**. The sealed private R2 upload and per-track readbacks passed; the protected F4 endpoint validation passed 45/45 and current Cloudflare JavaScript assets matched the repository. Never ship public source files containing private model weights.


# RAIL & RYE — CHIP SYSTEM AND SINGLE-RACE BET BUILDER
**Production UI contract · 2026-11-23**

## Chip hierarchy (mandatory across all four Hub modules)

### Horse saddle chips = source horse identities
- Reuse the **actual approved saddlecloth art** from `/assets/approved/saddlecloths/{1..20}.png`, preserving its native number/color, aspect ratio and dark edge. Never draw a colored imitation or reuse a horse chip to represent a race number.
- Render horse chip before the name in Projections, Pick Tickets, Longshot Radar and Target List. Use `.rr-horse-chip` and `.rr-horse-chip__suffix`; for 1A, use #1 approved artwork plus a clear **A** suffix. For program numbers outside the available approved art, use a clearly identified navy fallback number—not an invented cloth/color.
- Use the same source program identity in selections, ticket combinations, saved ticket summaries and full-field cards. Do not silently remove leading zeroes or coupled-entry suffixes.

### Race chips = Rail & Rye branded navigation
- Use `.rr-race-chip rr-race-chip--tab` with gold edge/inset ring, navy face, ivory number and subtly rounded saddle-chip shape. The active chip uses the **gold face / navy number** treatment with an outer focus ring.
- Race chips are NEVER keyed to horse saddlecloth colors. They identify **Race 1–N**, not horses #1–N.
- The prominent small race-number plaque in the race header uses `.rr-race-chip rr-race-chip--header` with a tiny `RACE` label. No generic blue squares or extra decorative images.
- Tabs remain in **post-time order**, retaining race number as the accessible label; the active race is identified with `aria-current="true"`.
- Minimum 44x44px phone touch area, 18–21px numerals, no font/number clipping, high navy/gold contrast. Art and typography should look consistent across Hub products.

### Track identity in headers
- Keep the persistent approved Rail & Rye horseshoe at `/assets/brand/rail_rye_logo_header.png`.
- Show existing approved track art where available at `/assets/approved/track-logos/<slug>.webp` (Finger Lakes, Mountaineer, Mahoning Valley, Parx Racing and Zia Park). Use `object-fit:contain`; never crop, stretch or replace with fabricated track logos.
- Always keep the track name, date, race number and verified post time legible on phones.

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
- **Model verified**: `P(ticket hits) = sum of exact ordered F4 probabilities for each distinct combination`. The builder displays **Projected hit chance** and **Minimum break-even gross payout**, rounded up to whole cents. For a single $1 combination, the fair *gross* payout threshold is `1 / P(combo)`. For multi-combination tickets, an **equal-gross-payout** break-even illustration is `ticket cost / P(ticket hits)`, explicitly labeled with that assumption.
- Show per-combination F4 chance and individual fair gross payout when certified; actual exotic payouts differ per winning combination. Do NOT call a multi-combo ticket profitable unless true tote payout information for every relevant combo exists, which this product does not connect to.
- **No tote integration**: customer consults live tote/pool data separately; no time/price feed, bookmaker service, wagering or guarantee of profit.
- Late scratches/changes: fail closed until an updated matching certified joint distribution is available; never reuse stale ordered prefixes.

## Quality gate
- Test 320, 360, 390, 430 and desktop width for 1–20 artwork, two-digit 11–20 legibility and coupled-entry suffixes.
- Test that selecting #4 over #2/#6 creates 2 exactas; a 3-horse exacta box creates 6 ordered combinations; a 4-horse trifecta box creates 24; a horse entered in more than one position never creates impossible repeated-horse tickets.
- Validate source F4 normalization, receipt and scratch matching server-side before any live probability display. Log that the builder never places bets, makes market claims or modifies frozen TRI/F4.
- Keep this shared contract available to Pick Tickets, Longshot Radar and Target List windows. Share the **chip language**, not their independent product scoring or access rules.

## November 23 verified production receipt

On 2026-11-23, encrypted one-time R2 transfer job `45125942622` completed with `TRI_F4_EXOTICS_PRIVATE_R2_SUCCESS`: all five track objects written, 45 races / 367 runners, original F4 P2/P3/P4 prefixes matched, complete read-back, temporary RSA private key deleted. The temporary encrypted transfer file and workflows were subsequently deleted from the public website repository. The permanent scorer integration (`scripts/tri_f4_exotics.py` and `scripts/tri_dashboard_sync.py`) remains for future source-certified model days.

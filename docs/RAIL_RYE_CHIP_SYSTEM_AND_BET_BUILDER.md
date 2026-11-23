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

The currently deployed private November 23 Projections API has **per-runner F4 finish-position marginals** but does not yet expose verified **joint ordered exacta/trifecta prefix probabilities**. Marginals and PWIN cannot be multiplied to approximate an exotic ticket.

When the frozen F4 signer and server endpoint are integrated, the private race payload may provide:

```json
{
  "f4_ordered_probabilities": {
    "schema_version": 1,
    "model_id": "TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET",
    "status": "verified",
    "receipt_sha256": "<64-character hex digest>",
    "exacta": [{"programs": ["4", "2"], "probability": 0.0123}],
    "trifecta": [{"programs": ["4", "2", "6"], "probability": 0.00456}]
  }
}
```

The arrays above show **structure only**, not actual published model data. Production ingestion must validate SHA256 and matching date/track/race, complete live field, original ordered F4 receipt and scratch version, every unique permutation and probabilities summing to one before setting `status:"verified"`. Never expose proprietary outcome tables via publicly accessible assets, GitHub or an unprotected endpoint. Existing private API authorization/entitlement rules must continue to apply.

Builder behavior:
- **Model unavailable**: show only verified ticket combinations and ticket cost. Clearly say joint F4 probabilities are not yet published. Do not display placeholder hit chances, fake fair payoffs, recommendation badges or a ROI claim.
- **Model verified**: `P(ticket hits) = sum of exact ordered F4 probabilities for each distinct combination`. For a single $1 combination, the fair *gross* payout threshold is `1 / P(combo)`. For multi-combination tickets, an **equal-gross-payout** break-even illustration is `ticket cost / P(ticket hits)`, explicitly labeled with that assumption.
- Show per-combination F4 chance and individual fair gross payout when certified; actual exotic payouts differ per winning combination. Do NOT call a multi-combo ticket profitable unless true tote payout information for every relevant combo exists, which this product does not connect to.
- **No tote integration**: customer consults live tote/pool data separately; no time/price feed, bookmaker service, wagering or guarantee of profit.
- Late scratches/changes: fail closed until an updated matching certified joint distribution is available; never reuse stale ordered prefixes.

## Quality gate
- Test 320, 360, 390, 430 and desktop width for 1–20 artwork, two-digit 11–20 legibility and coupled-entry suffixes.
- Test that selecting #4 over #2/#6 creates 2 exactas; a 3-horse exacta box creates 6 ordered combinations; a 4-horse trifecta box creates 24; a horse entered in more than one position never creates impossible repeated-horse tickets.
- Validate source F4 normalization, receipt and scratch matching server-side before any live probability display. Log that the builder never places bets, makes market claims or modifies frozen TRI/F4.
- Keep this shared contract available to Pick Tickets, Longshot Radar and Target List windows. Share the **chip language**, not their independent product scoring or access rules.

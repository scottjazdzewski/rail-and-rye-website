# RAIL & RYE — V3.3 TRI-ONLY COVERAGE TRIAL

**Status:** Owner-authorized trial for the private Pick Tickets dashboard, November 23, 2026.

**Owner request:** Trial a higher cost threshold; cover at least 50% of each race's exact TRI win probability; every additional horse evaluated for opportunity cost. Retain one ticket per sequence and use the same method before and after scratches.

## Mathematical authority and provenance

This is a **versioned change**, not a covert rewrite of previously frozen V3.2. The original V3.2 source, $15 setting and engineering authority document remain untouched for historical comparison and rollback.

The new trial is **V3.3-TRI-ONLY-SINGLE-RECTANGLE-COVER50**, implemented in src/pick-tickets-v33.js.

- Soft cost-preference scale **S = $30.00**. This is NOT a $30 spending limit, fixed ticket price, or EV/profit estimate.
- Every race-leg selection must cover cumulative exact TRI PWIN of **at least 0.50**, enforced *inside* the feasible prefix generation before the exact DP frontier. This is per race, not a claim that a multi-leg ticket hits 50%.
- For each official sequence, exact dynamic programming compares all Pareto-efficient rectangular selections satisfying the 50% floor and selects one maximizing **ln(H) - ticket_cost_USD / 30**.
- H = product of selected cumulative race win-probability masses; combinations = product of chosen betting-interest counts; cost = official minimum wager times combinations. No public-market model, fixed combination count, odds/pool/payout projection, or forced number of singles.
- Every selected horse is audited in the private mathematical metadata: marginal additional complete-ticket combinations, marginal cost, marginal complete-sequence hit chance and score effect. Floor-required selections are tagged separately from discretionary coverage.
- **Important:** 50% per leg is not 50% overall. A Pick 6 with exactly 50% mass in every leg only covers 1.5625% of modeled six-race outcomes.
- The exact same formula applies to pre- and postscratch. The separate private source, official Equibase scratch ledger and verified current-field TRI/F4 scoring gates remain intact. A postscratch ticket is never synthesized by simply removing a scratched runner from prescratch picks.
- This is an owner-approved **trial**, not a demonstrated improvement in profitability. Validation against actual payouts and pools remains a separate workstream.

## Acceptance

The new test-pick-tickets-v33.mjs compares its exact DP result with exhaustive enumeration, checks the 50% rule, soft cost, stable ties and per-horse opportunity costs.

Existing tests for the official 42-sequence menu, current field integrity, authentic official scratch ledger, Cloudflare Access and six browser widths must continue to pass.

Historical V3.2 remains preserved with its own tests. A V3.2 ticket must not pass the V3.3 formula-version gate.

## Mandatory validation after EVERY field upload

This is an engineering gate, not explanatory language for the customer dashboard:

1. Receive the complete prescratch or postscratch field, preserve the exact horse-to-program mapping, all current TRI PWIN and F4 distributions, and the associated TRI/F4 scoring receipts. Never reuse a previously selected ticket or fill missing probabilities with estimates.
2. Validate date, track, complete race fields, exact PWIN sum and F4 agreement, all eligible interests, confirmed scratches and stage. Compute the SHA-256 of the normalized uploaded source.
3. Re-run the unchanged V3.3 exact optimizer for **every official sequence** at that date and track, including those whose visible picks appear unchanged. Check the 50% per-leg floor, selections, combination product, official wager denomination, ticket cost and full-sequence hit probability.
4. Compare each sequence to the preceding field revision, recording changed horses/races, selections, hit probability and cost. The new source SHA-256 must accompany the review. Old stored editions never outrank the latest field.
5. **HOLD ALL TICKETS FROM A CHANGED FIELD WITHOUT UPDATED TRI/F4 SCORING RECEIPTS.** A mathematical recalculation using stale scores cannot validate choices. A renamed or replaced betting interest, jockey/field/conditions change or probabilities changing with unchanged receipts constitutes a hold. No previous ticket can be served as a fallback. After fresh scoring evidence arrives, recalculate and reevaluate the current field. These are internal controls, not customer-facing warning banners.
6. Release to customers requires separate source certification and approval. Review-only mathematical outputs must remain within protected private R2 and Access; do not publish paid JSON in GitHub.

**Date/menu limitation (updated November 24):** The original 42-sequence November 23, 2026 menu remains frozen. November 24 has its own independently transcribed **50-sequence, six-track** official TimeformUS menu at `src/pick-tickets-menu-1124.js`, with the exact source archive SHA-256, all 51 races, and the verified wager denominations. Delta Downs joins Finger Lakes, Mahoning Valley, Mountaineer, Parx Racing and Zia Park. The original 11/23 counted fields/scratch ledger do not transfer to 11/24. Any other unsupported date or track returns `NO_VERIFIED_OFFICIAL_PICK_MENU_FOR_DATE_TRACK`; no prior-date wager menu or scores may be inherited.

**November 24 publication gate:** The `1124 TIMEFORM.zip` contains card fields and official sequence menus, **not certified TRI V4.1/F4 V2 per-runner PWIN/scorer receipts**. The private admin Pick Tickets endpoint only builds that date's V3.3 tickets from fresh, date-matched exact per-runner TRI/F4 private R2 Projections records, after full race/field reconciliation. A score-less card must remain a source intake/hold, not a synthetic or customer-facing Pick Ticket. November 24 exports remain private review; signed release gates/customer entitlements are unchanged. The old November 23 presets and certified receipt evidence must never fill gaps.

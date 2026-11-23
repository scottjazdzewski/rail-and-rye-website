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

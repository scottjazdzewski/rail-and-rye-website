# Pick Tickets V3.4 — length-sensitive trial A

**Status:** reversible private admin research trial. V3.3 remains the default baseline and the frozen production release gates are unchanged.

## Trial design
- Use identical, current-field audited TRI V4.1/F4 V2 inputs and the official minimum wager for each sequence.
- One rectangular ticket. Enumerate the exact Pareto frontier of ranked probability prefixes, with no universal per-leg probability floor.
- Select the maximum of ln(H) - cost_USD/S, where H is the product of selected race probability masses.
- Candidate cost preference S: Pick 3 $15, Pick 4 $30, Pick 5 $60, Pick 6 $120. These are hypothesis parameters, not budgets or optimal profitability claims. No target combinations, forced singles, forced spreads, or race-level fixed selection counts.
- Race concentration is reflected in the full rank probability distribution and the marginal added hit probability/cost. The trial does not independently estimate tote value or payouts, or claim an objective advantage from excluding a higher-ranked horse.
- Comparison with V3.3 on the exact same field includes selections, combination count, denomination, cost, projected hit rate, selected leg mass and marginal costs. The current website retains the existing visual identity, with a version identifier for this private trial.

## Operational route
- /admin/pick-tickets-preview/?trial=v34 requests the protected GET /api/admin/pick-tickets?trial=v34.
- V3.3 remains available on the unmodified URL. The trial requires both scorer receipt hashes and an existing V3.3 review that passed the current-field freshness gate.
- November 24 only. Any future date or scratch transition requires the date-specific source and scratch-final gate to be operational before trial data are exposed; no fallback to an older roster.
- Never commit paid probability vectors or selected tickets to the public repository. The private verification workflow reads R2 and emits aggregate summary only.

## Acceptance
Exhaustive independent enumeration for 3–6 legs; identical source hashes and fields; exact ticket arithmetic; all 50 November 24 sequences. Compare historical chronological holdout hit rates, cost per hit, forecast calibration, and stability across track/field/denomination. Real payout profitability requires actual official payouts and menus. Until then this is an experiment, not customer certification.

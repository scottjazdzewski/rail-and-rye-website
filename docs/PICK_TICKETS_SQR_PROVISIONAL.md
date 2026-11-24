# Sequence Quality Rating — SQR 1.0 provisional
Owner approved 2026-11-24 for immediate trial use, historical testing deferred. Separate from frozen V3.4 optimizer. Each complete verified sequence always has its one ticket and builder regardless of label. Recalculate rating from fresh complete fields on each valid score revision. Never promote stale data or bypass existing customer publication gates.

Weighted components on 0–100 scale:
- Predictability 25%: mean top-two probability separation, full credit at 25 percentage points.
- Efficiency 25%: 100 * reference / (reference + modeled cost per hit). Reference by wager length, fixed from Nov 24 verified V3.4 aggregate mean cost / mean modeled hit: 3 $9.5192 / .2598; 4 $19.2308 / .156; 5 $37 / .0828; 6 $72 / .094 (only one Pick 6; provisional).
- Difficulty 20%: geometric mean top-three cumulative field probability, expressed as percentage; higher means easier.
- Single opportunity 15%: strongest top horse probability relative to 55%, capped at 100; does not force a single.
- Historical performance 15%: neutral 50 pending comparable verified historical calibration. Explicit placeholder, not a claimed historical result.

PLAY >=75; CONDITIONAL >=50 and <75; PASS <50. Continuous unrounded score. These component mappings/reference levels are engineering choices for the approved provisional trial, not validated thresholds. No odds/pool/payout projections, no profit claims. Do not use label as a ticket visibility gate. Audit scores and component details remain internal. Historical testing should examine per-length classifications, calibration, cost per hit, and realized payouts only where actual official sequence and dividend data exist. No automatic retuning without owner approval.

# Sequence Quality Rating — SQR 1.1 provisional
Owner approved 2026-11-24 for immediate trial use, historical testing deferred. Separate from frozen V3.4 optimizer. Each complete verified sequence always has its one ticket and builder regardless of label. Recalculate rating from fresh complete fields on each valid score revision. Never promote stale data or bypass existing customer publication gates.

Owner revision: historical performance removed from the calculation pending calibration. The other four relative weights are unchanged, normalized by 85 to total 100%. Classification thresholds remain unchanged for this isolated trial.

Weighted components on 0–100 scale:
- Predictability 25/85 (29.4118%): mean top-two probability separation, full credit at 25 percentage points.
- Efficiency 25/85 (29.4118%): 100 * reference / (reference + modeled cost per hit). Reference by wager length, fixed from Nov 24 verified V3.4 aggregate mean cost / mean modeled hit: 3 $9.5192 / .2598; 4 $19.2308 / .156; 5 $37 / .0828; 6 $72 / .094 (only one Pick 6; provisional).
- Difficulty 20/85 (23.5294%): geometric mean top-three cumulative field probability, expressed as percentage; higher means easier.
- Single opportunity 15/85 (17.6471%): strongest top horse probability relative to 55%, capped at 100; does not force a single.
- Historical performance: excluded entirely; no placeholder score or weight. Reintroduce only after calibration and owner approval.

PLAY >=75; CONDITIONAL >=50 and <75; PASS <50. Continuous unrounded score. These component mappings/reference levels are engineering choices for the approved provisional trial, not validated thresholds. No odds/pool/payout projections, no profit claims. Do not use label as a ticket visibility gate. Audit scores and component details remain internal. Historical testing should examine per-length classifications, calibration, cost per hit, and realized payouts only where actual official sequence and dividend data exist. No automatic retuning without owner approval.

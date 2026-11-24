// Provisional owner-approved SQR 1.1. Classification only; never alter
// V3.4 picks, probabilities, costs, eligibility or customer release gates.
import {normalizeV32Legs} from "./pick-tickets-v32.js";
export const SQR_VERSION="SQR-1.1-PROVISIONAL";
// Redistribute the removed 15% proportionally; preserve all four relative weights.
export const SQR_WEIGHTS=Object.freeze({predictability:25/85,efficiency:25/85,difficulty:20/85,single_opportunity:15/85});
export const SQR_THRESHOLDS=Object.freeze({play:75,conditional:50});
// Frozen reference from the Nov 24 V3.4 verified aggregate comparison
// (mean cost USD / mean modeled hit probability), not historical payouts.
export const SQR_REFERENCE=Object.freeze({
 3:9.5192/.2598,4:19.2308/.156,5:37/.0828,6:72/.094
});
const clamp=x=>Math.max(0,Math.min(100,x));
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
export function classifySQR(score){
 if(!Number.isFinite(score)||score<0||score>100)throw Error("Invalid SQR score");
 return score>=SQR_THRESHOLDS.play?"PLAY":score>=SQR_THRESHOLDS.conditional?"CONDITIONAL":"PASS";
}
export function sequenceQuality(inputLegs,ticket){
 const legs=normalizeV32Legs(inputLegs),n=legs.length;
 const reference=SQR_REFERENCE[n];
 if(!reference||!Number.isFinite(ticket.hit_probability)||ticket.hit_probability<=0||
    ticket.hit_probability>1+1e-8||!Number.isSafeInteger(ticket.total_cents)||ticket.total_cents<=0)
  throw Error("Invalid SQR ticket inputs");
 const ranked=legs.map(l=>l.entries.map(e=>e.pwin).sort((a,b)=>b-a));
 // 25-point favorite/runner-up separation = full predictability credit.
 const predictability=mean(ranked.map(p=>clamp(100*(p[0]-(p[1]||0))/.25)));
 // Compare modeled cost-per-hit with the same wager length's frozen
 // provisional reference; 50 at parity. No dividend/ROI prediction.
 const hurdle=ticket.total_cents/100/ticket.hit_probability;
 const efficiency=100*reference/(reference+hurdle);
 // A leg is less difficult when its top three capture more of the field.
 // Geometric aggregation penalizes weak legs without raw hit-rate bias by length.
 const difficulty=clamp(100*Math.exp(mean(ranked.map(p=>Math.log(p.slice(0,3).reduce((a,b)=>a+b,0))))));
 // Best anchor opportunity: 55% or greater earns full credit.
 const single_opportunity=clamp(100*Math.max(...ranked.map(p=>p[0]))/.55);
 // Historical performance is excluded entirely until verified calibration.
 const components={predictability,efficiency,difficulty,single_opportunity};
 const raw=Object.keys(SQR_WEIGHTS).reduce((sum,k)=>sum+SQR_WEIGHTS[k]*components[k],0);
 const score=clamp(raw);
 return {version:SQR_VERSION,score,classification:classifySQR(score),components,
  historical_status:"EXCLUDED_PENDING_CALIBRATION",
  reference_status:"NOV24_MODELED_AGGREGATE_PROVISIONAL",
  validated_profitability:false};
}

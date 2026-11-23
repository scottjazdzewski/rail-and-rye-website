/**
 * READ-ONLY ENGINEERING DIAGNOSTIC for the protected Pick Tickets reviewer.
 * Never changes, replaces, modifies, or exports the frozen V3.2 production
 * selector. S=15 is the only approved live parameter. Other S values are
 * scenarios for evaluation, never recommended or customer-published tickets.
 *
 * All candidates come directly from exactV32Frontier; no speculative horses,
 * payouts, public market estimates, or extra user-visible ticket options.
 */
import {exactV32Frontier,chooseV32,PICK_V32_COST_SCALE_DOLLARS}
 from "./pick-tickets-v32.js";
export const V32_DIAGNOSTIC_SCALES=Object.freeze([15,20,25,30,40]);

export function auditV32CostPreference(legs,unitCents){
 const frontier=exactV32Frontier(legs,unitCents);
 const rows=[];
 for(const scale of V32_DIAGNOSTIC_SCALES){
  let chosen=null,best=-Infinity;
  for(const candidate of frontier){
   const score=candidate.hit_probability>0?
    Math.log(candidate.hit_probability)-(candidate.total_cents/100)/scale:-Infinity;
   // Match the V3.2 Python implementation's strict score and tie behavior.
   if(chosen===null||score>best||
     (score===best&&candidate.total_cents<chosen.total_cents)){
    chosen=candidate;best=score;
   }
  }
  if(!chosen)throw Error("EMPTY_V32_SENSITIVITY_FRONTIER");
  rows.push({
   scale_dollars:scale,
   current_approved:scale===PICK_V32_COST_SCALE_DOLLARS,
   combinations:chosen.combinations,total_cents:chosen.total_cents,
   hit_probability:chosen.hit_probability,
   hit_rate_display:(chosen.hit_probability*100).toFixed(1)+"%",
   singles:chosen.picks.filter(p=>p.length===1).length,
   runners_by_leg:chosen.picks.map(p=>p.length)
  });
 }
 // Production selection must match the exact approved S=15 output.
 const official=chooseV32(legs,unitCents,{includeMarginals:false});
 const current=rows.find(r=>r.current_approved);
 if(!current||current.combinations!==official.combinations||
    current.total_cents!==official.total_cents||
    Math.abs(current.hit_probability-official.hit_probability)>1e-12)
  throw Error("V32_SENSITIVITY_DIVERGED_FROM_LOCKED_PRODUCTION");
 return rows;
}

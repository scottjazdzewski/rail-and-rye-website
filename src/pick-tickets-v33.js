/**
 * Rail & Rye Pick Tickets — VERSIONED V3.3 TRIAL.
 *
 * Source mathematics: V3.2 TRI-only single rectangular ticket, exact
 * combination-count dynamic programming, ranked PWIN prefixes, and score
 *   ln(complete-sequence TRI hit probability) - ticket_cost_USD / S.
 *
 * Owner-authorized trial changes (2026-11-23):
 *   S = $30.00 (was $15.00);
 *   Every leg must cover >=50% of its complete TRI win-probability mass.
 *
 * The 50% condition is enforced INSIDE the exact frontier. It is not an
 * after-the-fact runner insertion, minimum combo target, ROI estimate or
 * invitation to use a public-market model. The historical V3.2 remains
 * unchanged in its own source module.
 */
import {normalizeV32Legs} from "./pick-tickets-v32.js";

export const PICK_V33_ENGINE="V3.3-TRI-ONLY-SINGLE-RECTANGLE-COVER50";
export const PICK_V33_COST_SCALE_DOLLARS=30.0;
export const PICK_V33_MIN_LEG_COVERAGE=0.50;

const fail=message=>{throw Error(message)};
function comparePicks(a,b){
 for(let i=0;i<Math.min(a.length,b.length);i++){
  for(let j=0;j<Math.min(a[i].length,b[i].length);j++){
   if(a[i][j]!==b[i][j])return a[i][j]<b[i][j]?-1:1;
  }
  if(a[i].length!==b[i].length)return a[i].length-b[i].length;
 }
 return a.length-b.length;
}
function validate(legs,unitCents){
 if(!Number.isSafeInteger(unitCents)||unitCents<=0)fail("INVALID_DENOMINATION");
 if(!Array.isArray(legs)||!legs.length)fail("MISSING_LEGS");
 const sorted=normalizeV32Legs(legs);
 for(let i=0;i<sorted.length;i++){
  if(sorted[i].race_number!==legs[i].race_number||
     i>0&&sorted[i].race_number!==sorted[i-1].race_number+1)
   fail("BAD_RACE_ORDER");
 }
 return sorted;
}
function rankedLegOptions(leg,minMass=PICK_V33_MIN_LEG_COVERAGE){
 const ranked=[...leg.entries].sort((a,b)=>b.pwin-a.pwin||
  (a.program<b.program?-1:a.program>b.program?1:0));
 const options=[];let mass=0,minimumCount=0;
 for(let i=0;i<ranked.length;i++){
  mass+=ranked[i].pwin;
  // Prefix choices below the coverage floor are INFEASIBLE, not dominated.
  if(mass+1e-12<minMass)continue;
  if(!minimumCount)minimumCount=i+1;
  options.push({k:i+1,mass,picks:ranked.slice(0,i+1).map(x=>x.program)});
 }
 if(!options.length)fail("MIN_LEG_COVERAGE_UNREACHABLE");
 return {ranked,options,minimumCount};
}
function ticketMetrics(legs,picks,unitCents){
 let combos=1,hit=1;
 const coverages=[];
 for(let i=0;i<legs.length;i++){
  const programs=picks[i];
  if(!Array.isArray(programs)||!programs.length)fail("EMPTY_SELECTION");
  const byProgram=new Map(legs[i].entries.map(r=>[r.program,r.pwin]));
  let mass=0;
  for(const p of programs){
   if(!byProgram.has(p))fail("RUNNER_NOT_IN_FIELD");
   mass+=byProgram.get(p);
  }
  if(mass+1e-12<PICK_V33_MIN_LEG_COVERAGE)fail("MINIMUM_LEG_COVERAGE_VIOLATED");
  coverages.push(mass);
  combos*=programs.length;
  hit*=mass;
  if(!Number.isSafeInteger(combos))fail("UNSAFE_COMBINATION_COUNT");
 }
 const cents=combos*unitCents;
 if(!Number.isSafeInteger(cents))fail("UNSAFE_TICKET_COST");
 return {combinations:combos,total_cents:cents,hit_probability:hit,leg_coverage:coverages,
  break_even_average_winning_dividend:hit>0?cents/100/hit:null};
}
export function exactV33Frontier(inputLegs,unitCents){
 const legs=validate(inputLegs,unitCents);
 const options=legs.map(l=>rankedLegOptions(l).options);
 let dp=new Map([[1,{hit:1,picks:[]}]]);
 for(const candidates of options){
  const next=new Map();
  for(const [priorN,prior] of dp){
   for(const choice of candidates){
    const n=priorN*choice.k;
    if(!Number.isSafeInteger(n))fail("UNSAFE_COMBINATION_COUNT");
    const hit=prior.hit*choice.mass,picks=[...prior.picks,choice.picks];
    const old=next.get(n);
    if(!old||hit>old.hit+1e-14||
     (Math.abs(hit-old.hit)<=1e-14&&comparePicks(picks,old.picks)<0))
      next.set(n,{hit,picks});
   }
  }
  dp=next;
  if(!dp.size)fail("EMPTY_COVERAGE_FRONTIER");
 }
 let bestMass=-1;
 const efficient=[];
 for(const [n,item] of [...dp.entries()].sort((a,b)=>a[0]-b[0])){
  const evaluated=ticketMetrics(legs,item.picks,unitCents);
  if(evaluated.combinations!==n||
     Math.abs(evaluated.hit_probability-item.hit)>1e-8)
   fail("FRONTIER_EVALUATION_MISMATCH");
  if(evaluated.hit_probability>bestMass+1e-12){
   efficient.push({...evaluated,picks:item.picks});
   bestMass=evaluated.hit_probability;
  }
 }
 return efficient;
}
/** The extra horses are assessed against the opportunity cost in FULL
 * ticket combinations and net gain under the selected cost/hit objective.
 * A runner needed for the 50% floor is labeled required, not "profitable".
 */
function opportunityCostAudit(legs,picks,unitCents){
 const all=ticketMetrics(legs,picks,unitCents);
 const rows=[];
 for(let i=0;i<legs.length;i++){
  const {ranked,minimumCount}=rankedLegOptions(legs[i]);
  const selected=picks[i],otherCombos=all.combinations/selected.length;
  const byProgram=new Map(ranked.map(r=>[r.program,r.pwin]));
  const otherMass=all.leg_coverage.reduce((p,m,j)=>i===j?p:p*m,1);
  let cumulative=0;
  for(let j=0;j<selected.length;j++){
   const p=byProgram.get(selected[j]),before=cumulative,after=before+p;
   cumulative=after;
   const incrementalCents=otherCombos*unitCents;
   const deltaHit=p*otherMass;
   rows.push({
    race_number:legs[i].race_number,
    program:selected[j],
    status:j<minimumCount?"COVERAGE_FLOOR_REQUIRED":"ADDITIONAL_COVERAGE",
    leg_coverage_before:before,
    leg_coverage_after:after,
    additional_combinations:otherCombos,
    additional_cost_cents:incrementalCents,
    additional_sequence_hit_probability:deltaHit,
    additional_objective_score:before>0?
     Math.log(after/before)-(incrementalCents/100)/PICK_V33_COST_SCALE_DOLLARS:null,
    marginal_dividend_hurdle:deltaHit>0?(incrementalCents/100)/deltaHit:null
   });
  }
 }
 return rows;
}
export function chooseV33(inputLegs,unitCents,{includeMarginals=true}={}){
 const legs=validate(inputLegs,unitCents);
 const frontier=exactV33Frontier(legs,unitCents);
 let best=null,bestScore=-Infinity;
 for(const c of frontier){
  const score=c.hit_probability>0?
   Math.log(c.hit_probability)-(c.total_cents/100)/PICK_V33_COST_SCALE_DOLLARS:-Infinity;
  // Match original V3.2 Python ordering: ties prefer lower exact cost.
  if(best===null||score>bestScore||
     (score===bestScore&&c.total_cents<best.total_cents)){
    best=c;bestScore=score;
  }
 }
 if(!best)fail("NO_VALID_TICKET");
 return {
  engine:PICK_V33_ENGINE,
  selection_mode:"SINGLE_RECTANGULAR_TICKET",
  selection_objective:"ARGMAX(log(H)-C/S) SUBJECT_TO_EACH_LEG_COVERAGE_GE_50_PERCENT",
  soft_cost_scale_dollars:PICK_V33_COST_SCALE_DOLLARS,
  minimum_leg_coverage:PICK_V33_MIN_LEG_COVERAGE,
  combinations:best.combinations,total_cents:best.total_cents,
  hit_probability:best.hit_probability,leg_coverage:best.leg_coverage,
  picks:best.picks,frontier_points:frontier.length,
  break_even_average_winning_dividend:best.break_even_average_winning_dividend,
  marginal_opportunity_cost:includeMarginals?opportunityCostAudit(legs,best.picks,unitCents):[],
  expected_value:null,projected_return:null,play_status:null,
  qualified_for_publication:false
 };
}

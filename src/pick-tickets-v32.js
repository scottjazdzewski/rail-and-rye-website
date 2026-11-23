/**
 * Rail & Rye Pick Tickets — V3.2 SINGLE-TICKET TRI-ONLY.
 * Source authority: 00_CURRENT — PICK TICKET FORMULA V3.2 — ONE TICKET PRE + POST SCRATCH
 * Original: tri_only_construct.py / choose_with_soft_cost / exact_coverage_frontier
 * Frozen parameter: $15 soft-cost scale, NOT a hard cap, price model or ROI claim.
 * Pure computation. Upstream authenticity and official scratch manifest are separate gates.
 * Phase 2 layered/multiple-slip and earlier V3.1 research are not implemented.
 */
export const PICK_V32_ENGINE="V3.2-TRI-ONLY-SINGLE-RECTANGLE";
export const PICK_V32_COST_SCALE_DOLLARS=15.0;
const FAIL=code=>{throw Error(code)};
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const EPS=1e-9;
const samePicks=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const comparePicks=(a,b)=>{
 // Python tuple of tuple of program strings compares lexicographically.
 for(let i=0;i<Math.min(a.length,b.length);i++){
  for(let j=0;j<Math.min(a[i].length,b[i].length);j++){
   if(a[i][j]!==b[i][j])return a[i][j]<b[i][j]?-1:1;
  }
  if(a[i].length!==b[i].length)return a[i].length-b[i].length;
 }
 return a.length-b.length;
};
export function normalizeV32Legs(legs){
 if(!Array.isArray(legs)||!legs.length)FAIL("MISSING_SEQUENCE_ID_OR_LEGS");
 const seenRaces=new Set();
 return legs.map(leg=>{
  if(!Number.isSafeInteger(leg.race_number)||seenRaces.has(leg.race_number))FAIL("BAD_RACE_ORDER");
  seenRaces.add(leg.race_number);
  const raw=leg.entries;
  if(!Array.isArray(raw)||!raw.length)FAIL("EMPTY_RACE");
  const seen=new Set();
  const entries=raw.map(row=>{
   const program=String(row.program_number??row.program??"").trim();
   if(!program||seen.has(program))FAIL("COUPLED_OR_DUPLICATE_INTERESTS_UNRESOLVED");
   seen.add(program);
   // Accept exact upstream PWIN on the original 0..1 scale ONLY.
   const pwin=row.pwin;
   if(!finite(pwin)||pwin<0||pwin>1)FAIL("INVALID_PWIN");
   return {program,pwin};
  });
  if(Math.abs(entries.reduce((s,x)=>s+x.pwin,0)-1)>1e-5)FAIL("RACE_PROBABILITIES_NOT_NORMALIZED");
  return {race_number:leg.race_number,entries};
 }).sort((a,b)=>a.race_number-b.race_number);
}
function validateV32(legs,unitCents,scale){
 if(!Number.isSafeInteger(unitCents)||unitCents<=0)FAIL("INVALID_DENOMINATION");
 if(!finite(scale)||scale<=0)FAIL("INVALID_COST_SCALE");
 const sorted=normalizeV32Legs(legs);
 if(sorted.length!==legs.length||sorted.some((l,i)=>l.race_number!==legs[i].race_number))
  FAIL("BAD_RACE_ORDER");
 for(let i=1;i<sorted.length;i++)if(sorted[i].race_number!==sorted[i-1].race_number+1)FAIL("MISSING_LEG");
 return sorted;
}
function evalPicks(legs,picks,unitCents){
 let count=1,hit=1;
 for(let i=0;i<legs.length;i++){
  if(!picks[i]?.length||new Set(picks[i]).size!==picks[i].length)FAIL("EMPTY_OR_DUPLICATE_SELECTIONS");
  const byProgram=new Map(legs[i].entries.map(r=>[r.program,r.pwin]));
  let mass=0;
  for(const p of picks[i]){if(!byProgram.has(p))FAIL("HORSE_NOT_IN_CURRENT_FIELD");mass+=byProgram.get(p)}
  count*=picks[i].length;hit*=mass;
  if(!Number.isSafeInteger(count))FAIL("UNSAFE_COMBINATION_COUNT");
 }
 const totalCents=count*unitCents;
 if(!Number.isSafeInteger(totalCents))FAIL("UNSAFE_TICKET_COST");
 return {combinations:count,total_cents:totalCents,hit_probability:hit,
  // V3.2 requires this arithmetic internally; the customer UI must omit it.
  break_even_average_winning_dividend:hit>0?totalCents/100/hit:null};
}
export function exactV32Frontier(inputLegs,unitCents){
 const legs=validateV32(inputLegs,unitCents,PICK_V32_COST_SCALE_DOLLARS);
 let dp=new Map([[1,{hit:1,picks:[]}]]);
 for(const leg of legs){
  const ranked=[...leg.entries].sort((a,b)=>b.pwin-a.pwin||
   (a.program<b.program?-1:a.program>b.program?1:0));
  const options=[];let mass=0;
  for(let i=0;i<ranked.length;i++){
   mass+=ranked[i].pwin;
   options.push({k:i+1,mass,picks:ranked.slice(0,i+1).map(x=>x.program)});
  }
  const next=new Map();
  for(const [priorN,prior] of dp){
   for(const option of options){
    const n=priorN*option.k;
    if(!Number.isSafeInteger(n))FAIL("UNSAFE_COMBINATION_COUNT");
    const hit=prior.hit*option.mass,picks=[...prior.picks,option.picks];
    const old=next.get(n);
    if(!old||hit>old.hit+1e-14||
     (Math.abs(hit-old.hit)<=1e-14&&comparePicks(picks,old.picks)<0))
      next.set(n,{hit,picks});
   }
  }
  dp=next;
 }
 let maxHit=-1;
 const out=[];
 for(const [n,item] of [...dp.entries()].sort((a,b)=>a[0]-b[0])){
  const evaluated=evalPicks(legs,item.picks,unitCents);
  if(Math.abs(evaluated.hit_probability-item.hit)>1e-8||evaluated.combinations!==n)
   FAIL("FRONTIER_EVALUATION_MISMATCH");
  if(evaluated.hit_probability>maxHit+1e-12){
   out.push({...evaluated,picks:item.picks,leg_coverage:legs.map((l,i)=>{
    const byId=new Map(l.entries.map(r=>[r.program,r.pwin]));
    return item.picks[i].reduce((sum,p)=>sum+byId.get(p),0);
   })});
   maxHit=evaluated.hit_probability;
  }
 }
 return out;
}
function extraMarginals(legs,picks,unitCents,before,kind){
 const out=[];
 for(let i=0;i<legs.length;i++){
  for(const r of legs[i].entries){
   const present=picks[i].includes(r.program);
   if(kind==="add"&&present)continue;
   if(kind==="remove"&&(!present||picks[i].length<=1))continue;
   const altered=picks.map((l,j)=>i!==j?[...l]:
    kind==="add"?[...l,r.program]:l.filter(p=>p!==r.program));
   const after=evalPicks(legs,altered,unitCents);
   if(kind==="add"){
    const dc=after.total_cents-before.total_cents;
    const dp=after.hit_probability-before.hit_probability;
    out.push({race:legs[i].race_number,horse:r.program,
     additional_combinations:after.combinations-before.combinations,
     additional_cost_cents:dc,additional_hit_probability:dp,
     marginal_required_dividend:dp>EPS?dc/100/dp:null,
     new_total_cents:after.total_cents,new_total_hit_probability:after.hit_probability});
   }else{
    const saved=before.total_cents-after.total_cents;
    const lost=before.hit_probability-after.hit_probability;
    out.push({race:legs[i].race_number,horse:r.program,
     cost_saved_cents:saved,hit_probability_lost:lost,
     marginal_required_dividend:lost>EPS?saved/100/lost:null});
   }
  }
 }
 const order=(a,b)=>(a.marginal_required_dividend??Infinity)-(b.marginal_required_dividend??Infinity)||
  (kind==="add"?a.additional_cost_cents-b.additional_cost_cents:a.cost_saved_cents-b.cost_saved_cents)||
  a.race-b.race;
 return out.sort(order);
}
export function chooseV32(inputLegs,unitCents,{
 costScaleDollars=PICK_V32_COST_SCALE_DOLLARS,includeMarginals=true
}={}){
 const legs=validateV32(inputLegs,unitCents,costScaleDollars);
 const frontier=exactV32Frontier(legs,unitCents);
 if(!frontier.length)FAIL("NO_VALID_TICKETS");
 let best=null,bestScore=-Infinity;
 // Python max by (log(H)-C/S, -C); its stable order breaks exact ties.
 for(const candidate of frontier){
  const score=candidate.hit_probability>0?
   Math.log(candidate.hit_probability)-(candidate.total_cents/100)/costScaleDollars:-Infinity;
  if(best===null||score>bestScore||
    (score===bestScore&&candidate.total_cents<best.total_cents)){
    best=candidate;bestScore=score;
  }
 }
 if(!best)FAIL("NO_VALID_TICKETS");
 return {engine:PICK_V32_ENGINE,selection_mode:"SINGLE_RECTANGULAR_TICKET",
  selection_objective:"ARGMAX(log(TRI_HIT_PROBABILITY) - TICKET_COST / COST_SCALE)",
  soft_cost_scale_dollars:costScaleDollars,
  combinations:best.combinations,total_cents:best.total_cents,
  hit_probability:best.hit_probability,leg_coverage:best.leg_coverage,
  picks:best.picks,frontier_points:frontier.length,
  break_even_average_winning_dividend:best.break_even_average_winning_dividend,
  marginal_additions:includeMarginals?extraMarginals(legs,best.picks,unitCents,best,"add"):[],
  marginal_removals:includeMarginals?extraMarginals(legs,best.picks,unitCents,best,"remove"):[],
  projected_return:null,expected_value:null,play_status:null,
  qualified_for_publication:false};
}
export function verifyV32ScratchTransition(before,after,manifest){
 if(!manifest||manifest.official_status!=="CONFIRMED")FAIL("SCRATCH_NOTICE_NOT_CONFIRMED");
 if(manifest.sequence_status!=="ACTIVE")FAIL("SEQUENCE_CANCELLED_OR_CHANGED_HOLD");
 if(manifest.date!==before.date||manifest.date!==after.date||
    manifest.track!==before.track||manifest.track!==after.track)
  FAIL("SCRATCH_MANIFEST_IDENTITY_MISMATCH");
 if(manifest.prescratch_sha256!==before.source_sha256)FAIL("STALE_PRESCRATCH_MANIFEST");
 if(manifest.postscratch_sha256!==after.source_sha256)FAIL("STALE_POSTSCRATCH_MANIFEST");
 if(!manifest.scratches||!manifest.activations)FAIL("SCRATCH_EVENT_MAP_REQUIRED");
 if(before.legs.length!==after.legs.length)FAIL("POSTSCRATCH_RACE_ORDER_CHANGED");
 const delta=[];
 for(let i=0;i<before.legs.length;i++){
  const pre=before.legs[i],post=after.legs[i],race=pre.race_number;
  if(race!==post.race_number)FAIL("POSTSCRATCH_RACE_ORDER_CHANGED");
  const old=new Set(pre.entries.map(x=>x.program_number??x.program));
  const now=new Set(post.entries.map(x=>x.program_number??x.program));
  const removed=[...old].filter(x=>!now.has(x)).sort();
  const activated=[...now].filter(x=>!old.has(x)).sort();
  const declaredScratch=manifest.scratches[String(race)]||[];
  const declaredActivated=manifest.activations[String(race)]||[];
  if(new Set(declaredScratch).size!==declaredScratch.length||
    removed.length!==declaredScratch.length||
    removed.some(x=>!declaredScratch.includes(x)))FAIL("SCRATCH_FIELD_MISMATCH_R"+race);
  if(new Set(declaredActivated).size!==declaredActivated.length||
    activated.length!==declaredActivated.length||
    activated.some(x=>!declaredActivated.includes(x)))FAIL("ACTIVATION_FIELD_MISMATCH_R"+race);
  if(!now.size)FAIL("ALL_INTERESTS_REMOVED_R"+race);
  delta.push({race,scratched_interests:removed,activated_interests:activated});
 }
 return {new_ticket_reoptimized_from_complete_postscratch_tri_pwin:true,
  reused_prescratch_probabilities:false,legs:delta};
}

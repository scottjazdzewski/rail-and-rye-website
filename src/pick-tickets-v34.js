// Owner-approved engineering lock effective 2026-11-24. Private production review only.
// V3.3 remains a reproducible baseline; scoring and customer release gates stay unchanged.
import {exactV32Frontier,normalizeV32Legs} from "./pick-tickets-v32.js";
import {sequenceQuality} from "./pick-tickets-sqr.js";
export const PICK_V34_ENGINE="V3.4-TRI-ONLY-LENGTH-SENSITIVE-TRIAL-A";
export const PICK_V34_TRIAL_SCALES=Object.freeze({3:15,4:30,5:60,6:120});
export const PICK_V34_EFFECTIVE_DATE="2026-11-24";
export const usesV34=date=>typeof date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=PICK_V34_EFFECTIVE_DATE;
export const hasV34ReceiptPair=card=>["tri_sha256","f4_sha256"].every(k=>/^[0-9a-f]{64}$/i.test(String(card?.model_receipts?.[k]||"")));
export function chooseV34(legs,unit){
 const scale=PICK_V34_TRIAL_SCALES[legs.length];
 if(!scale)throw Error("Unsupported wager length");
 const frontier=exactV32Frontier(legs,unit);
 let best=null,objective=-Infinity;
 for(const x of frontier){
  const score=Math.log(x.hit_probability)-x.total_cents/100/scale;
  if(best===null||score>objective||(score===objective&&x.total_cents<best.total_cents)){
   best=x;objective=score;
  }
 }
 if(!best||!Number.isFinite(objective))throw Error("No feasible ticket");
 const normalized=normalizeV32Legs(legs);
 const marginal_opportunity_cost=[];
 for(let i=0;i<normalized.length;i++){
  const leg=normalized[i],picks=best.picks[i],mass=best.leg_coverage[i];
  const otherCombos=best.combinations/picks.length;
  const otherMass=best.leg_coverage.reduce((p,m,j)=>i===j?p:p*m,1);
  const byProgram=new Map(leg.entries.map(x=>[x.program,x.pwin]));
  let cumulative=0;
  for(const [j,program] of picks.entries()){
   const p=byProgram.get(program),before=cumulative;
   cumulative+=p;
   marginal_opportunity_cost.push({race_number:leg.race_number,program,
    status:j===0?"BASE_SELECTION":"ADDITIONAL_COVERAGE",
    additional_combinations:otherCombos,additional_cost_cents:otherCombos*unit,
    additional_sequence_hit_probability:p*otherMass,
    additional_objective_score:before>0?Math.log(cumulative/before)-otherCombos*unit/100/scale:null});
  }
 }
 return {...best,engine:PICK_V34_ENGINE,soft_cost_scale_dollars:scale,
  minimum_leg_coverage:null,frontier_points:frontier.length,marginal_opportunity_cost,
  qualified_for_publication:false};
}
const pct=x=>(x*100).toFixed(1)+"%";
export function buildV34TrialCard(review){
 if(!review?.review_only||!usesV34(review.date)||
    review.formula_version!=="V3.3-TRI-ONLY-SINGLE-RECTANGLE-COVER50")
  throw Error("Only a current-date audited source review is eligible for V3.4");
 const sequences=review.sequences.map(s=>{
  const old=s.tickets?.[0];
  if(s.tickets?.length!==1||!old||!s.race_fields||!s.review_probabilities)throw Error("Complete audited V3.3 source required");
  const legs=s.race_fields.map(l=>({race_number:l.race_number,entries:l.programs.map(program=>({
   program_number:program,pwin:s.review_probabilities[String(l.race_number)]?.[program]/100
  }))}));
  if(legs.length!==s.end_race-s.start_race+1||legs[0].race_number!==s.start_race)throw Error("Wrong sequence field");
  const x=chooseV34(legs,old.unit_cents);
  const quality=sequenceQuality(legs,x);
  const ticket={...old,combinations:x.combinations,total_cents:x.total_cents,
   legs:x.picks.map((programs,i)=>({race_number:legs[i].race_number,programs})),
   hit_rate_display:pct(x.hit_probability),notes:""};
  return {...s,play_status:quality.classification,recommendation:"",
   hit_rate_display:ticket.hit_rate_display,tickets:[ticket],upload_change:null,
   review_meta:{method:PICK_V34_ENGINE,soft_cost_scale_dollars:x.soft_cost_scale_dollars,
    minimum_leg_coverage:null,selected_leg_coverage:x.leg_coverage,
    marginal_opportunity_cost:x.marginal_opportunity_cost,frontier_points:x.frontier_points,
    stage:s.review_meta?.stage,publication_qualified:false,
    profitability_validation:"NOT_PERFORMED",sequence_quality:quality,
    comparison_v33:{combinations:old.combinations,total_cents:old.total_cents,
      hit_rate_display:old.hit_rate_display,legs:old.legs}}
  };
 });
 return {...review,formula_version:PICK_V34_ENGINE,optimizer_basis:PICK_V34_ENGINE,
  review_only:true,sequences,source_type:"PRIVATE_AUDITED_TRI_V34_ENGINEERING_LOCK"};
}

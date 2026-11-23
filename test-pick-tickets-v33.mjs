import assert from "node:assert/strict";
import {chooseV33,exactV33Frontier,PICK_V33_ENGINE,PICK_V33_COST_SCALE_DOLLARS,
 PICK_V33_MIN_LEG_COVERAGE} from "./src/pick-tickets-v33.js";
import {chooseV32,PICK_V32_ENGINE,PICK_V32_COST_SCALE_DOLLARS}
 from "./src/pick-tickets-v32.js";

const leg=(race_number,pct)=>({
 race_number,entries:pct.map((p,i)=>({program_number:String(i+1),pwin:p/100}))
});
const fixtures=[
 {fields:[[38,27,18,12,5],[34,26,22,10,8],[42,28,16,9,5]],unit:50},
 {fields:[[70,15,7,5,3],[31,24,20,15,10],[40,25,17,12,6]],unit:20},
 {fields:[[20,20,20,20,20],[20,20,20,20,20],[20,20,20,20,20]],unit:50},
 {fields:[[44,24,16,10,6],[44,24,16,10,6],[44,24,16,10,6]],unit:100},
 {fields:[[12,11,11,10,10,10,10,10,8,8],[51,19,12,10,8],[37,30,20,9,4]],unit:20},
 {fields:[[55,20,15,10],[51,22,17,10],[46,30,19,5],[42,28,19,11],[38,27,20,15]],unit:50}
];
function bruteChoose(legs,unitCents){
 const options=legs.map(l=>{
  const sorted=[...l.entries].sort((a,b)=>b.pwin-a.pwin||
   (a.program_number<b.program_number?-1:a.program_number>b.program_number?1:0));
  let sum=0;return sorted.map((e,i)=>{
   sum+=e.pwin;
   return {picks:sorted.slice(0,i+1).map(r=>r.program_number),mass:sum};
  }).filter(o=>o.mass+1e-12>=.5);
 });
 let best=null;
 function walk(i,picks,count,hit){
  if(i===options.length){
   const cost=count*unitCents/100;
   const score=hit>0?Math.log(hit)-cost/30:-Infinity;
   const row={picks,combinations:count,total_cents:count*unitCents,hit_probability:hit,score};
   if(!best||score>best.score+1e-13||
    (Math.abs(score-best.score)<=1e-13&&row.total_cents<best.total_cents)){
    best=row;
   }
   return;
  }
  for(const o of options[i])walk(i+1,[...picks,o.picks],count*o.picks.length,hit*o.mass);
 }
 walk(0,[],1,1);return best;
}
assert.equal(PICK_V33_ENGINE,"V3.3-TRI-ONLY-SINGLE-RECTANGLE-COVER50");
assert.equal(PICK_V33_COST_SCALE_DOLLARS,30);
assert.equal(PICK_V33_MIN_LEG_COVERAGE,.5);
assert.equal(PICK_V32_COST_SCALE_DOLLARS,15,"historical V3.2 remains frozen");
assert.equal(PICK_V32_ENGINE,"V3.2-TRI-ONLY-SINGLE-RECTANGLE");
for(const [i,test] of fixtures.entries()){
 const legs=test.fields.map((x,j)=>leg(j+1,x)),u=test.unit;
 const pick=chooseV33(legs,u);
 const repeat=chooseV33(legs,u);
 const brute=bruteChoose(legs,u);
 assert.deepEqual(pick,repeat,"deterministic V3.3 computation "+i);
 assert.equal(pick.combinations,brute.combinations,"exhaustive global optimum "+i);
 assert.equal(pick.total_cents,brute.total_cents);
 assert.ok(Math.abs(pick.hit_probability-brute.hit_probability)<1e-12);
 assert.deepEqual(pick.picks,brute.picks,"sorted ranked TRI prefixes "+i);
 assert.ok(pick.leg_coverage.every(p=>p+1e-12>=.5));
 assert.equal(pick.picks.reduce((a,b)=>a*b.length,1),pick.combinations);
 const frontier=exactV33Frontier(legs,u);
 assert.equal(frontier.length,pick.frontier_points);
 assert.ok(frontier.every(r=>r.leg_coverage.every(m=>m+1e-12>=.5)));
 assert.ok(pick.marginal_opportunity_cost.length>=pick.picks.reduce((n,x)=>n+x.length,0));
 assert.equal(pick.marginal_opportunity_cost.length,pick.picks.reduce((n,x)=>n+x.length,0));
 for(const m of pick.marginal_opportunity_cost){
  assert.ok(m.leg_coverage_after>=m.leg_coverage_before);
  assert.ok(m.additional_combinations>=1);
  assert.equal(m.additional_cost_cents,m.additional_combinations*u);
  assert.ok(m.additional_sequence_hit_probability>=0);
  if(m.status==="ADDITIONAL_COVERAGE"){
   assert.ok(m.leg_coverage_before>=.5-1e-12,"horse is optional only after floor");
   assert.ok(m.additional_objective_score>-1e-8,
    "no discretionary horse with negative incremental score for the final rectangle");
  }
 }
 assert.equal(pick.projected_return,null);
 assert.equal(pick.expected_value,null);
 assert.equal(pick.qualified_for_publication,false);
 const old=chooseV32(legs,u,{includeMarginals:false});
 assert.equal(old.engine,PICK_V32_ENGINE);
}
const test=fixtures[0],fields=test.fields.map((x,i)=>leg(i+1,x));
const old=chooseV32(fields,50,{includeMarginals:false}),fresh=chooseV33(fields,50);
assert.ok(fresh.combinations>=old.combinations,
 "S30 and 50%-per-leg constraint generally raises selected coverage for this known fixture");
assert.throws(()=>chooseV33([fields[0],fields[0]],50),/BAD_RACE_ORDER/);
assert.throws(()=>chooseV33(fields,0),/INVALID_DENOMINATION/);
assert.throws(()=>chooseV33(fields.map(l=>({...l,entries:l.entries.slice(1)})),50),/RACE_PROBABILITIES_NOT_NORMALIZED/);
assert.throws(()=>chooseV33(fields.map(l=>({...l,entries:[...l.entries,l.entries[0]]})),50),/COUPLED_OR_DUPLICATE_INTERESTS_UNRESOLVED/);
assert.throws(()=>chooseV33(fields.map(l=>({...l,entries:l.entries.map(x=>({...x,pwin:NaN}))})),50),/INVALID_PWIN/);
console.log("PASS: V3.3 S30 + >=50% per-leg: exact exhaustive global optimum, real opportunity costs and unchanged historical V3.2.");

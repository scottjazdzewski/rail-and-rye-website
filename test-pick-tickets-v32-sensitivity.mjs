import assert from "node:assert/strict";
import {auditV32CostPreference,V32_DIAGNOSTIC_SCALES} from "./src/pick-tickets-v32-sensitivity.js";
import {chooseV32,PICK_V32_COST_SCALE_DOLLARS} from "./src/pick-tickets-v32.js";

const fields=(seq)=>seq.map((probs,i)=>({
 race_number:i+1,entries:probs.map((pct,j)=>({
  program_number:String(j+1),pwin:pct/100
 }))
}));
const fixtures=[
 {unit:20,legs:[[26,22,19,14,11,8],[50,20,15,10,5],[36,24,20,12,8],[44,21,17,10,8],[40,24,16,12,8],[48,22,15,10,5]]},
 {unit:50,legs:[[55,18,12,10,5],[54,20,14,8,4],[39,27,19,10,5],[31,25,20,14,10],[40,30,15,10,5]]},
 {unit:100,legs:[[60,30,10],[50,40,10],[70,30]]},
 {unit:50,legs:[[20,20,20,20,20],[20,20,20,20,20],[20,20,20,20,20]]}
];
assert.deepEqual(V32_DIAGNOSTIC_SCALES,[15,20,25,30,40]);
assert.equal(PICK_V32_COST_SCALE_DOLLARS,15,"approved production scale remains frozen");
for(const [idx,fixture] of fixtures.entries()){
 const input=fields(fixture.legs),rows=auditV32CostPreference(input,fixture.unit);
 assert.equal(rows.length,V32_DIAGNOSTIC_SCALES.length);
 const prod=chooseV32(input,fixture.unit,{includeMarginals:false});
 assert.equal(rows[0].current_approved,true);
 assert.equal(rows.slice(1).every(r=>!r.current_approved),true);
 assert.equal(rows[0].combinations,prod.combinations);
 assert.equal(rows[0].total_cents,prod.total_cents);
 assert.ok(Math.abs(rows[0].hit_probability-prod.hit_probability)<1e-12);
 for(let j=0;j<rows.length;j++){
  const r=rows[j];
  const direct=chooseV32(input,fixture.unit,{
   costScaleDollars:V32_DIAGNOSTIC_SCALES[j],includeMarginals:false});
  assert.equal(r.combinations,direct.combinations,idx+" combinations S="+r.scale_dollars);
  assert.equal(r.total_cents,direct.total_cents,idx+" cost S="+r.scale_dollars);
  assert.ok(Math.abs(r.hit_probability-direct.hit_probability)<1e-12);
  assert.equal(r.singles,r.runners_by_leg.filter(n=>n===1).length);
  assert.equal(r.runners_by_leg.reduce((n,k)=>n*k,1),r.combinations);
  if(j){
   assert.ok(rows[j].combinations>=rows[j-1].combinations,
    "Larger S cannot select a cheaper, narrower Pareto candidate");
   assert.ok(rows[j].hit_probability>=rows[j-1].hit_probability-1e-12,
    "Larger S cannot have lower model coverage on exact frontier");
  }
 }
}
console.log("PASS: private sensitivity scenarios 15/20/25/30/40 use exact V3.2 frontier; locked $15 unchanged.");

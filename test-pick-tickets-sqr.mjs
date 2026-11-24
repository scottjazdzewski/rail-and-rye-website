import assert from "node:assert/strict";
import {sequenceQuality,classifySQR,SQR_WEIGHTS} from "./src/pick-tickets-sqr.js";
import {chooseV34,buildV34TrialCard} from "./src/pick-tickets-v34.js";
import {chooseV33,PICK_V33_ENGINE} from "./src/pick-tickets-v33.js";
assert.ok(Math.abs(Object.values(SQR_WEIGHTS).reduce((a,b)=>a+b,0)-1)<1e-12);
assert.deepEqual(SQR_WEIGHTS,{predictability:25/85,efficiency:25/85,difficulty:20/85,single_opportunity:15/85});
for(const [x,label] of [[0,"PASS"],[49.999,"PASS"],[50,"CONDITIONAL"],[74.999,"CONDITIONAL"],[75,"PLAY"],[100,"PLAY"]])assert.equal(classifySQR(x),label);
for(const n of [3,4,5,6]){
 const unit=n===6?20:50;
 for(const [p,label] of [[[.8,.1,.06,.04],"PLAY"],[Array(12).fill(1/12),"PASS"],[[.44,.28,.14,.08,.06],"CONDITIONAL"]]){
  const legs=Array.from({length:n},(_,i)=>({race_number:i+1,entries:p.map((pwin,j)=>({program_number:String(j+1),pwin}))}));
  const x=chooseV34(legs,unit),old=chooseV33(legs,unit);
  const q=sequenceQuality(legs,x);
  assert.equal(q.classification,classifySQR(q.score));
  if(label!=="CONDITIONAL")assert.equal(q.classification,label);
  assert.equal(Object.hasOwn(q.components,"historical_performance"),false);
  assert.equal(q.historical_status,"EXCLUDED_PENDING_CALIBRATION");
  const c=q.components;
  const expected=(25*c.predictability+25*c.efficiency+20*c.difficulty+15*c.single_opportunity)/85;
  assert.ok(Math.abs(q.score-expected)<1e-10,"exact renormalized score");
  assert.equal(q.validated_profitability,false);
  const input={date:"2026-11-24",review_only:true,formula_version:PICK_V33_ENGINE,sequences:[{
   name:"Pick "+n,start_race:1,end_race:n,play_status:"CONDITIONAL",
   race_fields:legs.map(l=>({race_number:l.race_number,programs:l.entries.map(e=>e.program_number)})),
   review_probabilities:Object.fromEntries(legs.map(l=>[l.race_number,Object.fromEntries(l.entries.map(e=>[e.program_number,e.pwin*100]))])),
   tickets:[{role:"BEST_POSSIBLE",unit_cents:unit,combinations:old.combinations,total_cents:old.total_cents,legs:old.picks.map((programs,i)=>({race_number:i+1,programs})),hit_rate_display:(100*old.hit_probability).toFixed(1)+"%"}]
  }]};
  const seq=buildV34TrialCard(input).sequences[0];
  assert.equal(seq.play_status,q.classification);
  assert.equal(seq.tickets.length,1);
  assert.equal(seq.tickets[0].role,"BEST_POSSIBLE");
  assert.deepEqual(seq.tickets[0].legs.map(l=>l.programs),x.picks);
  assert.equal(seq.tickets[0].total_cents,x.total_cents);
  assert.equal(seq.tickets[0].hit_rate_display,(100*x.hit_probability).toFixed(1)+"%");
 }
}
console.log("PASS provisional SQR thresholds, strong/flat fields, all wager lengths, unchanged picks/cost and PASS availability.");

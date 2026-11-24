import assert from "node:assert/strict";
import {chooseV34,buildV34TrialCard,PICK_V34_TRIAL_SCALES,PICK_V34_ENGINE} from "./src/pick-tickets-v34.js";
import {chooseV33,PICK_V33_ENGINE} from "./src/pick-tickets-v33.js";
const p=[.48,.25,.14,.08,.05],q=[.23,.22,.20,.19,.16];
const legs=Array.from({length:6},(_,i)=>({race_number:i+1,entries:(i%2?p:q).map((pwin,j)=>({program_number:String(j+1),pwin}))}));
for(let n=3;n<=6;n++){
 const l=legs.slice(0,n),unit=n===6?20:50;
 const actual=chooseV34(l,unit),old=chooseV33(l,unit);
 let best=-Infinity,expected=null;
 function visit(i,hit,c,picks){
  if(i===n){const score=Math.log(hit)-c*unit/100/PICK_V34_TRIAL_SCALES[n];
   if(score>best){best=score;expected={hit,c,picks}};return;}
  let mass=0;for(let k=1;k<=l[i].entries.length;k++){
   mass+=l[i].entries[k-1].pwin;visit(i+1,hit*mass,c*k,[...picks,k]);
  }
 }
 visit(0,1,1,[]);
 assert.ok(Math.abs(Math.log(actual.hit_probability)-actual.total_cents/100/PICK_V34_TRIAL_SCALES[n]-best)<1e-12);
 assert.equal(actual.combinations,expected.c);assert.equal(actual.total_cents,expected.c*unit);
 assert.equal(actual.minimum_leg_coverage,null);assert.equal(actual.qualified_for_publication,false);
 assert.equal(actual.engine,PICK_V34_ENGINE);assert.equal(old.engine,PICK_V33_ENGINE);
 const seq={name:"Pick "+n,start_race:1,end_race:n,play_status:"CONDITIONAL",
 race_fields:l.map(x=>({race_number:x.race_number,programs:x.entries.map(e=>e.program_number)})),
 review_probabilities:Object.fromEntries(l.map(x=>[x.race_number,Object.fromEntries(x.entries.map(e=>[e.program_number,e.pwin*100]))])),
 tickets:[{unit_cents:unit,combinations:old.combinations,total_cents:old.total_cents,legs:old.picks.map((programs,i)=>({race_number:i+1,programs})),hit_rate_display:(100*old.hit_probability).toFixed(1)+"%"}]};
 const input={date:"2026-11-24",review_only:true,formula_version:PICK_V33_ENGINE,sequences:[seq]};
 const copy=JSON.stringify(input),out=buildV34TrialCard(input);
 assert.equal(JSON.stringify(input),copy);assert.equal(out.formula_version,PICK_V34_ENGINE);
 assert.equal(out.sequences[0].tickets[0].combinations,actual.combinations);
 assert.equal(out.sequences[0].review_meta.comparison_v33.combinations,old.combinations);
 assert.throws(()=>buildV34TrialCard({...input,review_only:false}));
}
console.log("PASS V3.4 exhaustive 3–6 leg objective, exact cost, no forced floor, V3.3 preservation and review gate.");

import assert from "node:assert/strict";
import {PICK_MENU_1123,buildPrescratchPickTicketReview,readPrivatePickProjections,
 buildV33PostScratchReviewed,buildV33ScratchFieldPreview,verifyV32OwnerScratchSnapshot}
 from "./src/pick-tickets-auto.js";
import {getNov23ScratchLedger} from "./src/pick-tickets-scratch-1123.js";
import {getPickTicketsIntake} from "./src/pick-tickets-intake.js";
import {chooseV33,PICK_V33_ENGINE,PICK_V33_COST_SCALE_DOLLARS}
 from "./src/pick-tickets-v33.js";

assert.equal(PICK_MENU_1123.length,42,"42 official 11/23 sequence ranges");
const calls=[];
const fromR2=await readPrivatePickProjections({CARDS_BUCKET:{async get(key){
 calls.push(key);
 return key.endsWith("finger-lakes.json")?
  {text:async()=>JSON.stringify({track_name:"Finger Lakes"}),customMetadata:{uploaded_at:"2026-11-23T10:00:00Z"}}:null;
}}});
assert.equal(calls.length,6);
assert.equal(fromR2.length,1);
assert.equal(fromR2[0].card.track_name,"Finger Lakes");
const counts={"Finger Lakes":8,"Mahoning Valley":10,"Mountaineer":8,"Parx Racing":9,"Zia Park":10};
const sample=(track,pcts=[38,27,18,12,5])=>({
 race_date:"2026-11-23",track_name:track,projection_status:"prescratch",
 races:Array.from({length:counts[track]},(_,i)=>({
  race_number:i+1,scratch_count:null,scratches:[],
  entries:pcts.map((p,j)=>({
   program_number:String(j+1),horse_name:"QA "+j,
   win_probability_exact:p,f4_probabilities:{exact_p1:p/100}
  }))
 }))
});
const generated=buildPrescratchPickTicketReview(Object.keys(counts).map(t=>({card:sample(t)})));
assert.equal(generated.cards.length,5);
assert.deepEqual(generated.rejected,[]);
assert.equal(generated.cards.reduce((n,x)=>n+x.card.sequences.length,0),42);
assert.equal(generated.engine,PICK_V33_ENGINE);
assert.equal(generated.cards.length,5);
let varied=new Set();
for(const item of generated.cards){
 assert.equal(item.card.optimizer_basis,PICK_V33_ENGINE);
 assert.equal(item.card.source_receipt,null,"never forge a source receipt");
 assert.equal(item.card.review_only,true,"math output is never itself customer certified");
 for(const sequence of item.card.sequences){
  assert.equal(sequence.tickets.length,1,"V3.3 is exactly one rectangular ticket");
  assert.equal(sequence.review_meta.method,PICK_V33_ENGINE);
  assert.equal(sequence.review_meta.soft_cost_scale_dollars,PICK_V33_COST_SCALE_DOLLARS);
  assert.equal(sequence.review_meta.minimum_leg_coverage,.5);
  assert.deepEqual(sequence.review_meta.selected_leg_coverage.length,sequence.tickets[0].legs.length);
  assert.ok(sequence.review_meta.selected_leg_coverage.every(x=>x+1e-12>=.5));
  assert.ok(Array.isArray(sequence.review_meta.marginal_opportunity_cost));
  assert.ok(sequence.review_meta.marginal_opportunity_cost.every(x=>
   x.additional_combinations>=1 && x.additional_cost_cents>=sequence.tickets[0].unit_cents));
  assert.equal(sequence.play_status,"CONDITIONAL","no green status from probabilities alone");
  const t=sequence.tickets[0];
  assert.equal(t.combinations,t.legs.reduce((n,l)=>n*l.programs.length,1));
  assert.equal(t.combinations*t.unit_cents,t.total_cents);
  assert.match(t.hit_rate_display,/^\d+\.\d%$/);
  assert.equal(t.title,"Rail & Rye Ticket");
  const source=sequence.race_fields.map(field=>({
   race_number:field.race_number,
   entries:field.programs.map(program=>({
    program_number:program,
    pwin:sequence.review_probabilities[String(field.race_number)][program]/100
   }))
  }));
  const expected=chooseV33(source,t.unit_cents,{includeMarginals:false});
  assert.equal(t.combinations,expected.combinations);
  assert.equal(t.total_cents,expected.total_cents);
  assert.deepEqual(t.legs.map(l=>l.programs),expected.picks);
  for(let i=0;i<expected.leg_coverage.length;i++){
   assert.ok(expected.leg_coverage[i]+1e-12>=.5);
   assert.ok(Math.abs(expected.leg_coverage[i]-sequence.review_meta.selected_leg_coverage[i])<1e-12);
  }
  assert.ok(Math.abs(parseFloat(t.hit_rate_display)/100-expected.hit_probability)<=.0005001);
  assert.equal(sequence.review_meta.frontier_points,expected.frontier_points);
  assert.ok(sequence.review_meta.required_break_even_dividend>=0,"calculate internally, not as predicted payout");
  varied.add(t.combinations);
 }
}
assert.ok(varied.size>2,"V3.3 does not impose standard 8/16/32 combination sizes");
const changed=buildPrescratchPickTicketReview([{card:sample("Finger Lakes",[70,15,7,5,3])}]);
assert.ok(changed.cards[0].card.sequences.some(s=>s.tickets[0].legs.some(l=>l.programs.length===1)),"real singles can arise");
for(const mutate of [
 c=>{c.races[0].entries[0].win_probability_exact=undefined},
 c=>{c.races[0].entries[0].win_probability_exact=45},
 c=>{c.races[0].entries.pop()},
 c=>{c.races[0].scratch_count=1},
 c=>{c.races[0].scratches=["2"]},
 c=>{c.projection_status="scratch_updated"},
 c=>{c.races[0].entries[0].f4_probabilities.exact_p1=.01}
]){
 const c=sample("Parx Racing");mutate(c);
 const out=buildPrescratchPickTicketReview([{card:c}]);
 assert.equal(out.cards.length,0,"reject incomplete/misclassified source");
 assert.equal(out.rejected.length,1);
}
const before=sample("Finger Lakes");
const after=structuredClone(before);after.projection_status="scratch_final";
after.races[0].entries.splice(1,1); // actual scratch number 2
after.races[0].entries[0].win_probability_exact=60;
after.races[0].entries[0].f4_probabilities.exact_p1=.6;
after.races[0].entries[1].win_probability_exact=22;
after.races[0].entries[1].f4_probabilities.exact_p1=.22;
after.races[0].entries[2].win_probability_exact=12;
after.races[0].entries[2].f4_probabilities.exact_p1=.12;
after.races[0].entries[3].win_probability_exact=6;
after.races[0].entries[3].f4_probabilities.exact_p1=.06;
const manifest={date:"2026-11-23",track:"Finger Lakes",official_status:"CONFIRMED",
 sequence_status:"ACTIVE",prescratch_sha256:"p".repeat(64),postscratch_sha256:"s".repeat(64),
 scratches:{"1":["2"]},activations:{}};
const post=buildV33PostScratchReviewed({before,after,manifest,preHash:"p".repeat(64),postHash:"s".repeat(64)});
assert.equal(post.card.optimizer_basis,PICK_V33_ENGINE);
assert.ok(post.card.sequences.every(x=>x.tickets.length===1));
assert.ok(post.card.sequences.every(x=>x.review_meta.stage==="POSTSCRATCH"));
assert.equal(post.card.sequences[0].race_fields[0].programs.includes("2"),false);
assert.throws(()=>buildV33PostScratchReviewed({before,after,manifest:{...manifest,official_status:"PENDING"},preHash:"p".repeat(64),postHash:"s".repeat(64)}),/SCRATCH_NOTICE_NOT_CONFIRMED/);
// A current scratch-adjusted source can be shown to administrators for mathematical
// inspection without pretending that prescratch factor-basis scores are certified.
const official=getNov23ScratchLedger();
const intake=getPickTicketsIntake();
const currentFixture=track=>{
 const owner=official.tracks.find(x=>x.name===track);
 const original=intake.tracks.find(x=>x.name===track);
 const expected=original.analysis_runner_count-owner.scratch_count;
 const count=original.race_count,base=Math.floor(expected/count),extra=expected%count;
 const c=sample(track);
 c.projection_status="scratch_final";
 c.factor_basis="verified_prescratch";
 c.races=Array.from({length:count},(_,i)=>{
  const race=i+1,selected=base+(i<extra?1:0);
  const withdrawn=new Set(owner.scratches[String(race)]||[]);
  const programs=Array.from({length:30},(_,j)=>String(j+1))
   .filter(p=>!withdrawn.has(p)).slice(0,selected);
  const pct=100/selected;
  return {race_number:race,scratch_count:(owner.scratches[String(race)]||[]).length,
   scratches:owner.scratches[String(race)]||[],
   entries:programs.map(p=>({
    program_number:p,win_probability_exact:pct,f4_probabilities:{exact_p1:pct/100}
   }))};
 });
 return c;
};
const reviewInputs=Object.keys(counts).map(track=>({
 card:currentFixture(track),uploaded_at:"2026-11-23T20:00:00Z"
}));
const privateReviews=reviewInputs.map(buildV33ScratchFieldPreview);
assert.equal(privateReviews.length,5);
assert.ok(privateReviews.every(Boolean));
assert.equal(privateReviews.reduce((n,item)=>n+item.card.sequences.length,0),42);
for(const item of privateReviews){
 assert.equal(item.review_only,true);
 assert.equal(item.card.review_only,true);
 assert.equal(item.card.formula_version,PICK_V33_ENGINE);
 assert.equal(item.card.source_receipt,null);
 assert.equal(item.card.score_verification_status,"CURRENT_FIELD_COMPLETE_SCORING_AND_MANIFEST_PENDING");
 assert.equal(item.card.model_factor_basis,"verified_prescratch");
 const ledger=official.tracks.find(x=>x.name===item.card.track);
 const original=intake.tracks.find(x=>x.name===item.card.track);
 assert.equal(item.card.official_scratch_source_sha256,ledger.source_sha256);
 assert.equal(item.card.official_scratch_count,ledger.scratch_count);
 assert.equal(item.card.active_runner_count,original.analysis_runner_count-ledger.scratch_count);
 assert.equal(verifyV32OwnerScratchSnapshot(reviewInputs.find(x=>x.card.track_name===item.card.track).card).ok,true);
 assert.ok(item.card.sequences.every(x=>
  x.review_meta.soft_cost_scale_dollars===30&&
  x.review_meta.selected_leg_coverage.every(p=>p>=.5-1e-12)));
 assert.ok(item.card.sequences.every(x=>x.tickets.length===1));
}
const staleScratch=structuredClone(reviewInputs[0].card);
const forbiddenProgram=official.tracks.find(t=>t.name==="Finger Lakes").scratches["1"][0];
staleScratch.races[0].entries[0].program_number=forbiddenProgram;
assert.match(verifyV32OwnerScratchSnapshot(staleScratch).reason,/SCRATCHED_PROGRAM_REMAINS_ACTIVE/);
assert.equal(buildV33ScratchFieldPreview(staleScratch),null);
const missingRunner=structuredClone(reviewInputs[0].card);
missingRunner.races[0].entries.pop();
assert.equal(verifyV32OwnerScratchSnapshot(missingRunner).reason,"RACE_DAY_SCRATCH_RUNNER_TOTAL_MISMATCH");
assert.equal(buildV33ScratchFieldPreview(missingRunner),null);
const incompleteReview=structuredClone(reviewInputs[0].card);
incompleteReview.races[0].entries[0].win_probability_exact=99;
assert.equal(buildV33ScratchFieldPreview(incompleteReview),null);
const unknownFactor=structuredClone(reviewInputs[0].card);
unknownFactor.factor_basis="unknown";
assert.equal(buildV33ScratchFieldPreview(unknownFactor),null);
assert.equal(buildV33ScratchFieldPreview(sample("Finger Lakes")),null,
 "prescratch input is not misrepresented as current-field review");
assert.equal(PICK_MENU_1123.find(x=>x.name==="Buckeye Pick 6").unit_cents,20);
assert.equal(PICK_MENU_1123.find(x=>x.name==="Philly Big 5").unit_cents,50);
console.log("PASS: exact V3.3 on all 42 official sequences, single ticket, same pre/post method, independent field/scratch gates.");

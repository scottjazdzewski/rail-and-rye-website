import assert from "node:assert/strict";
import {PICK_MENU_1123,buildPrescratchPickTicketReview,readPrivatePickProjections} from "./src/pick-tickets-auto.js";

assert.equal(PICK_MENU_1123.length,42,"42 documented win-only products across 5 tracks");
const privateFetches=[];
const privateSource=await readPrivatePickProjections({CARDS_BUCKET:{
 async get(key){
  privateFetches.push(key);
  return key.endsWith("finger-lakes.json")?{text:async()=>JSON.stringify(testCard("Finger Lakes")),customMetadata:{uploaded_at:"2026-11-23T05:00:00Z"}}:null;
 }
}});
assert.equal(privateFetches.length,5,"only the five known private date/track R2 keys are checked");
assert.ok(privateFetches.every(x=>x.startsWith("projections/dashboard/2026-11-23/")));
assert.equal(privateSource.length,1);
assert.equal(privateSource[0].card.track_name,"Finger Lakes");
const counts={"Finger Lakes":8,"Mahoning Valley":10,"Mountaineer":8,"Parx Racing":9,"Zia Park":10};
const testCard=(track,probs=[38,27,18,12,5])=>({
  schema_version:1,race_date:"2026-11-23",track_name:track,projection_status:"prescratch",
  races:Array.from({length:counts[track]},(_,i)=>({
    race_number:i+1,scratch_count:null,scratches:[],
    entries:probs.map((p,j)=>({
      program_number:String(j+1),horse_name:"QA RUNNER "+(j+1),
      win_probability_exact:p,
      f4_probabilities:{exact_p1:p/100}
    }))
  }))
});
const tracks=Object.keys(counts).map(track=>({card:testCard(track),uploaded_at:"2026-11-23T12:00:00Z"}));
const result=buildPrescratchPickTicketReview(tracks);
assert.equal(result.cards.length,5);
assert.deepEqual(result.rejected,[]);
assert.equal(result.cards.reduce((n,x)=>n+x.card.sequences.length,0),42);
let countsObserved=new Set();
for(const item of result.cards){
  assert.equal(item.review_only,true);
  assert.equal(item.card.review_only,true);
  assert.equal(item.card.source_receipt,null,"no forged certified scorer receipt");
  assert.equal(item.card.source_type,"PRIVATE_R2_PRESCRATCH_PROJECTIONS_NOT_SCORER_RECEIPT");
  for(const seq of item.card.sequences){
    const ticket=seq.tickets[0];
    const combo=ticket.legs.reduce((n,l)=>n*l.programs.length,1);
    assert.equal(combo,ticket.combinations);
    assert.equal(combo*ticket.unit_cents,ticket.total_cents);
    assert.match(ticket.hit_rate_display,/^\d+\.\d%$/);
    assert.equal(seq.play_status,"CONDITIONAL","no profitable-PLAY claim without payout evidence");
    assert.equal(seq.tickets.length,1,"one recommended ticket per official sequence");
    assert.equal(seq.race_fields.length,seq.end_race-seq.start_race+1);
    assert.ok(seq.tickets[0].legs.every(l=>l.programs.every(p=>seq.review_probabilities[String(l.race_number)][p]>0)));
    let exact=1;
    for(const leg of ticket.legs){
      exact*=leg.programs.reduce((n,p)=>n+seq.review_probabilities[String(leg.race_number)][p],0)/100;
    }
    assert.ok(Math.abs(exact*100-Number.parseFloat(ticket.hit_rate_display))<=0.051);
    countsObserved.add(ticket.combinations);
    assert.doesNotMatch(seq.recommendation,/expected payout|return on investment|ROI|overlay|profitability estimate/i);
  }
}
assert.ok(countsObserved.size>2,"ticket combinations vary by official sequence");
const another=buildPrescratchPickTicketReview([{card:testCard("Finger Lakes",[70,15,7,5,3])}]);
assert.ok(another.cards[0].card.sequences.some(seq=>seq.tickets[0].legs.some(l=>l.programs.length===1)),"legitimate singles arise from dominant PWIN");
// Fail closed for incomplete fields, missing exact PWIN, or score/field mismatch.
for(const mutate of [
 c=>{c.races[0].entries[0].win_probability_exact=undefined},
 c=>{c.races[0].entries[0].win_probability_exact=45},
 c=>{c.races[0].entries.pop()},
 c=>{c.races[0].scratch_count=1},
 c=>{c.projection_status="scratch_updated"},
 c=>{c.races[0].entries[0].f4_probabilities.exact_p1=.01}
]){
 const c=testCard("Parx Racing");mutate(c);
 const outcome=buildPrescratchPickTicketReview([{card:c}]);
 assert.equal(outcome.cards.length,0);
 assert.equal(outcome.rejected.length,1);
}
assert.equal(PICK_MENU_1123.find(x=>x.name==="Buckeye Pick 6").unit_cents,20);
assert.equal(PICK_MENU_1123.find(x=>x.name==="Philly Big 5").unit_cents,50);
console.log("PASS: 42 official 11/23 sequences, exact TRI PWIN coverage and costs, changing field strengths, and source-integrity gates.");

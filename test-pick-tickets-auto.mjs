import assert from "node:assert/strict";
import {PICK_MENU_1123,buildPrescratchPickTicketReview,readPrivatePickProjections} from "./src/pick-tickets-auto.js";

assert.equal(PICK_MENU_1123.length,42,"42 documented win-only products across 5 tracks");
const privateFetches=[];
const privateSource=await readPrivatePickProjections({CARDS_BUCKET:{
 async get(key){
  privateFetches.push(key);
  return key.endsWith("finger-lakes.json")?{text:async()=>JSON.stringify({track_name:"Finger Lakes"}),customMetadata:{uploaded_at:"2026-11-23T05:00:00Z"}}:null;
 }
}});
assert.equal(privateFetches.length,6,"five known Projections keys plus one sealed private review source are checked");
assert.equal(privateFetches.filter(x=>x.startsWith("projections/dashboard/2026-11-23/")).length,5);
assert.equal(privateFetches.filter(x=>x==="pick-tickets/interim/2026-11-23/revision-0001.json").length,1);
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
    assert.equal(seq.play_status,"CONDITIONAL","classification remains pending other production window");
    assert.equal(seq.review_meta.method,"PWIN_FOCUSED_MARGINAL_0_60_V2");
    assert.equal(seq.review_meta.classification_method,"AWAITING_APPROVED_CLASSIFICATION");
    const oldBalanced=seq.review_meta.alternatives.find(x=>x.type==="former_balanced");
    const focused=seq.review_meta.alternatives.find(x=>x.type==="focused");
    assert.ok(focused,"there must always be one focused construction");
    assert.equal(focused.combinations,ticket.combinations);
    if(oldBalanced){
      assert.ok(ticket.combinations<=oldBalanced.combinations,"focused tickets must not exceed the former balanced combinations");
      assert.ok(ticket.total_cents<=oldBalanced.total_cents,"focused tickets may not cost more than former balanced");
      assert.ok(Number.parseFloat(ticket.hit_rate_display)<=Number.parseFloat(oldBalanced.hit_rate_display)+0.11);
    }
    const lean=seq.review_meta.alternatives.find(x=>x.type==="lean");
    if(lean){
      assert.ok(ticket.combinations>=lean.combinations,"focused coverage cannot undercut original lean candidate");
    }
    for(const marginal of seq.review_meta.marginal_checks){
      const leg=ticket.legs.find(x=>x.race_number===marginal.race_number);
      const otherLegCombinations=ticket.combinations/leg.programs.length;
      for(const addition of marginal.additions){
        assert.ok(leg.programs.includes(addition.program));
        assert.ok(addition.additional_complete_hit_pct>0);
        assert.equal(addition.additional_combinations,otherLegCombinations);
        assert.equal(addition.additional_cost_cents,otherLegCombinations*ticket.unit_cents);
        const k=addition.leg_coverage_before_pct;
        const j=leg.programs.indexOf(addition.program);
        const previousCount=j;
        assert.ok(previousCount>=1);
        assert.ok((addition.leg_coverage_after_pct/100)/Math.pow(previousCount+1,.60)>
         (k/100)/Math.pow(previousCount,.60)-1e-10,
         "every added runner must improve the cost-sensitive marginal coverage score");
      }
    }
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
const costEfficient=buildPrescratchPickTicketReview([{card:testCard("Finger Lakes",[44,24,16,10,6])}]);
const costEfficientPick3=costEfficient.cards[0].card.sequences.find(s=>s.start_race===2&&s.end_race===4);
assert.equal(costEfficientPick3.tickets[0].combinations,8,"focused ticket chooses two runners per leg in a balanced moderately clear race");
assert.equal(costEfficientPick3.tickets[0].total_cents,400);
assert.equal(costEfficientPick3.review_meta.saved_combinations_vs_former_balanced,19,"former balanced had 27 combinations, now eight");
assert.equal(costEfficientPick3.review_meta.saved_cents_vs_former_balanced,950);
assert.equal(costEfficientPick3.tickets[0].legs.every(l=>l.programs.length===2),true);
assert.ok(costEfficientPick3.review_meta.marginal_checks.every(x=>x.additions.length===1));
const uncertain=buildPrescratchPickTicketReview([{card:testCard("Finger Lakes",[20,20,20,20,20])}]);
assert.equal(uncertain.cards[0].card.sequences[0].play_status,"CONDITIONAL","uniformly weak races must not be labeled as profitable");
assert.equal(PICK_MENU_1123.find(x=>x.name==="Buckeye Pick 6").unit_cents,20);
assert.equal(PICK_MENU_1123.find(x=>x.name==="Philly Big 5").unit_cents,50);
console.log("PASS: all 42 real wager menus, focused tickets never wider than old balanced, audited marginal horse economics, exact PWIN/cost source gates.");

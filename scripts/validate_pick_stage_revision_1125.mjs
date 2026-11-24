import fs from "node:fs";
import assert from "node:assert/strict";
import {validateStagedPickBatch} from "../src/pick-tickets-staging.js";
const input=JSON.parse(fs.readFileSync("/tmp/rr-pick-qa-v2-input.json","utf8"));
const {parent,patch,customers}=input;
const original=validateStagedPickBatch(parent);
const expected={"Churchill Downs":{8:["13"],10:["13","14","15"]},"Delta Downs":{8:["11","12"]},"Mountaineer":{5:["11"],8:["11"]},"Tampa Bay Downs":{5:["6","10"],7:["11","12"],9:["10"]}};
assert.equal(patch.rows.length,4);
assert.equal(new Set(patch.rows.map(r=>r.track)).size,4);
const next=structuredClone(parent);
next.revision=2;next.parent_sha256=patch.parent_sha256;
for(const change of patch.rows){
 const row=next.tracks.find(r=>r.card.track===change.track);
 assert.ok(row);
 assert.deepEqual(change.conditional_exclusions,expected[change.track]);
 assert.equal(change.receipt.source_pdf_sha256,row.receipt.source_pdf_sha256);
 assert.equal(change.races,row.races);
 assert.equal(change.runners,row.runners-Object.values(change.conditional_exclusions).flat().length);
 assert.equal(change.sequences.length,row.card.sequences.length);
 for(let i=0;i<change.sequences.length;i++){
  const a=row.card.sequences[i],b=change.sequences[i];
  assert.deepEqual([a.name,a.start_race,a.end_race,a.tickets[0].unit_cents],[b.name,b.start_race,b.end_race,b.tickets[0].unit_cents]);
  for(const f of a.race_fields){
   const exclusions=expected[change.track][f.race_number]||[];
   assert.deepEqual([...b.race_fields.find(x=>x.race_number===f.race_number).programs].sort(),f.programs.filter(p=>!exclusions.includes(p)).sort());
   if(!exclusions.length)for(const p of f.programs)assert.ok(Math.abs(a.review_probabilities[f.race_number][p]-b.review_probabilities[f.race_number][p])<1e-9);
  }
 }
 row.runners=change.runners;row.proof=change.proof;row.receipt=change.receipt;row.conditional_exclusions=change.conditional_exclusions;
 Object.assign(row.card,{revision:2,sequences:change.sequences,source_input_sha256:change.receipt.pwin_sha256,model_receipts:{tri_sha256:change.receipt.tri_sha256,f4_sha256:change.receipt.f4_sha256},source_receipt:{...row.card.source_receipt,sha256:change.receipt.f4_sha256}});
}
const cards=validateStagedPickBatch(next);
assert.equal(cards.length,9);assert.equal(next.tracks.reduce((n,r)=>n+r.runners,0),617);assert.equal(cards.reduce((n,c)=>n+c.sequences.length,0),92);
const writes=[];
for(const c of cards){
 const before=original.find(x=>x.track===c.track);
 const stored=customers[c.track];
 assert.ok(stored);
 assert.deepEqual(stored,before,"Existing customer edition changed after initial stage; no writes");
 if(expected[c.track])writes.push({track:c.track,card:c});
}
assert.equal(writes.length,4);
fs.writeFileSync("/tmp/rr-pick-qa-v2-output.json",JSON.stringify({batch:next,writes}));
console.log("PASS 92 ticket constructions and classifications, 617 runners, exact conditional roster differences; existing nine customer editions match queued parent.");

// Read-only integration QA; private paid data only in /tmp; no publication.
import fs from "node:fs";
import assert from "node:assert/strict";
import {validateStagedPickBatch} from "../src/pick-tickets-staging.js";
import {approvedPrivateAdditions} from "../src/pick-tickets-output-validation.js";
const input=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const {baseline,delta}=input;
const original=validateStagedPickBatch(baseline);
assert.equal(original.length,6);assert.equal(original.reduce((a,c)=>a+c.sequences.length,0),78);
const test=structuredClone(baseline);let count=0;
for(const t of delta.tracks){
 const row=test.tracks.find(x=>x.card.track===t.track);assert.ok(row);
 row.market_assistance=t.market_assistance;
 for(const c of t.changes){const old=row.card.sequences[c.sequence_index];assert.deepEqual(c.sequence.review_probabilities,old.review_probabilities);assert.deepEqual(c.sequence.race_fields,old.race_fields);assert.equal(c.sequence.tickets[0].unit_cents,old.tickets[0].unit_cents);row.card.sequences[c.sequence_index]=c.sequence;count++;}
}
assert.equal(count,7);const final=validateStagedPickBatch(test);
assert.equal(final.length,6);assert.equal(final.reduce((a,c)=>a+c.sequences.length,0),78);
let changes=0;
for(let i=0;i<original.length;i++){const a=original[i],b=final[i];for(let j=0;j<a.sequences.length;j++){const x=a.sequences[j],y=b.sequences[j];assert.deepEqual(x.review_probabilities,y.review_probabilities);assert.deepEqual(x.race_fields,y.race_fields);if(JSON.stringify(x)!==JSON.stringify(y))changes++;}}
assert.equal(changes,7);
const corrupt=(fn,label)=>{const v=structuredClone(test);fn(v.tracks.find(r=>r.market_assistance));assert.throws(()=>validateStagedPickBatch(v),undefined,label);};
corrupt(r=>delete r.market_assistance,"missing approval cannot modify V3.4");
corrupt(r=>r.market_assistance.source_input_sha256="0".repeat(64),"wrong source");
corrupt(r=>r.market_assistance.revision++,"stale revision");
corrupt(r=>r.market_assistance.approved_changes.push(r.market_assistance.approved_changes[0]),"duplicate addition");
corrupt(r=>{const x=r.market_assistance.approved_changes[0],s=r.card.sequences[x.sequence_index];s.tickets[0].legs[0].programs.pop()},"removed baseline interest");
corrupt(r=>{const x=r.market_assistance.approved_changes[0];r.card.sequences[x.sequence_index].tickets[0].total_cents++},"incorrect cost");
corrupt(r=>{const x=r.market_assistance.approved_changes[0];r.card.sequences[x.sequence_index].play_status="PLAY"},"incorrect SQR");
corrupt(r=>r.market_assistance.operator_approved=false,"unauthorized");
console.log("V35_ACTUAL_SITE_GATE_PASS baseline_tracks=6 baseline_sequences=78 changed_sequences=7 negative_tests=8 no_R2_writes=true");

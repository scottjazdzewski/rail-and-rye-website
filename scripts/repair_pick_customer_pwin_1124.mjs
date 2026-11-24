// Owner-directed refresh of existing approved editions only. No new entitlement,
// pricing or catalog changes. Use the same verified constructor as admin.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {handleAdminPickTickets,prepareVerifiedCustomerPick} from '../src/pick-tickets.js';
const input=JSON.parse(fs.readFileSync('/tmp/rr-pwin-customer-private.json','utf8'));
const date='2026-11-24',prefix='racing-intelligence/product-tabs/pick-tickets/'+date+'/';
const bucket={async list({prefix}){return {objects:Object.keys(input).filter(k=>k.startsWith(prefix)).map(key=>({key}))}},async get(key){const v=input[key];return v?{text:async()=>v.raw,json:async()=>JSON.parse(v.raw),customMetadata:v.metadata}:null}};
const body=await (await handleAdminPickTickets(new Request('https://internal.invalid/api/admin/pick-tickets'),{CARDS_BUCKET:bucket})).json();
const records=body.cards.filter(r=>r.card.date===date&&r.review_only===true);
assert.equal(records.length,6,'Require all six verified current cards');
assert.equal(records.reduce((n,r)=>n+r.card.sequences.length,0),50,'Require all 50 sequences');
assert.ok(records.every(r=>r.card.status==='scratch_updated'),'Require all six verified scratch-final fields');
const out=[];
for(const [key,v] of Object.entries(input)){
 if(!key.startsWith(prefix)||v.metadata.customer_publish_approved!=='true')continue;
 const prior=JSON.parse(v.raw);
 assert.equal(prior.date,date);
 assert.equal(v.metadata.publication_mode,'owner-approved-gpt');
 const row=records.find(r=>r.card.track===prior.track);
 assert.ok(row,'Missing verified current track');
 assert.ok(!body.source_rejections.some(r=>r.track===prior.track),'Current source rejected');
 const next=prepareVerifiedCustomerPick(row,prior);
 assert.ok(next.sequences.every(s=>s.review_probabilities));
 assert.ok(next.post_times_by_race);
 out.push({key,previous:v.raw,next:JSON.stringify(next),revision:next.revision,source_sha256:next.source_input_sha256,track:next.track,sequenceCount:next.sequences.length});
}
assert.equal(out.length,6,'Expected six existing approved customer editions');
fs.writeFileSync('/tmp/rr-pwin-customer-repair.json',JSON.stringify(out));
console.log('PWIN_REPAIR_PREPARED',JSON.stringify(out.map(({track,revision,sequenceCount})=>({track,revision,sequenceCount}))));

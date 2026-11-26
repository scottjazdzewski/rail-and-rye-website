import fs from 'node:fs';
import assert from 'node:assert/strict';
import {normalizePickTickets, requireCustomerPickPwin, readPublishedPickTicketCards} from '../src/pick-tickets.js';
import {readyProductTabProductIds, hasProductTabData} from '../src/product-tab-content.js';
const {parent,current,key,metadata,productId}=JSON.parse(fs.readFileSync('/tmp/rr-lrl-withdraw.json','utf8'));
assert.deepEqual(requireCustomerPickPwin(normalizePickTickets(current)),requireCustomerPickPwin(normalizePickTickets(parent)));
assert.equal(current.sequences.length,13);
assert.ok(current.sequences.every(s=>s.end_race>=2&&s.start_race<=9));
if(process.argv.includes('--withdrawn')){
 const env={CARDS_BUCKET:{list:async({prefix})=>({objects:key.startsWith(prefix)?[{key}]:[]}),get:async(k)=>k===key?{text:async()=>JSON.stringify(current),customMetadata:metadata}:null}};
 const p={id:productId,category:'Pick Tickets',race_date:'2026-11-26',track:'Laurel Park',title:'Laurel Park'};
 assert.equal((await readPublishedPickTicketCards(env,'2026-11-26')).length,0);
 assert.equal((await readyProductTabProductIds(env,[p])).has(productId),false);
 assert.equal(await hasProductTabData(env,p.category,p.race_date,[p]),false);
 console.log('NOV26_LRL_CUSTOMER_READINESS_AND_CHECKOUT_GATE_PASS');
}else console.log('NOV26_LRL_ORIGINAL_AND_CANCELED_SEQUENCE_VALIDATION_PASS');

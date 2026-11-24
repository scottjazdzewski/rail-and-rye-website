import assert from "node:assert/strict";
import {normalizePickTickets,enrichPublishedPickFromVerified,readPublishedPickTicketCards} from "./src/pick-tickets.js";
import {readProductTabEdition} from "./src/product-tab-content.js";
const raw={schema_version:1,product_type:"pick_tickets",date:"2026-11-24",track:"Synthetic QA Track",revision:2,status:"scratch_updated",publication_mode:"owner-approved-gpt",source_input_sha256:"a".repeat(64),formula_version:"V3.4-TRI-ONLY-LENGTH-SENSITIVE-TRIAL-A",post_times_by_race:{"1":"12:05 PM ET"},scratches_by_race:{"1":["4"]},sequences:[{name:"Pick 3",start_race:1,end_race:3,play_status:"CONDITIONAL",hit_rate_display:"24.0%",race_fields:[1,2,3].map(race_number=>({race_number,programs:["1","2","3"]})),review_probabilities:{"1":{"1":60,"2":25,"3":15},"2":{"1":50,"2":30,"3":20},"3":{"1":80,"2":10,"3":10}},tickets:[{role:"BEST_POSSIBLE",title:"Rail & Rye Ticket",unit_cents:50,combinations:1,total_cents:50,hit_rate_display:"24.0%",legs:[1,2,3].map(race_number=>({race_number,programs:["1"]}))}]}]};
const safe=normalizePickTickets(raw);
assert.deepEqual(safe.sequences[0].review_probabilities,raw.sequences[0].review_probabilities);
assert.deepEqual(safe.post_times_by_race,raw.post_times_by_race);
for(const change of [x=>delete x.sequences[0].review_probabilities["1"]["2"],x=>x.sequences[0].review_probabilities["1"]["2"]=30,x=>x.sequences[0].tickets[0].hit_rate_display="25.0%"]){
 const bad=structuredClone(raw);change(bad);assert.throws(()=>normalizePickTickets(bad),/PWIN/);
}
const legacy=structuredClone(safe);delete legacy.sequences[0].review_probabilities;delete legacy.post_times_by_race;
assert.equal(enrichPublishedPickFromVerified(legacy,{card:safe,post_times_by_race:raw.post_times_by_race}),true);
assert.deepEqual(legacy.sequences[0].review_probabilities,raw.sequences[0].review_probabilities);
assert.deepEqual(legacy.post_times_by_race,raw.post_times_by_race);
const stale=structuredClone(legacy);delete stale.sequences[0].review_probabilities;stale.source_input_sha256="b".repeat(64);
assert.equal(enrichPublishedPickFromVerified(stale,{card:safe}),false);
assert.equal(stale.sequences[0].review_probabilities,undefined);
const key="racing-intelligence/product-tabs/pick-tickets/2026-11-24/synthetic-qa-track.json";
const env={CARDS_BUCKET:{async list({prefix}){return {objects:key.startsWith(prefix)?[{key}]:[]}},async get(k){return k===key?{text:async()=>JSON.stringify(safe),customMetadata:{customer_publish_approved:"true",publication_mode:"owner-approved-gpt"}}:null}}};
const published=await readPublishedPickTicketCards(env,raw.date);
assert.equal(published.length,1);assert.deepEqual(published[0].sequences[0].review_probabilities,raw.sequences[0].review_probabilities);
const products=[{id:"test",category:"Pick Tickets",race_date:raw.date,track:raw.track,title:raw.track}];
const edition=await readProductTabEdition(env,"Pick Tickets",raw.date,products);
assert.deepEqual(edition.cards[0].sequences[0].review_probabilities,raw.sequences[0].review_probabilities);
assert.equal(await readProductTabEdition(env,"Pick Tickets",raw.date,[{...products[0],track:"Other Track",title:"Other Track"}]),null);
console.log("PASS protected customer PWIN round trip, exact hit validation, matched-source backfill and track entitlements.");

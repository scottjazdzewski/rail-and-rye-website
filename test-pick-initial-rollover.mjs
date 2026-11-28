import assert from "node:assert/strict";
import {createHash,webcrypto} from "node:crypto";
import {normalizePickTickets,readPublishedPickTicketCards} from "./src/pick-tickets.js";
globalThis.crypto??=webcrypto;
const date="2026-11-28",track="Synthetic QA Track";
const raw={schema_version:1,product_type:"pick_tickets",date,track,revision:1,status:"initial_current",publication_mode:"owner-approved-gpt",source_input_sha256:"a".repeat(64),formula_version:"V3.4-TRI-ONLY-LENGTH-SENSITIVE-TRIAL-A",sequences:[{name:"Pick 3",start_race:1,end_race:3,play_status:"CONDITIONAL",hit_rate_display:"24.0%",race_fields:[1,2,3].map(race_number=>({race_number,programs:["1","2","3"]})),review_probabilities:{"1":{"1":60,"2":25,"3":15},"2":{"1":50,"2":30,"3":20},"3":{"1":80,"2":10,"3":10}},tickets:[{role:"BEST_POSSIBLE",title:"Rail & Rye Ticket",unit_cents:50,combinations:1,total_cents:50,hit_rate_display:"24.0%",legs:[1,2,3].map(race_number=>({race_number,programs:["1"]}))}]}]};
const card=normalizePickTickets(raw),key="racing-intelligence/product-tabs/pick-tickets/"+date+"/synthetic-qa-track.json",stageKey="pick-tickets/staging/"+date+"/revision-0001.json";
const release=date+"T08:00:00Z";
const staged=JSON.stringify({date,revision:1,prescratch:true,release_at:release,tracks:[{card:raw}]});
const sha=createHash("sha256").update(staged).digest("hex");
const meta={customer_publish_approved:"true",publication_mode:"owner-approved-gpt",initial_stage_sha256:sha,staged_release_at:release};
const mock=(c=card,m=meta,stage=staged)=>({CARDS_BUCKET:{list:async()=>({objects:[{key}]}),get:async k=>k===key?{text:async()=>JSON.stringify(c),customMetadata:m}:k===stageKey&&stage!==null?{text:async()=>stage,customMetadata:{stage_only:"true",sha256:sha}}:null}});
const oldNow=Date.now;Date.now=()=>Date.parse(date+"T12:25:00Z");
try{
 assert.equal((await readPublishedPickTicketCards(mock(),date)).length,1);
 assert.equal((await readPublishedPickTicketCards(mock(card,{...meta,initial_stage_sha256:"b".repeat(64)}),date)).length,0);
 assert.equal((await readPublishedPickTicketCards(mock(card,meta,null),date)).length,0);
 assert.equal((await readPublishedPickTicketCards(mock({...card,revision:2}),date)).length,0);
 assert.equal((await readPublishedPickTicketCards(mock({...card,status:"scratch_updated",revision:2}),date)).length,0);
 assert.equal((await readPublishedPickTicketCards(mock({...card,sequences:card.sequences.map(s=>({...s,play_status:"PASS"}))}),date)).length,0);
 Date.now=()=>Date.parse(date+"T07:59:00Z");
 assert.equal((await readPublishedPickTicketCards(mock(),date)).length,0);
}finally{Date.now=oldNow}
console.log("PICK_INITIAL_ROLLOVER_PASS: exact initial stage permitted; tamper, missing stage, scratch bypass, premature release rejected");

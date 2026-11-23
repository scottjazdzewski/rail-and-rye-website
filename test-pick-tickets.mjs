import assert from "node:assert/strict";
import fs from "node:fs";
import {normalizePickTickets,handleAdminPickTickets} from "./src/pick-tickets.js";
import {getNov23ScratchLedger,sourceIsScratchCurrent,officialScratchSequenceCount} from "./src/pick-tickets-scratch-1123.js";
import {PICK_V32_ENGINE} from "./src/pick-tickets-v32.js";
import {PICK_MENU_1123} from "./src/pick-tickets-auto.js";
import {getPickTicketsIntake} from "./src/pick-tickets-intake.js";
import {getPickTicketsPrivateDemo} from "./src/pick-tickets-demo.js";

const receipt={reference:"SYNTHETIC-TEST-ONLY",sha256:"a".repeat(64)};
const ticket=(role="BEST_POSSIBLE")=>({
 role,title:role==="BEST_POSSIBLE"?"Synthetic best":"Synthetic lean",unit_cents:50,
 combinations:2,total_cents:100,
 legs:[{race_number:1,programs:["1","1A"]},{race_number:2,programs:["3"]},{race_number:3,programs:["10"]}],
 notes:"Only test data, never a published recommendation."
});
const card=()=>({
 schema_version:1,product_type:"pick_tickets",date:"2026-11-23",track:"Synthetic QA Track",
 revision:1,status:"initial_current",formula_version:PICK_V32_ENGINE,source_receipt:{...receipt},sequences:[
 {name:"Synthetic Pick 3",start_race:1,end_race:3,play_status:"PASS",
  hit_rate_display:"12.345%",recommendation:"Test only",tickets:[ticket()]}
 ]});
const clone=value=>structuredClone(value);
function invalidChange(change,pattern){
 const copy=card();change(copy);
 assert.throws(()=>normalizePickTickets(copy),pattern);
}
assert.equal(normalizePickTickets(card()).sequences[0].tickets[0].total_cents,100);
invalidChange(c=>{c.sequences[0].tickets[0].total_cents=150},/audit failed/);
invalidChange(c=>{c.sequences[0].tickets[0].combinations=8},/audit failed/);
invalidChange(c=>{c.sequences[0].tickets[0].legs[0].programs=["ALL"]},/explicit saddle number/);
invalidChange(c=>{c.sequences[0].tickets[0].legs[0].programs=["1","1"]},/duplicate/);
invalidChange(c=>{c.sequences[0].tickets[0].legs[2].race_number=5},/consecutive race order/);
invalidChange(c=>{c.sequences[0].tickets[0].role="LEAN"},/BEST_POSSIBLE/);
invalidChange(c=>{c.sequences[0].play_status="MAYBE"},/PLAY, CONDITIONAL or PASS/);
invalidChange(c=>{c.source_receipt.sha256="not-a-hash"},/64 hex/);
invalidChange(c=>{c.status="scratch_updated"},/verified scratch timestamp/);
invalidChange(c=>{c.sequences[0].hit_rate_display="125%"},/certified percentage/);
invalidChange(c=>{c.sequences[0].tickets[0].hit_rate_display="112%"},/certified percentage/);
invalidChange(c=>{c.sequences[0].race_fields=[{race_number:1,programs:["1","1A"]}]},/every sequence race/);
invalidChange(c=>{c.sequences[0].race_fields=[{race_number:1,programs:["1"]},{race_number:2,programs:["3"]},{race_number:3,programs:["10"]}]},/not in the certified race_fields/);
const withVerifiedFields=card();
withVerifiedFields.sequences[0].race_fields=[{race_number:1,programs:["1","1A","2"]},{race_number:2,programs:["3","4"]},{race_number:3,programs:["10","11"]}];
withVerifiedFields.sequences[0].tickets[0].hit_rate_display="28.6%";
const verified=normalizePickTickets(withVerifiedFields);
assert.equal(verified.sequences[0].tickets[0].hit_rate_display,"28.6%");
assert.equal(verified.sequences[0].race_fields[0].programs.length,3);

class FakeR2{
 constructor(){this.objects=new Map();}
 async list({prefix}){return {objects:[...this.objects.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};}
 async get(key){const record=this.objects.get(key);return record?{text:async()=>record.text,customMetadata:record.customMetadata}:null;}
 async put(key,value,options){this.objects.set(key,{text:String(value),customMetadata:options.customMetadata});}
}
const env={CARDS_BUCKET:new FakeR2()};
const request=(body,method="POST")=>new Request("https://railandryeracing.com/api/admin/pick-tickets",{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
async function post(body){const response=await handleAdminPickTickets(request(body),env);return {response,body:await response.json()};}
let result=await post(card());
assert.equal(result.response.status,200);
assert.equal(result.body.updated.length,1);
assert.equal(env.CARDS_BUCKET.objects.size,2,"current and private immutable revision");
assert.equal(result.response.headers.get("X-Robots-Tag"),"noindex, nofollow, noarchive");
result=await post(card());
assert.equal(result.body.unchanged,1);
assert.equal(env.CARDS_BUCKET.objects.size,2,"idempotence");
const changed=card();changed.sequences[0].recommendation="Changed without revision";
result=await post(changed);assert.equal(result.response.status,409);
assert.match(result.body.error,/Increment the certified revision/);
const updated=card();updated.revision=2;updated.status="scratch_updated";updated.scratch_verified_at="2026-11-23T18:20:00Z";
result=await post(updated);
assert.equal(result.response.status,200);
assert.equal(env.CARDS_BUCKET.objects.size,3,"separate immutable revision and latest pointer");
result=await post(card());assert.equal(result.response.status,409);
assert.match(result.body.error,/revision rollback/);
const newInitial=clone(updated);newInitial.revision=3;newInitial.status="initial_current";newInitial.scratch_verified_at="";
result=await post(newInitial);assert.equal(result.response.status,409);
assert.match(result.body.error,/scratch-updated/);
const listing=await handleAdminPickTickets(new Request("https://railandryeracing.com/api/admin/pick-tickets"),env);
const data=await listing.json();
assert.equal(data.cards.length,1);
assert.equal(data.intake.date,"2026-11-23");
assert.equal(data.scratch_update.date,"2026-11-23");
assert.equal(data.scratch_update.tracks.reduce((n,t)=>n+t.scratch_count,0),50);
assert.equal(data.scratch_update.tracks.reduce((n,t)=>n+t.affected_races.length,0),35);
assert.equal(data.scratch_update.dependent_sequences.reduce((n,t)=>n+t.impacted,0),42);
assert.equal(data.scratch_update.dependent_sequences.length,5);
assert.equal(data.scratch_update.tracks.find(t=>t.name==="Mountaineer").scratch_count,21);
assert.equal(data.scratch_update.tracks.find(t=>t.name==="Parx Racing").scratches["9"].length,4);
assert.equal(data.scratch_update.tracks.find(t=>t.name==="Finger Lakes").score_input_changes.some(x=>x.type==="jockey"&&x.race===7),true);
const stale={date:"2026-11-23",track:"Finger Lakes",revision:1,status:"initial_current"};
assert.equal(sourceIsScratchCurrent(stale),false,"old prescratch cards must not be shown after real scratch changes");
// V3.2 release must not carry forward stale prescratch horses or hit estimates.
const ticketApi=fs.readFileSync("./src/pick-tickets.js","utf8");
assert.doesNotMatch(ticketApi,/\.map\(restoreInterimSelection\)/,"V3.2 never uses scratch-only filtered old picks");
const revision={...stale,status:"scratch_updated",revision:2,scratch_verified_at:"2026-11-23T17:30:00Z",sequences:[
 {name:"Pick 3",start_race:1,end_race:3,tickets:[{legs:[{race_number:1,programs:["2"]},{race_number:2,programs:["1"]},{race_number:3,programs:["1"]}]}],race_fields:[]}
]};
assert.equal(sourceIsScratchCurrent(revision),false,"a scratch-final revision can never select withdrawn #2 from Race 1");
revision.sequences[0].tickets[0].legs[0].programs=["1"];
assert.equal(sourceIsScratchCurrent(revision),true,"a properly timestamped revision without scratched entries is allowed");
revision.sequences[0].race_fields=[{race_number:3,programs:["2"]}];
assert.equal(sourceIsScratchCurrent(revision),false,"scratch-final eligible fields cannot include withdrawn runner");
assert.equal(officialScratchSequenceCount(PICK_MENU_1123).every(t=>t.impacted>0),true);
assert.equal(data.intake.tracks.length,5);
assert.equal(data.intake.tracks.reduce((n,t)=>n+t.race_count,0),45);
assert.equal(data.intake.tracks.reduce((n,t)=>n+t.analysis_runner_count,0),367);
assert.equal(data.intake.status,"PRESCRATCH_SOURCE_RECEIVED__TICKETS_HOLD");
assert.match(data.intake.missing_gate,/scoring receipt/);
assert.equal(Object.keys(getPickTicketsIntake()).some(k=>/selections|pwin|win_probability|tickets/i.test(k)),false,"intake must not leak paid runner selections or probabilities");
assert.equal(data.cards[0].card.revision,2);
assert.equal(data.cards[0].card.status,"scratch_updated");
assert.equal(data.cards[0].card.formula_version,PICK_V32_ENGINE);
assert.equal(data.engine,PICK_V32_ENGINE);
assert.equal(listing.headers.get("Cache-Control"),"private, no-store");
const wrongBatch=[card(),({...card(),date:"2026-11-24",revision:3,sequences:[{...card().sequences[0],tickets:[]} ]})];
result=await post({cards:wrongBatch});assert.equal(result.response.status,400);
assert.equal(env.CARDS_BUCKET.objects.size,3,"a bad batch writes nothing");
// Test-only synthetic records must never be served through a production endpoint or written to R2.
const demoResponse=await handleAdminPickTickets(new Request("https://railandryeracing.com/api/admin/pick-tickets?demo=1"),env);
const protectedListing=await demoResponse.json();
assert.equal(protectedListing.demo,false,"demo URL parameter cannot select fictional cards");
assert.equal(protectedListing.cards.length,1,"GET always returns real R2 records only");
const mock=getPickTicketsPrivateDemo();
assert.equal(mock.cards.length,5);
result=await post({cards:mock.cards.map(x=>x.card)});
assert.equal(result.response.status,400,"synthetic test records cannot be saved as certified tickets");
assert.match(result.body.error,/Mock layout selections cannot be uploaded/);
assert.equal(env.CARDS_BUCKET.objects.size,3,"synthetic QA data never alters paid R2 storage");
const route=fs.readFileSync("./src/index.js","utf8");
const page=fs.readFileSync("./public/admin/pick-tickets-preview.html","utf8");
const css=fs.readFileSync("./public/assets/pick-tickets-dashboard.css","utf8");
const js=fs.readFileSync("./public/assets/pick-tickets-dashboard.js","utf8");
assert.match(route,/verifyAdmin\(request,env\)/,"admin routes must verify signed Access JWT");
assert.match(route,/if\(path==="\/api\/admin\/pick-tickets"\)/);
assert.match(route,/trustedOrigin\(request\)/);
assert.ok(route.includes('["/admin/pick-tickets-preview","/admin/pick-tickets-preview.html"]'),"Pick Tickets preview must remain on the existing protected admin router.");
assert.doesNotMatch(page,/PRIVATE PREVIEW|CUSTOMER ACCESS OFF|<input[^>]+type="file"|JSON/,"No manual file input or review labels.");
assert.doesNotMatch(page,/application\/pdf|\.pdf"/i);
assert.match(css,/@media\(max-width:800px\)/);
assert.match(css,/minmax\(0,1fr\)/);
assert.match(js,/\/assets\/approved\/saddlecloths\//);
assert.match(js,/rr-pt-builder/);
assert.match(js,/matchingSourceTicket/);
assert.match(js,/Not available/,"Unavailable probabilities are clearly marked without production-stage labels.");
assert.match(page,/rr-intel-header__brand/,"Pick Tickets shares the canonical homepage-style header.");
assert.doesNotMatch(page,/rr-pt-brand-rail/,"Remove the duplicate Rail & Rye masthead.");
assert.match(page,/rr-pt-track-logo/);
assert.doesNotMatch(page,/Mock layout preview|VALUE ESTIMATE|PAYOUT|ROI/i);
assert.doesNotMatch(js,/VALUE ESTIMATE|PAYOUT|POOL SIZE|ROI/i);
assert.match(js,/COST CHANGE/);
assert.doesNotMatch(js,/rr-pt-upload|rr-pt-file|PRESCRATCH MODEL REVIEW|PRIVATE MOCK DISPLAY/,"No upload controls or model-review labels.");
assert.doesNotMatch(js,/call\("\/api\/admin\/pick-tickets\?demo=1"\)/);

for(const slug of ["finger-lakes","mahoning-valley","mountaineer","parx-racing","zia-park"]){
 assert.ok(fs.existsSync("./public/assets/approved/track-logos/"+slug+".webp"),"verified original artwork present for "+slug);
}
assert.doesNotMatch(js,/localStorage|sessionStorage|\/api\/products/);
console.log("Pick Tickets schema, source fidelity, private R2, idempotence, revision safety, auth route and static UI checks PASS.");

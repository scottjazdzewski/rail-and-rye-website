import assert from "node:assert/strict";
import fs from "node:fs";
import {normalizePickTickets,handleAdminPickTickets} from "./src/pick-tickets.js";

const receipt={reference:"SYNTHETIC-TEST-ONLY",sha256:"a".repeat(64)};
const ticket=(role="BEST_POSSIBLE")=>({
 role,title:role==="BEST_POSSIBLE"?"Synthetic best":"Synthetic lean",unit_cents:50,
 combinations:2,total_cents:100,
 legs:[{race_number:1,programs:["1","1A"]},{race_number:2,programs:["3"]},{race_number:3,programs:["10"]}],
 notes:"Only test data, never a published recommendation."
});
const card=()=>({
 schema_version:1,product_type:"pick_tickets",date:"2026-11-23",track:"Synthetic QA Track",
 revision:1,status:"initial_current",source_receipt:{...receipt},sequences:[
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
assert.equal(data.cards[0].card.revision,2);
assert.equal(data.cards[0].card.status,"scratch_updated");
assert.equal(listing.headers.get("Cache-Control"),"private, no-store");
const wrongBatch=[card(),({...card(),date:"2026-11-24",revision:3,sequences:[{...card().sequences[0],tickets:[]} ]})];
result=await post({cards:wrongBatch});assert.equal(result.response.status,400);
assert.equal(env.CARDS_BUCKET.objects.size,3,"a bad batch writes nothing");
// Mock fixture is available ONLY through protected admin route and cannot enter paid R2 storage.
const demoResponse=await handleAdminPickTickets(new Request("https://railandryeracing.com/api/admin/pick-tickets?demo=1"),env);
const mock=await demoResponse.json();
assert.equal(mock.demo,true);
assert.equal(mock.cards.length,5);
assert.equal(mock.cards[0].card.sequences.filter(s=>s.end_race-s.start_race+1===3).length,3);
assert.equal(mock.cards[0].card.sequences[2].play_status,"PASS");
assert.equal(mock.cards[0].card.sequences[2].tickets[0].role,"BEST_POSSIBLE");
assert.equal(mock.cards[0].card.sequences[0].hit_rate_display,"","mock projections may never be fabricated");
result=await post({cards:mock.cards.map(x=>x.card)});
assert.equal(result.response.status,400,"synthetic dashboard data cannot be saved as source-certified tickets");
assert.match(result.body.error,/Mock layout selections cannot be uploaded/);
assert.equal(env.CARDS_BUCKET.objects.size,3,"mock previews never alter paid R2 storage");
const route=fs.readFileSync("./src/index.js","utf8");
const page=fs.readFileSync("./public/admin/pick-tickets-preview.html","utf8");
const css=fs.readFileSync("./public/assets/pick-tickets-dashboard.css","utf8");
const js=fs.readFileSync("./public/assets/pick-tickets-dashboard.js","utf8");
assert.match(route,/verifyAdmin\(request,env\)/,"admin routes must verify signed Access JWT");
assert.match(route,/if\(path==="\/api\/admin\/pick-tickets"\)/);
assert.match(route,/trustedOrigin\(request\)/);
assert.ok(route.includes('["/admin/pick-tickets-preview","/admin/pick-tickets-preview.html"]'),"Pick Tickets preview must remain on the existing protected admin router.");
assert.match(page,/PRIVATE PREVIEW · CUSTOMER ACCESS OFF/);
assert.doesNotMatch(page,/application\/pdf|\.pdf"/i);
assert.match(css,/@media\(max-width:800px\)/);
assert.match(css,/minmax\(0,1fr\)/);
assert.match(js,/\/assets\/approved\/saddlecloths\//);
assert.match(js,/rr-pt-builder/);
assert.match(js,/matchingSourceTicket/);
assert.match(js,/AWAITING MODEL/);
assert.match(page,/rr-pt-brand-rail/);
assert.match(page,/rr-pt-track-logo/);
for(const slug of ["finger-lakes","mahoning-valley","mountaineer","parx-racing","zia-park"]){
 assert.ok(fs.existsSync("./public/assets/approved/track-logos/"+slug+".webp"),"verified original artwork present for "+slug);
}
assert.doesNotMatch(js,/localStorage|sessionStorage|\/api\/products/);
console.log("Pick Tickets schema, source fidelity, private R2, idempotence, revision safety, auth route and static UI checks PASS.");

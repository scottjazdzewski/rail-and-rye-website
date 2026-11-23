import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const code=readFileSync(new URL("./src/projections.js",import.meta.url),"utf8");
const {handleAdminProjectionBatchUpload,readAdminProjectionCards}=await import("data:text/javascript;charset=utf8,"+encodeURIComponent(code));

const f4a={exact_p1:.65,exact_p2:.20,exact_p3:.10,exact_p4:.03,exact_p5:.02,p6_plus:0,top2:.85,top3:.95,top4:.98};
const f4b={exact_p1:.35,exact_p2:.20,exact_p3:.15,exact_p4:.10,exact_p5:.10,p6_plus:.10,top2:.55,top3:.70,top4:.80};
const horse=(program_number,horse_name,win_probability,exact,f4)=>({
 program_number,horse_name,rank:null,win_probability,win_probability_exact:exact,
 fair_odds:"2.00/1",fair_odds_net_to_1_exact:2.0,
 morning_line:"3-1",trainer:"Real verified trainer",jockey:"Real verified jockey",metrics:[],notes:"",f4_probabilities:f4
});
const card={
 schema_version:1,race_date:"2026-11-23",track_name:"Synthetic Test Track",
 projection_status:"prescratch",model_name:"Frozen TRI TJ V4.1 PWIN + F4 V2",fair_odds_basis:"net_to_1_review",
 races:[{race_number:1,post_time_et:"1:00 PM ET",surface:"Dirt",distance:"6 F",conditions:"Allowance",purse:"$20,000",pace:"",
 scratch_count:null,scratches:[],entries:[horse("1","Horse A",65,65,f4a),horse("2","Horse B",35,35,f4b)]}]
};
const stored=new Map();
const env={CARDS_BUCKET:{
 async put(key,value,config){stored.set(key,{value,customMetadata:config.customMetadata});},
 async list(){return {objects:[...stored.keys()].map(key=>({key}))};},
 async get(key){const file=stored.get(key);return file?{customMetadata:file.customMetadata,text:async()=>file.value}:null;}
}};
const upload=async data=>handleAdminProjectionBatchUpload(new Request("https://example.invalid/api/admin/projections/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cards:[data]})}),env);
let response=await upload(card);
assert.equal(response.status,200,await response.clone().text());
const body=await response.json();
assert.equal(body.tracks,1);assert.equal(body.races,1);assert.equal(body.entries,2);
assert.equal(stored.size,1);
const readResponse=await readAdminProjectionCards(env);
assert.equal(readResponse.status,200);
const saved=(await readResponse.json()).cards[0].card;
assert.equal(saved.projection_status,"prescratch");
assert.equal(saved.model_name,card.model_name);
assert.equal(saved.fair_odds_basis,"net_to_1_review");
assert.equal(saved.races[0].scratch_count,null,"Do not misrepresent unverified scratches as zero");
assert.equal(saved.races[0].entries[0].win_probability_exact,65);
assert.equal(saved.races[0].entries[0].f4_probabilities.top4,.98);
assert.equal(saved.races[0].entries[1].f4_probabilities.p6_plus,.10);

async function rejects(mutate,message){
 const copy=structuredClone(card);mutate(copy);
 const result=await upload(copy);assert.equal(result.status,400,message);
 const err=(await result.json()).error;
 assert.match(err,message,"Must fail closed on inconsistent source fields");
}
await rejects(x=>{x.races[0].scratch_count=0;},/scratch counts/i);
await rejects(x=>{x.races[0].entries[0].f4_probabilities.exact_p1=.64;},/F4 place probabilities|F4 first-place probability/i);
await rejects(x=>{x.races[0].entries[0].win_probability_exact=64;},/F4 first-place probability/i);
await rejects(x=>{x.races[0].entries[0].f4_probabilities=null;},/exact PWIN and F4/i);
await rejects(x=>{x.races[0].entries[1].win_probability=33;x.races[0].entries[1].win_probability_exact=33; x.races[0].entries[1].f4_probabilities.exact_p1=.33;x.races[0].entries[1].f4_probabilities.p6_plus=.12;x.races[0].entries[1].f4_probabilities.top2=.53;x.races[0].entries[1].f4_probabilities.top3=.68;x.races[0].entries[1].f4_probabilities.top4=.78;},/100%/i);
console.log("PASS: authenticated batch endpoint schema preserves prescratch TRI + F4, keeps scratch status unknown and rejects invalid scores");


const hashes={tri_sha256:"a".repeat(64),f4_sha256:"b".repeat(64),prescratch_parent_sha256:"c".repeat(64),official_changes_sha256:"d".repeat(64)};
const finalized=structuredClone(card);
finalized.projection_status="scratch_final";
finalized.factor_basis="verified_prescratch";
finalized.model_receipts=hashes;
finalized.races[0].scratch_count=1;
finalized.races[0].scratches=[{program_number:"3",horse_name:"Synthetic Scratch"}];
response=await upload(finalized);
assert.equal(response.status,200,await response.clone().text());
const finalRead=await readAdminProjectionCards(env);
const finalStored=(await finalRead.json()).cards[0].card;
assert.equal(finalStored.projection_status,"scratch_final");
assert.equal(finalStored.races[0].scratch_count,1);
assert.equal(finalStored.races[0].scratches[0].program_number,"3");
assert.deepEqual(finalStored.model_receipts,hashes);
assert.equal(finalStored.factor_basis,"verified_prescratch");
const downgraded=await upload(card);
assert.equal(downgraded.status,409,"Never overwrite a scratch-final run with an older prescratch version");
async function finalRejects(mutate,message){
 const candidate=structuredClone(finalized);mutate(candidate);
 const reply=await upload(candidate);
 assert.equal(reply.status,400,await reply.clone().text());
 assert.match((await reply.json()).error,message);
}
await finalRejects(x=>{delete x.model_receipts;},/receipt hashes/i);
await finalRejects(x=>{x.races[0].scratch_count=0;},/full official scratch list/i);
await finalRejects(x=>{x.races[0].scratches[0].program_number="1";},/scratched horse cannot remain/i);
await finalRejects(x=>{x.races[0].entries[0].win_probability_exact=70;},/F4 first-place probability/i);
console.log("PASS: receipt-traced scratch-final models, complete scratches, PWIN/F4 integrity and no prescratch downgrades");

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const {handleAdminProjectionBatchUpload,readAdminProjectionCards}=await import("./src/projections.js");

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
 async get(key){const file=stored.get(key);return file?{customMetadata:file.customMetadata,text:async()=>file.value,json:async()=>JSON.parse(file.value)}:null;}
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
assert.equal(saved.daily_double_pools,undefined,"Legacy cards without pool metadata never imply DD eligibility.");

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


// Realistic four-runner signed joint distribution, distinct from the original
// two-runner prescratch smoke fixture. Scratch release must fail before F4 is
// published, and must not downgrade the already published version.
const hashes={tri_sha256:"a".repeat(64),f4_sha256:"b".repeat(64),prescratch_parent_sha256:"c".repeat(64),official_changes_sha256:"d".repeat(64)};
const programs=["1","2","4","7"],pwin=[.4,.3,.2,.1],w2=[1,2,3,4],w3=[1.5,2.5,3.5,4.5];
const positions=programs.map(()=>Array(4).fill(0));
const total2=w2.reduce((a,b)=>a+b,0),total3=w3.reduce((a,b)=>a+b,0);
for(let i=0;i<4;i++)for(let j=0;j<4;j++){
 if(i===j)continue;
 const p2=pwin[i]*w2[j]/(total2-w2[i]);
 positions[i][0]+=p2;positions[j][1]+=p2;
 for(let k=0;k<4;k++){
  if(k===i||k===j)continue;
  const p3=p2*w3[k]/(total3-w3[i]-w3[j]);
  positions[k][2]+=p3;
  for(let l=0;l<4;l++)if(l!==i&&l!==j&&l!==k)positions[l][3]+=p3;
 }
}
const finalized=structuredClone(card);
finalized.projection_status="scratch_final";
finalized.factor_basis="verified_prescratch";
finalized.model_receipts=hashes;
finalized.races[0].scratch_count=1;
finalized.races[0].scratches=[{program_number:"3",horse_name:"Synthetic Scratch"}];
finalized.races[0].entries=programs.map((program,i)=>{
 const v=positions[i],p=pwin[i],f4={exact_p1:p,exact_p2:v[1],exact_p3:v[2],exact_p4:v[3],exact_p5:0,p6_plus:0,
  top2:p+v[1],top3:p+v[1]+v[2],top4:1};
 return {...horse(program,"Synthetic "+program,Number((p*100).toFixed(1)),p*100,f4),
  fair_odds_net_to_1_exact:1/p-1,fair_odds:(1/p-1).toFixed(2)+"/1"};
});
response=await upload(finalized);
assert.equal(response.status,409,"Never publish scratch-final cards before matching F4 exotic probabilities are available");
assert.equal(stored.size,1,"Rejected release must not write an inconsistent dashboard");
const model={schema_version:2,model_id:"TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET",
 date:"2026-11-23",track_name:card.track_name,scratch_state:"SCRATCH_FINAL",
 f4_receipt_sha256:hashes.f4_sha256,prefix_file_sha256:"e".repeat(64),
 dashboard_receipts:hashes,races:[{race_number:1,programs,pwin,p2_weights:w2,p3_weights:w3}]};
const modelKey="projections/f4-ordered/2026-11-23/synthetic-test-track.json";
stored.set(modelKey,{value:JSON.stringify(model),customMetadata:{}});
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
const badModel=structuredClone(model);badModel.dashboard_receipts.f4_sha256="f".repeat(64);
stored.set(modelKey,{value:JSON.stringify(badModel),customMetadata:{}});
response=await upload(finalized);
assert.equal(response.status,409,"Reject future scratch updates if their F4 receipt no longer matches");
console.log("PASS: scratch-final cards publish only with identical, source-verified F4 joint probabilities for all races");

// Timeform WAGERS is the source of truth for available Daily Double pools.
const dailyDoubleCard=structuredClone(card);
dailyDoubleCard.race_date="2026-11-24";
dailyDoubleCard.track_name="Synthetic Daily Double Track";
dailyDoubleCard.races=[structuredClone(card.races[0]),{...structuredClone(card.races[0]),race_number:2}];
dailyDoubleCard.races[0].timeform_wagers="WAGERS: Exacta, Trifecta, Double Wagers.";
response=await upload(dailyDoubleCard);
assert.equal(response.status,200,await response.clone().text());
const doubleRead=await readAdminProjectionCards(env);
const doubleSaved=(await doubleRead.json()).cards.find(item=>item.card.track_name==="Synthetic Daily Double Track")?.card;
assert.deepEqual(doubleSaved?.daily_double_pools,[{
 first_race_number:1,second_race_number:2,source:"timeform_wagers",
 wager_text:"WAGERS: Exacta, Trifecta, Double Wagers."
}],"Timeform WAGERS on the first leg creates one eligible next-race pool.");

const forgedCard=structuredClone(dailyDoubleCard);
forgedCard.race_date="2026-11-25";forgedCard.track_name="Forged Daily Double Track";
forgedCard.daily_double_pools=[{first_race_number:1,second_race_number:3,source:"timeform_wagers",
 wager_text:"WAGERS: Exacta, Trifecta, Double Wagers."}];
const forged=await upload(forgedCard);
assert.equal(forged.status,400,"Declared pool pairs must match Timeform WAGERS-derived pairs.");

const secondHalfCard=structuredClone(card);
secondHalfCard.race_date="2026-11-25";secondHalfCard.track_name="Second Half Daily Double Track";
secondHalfCard.races=[structuredClone(card.races[0]),{...structuredClone(card.races[0]),race_number:2}];
secondHalfCard.races[0].timeform_wagers="WAGERS: 2nd Half Daily Double.";
response=await upload(secondHalfCard);
assert.equal(response.status,200,await response.clone().text());
const secondHalfRead=await readAdminProjectionCards(env);
const secondHalfSaved=(await secondHalfRead.json()).cards.find(item=>item.card.track_name==="Second Half Daily Double Track")?.card;
assert.equal(secondHalfSaved?.daily_double_pools,undefined,"A second-half menu line does not start another pool.");

console.log("PASS: Timeform WAGERS creates eligible pools; unsupported and second-half entries fail closed");

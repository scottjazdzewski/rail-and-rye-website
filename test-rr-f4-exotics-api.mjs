import assert from "node:assert/strict";
import {readCertifiedF4Exotics,verifyCertifiedScratchFinalTrack} from "./src/f4-exotics.js";
const source="a".repeat(64),badge="b".repeat(64),receipt="c".repeat(64),prefix="d".repeat(64);
const programs=["4","1","2","3"],pwin=[.4,.3,.2,.1],w2=[1,2,3,4],w3=[.5,1,1.5,2];
const sums2=w2.reduce((a,b)=>a+b,0),sums3=w3.reduce((a,b)=>a+b,0);
const m2=programs.map(()=>0),m3=programs.map(()=>0);
for(let i=0;i<programs.length;i++)for(let j=0;j<programs.length;j++){
 if(i===j)continue;
 const exacta=pwin[i]*w2[j]/(sums2-w2[i]);m2[j]+=exacta;
 for(let k=0;k<programs.length;k++){
  if(k===i||k===j)continue;
  m3[k]+=exacta*w3[k]/(sums3-w3[i]-w3[j]);
 }
}
const race={race_number:1,entries:programs.map((program,i)=>({
 program_number:program,horse_name:"Verified "+program,
 win_probability_exact:pwin[i]*100,
 f4_probabilities:{exact_p1:pwin[i],exact_p2:m2[i],exact_p3:m3[i]}
}))};
const card={race_date:"2026-11-23",track_name:"Finger Lakes",
 projection_status:"prescratch",races:[race]};
const blob={schema_version:2,model_id:"TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET",
 date:"2026-11-23",scratch_state:"PRESCRATCH",track_name:"Finger Lakes",
 source_sha256:source,badge_sha256:badge,f4_receipt_sha256:receipt,
 prefix_file_sha256:prefix,races:[{race_number:1,programs,pwin,
 p2_weights:w2,p3_weights:w3}]};
const url=new URL("https://railandryeracing.com/api/admin/projections-f4?date=2026-11-23&track=Finger%20Lakes&race=1");
const env=(c=card,f=blob,metadata={source_sha256:source,badge_sha256:badge})=>({
 CARDS_BUCKET:{async get(key){
  if(key.startsWith("projections/dashboard/"))return c?{json:async()=>c,customMetadata:metadata}:null;
  if(key.startsWith("projections/f4-ordered/"))return f?{json:async()=>f}:null;
  throw Error("Unexpected public/storage path "+key);
 }}
});
const good=await readCertifiedF4Exotics(env(),url);
assert.equal(good.status,200);
const result=(await good.json()).f4;
assert.equal(result.status,"verified");
assert.deepEqual(result.programs,programs);
assert.deepEqual(result.pwin,pwin);
assert.deepEqual(result.p2_weights,w2);
assert.deepEqual(result.p3_weights,w3);
assert.equal(good.headers.get("Cache-Control"),"private, no-store");
const bads=[
 [env({...card,projection_status:"scratch-updated"}),409],
 [env({...card,races:[{...race,entries:race.entries.slice(1)}]}),409],
 [env({...card,races:[{...race,entries:race.entries.map((x,i)=>i?x:{...x,win_probability_exact:35})}]}),409],
 [env(card,blob,{source_sha256:"e".repeat(64),badge_sha256:badge}),409],
 [env(card,blob,{source_sha256:source,badge_sha256:"e".repeat(64)}),409],
 [env(card,{...blob,races:[{...blob.races[0],p2_weights:[1,2,3,3]}]}),409],
 [env(card,{...blob,source_sha256:"not-a-hash"}),409],
 [env(card,null),404],
];
for(const [context,status] of bads){
 const reply=await readCertifiedF4Exotics(context,url);
 assert.equal(reply.status,status,"Fail closed for mismatched F4 model, roster or scratch state");
}
const invalid=await readCertifiedF4Exotics(env(),new URL("https://railandryeracing.com/api/admin/projections-f4?date=2026-11-23&track=Finger%20Lakes&race=26"));
assert.equal(invalid.status,400);
console.log("PASS: authenticated-source F4 odds endpoint checks original source, badges, live field, P1/P2/P3 and holds on scratches");

const lineage={tri_sha256:"a".repeat(64),f4_sha256:receipt,prescratch_parent_sha256:"b".repeat(64),official_changes_sha256:"d".repeat(64)};
const scratchRace={...race,scratch_count:1,scratches:[{program_number:"7",horse_name:"Synthetic scratch"}]};
const scratchCard={...card,projection_status:"scratch_final",model_receipts:lineage,races:[scratchRace]};
const scratchF4={...blob,scratch_state:"SCRATCH_FINAL",dashboard_receipts:lineage};
delete scratchF4.source_sha256;
delete scratchF4.badge_sha256;
const valid=await readCertifiedF4Exotics(env(scratchCard,scratchF4),url);
assert.equal(valid.status,200,"Verified scratch-final F4 joint distribution is deliverable");
const certified=(await valid.json()).f4;
assert.equal(certified.scratch_state,"SCRATCH_FINAL");
assert.equal(certified.dashboard_receipts.f4_sha256,receipt);
assert.equal(verifyCertifiedScratchFinalTrack(scratchCard,scratchF4),true);
assert.equal(verifyCertifiedScratchFinalTrack(scratchCard,{...scratchF4,model_id:"incorrect"}),false);
const errors=[
 [env(scratchCard,blob),409],
 [env(scratchCard,{...scratchF4,dashboard_receipts:{...lineage,official_changes_sha256:"e".repeat(64)}}),409],
 [env(scratchCard,{...scratchF4,prefix_file_sha256:"invalid"}),409],
 [env({...scratchCard,races:[{...scratchRace,scratches:[{program_number:"4"}]}]},scratchF4),409],
 [env({...scratchCard,races:[{...scratchRace,entries:scratchRace.entries.slice(1)}]},scratchF4),409]
];
for(const [context,status] of errors){
 const reply=await readCertifiedF4Exotics(context,url);
 assert.equal(reply.status,status,"Never use stale or mismatched F4 after a scratch revision");
}
console.log("PASS: scratch-final source, receipt linkage, active field and F4 marginals are verified before returning ticket odds");

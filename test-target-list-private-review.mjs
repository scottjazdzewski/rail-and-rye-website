import assert from "node:assert/strict";
import {createHash,webcrypto} from "node:crypto";
import {readAdminTargetListReview} from "./src/target-list.js";
globalThis.crypto??=webcrypto;
const SHA="a".repeat(64);
const horse=(program_number,horse_name,win_probability)=>({program_number,horse_name,morning_line:"3/1",win_probability,fair_odds:"5/2",unrounded_verified_pwin:null});
const entry={rank:1,track:"Synthetic Review Track",race_number:4,post_time_et:"3:15 PM",surface:"Dirt",distance:"6F",
 favorite:horse("2","Sample Favorite",12),attack:horse("6","Sample Attack",39),
 analysis:"Synthetic source commentary, not a real customer selection."};
const edition={schema_version:1,product_type:"target_list",race_date:"2026-11-23",revision:1,status:"initial",
 review_only:true,customer_publish_approved:false,production_receipt_verified:false,
 source:{editorial_sha256:SHA,timeforms_zip_sha256:SHA,tri_full_field_receipt_id:null,tri_unrounded_scoring_receipt_sha256:null},
 targets:[entry]};
const store=new Map();
const save=(key,x,metadata)=>{
 const json=JSON.stringify(x),sha256=createHash("sha256").update(json).digest("hex");
 store.set(key,{json,metadata:{sha256,...metadata}});
};
const key="racing-intelligence/target-list-review/2026-11-23/revision-0001.json";
save(key,edition,{uploaded_at:"2026-11-23T05:00:00Z"});
const projectionsKey="projections/dashboard/2026-11-23/synthetic-review-track.json";
save(projectionsKey,{schema_version:1,race_date:"2026-11-23",track_name:"Synthetic Review Track",
 races:[{race_number:4,distance:"6F",surface:"Dirt",conditions:"Allowance / Optional Claiming",
  entries:[{program_number:"2",horse_name:"Sample Favorite"}]}]});

const bucket={
 async list({prefix}){return {objects:[...store.keys()].filter(x=>x.startsWith(prefix)).map(key=>({key})),truncated:false};},
 async get(key){const o=store.get(key);return o?{customMetadata:o.metadata,text:async()=>o.json}:null;}
};
const api=(date)=>readAdminTargetListReview({CARDS_BUCKET:bucket},new URL("https://railandryeracing.com/api/admin/target-list-review"+(date?"?date="+date:"")));
let r=await api();
assert.equal(r.status,200);
let data=await r.json();
assert.equal(data.review_only,true);
assert.equal(data.demo_example,false);
assert.equal(data.edition.targets.length,1);
assert.equal(data.edition.targets[0].attack.horse_name,"Sample Attack");
assert.equal(data.edition.targets[0].conditions,"Allowance / Optional Claiming",
 "Match stored TRI race class using track, race, program, and horse identity.");
assert.equal(data.edition.production_receipt_verified,false);
assert.deepEqual(data.dates,["2026-11-23"]);
assert.equal(r.headers.get("X-Robots-Tag"),"noindex, nofollow, noarchive");
assert.match(r.headers.get("Cache-Control"),/no-store/);
r=await api("2026-11-22");assert.equal(r.status,200);assert.equal((await r.json()).edition,null);
r=await api("2026-02-30");assert.equal(r.status,400);
const bad={...edition,customer_publish_approved:true};
save(key,bad);
r=await api();assert.equal(r.status,503,"Review endpoint must never return customer-approved results.");
save(key,edition,{sha256:"0".repeat(64)});
r=await api();assert.equal(r.status,503,"R2 object checksum failures must fail closed.");
const lower={...edition,targets:[{...entry,attack:{...entry.attack,win_probability:10}}]};
save(key,lower);
r=await api();assert.equal(r.status,503,"ATTACK must exceed source published favorite probability.");
store.clear();
r=await api();assert.equal((await r.json()).edition,null);
console.log("PASS: admin-only Target List review reader, source data, no-store, sha256, review-only gate, date selection, empty state.");
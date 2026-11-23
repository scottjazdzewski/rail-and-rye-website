import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";
import {validateTargetList,handleAdminTargetList} from "./src/target-list.js";

globalThis.crypto??=webcrypto;
const root="https://railandryeracing.com";
const h="a".repeat(64);
const horse=(number,name,pwin)=>({program_number:String(number),horse_name:name,morning_line:"5-1",win_probability:pwin,fair_odds:"4-1",trainer:"",jockey:""});
const base={schema_version:1,product_type:"target_list",race_date:"2026-11-23",revision:1,status:"initial",
 source:{receipt_id:"synthetic-unit-test-only",sha256:h},
 targets:[{rank:1,track:"Synthetic Test Track",race_number:5,tier:"PRIME",post_time_et:"3:10 PM ET",surface:"Dirt",distance:"6 furlongs",
  favorite:horse("1","Favorite Runner",24),attack:horse("12","Attack Runner",35),
  analysis:"This is synthetic, non-customer test commentary."}]};
const copy=()=>structuredClone(base);
const good=validateTargetList(base);
assert.equal(good.targets[0].attack.win_probability,35);
assert.equal(good.targets[0].rank,1);
assert.equal(good.status,"initial");
assert.equal(good.targets[0].favorite.horse_name,"Favorite Runner");
function bad(mutator,message){
 const v=copy();mutator(v);assert.throws(()=>validateTargetList(v),message);
}
bad(v=>{v.targets[0].attack.win_probability=24;},/higher certified PWIN/);
bad(v=>{v.targets[0].attack.win_probability=101;},/probability/);
bad(v=>{v.targets[0].favorite.fair_odds="";},/fair odds/);
bad(v=>{v.source.sha256="unverified";},/64-character/);
bad(v=>{v.status="final";},/initial or scratch_update/);
bad(v=>{v.targets[0].tier="SUPER PRIME";},/PRIME or STRONG/);
bad(v=>{v.targets.push({...v.targets[0],rank:2});},/Duplicate target race/);
bad(v=>{v.targets.push({...v.targets[0],race_number:6});},/distinct/);
bad(v=>{v.targets[0].attack.program_number="1";},/different horses/);
bad(v=>{v.targets[0].scratches=[{program_number:"3",horse_name:"Scratch"}];},/Initial edition/);
const noSelection=copy();noSelection.targets=[];
assert.equal(validateTargetList(noSelection).targets.length,0,"No forced top-N when no races qualify.");

const objects=new Map();
const bucket={
 async list({prefix}){return {objects:[...objects.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false};},
 async put(key,value,options){objects.set(key,{value,customMetadata:options.customMetadata});},
 async get(key){const record=objects.get(key);return record?{customMetadata:record.customMetadata,text:async()=>record.value}:null;}
};
const env={CARDS_BUCKET:bucket};
const post=value=>handleAdminTargetList(new Request(root+"/api/admin/target-list",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value)}),env,new URL(root+"/api/admin/target-list"));
const read=date=>handleAdminTargetList(new Request(root+"/api/admin/target-list"+(date?"?date="+date:"")),env,new URL(root+"/api/admin/target-list"+(date?"?date="+date:"")));
let result=await read();
assert.equal(result.status,200);
assert.equal((await result.json()).edition,null);
result=await post(base);
assert.equal(result.status,201,await result.clone().text());
assert.equal(objects.size,1);
const initialKey=[...objects.keys()][0];
assert.match(initialKey,/racing-intelligence\/target-list\/2026-11-23\/revision-0001\.json/);
result=await post(base);
assert.equal(result.status,200);assert.equal((await result.json()).unchanged,true,"Identical uploads are idempotent.");
const changed=copy();changed.targets[0].analysis="Different editorial selection.";
result=await post(changed);
assert.equal(result.status,409,"Never silently overwrite an existing revision.");
let skip=copy();skip.revision=3;skip.status="scratch_update";
result=await post(skip);
assert.equal(result.status,409,"Revision sequence must not skip audit steps.");
const revised=copy();revised.revision=2;revised.status="scratch_update";revised.targets[0].scratches=[{program_number:"4",horse_name:"Scratched Horse"}];
result=await post(revised);
assert.equal(result.status,201);
result=await read();
const latest=await result.json();
assert.equal(latest.edition.revision,2,"Latest revision replaces initial on private preview.");
assert.equal(latest.edition.targets[0].scratches[0].horse_name,"Scratched Horse");
assert.deepEqual(latest.dates,["2026-11-23"]);
assert.doesNotMatch(JSON.stringify(latest),/projections\/dashboard/);
result=await read("2026-11-22");assert.equal((await result.json()).edition,null);
result=await handleAdminTargetList(new Request(root+"/api/admin/target-list",{method:"DELETE"}),env,new URL(root+"/api/admin/target-list"));
assert.equal(result.status,405);

const html=readFileSync("public/admin/target-list-preview.html","utf8");
const css=readFileSync("public/assets/target-list-dashboard.css","utf8");
const js=readFileSync("public/assets/target-list-dashboard.js","utf8");
const router=readFileSync("src/index.js","utf8");
assert.match(router,/verifyAdmin\(request,env\)/,"Cloudflare Access remains the admin security authority.");
assert.match(router,/handleAdminTargetList\(request,env,new URL\(request.url\)\)/);
assert.match(router,/target-list-preview\.html/);
assert.match(html,/data-rr-preview="true"/);
assert.match(html,/name="viewport"/);
assert.match(html,/target-list-dashboard\.js/);
assert.match(html,/target-list-dashboard\.css/);
assert.doesNotMatch(html,/<iframe|Download PDF|\.pdf/i,"No PDF dependency or PDF viewer.");
assert.doesNotMatch(js,/innerHTML|localStorage/,"Never inject untrusted narrative as HTML or persist paid results.");
assert.match(js,/textContent/);
assert.match(css,/--rrh-navy:#102d53/);
assert.match(css,/--rrh-gold:#c99831/);
assert.match(css,/@media\(max-width:430px\)/);
assert.match(css,/@media\(max-width:359px\)/);
assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css,/Tinos/,"Only authoritative statistics use the card font.");
assert.match(css,/max-height:92dvh/,"Mobile bottom drawer must scroll.");
assert.doesNotMatch(js,/PWIN\s*[\*\/+-]/,"The client must not recompute probabilities.");

class El{
 constructor(tag="div"){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.value="";this.hidden=false;this.textContent="";this.files=[];}
 append(...xs){this.children.push(...xs);}
 replaceChildren(...xs){this.children=[...xs];this.textContent="";}
 addEventListener(kind,fn){this.events[kind]=fn;}
 setAttribute(name,val){this[name]=val;}
 close(){this.open=false;if(this.events.close)this.events.close();}
 showModal(){this.open=true;}
 focus(){this.focused=true;}
}
const ids=["rr-target-date","rr-target-track","rr-target-search","rr-target-status","rr-target-app","rr-target-empty","rr-target-list","rr-target-dialog","rr-target-dialog-content","rr-target-dialog-title","rr-target-count","rr-target-context","rr-target-freshness","rr-target-dialog-close","rr-target-upload-form","rr-target-file","rr-target-upload-status"];
const elements=new Map(ids.map(id=>[id,new El(id.includes("dialog")?"dialog":"div")]));
const doc={getElementById:id=>elements.get(id),createElement:tag=>new El(tag)};
const fixture={dates:["2026-11-23"],edition:good,uploaded_at:"2026-11-23T04:00:00Z"};
const context={document:doc,fetch:async()=>({ok:true,json:async()=>fixture}),Date,Intl,RegExp,Number,String,Array,Set,console,encodeURIComponent};
vm.runInNewContext(js,context,{filename:"target-list-dashboard.js"});
await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(elements.get("rr-target-app").hidden,false);
assert.match(elements.get("rr-target-count").textContent,/1 target/);
const tree=(el,fn)=>fn(el)?el:el.children.map(v=>tree(v,fn)).find(Boolean)||null;
const card=tree(elements.get("rr-target-list"),el=>el.className==="rr-target-card");
assert.ok(card,"Render a compact target card with actual source data.");
const action=tree(card,el=>el.className==="rr-target-analyze");
assert.ok(action,"Render actionable Full Analysis button.");
action.events.click();
assert.equal(elements.get("rr-target-dialog").open,true);
assert.match(elements.get("rr-target-dialog-title").textContent,/Synthetic Test Track/);
const detail=elements.get("rr-target-dialog-content");
assert.ok(tree(detail,el=>el.textContent==="This is synthetic, non-customer test commentary."),"Drawer preserves full certified source narrative.");
elements.get("rr-target-search").value="missing horse";
elements.get("rr-target-search").events.input();
assert.ok(tree(elements.get("rr-target-list"),el=>String(el.textContent).includes("No qualifying targets")),"Filtering has a clear empty state.");

console.log("PASS: Target List private upload, revision protection, no forced picks, official chips, drawer, mobile contracts, and no PDF dependency");
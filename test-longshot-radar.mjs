import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateLongshotEdition,handleAdminLongshotRadar} from "./src/longshot-radar.js";

const H="a".repeat(64),S="b".repeat(64),E="c".repeat(64);
const base=()=>({
 schema_version:1,product_type:"longshot_radar",race_date:"2026-11-23",revision:1,status:"prescratch",
 generated_at:"2026-11-23T03:15:00Z",
 receipts:{release_status:"PASS",model_sha256:H,source_sha256:S,editorial_qa_sha256:E},
 candidates:[{
  track:"Sample Course",race_number:4,program_number:"11A",horse_name:"Synthetic Unit-Test Runner",
  original_morning_line:"8/1",pwin_exact:1/6,pwin_display:16.7,
  fair_odds_display:"5/1",
  betting_case:"The pre-approved race-specific source evidence identifies a scenario at this theoretical price.",
  source_causal_evidence:"Authenticated pre-race example for unit tests only, never a customer publication.",
  counterargument_checked:"A competing runner's early pace could negate the intended trip."
 }]
});
let checks=0;
function good(input){assert.equal(validateLongshotEdition(input).candidates.length,input.candidates.length);checks++;}
function bad(edit,match){
 const item=base();edit(item);
 assert.throws(()=>validateLongshotEdition(item),match);checks++;
}
good(base());
bad(x=>x.candidates[0].original_morning_line="5/1",/at least 6\/1/);
bad(x=>{x.candidates[0].original_morning_line="12/1";x.candidates[0].pwin_exact=.14;x.candidates[0].pwin_display=14;},/exact TRI model fair odds/);
bad(x=>{x.candidates[0].original_morning_line="8/1";x.candidates[0].pwin_exact=1/7;x.candidates[0].pwin_display=14.3;},/50% provisional/);
bad(x=>x.candidates[0].pwin_display=25,/displayed PWIN/);
bad(x=>x.candidates[0].fair_odds_display="11/2",/whole-number/);
bad(x=>x.candidates[0].source_causal_evidence="",/authenticated source-causal/);
bad(x=>x.candidates[0].counterargument_checked="",/checked counterargument/);
bad(x=>x.candidates[0].betting_case="",/betting case/);
bad(x=>x.receipts.release_status="HOLD",/Release receipt/);
bad(x=>x.receipts.model_sha256="fake",/SHA-256/);
bad(x=>x.candidates.push({...x.candidates[0]}),/Duplicate/);
bad(x=>x.candidates[0].pwin_exact=22.5,/exact TRI probability/);
bad(x=>x.status="final",/status must/);
bad(x=>x.race_date="2026-02-30",/valid race_date/);
bad(x=>x.candidates[0].program_number="21",/invalid program number/);
bad(x=>x.revision=0,/positive integer revision/);
const empty=base();empty.candidates=[];good(empty); // no forced picks
const many=base();
many.candidates=Array.from({length:18},(_,i)=>({...many.candidates[0],horse_name:"Synthetic "+(i+1),program_number:String(i%20+1),race_number:Math.floor(i/20)+1}));
good(many); // no arbitrary 8-horse daily cap

const memory=new Map(),bucket={
 async list({prefix}){return {truncated:false,objects:[...memory.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};},
 async get(key){const value=memory.get(key);return value==null?null:{text:async()=>value};},
 async put(key,value){memory.set(key,value);}
};
// Simulated certified private R2 TRI projection, never shipped to the website.
const projection={
 schema_version:1,race_date:"2026-11-23",track_name:"Sample Course",projection_status:"prescratch",
 races:[{race_number:4,entries:[
  {program_number:"11A",horse_name:"Synthetic Unit-Test Runner",morning_line:"8/1",
   win_probability_exact:100/6,win_probability:16.7,f4_probabilities:{exact_p1:1/6}},
  {program_number:"2",horse_name:"Synthetic Other Runner",morning_line:"1/2",
   win_probability_exact:500/6,win_probability:83.3,f4_probabilities:{exact_p1:5/6}}
 ]}]
};
memory.set("projections/dashboard/2026-11-23/sample-course.json",JSON.stringify(projection));
const env={CARDS_BUCKET:bucket};
function req(method,item){
 return new Request("https://railandryeracing.com/api/admin/longshot-radar",{
  method,headers:method==="POST"?{"Content-Type":"application/json"}:{},
  body:method==="POST"?JSON.stringify(item):undefined
 });
}
let res=await handleAdminLongshotRadar(req("POST",base()),env);
assert.equal(res.status,200);assert.equal((await res.json()).review_only,true);checks++;
res=await handleAdminLongshotRadar(req("GET"),env);
assert.equal(res.status,200);let data=await res.json();
assert.equal(data.editions.length,1);assert.equal(data.editions[0].candidates[0].horse_name,"Synthetic Unit-Test Runner");checks++;
// A valid editorial receipt must ALSO match the signed full-field source in R2.
const mismatchProb=base();mismatchProb.pwin_exact=.2;mismatchProb.pwin_display=20;
res=await handleAdminLongshotRadar(req("POST",mismatchProb),env);
assert.equal(res.status,409);checks++; // impossible to substitute a different TRI probability
const mismatchHorse=base();mismatchHorse.candidates[0].horse_name="Different Synthetic Runner";
res=await handleAdminLongshotRadar(req("POST",mismatchHorse),env);
assert.equal(res.status,409);checks++; // no unverified source identity allowed
const mismatchMl=base();mismatchMl.candidates[0].original_morning_line="9/1";
res=await handleAdminLongshotRadar(req("POST",mismatchMl),env);
assert.equal(res.status,409);checks++; // no changed morning line even if price gate passes
const matchingZero=base();matchingZero.race_date="2026-11-24";matchingZero.candidates=[];
res=await handleAdminLongshotRadar(req("POST",matchingZero),env);
assert.equal(res.status,409);checks++; // no results does not excuse absence of scored source
res=await handleAdminLongshotRadar(req("POST",base()),env);
assert.equal(res.status,409);checks++; // old revision cannot overwrite
const invalidScratch=base();invalidScratch.revision=2;invalidScratch.generated_at="2026-11-23T03:17:00Z";invalidScratch.status="scratch_updated";
res=await handleAdminLongshotRadar(req("POST",invalidScratch),env);
assert.equal(res.status,409);checks++; // no fresh scratch-certified TRI source: cannot claim revised status
const revised=base();revised.revision=2;revised.generated_at="2026-11-23T03:17:00Z";
res=await handleAdminLongshotRadar(req("POST",revised),env);
assert.equal(res.status,200);checks++;
// Simulate an existing previously authenticated scratch-updated review; reject a downgrade.
memory.set("intelligence/longshot-radar/review/2026-11-23.json",JSON.stringify({...revised,status:"scratch_updated"}));
const downgrade=base();downgrade.revision=3;downgrade.generated_at="2026-11-23T03:18:00Z";
res=await handleAdminLongshotRadar(req("POST",downgrade),env);
assert.equal(res.status,409);checks++; // never overwrite scratch updates with prescratch
res=await handleAdminLongshotRadar(new Request("https://railandryeracing.com/api/admin/longshot-radar",{method:"DELETE"}),env);
assert.equal(res.status,405);checks++;
const noStore=await handleAdminLongshotRadar(req("GET"),{});
assert.equal(noStore.status,503);checks++;

const worker=readFileSync("src/index.js","utf8");
assert.ok(worker.indexOf("const auth=await verifyAdmin(request,env)")>=0 && worker.indexOf('if(path.startsWith("/api/admin/"))return handleAdminAPI')>worker.indexOf("const auth=await verifyAdmin(request,env)"));
assert.ok(worker.includes('if(pathname==="/api/admin/longshot-radar") return handleAdminLongshotRadar(request,env);'));
assert.ok(worker.includes('radarReview?"/admin/longshot-radar.html"'));
checks++;
const html=readFileSync("public/admin/longshot-radar.html","utf8");
const ui=readFileSync("public/assets/longshot-radar.js","utf8");
const css=readFileSync("public/assets/longshot-radar.css","utf8");
assert.ok(html.includes('name="robots" content="noindex,nofollow,noarchive"'));
assert.ok(!html.includes('Synthetic Unit-Test Runner'));
assert.ok(!ui.includes("Math.round")&&!ui.includes("pwin_exact*")); // no client-side scoring
assert.ok(css.includes("@media(max-width:800px)")&&css.includes("@media(max-width:360px)"));
assert.ok(html.includes("/assets/projections-dashboard.css")); // shared visual baseline
checks++;
console.log("PASS: "+checks+" Longshot Radar private-review unit/integration and static security/layout checks.");

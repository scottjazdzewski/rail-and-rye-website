import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {validateLongshotEdition,handleAdminLongshotRadar,handleAdminLongshotEditorialPreview} from "./src/longshot-radar.js";

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
bad(x=>{x.candidates[0].original_morning_line="8/1";x.candidates[0].pwin_exact=1/7;x.candidates[0].pwin_display=14.3;},/required original morning-line price advantage/);
bad(x=>x.candidates[0].pwin_display=25,/displayed PWIN/);
bad(x=>x.candidates[0].fair_odds_display="11/2",/whole-number/);
bad(x=>x.candidates[0].source_causal_evidence="",/authenticated source-causal/);
bad(x=>x.candidates[0].counterargument_checked="",/checked counterargument/);
bad(x=>x.candidates[0].betting_case="",/betting case/);
bad(x=>x.candidates[0].betting_case="A Timeform figure makes this runner playable.",/restricted source-provider/);
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
 // Regression: the current scored date MUST receive the same race facts as
 // Target List and the older Radar PDF. Previously only 11/23 was enriched.
 // This source fixture is an original, signed, full-field 11/24 TRI projection.
 const nov24=base();nov24.race_date="2026-11-24";
 nov24.generated_at="2026-11-24T05:00:00Z";
 nov24.candidates[0].track="Zia Park";
 nov24.candidates[0].race_number=6;
 nov24.candidates[0].program_number="5";
 nov24.candidates[0].horse_name="Verified Synthetic Zia Runner";
 const verified24={...projection,race_date:"2026-11-24",track_name:"Zia Park",
  races:[{race_number:6,distance:"6F",surface:"Dirt",
   conditions:"Zia Park Distaff Stakes",stakes_name:"Zia Park Distaff Stakes",
   is_stakes:true,entries:[
    {...projection.races[0].entries[0],program_number:"5",horse_name:"Verified Synthetic Zia Runner"},
    {...projection.races[0].entries[1],program_number:"2",horse_name:"Synthetic Zia Opponent"}
   ]}]};
 const source24="projections/dashboard/2026-11-24/zia-park.json";
 memory.set(source24,JSON.stringify(verified24));
 res=await handleAdminLongshotRadar(req("POST",nov24),env);
 assert.equal(res.status,200,"Test race must pass existing exact TRI 100% full-field cross-check.");
 res=await handleAdminLongshotRadar(req("GET"),env);
 assert.equal(res.status,200);
 data=await res.json();
 const matched24=data.editions.find(e=>e.race_date==="2026-11-24");
 assert.ok(matched24,"The current daily edition must be in the private feed.");
 assert.deepEqual([matched24.candidates[0].distance,matched24.candidates[0].surface,
  matched24.candidates[0].stakes_name],["6F","Dirt","Zia Park Distaff Stakes"],
  "Current Radar must show the same verified race description and named stake as Target List.");
 assert.equal(matched24.candidates[0].pwin_exact,1/6);
 assert.equal(matched24.candidates[0].original_morning_line,"8/1");
 assert.equal(matched24.candidates[0].betting_case,nov24.candidates[0].betting_case);
 const stored24=JSON.parse(memory.get("intelligence/longshot-radar/review/2026-11-24.json"));
 assert.equal(stored24.candidates[0].distance,undefined,
  "Source descriptions are joined at read time, never written into certified Radar data.");
 // Missing original projections: no guesses and the selection stays visible.
 memory.delete(source24);
 data=await (await handleAdminLongshotRadar(req("GET"),env)).json();
 const absent24=data.editions.find(e=>e.race_date==="2026-11-24");
 assert.equal(absent24.candidates[0].distance,undefined);
 assert.equal(absent24.candidates[0].stakes_name,undefined);
 assert.equal(absent24.candidates[0].horse_name,"Verified Synthetic Zia Runner");
 // Exact runner identity is mandatory, even when the track/race happens to match.
 const wrongHorse24={...verified24,races:verified24.races.map(r=>({...r,entries:
  r.entries.map(v=>({...v,horse_name:v.horse_name+" mismatched"}))}))};
 memory.set(source24,JSON.stringify(wrongHorse24));
 data=await (await handleAdminLongshotRadar(req("GET"),env)).json();
 assert.equal(data.editions.find(e=>e.race_date==="2026-11-24").candidates[0].distance,undefined,
  "Race title must not leak from a same-number race without an exact runner match.");
 memory.set(source24,JSON.stringify(verified24));
 checks+=6;

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

// Published PDF rows are real editorial display values but MUST NOT be
// represented as the certified full-precision original TRI PWIN.
const editorialKey="racing-intelligence/longshot-radar-pdf-review/2026-11-23/revision-0001.json";
const editorial={
 schema_version:1,product_type:"longshot_radar",race_date:"2026-11-23",revision:1,
 status:"published_pdf_reference",review_only:true,customer_publish_approved:false,
 source:{editorial_pdf_sha256:H,timeform_zip_sha256:S,production_receipt_verified:false},
 candidates:Array.from({length:10},(_,i)=>({
  track:"Synthetic Course",race_number:4,program_number:String(i+1),
  horse_name:"Source Fixture "+(i+1),post_time_et:"3:15 PM ET",
  original_morning_line:"8/1",pwin_display:17.6,
  fair_odds_display:"5/1",betting_case:"Document-sourced testing-only analysis, not a real race pick."
 }))
};
// A frozen full-field TRI card supplies race descriptions, never PDF guesses.
const originalRaceFactsKey="projections/dashboard/2026-11-23/synthetic-course.json";
const originalRaceFacts={
 schema_version:1,race_date:"2026-11-23",track_name:"Synthetic Course",
 races:[{race_number:4,distance:"6½ furlongs",surface:"Dirt",
  conditions:"Original source allowance conditions for this race, without truncation.",
  stakes_name:"First Lady S.",stakes_grade:"G1",sponsor_name:"Example Sponsor",is_stakes:true,
  entries:[
   {program_number:"1",horse_name:"Source Fixture 1"},
   {program_number:"2",horse_name:"Different race horse"}
  ]}]
};
memory.set(originalRaceFactsKey,JSON.stringify(originalRaceFacts));
memory.set(editorialKey,JSON.stringify(editorial));
let editorialResponse=await handleAdminLongshotEditorialPreview(
 new Request("https://railandryeracing.com/api/admin/longshot-radar-editorial"),env);
assert.equal(editorialResponse.status,200);
let editorialBody=await editorialResponse.json();
assert.equal(editorialBody.edition.candidates.length,10);
assert.equal(editorialBody.production_receipt_verified,false);
assert.equal(editorialBody.customer_publish_approved,false);
assert.equal(editorialBody.edition.status,"published_pdf_reference");
assert.ok(!Object.hasOwn(editorialBody.edition.candidates[0],"pwin_exact"),"Do not invent unrounded PWIN from PDF.");
assert.equal(editorialBody.edition.candidates[0].distance,"6½ furlongs");
assert.equal(editorialBody.edition.candidates[0].surface,"Dirt");
assert.equal(editorialBody.edition.candidates[0].conditions,originalRaceFacts.races[0].conditions);
assert.equal(editorialBody.edition.candidates[0].stakes_name,"First Lady S.");
assert.equal(editorialBody.edition.candidates[0].stakes_grade,"G1");
assert.equal(editorialBody.edition.candidates[0].sponsor_name,"Example Sponsor");
assert.equal(editorialBody.edition.candidates[0].is_stakes,true);
assert.ok(!Object.hasOwn(editorialBody.edition.candidates[1],"stakes_grade"),
 "Never invent a grade when horse identity does not match the private race source");
assert.ok(!Object.hasOwn(editorialBody.edition.candidates[1],"conditions"),"No race conditions for a PDF runner absent from frozen TRI source");
assert.equal(editorialBody.edition.candidates[0].horse_name,"Source Fixture 1");
assert.equal(editorialBody.edition.candidates[0].pwin_display,17.6,"Presentation join must not alter model/display value");
checks++;
// A conflicting second projection card makes descriptive facts ambiguous;
// omit the facts instead of guessing or changing the published selection.
memory.set("projections/dashboard/2026-11-23/duplicate-synthetic-course.json",JSON.stringify(originalRaceFacts));
let conflicting=await handleAdminLongshotEditorialPreview(new Request("https://railandryeracing.com/api/admin/longshot-radar-editorial"),env);
assert.equal(conflicting.status,200);
assert.ok(!Object.hasOwn((await conflicting.json()).edition.candidates[0],"conditions"),"Ambiguous race metadata cannot be displayed");
memory.delete("projections/dashboard/2026-11-23/duplicate-synthetic-course.json");
checks++;
// An unavailable optional source never blocks the verified PDF rows.
memory.delete(originalRaceFactsKey);
let absentFacts=await handleAdminLongshotEditorialPreview(new Request("https://railandryeracing.com/api/admin/longshot-radar-editorial"),env);
assert.equal(absentFacts.status,200);
assert.equal((await absentFacts.json()).edition.candidates.length,10,"Missing description must not prevent the daily feed");
memory.set(originalRaceFactsKey,JSON.stringify(originalRaceFacts));
checks++;

checks++;
editorialResponse=await handleAdminLongshotEditorialPreview(
 new Request("https://railandryeracing.com/api/admin/longshot-radar-editorial",{method:"POST"}),env);
assert.equal(editorialResponse.status,405);checks++;
memory.delete(editorialKey);
editorialResponse=await handleAdminLongshotEditorialPreview(
 new Request("https://railandryeracing.com/api/admin/longshot-radar-editorial"),env);
assert.equal(editorialResponse.status,404);checks++;

const worker=readFileSync("src/index.js","utf8");
assert.ok(worker.indexOf("const auth=await verifyAdmin(request,env)")>=0 && worker.indexOf('if(path.startsWith("/api/admin/"))return handleAdminAPI')>worker.indexOf("const auth=await verifyAdmin(request,env)"));
assert.ok(worker.includes('if(pathname==="/api/admin/longshot-radar") return handleAdminLongshotRadar(request,env);'));
assert.ok(worker.includes('if(pathname==="/api/admin/longshot-radar-editorial")return handleAdminLongshotEditorialPreview(request,env);'));
assert.ok(worker.includes('["/admin/longshot-radar","/admin/longshot-radar.html"]'),"Radar preview remains mapped behind the existing admin gate.");
checks++;
const html=readFileSync("public/admin/longshot-radar.html","utf8");
const ui=readFileSync("public/assets/longshot-radar.js","utf8");
const css=readFileSync("public/assets/longshot-radar.css","utf8");
assert.ok(html.includes('name="robots" content="noindex,nofollow,noarchive"'));
assert.ok(!html.includes('Synthetic Unit-Test Runner'));
assert.ok(!ui.includes("Math.round")&&!ui.includes("pwin_exact*")); // no client-side scoring
assert.ok(css.includes("@media(max-width:800px)")&&css.includes("@media(max-width:360px)"));
assert.ok(!html.includes("/assets/projections-dashboard.css"),"Radar must never import an older Projections UI layer");
assert.ok(!html.includes("Race details")&&!html.includes('id="rr-lr-dialog"'));
assert.ok(!html.includes("rr-lr-import")&&!html.includes("rr-lr-file")&&!html.includes("rr-lr-upload-form"),"No user-supplied JSON form");
assert.ok(html.includes("id=\"rr-lr-retry\""),"A failed R2 load must permit retry");
assert.ok(html.includes("longshot-radar.js?v=shared-race-order-v1-20261124"),"Publish the PDF-style one-sentence Radar reader without stale browser cache");
assert.ok(!html.includes("longshot-hero.jpg")&&!html.includes("longshot-mark.png"));
assert.ok(ui.includes('make("div","rr-lr-inline-analysis")'));
assert.ok(ui.includes('make("p","rr-lr-case",item.betting_case)'),"Display the exact approved one-sentence PDF betting case");
assert.ok(!ui.includes("item.source_causal_evidence")&&!ui.includes("item.counterargument_checked"),
 "Internal QA evidence and counterarguments must never produce extra public card paragraphs");
assert.ok(!ui.includes('make("strong","","Evidence")')&&!ui.includes('make("strong","","Counterargument")'),
 "Never display internal QA section labels in the daily Radar");
assert.ok(!/\btimeform(?:us)?\b/i.test(ui+html),"Customer-facing Radar assets cannot mention the source vendor");

assert.ok(!ui.includes('make("button","","Race details")'));

checks++;
// The retired public preview was intentionally removed. If a redirect ever
// returns, it must point only at the protected reader without old banners.
const retiredPreview="public/longshot-radar-preview/index.html";
if(existsSync(retiredPreview)){
 const publicDesign=readFileSync(retiredPreview,"utf8");
assert.ok(publicDesign.includes('http-equiv="refresh" content="0;url=/admin/longshot-radar/"'));
assert.ok(publicDesign.includes('href="/admin/longshot-radar/"'),"Provide a tap fallback to the real protected reader");
assert.ok(!publicDesign.includes("data-rr-design-only")&&!publicDesign.includes("rr-lr-candidates"),"No fake data in public route");
assert.ok(!publicDesign.includes("<script"),"Public landing cannot call paid API");
assert.ok(!publicDesign.includes("Race details"),"Do not revive hidden details");
assert.ok(!publicDesign.includes("/assets/approved/publications/longshot-hero.jpg"));
assert.ok(!publicDesign.includes("/assets/approved/publications/longshot-mark.png"));
assert.ok(publicDesign.includes("/assets/approved/brand/rail-rye-ivory-logo.png"));
assert.ok(!publicDesign.includes('id="rr-lr-upload-form"')&&!publicDesign.includes('api/admin/'));
assert.ok(publicDesign.includes('name="robots" content="noindex,nofollow,noarchive"'));
assert.ok(!publicDesign.toLowerCase().includes("sample"),"Public page must not advertise fake samples");

}

assert.ok(ui.includes('/api/admin/longshot-radar-editorial'),"Real PDF viewer must read the protected R2 endpoint");
assert.ok(ui.includes('fetchPrivateRadarJSON("/api/admin/longshot-radar"'),"Reader must also retrieve future exact TRI-verified Radar editions from private R2");
assert.ok(ui.includes('function loadAvailableEditions()')||ui.includes('async function loadAvailableEditions()'),"Future daily editions must be automatic without user upload");
assert.ok(ui.includes('byDate.set(row.race_date,row)'),"Date-specific verified scored editions must remain distinct");
assert.ok(ui.includes('!byDate.has(edition.race_date)'),"Legacy published PDF is used only when no scored edition exists for the same date");
assert.ok(!ui.includes("edition.candidates.length!==10"),"No fixed horse quota in new daily productions");
assert.ok(ui.includes("AbortController")&&ui.includes("retry?.addEventListener"),"Show a recoverable error rather than a permanent loading spinner");

assert.ok(html.includes("longshot-radar.js?v=shared-race-order-v1-20261124"),"Load version-locked Radar client");
assert.ok(html.includes("rr-research-race-banner.js?v=locked-v4-20261124"),"Load canonical banner renderer");
assert.ok(html.includes("rr-research-race-banner.css?v=locked-v1-20261124"),"Load canonical banner CSS");
assert.ok(!html.includes('id="rr-lr-stage"')&&!html.includes('id="rr-lr-date-title"')&&!html.includes('id="rr-lr-updated"'),"No duplicate page statuses");
assert.ok(ui.includes('make("span","rr-lr-ml-inline","ML "+tote(item.original_morning_line))'),"Morning line belongs with horse identity");
assert.ok(!ui.includes('market("ML ODDS"'),"WIN/FAIR remain the two right-side metrics");
assert.ok(ui.includes('raceBanner.render(item)'),"Every Radar card must use the one shared banner renderer");
assert.ok(!ui.includes("rr-lr-racebar")&&!ui.includes("sourceRaceTitle")&&!ui.includes("appendGradeTrophy("),
 "No legacy Radar banner or grade DOM path may remain");
const banner=readFileSync("public/assets/rr-research-race-banner.js","utf8");
const bannerCSS=readFileSync("public/assets/rr-research-race-banner.css","utf8");
assert.ok(banner.includes("RRResearchRaceBanner=Object.freeze"),"Shared renderer is an immutable global authority");
assert.ok(banner.includes("rr-research-racebar__facts")&&(banner.includes("appendGradeTrophy(facts,title.grade)")||banner.includes("appendGradeTrophy(facts,title?.grade)")),"Shared renderer shows sourced titles and stakes trophies");
assert.ok(bannerCSS.includes("grid-template-columns:minmax(0,1fr) max-content"),"Track stays left, race/post right");
assert.ok(bannerCSS.includes("font:500 14px/1.35 Inter"),"Source race facts stay readable beneath the title");
assert.ok(css.includes("SHARED DAILY RESEARCH DESIGN STANDARD V1"),"Keep existing Radar body design");
assert.ok(css.includes("font:500 17px/1.52 Inter"),"Full analysis remains 17px");
assert.ok(css.includes("grid-template-columns:repeat(2,minmax(0,1fr))"),"WIN/FAIR remain aligned");
assert.ok(!/\\.rr-lr-racebar|\\.rr-lr-race-facts|\\.rr-lr-race-number|\\.rr-lr-post/.test(css),
 "Remove obsolete Radar-specific race-header stylesheet rules");
assert.ok(html.includes("rr-hub-header.css?v=2")&&html.includes("heritage-header rr-intel-header")&&html.includes("rr-intel-header__mobile-links"),"Keep the shared masthead");
assert.ok(!ui.includes("rr-lr-upload-form")&&!ui.includes("visualSample"),"Only private production data");
assert.ok(!ui.includes("rr-lr-evidence")&&!ui.includes('make("button","","Race details")'),"One short on-card betting sentence");
assert.ok(!/\\btimeform(?:us)?\\b/i.test(ui+html),"No proprietary source label in the UI");
checks++;

console.log("PASS: "+checks+" Longshot Radar private-review, noncertified published-PDF handoff, inline editorial and security/layout checks.");

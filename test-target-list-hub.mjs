import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";
import {validateTargetList,handleAdminTargetList} from "./src/target-list.js";

globalThis.crypto??=webcrypto;
const root="https://railandryeracing.com";
const h="a".repeat(64);
const horse=(number,name,pwin)=>({program_number:String(number),horse_name:name,morning_line:"5-1",win_probability:pwin,win_probability_exact:pwin,fair_odds:"4-1",trainer:"",jockey:""});
const base={schema_version:1,product_type:"target_list",race_date:"2026-11-23",revision:1,status:"initial",
 source:{receipt_id:"synthetic-unit-test-only",sha256:h},
 targets:[{rank:1,track:"Synthetic Test Track",race_number:5,tier:"PRIME",post_time_et:"3:10 PM ET",surface:"Dirt",distance:"6 furlongs",
  favorite:horse("1","Favorite Runner",12),attack:horse("12","Attack Runner",35),
  analysis:"This is synthetic, non-customer test commentary."}]};
const copy=()=>structuredClone(base);
const good=validateTargetList(base);
const named=structuredClone(base);
named.targets[0].conditions="FIRST LADY S. (G1) Presented by Venue Sponsor";
named.targets[0].stakes_name="First Lady S.";
named.targets[0].stakes_grade="G1";
named.targets[0].sponsor_name="Venue Sponsor";
named.targets[0].is_stakes=true;
const normalized=validateTargetList(named);
assert.equal(normalized.targets[0].stakes_name,"First Lady S.");
assert.equal(normalized.targets[0].stakes_grade,"G1");
assert.equal(normalized.targets[0].sponsor_name,"Venue Sponsor");
assert.equal(normalized.targets[0].is_stakes,true);
const wrong=structuredClone(named);wrong.targets[0].stakes_grade="Grade 4";
assert.throws(()=>validateTargetList(wrong),/grade/i,"Refuse invented source trophy grades");
assert.equal(good.targets[0].attack.win_probability,35);
assert.equal(good.targets[0].rank,1);
assert.equal(good.status,"initial");
assert.equal(good.targets[0].favorite.horse_name,"Favorite Runner");
function bad(mutator,message){
 const v=copy();mutator(v);assert.throws(()=>validateTargetList(v),message);
}
bad(v=>{v.targets[0].attack.win_probability=24;v.targets[0].attack.win_probability_exact=24;},/15\.000000 verified PWIN/);
bad(v=>{v.targets[0].attack.win_probability=101;},/probability/);
bad(v=>{delete v.targets[0].attack.win_probability_exact;},/unrounded full-field PWIN/);
bad(v=>{v.targets[0].attack.win_probability_exact=34.8;},/displayed PWIN disagrees/);
bad(v=>{v.targets[0].also_live=horse("7","Secondary Runner",20);},/ALSO LIVE must exceed/);
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
assert.doesNotMatch(html,/rr-review-artwork|rr-review-mark|rr-review-hero|target-hero\.jpg|target-mark\.png/,"Remove the top page-and-horse publication artwork.");
assert.doesNotMatch(html,/rr-target-local-file/,"No manual review-file step for the daily reader.");
assert.doesNotMatch(html,/rr-target-upload-form|rr-target-file|Private source upload|Certified source JSON file/,"Daily Target List never presents a manual JSON upload.");
assert.doesNotMatch(js,/rr-target-upload-form|rr-target-file|\.text\(\)\}/,"Reader never contains orphaned upload form behavior.");
assert.doesNotMatch(css,/rr-target-publisher/,"No obsolete upload form CSS.");
assert.match(html,/target-list-dashboard\.css\?v=20261123-parity-v16/,"Ensure the readable style loads on phones.");
assert.match(css,/font:500 17px\/1\.52 Inter/,"Published editorial uses current readable 17px typography.");
assert.match(readFileSync("public/assets/rr-research-race-banner.css","utf8"),/font:800 17px\/1\.23 Inter/,"Shared banner preserves the original readable track typography.");
assert.match(css,/Shared Daily Research Reader V1 — Target List implementation/,"Target List consumes shared cross-product mobile standard.");
assert.match(html,/rr-research-race-banner\.css\?v=locked-v1-20261124/,"Target List loads the sole race-header stylesheet.");
assert.doesNotMatch(css,/RAIL & RYE DAILY RESEARCH V9|right-justified RACE \/ POST group/,"Remove redundant header patches.");
assert.doesNotMatch(js,/rr-research-racebar__facts-long/,"Race facts always occupy their own readable row.");
assert.match(html,/rr-hub-header\.css\?v=1/,"Target List loads the one shared masthead.");
assert.doesNotMatch(css,/rr-member-nav|rr-member-header/,"Legacy Target List header overrides are removed.");
assert.match(css,/font:500 17px\/1\.52 Inter/,"Full race analysis uses the same 17px research reader scale as Radar.");
assert.match(html,/target-list-dashboard\.css\?v=20261123-parity-v16/,"Shared v6 stylesheet must defeat stale browser cache.");
assert.match(html,/aria-current="page"/,"Active module navigation remains identifiable.");
assert.doesNotMatch(html,/Post Time · Earliest First|Sort targets/,"Controls use concise shared labels.");
assert.match(js,/Post-time order/,"Summary uses the current display order, not a redundant date.");
assert.match(css,/font-size:18px;/,"On-phone editorial body grows to 18px.");
assert.match(css,/font-size:25px/,"On-phone win percentage remains prominent.");
assert.match(js,/raceBanner\.render\(entry\)/,"All Target List cards use the shared banner renderer.");
assert.match(html,/rr-research-race-banner\.js\?v=locked-v1-20261124/,"One shared right-aligned race-header renderer is mandatory.");
assert.doesNotMatch(js,/rr-research-racebar|rr-target-race-identifiers|rr-research-racebar__facts/,"Legacy Target List banner builder is retired.");
assert.match(readFileSync("public/assets/rr-research-race-banner.css","utf8"),/\.rr-research-racebar__identifiers\{/,"Right-aligned header group uses one canonical stylesheet.");
assert.match(readFileSync("public/assets/rr-research-race-banner.css","utf8"),/grid-template-columns:minmax\(0,1fr\) max-content/,"Canonical header uses the same left-track/right-identifiers grid.");
assert.match(readFileSync("public/assets/rr-research-race-banner.js","utf8"),/rr-ed-stakes-title/,"Shared renderer supplies original source title and trophy.");

assert.doesNotMatch(js,/card\.append\(node\("p","rr-research-racebar__facts",meta\)\)/,"Eliminate separate race facts strip.");

assert.doesNotMatch(js,/DEMO_EXAMPLE|demoHorse|Sample Favorite|Example Downs|SYNTHETIC LAYOUT EXAMPLE/,"Never display invented data when the private R2 edition is unavailable.");
assert.doesNotMatch(js,/innerHTML|localStorage/,"Never inject untrusted narrative as HTML or persist paid results.");
assert.match(js,/textContent/);
assert.match(css,/--rrh-navy:#102d53/);
assert.match(css,/--rrh-gold:#c99831/);
assert.match(css,/@media\(max-width:430px\)/);
assert.match(css,/@media\(max-width:359px\)/);
assert.match(css,/\.rr-target-list\{display:grid;grid-template-columns:minmax\(0,1fr\)/,"Target List reads as one compact vertical column.");
assert.match(css,/Tinos/,"Only authoritative statistics use the card font.");
assert.doesNotMatch(html,/id="rr-target-review-banner"/,"One concise review notice is enough.");
assert.match(html,/target-list-dashboard\.js\?v=shared-banner-v1-20261124/,"Load version-locked shared-banner Target List reader.");
assert.match(css,/Target List v3 — dense mobile-first horse-racing reader/);
assert.match(css,/-webkit-line-clamp:unset/,"Full editorial must never be cut off at two lines.");
assert.match(js,/function horseRow\(role,runner,entry\)/,"Horse rows themselves open the detail drawer.");
assert.doesNotMatch(js,/rr-target-analyze/,"Remove redundant full-width action button from every race.");
assert.match(js,/const tote=value/,"Use tote-style fractional prices without editing model values.");

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
const ids=["rr-target-date","rr-target-sort","rr-target-status","rr-target-app","rr-target-empty","rr-target-list","rr-target-dialog","rr-target-dialog-content","rr-target-dialog-title","rr-target-count","rr-target-context","rr-target-freshness","rr-target-dialog-close"];
const elements=new Map(ids.map(id=>[id,new El(id.includes("dialog")?"dialog":"div")]));
const doc={getElementById:id=>elements.get(id),createElement:tag=>new El(tag)};
const alpha=structuredClone(good.targets[0]);alpha.rank=3;alpha.track="Alpha Test Track";alpha.race_number=7;alpha.post_time_et="8:40 PM ET";
const zulu=structuredClone(good.targets[0]);zulu.rank=2;zulu.track="Zulu Test Track";zulu.race_number=2;zulu.post_time_et="1:10 PM ET";
const synthetic=structuredClone(good.targets[0]);synthetic.post_time_et="3:10 PM ET";
synthetic.conditions="FIRST LADY S. (G1) Presented by Venue Sponsor";
synthetic.stakes_name="First Lady S.";
synthetic.stakes_grade="G1";
synthetic.sponsor_name="Venue Sponsor";
synthetic.is_stakes=true;
const fixture={dates:["2026-11-23"],edition:{...good,targets:[synthetic,zulu,alpha]},uploaded_at:"2026-11-23T04:00:00Z"};
const context={document:doc,fetch:async()=>({ok:true,json:async()=>fixture}),Date,Intl,RegExp,Number,String,Array,Set,console,encodeURIComponent};
vm.runInNewContext(readFileSync("public/assets/rr-race-titles.js","utf8"),context,{filename:"rr-race-titles.js"});
vm.runInNewContext(readFileSync("public/assets/rr-research-race-banner.js","utf8"),context,{filename:"rr-research-race-banner.js"});
vm.runInNewContext(js,context,{filename:"target-list-dashboard.js"});
await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(elements.get("rr-target-app").hidden,false);
assert.match(elements.get("rr-target-count").textContent,/3 targets/);
const tree=(el,fn)=>fn(el)?el:el.children.map(v=>tree(v,fn)).find(Boolean)||null;
const textOf=el=>!el?"":String(el.textContent||"")+(el.children||[]).map(textOf).join("");
const card=tree(elements.get("rr-target-list"),el=>el.className==="rr-target-card");
assert.ok(card,"Render a compact target card with actual source data.");
const action=tree(card,el=>el.className==="rr-target-horse-row rr-target-attack"&&el.tagName==="BUTTON");
assert.ok(action,"ATTACK horse row opens full details without a redundant giant button.");
action.events.click();
assert.equal(elements.get("rr-target-dialog").open,true);
assert.match(elements.get("rr-target-dialog-title").textContent,/Zulu Test Track/,"Chronological first race should open first.");
const detail=elements.get("rr-target-dialog-content");
assert.ok(tree(detail,el=>el.textContent==="This is synthetic, non-customer test commentary."),"Drawer preserves full certified source narrative.");
// These sort controls only affect presentation; original rank and values remain unchanged.
const renderedTracks=()=>elements.get("rr-target-list").children.map(card=>tree(card,el=>el.tagName==="H3").textContent);
assert.deepEqual(renderedTracks(),["Zulu Test Track","Synthetic Test Track","Alpha Test Track"],"Post time runs chronologically across tracks, not publication rank.");
elements.get("rr-target-sort").value="track";elements.get("rr-target-sort").events.change();
assert.deepEqual(renderedTracks(),["Alpha Test Track","Synthetic Test Track","Zulu Test Track"],"Track sort groups tracks A–Z independently of post time.");
elements.get("rr-target-sort").value="post-time";elements.get("rr-target-sort").events.change();
assert.deepEqual(renderedTracks(),["Zulu Test Track","Synthetic Test Track","Alpha Test Track"],"Switching sorts restores true chronological order.");
assert.deepEqual(fixture.edition.targets.map(entry=>entry.rank),[1,2,3],"Sorting must not mutate authoritative publication ranks.");
assert.ok(tree(card,el=>el.className==="rr-target-analysis-text"&&el.textContent==="This is synthetic, non-customer test commentary."),"Full source narrative stays visible on every race panel.");
assert.ok(tree(card,el=>el.className==="rr-target-horse-row rr-target-attack"),"ATTACK appears in its own compact race row.");
const racebar=tree(card,el=>el.className==="rr-research-racebar");
assert.ok(racebar,"Race has integrated navy header.");
assert.ok(tree(racebar,el=>el.className==="rr-research-racebar__facts"&&el.textContent==="6 furlongs · Dirt"),"Race facts sit fully within the banner.");
const namedCard=elements.get("rr-target-list").children.find(entry=>
 tree(entry,el=>el.tagName==="H3")?.textContent==="Synthetic Test Track");
assert.ok(namedCard,"Stakes fixture must be rendered");
const namedFacts=tree(namedCard,el=>el.className==="rr-research-racebar__facts");
assert.ok(textOf(namedFacts).startsWith("6 furlongs · Dirt · First Lady Stakes"),
 "Full name replaces sponsored abbreviation and keeps surface and distance");
const grade=tree(namedFacts,el=>el.className==="rr-ed-grade-trophy rr-ed-grade-trophy--g1");
assert.ok(grade,"Source-verified Grade 1 gets gold trophy in race header");
assert.equal(grade["aria-label"],"Grade 1 stakes trophy");
assert.ok(!textOf(namedFacts).includes("Venue Sponsor"),"Sponsor is not in editorial header");
tree(namedCard,el=>el.className==="rr-target-horse-row rr-target-attack").events.click();
const drawer=tree(elements.get("rr-target-dialog-content"),el=>el.className==="rr-target-drawer-meta");
assert.ok(drawer?.textContent.includes("First Lady Stakes"),"Drawer uses same fully written race name");
assert.ok(tree(drawer,el=>el.className==="rr-ed-grade-trophy rr-ed-grade-trophy--g1"),
 "Source-verified trophy follows analysis into drawer");
// Without the shared script, prevent an abbreviated race name and suppress
// the unverified trophy rather than guessing a grade.
context.RRRaceTitles=undefined;
elements.get("rr-target-sort").events.change();
const fallbackCard=elements.get("rr-target-list").children.find(entry=>
 tree(entry,el=>el.tagName==="H3")?.textContent==="Synthetic Test Track");
const fallback=tree(fallbackCard,el=>el.className==="rr-research-racebar__facts");
assert.ok(textOf(fallback).includes("First Lady Stakes"),"No fallback 'S.' leak");
assert.ok(!tree(fallback,el=>String(el.className||"").includes("rr-ed-grade-trophy")),
 "Fallback may not invent a trophy without verified grade parser");
assert.ok(tree(card,el=>el.className==="rr-target-ml-inline"&&el.textContent==="ML 5-1"),"Mobile shows the unchanged source morning line alongside the horse.");
assert.ok(tree(card,el=>el.className==="rr-target-stat-value"&&el.textContent==="4-1"),"US tote-style fair-odds formatting is display-only.");

assert.match(html,/id="rr-target-sort"/);
assert.doesNotMatch(html,/rr-target-track|rr-target-search/,"Reader controls are date and independent sort only.");

assert.match(html,/rr-race-titles\.js\?v=2/,"Locked canonical stakes parser is present");
assert.match(html,/rr-stakes-inline\.css\?v=1/,"Locked shared graded trophy styles are present");
assert.match(js,/appendGradeTrophy\(facts,title\.grade\)/,
 "Trophies require the source-backed parsed grade");
console.log("PASS: Target List private upload, revision protection, no forced picks, official chips, drawer, mobile contracts, and no PDF dependency");
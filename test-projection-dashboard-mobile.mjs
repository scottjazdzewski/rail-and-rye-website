import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const css=readFileSync("public/assets/projections-dashboard.css","utf8");
const js=readFileSync("public/assets/projections-dashboard.js","utf8");
assert.match(css,/\.rr-dash-race-tiles\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,"Phone facts must use two columns");
assert.match(js,/INITIAL CARD · CURRENT/,"Initial cards remain current before scratches");
assert.doesNotMatch(js,/badges are not yet certified/,"Verified initial badges must not be called uncertified");
assert.match(js,/rr-dash-metric-bars/,"Five source-backed factor states must render as compact colored dashes");
assert.doesNotMatch(js,/iconNode\(art,"rr-dash-rating-badge"/,"No large factor PNGs in the compact runner rows");
assert.match(css,/family=Tinos/,"Load the original racecard percentage font");
assert.match(css,/\.rr-dash-win-percent\{font-family:"Tinos"/,"Match the approved Tinos Bold percentage font");
assert.match(css,/\.rr-dash-metric-value\[data-state="gray"\] \.rr-dash-metric-bar/,"Neutral factors have an explicit gray dash color");
assert.match(css,/min-height:150px/,"Compact runner rows target at least 150px without clipping names");
assert.match(js,/F4 FINISH PROJECTIONS/,"Full Analysis must include F4 outcomes");
assert.match(js,/remain current until scratches/,"Initial-card scratch-state disclaimer must remain visible");
assert.match(css,/\.rr-dash-metric-group\{grid-area:metrics;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/,"Mobile ratings must occupy a single, compact five-column strip");
assert.doesNotMatch(js,/Trainer not listed \| Jockey not listed/,"Do not repeat source-data warnings on customer runner rows");
assert.match(css,/\.rr-dash-race-tiles\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,"Compact race facts occupy three short columns");
assert.match(css,/grid-template-areas:"program horse market" "metrics metrics metrics" "analysis analysis analysis"/,"Phone layout must include the dedicated analysis footer");
assert.match(css,/\.rr-dash-win\{grid-area:market;[^}]*align-items:center/,"Mobile win and fair odds must be horizontally centered");
assert.match(css,/\.rr-dash-horse-dialog\{position:fixed;inset:auto 0 0/,"Mobile details must open as a bottom drawer");
assert.doesNotMatch(css,/grid-template-areas:"program horse" "market market"/,"Remove old tall mobile runner layout");
assert.match(css,/\.rr-dash-horse-name\{flex:0 1 auto;[^}]*overflow:visible;[^}]*white-space:normal/,"Mobile horse names must not be clipped");
assert.match(css,/\.rr-dash-race-purse\[data-missing="true"\]/,"Missing purse must be flagged in private preview");

class Element {
 constructor(tag="div"){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this._value="";this._text="";this.hidden=false;this.style={};}
 set textContent(value){this.children=[];this._text=String(value??"");}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join("");}
 get value(){return this._value;}
 set value(value){this._value=String(value);}
 append(...nodes){for(const node of nodes){this.children.push(node);if(this.tagName==="SELECT"&&!this._value&&node.tagName==="OPTION")this._value=node.value;}}
 replaceChildren(...nodes){this.children=[];this._text="";this._value=this.tagName==="SELECT"?"":this._value;this.append(...nodes);}
 setAttribute(name,value){this.attributes[name]=String(value);}
 getAttribute(name){return this.attributes[name]??null;}
 removeAttribute(name){delete this.attributes[name];}
 addEventListener(name,callback){this.events??={};this.events[name]=callback;}
 querySelectorAll(selector){const items=[];const visit=element=>{for(const child of element.children){if(selector==="button"&&child.tagName==="BUTTON")items.push(child);visit(child);}};visit(this);return items;}
 showModal(){this.opened=true;}
 close(){}
}
const ids=["rr-dash-status","rr-dash-app","rr-dash-login","rr-dash-empty","rr-dash-date","rr-dash-track","rr-dash-race-time","rr-dash-races","rr-dash-race","rr-dash-horses","rr-dash-search","rr-dash-sort","rr-dash-open-pdf","rr-dash-download-pdf","rr-dash-update","rr-dash-horse-dialog","rr-dash-horse-title","rr-dash-horse-detail","rr-dash-horse-close"];
const els=new Map(ids.map(id=>[id,new Element(id.includes("date")||id.includes("track")||id.includes("race-time")||id.includes("sort")?"select":"div")]));
els.get("rr-dash-sort").value="finish";
const fixture={cards:[{race_date:"2026-11-22",track:"Del Mar",product_id:null,card:{track_name:"Del Mar",races:[{race_number:6,post_time_et:"6:00 PM",conditions:"Claiming $8,000",purse:"$20,000",pace:"Moderate",surface:"Dirt",distance:"5 1/2 furlongs",scratch_count:1,scratches:[{program_number:"3",horse_name:"Scratched Runner"}],entries:[{program_number:"5",horse_name:"Barrister Proof",rank:1,morning_line:"12-1",win_probability:27.5,fair_odds:"5/2",trainer:"Brad Cox",jockey:"Jose Ortiz",metrics:[{label:"Speed",value:"green"},{label:"Form",value:"gray"},{label:"Class",value:"red"},{label:"Pace Fit",value:"green"},{label:"Surface / Distance",value:"gray"}]},{program_number:"12",horse_name:"Doo Wop Don",rank:2,morning_line:"5-2",win_probability:16.6,fair_odds:"5/1",trainer:"",jockey:"",metrics:[]}]}]}}]};
const document={body:{dataset:{rrPreview:"true"}},querySelector(selector){return els.get(selector.slice(1))??null;},createElement(tag){return new Element(tag);}};
const context={document,fetch:async()=>({ok:true,json:async()=>fixture}),Intl,Date,Number,String,Array,Error,console,encodeURIComponent};
vm.runInNewContext(js,context,{filename:"projections-dashboard.js"});
await new Promise(resolve=>setTimeout(resolve,0));

function matchClass(root,className){if(String(root.className||"").split(/\s+/).includes(className))return root;for(const child of root.children){const found=matchClass(child,className);if(found)return found;}return null;}
function allClass(root,className,out=[]){if(String(root.className||"").split(/\s+/).includes(className))out.push(root);for(const child of root.children)allClass(child,className,out);return out;}
const race=els.get("rr-dash-race"),horses=els.get("rr-dash-horses");
assert.match(race.textContent,/Claiming \$8,000/i,"Preserve claiming price");
assert.match(race.textContent,/PURSE \$20,000/,"Display actual purse separately");
assert.match(race.textContent,/SCRATCHES/);
const scratchChip=matchClass(race,"rr-dash-scratch-chip");
assert.ok(scratchChip&&scratchChip.src.endsWith("/3.png"),"Scratch uses official #3 saddlecloth chip");
assert.match(race.textContent,/Scratched Runner/,"Show scratched horse name");
const names=allClass(horses,"rr-dash-horse-name").map(el=>el.textContent);
assert.deepEqual(names,["Barrister Proof","Doo Wop Don"]);
assert.equal(allClass(horses,"rr-dash-horse-ml")[0].textContent,"M/L 12-1");
assert.equal(allClass(horses,"rr-dash-horse-connections")[0].textContent,"Brad Cox | Jose Ortiz");
assert.equal(allClass(horses,"rr-dash-horse-connections").length,1,"Missing trainer and jockey must not create filler text");
assert.equal(allClass(horses,"rr-dash-metric-group").length,3,"Two runner groups plus desktop-only table heading must remain");
assert.equal(allClass(horses,"rr-dash-win-percent")[0].textContent,"27.5%");
assert.equal(allClass(horses,"rr-dash-win-fair")[0].textContent,"FAIR 5/2");
assert.ok(allClass(horses,"rr-dash-metric-value").length===10,"All five factors must remain visible on every horse");
const approvedDashes=allClass(horses,"rr-dash-metric-bars");
assert.equal(approvedDashes.length,5,"Each certified factor state renders as dashes");
assert.ok(approvedDashes.every(el=>el.children.length===3),"Each state uses three flat dashes");
assert.equal(allClass(horses,"rr-dash-rating-badge").length,0,"Large factor icons must not return");

assert.ok(!/RANK/i.test(horses.textContent),"No visible ranking");
const disclosure=allClass(horses,"rr-dash-full-analysis")[0];
assert.ok(disclosure&&disclosure.events?.click,"Runner analysis remains actionable");
assert.equal(disclosure.textContent,"Analysis","Compact runner action has a short label");
assert.match(horses.textContent,/Brad Cox \| Jose Ortiz/,"Trainer and jockey remain directly beneath the horse name");
assert.equal(allClass(horses,"rr-dash-analysis-connections").length,0,"Connections must not be repeated in the analysis footer");
disclosure.events.click();
assert.equal(els.get("rr-dash-horse-dialog").opened,true,"Full Analysis must open a dialog");
const sheet=matchClass(els.get("rr-dash-horse-detail"),"rr-dash-mobile-analysis");
assert.ok(sheet,"Full Analysis must populate the mobile sheet");
assert.match(sheet.textContent,/RACE CONTEXT/);
assert.match(sheet.textContent,/FIVE-FACTOR READOUT/);
assert.match(sheet.textContent,/Brad Cox/);
assert.match(sheet.textContent,/Jose Ortiz/);
assert.match(sheet.textContent,/27.5%/);
assert.match(sheet.textContent,/FAIR 5\/2/);
console.log("PASS: compact runner rows, verified dash factor states, preserved race data, no redundant PDF action");

// No partial historic preview data is allowed in the public website assets.
// Admin previews must always load full-field data from the authenticated R2 API.
const adminHtml=readFileSync("public/admin/projections-preview.html","utf8");
const memberHtml=readFileSync("public/membership/dashboard/index.html","utf8");
assert.doesNotMatch(adminHtml,/rr-dash-review-data|review=nov23|Selected horses only|17 horses/,
 "Remove legacy selected-horse review fixtures and routes");
assert.doesNotMatch(adminHtml,/<script[^>]*type="application\/json"/,
 "Never embed premium racing projections in public HTML");
assert.doesNotMatch(js,/\breviewMode\b|PARTIAL FIELD|rr-dash-review-data/,
 "No stale partial-field runtime branches");
assert.match(js,/api\("\/api\/admin\/projections-preview"\)/,
 "Private admin preview must always read the secure projection API");
assert.match(adminHtml,/projections-dashboard\.js\?v=23/,
 "Admin dashboard must load the latest hardened shared client");
assert.match(memberHtml,/projections-dashboard\.js\?v=23/,
 "Member dashboard must use the same client revision");
console.log("PASS: no embedded premium data or partial review fallback; authenticated full-field preview only");

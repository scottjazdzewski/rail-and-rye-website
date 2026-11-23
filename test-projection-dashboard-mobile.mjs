import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const css=readFileSync("public/assets/projections-dashboard.css","utf8");
const js=readFileSync("public/assets/projections-dashboard.js","utf8");
assert.match(css,/\.rr-dash-race-tiles\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,"Phone facts must use two columns");
assert.match(js,/INITIAL CARD · CURRENT/,"Initial cards remain current before scratches");
assert.doesNotMatch(js,/badges are not yet certified/,"Verified initial badges must not be called uncertified");
assert.match(js,/rr-dash-rating-badge/,"The five factors should use the existing approved badge PNG assets");
assert.match(css,/family=Tinos/,"Load the original racecard percentage font");
assert.match(css,/\.rr-dash-win-percent\{font-family:"Tinos"/,"Match the approved Tinos Bold percentage font");
assert.match(css,/\.rr-dash-rating-badge img/,"Scale badge artwork for responsive cards");
assert.match(js,/F4 FINISH PROJECTIONS/,"Full Analysis must include F4 outcomes");
assert.match(js,/current until official scratches are processed/,"Initial-card scratch disclaimer must remain visible");
assert.match(css,/\.rr-dash-metric-group\{grid-area:metrics;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/,"Mobile ratings must occupy a single, compact five-column strip");
assert.doesNotMatch(js,/Trainer not listed \| Jockey not listed/,"Do not repeat source-data warnings on customer runner rows");
assert.match(css,/\.rr-dash-race-tile:last-child\{grid-column:1\/-1(?:;|\})/,"Distance must use a full-width mobile row");
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
const approvedBadges=allClass(horses,"rr-dash-rating-badge");
assert.equal(approvedBadges.length,5,"Every certified factor renders the matching approved PNG");
assert.deepEqual(approvedBadges.map(el=>el.children[0].src),[
 "/assets/approved/factor-badges/speed_green.png",
 "/assets/approved/factor-badges/form_gray.png",
 "/assets/approved/factor-badges/class_red.png",
 "/assets/approved/factor-badges/pace_green.png",
 "/assets/approved/factor-badges/surface_gray.png"
]);

assert.ok(!/RANK/i.test(horses.textContent),"No visible ranking");
const disclosure=allClass(horses,"rr-dash-full-analysis")[0];
assert.ok(disclosure&&disclosure.events?.click,"Full Analysis must be actionable");
assert.match(horses.textContent,/Trainer: Brad Cox  \|  Jockey: Jose Ortiz/,"Connections belong beneath Full Analysis on the phone");
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
console.log("PASS: dashboard data -> race purse, scratches/chips, ML, connections, fair odds and compact phone rules");

// Review-only November 23 fixtures must be traceable to the actual Rail & Rye
// published projections. These are NOT fabricated complete race fields.
const reviewHtml=readFileSync("public/admin/projections-preview.html","utf8");
const payloadMatch=reviewHtml.match(/<script id="rr-dash-review-data" type="application\/json">([^<]+)<\/script>/);
assert.ok(payloadMatch,"Private admin preview must embed verified source review data");
const review=JSON.parse(payloadMatch[1]);
const count=review.tracks.flatMap(track=>track.races.flatMap(race=>race.entries));
assert.equal(review.race_date,"2026-11-23");
assert.equal(review.tracks.length,4);
assert.equal(review.tracks.reduce((sum,track)=>sum+track.races.length,0),11);
assert.equal(count.length,17);
assert.ok(count.every(horse=>Number.isFinite(horse.win_probability)&&horse.fair_odds&&horse.morning_line&&horse.trainer&&horse.jockey),"Every review horse has authentic probability, fair odds, ML, trainer and jockey");
assert.ok(count.every(horse=>Array.isArray(horse.metrics)&&horse.metrics.length===0),"Never invent factor states from selected-pick publications");
const get=(name)=>count.find(horse=>horse.horse_name===name);
assert.equal(get("Formaggio").win_probability,37.8);
assert.equal(get("Gates of Heaven").fair_odds,"6/5");
assert.equal(get("Haywire").program_number,"6");
assert.equal(get("Snitch Dorada").win_probability,39.7);
assert.match(js,/PARTIAL FIELD/,"Actual review must not misrepresent selected picks as full fields");

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const css=readFileSync("public/assets/projections-dashboard.css","utf8");
const js=readFileSync("public/assets/projections-dashboard.js","utf8");
assert.match(css,/\.rr-dash-race-tiles\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,"Phone facts must use two columns");
assert.match(css,/\.rr-dash-race-tile:last-child\{grid-column:1\/-1\}/,"Distance must use a full-width mobile row");
assert.match(css,/grid-template-areas:"program horse market" "metrics metrics metrics"/,"Phone market must sit beside horse heading");
assert.doesNotMatch(css,/grid-template-areas:"program horse" "market market"/,"Remove old tall mobile runner layout");
assert.match(css,/\.rr-dash-horse-name\{flex:0 1 auto;overflow:visible;white-space:normal/,"Mobile horse names must not be clipped");
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
 addEventListener(){}
 querySelectorAll(selector){const items=[];const visit=element=>{for(const child of element.children){if(selector==="button"&&child.tagName==="BUTTON")items.push(child);visit(child);}};visit(this);return items;}
 showModal(){}
 close(){}
}
const ids=["rr-dash-status","rr-dash-app","rr-dash-login","rr-dash-empty","rr-dash-date","rr-dash-track","rr-dash-race-time","rr-dash-races","rr-dash-race","rr-dash-horses","rr-dash-search","rr-dash-sort","rr-dash-open-pdf","rr-dash-download-pdf","rr-dash-update","rr-dash-horse-dialog","rr-dash-horse-title","rr-dash-horse-detail","rr-dash-horse-close"];
const els=new Map(ids.map(id=>[id,new Element(id.includes("date")||id.includes("track")||id.includes("race-time")||id.includes("sort")?"select":"div")]));
els.get("rr-dash-sort").value="finish";
const fixture={cards:[{race_date:"2026-11-22",track:"Del Mar",product_id:null,card:{track_name:"Del Mar",races:[{race_number:6,post_time_et:"6:00 PM",conditions:"Claiming $8,000",purse:"$20,000",pace:"Moderate",surface:"Dirt",distance:"5 1/2 furlongs",scratch_count:1,scratches:[{program_number:"3",horse_name:"Scratched Runner"}],entries:[{program_number:"5",horse_name:"Barrister Proof",rank:1,morning_line:"12-1",win_probability:27.5,fair_odds:"5/2",trainer:"Brad Cox",jockey:"Jose Ortiz",metrics:[]},{program_number:"12",horse_name:"Doo Wop Don",rank:2,morning_line:"5-2",win_probability:16.6,fair_odds:"5/1",trainer:"",jockey:"",metrics:[]}]}]}}]};
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
assert.equal(allClass(horses,"rr-dash-horse-connections")[1].textContent,"Trainer not listed | Jockey not listed");
assert.equal(allClass(horses,"rr-dash-win-percent")[0].textContent,"27.5%");
assert.equal(allClass(horses,"rr-dash-win-fair")[0].textContent,"FAIR 5/2");
assert.ok(!/RANK/i.test(horses.textContent),"No visible ranking");
console.log("PASS: dashboard data -> race purse, scratches/chips, ML, connections, fair odds and compact phone rules");

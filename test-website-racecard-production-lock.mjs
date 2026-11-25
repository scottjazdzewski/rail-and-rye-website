import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=p=>fs.readFileSync(p,"utf8");
const css=read("public/assets/rr-intelligence-chips.css");
const selector='.rr-dash-races .rr-dash-race-button.rr-race-saddle-tab[aria-current="true"]';
const block=css.slice(css.indexOf(selector));
assert.ok(block.startsWith(selector));
assert.match(block,/^\s*[^{]+\{\s*background:transparent;box-shadow:none;outline:none;/);
assert.match(block,/\[aria-current="true"\]::after\s*\{\s*background:#c99831;/);
assert.match(css,/width:28px;height:3px;border-radius:2px;background:transparent/);
const js=read("public/assets/projections-dashboard.js");
const start=js.indexOf("function compactRaceTitle(");
const end=js.indexOf("function editorialRacePresentation(",start);
assert.ok(start>=0&&end>start);
const compact=vm.runInNewContext(js.slice(start,end)+"\ncompactRaceTitle");
for(const [input,expected] of [
 ["Claiming $5K","Claiming"],
 ["Maiden Claiming $20,000","Maiden Claiming"],
 ["Allowance Optional Claiming $40K","Allowance Optional Claiming"],
 ["Claiming $10,000-$12,500","Claiming"],
 ["Belmont Stakes","Belmont Stakes"],
 ["Maiden Special Weight","Maiden Special Weight"]
])assert.equal(compact(input),expected);
assert.match(js,/"PURSE "\+purse/);
assert.match(js,/setAttribute\("aria-current",String\(race.race_number===activeRace\)\)/);
const assetPattern=/(?:href|src)="(\/assets\/(?:rr-intelligence-chips\.css|rr-projections-command\.css|rr-projections-track-identity\.css|rr-projections-race-header\.css|rr-race-titles\.js|projections-dashboard\.js)\?v=\d+)"/g;
const assetRefs=p=>[...read(p).matchAll(assetPattern)].map(m=>m[1]).sort();
const admin=assetRefs("public/admin/projections-preview.html");
assert.equal(admin.length,6);
assert.deepEqual(admin,assetRefs("public/membership/dashboard/index.html"));
console.log("Approved mobile racecard contract and renderer parity PASS");

const tileStart=js.indexOf("function raceFactDisplayValue(");
const tileEnd=js.indexOf("function makeMetricGroup(",tileStart);
assert.ok(tileStart>=0&&tileEnd>tileStart);
const node=(tag,cls,value)=>({tag,cls,value,dataset:{},attributes:{},children:[],setAttribute(k,v){this.attributes[k]=v},append(...children){this.children.push(...children)}});
const tile=vm.runInNewContext(js.slice(tileStart,tileEnd)+"\nmakeTile",{makeNode:node,iconNode:(art,cls)=>({art,cls})});
for(const value of [undefined,null,"","—","N/A","Insufficient evidence","Not enough data available to make a Pace Projection for this race."]){
 const rendered=tile("Pace",value);
 assert.equal(rendered.children[0].art,"fact_pace_moderate");
 assert.equal(rendered.children[2].value,"Moderate");
}
for(const [value,art] of [["Weak","fact_pace_weak"],["Moderate","fact_pace_moderate"],["Strong","fact_pace_strong"]]){
 const rendered=tile("Pace",value);
 assert.equal(rendered.children[0].art,art);
 assert.equal(rendered.children[2].value,value);
}
assert.equal(tile("Surface","").children[2].value,"—");
assert.equal(tile("Distance","").children[2].value,"—");
const race={pace:"",entries:[{metrics:[{label:"Pace Fit",value:"gray"}]}]};
tile("Pace",race.pace);
assert.deepEqual(race,{pace:"",entries:[{metrics:[{label:"Pace Fit",value:"gray"}]}]});
console.log("PDF parity: neutral race pace display fallback PASS");

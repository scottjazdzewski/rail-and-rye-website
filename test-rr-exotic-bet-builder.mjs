import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const script=readFileSync("public/assets/rr-exotic-bet-builder.js","utf8");
const css=readFileSync("public/assets/rr-exotic-bet-builder.css","utf8");
const chipCSS=readFileSync("public/assets/rr-intelligence-chips.css","utf8");
class FakeElement {
 constructor(tag){
  this.tagName=String(tag).toUpperCase();
  this.children=[];this.className="";this.attributes={};this.listeners={};
  this.textContent="";this.open=false;this.style={};this.value="";
 }
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=children}
 setAttribute(key,value){this.attributes[key]=String(value)}
 addEventListener(type,cb){this.listeners[type]=cb}
 showModal(){this.open=true}
 close(){this.open=false}
}
const body=new FakeElement("body");
const document={body,createElement:tag=>new FakeElement(tag)};
const context={document,window:{},console,Set,Map,Math,Number,Array,String,Intl};
vm.runInNewContext(script,context,{filename:"rr-exotic-bet-builder.js"});
const app=context.window.RRBetBuilder;
assert.equal(typeof app.open,"function");
const row=(p,name)=>({program_number:p,horse_name:name});
const entries=[row("4","Miss Stones"),row("2","Other Runner"),row("6","Another Runner"),row("12","Twelve"),row("1A","Coupled")];
const race={race_number:8,entries};
app.open({race,track:"Finger Lakes",date:"2026-11-23"});
assert.equal(body.children.length,1,"One overlay, not a new dialog per change");
assert.equal(body.children[0].open,true,"Bet Builder dialog must open");
const walk=(node)=>[node,...node.children.flatMap(child=>walk(child))];
let nodes=walk(body);
const urls=nodes.filter(x=>x.tagName==="IMG").map(x=>x.src);
for(const file of ["4.png","2.png","6.png","12.png","1.png"])
 assert.ok(urls.includes("/assets/approved/saddlecloths/"+file),
   "Horse selection must use approved real chip "+file);
assert.ok(nodes.some(x=>x.className==="rr-horse-chip__suffix"&&x.textContent==="A"),
 "Coupled entry 1A keeps approved #1 image and explicit A suffix");
const state=app._state;
state.positions[0].add("4");state.positions[1].add("2");state.positions[1].add("6");
let result=app._calculate();
assert.deepEqual(JSON.parse(JSON.stringify(result.combos)),[["4","2"],["4","6"]],
 "Exacta key/wheel must enumerate two distinct ordered combinations");
assert.equal(result.cost,2);
assert.equal(result.chance,null,"Never calculate exotic chances from F4 marginals alone");
assert.equal(result.fair,null,"Never invent fair payouts without signed ordered F4 source");
state.positions[1].add("4");
result=app._calculate();
assert.equal(result.combos.length,2,"Same horse in two places cannot form a valid combination");
state.mode="box";state.box=new Set(["4","2","6"]);state.base=0.5;
result=app._calculate();
assert.equal(result.combos.length,6,"Three-horse exacta box is six ordered combinations");
assert.equal(result.cost,3);
state.type="trifecta";state.box=new Set(["4","2","6","12"]);state.base=1;
result=app._calculate();
assert.equal(result.combos.length,24,"Four-horse trifecta box is 24 ordered combinations");
assert.equal(result.cost,24);
state.mode="key";state.type="exacta";state.positions=[new Set(["4"]),new Set(["2","6"]),new Set()];
state.base=1;
const receipt="f".repeat(64);
race.f4_ordered_probabilities={
 schema_version:1,model_id:"TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET",
 status:"verified",receipt_sha256:receipt,
 exacta:[
  {programs:["4","2"],probability:0.2},
  {programs:["4","6"],probability:0.1},
  {programs:["4","12"],probability:0.1},
  {programs:["4","1A"],probability:0.05},
  {programs:["2","4"],probability:0.06},
  {programs:["2","6"],probability:0.07},
  {programs:["2","12"],probability:0.04},
  {programs:["2","1A"],probability:0.03},
  {programs:["6","4"],probability:0.03},
  {programs:["6","2"],probability:0.04},
  {programs:["6","12"],probability:0.02},
  {programs:["6","1A"],probability:0.02},
  {programs:["12","4"],probability:0.02},
  {programs:["12","2"],probability:0.02},
  {programs:["12","6"],probability:0.01},
  {programs:["12","1A"],probability:0.01},
  {programs:["1A","4"],probability:0.04},
  {programs:["1A","2"],probability:0.03},
  {programs:["1A","6"],probability:0.03},
  {programs:["1A","12"],probability:0.08}
 ]};
const sum=race.f4_ordered_probabilities.exacta.reduce((a,b)=>a+b.probability,0);
assert.ok(sum>0.99&&sum<1.01,"Synthetic test probabilities should nearly sum to one");
const adjust=1/sum;
race.f4_ordered_probabilities.exacta=race.f4_ordered_probabilities.exacta.map(x=>({
 programs:x.programs,probability:x.probability*adjust
}));
result=app._calculate();
assert.ok(result.chance!==null,"Complete certified F4 prefix map should activate probability");
const expected=(0.2+0.1)*adjust;
assert.ok(Math.abs(result.chance-expected)<1e-10);
assert.ok(Math.abs(result.fair-2/expected)<1e-8);
race.f4_ordered_probabilities.receipt_sha256="";
assert.equal(app._calculate().chance,null,"Missing receipt must fail closed");
race.f4_ordered_probabilities.receipt_sha256=receipt;
race.f4_ordered_probabilities.exacta.pop();
assert.equal(app._calculate().chance,null,"Incomplete ordered F4 map must fail closed");
delete race.f4_ordered_probabilities;
assert.equal(app._calculate().chance,null,"Never infer from remaining horse probabilities");
assert.match(chipCSS,/\.rr-race-chip--tab\[aria-current="true"\]/,
 "Race tabs need distinct active gold/navy state");
assert.match(chipCSS,/rr-horse-chip__suffix/,
 "Coupled saddlecloth suffix must be styled");
assert.match(css,/rr-bet-horse-choice.*aria-pressed/s,
 "Horse choices use accessible pressed state");
for(const type of ["Exacta","Trifecta","1st-Place Key","Part-Wheel"])
 assert.ok(script.includes(type),"Builder must include approved mode "+type);
assert.doesNotMatch(script,/fetch\s*\(|XMLHttpRequest|Stripe|checkout/i,
 "Bet Builder does not connect to live tote, payment or bet execution");
console.log("PASS: exact approved horse chip art, coupled entry, valid combinations/cost, F4 gated probabilities, no tote integration");

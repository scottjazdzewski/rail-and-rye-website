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
const row=(p,name,pwin)=>({program_number:p,horse_name:name,win_probability_exact:pwin});
const entries=[row("4","Miss Stones",30),row("2","Other Runner",25),row("6","Another Runner",20),row("12","Twelve",15),row("1A","Coupled",10)];
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
const weights=[1,1.3,1.5,.8,.9];
const probs=[.30,.25,.20,.15,.10];
race.f4_ordered_probabilities={
 schema_version:2,model_id:"TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET",
 status:"verified",receipt_sha256:receipt,prefix_sha256:"e".repeat(64),
 scratch_state:"PRESCRATCH",date:"2026-11-23",track:"Finger Lakes",race_number:8,
 programs:entries.map(x=>x.program_number),
 pwin:probs,p2_weights:weights,p3_weights:weights
};
const denom=weights.reduce((a,b)=>a+b,0)-weights[0];
const expected=(.30*weights[1]/denom)+(.30*weights[2]/denom);
result=app._calculate();
assert.ok(result.chance!==null,"Source-verified frozen F4 conditional law activates ticket probability");
assert.ok(Math.abs(result.chance-expected)<1e-12,"Use exact F4 conditional P2 weights");
assert.equal(result.fair,Math.ceil((2/expected)*100-1e-9)/100,
 "Ticket-level break-even gross payout rounds UP to valid cents");
assert.ok(result.probabilities.has("4|2"));
race.f4_ordered_probabilities.receipt_sha256="";
assert.equal(app._calculate().chance,null,"Missing receipt must fail closed");
race.f4_ordered_probabilities.receipt_sha256=receipt;
race.f4_ordered_probabilities.p2_weights.pop();
assert.equal(app._calculate().chance,null,"Incomplete F4 weights must fail closed");
delete race.f4_ordered_probabilities;
assert.equal(app._calculate().chance,null,"Never infer exotic probability from PWIN marginals");
assert.match(chipCSS,/\.rr-race-chip--tab\[aria-current="true"\]/,
 "Race tabs need distinct active gold/navy state");
assert.match(chipCSS,/rr-horse-chip__suffix/,
 "Coupled saddlecloth suffix must be styled");
assert.match(css,/rr-bet-horse-choice.*aria-pressed/s,
 "Horse choices use accessible pressed state");
for(const type of ["Exacta","Trifecta","1st-Place Key","Part-Wheel"])
 assert.ok(script.includes(type),"Builder must include approved mode "+type);
assert.match(script,/api\/admin\/projections-f4/,
 "Bet Builder must load authentic frozen F4 probabilities from authenticated R2");
assert.match(script,/credentials:"same-origin"/,
 "Private F4 model read must preserve session credentials");
assert.doesNotMatch(script,/XMLHttpRequest|Stripe|checkout|tote-api|sportsbook-api/i,
 "Bet Builder never connects to a tote, betting service or payment platform");
console.log("PASS: exact approved horse chip art, coupled entry, valid combinations/cost, F4 gated probabilities, no tote integration");

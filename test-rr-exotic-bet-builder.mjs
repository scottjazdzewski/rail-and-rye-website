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
// Exhaustive second-place coverage for a single key must NOT show 100%.
// It can only win if the keyed runner wins (PWIN exactly .30 in this fixture).
state.mode="key";state.type="exacta";state.base=1;
state.positions=[new Set(["4"]),new Set(["2","6","12","1A"]),new Set()];
result=app._calculate();
assert.equal(result.combos.length,4,"Covering every second-place runner needs four combos");
assert.ok(Math.abs(result.chance-.30)<1e-12,"Full key probability must equal favorite's exact TRI PWIN");
assert.equal(result.fair,13.34,"Four-dollar full key break-even gross rounds UP to $13.34");
assert.equal(result.firstPlaceKey,true,"Full first-place key must be recognized");
assert.equal(result.allOutcomesCovered,false,"A full second-place key is NOT a 100% ticket");
assert.equal(app._formatChance(result.chance,result.allOutcomesCovered),"30.00%");
state.mode="box";state.box=new Set(entries.map(e=>e.program_number));
result=app._calculate();
assert.equal(result.combos.length,20,"Five-horse exacta ALL-box covers all twenty valid outcomes");
assert.ok(Math.abs(result.chance-1)<1e-12);
assert.equal(result.allOutcomesCovered,true,"100% coverage only when all exacta outcomes covered");
assert.equal(result.cost,20);
assert.equal(result.fair,20,"100% coverage still requires $20 gross to recover $20 ticket cost");
state.type="trifecta";
result=app._calculate();
assert.equal(result.combos.length,60,"Five-horse trifecta ALL-box covers all 60 permutations");
assert.ok(Math.abs(result.chance-1)<1e-12);
assert.equal(result.allOutcomesCovered,true);
assert.equal(result.cost,60);
assert.equal(result.fair,60);
state.type="exacta";state.box=new Set(["4","2","6","12"]);
result=app._calculate();
assert.equal(result.allOutcomesCovered,false);
assert.ok(result.chance<1,"A four-of-five exacta box is NOT guaranteed to hit");
state.mode="wheel";state.positions=[new Set(),new Set(),new Set()];
result=app._calculate();
assert.equal(result.combos.length,0);
assert.equal(result.chance,null,"No ticket must say select horses, not a false zero or 100 percent");
assert.equal(result.modelAvailable,true,"No selection must not be reported as a missing verified F4 model");
assert.equal(result.fair,null);
assert.equal(app._formatChance(.99999,false),">99.99%",
 "Roundoff cannot show 100% when any modeled finishing outcome is missing");
assert.equal(app._formatChance(1,true),"100.00%");
assert.equal(app._formatChance(.000001,false),"<0.01%",
 "Extremely small positive chance cannot display as exact zero");
race.f4_ordered_probabilities.receipt_sha256="";
assert.equal(app._calculate().chance,null,"Missing receipt must fail closed");
race.f4_ordered_probabilities.receipt_sha256=receipt;
race.f4_ordered_probabilities.p2_weights.pop();
assert.equal(app._calculate().chance,null,"Incomplete F4 weights must fail closed");
delete race.f4_ordered_probabilities;
assert.equal(app._calculate().chance,null,"Never infer exotic probability from PWIN marginals");
// Reproduce the screenshot's math with a six-runner, independently normalized
// synthetic field. #4 on top of every other runner = exactly #4 PWIN.
const six=[
 row("4","Miss Stones",31.41),row("1","Lady Serenity",30.41),
 row("3","Open Soul Autism",13.51),row("6","Cinnamon Sugar",12.41),
 row("2","Itwillbefun",8.41),row("5","Moontown",3.85)
];
assert.equal(six.reduce((sum,e)=>sum+e.win_probability_exact,0).toFixed(6),"100.000000");
const sixRace={race_number:1,entries:six};
app.open({race:sixRace,track:"Finger Lakes",date:"2026-11-23"});
sixRace.f4_ordered_probabilities={
 schema_version:2,model_id:"TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET",
 status:"verified",receipt_sha256:"f".repeat(64),prefix_sha256:"e".repeat(64),
 scratch_state:"PRESCRATCH",date:"2026-11-23",track:"Finger Lakes",race_number:1,
 programs:six.map(x=>x.program_number),
 pwin:six.map(x=>x.win_probability_exact/100),
 p2_weights:six.map(()=>1),p3_weights:six.map(()=>1)
};
state.mode="key";state.type="exacta";state.base=1;
state.positions=[new Set(["4"]),new Set(["1","3","6","2","5"]),new Set()];
result=app._calculate();
assert.equal(result.combos.length,5);
assert.equal(result.cost,5);
assert.ok(Math.abs(result.chance-.3141)<1e-12,
 "Five-second-place exactas behind #4 have exactly #4's 31.41% win probability");
assert.equal(result.fair,15.92,
 "At a $5 total stake, break-even equal gross payout = $5/0.3141 rounded UP");
assert.equal(result.firstPlaceKey,true);
assert.equal(result.allOutcomesCovered,false);
assert.equal(app._formatChance(result.chance,result.allOutcomesCovered),"31.41%");
state.mode="box";state.box=new Set(six.map(x=>x.program_number));
result=app._calculate();
assert.equal(result.combos.length,30);
assert.ok(Math.abs(result.chance-1)<1e-12);
assert.equal(result.allOutcomesCovered,true);
assert.equal(result.cost,30);
assert.equal(result.fair,30);
assert.match(script,/ALL FINISHING COMBINATIONS COVERED:[\s\S]*?NOT a guaranteed profit/,
 "100% coverage must be explicitly separated from the odds of turning a profit");
assert.match(script,/FIRST-PLACE KEY:[\s\S]*?ONLY if/,
 "Exhaustive second-place selection must explain it still needs the key to win");
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

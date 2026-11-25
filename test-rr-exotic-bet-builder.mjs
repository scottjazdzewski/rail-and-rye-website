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
  this.textContent="";this.open=false;this.style={};this.value="";this.dataset={};this.scrollTop=0;
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
const readable=(node)=>node.textContent+node.children.map(readable).join("");
const summary=()=>walk(body).find(node=>node.className==="rr-bet-summary");
const selectedChoice=(key)=>walk(body).find(node=>node.dataset?.betChoiceKey===key);
const topSections=()=>body.children[0].children[0].children.map(node=>node.className);
assert.ok(topSections().indexOf("rr-bet-summary")>=0,"Premium projection summary must exist");
assert.ok(topSections().indexOf("rr-bet-summary")<topSections().indexOf("rr-bet-position"),
 "Hit probability and gross payout must appear before horse choices");
assert.match(readable(summary()),/PROJECTED HIT CHANCE/,"Hit chance leads summary");
assert.match(readable(summary()),/BREAK-EVEN GROSS PAYOUT/,"Break-even is visibly labeled as GROSS");
assert.match(readable(summary()),/Ticket cost \$0\.00/,"Ticket cost is shown with the model summary");
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
// The same certified probabilities must remain available on a SCRATCH_FINAL
// race when the current card and source receipts match.
const lineage={tri_sha256:"a".repeat(64),f4_sha256:receipt,prescratch_parent_sha256:"b".repeat(64),official_changes_sha256:"c".repeat(64)};
const originalDistribution=race.f4_ordered_probabilities;
app.open({race,track:"Finger Lakes",date:"2026-11-23",
 projection_status:"scratch_final",model_receipts:lineage});
race.f4_ordered_probabilities={...originalDistribution,scratch_state:"SCRATCH_FINAL",dashboard_receipts:lineage};
state.mode="key";state.type="exacta";state.positions=[new Set(["4"]),new Set(["2","6"]),new Set()];
result=app._calculate();
assert.ok(result.chance>0,"Signed scratch-final F4 restores Bet Builder projected hit chance");
assert.ok(result.fair>0,"Signed scratch-final F4 restores break-even gross payout");
race.f4_ordered_probabilities.dashboard_receipts={...lineage,f4_sha256:"9".repeat(64)};
assert.equal(app._calculate().chance,null,"Incorrect scratch-final receipt cannot display numerical projections");
race.f4_ordered_probabilities=originalDistribution;
app.open({race,track:"Finger Lakes",date:"2026-11-23",projection_status:"prescratch"});
race.f4_ordered_probabilities=originalDistribution;
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
// Trigger real user selection (not just test-only math) so the current F4
// results are rendered in the same mobile summary the customer sees.
body.children[0].scrollTop=186;
const removeLast=selectedChoice("1:5");
assert.ok(removeLast?.listeners.click,"Saddlecloth choice must be clickable");
removeLast.listeners.click();
assert.equal(body.children[0].scrollTop,186,"Selecting a horse must not jump the mobile drawer");
assert.ok(selectedChoice("1:5")?.listeners.click);
selectedChoice("1:5").listeners.click();
assert.match(readable(summary()),/31\.41%/,"Render actual certified F4 ticket chance prominently");
assert.match(readable(summary()),/\$15\.92/,"Render actual required gross payout prominently");
assert.match(readable(summary()),/5 combinations/,"Show ticket size beside the projected return");
assert.match(readable(summary()),/Ticket cost \$5\.00/,"Show total wager alongside the probability");
assert.match(readable(summary()),/Full key: #4 must WIN/,
 "Make the first-place key requirement unmissable");
assert.match(readable(summary()),/equal gross payouts/,
 "A multiple-combination key must display the gross-payout assumption without opening help");
assert.ok(!walk(body).some(node=>node.className==="rr-bet-help"),"Remove long payout FAQ from the customer interface.");

state.mode="box";state.box=new Set(six.map(x=>x.program_number));
result=app._calculate();
assert.equal(result.combos.length,30);
assert.ok(Math.abs(result.chance-1)<1e-12);
assert.equal(result.allOutcomesCovered,true);
assert.equal(result.cost,30);
assert.equal(result.fair,30);
const fullBoxChoice=selectedChoice("0:5");
assert.ok(fullBoxChoice?.listeners.click);
fullBoxChoice.listeners.click(); // Remove from full-field box.
selectedChoice("0:5").listeners.click(); // Restore full coverage in UI.
assert.match(readable(summary()),/100\.00%/,"All thirty exactas really do cover all outcomes");
assert.match(readable(summary()),/NOT guarantee a profit/,
 "Full-field ticket must not imply guaranteed financial gain");
assert.match(readable(summary()),/equal gross payouts/,
 "Full coverage still requires a visible payout-variation caveat");
assert.match(readable(summary()),/Ticket cost \$30\.00/,
 "Winning every modeled finishing outcome still costs thirty dollars");
assert.match(script,/100% outcome coverage does NOT guarantee a profit/,
 "100% outcome coverage must be explicitly separate from profit");
assert.match(script,/Full key:[\s\S]*?must WIN/,
 "A fully covered second-place key still depends on its first-place horse");
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

assert.match(css,/\.rr-bet-summary\{[\s\S]*?position:sticky;top:54px;/,
 "Model results must stick near the mobile dialog header while scrolling");
assert.match(css,/\.rr-bet-main-stat strong\{/,
 "Hit chance and payout are the largest numerical values");
assert.match(css,/\.rr-bet-horse-choice\{min-height:56px;/,
 "Compact chip choices should not waste the mobile viewport");
assert.match(css,/\.rr-bet-position-heading\{/,
 "Each horse position has clear selected counts");
assert.match(script,/dialog\.scrollTop=previousScroll/,
 "Re-render must preserve mobile drawer position");


// The Daily Double tab uses the two races' exact PWIN marginals and keeps
// ticket probability separate from actual tote payout data.
const dd1={race_number:1,entries:[row("1","Leg One Favorite",40),row("2","Leg One Other",60)]};
const dd2={race_number:2,entries:[row("3","Leg Two Other",25),row("4","Leg Two Favorite",75)]};
const dd3={race_number:3,entries:[row("5","Third Race A",50),row("6","Third Race B",50)]};
app.open({race:dd1,card:{races:[dd1,dd2,dd3]},track:"Tampa Bay Downs",date:"2026-11-25"});
const doubleTab=walk(body).find(node=>node.tagName==="BUTTON"&&node.textContent==="Daily Double");
assert.ok(doubleTab?.listeners.click,"Daily Double has a dedicated builder tab");
doubleTab.listeners.click();
assert.match(readable(body),/Races 1–2/,"Default pair starts with the selected race and its next race");
assert.ok(selectedChoice("0:1")?.listeners.click);
selectedChoice("0:1").listeners.click();
assert.ok(selectedChoice("1:4")?.listeners.click);
selectedChoice("1:4").listeners.click();
result=app._calculate();
assert.equal(result.combos.length,1);
assert.ok(Math.abs(result.chance-.30)<1e-12,"DD chance multiplies the selected runners' exact PWINs");
assert.equal(result.cost,1);
assert.equal(result.fair,3.34,"DD break-even gross payout rounds up to cents");
assert.match(readable(summary()),/30\.00%/,"Display the model-estimated DD hit chance");
assert.match(readable(summary()),/BREAK-EVEN GROSS PAYOUT/,"Display break-even gross payout");
assert.match(readable(summary()),/Ticket cost \$1\.00/,"Display DD ticket cost");
assert.match(readable(summary()),/independent race outcomes/,"State the cross-race probability assumption");
const pairSelect=walk(body).find(node=>node.tagName==="SELECT"&&node.id==="rr-bet-pair");
assert.ok(pairSelect?.listeners.change,"Users can switch Daily Double pairs");
pairSelect.value="2-3";pairSelect.listeners.change();
assert.match(readable(body),/Races 2–3/,"Pair selector updates both leg groups");
assert.equal(app._calculate().combos.length,0,"Changing pairs clears stale selections");

console.log("PASS: exact approved horse chip art, coupled entry, valid combinations/cost, F4 gated probabilities, no tote integration");

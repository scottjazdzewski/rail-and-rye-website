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
assert.match(css,/min-height:114px/,"Runner cards no longer reserve a blank analysis footer");
assert.match(js,/F4 FINISH PROJECTIONS/,"Full Analysis must include F4 outcomes");
assert.match(js,/remain current until scratches/,"Initial-card scratch-state disclaimer must remain visible");
assert.match(css,/\.rr-dash-metric-group\{grid-area:metrics;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/,"Mobile ratings must occupy a single, compact five-column strip");
assert.doesNotMatch(js,/Trainer not listed \| Jockey not listed/,"Do not repeat source-data warnings on customer runner rows");
assert.match(css,/\.rr-dash-race-tiles\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,"Compact race facts occupy three short columns");
assert.match(css,/grid-template-areas:"program horse market" "metrics metrics metrics";/,"Runner rows should contain only identity and factor strips");
assert.match(css,/\.rr-dash-win\{align-self:start;justify-self:end;align-items:flex-end;text-align:right/,"Numerical values remain right aligned");
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
const ids=["rr-dash-status","rr-dash-app","rr-dash-login","rr-dash-empty","rr-dash-date","rr-dash-track","rr-dash-race-time","rr-dash-races","rr-dash-race","rr-dash-horses","rr-dash-search","rr-dash-open-pdf","rr-dash-download-pdf","rr-dash-update","rr-dash-horse-dialog","rr-dash-horse-title","rr-dash-horse-detail","rr-dash-horse-close","rr-dash-global-timeline","rr-dash-all-races","rr-dash-timeline-count","rr-dash-previous-race","rr-dash-next-race","rr-dash-mode-track","rr-dash-mode-all"];
const els=new Map(ids.map(id=>[id,new Element(id.includes("date")||id==="rr-dash-track"||id.includes("race-time")||id==="rr-dash-all-races"||id.includes("sort")?"select":"div")]));
const fixture={cards:[{race_date:"2026-11-22",track:"Del Mar",product_id:null,card:{track_name:"Del Mar",races:[{race_number:6,post_time_et:"6:00 PM",conditions:"Claiming $8,000",purse:"$20,000",pace:"Moderate",surface:"Dirt",distance:"5 1/2 furlongs",scratch_count:1,scratches:[{program_number:"3",horse_name:"Scratched Runner"}],entries:[{program_number:"5",horse_name:"Doo Wop Don",morning_line:"5-2",win_probability:16.6,fair_odds:"5/1",trainer:"",jockey:"",metrics:[]},{program_number:"2",horse_name:"Third Horizon",morning_line:"9-2",win_probability:20.0,fair_odds:"4/1",trainer:"",jockey:"",metrics:[]},{program_number:"12",horse_name:"Barrister Proof",morning_line:"12-1",win_probability:27.5,fair_odds:"5/2",trainer:"Brad Cox",jockey:"Jose Ortiz",metrics:[{label:"Speed",value:"green"},{label:"Form",value:"gray"},{label:"Class",value:"red"},{label:"Pace Fit",value:"green"},{label:"Surface / Distance",value:"gray"}]}]}]}}]};
// Deliberately out-of-number post order: Del Mar Race 6 is before Race 4.
fixture.cards[0].card.races.push({race_number:4,post_time_et:"8:05 PM ET",conditions:"Belmont S. (G1) Presented by NYRA Bets",purse:"$21,000",pace:"Weak",surface:"Dirt",distance:"6 F",entries:[{program_number:"1",horse_name:"Later Del Mar Runner",win_probability:29,win_probability_exact:29,morning_line:"3-1",fair_odds:"2.45/1",metrics:[]}]});
fixture.cards.push({race_date:"2026-11-22",track:"Zia Park",product_id:null,card:{track_name:"Zia Park",races:[{race_number:2,post_time_et:"4:30 PM ET",conditions:"Allowance",purse:"$17,000",pace:"Moderate",surface:"Dirt",distance:"6 F",entries:[{program_number:"3",horse_name:"Earlier Zia Runner",win_probability:39.7,win_probability_exact:39.7,morning_line:"3-1",fair_odds:"1.52/1",metrics:[]}]}]}});
const document={body:{dataset:{rrPreview:"true"}},querySelector(selector){return els.get(selector.slice(1))??null;},createElement(tag){return new Element(tag);}};
const context={document,fetch:async()=>({ok:true,json:async()=>fixture}),Intl,Date,Number,String,Array,Error,console,encodeURIComponent};
const instrumented=js.replace(/\ninit\(\);\s*\}\)\(\);\s*$/,"\nglobalThis.__testToteOdds=fairOdds;\ninit();\n})();");
assert.notEqual(instrumented,js,"The approved fair-odds display helper must be testable");
vm.runInNewContext(readFileSync("public/assets/rr-race-titles.js","utf8"),context,{filename:"rr-race-titles.js"});
vm.runInNewContext(instrumented,context,{filename:"projections-dashboard.js"});
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
assert.deepEqual(names,["Barrister Proof","Doo Wop Don","Third Horizon"],"Lead must have greatest TRI PWIN, while the remaining horses retain scorer order");
assert.equal(allClass(horses,"rr-dash-horse-ml")[0].textContent,"M/L 12-1");
assert.equal(allClass(horses,"rr-dash-horse-connections")[0].textContent,"Brad Cox | Jose Ortiz");
assert.equal(allClass(horses,"rr-dash-horse-connections").length,1,"Missing trainer and jockey must not create filler text");
assert.equal(allClass(horses,"rr-dash-metric-group").length,4,"Three runner groups plus desktop table heading must remain");
assert.equal(allClass(horses,"rr-dash-win-percent")[0].textContent,"27.5%");
assert.equal(allClass(horses,"rr-dash-win-fair")[0].textContent,"FAIR 5-2");
assert.ok(allClass(horses,"rr-dash-metric-value").length===15,"All five factors must remain visible on every horse");
const approvedDashes=allClass(horses,"rr-dash-metric-bars");
assert.equal(approvedDashes.length,5,"Each certified factor state renders as dashes");
assert.ok(approvedDashes.every(el=>el.children.length===3),"Each state uses three flat dashes");
assert.equal(allClass(horses,"rr-dash-rating-badge").length,0,"Large factor icons must not return");

assert.ok(!/RANK/i.test(horses.textContent),"No visible ranking");
const runnerRows=allClass(horses,"rr-dash-runner-row");
assert.equal(allClass(horses,"rr-dash-full-analysis").length,0,"Never repeat Analysis on every runner");
assert.ok(runnerRows[0].events?.click,"Any portion of the horse row can open its details");
assert.match(horses.textContent,/Brad Cox \| Jose Ortiz/,"Trainer and jockey remain directly beneath the horse name");
assert.equal(allClass(horses,"rr-dash-analysis-connections").length,0,"Connections must not be repeated in the analysis footer");
runnerRows[0].events.click({target:null});
assert.equal(els.get("rr-dash-horse-dialog").opened,true,"Full Analysis must open a dialog");
const sheet=matchClass(els.get("rr-dash-horse-detail"),"rr-dash-mobile-analysis");
assert.ok(sheet,"Full Analysis must populate the mobile sheet");
assert.match(sheet.textContent,/RACE CONTEXT/);
assert.match(sheet.textContent,/FIVE-FACTOR READOUT/);
assert.match(sheet.textContent,/Brad Cox/);
assert.match(sheet.textContent,/Jose Ortiz/);
assert.match(sheet.textContent,/27.5%/);
assert.match(sheet.textContent,/FAIR 5-2/);
const lockedOrder=allClass(horses,"rr-dash-horse-name").map(el=>el.textContent);
assert.deepEqual(lockedOrder,["Barrister Proof","Doo Wop Don","Third Horizon"],
 "Lead TRI win probability first; preserve original projected finish order of all remaining runners");
const adminSort=readFileSync("public/admin/projections-preview.html","utf8");
const memberSort=readFileSync("public/membership/dashboard/index.html","utf8");
for(const html of [adminSort,memberSort]){
 assert.doesNotMatch(html,/rr-dash-sort|Sort by|value="finish"|value="program"/,
   "There must be no customer-facing sorting controls");
 assert.match(html,/projections-dashboard\.js\?v=31/,"Use current locked-order client");
}
assert.doesNotMatch(js,/rr-dash-sort/,"Client must not let users reorder horses");
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
assert.match(adminHtml,/projections-dashboard\.js\?v=31/,
 "Admin dashboard must load the latest hardened shared client");
assert.match(memberHtml,/projections-dashboard\.js\?v=31/,
 "Member dashboard must use the same client revision");
console.log("PASS: no embedded premium data or partial review fallback; authenticated full-field preview only");


// Screenshot-driven readability pass: remove redundant preview hero and make
// data the first visible content, while preserving protected auth controls.
for(const html of [adminHtml,memberHtml]){
 assert.doesNotMatch(html,/rr-dash-heading|rr-dash-intro|rr-dash-library-link/,
  "No oversized explanatory hero or return-to-uploader button on Projections");
 assert.match(html,/<h1 class="rr-dash-visually-hidden">Rail &amp; Rye Projections<\/h1>/,
  "Keep an accessible page title without visible ornamental title space");
 assert.match(html,/class="rr-dash-search-field"/,
  "The mobile horse search occupies one consistent full-width row");
 assert.match(html,/projections-dashboard\.css\?v=25/,
  "Current improved typography style must be loaded");
 assert.match(html,/projections-dashboard\.js\?v=31/,
  "Current compact-label asset must be loaded");
}
assert.doesNotMatch(adminHtml,/rr-dash-private-banner|Private admin preview · member dashboard remains off|Return to projection uploader/,
 "Remove all prominent launch/admin warning copy from the private preview");
assert.doesNotMatch(js,/previewMode\?"Private admin preview"/,
 "Do not put redundant admin labels in the filter toolbar");
assert.match(css,/\.rr-dash-visually-hidden\{/,
 "Accessible title must remain off-screen");
assert.match(css,/\.rr-dash-toolbar \.rr-dash-race-time-field\{display:none\}/,
 "On phones, race number tabs replace the redundant post-time select");
assert.match(css,/\.rr-dash-toolbar \.rr-dash-search-field\{grid-column:1\/-1\}/,
 "Horse search spans both mobile columns");
assert.match(css,/\.rr-dash-horse-name\{font:750 17px\/1\.2/,
 "Runner names must be readable at 17px on ordinary phones");
assert.match(css,/\.rr-dash-horse-connections\{margin-top:4px;font:550 12px\/1\.28/,
 "Verified trainer/jockey must remain clear at 12px");
assert.match(css,/\.rr-dash-win-percent\{font-size:25px/,
 "Keep 25px bold percentage numbers");
assert.match(css,/\.rr-dash-win-fair\{font-size:13px/,
 "Increase supporting fair odds to 13px");
assert.match(css,/\.rr-dash-metric-value::before\{font:800 10px\/1\.15/,
 "Make five factor labels readable at 10px");
assert.match(css,/\.rr-dash-row-analysis\{display:none!important\}/,"No per-horse analysis footer in any card");
assert.match(css,/@media\(max-width:360px\)/,
 "Narrow screens must reduce only secondary sizes to prevent name clipping");
console.log("PASS: minimal admin preview, full-width mobile search, 17px runner names, readable factors/odds and preserved compact layout");

for(const [probability,american] of [[39.7,"3-2"],[31.4,"2-1"],[13.6,"6-1"],[10.2,"9-1"],[5.3,"18-1"],[4.1,"23-1"]]){
 assert.equal(context.__testToteOdds({win_probability_exact:probability,fair_odds:"1.52/1"}),american,
  "Always convert exact TRI fair net prices to conventional American tote-style fractions");
}
assert.doesNotMatch(js,/makeNode\("button","rr-dash-full-analysis"/,
 "No separate Analysis buttons may be created");
for(const html of [adminHtml,memberHtml]){
 assert.match(html,/id="rr-dash-mode-track"/,"By Track navigation exists");
 assert.match(html,/id="rr-dash-mode-all"/,"All Tracks post-time mode exists");
 assert.match(html,/id="rr-dash-all-races"/,"Chronological global race selector exists");
}
assert.match(css,/\.rr-dash-card-logo\{width:45px;height:45px;object-fit:contain\}/,
 "Preserve authentic track-header horseshoe graphic, scaled without cropping");
assert.match(js,/logo\.src="\/assets\/brand\/rail_rye_logo_header\.png"/,
 "Retain original approved track header graphic");
const raceTabs=els.get("rr-dash-races").children.map(button=>button.getAttribute("aria-label"));
assert.match(raceTabs[0],/Race 6 · 6:00 PM/,"By Track tabs must follow post time, not race number");
assert.match(raceTabs[1],/Race 4 · 8:05 PM/,"Late race should be second in actual chronology");
els.get("rr-dash-mode-all").events.click();
assert.equal(els.get("rr-dash-app").dataset.mode,"all");
assert.equal(els.get("rr-dash-global-timeline").hidden,false);
assert.deepEqual(els.get("rr-dash-all-races").children.map(option=>option.textContent),[
 "4:30 PM ET · Zia Park · Race 2",
 "6:00 PM · Del Mar · Race 6",
 "8:05 PM ET · Del Mar · Race 4"
],"Full-day timeline must sort races across all returned tracks by real post times");
assert.equal(els.get("rr-dash-all-races").value,"1","Current selected race remains in its true timeline position");
els.get("rr-dash-previous-race").events.click();
assert.match(els.get("rr-dash-race").textContent,/ZIA PARK/i,"Previous takes user to chronologically earlier track");
els.get("rr-dash-next-race").events.click();
assert.match(els.get("rr-dash-race").textContent,/DEL MAR/i,"Next returns to chronologically later race");
assert.equal(els.get("rr-dash-mode-all").attributes["aria-pressed"],"true");
els.get("rr-dash-mode-track").events.click();
assert.equal(els.get("rr-dash-app").dataset.mode,"track");
assert.equal(els.get("rr-dash-global-timeline").hidden,true);
// Real DOM integration: display FULL stakes name, no sponsorship, trophy G1.
els.get("rr-dash-track").value="Del Mar";
els.get("rr-dash-track").events.change();
const laterRace=els.get("rr-dash-races").children.find(x=>x.dataset.raceNumber==="4");
assert.ok(laterRace?.events?.click,"The graded stakes race tab should exist");
laterRace.events.click();
const displayedRace=els.get("rr-dash-race");
assert.match(displayedRace.textContent,/Belmont Stakes/,"Stakes name must be fully written out");
assert.doesNotMatch(displayedRace.textContent,/Presented by|NYRA Bets|Belmont S\\./i,
 "Sponsor and race-name abbreviation must not appear in header");
const trophy=matchClass(displayedRace,"rr-dash-graded-trophy");
assert.ok(trophy,"A source-verified G1 stakes race must display a trophy");
assert.match(trophy.className,/--g1/,"Grade 1 trophy must use gold distinction");
assert.equal(trophy.getAttribute("aria-label"),"Grade 1 stakes trophy");
const realRaceHeaderChip=matchClass(displayedRace,"rr-race-saddle-image");
assert.ok(realRaceHeaderChip&&realRaceHeaderChip.src.endsWith("/4.png"),
 "Race 4 header MUST show real #4 saddlecloth artwork");
assert.equal(allClass(displayedRace,"rr-dash-track-mark-letters").length,0,
 "No synthetic FL/MNR track initials should replace actual artwork");
assert.equal(allClass(displayedRace,"rr-dash-approved-track-logo").length,0,
 "Unknown track logo assets must not be invented or borrowed from another venue");
assert.equal(allClass(displayedRace,"rr-race-chip__label").length,0,
 "Remove old stacked RACE caption competing with two-digit numbers");
// Reproduce the user's real First Lady S. screenshot, both with and WITHOUT
// the independently loaded title helper. Neither may leak 'S.'.
fixture.cards[0].card.races[1].conditions="FIRST LADY S.";
laterRace.events.click();
assert.match(els.get("rr-dash-race").textContent,/First Lady Stakes/,
 "Mahoning Valley-style abbreviated stakes names must expand in the full race header");
assert.doesNotMatch(els.get("rr-dash-race").textContent,/FIRST LADY S\./);
context.RRRaceTitles=undefined;
laterRace.events.click();
assert.match(els.get("rr-dash-race").textContent,/First Lady Stakes/,
 "If the external title file fails to load, Projections itself still expands S. to Stakes");
fixture.cards[0].card.races[1].conditions="Hollywood Gaming Mahoning Distaff S.";
laterRace.events.click();
assert.match(els.get("rr-dash-race").textContent,/Mahoning Distaff Stakes/,
 "Even without title helper, the verified Mahoning sponsorship is stripped");
assert.doesNotMatch(els.get("rr-dash-race").textContent,/Hollywood Gaming/);
fixture.cards[0].card.races[1].conditions="Cheryl S. White Memorial S.";
laterRace.events.click();
assert.match(els.get("rr-dash-race").textContent,/Cheryl S. White Memorial Stakes/,
 "Internal initials must be retained and terminal S. expanded");
assert.ok(matchClass(els.get("rr-dash-race"),"rr-dash-race-banner--extended-title"),
 "Very long full names get the balanced-title layout");
context.RRRaceTitles={describe:()=>({title:"First Lady Stakes",grade:null})};

const originalRace=els.get("rr-dash-races").children.find(x=>x.dataset.raceNumber==="6");
assert.ok(originalRace?.events?.click,"Original current race must remain available");
originalRace.events.click();
const realCard=fixture.cards[0],oldTrack=realCard.track,oldName=realCard.card.track_name;
realCard.track="Finger Lakes";realCard.card.track_name="Finger Lakes";
originalRace.events.click();
const sourceTrackLogo=matchClass(els.get("rr-dash-race"),"rr-dash-approved-track-logo");
assert.ok(sourceTrackLogo,"Real venue-specific logo is restored on approved tracks");
assert.equal(sourceTrackLogo.src,"/assets/approved/track-logos/finger-lakes.webp");
assert.equal(sourceTrackLogo.alt,"Finger Lakes track logo");
assert.equal(allClass(els.get("rr-dash-race"),"rr-dash-track-mark-letters").length,0,
 "Synthesized track branding is absent");
realCard.track=oldTrack;realCard.card.track_name=oldName;
originalRace.events.click();
console.log("PASS: true per-track chronology; authentic logos and race artwork; conventional tote fair odds");


// Canonical cross-module chips and Bet Builder live in the protected projection view.
const chipStyles=readFileSync("public/assets/rr-intelligence-chips.css","utf8");
for(const html of [adminHtml,memberHtml]){
 assert.match(html,/rr-intelligence-chips\.css\?v=3/,"Load the shared race/horse chip identity");
 assert.match(html,/rr-exotic-bet-builder\.css\?v=3/,"Load the responsive exotic ticket builder skin");
 assert.match(html,/rr-exotic-bet-builder\.js\?v=4/,"Load the source-gated no-tote Bet Builder");
}
assert.match(js,/rr-dash-race-button rr-race-saddle-tab/,
 "Every race navigation tab uses the branded saddle-chip form");
assert.match(js,/rr-dash-race-number rr-race-saddle-header/,
 "Race number plaque uses same standardized chip grammar");
assert.match(js,/rr-dash-track-mark-letters/,"A compact, sponsor-free track-specific mark replaces old tiny white-backed artwork");
assert.doesNotMatch(js,/approvedTrackLogos=\{/,"Do not render legacy sponsor-logo image tiles");
assert.match(js,/logo\.src="\/assets\/brand\/rail_rye_logo_header\.png"/,
 "Never lose the persistent R&R horseshoe in track header");
assert.match(js,/button\.dataset\.raceNumber=String\(race\.race_number\)/,
 "Active race chips must be keyed to actual race numbers, not parsed full labels");
assert.match(js,/Number\(button\.dataset\.raceNumber\)===activeRace/,
 "Post-time labels cannot break active race tab highlighting");
assert.match(chipStyles,/\.rr-horse-chip img/,
 "Horse selection graphics reuse exact approved saddlecloth images");
assert.match(chipStyles,/\.rr-dash-races \.rr-dash-race-button\.rr-race-saddle-tab\[aria-current="true"\]/,
 "Active selected race shows a gold focus ring while maintaining the authentic saddlecloth color");
const betLaunch=allClass(els.get("rr-dash-horses"),"rr-bet-launch")[0];
assert.ok(betLaunch?.events?.click,"Current race needs a usable Bet Builder launch");
let passedRace=null;
context.RRBetBuilder={open:(args)=>{passedRace=args;}};
betLaunch.events.click();
assert.equal(passedRace?.race?.race_number,6,"Bet Builder opens the currently selected race");
assert.equal(passedRace?.track,"Del Mar","Bet Builder retains current track context");
assert.equal(passedRace?.date,"2026-11-22","Bet Builder retains current racing date");
// Two-digit race badges are now authentic saddlecloths too, with no RACE
// caption or extra CSS plaque layers.
fixture.cards[0].card.races[1].race_number=10;
const firstTab=els.get("rr-dash-races").children.find(x=>x.dataset.raceNumber==="6");
firstTab.events.click();
const tenthTab=els.get("rr-dash-races").children.find(x=>x.dataset.raceNumber==="10");
assert.ok(tenthTab,"Race 10 remains navigable after post-time sorting");
assert.equal(allClass(tenthTab,"rr-race-saddle-image")[0].src,
 "/assets/approved/saddlecloths/10.png","Race 10 must use actual #10 saddlecloth artwork");
tenthTab.events.click();
assert.equal(allClass(els.get("rr-dash-race"),"rr-race-saddle-image")[0].src,
 "/assets/approved/saddlecloths/10.png","Race header uses the same authentic two-digit saddlecloth");

console.log("PASS: stable branded race chip selection, approved horse/track art and current-race Bet Builder entry");

for(const html of [adminHtml,memberHtml]){
 assert.match(html,/rr-exotic-bet-builder\.js\?v=4/,
  "Customers must load the actual source-backed F4 odds client, not cached v1");
 assert.match(html,/projections-dashboard\.js\?v=31/,
  "Both admin and member dashboard views receive same race-aware F4 routing");
}
console.log("PASS: private live-F4 percentages and gross break-even payout UI cache-busted");

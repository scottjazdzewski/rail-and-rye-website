import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const css=readFileSync("public/assets/projections-dashboard.css","utf8");
const commandCss=readFileSync("public/assets/rr-projections-command.css","utf8");
const trackCss=readFileSync("public/assets/rr-projections-track-identity.css","utf8");
const headerCss=readFileSync("public/assets/rr-projections-race-header.css","utf8");
const factsCss=readFileSync("public/assets/rr-race-facts.css","utf8");
const js=readFileSync("public/assets/projections-dashboard.js","utf8");
assert.match(factsCss,/\.rr-dash-race-tiles\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,"Facts use the current three-column compact layout");
assert.doesNotMatch(js,/INITIAL CARD · CURRENT|INITIAL · CURRENT|SCRATCH UPDATED · CURRENT|rr-dash-card-update-state|verified initial evaluation/,"Never reintroduce internal production-state labels.");
assert.doesNotMatch(js,/badges are not yet certified/,"Verified initial badges must not be called uncertified");
assert.match(js,/rr-dash-metric-bars/,"Five source-backed factor states must render as compact colored dashes");
assert.doesNotMatch(js,/iconNode\(art,"rr-dash-rating-badge"/,"No large factor PNGs in the compact runner rows");
assert.match(css,/family=Tinos/,"Load the original racecard percentage font");
assert.match(css,/\.rr-dash-win-percent\{font-family:"Tinos"/,"Match the approved Tinos Bold percentage font");
assert.match(css,/\.rr-dash-metric-value\[data-state="gray"\] \.rr-dash-metric-bar/,"Neutral factors have an explicit gray dash color");
assert.match(css,/min-height:114px/,"Runner cards no longer reserve a blank analysis footer");
assert.match(js,/F4 FINISH PROJECTIONS/,"Full Analysis must include F4 outcomes");
assert.doesNotMatch(js,/rr-dash-prescratch-note|rr-dash-factor-origin-note|five-factor ratings have not been recalculated/,"No stage or recalculation commentary.");
assert.match(js,/fact_pace_moderate|fact_pace_strong/,"Approved pace art is used.");
assert.match(js,/fact_surface_dirt|fact_surface_turf/,"Approved surface art is used.");
assert.match(js,/fact_distance/,"Approved distance art is used.");
assert.doesNotMatch(css,/\.rr-dash-race-tiles\s*\{/,"Remove legacy fact-tile CSS.");
assert.match(factsCss,/@media\(max-width:370px\)/,"Dedicated 320px badges and values.");
assert.match(factsCss,/@media\(max-width:800px\)/,"Mobile badge scaling.");
assert.match(css,/\.rr-dash-metric-group\{\s*grid-area:metrics;\s*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/,"Mobile ratings remain one five-factor strip");
assert.doesNotMatch(js,/Trainer not listed \| Jockey not listed/,"Do not repeat source-data warnings on customer runner rows");
assert.match(factsCss,/\.rr-dash-race-tiles\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,"Compact race facts occupy three short columns");
assert.match(css,/grid-template-areas:"program horse market" "metrics metrics metrics";/,"Runner rows should contain only identity and factor strips");
assert.match(css,/\.rr-dash-win\{align-self:start;justify-self:end;align-items:flex-end;text-align:right/,"Numerical values remain right aligned");
assert.match(css,/\.rr-dash-horse-dialog\{position:fixed;inset:auto 0 0/,"Mobile details must open as a bottom drawer");
assert.doesNotMatch(css,/grid-template-areas:"program horse" "market market"/,"Remove old tall mobile runner layout");
assert.match(css,/\.rr-dash-horse-name\{\s*flex:0 1 auto;[^}]*overflow:visible;[^}]*white-space:normal/,"Mobile horse names must not be clipped");
assert.match(headerCss,/\.rrp-race-head__purse\[data-missing="true"\]/,"Missing purse must be flagged in private preview");

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
const ids=["rr-dash-status","rr-dash-app","rr-dash-login","rr-dash-empty","rr-dash-date","rr-dash-track","rr-dash-race-time","rr-dash-races","rr-dash-track-identity","rr-dash-race","rr-dash-horses","rr-dash-open-pdf","rr-dash-download-pdf","rr-dash-update","rr-dash-horse-dialog","rr-dash-horse-title","rr-dash-horse-detail","rr-dash-horse-close","rr-dash-global-timeline","rr-dash-all-races","rr-dash-timeline-count","rr-dash-previous-race","rr-dash-next-race","rr-dash-mode-track","rr-dash-mode-all","rr-dash-mode-purse","rr-dash-purse-filters","rr-dash-min-purse","rr-dash-stakes-only","rr-dash-timeline-label"];
const els=new Map(ids.map(id=>[id,new Element(id.includes("date")||id==="rr-dash-track"||id.includes("race-time")||id==="rr-dash-all-races"||id.includes("sort")?"select":"div")]));
const fixture={cards:[{race_date:"2026-11-22",track:"Del Mar",product_id:null,card:{track_name:"Del Mar",races:[{race_number:6,post_time_et:"6:00 PM",conditions:"Claiming $8,000",purse:"$20,000",pace:"Moderate",surface:"Dirt",distance:"5 1/2 furlongs",scratch_count:1,scratches:[{program_number:"3",horse_name:"Scratched Runner"}],entries:[{program_number:"5",horse_name:"Doo Wop Don",morning_line:"5-2",win_probability:16.6,fair_odds:"5/1",trainer:"",jockey:"",metrics:[]},{program_number:"2",horse_name:"Third Horizon",morning_line:"9-2",win_probability:20.0,fair_odds:"4/1",trainer:"",jockey:"",metrics:[]},{program_number:"12",horse_name:"Barrister Proof",morning_line:"12-1",win_probability:27.5,fair_odds:"5/2",trainer:"Brad Cox",jockey:"Jose Ortiz",metrics:[{label:"Speed",value:"green"},{label:"Form",value:"gray"},{label:"Class",value:"red"},{label:"Pace Fit",value:"green"},{label:"Surface / Distance",value:"gray"}]}]}]}}]};
// Preserve PDF-style chips for high numbers and coupled-entry suffixes.
fixture.cards[0].card.races[0].scratch_count=3;
fixture.cards[0].card.races[0].scratches.push(
 {program_number:"13",horse_name:"High Number Scratch"},
 {program_number:"1A",horse_name:"Entry Scratch"}
);
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
assert.match(race.textContent,/Claiming/i,"Display source race class without forcing the claiming-price amount into the header.");
assert.match(race.textContent,/PURSE \$20,000/,"Display actual purse separately");
assert.match(race.textContent,/SCRATCHES/,"Identify scratched saddlecloths with a compact header label.");
const scratchChip=matchClass(race,"rr-dash-scratch-chip");
assert.ok(scratchChip&&scratchChip.src.endsWith("/3.png"),"Scratch uses official #3 saddlecloth chip");
assert.ok(allClass(race,"rr-dash-scratch-item").some(item=>item.getAttribute("aria-label")?.includes("Scratched Runner")),"Keep scratched horse names accessible without crowding the PDF-style banner");
const pdfBanner=matchClass(race,"rr-dash-race-banner");
const bannerScratches=matchClass(pdfBanner,"rr-dash-scratch-strip");
assert.ok(bannerScratches,"Scratch count and authentic chips must appear inside the race header");
const titleRow=matchClass(pdfBanner,"rrp-race-head__title-row");
const detailsRow=matchClass(pdfBanner,"rrp-race-head__details");
assert.ok(titleRow&&detailsRow,"A separate race title and metadata row must be present.");
assert.ok(pdfBanner.children.indexOf(titleRow)<pdfBanner.children.indexOf(detailsRow),"Title comes first.");
assert.ok(pdfBanner.children.indexOf(detailsRow)<pdfBanner.children.indexOf(bannerScratches),"Centered scratches come after runners, purse and post time.");
assert.match(detailsRow.textContent,/RUNNERS[\s\S]*PURSE[\s\S]*POST TIME/,"Three metadata fields stay together.");
assert.equal(allClass(race,"rr-dash-scratch-strip").length,1,"No detached second scratch block beneath the race header");
assert.match(bannerScratches.textContent,/3 SCRATCHES/,"Display the exact scratch count in the bottom row.");
assert.doesNotMatch(bannerScratches.textContent,/Scratched Runner|High Number Scratch|Entry Scratch/,"Do not print horse names in the race header.");
assert.equal(allClass(bannerScratches,"rr-dash-scratch-name").length,0,"No old scratch-name labels remain.");
assert.equal(allClass(bannerScratches,"rr-dash-scratch-item").length,3,"List every verified scratched runner");
const scratchedChips=allClass(bannerScratches,"rr-dash-scratch-chip");
assert.equal(scratchedChips.length,3,"Use authentic saddlecloth PNGs for all scratched horses");
assert.ok(scratchedChips.some(el=>el.src.endsWith("/13.png")),"High-numbered scratches keep a same-size approved #13 chip");
assert.ok(scratchedChips.some(el=>el.src.endsWith("/1.png")),"Coupled entries use the approved base-number asset");
assert.equal(allClass(bannerScratches,"rr-dash-scratch-suffix")[0].textContent,"A","Keep coupled-entry suffix visible");
assert.ok(allClass(bannerScratches,"rr-dash-scratch-item").every(item=>item.title.includes("Scratch")),"All scratch names remain available as tooltips and accessible labels");
assert.match(headerCss,/\.rrp-race-head__scratch-bar\{[^}]*justify-content:center/,"Center the scratch block in the newly rebuilt header.");
assert.match(headerCss,/height:48px;min-height:48px/,"Fixed scratch lane keeps race-card height stable.");
assert.match(js,/NO SCRATCHES LISTED/,"Empty scratch row uses neutral fact wording.");
assert.match(factsCss,/data-fact="pace"/,"Pace watch gets independent optical scale.");
assert.doesNotMatch(factsCss,/brightness\(|hue-rotate\(/,"Never darken an entire watch image; use the selective green asset.");
assert.match(js,/fact_pace_strong.*_forest\.svg/,"Strong pace uses selectively tinted artwork.");
assert.match(factsCss,/min-height:59px/,"Genuine fact badges fit in a 59px mobile race-panel footer");
assert.match(headerCss,/\.rrp-race-head__details\{[^}]*grid-template-columns:/,"Metadata has its own complete row.");
assert.match(headerCss,/\.rrp-race-head__scratch-chip\{[^}]*background:#fff/,"Original scratch saddlecloths have opaque backing and no dark bleed-through.");
assert.doesNotMatch(css,/\.rr-dash-race-banner\s*\{/,"No old race banner CSS remains in the general dashboard stylesheet.");
assert.doesNotMatch(css,/\.rr-dash-scratch-strip\s*\{/,"No legacy scratch-strip CSS remains.");

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
 assert.match(html,/projections-dashboard\.js\?v=\d+/,"Use current locked-order client");
}
assert.doesNotMatch(js,/rr-dash-sort/,"Client must not let users reorder horses");
console.log("PASS: compact runner rows, verified dash factor states, preserved race data, no redundant PDF action");

// No partial historic preview data is allowed in the public website assets.
// Admin previews must always load full-field data from the authenticated R2 API.
const adminHtml=readFileSync("public/admin/projections-preview.html","utf8");
const memberHtml=readFileSync("public/membership/dashboard/index.html","utf8");
const scriptRevision=html=>/projections-dashboard\.js\?v=(\d+)/.exec(html)?.[1];
assert.ok(scriptRevision(adminHtml),"Admin script revision must be specified");
assert.equal(scriptRevision(adminHtml),scriptRevision(memberHtml),
 "Admin and customer dashboard must use the identical current projection client.");
assert.doesNotMatch(adminHtml,/rr-dash-review-data|review=nov23|Selected horses only|17 horses/,
 "Remove legacy selected-horse review fixtures and routes");
assert.doesNotMatch(adminHtml,/<script[^>]*type="application\/json"/,
 "Never embed premium racing projections in public HTML");
assert.doesNotMatch(js,/\breviewMode\b|PARTIAL FIELD|rr-dash-review-data/,
 "No stale partial-field runtime branches");
assert.match(js,/api\("\/api\/admin\/projections-preview"\)/,
 "Private admin preview must always read the secure projection API");
assert.match(adminHtml,/projections-dashboard\.js\?v=\d+/,
 "Admin dashboard must load the latest hardened shared client");
assert.match(memberHtml,/projections-dashboard\.js\?v=\d+/,
 "Member dashboard must use the same client revision");
console.log("PASS: no embedded premium data or partial review fallback; authenticated full-field preview only");


// Screenshot-driven readability pass: remove redundant preview hero and make
// data the first visible content, while preserving protected auth controls.
for(const html of [adminHtml,memberHtml]){
 assert.doesNotMatch(html,/rr-dash-heading|rr-dash-intro|rr-dash-library-link/,
  "No oversized explanatory hero or return-to-uploader button on Projections");
 assert.match(html,/<h1 class="rr-dash-visually-hidden">Rail &amp; Rye Projections<\/h1>/,
  "Keep an accessible page title without visible ornamental title space");
 assert.doesNotMatch(html,/rr-dash-search-field|rr-dash-search|Find a horse/,"No horse finder appears on either page");
 assert.match(html,/rr-projections-track-identity\.css\?v=4/,"Load the separate clean track identity stylesheet");
 assert.match(html,/projections-dashboard\.css\?v=(?:2[7-9]|[3-9]\d)/,
  "Current improved typography style must be loaded");
 assert.match(html,/projections-dashboard\.js\?v=\d+/,
  "Current compact-label asset must be loaded");
}
assert.doesNotMatch(adminHtml,/rr-dash-private-banner|Private admin preview · member dashboard remains off|Return to projection uploader/,
 "Remove all prominent launch/admin warning copy from the private preview");
assert.doesNotMatch(js,/previewMode\?"Private admin preview"/,
 "Do not put redundant admin labels in the filter toolbar");
assert.match(css,/\.rr-dash-visually-hidden\{/,
 "Accessible title must remain off-screen");
assert.match(commandCss,/\.rr-dash-toolbar \.rr-dash-race-time-field\{display:none\}/,"Hide redundant race-by-time control on phones");
assert.doesNotMatch(css,/\.rr-dash-search-field/,"No outdated search-field CSS remains");
assert.doesNotMatch(js,/rr-dash-search/,"No horse-search JS handler remains");
assert.match(commandCss,/\.rr-dash-toolbar\{[^}]*grid-template-columns:/,"Unified control deck owns all track/date selectors");
assert.match(css,/\.rr-dash-horse-name\{\s*font:750 17px\/1\.2/,
 "Runner names must be readable at 17px on ordinary phones");
assert.match(css,/\.rr-dash-horse-connections\{\s*font:550 12px\/1\.28/,
 "Verified trainer/jockey must remain clear at 12px");
assert.match(css,/\.rr-dash-win-percent\{[^}]*font-size:26px/,
 "Keep 25px bold percentage numbers");
assert.match(css,/\.rr-dash-win-fair\{font-size:13px/,
 "Increase supporting fair odds to 13px");
assert.match(css,/\.rr-dash-metric-value::before\{\s*font:800 10px\/1\.15/,
 "Make five factor labels readable at 10px");
assert.doesNotMatch(css,/rr-dash-row-analysis|rr-dash-full-analysis|rr-dash-analysis-connections|rr-dash-pdf-actions/,"Old runner footers and PDF controls are deleted, not hidden.");
assert.match(css,/@media\(max-width:360px\)/,
 "Narrow screens must reduce only secondary sizes to prevent name clipping");
console.log("PASS: compact Projections controls, readable runners, fair odds and five factors");

for(const [probability,american] of [[52.8,"4-5"],[57.6,"4-5"],[39.7,"3-2"],[31.4,"2-1"],[13.6,"6-1"],[10.2,"9-1"],[5.3,"18-1"],[4.1,"23-1"]]){
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
assert.doesNotMatch(trackCss,/\.rrp-track-head__brand\{/,"Do not repeat the global Rail & Rye horseshoe in track identity");
assert.doesNotMatch(js,/logo\.src="\/assets\/brand\/rail_rye_logo_header\.png"/,
 "Avoid a duplicate Rail & Rye logo in the track strip");
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
assert.match(els.get("rr-dash-track-identity").textContent,/ZIA PARK/i,"Previous takes user to chronologically earlier track");
els.get("rr-dash-next-race").events.click();
assert.match(els.get("rr-dash-track-identity").textContent,/DEL MAR/i,"Next returns to chronologically later race");
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
assert.equal(matchClass(trophy,"rr-dash-trophy-icon").src,"/assets/approved/graded-trophies/graded_trophy_G1.png");
const realRaceHeaderChip=matchClass(displayedRace,"rr-race-saddle-image");
assert.ok(realRaceHeaderChip&&realRaceHeaderChip.src.endsWith("/4.png"),
 "Race 4 header MUST show real #4 saddlecloth artwork");
assert.equal(allClass(displayedRace,"rr-dash-track-mark-letters").length,0,
 "No synthetic FL/MNR track initials should replace actual artwork");
assert.equal(allClass(els.get("rr-dash-track-identity"),"rrp-track-head__logo").length,0,
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
// Use an actually available Zia Park card: the dashboard normalizes API
// cards on load, so mutating the original Del Mar fixture after init would
// not test the real track selector.
els.get("rr-dash-track").value="Zia Park";
els.get("rr-dash-track").events.change();
assert.equal(allClass(els.get("rr-dash-track-identity"),"rrp-track-head__logo").length,0,
 "No track logo is displayed even when original artwork is available.");
assert.match(els.get("rr-dash-track-identity").textContent,/ZIA PARK/i,
 "Complete racetrack name is still displayed.");
els.get("rr-dash-track").value="Del Mar";
els.get("rr-dash-track").events.change();
console.log("PASS: true per-track chronology; text-only track identity and authentic saddlecloth artwork; conventional tote fair odds");


// Canonical cross-module chips and Bet Builder live in the protected projection view.
const chipStyles=readFileSync("public/assets/rr-intelligence-chips.css","utf8");
for(const html of [adminHtml,memberHtml]){
 assert.match(html,/rr-intelligence-chips\.css\?v=6/,"Load cleaned shared race/horse chip identity");
 assert.match(html,/rr-projections-race-header\.css\?v=4/,"Load the single new Projections header stylesheet");
  assert.match(html,/rr-race-facts\.css\?v=4/,"Load the shared centered race-facts stylesheet.");
 assert.match(html,/rr-exotic-bet-builder\.css\?v=3/,"Load the responsive exotic ticket builder skin");
 assert.match(html,/rr-exotic-bet-builder\.js\?v=\d+/,"Load the source-gated no-tote Bet Builder");
}
assert.match(js,/rr-dash-race-button rr-race-saddle-tab/,
 "Every race navigation tab uses the branded saddle-chip form");
assert.match(js,/rr-dash-race-number rr-race-saddle-header/,
 "Race number plaque uses same standardized chip grammar");
assert.doesNotMatch(js,/originalTrackLogos|rrp-track-head__logo|approved\/track-logos\//,
 "Projections must never render mobile track-logo badges.");
assert.doesNotMatch(js,/rr-dash-track-mark-letters/,"Remove interim venue initials from live headers");
assert.doesNotMatch(js,/logo\.src="\/assets\/brand\/rail_rye_logo_header\.png"/,
 "Global site header already supplies the persistent R&R horseshoe");
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
 assert.match(html,/rr-exotic-bet-builder\.js\?v=\d+/,
  "Customers must load the actual source-backed F4 odds client, not cached v1");
 assert.match(html,/projections-dashboard\.js\?v=\d+/,
  "Both admin and member dashboard views receive same race-aware F4 routing");
}
console.log("PASS: private live-F4 percentages and gross break-even payout UI cache-busted");

assert.doesNotMatch(trackCss,/rrp-track-head__venue-mark|rrp-track-head__logo|rrp-track-head--no-logo/,
 "Remove retired venue-mark CSS instead of hiding it.");
assert.match(trackCss,/grid-template-columns:minmax\(0,1fr\)/,
 "Full track name/date uses the whole command area.");

for(const html of [adminHtml,memberHtml]){
 assert.match(html,/class="rrp-command"/,"Mode, venue and race tabs share one navigation surface");
 assert.match(html,/id="rr-dash-track-identity"/,"Track identity is inside the navigation deck");
 assert.match(html,/rr-projections-command\.css\?v=2/,"Dedicated new command-deck stylesheet loaded");
 assert.ok(html.indexOf('id="rr-dash-track-identity"')<html.indexOf('id="rr-dash-races"'),"Venue identity before race tabs");
 assert.ok(html.indexOf('id="rr-dash-races"')<html.indexOf('id="rr-dash-race"'),"Race tabs before the projection panel");
}
assert.match(commandCss,/\.rrp-command__controls\{/,"Mode and date/track controls truly consolidated");
assert.doesNotMatch(css,/\.rr-dash-mode-switch\s*\{|\.rr-dash-toolbar\s*\{/,"Obsolete layout CSS completely removed");
assert.doesNotMatch(trackCss,/grid-template-columns:minmax\(0,1fr\) 64px/,"Do not reserve a column for removed track art.");
assert.doesNotMatch(js,/panel\.replaceChildren\(cardHeader\(/,"No additional track masthead under race tabs");
assert.match(js,/context\.replaceChildren\(cardHeader\(activeCard\)\)/,"Update track identity inside shared command deck");
assert.match(factsCss,/min-height:59px/,"The Pace/Surface/Distance band is much shorter");
assert.match(headerCss,/grid-template-columns:max-content max-content minmax\(0,1fr\)/,"Runners, purse and post time share compact metadata row");

 // Purse mode: source purse descending, post-time tie break, no stale runners.
 const purseMode=els.get("rr-dash-mode-purse"),minimum=els.get("rr-dash-min-purse"),stakes=els.get("rr-dash-stakes-only");
 const timelineSelect=els.get("rr-dash-all-races");
 fixture.cards[0].card.races[0].purse="$100,000";
 fixture.cards[0].card.races[1].purse="$250,000";
 fixture.cards[1].card.races[0].purse="$100,000";
 minimum.value="100000";purseMode.events.click();
 assert.equal(els.get("rr-dash-app").dataset.mode,"purse");
 assert.equal(timelineSelect.children.length,3);
 assert.match(timelineSelect.children[0].textContent,/^\$250,000 · Del Mar/);
 assert.match(timelineSelect.children[1].textContent,/Zia Park/,"Equal purses use post-time order");
 assert.equal(timelineSelect.value,"0","Entering By Purse opens the most valuable race");
 assert.match(timelineSelect.children[0].textContent,/G1/,"Dropdown identifies source-confirmed grade");
 assert.ok(matchClass(race,"rr-dash-graded-trophy").className.includes("--g1"));
 timelineSelect.value="2";timelineSelect.events.change();
 minimum.value="25000";minimum.events.change();
 assert.equal(timelineSelect.value,"0","Changing purse filter restarts at highest purse even when prior race still qualifies");
 const graded=fixture.cards[0].card.races[1];
 const originalConditions=graded.conditions;
 for(const grade of [2,3]){
  graded.conditions="Belmont Stakes (G"+grade+")";
  graded.stakes_grade=grade;
  minimum.events.change();
  assert.match(timelineSelect.children[0].textContent,new RegExp("G"+grade));
  assert.ok(matchClass(race,"rr-dash-graded-trophy").className.includes("--g"+grade),"Retain approved grade-specific trophy");
 }
 delete graded.stakes_grade;graded.conditions=originalConditions;
 stakes.checked=true;stakes.events.change();
 assert.equal(timelineSelect.children.length,1);
 assert.match(timelineSelect.children[0].textContent,/Del Mar/);
 minimum.value="1000000";minimum.events.change();
 assert.equal(timelineSelect.children.length,0);
 assert.equal(timelineSelect.disabled,true);
 assert.equal(horses.textContent,"");
 assert.match(els.get("rr-dash-timeline-count").textContent,/No races match/);
 stakes.checked=false;minimum.value="0";minimum.events.change();
 assert.equal(timelineSelect.children.length,3);
 assert.ok(horses.textContent);
 els.get("rr-dash-mode-track").events.click();
 assert.equal(els.get("rr-dash-purse-filters").hidden,true);
 console.log("PASS: descending purse order, highest-value reset, post-time ties, graded trophies, empty state and recovery");

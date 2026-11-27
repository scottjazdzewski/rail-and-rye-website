import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const ctx={};
vm.runInNewContext(readFileSync("public/assets/rr-race-titles.js","utf8"),ctx);
const {describe,numericGrade}=ctx.RRRaceTitles;
const check=(input,title,grade,stakes=true)=>{
 const found=describe(input);
 assert.equal(found.title,title,JSON.stringify(input)+" should show canonical fully written name");
 assert.equal(found.grade,grade,JSON.stringify(input)+" has an evidence-backed grade");
 assert.equal(found.stakes,stakes,"Stakes identity must be explicit, never based on purse");
};
check({conditions:"Belmont S."},"Belmont Stakes",null);
check({conditions:"FIRST LADY S."},"First Lady Stakes",null);
check({conditions:"First Lady S."},"First Lady Stakes",null);
check({conditions:"Hollywood Gaming Mahoning Distaff S."},"Mahoning Distaff Stakes",null);
check({conditions:"HOLLYWOOD GAMING MAHONING DISTAFF S."},"Mahoning Distaff Stakes",null);
check({conditions:"Hollywood Gaming Mahoning Distaff S. (G2)"},"Mahoning Distaff Stakes",2);
check({conditions:"Hollywood Gaming Unrelated S."},"Hollywood Gaming Unrelated Stakes",null);
check({conditions:"Cheryl S. White Memorial S."},"Cheryl S. White Memorial Stakes",null);
check({conditions:"Belmont S. (G1)"},"Belmont Stakes",1);
check({conditions:"Belmont S. (G1) Presented by NYRA Bets"},"Belmont Stakes",1);
check({conditions:"Belmont Stks. (G1) Sponsored by NYRA Bets"},"Belmont Stakes",1);
check({conditions:"Grade I Belmont S."},"Belmont Stakes",1);
check({conditions:"Belmont S. (Grade II)"},"Belmont Stakes",2);
check({conditions:"Frizette S. (GIII)"},"Frizette Stakes",3);
check({conditions:"Carter H. (G2)"},"Carter Handicap",2);
check({conditions:"Golden Rose S. (G3) powered by Race Sponsor"},"Golden Rose Stakes",3);
check({conditions:"NYRA Bets — Belmont S. (G1)",sponsor_name:"NYRA Bets"},"Belmont Stakes",1);
check({conditions:"NYRA Bets Belmont S. (G1)",sponsor_name:"NYRA Bets"},"Belmont Stakes",1);
check({conditions:"Belmont S. (G1) NYRA Bets",sponsor_name:"NYRA Bets"},"Belmont Stakes",1);
check({conditions:"Belmont S. (G1) — NYRA Bets",sponsor_name:"NYRA Bets"},"Belmont Stakes",1);
check({conditions:"Belmont S. (G1) Presented by NYRA Bets",
       stakes_name:"Belmont S.",stakes_grade:"G1"},"Belmont Stakes",1);
check({conditions:"Frizette S. (G2)",stakes_name:"Frizette Stakes",stakes_grade:"Grade 2"},
      "Frizette Stakes",2);
check({conditions:"BELMONT S. (G1) PRESENTED BY NYRA BETS"},"Belmont Stakes",1);
check({conditions:"Starter Allowance 7F"},"Starter Allowance 7F",null,false);
check({conditions:"S. Florida Handicapper Open"},"S. Florida Handicapper Open",null,false);
check({conditions:"John S. Smith Memorial (Nongraded)"},"John S. Smith Memorial (Nongraded)",null,false);
check({conditions:"The Belmont Stakes"},"The Belmont Stakes",null);
check({race_number:10,conditions:"STAKES"},"Race 10",null);
check({race_number:9,conditions:"Stakes",stakes_name:"Zia Park Oaks",is_stakes:true},
 "Zia Park Oaks",null);
check({race_number:10,conditions:"STAKES",stakes_name:"Zia Park Derby",is_stakes:true},
 "Zia Park Derby",null);
assert.equal(describe({race_number:10,conditions:"STAKES"}).missingStakesName,true,
 "A generic class can never masquerade as an official stakes name.");

check({conditions:"Cigar Mile S. (G1)",stakes_grade:"G2"},
      "Cigar Mile S. (G1)",null,true);
assert.equal(numericGrade("G1"),1);
assert.equal(numericGrade("GI"),1);
assert.equal(numericGrade("GII"),2);
assert.equal(numericGrade("Grade III"),3);
assert.equal(numericGrade("Gr. 2"),2);
assert.equal(numericGrade("unknown"),null);
for(const field of ["conditions","stakes_name"]){
 const raw=field==="conditions"?"Belmont S. (G1) Presented by NYRA Bets":"Belmont S.";
 assert.doesNotMatch(describe({[field]:raw}).title,/sponsored|presented|NYRA|\bS\./i,
  "No sponsor suffixes or abbreviated stakes names on the website");
}
const js=readFileSync("public/assets/projections-dashboard.js","utf8");
const css=readFileSync("public/assets/rr-projections-race-header.css","utf8");
const admin=readFileSync("public/admin/projections-preview.html","utf8");
const member=readFileSync("public/membership/dashboard/index.html","utf8");
const revision=html=>/projections-dashboard\.js\?v=(\d+)/.exec(html)?.[1];
assert.ok(revision(admin),"The approved client must have a cache-busting revision.");
assert.equal(revision(admin),revision(member),"Both dashboards must load the same current client.");
const cssVersion=html=>/projections-dashboard\.css\?v=(\d+)/.exec(html)?.[1];
assert.ok(cssVersion(admin),"Approved dashboard CSS needs an explicit version.");
assert.equal(cssVersion(admin),cssVersion(member),"Admin and member must load the same current dashboard CSS.");
for(const html of [admin,member]){
 assert.match(html,/rr-race-titles\.js\?v=11/,"Load shared race presentation helper before dashboard");
 assert.match(html,/projections-dashboard\.js\?v=\d+/,"Use verified stakes heading dashboard revision");
 assert.match(html,/rr-projections-race-header\.css\?v=6/,"Load the sole graded-trophy and race-header stylesheet");
}
assert.match(js,/editorialRacePresentation\(race\)/,
 "Race headings use a source-proven title and defensive fallback");
assert.match(js,/approvedRaceSaddle\(race\.race_number\)/,
 "Race heading must show actual saddlecloth number art rather than a fake badge");
assert.match(js,/approvedRaceSaddle\(raceNumber\)/,
 "Race navigation uses the same race saddlecloth source");
assert.doesNotMatch(js,/originalTrackLogos|rrp-track-head__logo|approved\/track-logos\//,
 "Race headings use original saddlecloths, not track-logo badges.");
assert.doesNotMatch(js,/rr-dash-track-mark-letters/,
 "Remove invented FL/PRX/MNR monogram substitutes from the live dashboard");

assert.match(js,/rr-dash-graded-trophy--g/,"Graded race header must retain grade-specific trophy");
assert.doesNotMatch(js,/🏆/,"Never use an emoji trophy");
assert.match(js,/graded_trophy_G/,"Use the verified original PNG");
assert.match(css,/\.rrp-race-head__trophy\{[^}]*background:transparent/,"Standalone trophy");
assert.doesNotMatch(css,/\.rrp-race-head__trophy--g[123]\{/,"No colored grade pills");
assert.match(css,/text-transform:none/,"Race names are never forced uppercase");
const chipCss=readFileSync("public/assets/rr-intelligence-chips.css","utf8");
const trackCss=readFileSync("public/assets/rr-projections-track-identity.css","utf8");
assert.match(trackCss,/rrp-track-head__name/,"Keep full venue name.");
assert.doesNotMatch(trackCss,/rrp-track-head__venue-mark|rrp-track-head__logo/,
 "Retire track badge CSS entirely.");
assert.doesNotMatch(chipCss,/\.rr-dash-approved-track-logo/,"Do not stack old logo CSS beneath new CSS");
assert.doesNotMatch(chipCss,/\.rr-dash-race-banner\s*\{/,
 "Retire the competing shared-chip header rules");
assert.match(css,/text-wrap:balance/,
 "Full stakes titles wrap at natural word boundaries");
assert.match(css,/\.rrp-race-head__number\{[\s\S]*?background:#f4f0e6/,
 "Keep ivory beneath race-number artwork to prevent dark transparency bleed");
assert.match(css,/\.rrp-race-head__scratch-bar\{[\s\S]*?justify-content:center/,
 "Centered scratch row is part of the canonical layout");
for(const page of ["public/admin/longshot-radar.html","public/admin/target-list-preview.html"]){
 const html=readFileSync(page,"utf8");
 assert.match(html,/rr-race-titles\.js\?v=11/,"All readers use the same current title authority.");
 assert.match(html,/rr-research-race-banner\.js\?v=original-trophies-2/,
  "All research readers use the same banner and trophy presentation.");
}
const pickPage=readFileSync("public/admin/pick-tickets-preview.html","utf8");
assert.match(pickPage,/rr-race-titles\.js\?v=11/,"Pick Tickets uses the same title parser.");
const pickRenderer=readFileSync("public/assets/pick-tickets-dashboard.js","utf8");
assert.match(pickRenderer,/RRRaceTitles\?\.describe/,"Ticket legs use full canonical stakes names.");
assert.match(pickRenderer,/rr-ed-grade-trophy--g/,"Ticket legs show correct G1 G2 G3 trophies.");
const banner=readFileSync("public/assets/rr-research-race-banner.js","utf8");
assert.match(banner,/RRRaceTitles\?\.describe/,"Shared race header uses the canonical title formatter.");
assert.match(banner,/rr-ed-grade-trophy--g/,"Graded stakes use the G1 G2 G3 trophy design.");
assert.match(js,/rrp-race-head__trophy--g/,"Projections keep G1 G2 G3 trophies.");
console.log("PASS: Mahoning Distaff sponsor removed, text-only venue headings retained, balanced full names and transparent saddlecloths fixed");

assert.match(trackCss,/grid-template-columns:minmax\(0,1fr\)/,"Venue text takes full width.");
assert.doesNotMatch(trackCss,/__plaque/,"The former separate venue plaque must be entirely removed");

assert.match(js,/context\.replaceChildren\(cardHeader\(activeCard\)\)/,"Track title belongs in one integrated navigation deck");

// Universal maiden classification: no guess based on price or purse.
check({conditions:"MAIDEN CLAIMING $15K"},"Maiden Claiming",null,false);
check({conditions:"MSW"},"Maiden Special Weight",null,false);
check({conditions:"Mdn Clm"},"Maiden Claiming",null,false);
check({conditions:"Maiden",race_type:"MSW"},"Maiden Special Weight",null,false);
check({conditions:"Maiden",race_name:"Maiden Claiming"},"Maiden Claiming",null,false);
check({conditions:"Maiden Optional Claiming"},"Maiden Optional Claiming",null,false);
check({conditions:"Maiden Allowance"},"Maiden Allowance",null,false);
check({conditions:"Maiden",purse:"$100,000"},"Race",null,false);
check({conditions:"MCL",race_type:"MSW"},"Race",null,false);
assert.equal(describe({conditions:"Maiden"}).unverifiedClass,true);

check({race_number:5,conditions:"Maiden"},"Race 5",null,false);
check({race_number:5,conditions:"Maiden",display_race_class:"Maiden Special Weight"},"Maiden Special Weight",null,false);

const formatDistance=ctx.RRRaceTitles.formatDistance;
for(const [raw,expected] of [["8.31818 F","1M 70Y"],["8.18182 F","1M 40Y"],["8 F","1M"],["8.5 F","1 1/16 M"],["9 F","1 1/8 M"],["10 F","1 1/4 M"],["6 F","6 F"],["6.5 F","6 1/2 F"],["1M 70Y","1M 70Y"],["About 8.31818 F","About 1M 70Y"],["1200 Meters","1200 Meters"],["",""]])assert.equal(formatDistance(raw),expected,raw);

// Permanent North American tote display contract, independent of scoring.
const tote=ctx.RRRaceTitles.formatToteOdds, fair=ctx.RRRaceTitles.formatFairOdds;
for(const [raw,expected] of [["7-10","4-5"],["3-10","2-5"],["9-10","1-1"],["1-20","1-9"],["1-4","1-5"],["6/5","6-5"],["9/2","9-2"],["11/2","6-1"],["12-1","12-1"],["EVEN","1-1"],["","—"],["invalid","—"]])assert.equal(tote(raw),expected,raw);
for(const label of ["1-9","1-5","2-5","1-2","3-5","4-5","1-1","6-5","7-5","3-2","8-5","9-5","2-1","5-2","3-1","7-2","4-1","9-2","5-1","99-1"])assert.equal(tote(label),label,label);
const wildVine={win_probability_exact:57.6,fair_odds:"7-10",morning_line:"6-5"};assert.equal(fair(wildVine),"4-5");assert.equal(wildVine.fair_odds,"7-10");assert.equal(wildVine.win_probability_exact,57.6);
console.log("PASS: canonical North American tote odds across the shared display helper");

assert.equal(ctx.RRRaceTitles.formatFairOdds({win_probability_exact:52.8,fair_odds:"9-10"}),"4-5","Velveteen regression");

check({conditions:"Gin Talking S."},"Gin Talking Stakes",null);
check({conditions:"GIN TALKING S."},"Gin Talking Stakes",null);
check({conditions:"Ginger Stakes"},"Ginger Stakes",null);
check({conditions:"Giant Stakes"},"Giant Stakes",null);
check({conditions:"GI Belmont S."},"Belmont Stakes",1);
check({conditions:"GII Belmont S."},"Belmont Stakes",2);
check({conditions:"Mrs. Revere S. (G2)"},"Mrs. Revere Stakes",2);
check({conditions:"Clark S. (GII)"},"Clark Stakes",2);

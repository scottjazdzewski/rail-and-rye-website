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
check({conditions:"Belmont S. (G1)"},"Belmont Stakes",1);
check({conditions:"Belmont S. (G1) Presented by NYRA Bets"},"Belmont Stakes",1);
check({conditions:"Belmont Stks. (G1) Sponsored by NYRA Bets"},"Belmont Stakes",1);
check({conditions:"Grade I Belmont S."},"Belmont Stakes",1);
check({conditions:"Belmont S. (Grade II)"},"Belmont Stakes",2);
check({conditions:"Frizette S. (GIII)"},"Frizette Stakes",3);
check({conditions:"Carter H. (G2)"},"Carter Handicap",2);
check({conditions:"Golden Rose S. (G3) powered by Race Sponsor"},"Golden Rose Stakes",3);
check({conditions:"NYRA Bets — Belmont S. (G1)",sponsor_name:"NYRA Bets"},"Belmont Stakes",1);
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
const css=readFileSync("public/assets/projections-dashboard.css","utf8");
const admin=readFileSync("public/admin/projections-preview.html","utf8");
const member=readFileSync("public/membership/dashboard/index.html","utf8");
for(const html of [admin,member]){
 assert.match(html,/rr-race-titles\.js\?v=2/,"Load shared race presentation helper before dashboard");
 assert.match(html,/projections-dashboard\.js\?v=30/,"Use verified stakes heading dashboard revision");
 assert.match(html,/projections-dashboard\.css\?v=25/,"Use correct graded trophy styles");
}
assert.match(js,/editorialRacePresentation\(race\)/,
 "Race headings use a source-proven title and defensive fallback");
assert.match(js,/approvedRaceSaddle\(race\.race_number\)/,
 "Race heading must show actual saddlecloth number art rather than a fake badge");
assert.match(js,/approvedRaceSaddle\(raceNumber\)/,
 "Race navigation uses the same race saddlecloth source");
assert.match(js,/rr-dash-track-mark/,
 "Replace sponsor-backed track graphics with cleaner track-specific racing seal");
assert.doesNotMatch(js,/approvedTrackLogos=\{/,
 "Do not keep rendering the old tiny white advertising-logo tiles");

assert.match(js,/rr-dash-graded-trophy--g/,"Graded race header must retain grade-specific trophy");
assert.match(js,/🏆/,"Use the graded stakes trophy symbol");
assert.match(css,/rr-dash-graded-trophy--g1/);
assert.match(css,/rr-dash-graded-trophy--g2/);
assert.match(css,/rr-dash-graded-trophy--g3/);
assert.match(css,/rr-dash-race-condition\{\s*text-transform:none/,"Do not uppercase normal editorial race titles");
console.log("PASS: Belmont and First Lady Stakes fully written; no sponsor-logo tiles; real saddlecloth race numbers; verified graded trophies");

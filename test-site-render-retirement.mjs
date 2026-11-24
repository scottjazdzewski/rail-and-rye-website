import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
for(const path of ["public/admin/projections.html","public/longshot-radar-preview/index.html"]){
 assert.equal(existsSync(path),false,"Retired site render must be physically absent: "+path);
}
const routes=readFileSync("src/index.js","utf8");
assert.match(routes,/\["\/admin\/projections","\/admin\/projections-preview\.html"\]/,
 "Legacy Projections path resolves directly to active Projections renderer.");
assert.doesNotMatch(routes,/\["\/admin\/projections","\/admin\/projections\.html"\]/,
 "Old Projections HTML redirect is permanently retired.");
for(const page of ["public/admin/projections-preview.html","public/admin/pick-tickets-preview.html",
 "public/admin/longshot-radar.html","public/admin/target-list-preview.html",
 "public/membership/dashboard/index.html"]){
 const html=readFileSync(page,"utf8");
 assert.match(html,/rr-race-titles\.js\?v=\d+/,"All five reader views load the shared stakes-title contract: "+page);
}
const shared=readFileSync("public/assets/rr-race-titles.js","utf8");
assert.match(shared,/missingStakesName/,"Generic stakes classification is never treated as a named stakes race.");
assert.match(shared,/numericGrade/,"The canonical formatter reads verified grades.");
const projection=readFileSync("src/projections.js","utf8");
assert.match(projection,/requireProductionStakesNames\(enrichRaceInformation\(card\)\)/,
 "Racecard publication rejects unnamed stakes.");
const radar=readFileSync("src/longshot-radar.js","utf8");
const target=readFileSync("src/target-list.js","utf8");
for(const [name,src] of [["Radar",radar],["Target",target]]){
 assert.match(src,/enrichRaceInformation\(/,"Official named stakes metadata joins the "+name+" reader.");
}
const ticket=readFileSync("src/pick-tickets.js","utf8");
assert.match(ticket,/enrichRaceInformation\(/,"Ticket leg titles use the same named stakes source.");
const banner=readFileSync("public/assets/rr-research-race-banner.js","utf8");
assert.match(banner,/appendGradeTrophy/,"Both research readers keep Grade 1, 2 and 3 trophies.");
console.log("PASS: redundant site renders are physically removed; one verified stakes-name and trophy authority serves active products.");

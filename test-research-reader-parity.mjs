import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const radarHtml=readFileSync("public/admin/longshot-radar.html","utf8");
const targetHtml=readFileSync("public/admin/target-list-preview.html","utf8");
const radarCSS=readFileSync("public/assets/longshot-radar.css","utf8");
const targetCSS=readFileSync("public/assets/target-list-dashboard.css","utf8");
const radarJS=readFileSync("public/assets/longshot-radar.js","utf8");
const targetJS=readFileSync("public/assets/target-list-dashboard.js","utf8");

for(const [name,html] of [["Radar",radarHtml],["Target",targetHtml]]){
 assert.match(html,/<header class="rr-intel-header">/,name+" uses the shared masthead");
 assert.match(html,/>Racing Intelligence</i,name+" uses the shared kicker");
 assert.match(html,/>Race date\s*<select/i,name+" uses the same date label");
 assert.match(html,/>Sort by\s*<select/i,name+" uses the same sort label");
 assert.match(html,/rr-stakes-inline\.css\?v=1/,name+" preserves graded-race trophies");
 assert.doesNotMatch(html,/type="file"|JSON upload|MODEL REVIEW|PRELIMINARY|PRESCRATCH/i,
   name+" must never expose production work or upload controls");
}
for(const [name,css] of [["Radar",radarCSS],["Target",targetCSS]]){
 assert.match(css,/max-width:760px/,name+" caps the two-control toolbar at matching width");
 assert.match(css,/grid-template-columns:minmax\(0,1\.08fr\) minmax\(0,\.92fr\)/,
   name+" uses matching independent control columns");
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/,name+" remains usable at phone widths");
 assert.match(css,/#102d53/,name+" uses the shared navy");
 assert.match(css,/#c99831|--rrh-gold/,name+" uses the shared gold");
 assert.match(css,/25px/,name+" keeps 25px model WIN figures");
 assert.match(css,/22px/,name+" keeps 22px FAIR odds");
 assert.match(css,/17px\/1\.(?:52|53)/,name+" preserves legible full editorial analysis");
}
assert.match(radarHtml,/id="rr-lr-count"/,"Radar shows the selection count on the left");
assert.match(radarHtml,/id="rr-lr-context"/,"Radar shows the active sort order on the right");
assert.match(targetHtml,/id="rr-target-count"/,"Target shows the target count on the left");
assert.match(targetHtml,/id="rr-target-context"/,"Target shows the active sort order on the right");
assert.match(radarJS,/q\("#rr-lr-context"\)\.textContent=state\.sort/,"Radar updates its sort context");
assert.match(targetJS,/set\("rr-target-context"/,"Target updates its sort context");
assert.match(radarCSS,/justify-content:space-between;gap:8px/,"Radar uses split count + sort layout");
assert.match(targetCSS,/\.rr-target-page \.rr-target-summary/,"Target has split count + sort layout");
assert.match(targetCSS,/background:#fff;/,"Target analysis uses the same white reader surface");
assert.doesNotMatch(targetHtml,/rr-target-freshness|RACING INTELLIGENCE \/ TARGET LIST/,
 "Target toolbar has only date and sort, no third timestamp or repeated product title");
assert.doesNotMatch(targetJS,/headerColumns\(|stat\("ML"|rr-target-freshness/,
 "Target must not repeat morning line or an obsolete metric header row");
assert.match(targetJS,/stat\("WIN %"/,"Target WIN metric matches Radar");
assert.match(targetJS,/stat\("FAIR ODDS"/,"Target FAIR metric matches Radar");
assert.match(targetJS,/rr-target-ml-inline/,"Morning line remains beside every Target horse");
assert.match(radarJS,/rr-lr-ml-inline/,"Morning line remains beside every Radar horse");
for(const [name,js] of [["Radar",radarJS],["Target",targetJS]])
 assert.match(js,/replace\(\/\^\(\\d\+\)\\s\*\\\/\\s\*\(\\d\+\)\$\//,name+" preserves source odds and displays tote-style hyphens");
assert.doesNotMatch(targetCSS,/rr-target-(?:column-head|column-metrics|freshness|stat-ml)/,
 "Deprecated Target third-column and timestamp CSS is deleted, not overridden");
assert.match(radarJS,/make\("p","rr-lr-case",item\.betting_case\)/,
 "Radar narrative is still the exact source text");
assert.match(targetJS,/node\("p","rr-target-analysis-text",entry\.analysis\)/,
 "Target narrative is still the exact source text");
assert.match(targetJS,/horseRow\("ML FAVORITE"/);
assert.match(targetJS,/horseRow\("ATTACK"/);
assert.match(targetJS,/horseRow\("ALSO LIVE"/);
console.log("PASS: Radar and Target List retain source-authentic data with unified mobile-first reader layout.");

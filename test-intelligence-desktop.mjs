import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const pages=[
 ["public/admin/projections-preview.html","Race Cards",true],
 ["public/membership/dashboard/index.html","Race Cards",true],
 ["public/admin/pick-tickets-preview.html","Pick Tickets",false],
 ["public/admin/longshot-radar.html","Longshot Radar",false],
 ["public/admin/target-list-preview.html","Target List",false],
 ["public/admin/racing-intelligence-review.html","Intelligence Hub",false]
];
for(const [path,title,logo] of pages){
 const html=read(path);
 assert.match(html,/href="\/assets\/rr-intelligence-desktop\.css\?v=2" media="\(min-width: 1100px\)"/,path);
 assert.ok(html.includes('<div class="rr-desktop-title" style="display:none"><span>Racing Intelligence</span><h1>'+title+'</h1></div>'),path+" mobile-hidden title");
 assert.equal(html.includes("rr-intelligence-desktop.js?v=1"),logo,path+" logo enhancement scope");
}
const css=read("public/assets/rr-intelligence-desktop.css").replace(/\/\*[\s\S]*?\*\//g,"").trim();
assert.ok(css.startsWith("@media (min-width: 1100px) {"));
let depth=0;
for(let i=0;i<css.length;i++){
 if(css[i]==="{")depth++;
 if(css[i]==="}"){depth--;assert.ok(depth>0||i===css.length-1,"No declarations outside desktop media");}
}
assert.equal(depth,0);
assert.match(css,/\.rr-lr-page \.rr-lr-candidates \{grid-template-columns:repeat\(2,/);
assert.match(css,/\.rr-target-page \.rr-target-card \{display:grid;grid-template-columns:repeat\(2,/);
assert.match(css,/#rr-pt-current \{grid-area:1\/2\/3\/3/);
assert.match(css,/\.rr-dash-table-heading \{position:sticky/);
const logo=read("public/assets/rr-intelligence-desktop.js");
new Function(logo);
assert.match(logo,/if\(!viewport\.matches\)return/);
assert.match(logo,/observer\.disconnect\(\)/);
console.log("PASS: desktop media isolation, shared titles, grid layouts and logo scope.");

assert.match(css,/data-mode="all"[^{}]*:is\(\.rr-dash-track-field,\.rr-dash-race-time-field\)\s*\{display:none;/);
assert.match(css,/#rr-pt-updated\s*\{display:none;/);
assert.match(css,/\.rr-pt-race-row\s*\{min-height:40px;/);
assert.match(css,/\.rr-lr-inline-analysis \.rr-lr-case\s*\{font-size:16px;font-weight:600;/);
assert.match(css,/\.rr-target-analysis-text\s*\{padding:12px 15px;font-size:16px;font-weight:600;/);

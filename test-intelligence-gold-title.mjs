import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const css=read("public/assets/rr-intelligence-document.css");
assert.match(css,/\.rr-target-titlebar[^{}]*\.rr-target-kicker[^{}]*\{[\s\S]*?color:#a87933;/);
assert.match(css,/\.rr-desktop-title > span\{\s*color:#a87933;/);
assert.match(css,/@media \(width < 1100px\)[\s\S]*?\.rr-desktop-title\{\s*display:block!important/);
for(const [path,title] of [["public/admin/projections-preview.html","Race Cards"],["public/membership/dashboard/index.html","Race Cards"],["public/admin/pick-tickets-preview.html","Pick Tickets"],["public/admin/longshot-radar.html","Longshot Radar"],["public/admin/target-list-preview.html","Target List"]]){
 const html=read(path);assert.ok(html.includes("rr-intelligence-document.css?v=2"),path);assert.ok(html.includes("<span>Racing Intelligence</span><h1>"+title+"</h1>"),path);
}
assert.match(read("public/admin/pick-tickets-preview.html"),/<span class="rr-pt-kicker">Racing Intelligence<\/span>/);
console.log("PASS: shared gold heading on all reader shells, including Race Cards mobile");

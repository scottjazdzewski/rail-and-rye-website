import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const read=path=>readFileSync(path,"utf8");
const radar=read("public/assets/longshot-radar.js");
const target=read("public/assets/target-list-dashboard.js");
const radarCSS=read("public/assets/longshot-radar.css");
const targetCSS=read("public/assets/target-list-dashboard.css");
const shared=read("public/assets/rr-research-race-banner.js");
const css=read("public/assets/rr-research-race-banner.css");
const legacy=/\\.rr-(?:lr|target)-(?:racebar|race-number|post|race-facts|race-meta|race-identifiers)\\b/;
for(const [product,js,styles] of [["Radar",radar,radarCSS],["Target List",target,targetCSS]]){
 assert.match(js,/raceBanner\\.render\\((?:item|entry)\\)/,product+" must call canonical renderer");
 assert.doesNotMatch(js,/sourceRaceTitle\\(|rr-(?:lr|target)-racebar/,product+" must have no independent banner builder");
 assert.doesNotMatch(styles,legacy,product+" must not contain legacy race-header CSS");
}
for(const page of ["public/admin/longshot-radar.html","public/admin/target-list-preview.html"]){
 const h=read(page);
 assert.match(h,/rr-research-race-banner\\.css\\?v=locked-v1-20261124/);
 assert.match(h,/rr-research-race-banner\\.js\\?v=locked-v1-20261124/);
 const helper=h.indexOf("rr-research-race-banner.js"),app=h.indexOf(page.includes("longshot")?"longshot-radar.js":"target-list-dashboard.js");
 assert.ok(helper>=0&&helper<app,"Canonical banner script must execute before "+page);
}
assert.match(css,/grid-template-columns:minmax\\(0,1fr\\) max-content/);
assert.match(css,/font:800 17px\\/1\\.23 Inter/);
assert.match(css,/font:700 13px\\/1\\.3 Inter/);
assert.match(css,/font:500 14px\\/1\\.35 Inter/);
assert.match(css,/border-top:3px solid #c99831/);
assert.doesNotMatch(shared,/innerHTML|localStorage|fetch\\(/);
class El{
 constructor(tag){this.tagName=tag.toUpperCase();this.className="";this.textContent="";this.children=[];this.attrs={};}
 append(...children){this.children.push(...children);}
 setAttribute(name,value){this.attrs[name]=value;}
}
const context={document:{createElement:t=>new El(t)},globalThis:null};
context.globalThis=context;
vm.runInNewContext(read("public/assets/rr-race-titles.js"),context);
vm.runInNewContext(shared,context);
const render=context.RRResearchRaceBanner.render;
const source={track:"Synthetic Downs",race_number:5,post_time_et:"3:40 PM ET",
 distance:"1 mile",surface:"Dirt",conditions:"FIRST LADY S. (G1) Presented by Venue Sponsor",
 stakes_name:"FIRST LADY S.",stakes_grade:"G1",sponsor_name:"Venue Sponsor",is_stakes:true};
const root=render(source);
const children=(node)=>[node,...node.children.flatMap(children)];
const nodes=children(root);
const find=cls=>nodes.find(x=>x.className===cls);
assert.equal(root.className,"rr-research-racebar");
assert.equal(root.attrs["data-rr-race-banner"],"canonical-v1");
assert.equal(find("rr-research-racebar__track").textContent,"Synthetic Downs");
assert.equal(find("rr-research-racebar__number").textContent,"RACE 5");
assert.equal(find("rr-research-racebar__post").textContent,"3:40 PM ET");
assert.equal(find("rr-ed-stakes-title").textContent,"First Lady Stakes");
assert.ok(find("rr-ed-grade-trophy rr-ed-grade-trophy--g1"),"Only a verified grade gets a trophy");
assert.ok(!nodes.some(n=>n.textContent.includes("Venue Sponsor")),"Sponsor must not leak");
const sparse=render({track:"Synthetic Downs",race_number:1});
assert.equal(sparse.children.length,1,"Never invent race descriptions for missing source fields");
context.RRRaceTitles=undefined;
const fallback=render(source);
const fallbackNodes=children(fallback);
assert.equal(fallbackNodes.some(n=>n.className.startsWith("rr-ed-grade-trophy")),false,"No trophy from unavailable canonical grade parser");
assert.ok(fallbackNodes.some(n=>n.className==="rr-ed-stakes-title"&&n.textContent==="First Lady Stakes"));
console.log("PASS: Both private research readers use exactly one canonical source-accurate race header; obsolete banner renderers and CSS are absent.");

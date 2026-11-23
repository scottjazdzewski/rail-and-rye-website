import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const router=read("src/index.js"),wrangler=read("wrangler.jsonc");
const logo="/assets/approved/brand/rail-rye-ivory-logo.png";
const manifest=JSON.parse(read("public/assets/approved/manifest.json"));
const expected=[
 ["public/admin/racing-intelligence-review.html",["/assets/approved/race-cards/hero.webp","/assets/approved/publications/pick-tickets-hero.png","/assets/approved/publications/longshot-hero.jpg","/assets/approved/publications/target-hero.jpg"]],
 ["public/admin/longshot-radar.html",[manifest.publications.longshot_radar.hero,manifest.publications.longshot_radar.mark]],
 ["public/admin/target-list-preview.html",[manifest.publications.target_list.hero,manifest.publications.target_list.mark]]
];
assert.match(wrangler,/"run_worker_first":\["\/admin\*"/,"All /admin review pages must run through worker before any static asset.");
assert.match(router,/if\(path\.startsWith\("\/api\/admin\/"\)\|\|path==="/);
assert.match(router,/const auth=await verifyAdmin\(request,env\); if\(!auth.ok\)return auth.response/,"Admin preview must fail closed");
assert.match(router,/adminPages.get\(shortPath\)/,"Only the explicit protected preview routes may be served.");
for(const route of ["/admin/longshot-radar","/admin/target-list-preview","/admin/racing-intelligence-review"]){
 assert.ok(router.includes('["'+route+'",'),"Protected route missing "+route);
}
assert.ok(router.indexOf('if(path.startsWith("/api/admin/"))return handleAdminAPI')>router.indexOf('const auth=await verifyAdmin(request,env)'));
for(const [page,assets] of expected){
 const content=read(page);
 assert.match(content,/noindex,nofollow,noarchive/);
 assert.ok(content.includes(logo),"Preserve canonical Rail & Rye logo on "+page);
 assert.doesNotMatch(content,/<iframe|PDF download|\.pdf/i);
 for(const asset of assets){
  assert.ok(content.includes(asset),"Approved artwork absent from "+page+": "+asset);
  assert.ok(existsSync("public"+asset),"Approved file missing from project: "+asset);
 }
}
for(let i=1;i<=20;i++){
 assert.ok(existsSync("public"+manifest.saddlecloths[i]),"Missing real approved saddlecloth #"+i);
}
for(const module of ["longshot-radar.js","target-list-dashboard.js"]){
 const source=read("public/assets/"+module);
 assert.match(source,/assets\/approved\/saddlecloths\/"/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|innerHTML/,"No stored paid content or raw HTML insertion.");
 if(module==="longshot-radar.js")assert.match(source,/visualSample/,"Radar private sample should be available.");
 else assert.match(source,/demoData|reviewOnly|review_only/,"Preserve Target List's existing private example/review workflow.");
 assert.doesNotMatch(source,/\/api\/checkout|stripe/,"No new disconnected commerce flow.");
}
assert.match(read("public/assets/racing-intelligence-module-art.css"),/rr-review-artwork/);
assert.match(wrangler,/"PROJECTIONS_MEMBER_LAUNCH":"off"/,"Do not enable customer launch");
console.log("PASS: private Hub route, fail-closed admin gate, approved logo/4 product heroes/2 product marks/all 20 real saddlecloth assets, no PDF dependency, no paid data exposure.");

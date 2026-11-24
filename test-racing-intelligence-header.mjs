import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const pages=[
 ["public/admin/projections-preview.html","Projections"],
 ["public/admin/pick-tickets-preview.html","Pick Tickets"],
 ["public/admin/longshot-radar.html","Longshot Radar"],
 ["public/admin/target-list-preview.html","Target List"],
 ["public/admin/racing-intelligence-review.html","Hub"],
 ["public/membership/dashboard/index.html","Projections"]
];
const names=["Hub","Projections","Pick Tickets","Longshot Radar","Target List"];
let reference=null;
for(const [path,active] of pages){
 const html=readFileSync(path,"utf8");
 const found=html.match(/<header class="heritage-header rr-intel-header">[\s\S]*?<\/header>/);
 assert.ok(found,path+": canonical masthead required");
 assert.match(html,/rr-hub-header\.css\?v=2/,path+": load shared stylesheet");
 assert.doesNotMatch(html,/<header class="rr-member-header">|rr-pt-brand-rail/,path+": no retired/double masthead");
 assert.match(found[0],/class="heritage-shell heritage-header-inner rr-intel-header__inner"/,path+": use site-wide grid");
 assert.match(found[0],/class="heritage-strap"/,path+": include horse emblem and tagline");
 assert.match(found[0],/class="heritage-nav rr-intel-header__nav"/,path+": use site-wide desktop pills");
 assert.match(found[0],/class="heritage-mobile-nav rr-intel-header__mobile"/,path+": use site-wide mobile menu");
 const clean=found[0].replaceAll(' aria-current="page"',"").replaceAll('<a class="heritage-nav-pill rr-intel-header__pill" href="/my-products/">My Tabs</a>',"").replaceAll('<a class="rr-intel-header__pill" href="/my-products/">My Tabs</a>',"");
 if(reference)assert.equal(clean,reference,path+": must reuse identical masthead markup");
 else reference=clean;
 for(const cls of ["rr-intel-header__nav","rr-intel-header__mobile-links"]){
  const slot=found[0].match(new RegExp('<nav class="[^"]*'+cls+'"[^>]*>([\\s\\S]*?)<\\/nav>'));
  assert.ok(slot,path+": "+cls+" exists");
  const links=[...slot[1].matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
  const expected=path.includes("/membership/dashboard/")?(cls==="rr-intel-header__nav"?["Hub","My Tabs",...names.slice(1)]:["My Tabs",...names]):names;
  assert.deepEqual(links.map(x=>x[2]),expected,path+": retain existing tabs in the same order");
  assert.equal(links.filter(x=>x[0].includes('aria-current="page"')).length,1,path+": exactly one active product");
  assert.ok(links.find(x=>x[2]===active)?.[0].includes('aria-current="page"'),path+": correct active module");
 }
}
const css=readFileSync("public/assets/rr-hub-header.css","utf8");
const core=readFileSync("public/assets/rail-rye-core.css","utf8");
assert.match(css,/\.rr-intel-header\.heritage-header\{/,"Intelligence backdrop must use heritage masthead");
assert.match(css,/hero-dust-charged-finish\.jpg/,"Intelligence backdrop must use the homepage racing photo");
for(const selector of [".heritage-brand-mark",".heritage-wordmark",".heritage-strap",".heritage-nav .heritage-nav-pill",".heritage-mobile-nav nav"])
 assert.ok(core.includes(selector),"Site-wide header selector absent: "+selector);
assert.match(core,/@media\(max-width:750px\)/,"Responsive dropdown must be shared with the site");
assert.match(core,/border-radius:999px/,"Homepage-style gold outlined pill buttons");
const proj=readFileSync("public/assets/rr-projections-race-header.css","utf8");
const pick=readFileSync("public/assets/pick-tickets-dashboard.css","utf8");
const target=readFileSync("public/assets/target-list-dashboard.css","utf8");
assert.match(proj,/\.rrp-race-head__scratch-chip\{[\s\S]*?background:#fff/,"Projection scratches need opaque backing");
assert.match(proj,/\.rrp-race-head__scratch-img\{[^}]*background:#fff/,"Projection scratch image itself must be opaque");
assert.match(pick,/\.rr-pt-scratch-chip \.rr-pt-chip\{[^}]*background:#fff/,"Pick Tickets scratches need opaque backing");
assert.match(pick,/\.rr-pt-builder \.rr-pt-runner-button\.rr-pt-scratched,[\s\S]*?opacity:1/,"Disabled scratch chips remain visible");
assert.match(target,/\.rr-target-scratch \.rr-target-saddle\{[^}]*background:#fff/,"Target List scratches need opaque backing");
assert.doesNotMatch(readFileSync("public/admin/pick-tickets-preview.html","utf8"),/rr-pt-brand-id|rr-pt-brand-rail/,"Pick Tickets must not repeat Rail & Rye brand");
const logoFreePages=["public/admin/projections-preview.html","public/membership/dashboard/index.html","public/admin/pick-tickets-preview.html","public/admin/longshot-radar.html","public/admin/target-list-preview.html"];
for(const path of logoFreePages){
 const html=readFileSync(path,"utf8");
 assert.doesNotMatch(html,/rr-pt-track-logo|rr-pt-track-mark|rrp-track-head__venue-mark/,
  "Racing Intelligence pages must not display venue-logo badges.");
}
for(const path of ["public/assets/projections-dashboard.js","public/assets/pick-tickets-dashboard.js"]){
 assert.doesNotMatch(readFileSync(path,"utf8"),/approved\/track-logos\//,
  "No production client may fetch track logos during the mobile pass.");
}
const identity=readFileSync("public/assets/rr-projections-track-identity.css","utf8");
assert.match(identity,/grid-template-columns:minmax\(0,1fr\)/,"Full-width venue name/date replaces logo frame.");
assert.doesNotMatch(identity,/rrp-track-head__venue-mark|rrp-track-head__logo/,
 "Delete old logo CSS rather than hiding it.");
console.log("PASS: six real public-site heritage mastheads, matching links, unclipped mobile menu and opaque scratch chips");

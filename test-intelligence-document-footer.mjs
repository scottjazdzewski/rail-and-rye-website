import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CUSTOMER_READERS,customerReaderPath,serveCustomerReader} from "./src/customer-readers.js";
const read=path=>readFileSync("public"+path,"utf8");
const footer=html=>html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0];
const official=footer(read("/store/index.html"));
assert.match(official,/class="heritage-footer"/);
assert.match(official,/rr-social-links/);
for(const path of [...Object.values(CUSTOMER_READERS).map(r=>r.asset),"/admin/racing-intelligence-review.html","/membership/dashboard/index.html"]){
 const html=read(path);
 assert.equal(footer(html),official,path+" official footer");
 assert.equal((html.match(/<footer\b/g)||[]).length,1);
 assert.match(html,/class="rr-intel-document"/);
 assert.match(html,/rr-intelligence-document\.css\?v=1/);
 assert.match(html,/<\/footer>\s*<\/body>\s*<\/html>\s*$/);
}
const env={ASSETS:{fetch:async req=>new Response(read(new URL(req.url).pathname))}};
for(const config of Object.values(CUSTOMER_READERS)){
 const url=new URL(customerReaderPath(config.category,"2026-11-24"),"https://example.test");
 const res=await serveCustomerReader(new Request(url),env,url);
 assert.equal(res.status,200);
 const html=await res.text();
 assert.equal(footer(html),official);
 assert.doesNotMatch(html,/href="\/admin\//);
}
const css=read("/assets/rr-intelligence-document.css");
assert.match(css,/overscroll-behavior-y:none/);
assert.match(css,/min-height:100svh/);
assert.match(css,/height:auto;max-height:none/);
assert.doesNotMatch(css,/overflow-y:\s*hidden|position:\s*fixed/);
console.log("PASS: canonical footer, natural document flow and customer route parity.");

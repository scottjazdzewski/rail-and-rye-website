/* Real Playwright geometry/interaction test; the source demo is explicitly fictional. */
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";
import {getPickTicketsPrivateDemo} from "./src/pick-tickets-demo.js";

const demo=getPickTicketsPrivateDemo();
assert.equal(demo.cards.length,5,"five private demo tracks are present");
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".png":"image/png",".webp":"image/webp"};
const root=path.resolve("public");
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,"http://127.0.0.1");
 if(url.pathname==="/api/admin/pick-tickets"){
  response.writeHead(200,{"content-type":"application/json","cache-control":"private, no-store"});
  response.end(JSON.stringify(url.searchParams.get("demo")==="1"?demo:{cards:[],demo:false}));return;
 }
 const raw=url.pathname==="/admin/pick-tickets-preview/"?"admin/pick-tickets-preview.html":url.pathname.replace(/^\/+/,"");
 const full=path.resolve(root,raw);
 if(!full.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
 try{const buf=fs.readFileSync(full);response.writeHead(200,{"content-type":mime[path.extname(full)]||"application/octet-stream"});response.end(buf)}
 catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const addr="http://127.0.0.1:"+server.address().port+"/admin/pick-tickets-preview/";
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 fs.mkdirSync("test-artifacts",{recursive:true});
 for(const width of [320,375,390,430,768,1280]){
  const page=await browser.newPage({viewport:{width,height:880},deviceScaleFactor:1});
  await page.route(/https:\/\/fonts\.googleapis\.com\/.*/,route=>route.abort());
  await page.route(/https:\/\/fonts\.gstatic\.com\/.*/,route=>route.abort());
  await page.goto(addr,{waitUntil:"domcontentloaded"});
  await page.locator(".rr-pt-ticket-screen").waitFor();
  assert.equal(await page.locator("#rr-pt-mock").isVisible(),true,"demo source clearly labeled");
  assert.equal(await page.locator(".rr-pt-sequence-tab").count(),3,"one Pick 3 tab per available sequence");
  assert.equal(await page.locator(".rr-pt-seq-range").allTextContents().then(x=>x.join("|")),"Races 1–3|Races 4–6|Races 7–9");
  assert.equal(await page.locator(".rr-pt-race-row").count(),3,"Pick 3 has three complete race legs");
  assert.equal(await page.locator(".rr-pt-chip img").count(),6,"actual approved saddlecloth PNGs used");
  assert.equal(await page.locator(".rr-pt-ticket-stats strong").count(),4,"model hit, combos, base and total slots shown");
  assert.equal(await page.locator(".rr-pt-ticket-stats strong").first().innerText(),"—","mock predictions are never fabricated");
  assert.equal(await page.locator(".rr-pt-brand-rail").count(),1,"sticky Rail & Rye and track identity exists");
  const logo=await page.locator("#rr-pt-track-logo").evaluate(n=>({src:n.getAttribute("src"),loaded:n.complete&&n.naturalWidth>0}));
  assert.equal(logo.loaded,true,"original track graphic must load");
  const sticky=await page.locator(".rr-pt-brand-rail").evaluate(n=>getComputedStyle(n).position);
  assert.equal(sticky,"sticky");
  const size=await page.evaluate(()=>({inner:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(size.doc<=size.inner+1&&size.body<=size.inner+1,"page horizontal overflow at "+width+": "+JSON.stringify(size));
  await page.screenshot({path:"test-artifacts/pick-tickets-"+width+".png",fullPage:true});

  // Sequence tabs represent the three available Pick 3 ranges, not individual race legs.
  await page.getByRole("button",{name:/Pick 3: 3 available sequences/}).click();
  await page.locator(".rr-pt-sequence-tab").nth(1).click();
  assert.match(await page.locator(".rr-pt-ticket-header h2").innerText(),/Races 4–6/);
  assert.equal(await page.locator(".rr-pt-race-row").count(),3);
  await page.locator(".rr-pt-sequence-tab").nth(2).click();
  assert.match(await page.locator(".rr-pt-ticket-header h2").innerText(),/Races 7–9/);
  assert.equal(await page.locator(".rr-pt-pass-note").count(),1,"PASS still displays best possible source-shaped mock ticket");
  assert.equal(await page.locator(".rr-pt-ticket-screen .rr-pt-tier").count(),0,"PASS shows one best possible ticket");

  // A wager-type change updates available sequence tabs and complete ticket legs.
  await page.getByRole("button",{name:/Pick 4: 2 available sequences/}).click();
  assert.equal(await page.locator(".rr-pt-sequence-tab").count(),2,"Pick 4 shows only its two sequences");
  assert.equal(await page.locator(".rr-pt-race-row").count(),4);
  assert.equal(await page.locator(".rr-pt-tier").count(),2);
  await page.getByRole("button",{name:"Full Coverage"}).first().click();
  assert.equal(await page.locator(".rr-pt-race-row").count(),4,"coverage switch preserves all four legs");
  assert.match(await page.locator(".rr-pt-wager-name").innerText(),/coverage/i);
  const foot=await page.locator(".rr-pt-chip").evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().width)));
  assert.equal(new Set(foot).size,1,"horse saddlecloth chips remain identical at "+width);

  // Customer may choose a custom field; cost/combinations update but probability remains unavailable.
  const recommendedCost=await page.locator(".rr-pt-ticket-stats strong").last().innerText();
  await page.getByRole("button",{name:"Build My Ticket"}).click();
  assert.equal(await page.locator(".rr-pt-builder-row").count(),4);
  assert.equal(await page.locator(".rr-pt-compare-table tbody tr").count(),5);
  assert.equal(await page.getByText("Not yet available").count()>=2,true,"value stays unavailable without payout data");
  assert.equal(await page.locator(".rr-pt-compare-table tbody tr").first().locator("td").last().innerText(),"—");
  await page.getByRole("button",{name:/Race 2 horse 12 not selected/}).click();
  const newCost=await page.locator(".rr-pt-compare-table tbody tr").nth(3).locator("td").last().innerText();
  assert.notEqual(newCost,recommendedCost,"changing ticket field changes live total");
  const builderSize=await page.evaluate(()=>({w:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(builderSize.doc<=builderSize.w+1&&builderSize.body<=builderSize.w+1,"builder must not overflow at "+width);
  await page.screenshot({path:"test-artifacts/pick-tickets-builder-"+width+".png",fullPage:true});
  await page.getByRole("button",{name:"Reset to Rail & Rye Selections"}).click();
  const resetCost=await page.locator(".rr-pt-compare-table tbody tr").nth(3).locator("td").last().innerText();
  assert.equal(resetCost,recommendedCost,"reset restores original selections");
  await page.getByRole("button",{name:"Rail & Rye Ticket"}).click();
  assert.equal(await page.locator(".rr-pt-race-row").count(),4);

  await page.locator(".rr-pt-analysis-button").click();
  assert.equal(await page.locator("#rr-pt-dialog").evaluate(n=>n.open),true,"full analysis opens");
  assert.equal(await page.locator("#rr-pt-dialog .rr-pt-race-row").count(),4);
  const drawerBounds=await page.locator("#rr-pt-dialog").evaluate(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,width:innerWidth}));
  assert.ok(drawerBounds.left>=-1&&drawerBounds.right<=drawerBounds.width+1,"dialog overflow at "+width);
  await page.screenshot({path:"test-artifacts/pick-tickets-detail-"+width+".png"});
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#rr-pt-dialog").evaluate(n=>n.open),false);

  // All five track names select independently and remain grouped by available wager.
  await page.selectOption("#rr-pt-track","Zia Park");
  assert.equal(await page.locator(".rr-pt-sequence-tab").count(),3);
  assert.equal(await page.locator("#rr-pt-current .rr-pt-race-row").count(),3,"new track updates the active ticket, not hidden dialog history");
  assert.match(await page.locator("#rr-pt-track-logo").getAttribute("src"),/zia-park.webp$/);
  await page.close();
 }
 console.log("PASS: track → Pick type → Races 1–3/4–6/7–9 tabs, tier switch, mock label, official chips, full analysis, six responsive widths.");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}

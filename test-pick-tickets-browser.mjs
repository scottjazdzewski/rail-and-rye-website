/* Browser-only synthetic QA: never publish this data or use as a racing recommendation. */
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const t=(role,legs)=>({
 role,title:role.replace("_"," ")+" — SYNTHETIC QA",unit_cents:50,
 combinations:legs.reduce((count,leg)=>count*leg.programs.length,1),
 total_cents:50*legs.reduce((count,leg)=>count*leg.programs.length,1),
 legs
});
const legs=(start,end,programs)=>Array.from({length:end-start+1},(_,i)=>({race_number:start+i,programs:programs[i]}));
const fixture={card:{
 schema_version:1,product_type:"pick_tickets",date:"2026-11-23",track:"Synthetic QA Racecourse with a Long Name",
 revision:2,status:"initial_current",source_receipt:{reference:"SYNTHETIC-QA",sha256:"a".repeat(64)},
 sequences:[
  {name:"Synthetic 6-race PASS · long headline for wrapping checks",start_race:1,end_race:6,play_status:"PASS",hit_rate_display:"12.345%",recommendation:"Test source-only reasoning, not a wager.",tickets:[
   t("BEST_POSSIBLE",legs(1,6,[["1","1A","11","12"],["3","4"],["2","5"],["10"],["7","8"],["9"]]))
  ]},
  {name:"Synthetic Late Pick 4",start_race:3,end_race:6,play_status:"PLAY",hit_rate_display:"23.5%",recommendation:"Testing only.",tickets:[
   t("LEAN",legs(3,6,[["4","5"],["1"],["12"],["9"]])),
   t("FULL_COVERAGE",legs(3,6,[["4","5","6"],["1","2"],["12","13"],["9","11"]]))
  ]},
  {name:"Synthetic Pick 3",start_race:4,end_race:6,play_status:"CONDITIONAL",hit_rate_display:"",tickets:[
   t("LEAN",legs(4,6,[["2"],["3","4"],["5"]]))
  ]}
 ]},updated_at:"2026-11-23T04:00:00Z"};
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".png":"image/png",".webp":"image/webp"};
const root=path.resolve("public");
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,"http://localhost");
 if(url.pathname==="/api/admin/pick-tickets"){
  res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify({cards:[fixture]}));return;
 }
 const name=url.pathname==="/admin/pick-tickets-preview/"?"admin/pick-tickets-preview.html":url.pathname.replace(/^\/+/,"");
 const target=path.resolve(root,name);
 if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{const data=fs.readFileSync(target);res.writeHead(200,{"Content-Type":mime[path.extname(target)]||"application/octet-stream"});res.end(data);}
 catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const address="http://127.0.0.1:"+server.address().port+"/admin/pick-tickets-preview/";
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 fs.mkdirSync("test-artifacts",{recursive:true});
 for(const width of [320,375,390,430,768,1280]){
  const page=await browser.newPage({viewport:{width,height:880},deviceScaleFactor:1});
  await page.route(/https:\/\/fonts\.googleapis\.com\/.*/,route=>route.abort());
  await page.route(/https:\/\/fonts\.gstatic\.com\/.*/,route=>route.abort());
  await page.goto(address,{waitUntil:"domcontentloaded"});
  await page.locator(".rr-pt-sequence").first().waitFor();
  assert.equal(await page.locator(".rr-pt-sequence").count(),3,"all official source sequences must render");
  const bounds=await page.evaluate(()=>({window:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(bounds.scroll<=bounds.window+1,"horizontal page overflow at "+width+": "+JSON.stringify(bounds));
  assert.ok(bounds.body<=bounds.window+1,"body overflow at "+width+": "+JSON.stringify(bounds));
  assert.equal(await page.locator(".rr-pt-state[data-status=PASS]").count(),1);
  assert.equal(await page.locator(".rr-pt-state[data-status=CONDITIONAL]").count(),1);
  assert.equal(await page.locator(".rr-pt-state[data-status=PLAY]").count(),1);
  assert.ok(await page.locator(".rr-pt-chip img").count()>10,"approved saddlecloth image assets required");
  const ticketViews=await page.locator(".rr-pt-sequence .rr-pt-ticket").count();
  assert.equal(ticketViews,3,"compact overview shows one certified tier per sequence");
  const multi=page.locator(".rr-pt-sequence").nth(1);
  assert.equal(await multi.locator(".rr-pt-tier").count(),2,"ticket versions are switchable");
  assert.equal(await multi.locator(".rr-pt-tier").first().getAttribute("aria-pressed"),"true");
  await page.screenshot({path:"test-artifacts/pick-tickets-"+width+".png",fullPage:true});
  await multi.getByRole("button",{name:"Full Coverage"}).click();
  assert.equal(await multi.locator(".rr-pt-tier").nth(1).getAttribute("aria-pressed"),"true");
  assert.match(await multi.locator(".rr-pt-ticket-metrics").innerText(),/24 COMBINATIONS/);
  assert.match(await multi.locator(".rr-pt-ticket-cost").innerText(),/\$12\.00/);
  assert.equal(await multi.locator(".rr-pt-ticket").count(),1,"switch tier without stacking duplicate cards");
  const chipBounds=await page.locator(".rr-pt-sequence").first().locator(".rr-pt-chip").evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().width)));
  assert.equal(new Set(chipBounds).size,1,"saddlecloths 1 through 20 and suffixes use identical footprints");
  await multi.locator(".rr-pt-detail-button").click();
  assert.equal(await page.locator("#rr-pt-dialog .rr-pt-ticket").count(),1,"drawer shows one complete ticket at a time");
  assert.equal(await page.locator("#rr-pt-dialog .rr-pt-tier").count(),2,"every approved ticket version remains accessible");
  const drawerRows=page.locator("#rr-pt-dialog .rr-pt-leg");
  assert.equal(await drawerRows.count(),4,"all source race legs are visible as rows");
  const rowGrid=await drawerRows.first().evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(" ").length);
  assert.equal(rowGrid,2,"each detail race row aligns number label and official saddlecloths");
  const backgrounds=await drawerRows.evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor));
  assert.notEqual(backgrounds[0],backgrounds[1],"alternating stripes separate adjacent races");
  await page.locator("#rr-pt-dialog").getByRole("button",{name:"Full Coverage"}).click();
  assert.equal(await page.locator("#rr-pt-dialog .rr-pt-leg").count(),4);
  assert.match(await page.locator("#rr-pt-dialog .rr-pt-ticket-metrics").innerText(),/24 COMBINATIONS/);
  const overlayBounds=await page.locator("#rr-pt-dialog").evaluate(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,window:innerWidth}));
  assert.ok(overlayBounds.left>=-1&&overlayBounds.right<=overlayBounds.window+1,"detail screen must stay inside viewport at "+width);
  await page.screenshot({path:"test-artifacts/pick-tickets-detail-"+width+".png"});
  await page.keyboard.press("Escape");
  await page.locator(".rr-pt-detail-button").first().click();
  assert.equal(await page.locator("#rr-pt-dialog").evaluate(el=>el.open),true,"bottom drawer must open");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#rr-pt-dialog").evaluate(el=>el.open),false,"escape must dismiss detail");
  await page.selectOption("#rr-pt-filter","PLAY");
  assert.equal(await page.locator(".rr-pt-sequence").count(),1,"filter must honor PLAY only");
  await page.close();
 }
 console.log("Pick Tickets browser QA PASS: 320, 375, 390, 430, 768 and 1280px, no horizontal overflow, all source tickets, official saddlecloth assets, dialog and filtering.");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}

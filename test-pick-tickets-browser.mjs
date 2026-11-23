/* Headless browser QA only: synthetic source fixtures never leave CI or reach customer endpoints. */
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";
import {getPickTicketsPrivateDemo} from "./src/pick-tickets-demo.js";
import {getPickTicketsIntake} from "./src/pick-tickets-intake.js";
import {getNov23ScratchLedger,officialScratchSequenceCount} from "./src/pick-tickets-scratch-1123.js";
import {PICK_MENU_1123} from "./src/pick-tickets-auto.js";

const fixture=getPickTicketsPrivateDemo();
assert.equal(fixture.cards.length,5,"five QA track fixtures are present");
const synthetic={cards:fixture.cards.map(x=>({...x,card:{
 ...x.card,status:"initial_current",is_demo:false,revision:1,
 source_receipt:{reference:"CI-SYNTHETIC-NOT-A-RACING-SELECTION",sha256:"a".repeat(64)}
}})),demo:false};
 // Regression fixture for a scratch-day source receipt carrying old wording.
 synthetic.cards[0].card.source_receipt.reference="CI-RIDER_CHANGES_PENDING";
 synthetic.cards[0].card.sequences[0].tickets[0].title="Rail & Rye Interim Focused Ticket";
 synthetic.cards[0].card.sequences[0].tickets[0].notes=
  "Interim focused ticket: lean: $4.00 / 25.0%; former_balanced: $12.00 / 32.0%. No prediction of return; prescratch model review.";
 synthetic.cards[0].card.sequences[0].recommendation=
  "Focused interim construction. lean: $4.00 / 25.0%; focused: $6.00 / 28.0%.";
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".png":"image/png",".webp":"image/webp"};
const root=path.resolve("public");
let sourceHoldMode=false,scratchBuilderMode=false;
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,"http://127.0.0.1");
 if(url.pathname==="/api/admin/pick-tickets"){
  response.writeHead(200,{"content-type":"application/json","cache-control":"private, no-store"});
  response.end(JSON.stringify(sourceHoldMode?{cards:[],intake:getPickTicketsIntake(),
    scratch_update:{...getNov23ScratchLedger(),dependent_sequences:officialScratchSequenceCount(PICK_MENU_1123)},
    demo:false}:scratchBuilderMode?{...synthetic,scratch_update:getNov23ScratchLedger()}:synthetic));return;
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
  assert.equal(await page.locator("#rr-pt-mock, #rr-pt-file, #rr-pt-upload").count(),0,"No staging controls.");
  assert.equal(await page.locator(".rr-pt-sequence-tab").count(),3,"one Pick 3 tab per available sequence");
  assert.equal(await page.locator(".rr-pt-seq-range").allTextContents().then(x=>x.join("|")),"Races 1–3|Races 4–6|Races 7–9");
  assert.equal(await page.locator(".rr-pt-race-row").count(),3,"Pick 3 has three complete race legs");
  assert.equal(await page.locator(".rr-pt-interim-model-label").count(),0,"scratch-day status banner is not customer-facing");
  assert.equal(await page.locator(".rr-pt-wager-name").innerText(),"Rail & Rye Ticket","legacy interim title normalized for customers");
  assert.doesNotMatch(await page.locator("#rr-pt-current").innerText(),/interim|changed-jockey scoring still pending/i);
  await page.locator(".rr-pt-analysis-button").click();
  assert.doesNotMatch(await page.locator("#rr-pt-dialog").innerText(),/interim|prescratch model review/i,"Ticket Insights also has no old internal labels");
  assert.equal(await page.locator("#rr-pt-dialog .rr-pt-analysis-tier").innerText(),"Rail & Rye Ticket");
  await page.locator("#rr-pt-close").click();
  assert.equal(await page.locator(".rr-pt-chip img").count(),6,"actual approved saddlecloth PNGs used");
  assert.equal(await page.locator(".rr-pt-ticket-stats strong").count(),4,"model hit, combos, base and total slots shown");
  assert.equal(await page.locator(".rr-pt-wager-meta .rr-pt-probability").count(),0,"no duplicate hit probability near ticket title");
  const statLabels=await page.locator(".rr-pt-ticket-stats .rr-pt-stat span").allTextContents();
  assert.deepEqual(statLabels,["PROJECTED HIT","COMBINATIONS","BASE WAGER","TOTAL COST"]);
  const textSizes=await page.locator(".rr-pt-ticket-stats .rr-pt-stat span").evaluateAll(items=>items.map(x=>getComputedStyle(x).fontSize));
  assert.equal(new Set(textSizes).size,1,"all four metric labels use exactly the same font size at "+width);
  const numberSizes=await page.locator(".rr-pt-ticket-stats .rr-pt-stat strong").evaluateAll(items=>items.map(x=>getComputedStyle(x).fontSize));
  assert.equal(new Set(numberSizes).size,1,"all four numeric metrics use exactly the same font size at "+width);
  assert.equal(await page.locator(".rr-pt-ticket-stats strong").first().innerText(),"—","mock predictions are never fabricated");
  assert.equal(await page.locator(".rr-pt-brand-rail").count(),1,"sticky Rail & Rye and track identity exists");
  const logo=await page.locator("#rr-pt-track-logo").evaluate(n=>({src:n.getAttribute("src"),loaded:n.complete&&n.naturalWidth>0}));
  assert.equal(logo.loaded,true,"original track graphic must load");
  const sticky=await page.locator(".rr-pt-brand-rail").evaluate(n=>getComputedStyle(n).position);
  assert.equal(sticky,"sticky");
  const legacyHeight=await page.locator(".rr-member-header").evaluate(n=>n.getBoundingClientRect().height);
  assert.ok(legacyHeight<75,"legacy navigation must be compact at "+width);
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
  assert.equal(await page.locator(".rr-pt-compare-table tbody tr").last().locator("th").innerText(),"COST CHANGE","the comparison must show exact cost change, not payout or expected value");
  assert.equal(await page.locator(".rr-pt-compare-table tbody tr").last().locator("td").last().innerText(),"$0.00","no selections changed yet");
  assert.equal(await page.locator("#rr-pt-current").innerText().then(t=>/PAYOUT|VALUE ESTIMATE|POOL SIZE|ROI/i.test(t)),false,"never show payout or return estimates");
  assert.equal(await page.locator(".rr-pt-compare-table tbody tr").first().locator("td").last().innerText(),"—");
  assert.equal(await page.locator(".rr-pt-field-grid").count(),0,"extra runners stay collapsed by default");
  await page.getByRole("button",{name:"Add runners for Race 2"}).click();
  assert.equal(await page.locator(".rr-pt-field-grid").count(),1);
  await page.getByRole("button",{name:/Race 2 horse 12 not selected/}).click();
  const newCost=await page.locator(".rr-pt-compare-table tbody tr").nth(3).locator("td").last().innerText();
  assert.notEqual(newCost,recommendedCost,"changing ticket field changes live total");
  const change=await page.locator(".rr-pt-compare-table tbody tr").last().locator("td").last().innerText();
  assert.ok(change.startsWith("+$"),"adding a runner must display increased cost, not theoretical winnings");
  assert.equal(Number.parseFloat(change.replace(/[^0-9.]/g,"")),Number.parseFloat(newCost.replace("$",""))-Number.parseFloat(recommendedCost.replace("$","")));
  const builderSize=await page.evaluate(()=>({w:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(builderSize.doc<=builderSize.w+1&&builderSize.body<=builderSize.w+1,"builder must not overflow at "+width);
  await page.screenshot({path:"test-artifacts/pick-tickets-builder-"+width+".png",fullPage:true});
  await page.getByRole("button",{name:"Reset to Rail & Rye Selections"}).click();
  const resetCost=await page.locator(".rr-pt-compare-table tbody tr").nth(3).locator("td").last().innerText();
  assert.equal(resetCost,recommendedCost,"reset restores original selections");
  assert.equal(await page.locator(".rr-pt-compare-table tbody tr").last().locator("td").last().innerText(),"$0.00");
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

 // The owner wants scratches ONLY inside the ticket builder, as gray disabled chips.
 scratchBuilderMode=true;
 const builderPage=await browser.newPage({viewport:{width:375,height:800}});
 await builderPage.goto(addr,{waitUntil:"domcontentloaded"});
 await builderPage.locator(".rr-pt-ticket-screen").waitFor();
 await builderPage.selectOption("#rr-pt-track","Finger Lakes");
 await builderPage.locator(".rr-pt-mode-button").filter({hasText:"Build My Ticket"}).click();
 await builderPage.locator(".rr-pt-builder").waitFor();
 await builderPage.locator(".rr-pt-add-trigger").first().click();
 assert.ok(await builderPage.locator(".rr-pt-builder .rr-pt-scratched").count()>=1,
  "officially scratched horse remains visibly present in the ticket builder");
 assert.equal(await builderPage.locator(".rr-pt-builder .rr-pt-scratched:disabled").count(),
  await builderPage.locator(".rr-pt-builder .rr-pt-scratched").count(),
  "withdrawn horse selection is disabled");
 assert.equal(await builderPage.locator("#rr-pt-intake .rr-pt-scratch-list").count(),0,
  "no standalone scratches panel");
 await builderPage.close();

 // If the private model source is absent, the page does not fabricate tickets
 // or display a standalone scratches table.
 sourceHoldMode=true;
 const hold=await browser.newPage({viewport:{width:375,height:800}});
 await hold.goto(addr,{waitUntil:"domcontentloaded"});
 await hold.locator("#rr-pt-intake .rr-pt-intake-warning").waitFor();
 assert.equal(await hold.locator(".rr-pt-ticket-screen").count(),0);
 assert.equal(await hold.locator(".rr-pt-scratch-list").count(),0);
 assert.equal(await hold.locator("#rr-pt-track option").count(),5);
 assert.match(await hold.locator("#rr-pt-intake").innerText(),/Suggested tickets.*updated/);
 await hold.selectOption("#rr-pt-track","Zia Park");
 assert.equal(await hold.locator(".rr-pt-scratch-list").count(),0);
 await hold.close();
 console.log("PASS: certified-data preview only, no payout/value metrics, precise cost change, track/range/tier switching and six responsive widths.");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}

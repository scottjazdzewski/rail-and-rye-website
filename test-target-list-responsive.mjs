import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync,mkdirSync} from "node:fs";
import {join,resolve,extname} from "node:path";
import {chromium} from "playwright";

// Browser-only synthetic layout fixture. No real customer picks or model numbers.
const long="Very Long Approved Horse Name That Must Stay Visible";
const runner=(number,name,pwin)=>({program_number:number,horse_name:name,morning_line:"12-1",win_probability:pwin,fair_odds:"6/1",trainer:"Trainer Name",jockey:"Jockey Name"});
const fixture={dates:["2026-11-23"],uploaded_at:"2026-11-23T04:00:00Z",edition:{
 schema_version:1,product_type:"target_list",race_date:"2026-11-23",revision:1,status:"initial",
 source:{receipt_id:"viewport-fixture-only",sha256:"f".repeat(64)},
 targets:Array.from({length:8},(_,index)=>({
  rank:index+1,track:index%2?"Synthetic Park":"Synthetic Downs",race_number:index+1,
  tier:index%2?"STRONG":"PRIME",post_time_et:["9:55 PM ET","3:14 PM ET","9:30 PM ET","3:26 PM ET","1:12 PM ET","8:40 PM ET","4:15 PM ET","2:20 PM ET"][index],surface:"Dirt",distance:"7 furlongs",
  conditions:"Allowance / Optional Claiming",analysis:"Synthetic full analysis — no real race results or paid recommendations. The paragraph deliberately continues for multiple sentences so that any two-line truncation is caught in every viewport. No source material may be clipped or hidden behind a repeated details button.",
  favorite:runner("1",long,12),attack:runner(index===0?"12A":"20","A Wider Alternative Name",26),
  also_live:null,scratches:[]
 }))
}};
const base=resolve("public");
const contentType=path=>({".html":"text/html;charset=utf-8",".css":"text/css;charset=utf-8",".js":"text/javascript;charset=utf-8",".png":"image/png",".webp":"image/webp",".ico":"image/x-icon"}[extname(path)]||"application/octet-stream");
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,"http://localhost").pathname;
 if(pathname==="/api/admin/target-list-review"){
  res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify({dates:[],edition:null,review_only:true}));return;
 }
 if(pathname==="/api/admin/target-list"){
  res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(fixture));return;
 }
 const file=resolve(base,"."+pathname);
 if(!file.startsWith(base+"/")){res.writeHead(403);res.end();return;}
 try{const bytes=readFileSync(file);res.writeHead(200,{"Content-Type":contentType(file)});res.end(bytes);}
 catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true});
 const widths=[320,375,390,430,768,1280];
 mkdirSync("target-list-viewport-screenshots",{recursive:true});
 for(const width of widths){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.route("https://fonts.googleapis.com/**",route=>route.abort());
  await page.route("https://fonts.gstatic.com/**",route=>route.abort());
  await page.goto("http://127.0.0.1:"+port+"/admin/target-list-preview.html",{waitUntil:"domcontentloaded"});
  await page.locator(".rr-target-card").first().waitFor({timeout:10000});
  const stats=await page.evaluate(()=>{
   const viewport=document.documentElement.clientWidth;
   const rootWidth=document.documentElement.scrollWidth;
   const items=[...document.querySelectorAll(".rr-target-card")];
   const overflow=items.filter(el=>el.getBoundingClientRect().right>viewport+1||el.getBoundingClientRect().left< -1).length;
   const firstName=document.querySelector(".rr-target-horse-name");
   return {viewport,rootWidth,overflow,items:items.length,firstName:firstName?.textContent,firstWidth:firstName?.scrollWidth,firstClient:firstName?.clientWidth};
  });
  assert.equal(errors.length,0,"No browser JS errors at "+width+": "+errors.join("; "));
  assert.ok(stats.rootWidth<=stats.viewport+1,"No horizontal page overflow at "+width+": "+JSON.stringify(stats));
  assert.equal(stats.overflow,0,"Cards stay within viewport at "+width);
  assert.equal(stats.items,8,"All qualifying source targets appear at "+width);
  assert.equal(stats.firstName,long,"Long horse names retain their full text at "+width);
  const compact=await page.evaluate(()=>{
   const row=document.querySelector(".rr-target-card .rr-target-horse-row");
   const analysis=document.querySelector(".rr-target-card .rr-target-analysis-text");
   return {rowHeight:row.getBoundingClientRect().height,
    analysisVisible:analysis.scrollHeight<=analysis.clientHeight+2,
    analysisClamp:getComputedStyle(analysis).webkitLineClamp,
    reviewNotices:document.querySelectorAll(".rr-target-private").length,
    giantButtons:document.querySelectorAll(".rr-target-analyze").length};
  });
  assert.ok(compact.rowHeight<=185,"Extra-long horse names and connections may wrap naturally; never shrink the type to force a short row at "+width+": "+JSON.stringify(compact));
  assert.ok(compact.analysisVisible,"Complete editorial text must be readable at "+width+": "+JSON.stringify(compact));

  const reading=await page.locator(".rr-target-card .rr-target-analysis-text").first().evaluate(el=>{
    const style=getComputedStyle(el);
    return {font:parseFloat(style.fontSize),lineHeight:parseFloat(style.lineHeight),background:style.backgroundColor,
      actual:el.textContent, scroll:el.scrollHeight,client:el.clientHeight};
  });
  assert.ok(reading.font>= (width<=800?17:16.5),"Both research products must use readable 17px phone analysis, without zooming at "+width+": "+JSON.stringify(reading));
  assert.ok(reading.lineHeight/reading.font>=1.47,"Editorial lines must be readable at "+width+": "+JSON.stringify(reading));
  assert.match(reading.actual,/The paragraph deliberately continues/,"Never replace original analysis with a clipped preview.");
  assert.equal(await page.locator("#rr-target-upload-form").count(),0,"JSON upload should never appear on Target List.");

  const shell=await page.evaluate(()=>{
   const nav=document.querySelector(".rr-target-page .rr-member-nav");
   const tabs=[...nav.querySelectorAll("a")];
   const active=nav.querySelector('[aria-current="page"]');
   const title=document.querySelector(".rr-target-titlebar h1");
   const intro=document.querySelector(".rr-target-titlebar p");
   const bar=document.querySelector(".rr-target-toolbar");
   const select=bar.querySelector("select");
   const summary=document.querySelector("#rr-target-context");
   const navBox=nav.getBoundingClientRect();
   const activeBox=active.getBoundingClientRect();
   return {
     navWrap:getComputedStyle(nav).flexWrap,navHeight:navBox.height,
     navClientWidth:nav.clientWidth,navScrollWidth:nav.scrollWidth,
     tabHeights:tabs.map(el=>el.getBoundingClientRect().height),
     activeVisible:activeBox.left>=navBox.left-2&&activeBox.right<=navBox.right+2,
     titleSize:parseFloat(getComputedStyle(title).fontSize),
     introSize:parseFloat(getComputedStyle(intro).fontSize),
     introVisible:getComputedStyle(intro).display!=="none",
     selectSize:parseFloat(getComputedStyle(select).fontSize),
     selectHeight:select.getBoundingClientRect().height,
     sortContext:summary.textContent,
     controlsCount:bar.querySelectorAll("select").length
   };
  });
  if(width<=760){
    assert.equal(shell.navWrap,"nowrap","Five modules belong in one swipeable navigation row at "+width);
    assert.ok(shell.navHeight<=47,"No second line of navigation at "+width+": "+JSON.stringify(shell));
    assert.ok(shell.tabHeights.every(v=>v>=40),"Readable navigation tabs keep 40px tap targets at "+width+": "+JSON.stringify(shell));
    assert.ok(shell.activeVisible,"Active Target List tab should be in the swipeable viewport at "+width+": "+JSON.stringify(shell));
    assert.ok(shell.titleSize>=27,"Headings use common 28px mobile scale at "+width);
    assert.ok(shell.introVisible&&shell.introSize>=13,"Short module description remains readable at "+width);
    assert.ok(shell.selectSize>=15&&shell.selectHeight>=42,"Date and sort controls share readable type at "+width);
  }
  assert.equal(shell.controlsCount,2,"Only Date and Sort needed for the daily reader.");
  assert.equal(shell.sortContext,"Post-time order","Summary should show sort state instead of repeating date.");

  const readable=await page.evaluate(()=>{
    const target=document.querySelector(".rr-target-card");
    const header=target.querySelector(".rr-target-racebar");
    const meta=header.querySelector(".rr-target-race-facts");
    const name=target.querySelector(".rr-target-horse-name");
    const odds=target.querySelector(".rr-target-stat-win .rr-target-stat-value");
    const fair=target.querySelector(".rr-target-stat-fair .rr-target-stat-value");
    const role=target.querySelector(".rr-target-horse-role");
    const ml=target.querySelector(".rr-target-ml-inline");
    return {
      header:parseFloat(getComputedStyle(header.querySelector("h3")).fontSize),
      distance:parseFloat(getComputedStyle(meta).fontSize),
      raceFacts:meta.textContent, condition:target.querySelector(".rr-target-race-facts")?.textContent,
      name:parseFloat(getComputedStyle(name).fontSize), 
      win:parseFloat(getComputedStyle(odds).fontSize), fair:parseFloat(getComputedStyle(fair).fontSize),
      role:parseFloat(getComputedStyle(role).fontSize),ml:parseFloat(getComputedStyle(ml).fontSize),
      factsInNavy:header.contains(meta), factsOutside:[...target.children].some(child=>child.classList.contains("rr-target-race-facts"))
    };
  });
  assert.ok(readable.factsInNavy&&!readable.factsOutside,"Entire race description should live in the navy race banner at "+width+": "+JSON.stringify(readable));
  assert.equal(readable.raceFacts,"7 furlongs · Dirt · Allowance / Optional Claiming");

  const banner=await page.evaluate(()=>{
   const head=document.querySelector(".rr-target-card .rr-target-racebar-main");
   const facts=head.querySelector(".rr-target-race-facts");
   const post=head.querySelector(".rr-target-post");
   const track=head.querySelector("h3");
   const originalTrack=track.textContent,originalFacts=facts.textContent;
   // Local DOM-only short-race case, never a user-facing selection or saved fixture.
   track.textContent="Parx Racing";facts.textContent="6½F · Dirt";
   facts.classList.remove("rr-target-race-facts-long");
   head.insertBefore(facts,post);
   const top=el=>Math.round(el.getBoundingClientRect().top);
   const result={track:top(track),race:top(head.querySelector(".rr-target-race-number")),
    facts:top(facts),post:top(post),complete:facts.textContent};
   track.textContent=originalTrack;facts.textContent=originalFacts;
   facts.classList.add("rr-target-race-facts-long");
   head.append(facts);
   return result;
  });
  if(width>=375){
   // Baseline alignment gives a few px of different top offsets for 17px vs 13px text.
   assert.ok(Math.abs(banner.track-banner.race)<=6,"Track and race share a row at "+width+": "+JSON.stringify(banner));
   assert.ok(Math.abs(banner.facts-banner.track)<=6,"Short distance/surface shares that row at "+width+": "+JSON.stringify(banner));
   assert.ok(Math.abs(banner.post-banner.track)<=6,"Source post time shares that row at "+width+": "+JSON.stringify(banner));
  }
  assert.equal(banner.complete,"6½F · Dirt");

  assert.ok(readable.header>=16,"Track name must be easy to read at "+width+": "+JSON.stringify(readable));
  const typeMatch=await page.locator(".rr-target-card .rr-target-racebar-main").first().evaluate(el=>{
    const track=getComputedStyle(el.querySelector("h3"));
    const facts=getComputedStyle(el.querySelector(".rr-target-race-facts"));
    const race=getComputedStyle(el.querySelector(".rr-target-race-number"));
    const post=getComputedStyle(el.querySelector(".rr-target-post"));
    return {trackSize:parseFloat(track.fontSize),trackWeight:track.fontWeight,transform:track.textTransform,
      factsSize:parseFloat(facts.fontSize),factsWeight:facts.fontWeight,raceSize:parseFloat(race.fontSize),
      postSize:parseFloat(post.fontSize)};
  });
  assert.equal(typeMatch.trackSize,17,"Match Radar track name at 17px even on narrow phones: "+JSON.stringify(typeMatch));
  assert.equal(typeMatch.transform,"uppercase","Use Radar's uppercase race-track hierarchy.");
  assert.equal(typeMatch.factsSize,14,"Keep race conditions at Radar's readable 14px instead of shrinking: "+JSON.stringify(typeMatch));
  assert.equal(typeMatch.raceSize,13);
  assert.equal(typeMatch.postSize,13);

  assert.ok(readable.distance>=13,"Distance/surface/class must be readable at "+width+": "+JSON.stringify(readable));
  assert.ok(readable.name>=16,"Horse name must be readable at "+width+": "+JSON.stringify(readable));
  assert.ok(readable.win>=22&&readable.fair>=20,"Both price metrics must be prominent at "+width+": "+JSON.stringify(readable));
  assert.ok(readable.role>=11,"Favorite/ATTACK roles must remain readable at "+width+": "+JSON.stringify(readable));
  if(width<=800)assert.ok(readable.ml>=14,"ML must not require zooming on phones at "+width+": "+JSON.stringify(readable));


  assert.equal(compact.giantButtons,0,"Horse-row tap replaces repeated Race Details buttons at "+width);
  assert.equal(compact.reviewNotices,1,"Only one review notice above the feed at "+width);

  // Verify chronological post-time order vs independent A–Z track grouping.
  const initialTimes=await page.locator(".rr-target-post").allTextContents();
  assert.deepEqual(initialTimes,["1:12 PM ET","2:20 PM ET","3:14 PM ET","3:26 PM ET","4:15 PM ET","8:40 PM ET","9:30 PM ET","9:55 PM ET"],"Post-time sort must ignore original rank at "+width);
  await page.locator("#rr-target-sort").selectOption("track");
  assert.equal(await page.locator("#rr-target-context").innerText(),"Track order","Summary reflects track sorting.");
  const grouped=await page.locator(".rr-target-racebar h3").allTextContents();
  assert.deepEqual(grouped,["Synthetic Downs","Synthetic Downs","Synthetic Downs","Synthetic Downs","Synthetic Park","Synthetic Park","Synthetic Park","Synthetic Park"],"Track ordering must group A–Z at "+width);
  await page.locator("#rr-target-sort").selectOption("post-time");
  assert.deepEqual(await page.locator(".rr-target-post").allTextContents(),initialTimes,"Chronological order must be independently restored at "+width);
  await page.screenshot({path:"target-list-viewport-screenshots/card-"+width+".png",fullPage:false});
  await page.getByRole("button",{name:/view .* details for/i}).first().click();
  await page.locator("#rr-target-dialog[open]").waitFor();
  const detail=await page.locator("#rr-target-dialog").evaluate(el=>({
   width:el.getBoundingClientRect().width,
   right:el.getBoundingClientRect().right,
   max:document.documentElement.clientWidth
  }));
  assert.ok(detail.right<=detail.max+1,"Bottom drawer must not overflow at "+width);
  await page.screenshot({path:"target-list-viewport-screenshots/detail-"+width+".png",fullPage:false});
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#rr-target-dialog").evaluate(el=>el.open),false,"Escape closes drawer at "+width);
  await page.close();
 }
 // Missing private data is a blank state, never synthetic "Example Downs" or fake model values.
 const preview=await browser.newPage({viewport:{width:390,height:850},deviceScaleFactor:1});
 await preview.route("**/api/admin/target-list",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({dates:[],edition:null})}));
 await preview.goto("http://127.0.0.1:"+port+"/admin/target-list-preview.html",{waitUntil:"domcontentloaded"});
 await preview.locator("#rr-target-empty").waitFor({state:"visible"});
 assert.equal(await preview.locator(".rr-target-card").count(),0,"No actual edition means no visible fake cards.");
 assert.equal(await preview.locator(".rr-review-artwork").count(),0,"No top page-and-horse imagery.");
 assert.equal(await preview.locator("#rr-target-local-file").count(),0,"No manual local JSON file picker.");
 const review={dates:["2026-11-23"],review_only:true,demo_example:false,edition:{
  ...fixture.edition,review_only:true,customer_publish_approved:false,production_receipt_verified:false
 }};
 await preview.route("**/api/admin/target-list-review",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(review)}));
 await preview.reload({waitUntil:"domcontentloaded"});
 await preview.locator(".rr-target-card").first().waitFor({timeout:10000});
 assert.equal(await preview.locator(".rr-target-card").count(),8,"Review route directly renders stored source-backed races.");
 assert.match(await preview.locator(".rr-target-private").first().innerText(),/NOT SCORER-CERTIFIED/);
 assert.equal(await preview.locator(".rr-review-artwork").count(),0);
 await preview.close();
 console.log("PASS: real browser Target List layouts at 320, 375, 390, 430, 768 and 1280px, no synthetic fallbacks and real-source private review rendering.");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}

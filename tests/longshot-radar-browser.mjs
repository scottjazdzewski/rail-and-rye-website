/* Browser-only QA fixture; never deployed or placed in customer R2. */
import {chromium} from "playwright";
import {createServer} from "node:http";
import {readFileSync,mkdirSync} from "node:fs";
import {resolve,join,extname,sep} from "node:path";
const root=resolve("public");
const sample={
 review_only:true,editions:[{
  schema_version:1,product_type:"longshot_radar",race_date:"2026-11-23",revision:1,
  status:"prescratch",generated_at:"2026-11-23T03:15:00Z",
  receipts:{release_status:"PASS",model_sha256:"a".repeat(64),source_sha256:"b".repeat(64),editorial_qa_sha256:"c".repeat(64)},
  candidates:[
   {track:"Synthetic Downs",race_number:4,post_time_et:"5:40 PM ET",program_number:"11A",horse_name:"A Very Long Synthetic Horse Name For Mobile Wrap Testing",
    original_morning_line:"8/1",pwin_exact:1/6,pwin_display:16.7,fair_odds_display:"5/1",
    betting_case:"This purely synthetic QA fixture checks that a long race-specific explanation wraps without hiding any relevant price or runner data.",
    source_causal_evidence:"Fixture evidence is not a real handicapping claim.",counterargument_checked:"Fixture counterargument is not a real handicapping claim."},
   {track:"Synthetic Park",race_number:5,post_time_et:"2:10 PM ET",program_number:"2",horse_name:"Fixture Runner B",original_morning_line:"10/1",
    pwin_exact:.2,pwin_display:20,fair_odds_display:"4/1",
    betting_case:"This testing-only sentence validates the second card's structure and drawer navigation.",
    source_causal_evidence:"Synthetic evidence.",counterargument_checked:"Synthetic counterargument."}
  ]
 }]
};
const types={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp"};
const server=createServer((req,res)=>{
 const path=new URL(req.url,"http://localhost").pathname;
 if(path==="/api/admin/longshot-radar"){
  res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify(sample));return;
 }
 const pathname=(path==="/admin/longshot-radar/"||path==="/admin/longshot-radar")?"/admin/longshot-radar.html":(path==="/longshot-radar-preview"||path==="/longshot-radar-preview/")?"/longshot-radar-preview/index.html":path;
 const file=resolve(root,"."+pathname);
 if(!(file===root||file.startsWith(root+sep))){res.writeHead(403);res.end();return;}
 try{
  const data=readFileSync(file);
  res.writeHead(200,{"Content-Type":types[extname(file)]||"application/octet-stream"});res.end(data);
 }catch{res.writeHead(404);res.end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true});
 mkdirSync("test-artifacts",{recursive:true});
 for(const width of [320,375,390,430,768,1280]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  await page.goto("http://127.0.0.1:"+port+"/admin/longshot-radar/",{waitUntil:"domcontentloaded"});
  await page.locator(".rr-lr-card").first().waitFor({timeout:15000});
  const size=await page.evaluate(()=>({
   viewport:document.documentElement.clientWidth,
   pageWidth:document.documentElement.scrollWidth,
   bodyWidth:document.body.scrollWidth
  }));
  if(size.pageWidth>width+1||size.bodyWidth>width+1)throw Error("Horizontal overflow at "+width+": "+JSON.stringify(size));
  if(await page.locator(".rr-lr-card").count()!==2)throw Error("Missing full candidate coverage at "+width);
  if(!(await page.locator(".rr-lr-stage").innerText()).includes("INITIAL"))throw Error("Prescratch status missing at "+width);
  // Default ordering is chronological ACROSS tracks, not publication/source order.
  if(!(await page.locator(".rr-lr-card").first().innerText()).includes("Fixture Runner B"))throw Error("Global post-time order failed at "+width);
  await page.locator("#rr-lr-sort").selectOption("track");
  if(!(await page.locator(".rr-lr-card").first().innerText()).includes("A Very Long Synthetic"))throw Error("Track order failed at "+width);
  await page.locator("#rr-lr-sort").selectOption("post-time");
  if(!(await page.locator(".rr-lr-card").first().innerText()).includes("Fixture Runner B"))throw Error("Post-time switch did not restore chronological order at "+width);
  await page.screenshot({path:join("test-artifacts","longshot-"+width+".png"),fullPage:true});
  await page.getByRole("button",{name:/Read Longshot Radar analysis/}).first().click();
  if(!(await page.locator("#rr-lr-dialog").evaluate(el=>el.open)))throw Error("Details failed at "+width);
  await page.keyboard.press("Escape");
  if(await page.locator("#rr-lr-dialog").evaluate(el=>el.open))throw Error("Escape did not dismiss dialog at "+width);
  if(await page.locator(".rr-lr-card").count()!==2)throw Error("Daily source candidates disappeared after sorting at "+width);
  for(const img of await page.locator(".rr-review-artwork img").all()){
    const visible=await img.evaluate(el=>el.complete&&el.naturalWidth>0);
    if(!visible)throw Error("Approved Longshot publication image failed to load at "+width);
  }
  await page.locator("#rr-lr-demo-button").click();
  if(await page.locator(".rr-lr-card").count()!==3)throw Error("Private sample mode did not show 3 example rows at "+width);
  if(!(await page.locator("#rr-lr-demo-alert").innerText()).includes("FICTIONAL"))throw Error("Sample warning not visible at "+width);
  for(const chip of [1,11,20]){
    const found=await page.locator('.rr-lr-card img[src="/assets/approved/saddlecloths/'+chip+'.png"]').count();
    if(found<1)throw Error("Approved saddlecloth #"+chip+" missing from sample at "+width);
  }
  await page.screenshot({path:join("test-artifacts","longshot-sample-"+width+".png"),fullPage:true});
  await page.close();
 }
 // Publicly accessible DESIGN-ONLY website page must NOT request admin/purchased data.
 for(const width of [320,375,390,430,768,1280]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  const apiRequests=[],jsErrors=[];
  page.on("request",req=>{if(new URL(req.url()).pathname.startsWith("/api/"))apiRequests.push(req.url());});
  page.on("pageerror",err=>jsErrors.push(err.message));
  const response=await page.goto("http://127.0.0.1:"+port+"/longshot-radar-preview/",{waitUntil:"domcontentloaded"});
  if(response.status()!==200)throw Error("Design URL unavailable at "+width);
  await page.locator(".rr-lr-card").first().waitFor({timeout:15000});
  if(apiRequests.length)throw Error("Design preview contacted private API at "+width+": "+apiRequests.join(","));
  if(jsErrors.length)throw Error("Design preview JS failed at "+width+": "+jsErrors.join(","));
  if(await page.locator(".rr-lr-card").count()!==3)throw Error("Missing design-only sample rows at "+width);
  if(!((await page.locator("#rr-lr-demo-alert").innerText()).includes("FICTIONAL")))throw Error("No prominent fictional warning at "+width);
  if(!(await page.locator(".rr-lr-card").first().innerText()).includes("Sample Horse One"))throw Error("Design post time ordering failed at "+width);
  for(const chip of [1,11,20]){
   const el=page.locator('.rr-lr-card img[src="/assets/approved/saddlecloths/'+chip+'.png"]');
   if(await el.count()!==1||!(await el.first().evaluate(i=>i.complete&&i.naturalWidth>0)))throw Error("Real saddlecloth #"+chip+" missing at "+width);
  }
  for(const img of await page.locator(".rr-review-artwork img").all()){
   if(!(await img.evaluate(i=>i.complete&&i.naturalWidth>0)))throw Error("Real approved Radar artwork missing at "+width);
  }
  await page.locator("#rr-lr-sort").selectOption("track");
  if(!(await page.locator(".rr-lr-card").first().innerText()).includes("Example Horse Eleven"))throw Error("Design track ordering failed at "+width);
  const size=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,body:document.body.scrollWidth,page:document.documentElement.scrollWidth}));
  if(size.body>width+1||size.page>width+1)throw Error("Design preview horizontal overflow at "+width+": "+JSON.stringify(size));
  await page.getByRole("button",{name:/Read Longshot Radar analysis/}).first().click();
  if(!(await page.locator("#rr-lr-dialog").evaluate(el=>el.open)))throw Error("Design modal failed at "+width);
  await page.keyboard.press("Escape");
  if(await page.locator("#rr-lr-dialog").evaluate(el=>el.open))throw Error("Design modal Escape failed at "+width);
  await page.screenshot({path:join("test-artifacts","longshot-public-design-"+width+".png"),fullPage:true});
  await page.close();
 }
 console.log("PASS: public design-only preview at 320/375/390/430/768/1280 with real saddlecloth and brand art, interactive sorts, drawer, and ZERO admin API requests.");
 console.log("PASS: mobile 320/375/390/430, tablet 768 and desktop 1280, date-based daily cards, cross-track post-time/track order, dialog, Escape, no overflow.");
}finally{
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}

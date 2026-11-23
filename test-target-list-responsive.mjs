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
  conditions:"Allowance / Optional Claiming",analysis:"Synthetic full analysis — no real race results or paid recommendations.",
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
  // Verify chronological post-time order vs independent A–Z track grouping.
  const initialTimes=await page.locator(".rr-target-post").allTextContents();
  assert.deepEqual(initialTimes,["1:12 PM ET","2:20 PM ET","3:14 PM ET","3:26 PM ET","4:15 PM ET","8:40 PM ET","9:30 PM ET","9:55 PM ET"],"Post-time sort must ignore original rank at "+width);
  await page.locator("#rr-target-sort").selectOption("track");
  const grouped=await page.locator(".rr-target-racebar h3").allTextContents();
  assert.deepEqual(grouped,["Synthetic Downs","Synthetic Downs","Synthetic Downs","Synthetic Downs","Synthetic Park","Synthetic Park","Synthetic Park","Synthetic Park"],"Track ordering must group A–Z at "+width);
  await page.locator("#rr-target-sort").selectOption("post-time");
  assert.deepEqual(await page.locator(".rr-target-post").allTextContents(),initialTimes,"Chronological order must be independently restored at "+width);
  await page.getByRole("button",{name:/read race details for/i}).first().click();
  await page.locator("#rr-target-dialog[open]").waitFor();
  const detail=await page.locator("#rr-target-dialog").evaluate(el=>({
   width:el.getBoundingClientRect().width,
   right:el.getBoundingClientRect().right,
   max:document.documentElement.clientWidth
  }));
  assert.ok(detail.right<=detail.max+1,"Bottom drawer must not overflow at "+width);
  await page.screenshot({path:"target-list-viewport-screenshots/target-"+width+".png",fullPage:false});
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#rr-target-dialog").evaluate(el=>el.open),false,"Escape closes drawer at "+width);
  await page.close();
 }
 // Empty private R2 must still let an admin see a conspicuously synthetic design example.
 const preview=await browser.newPage({viewport:{width:390,height:850},deviceScaleFactor:1});
 await preview.route("**/api/admin/target-list",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({dates:[],edition:null})}));
 await preview.goto("http://127.0.0.1:"+port+"/admin/target-list-preview.html",{waitUntil:"domcontentloaded"});
 await preview.locator(".rr-target-card").first().waitFor({timeout:10000});
 assert.match(await preview.locator("#rr-target-review-banner").innerText(),/SYNTHETIC LAYOUT EXAMPLE/);
 assert.equal(await preview.locator(".rr-target-card").count(),3,"Empty source shows synthetic layouts, never a blank preview.");
 // A local review can be previewed without uploading it, issuing a POST or granting customer access.
 const localReview={...fixture.edition,review_only:true,customer_publish_approved:false,production_receipt_verified:false};
 localReview.targets=fixture.edition.targets.slice(0,2);
 const actions=[];
 preview.on("request",req=>{if(req.method()==="POST")actions.push(req.url());});
 await preview.locator("#rr-target-local-file").setInputFiles({
  name:"private-layout-review.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(localReview))
 });
 await preview.getByText("Local review loaded in this browser only.").waitFor();
 assert.equal(await preview.locator(".rr-target-card").count(),2);
 assert.match(await preview.locator("#rr-target-review-banner").innerText(),/NOT SCORER-CERTIFIED/);
 assert.deepEqual(actions,[],"Local review must never POST paid content or persist it to a server.");
 await preview.close();
 console.log("PASS: real browser Target List layouts at 320, 375, 390, 430, 768 and 1280px, protected sample and local-only data review.");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}

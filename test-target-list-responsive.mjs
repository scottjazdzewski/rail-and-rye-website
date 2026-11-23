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
  tier:index%2?"STRONG":"PRIME",post_time_et:"4:15 PM ET",surface:"Dirt",distance:"7 furlongs",
  conditions:"Allowance / Optional Claiming",analysis:"Synthetic full analysis — no real race results or paid recommendations.",
  favorite:runner("1",long,12),attack:runner(index===0?"12A":"20","A Wider Alternative Name",26),
  also_live:null,scratches:[]
 }))
}};
const base=resolve("public");
const contentType=path=>({".html":"text/html;charset=utf-8",".css":"text/css;charset=utf-8",".js":"text/javascript;charset=utf-8",".png":"image/png",".webp":"image/webp",".ico":"image/x-icon"}[extname(path)]||"application/octet-stream");
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,"http://localhost").pathname;
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
   const firstName=document.querySelector(".rr-target-runner-name strong");
   return {viewport,rootWidth,overflow,items:items.length,firstName:firstName?.textContent,firstWidth:firstName?.scrollWidth,firstClient:firstName?.clientWidth};
  });
  assert.equal(errors.length,0,"No browser JS errors at "+width+": "+errors.join("; "));
  assert.ok(stats.rootWidth<=stats.viewport+1,"No horizontal page overflow at "+width+": "+JSON.stringify(stats));
  assert.equal(stats.overflow,0,"Cards stay within viewport at "+width);
  assert.equal(stats.items,8,"All qualifying source targets appear at "+width);
  assert.equal(stats.firstName,long,"Long horse names retain their full text at "+width);
  await page.getByRole("button",{name:/read full analysis for/i}).first().click();
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
 console.log("PASS: real browser Target List layouts at 320, 375, 390, 430, 768 and 1280px with details and no horizontal clipping.");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}

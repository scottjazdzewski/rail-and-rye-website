/* Regression suite: actual source-shaped 10-horse private Radar, with no manual JSON.
 * Entirely synthetic test fixture. No purchased data goes into public assets.
 */
import {chromium} from "playwright";
import {createServer} from "node:http";
import {readFileSync,mkdirSync} from "node:fs";
import {resolve,join,extname,sep} from "node:path";
const root=resolve("public");
const names=["Fixture One","Fixture Two","Fixture Three","Fixture Four","Fixture Five","Fixture Six",
             "Fixture Seven","Fixture Eight","Fixture Nine","Fixture Ten"];
const horses=names.map((horse_name,i)=>({
 track:i%3===0?"Synthetic Downs":i%3===1?"Example Park":"Fictional Field",
 race_number:i+1,post_time_et:(i+1)+":25 PM ET",program_number:String([11,1,20,2,3,4,5,6,7,8][i]),
 horse_name,original_morning_line:"10/1",pwin_display:19.5,
 fair_odds_display:"4/1",
 betting_case:"A source-shaped fictional test sentence that must remain entirely visible on the racing card."
}));
const editorial={review_only:true,customer_publish_approved:false,
 source_type:"rail_rye_published_pdf",production_receipt_verified:false,
 edition:{race_date:"2026-11-23",revision:1,status:"published_pdf_reference",candidates:horses}};
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp"};
let simulateError=false;
const server=createServer((req,res)=>{
 const path=new URL(req.url,"http://localhost").pathname;
 if(path==="/api/admin/longshot-radar-editorial"){
  res.writeHead(simulateError?503:200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store"});
  res.end(JSON.stringify(simulateError?{error:"Source temporarily unavailable."}:editorial));return;
 }
 if(path.startsWith("/api/admin/")){res.writeHead(404);res.end("Unexpected private API called");return;}
 const pathname=(path==="/admin/longshot-radar/"||path==="/admin/longshot-radar")?
   "/admin/longshot-radar.html":(path==="/longshot-radar-preview/"||path==="/longshot-radar-preview")?
   "/longshot-radar-preview/index.html":path;
 const file=resolve(root,"."+pathname);
 if(!(file===root||file.startsWith(root+sep))){res.writeHead(403);res.end();return;}
 try{const bytes=readFileSync(file);res.writeHead(200,{"Content-Type":mime[extname(file)]||"application/octet-stream"});res.end(bytes);}
 catch{res.writeHead(404);res.end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port,base="http://127.0.0.1:"+port;
let browser;
try{
 browser=await chromium.launch({headless:true});
 mkdirSync("test-artifacts",{recursive:true});
 for(const width of [320,375,390,430,768,1280]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  const errors=[],calls=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",req=>{if(new URL(req.url()).pathname.startsWith("/api/"))calls.push(new URL(req.url()).pathname);});
  await page.goto(base+"/admin/longshot-radar/",{waitUntil:"domcontentloaded"});
  await page.locator(".rr-lr-card").first().waitFor({timeout:15000});
  const count=await page.locator(".rr-lr-card").count();
  if(count!==10)throw Error("Expected 10 published source-shaped horse rows at "+width+", got "+count);
  if(!(await page.locator(".rr-lr-stage").innerText()).includes("PUBLISHED CARD"))
   throw Error("Source publication status not shown at "+width);
  if(await page.locator("#rr-lr-loading").isVisible())throw Error("Loading status remained after cards appeared at "+width);
  if((await page.locator("body").innerText()).includes("Load a validated production JSON")||
     await page.locator('input[type="file"]').count()||
     await page.locator(".rr-lr-import").count())
    throw Error("User-facing JSON uploader remains at "+width);
  if(await page.getByRole("button",{name:/Race details/i}).count())
    throw Error("Analysis must not require a Race details button at "+width);
  const infos=await page.locator(".rr-lr-inline-analysis .rr-lr-case").allTextContents();
  if(infos.length!==10||infos.some(t=>!t.includes("entirely visible")))
    throw Error("All 10 editorial statements must be rendered inline at "+width);
  const analysisCss=await page.locator(".rr-lr-case").first().evaluate(el=>({
   font:parseFloat(getComputedStyle(el).fontSize),
   height:el.getBoundingClientRect().height,
   lines:parseFloat(getComputedStyle(el).lineHeight)
  }));
  if(analysisCss.font<14||analysisCss.height<analysisCss.lines)
    throw Error("Editorial text too small/hidden at "+width+": "+JSON.stringify(analysisCss));
  for(const chip of [1,11,20]){
   const img=page.locator('.rr-lr-card img[src="/assets/approved/saddlecloths/'+chip+'.png"]');
   if(await img.count()!==1||!(await img.first().evaluate(el=>el.complete&&el.naturalWidth>0)))
    throw Error("Canonical saddlecloth #"+chip+" missing/broken at "+width);
  }
  if(!((await page.locator(".rr-lr-card").first().innerText()).includes("Fixture One")))
    throw Error("Post-time ordering incorrect at "+width);
  await page.locator("#rr-lr-sort").selectOption("track");
  if(!((await page.locator(".rr-lr-card").first().innerText()).includes("Fixture Two")))
    throw Error("Track order incorrect at "+width);
  await page.locator("#rr-lr-sort").selectOption("post-time");
  const layout=await page.evaluate(()=>({page:document.documentElement.scrollWidth,body:document.body.scrollWidth,viewport:document.documentElement.clientWidth}));
  if(layout.page>width+1||layout.body>width+1)
    throw Error("Radar content overflow "+width+": "+JSON.stringify(layout));
  if(errors.length||calls.length!==1||calls[0]!=="/api/admin/longshot-radar-editorial")
    throw Error("Unexpected JS errors or calls "+width+": "+JSON.stringify({errors,calls}));
  await page.screenshot({path:join("test-artifacts","longshot-push-only-"+width+".png"),fullPage:true});
  await page.close();
 }
 // Recovery test: real data route fails once, page shows error+retry rather than
 // a permanent "Checking private Radar editions…" spinner or file uploader.
 simulateError=true;
 const errorPage=await browser.newPage({viewport:{width:375,height:760}});
 await errorPage.goto(base+"/admin/longshot-radar/",{waitUntil:"domcontentloaded"});
 await errorPage.locator("#rr-lr-retry:visible").waitFor({timeout:10000});
 if(!(await errorPage.locator("#rr-lr-loading").innerText()).includes("HTTP 503"))
  throw Error("R2 failure was not surfaced to the user.");
 simulateError=false;
 await errorPage.locator("#rr-lr-retry").click();
 await errorPage.locator(".rr-lr-card").first().waitFor({timeout:12000});
 if(await errorPage.locator(".rr-lr-card").count()!==10)
  throw Error("Retry failed to load ten actual-shaped horses.");
 if(await errorPage.locator("#rr-lr-loading").isVisible())
  throw Error("Retry succeeded but loading message remained.");
 await errorPage.close();
 // Old public link is just a redirect. No paid selections exposed outside admin.
 const publicPage=await browser.newPage();
 const raw=await publicPage.request.get(base+"/longshot-radar-preview/");
 const html=await raw.text();
 if(!html.includes('url=/admin/longshot-radar/')||html.includes("rr-lr-candidates")||html.includes("Fixture One"))
  throw Error("Public URL must redirect to private reader with no horse rows.");
 await publicPage.close();
 console.log("PASS: 320/375/390/430/768/1280 with ten source-shaped Radar horses, zero manual JSON, no stuck spinner, 503 recovery/retry, real saddlecloths and private public redirect.");
}finally{
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}

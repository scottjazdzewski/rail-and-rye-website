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
 ...(i===0?{distance:"6½ furlongs",surface:"Dirt",conditions:"Synthetic test conditions for fillies and mares three years old and upward, with a long eligibility sentence that must wrap naturally onto extra lines without clipping or reducing the original horse or analysis text size."}:{}),
 ...(i===1?{distance:"1 mile",surface:"Dirt",conditions:"FIRST LADY S. (G1) Presented by Venue Sponsor",stakes_grade:"G1",sponsor_name:"Venue Sponsor",is_stakes:true}:{}),
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
  // Exact same title authority as Projections: real DOM, not merely a regex.
  const graded=page.locator(".rr-lr-card").nth(1);
  const title=await graded.locator(".rr-lr-race-facts").innerText();
  if(!title.includes("First Lady Stakes")||/FIRST LADY S\\.|Venue Sponsor|Presented by/i.test(title))
   throw Error("Longshot Radar must publish full sponsor-free stakes names at "+width+": "+title);
  const trophy=graded.locator(".rr-ed-grade-trophy--g1");
  if(await trophy.count()!==1||await trophy.getAttribute("aria-label")!=="Grade 1 stakes trophy")
   throw Error("Graded Longshot Radar race must show verified G1 trophy at "+width);
  const count=await page.locator(".rr-lr-card").count();
  if(count!==10)throw Error("Expected 10 published source-shaped horse rows at "+width+", got "+count);
  if(!(await page.locator(".rr-dash-private-banner").innerText()).includes("PUBLISHED CARD"))
   throw Error("Single publication notice must retain published-card status at "+width);
  if(await page.locator("#rr-lr-stage,#rr-lr-date-title,#rr-lr-updated").count())
   throw Error("Redundant title/date/status blocks remained at "+width);
  if(await page.locator("#rr-lr-loading").isVisible())throw Error("Loading status remained after cards appeared at "+width);
  if((await page.locator("body").innerText()).includes("Load a validated production JSON")||
     await page.locator('input[type="file"]').count()||
     await page.locator(".rr-lr-import").count())
    throw Error("User-facing JSON uploader remains at "+width);
  // Shared Daily Research V1 — inspect actual rendered/feed DOM, not just CSS tokens.
  const visual=await page.evaluate(()=>{
    const el=s=>document.querySelector(s);
    const styles=s=>{const x=el(s);if(!x)return null;const c=getComputedStyle(x),b=x.getBoundingClientRect();
      return {font:parseFloat(c.fontSize),line:parseFloat(c.lineHeight),family:c.fontFamily,
        h:b.height,w:b.width,x:b.x,y:b.y,color:c.color,bg:c.backgroundColor,
        borderTop:c.borderTopWidth,borderTopColor:c.borderTopColor,
        radius:parseFloat(c.borderTopLeftRadius),
        whiteSpace:c.whiteSpace,display:c.display,clamp:c.webkitLineClamp,
        scrollH:x.scrollHeight,clientH:x.clientHeight,padding:parseFloat(c.paddingLeft)};};
    const nav=el(".rr-member-nav"),active=el('.rr-member-nav [aria-current="page"]');
    const nr=nav.getBoundingClientRect(),ar=active.getBoundingClientRect();
    return {
      logo:styles(".rr-member-brand img"),wordmark:styles(".rr-member-brand span"),
      nav:styles(".rr-member-nav"),tabs:[...nav.querySelectorAll("a")].map(a=>({
        font:parseFloat(getComputedStyle(a).fontSize),h:a.getBoundingClientRect().height,
        wrap:getComputedStyle(a).whiteSpace
      })),
      activeVisible:ar.left>=nr.left-1&&ar.right<=nr.right+1,
      navRows:new Set([...nav.querySelectorAll("a")].map(a=>Math.round(a.getBoundingClientRect().top))).size,
      title:styles(".rr-dash-heading .rr-member-title"),kicker:styles(".rr-member-kicker"),
      intro:styles(".rr-dash-intro"),notice:styles(".rr-dash-private-banner"),
      toolbar:styles(".rr-lr-toolbar"),select:styles(".rr-lr-toolbar select"),label:styles(".rr-lr-toolbar label"),
      count:styles("#rr-lr-count"),race:styles(".rr-lr-racebar"),track:styles(".rr-lr-racebar h3"),
      raceNumber:styles(".rr-lr-race-number"),post:styles(".rr-lr-post"),
      firstFacts:styles(".rr-lr-race-facts"),card:styles(".rr-lr-card"),
      chip:styles(".rr-lr-program img"),horse:styles(".rr-lr-identity strong"),
      ml:styles(".rr-lr-ml-inline"),win:styles(".rr-lr-model strong"),
      fair:styles(".rr-lr-fair strong"),numericLabel:styles(".rr-lr-market span"),
      markets:styles(".rr-lr-markets"),analysis:styles(".rr-lr-inline-analysis .rr-lr-case"),
      marketBoxes:[...el(".rr-lr-markets").children].map(x=>{const v=x.getBoundingClientRect();return {x:v.x,y:v.y,w:v.width,h:v.height};}),
      gaps:parseFloat(getComputedStyle(el(".rr-lr-candidates")).gap),
      main:styles(".rr-lr-main"),
      bodyWidth:document.body.scrollWidth,htmlWidth:document.documentElement.scrollWidth
    };
  });
  const approx=(x,y,t=.5)=>Math.abs(x-y)<=t;
  if(!approx(visual.logo.w,40)&&width<=900)throw Error("Logo must be 40px at "+width);
  if(width<=900&&!approx(visual.wordmark.font,18))throw Error("Brand wordmark not 18px at "+width);
  if(visual.navRows!==1||!visual.activeVisible)throw Error("All 5 tabs must be in one swipeable row with active visible at "+width);
  if(visual.tabs.length!==5||visual.tabs.some(t=>t.h<39.9||t.font<11.9||t.wrap!=="nowrap"))
    throw Error("Five readable 12px, 40px navigation buttons required at "+width+": "+JSON.stringify(visual.tabs));
  if(width<=430&&(!approx(visual.title.font,28)||visual.kicker.font<10.9||visual.intro.font<12.9))
    throw Error("Mobile title/kicker/intro typographic scale mismatch at "+width);
  if(visual.select.h<41.9||visual.select.font<14.9||visual.label.font<11.9||visual.count.font<15.9)
    throw Error("Date/sort controls or immediate summary too small at "+width);
  if(visual.race.bg!=="rgb(16, 45, 83)"||!approx(parseFloat(visual.race.borderTop),3)||
    visual.race.borderTopColor!=="rgb(201, 152, 49)")
    throw Error("Navy #102d53 / 3px antique gold header required at "+width);
  if(visual.track.font<16.9||visual.raceNumber.font<12.9||visual.post.font<12.9||visual.firstFacts.font<13.9)
    throw Error("Race title/time/original source facts illegible at "+width);
  if(visual.chip.w<33.9||visual.chip.w>36.1||visual.horse.font<16.9||visual.ml.font<13.9)
    throw Error("Approved chip / horse / ML minimum typography violated at "+width);
  if(visual.win.font<24.9||visual.fair.font<21.9||visual.numericLabel.font<10.9)
    throw Error("WIN/FAIR numbers or labels too small at "+width);
  if(visual.analysis.font<16.9||visual.analysis.line/visual.analysis.font<1.49||
      visual.analysis.scrollH>visual.analysis.clientH+2||visual.analysis.clamp!=="none"&&visual.analysis.clamp!=="unset")
    throw Error("Full 17px source analysis hidden/truncated at "+width+": "+JSON.stringify(visual.analysis));
  if(!approx(visual.gaps,8)||!approx(visual.card.radius,7))
    throw Error("8px row spacing and 7px card corners required at "+width);
  const [winBox,fairBox]=visual.marketBoxes;
  const marketsShareRow=winBox&&fairBox&&winBox.x+winBox.w<=fairBox.x+1&&
    Math.min(winBox.y+winBox.h,fairBox.y+fairBox.h)-Math.max(winBox.y,fairBox.y)>5;
  if(!marketsShareRow||
    visual.markets.bg!=="rgba(0, 0, 0, 0)"&&visual.markets.bg!=="rgb(255, 255, 255)")
    throw Error("WIN + FAIR must stay right-aligned on the same row without a gray box at "+width+": "+
      JSON.stringify({boxes:visual.marketBoxes,bg:visual.markets.bg}));
  if(width<=430&&(visual.main.padding<9.9||visual.main.padding>12.1))
    throw Error("Main left/right mobile padding must be 10–12px at "+width);
  if(visual.bodyWidth>width+1||visual.htmlWidth>width+1)
    throw Error("Shared V1 horizontal overflow outside swipe nav at "+width);
  if(await page.locator(".rr-lr-card .rr-lr-race-facts").count()!==1)
    throw Error("Only source-supplied race facts should appear, never invented filler at "+width);
  const raceFacts=await page.locator(".rr-lr-card .rr-lr-race-facts").first().evaluate(el=>{
    const cs=getComputedStyle(el),r=el.getBoundingClientRect();
    return {text:el.textContent,font:parseFloat(cs.fontSize),
      line:parseFloat(cs.lineHeight),height:r.height,
      scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
      whitespace:cs.whiteSpace};
  });
  if(!raceFacts.text.includes("6½ furlongs · Dirt · Synthetic test conditions for fillies")||
    !raceFacts.text.endsWith("original horse or analysis text size.")||
    raceFacts.font<13.9||raceFacts.scrollHeight>raceFacts.clientHeight+2||
    (width<=430&&raceFacts.height<raceFacts.line*2-1))
   throw Error("Full source race conditions must wrap at 14px on navy header without clipping at "+width+": "+JSON.stringify(raceFacts));
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
  if(analysisCss.font<14||analysisCss.height+0.1<analysisCss.lines)
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
 console.log("PASS: Shared Daily Research V1 Radar at 320/375/390/430/768/1280, 5 swipeable 40px tabs, 40px logo, 17px intact analysis, 25px WIN/22px FAIR, source race facts, zero manual JSON, and R2 retry.");
}finally{
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}

/* Mobile-first viewport regression for the real Projections reader.
   Synthetic race fixtures exist in CI only and are never published. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync,mkdirSync} from "node:fs";
import {resolve,extname,sep} from "node:path";
import {chromium} from "playwright";

const fixture={cards:[{
 race_date:"2026-11-23",track:"Del Mar",uploaded_at:"2026-11-23T18:10:00Z",
 card:{track_name:"Del Mar",projection_status:"scratch_final",races:[{
  race_number:4,post_time_et:"3:15 PM ET",conditions:"Claiming $10,000",
  purse:"$25,000",surface:"Dirt",distance:"6 F",pace:"Moderate",
  entries:[
   {program_number:"1",horse_name:"Example Runner",morning_line:"5-2",
    win_probability:38.6,win_probability_exact:38.6,fair_odds:"1.59/1",metrics:[]},
   {program_number:"2",horse_name:"Second Runner",morning_line:"4-1",
    win_probability:21.3,win_probability_exact:21.3,fair_odds:"3.69/1",metrics:[]}
  ],scratches:[]
 }]}
}]};
fixture.cards[0].card.races.push({
 ...fixture.cards[0].card.races[0],race_number:5,pace:"Strong",
 scratches:[{program_number:"6",horse_name:"Scratch Six"},
 {program_number:"7",horse_name:"Scratch Seven"},
 {program_number:"9",horse_name:"Scratch Nine"}],scratch_count:3
});
const root=resolve("public");
const types={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",
 ".css":"text/css;charset=utf-8",".png":"image/png",".svg":"image/svg+xml",".jpg":"image/jpeg",
 ".jpeg":"image/jpeg",".webp":"image/webp",".ico":"image/x-icon"};
const server=createServer((req,res)=>{
 const route=new URL(req.url,"http://localhost").pathname;
 if(route==="/api/admin/projections-preview"){
  res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(fixture));return;
 }
 const relative=route==="/admin/projections-preview/"?"admin/projections-preview.html":route.replace(/^\/+/,"");
 const file=resolve(root,relative);
 if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 try{
  res.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream"});
  res.end(readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url="http://127.0.0.1:"+server.address().port+"/admin/projections-preview/";
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 mkdirSync("test-artifacts",{recursive:true});
 for(const width of [320,360,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  const errors=[];page.on("pageerror",e=>errors.push(String(e.message)));
  await page.route("https://fonts.googleapis.com/**",r=>r.abort());
  await page.route("https://fonts.gstatic.com/**",r=>r.abort());
  await page.goto(url,{waitUntil:"domcontentloaded"});
  const triplet=page.locator("#rr-dash-race .rr-dash-race-tiles");
  await triplet.waitFor({state:"visible",timeout:15000});
  const headerNoScratches=await page.locator("#rr-dash-race .rrp-race-head").evaluate(el=>el.getBoundingClientRect().height);
  const firstRunnerTop=await page.locator("#rr-dash-horses .rr-dash-runner-row").first().evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(firstRunnerTop < 805,"First projection should start before y=805 at "+width+": "+firstRunnerTop);
  assert.equal(await page.locator(".rrp-command").count(),1,"The navigation exists as one integrated deck");
  assert.equal(await page.locator("#rr-dash-track-identity .rrp-track-head").count(),1,"No duplicate track masthead");
  assert.match(await page.locator("#rr-dash-race .rrp-race-head__scratch-bar").innerText(),/NO SCRATCHES LISTED/);
  const result=await page.evaluate(()=>{
   const tiles=[...document.querySelectorAll("#rr-dash-race .rr-dash-race-tile")];
   const viewport=document.documentElement.clientWidth;
   const triplet=document.querySelector("#rr-dash-race .rr-dash-race-tiles");
   return {
    viewport,documentWidth:document.documentElement.scrollWidth,
    strip:triplet.getBoundingClientRect().toJSON(),
    stripGrid:getComputedStyle(triplet).gridTemplateColumns.split(" ").length,
    labels:tiles.map(x=>x.querySelector(".rr-dash-tile-label")?.textContent),
    values:tiles.map(x=>x.querySelector(".rr-dash-tile-value")?.textContent),
    tiles:tiles.map(x=>{
     const rect=x.getBoundingClientRect(),img=x.querySelector(".rr-dash-tile-mark img");
     const badge=img?.getBoundingClientRect();
     const value=x.querySelector(".rr-dash-tile-value");
     return {rect:rect.toJSON(),textAlign:getComputedStyle(x).textAlign,
      flexDirection:getComputedStyle(x).flexDirection,imgSrc:img?.getAttribute("src"),
      badgeWidth:badge?.width,badgeHeight:badge?.height,
      badgeCenter:badge?(badge.left+badge.right)/2:null,
      center:(rect.left+rect.right)/2,loaded:!!img?.naturalWidth,
      valueFits:!!value&&value.scrollWidth<=value.clientWidth+1};
    }),
    extraneousNote:!!document.querySelector(".rr-dash-factor-origin-note,.rr-dash-race-summary"),
     tripletHeight:triplet.getBoundingClientRect().height
   };
  });
  assert.deepEqual(errors,[],"No JavaScript errors at "+width);
  assert.deepEqual(result.labels,["Pace","Surface","Distance"],"Equal-order fact tiles at "+width);
  assert.deepEqual(result.values,["Moderate","Dirt","6 F"],"Readable value labels at "+width);
  assert.equal(result.stripGrid,3,"Three centered columns at "+width);
  assert.ok(result.documentWidth<=result.viewport+1,"No horizontal overflow at "+width);
  assert.equal(result.extraneousNote,false,"No old model or calculation explanation");
  assert.ok(result.tripletHeight<=72,"Slim composite race facts at "+width+": "+result.tripletHeight);
  const expected=["fact_pace_moderate.png","fact_surface_dirt.png","fact_distance.png"];
  for(let i=0;i<3;i++){
   const tile=result.tiles[i];
   assert.equal(tile.loaded,true,"Approved badge image loads at "+width+": "+expected[i]);
   assert.ok(tile.imgSrc.endsWith(expected[i]),"Exact approved badge selected at "+width);
   assert.equal(tile.flexDirection,"column","Center-stack label and badge at "+width);
   assert.equal(tile.textAlign,"center","Text is centered at "+width);
   assert.ok(Math.abs(tile.badgeCenter-tile.center)<=2.1,"Image is centered at "+width);
   assert.ok(tile.badgeWidth<=55&&tile.badgeHeight<=50,"Badge is compact at "+width);
   assert.equal(tile.valueFits,true,"No value clipping at "+width);
   if(i)assert.ok(Math.abs(tile.rect.width-result.tiles[0].rect.width)<=1.1,"All tiles equal width at "+width);
  }
  await triplet.screenshot({path:"test-artifacts/race-facts-mobile-"+width+".png"});
  await page.locator(".rrp-command").screenshot({path:"test-artifacts/compact-navigation-"+width+".png"});
  await page.screenshot({path:"test-artifacts/projections-first-runner-"+width+".png",fullPage:false});
  await page.locator('#rr-dash-races .rr-dash-race-button[data-race-number="5"]').click();
  await page.locator("#rr-dash-race .rrp-race-head__scratch-count").getByText("3 SCRATCHES").waitFor();
  const headerWithScratches=await page.locator("#rr-dash-race .rrp-race-head").evaluate(el=>el.getBoundingClientRect().height);
  assert.ok(Math.abs(headerNoScratches-headerWithScratches)<=1.1,
   "Scratch/no-scratch headers must be equal at "+width+": "+headerNoScratches+" vs "+headerWithScratches);
  const watch=await page.locator('.rr-dash-race-tile[data-fact="pace"][data-value="strong"] img').evaluate(el=>({
   filter:getComputedStyle(el).filter,maxWidth:parseFloat(getComputedStyle(el).maxWidth)
  }));
  const surface=await page.locator('.rr-dash-race-tile[data-fact="surface"] img').evaluate(el=>({
   maxWidth:parseFloat(getComputedStyle(el).maxWidth)
  }));
  assert.equal(watch.filter,"none","No destructive whole-image filter on Strong pace watch at "+width);
  assert.ok((await page.locator('.rr-dash-race-tile[data-fact="pace"][data-value="strong"] img').getAttribute("src")).endsWith("fact_pace_strong_forest.svg"),
   "Use the selective green asset, preserving neutral face and hands");
  const img=await page.locator('.rr-dash-race-tile[data-fact="pace"][data-value="strong"] img').evaluate(async el=>{
   await el.decode();
   return {width:el.naturalWidth,height:el.naturalHeight};
  });
  assert.ok(img.width===145&&img.height===135,"Original stopwatch has correct dimensions and loaded image at "+width);
  assert.ok(watch.maxWidth<surface.maxWidth,"Stopwatch optically smaller than track badge at "+width);
  assert.equal(await page.locator(".rrp-race-head__scratch-chip img").count(),3,
   "All genuine scratched saddlecloths remain visible");
  const laneHeight=await page.locator(".rrp-race-head__scratch-bar").evaluate(el=>el.getBoundingClientRect().height);
  assert.ok(laneHeight<=40.1,"Scratch lane stays compact at "+width);
  await page.locator(".rrp-race-head__scratch-bar").screenshot({path:"test-artifacts/race-scratches-mobile-"+width+".png"});
  await page.close();
  console.log("PASS centered Pace/Surface/Distance art at "+width+"px");
 }
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
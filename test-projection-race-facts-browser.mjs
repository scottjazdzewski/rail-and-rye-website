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
const root=resolve("public");
const types={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",
 ".css":"text/css;charset=utf-8",".png":"image/png",".jpg":"image/jpeg",
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
    extraneousNote:!!document.querySelector(".rr-dash-factor-origin-note,.rr-dash-race-summary")
   };
  });
  assert.deepEqual(errors,[],"No JavaScript errors at "+width);
  assert.deepEqual(result.labels,["Pace","Surface","Distance"],"Equal-order fact tiles at "+width);
  assert.deepEqual(result.values,["Moderate","Dirt","6 F"],"Readable value labels at "+width);
  assert.equal(result.stripGrid,3,"Three centered columns at "+width);
  assert.ok(result.documentWidth<=result.viewport+1,"No horizontal overflow at "+width);
  assert.equal(result.extraneousNote,false,"No old model or calculation explanation");
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
  await page.close();
  console.log("PASS centered Pace/Surface/Distance art at "+width+"px");
 }
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
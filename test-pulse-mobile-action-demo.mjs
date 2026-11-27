// Rail & Rye — owner-only recording of actual source-backed mobile UI.
// Uses real homepage Pulse scripts/styles, no production edits, no private R2.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,renameSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const fixture=JSON.parse(readFileSync('research/pulse/2026-11-26-candidate-preview.json','utf8'));
assert.equal(fixture.items.length,3);
const publicRoot=resolve('public');
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8',
'.css':'text/css;charset=utf-8','.png':'image/png','.ico':'image/x-icon',
'.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/api/race-day-pulse'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(fixture));return;
  }
  if(path.startsWith('/api/')){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({products:[]}));return;
  }
  const file=resolve(publicRoot,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(publicRoot+'/')){res.writeHead(403);res.end();return;}
  try{res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
mkdirSync('pulse-mobile-action-demo',{recursive:true});
let browser,context;
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
try{
 browser=await chromium.launch({headless:true});
 context=await browser.newContext({
   viewport:{width:390,height:844},deviceScaleFactor:1,
   isMobile:true,hasTouch:true,acceptDownloads:true,
   recordVideo:{dir:'pulse-mobile-action-demo',size:{width:390,height:844}}
 });
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 await page.locator('.rr-pulse-item').first().waitFor({timeout:15000});
 await page.locator('.rr-pulse-saddle img').first().evaluate(e=>e.decode());
 const pos=await page.locator('#rr-pulse').boundingBox();
 assert.ok(pos&&pos.height<220,'Actual mobile Pulse should remain under 220px: '+JSON.stringify(pos));
 assert.equal(await page.locator('.rr-pulse-scratch-name').count(),0);
 assert.match(await page.locator('.rr-pulse-track').first().innerText(),/12TH/);
 await page.addStyleTag({content:'.rr-demo-tap{position:fixed;left:-100px;top:-100px;width:40px;height:40px;border:3px solid #f4c45e;border-radius:50%;background:rgba(242,206,135,.3);pointer-events:none;z-index:2147483600;transform:translate(-50%,-50%);box-shadow:0 0 0 6px rgba(15,38,57,.27);opacity:0;transition:opacity .16s;}'});
 await page.evaluate(()=>{let el=document.createElement('div');el.className='rr-demo-tap';document.body.append(el)});
 async function tap(locator){
   const b=await locator.boundingBox();assert.ok(b,'Control must be in viewport');
   await page.evaluate(({x,y})=>{
     const mark=document.querySelector('.rr-demo-tap');
     mark.style.left=x+'px';mark.style.top=y+'px';mark.style.opacity='1';
   },{x:b.x+b.width/2,y:b.y+b.height/2});
   await sleep(180);
   await locator.click({force:true});
   await sleep(160);
   await page.evaluate(()=>{document.querySelector('.rr-demo-tap').style.opacity='0'});
 }
 await sleep(950);
 await page.evaluate(()=>window.scrollTo({top:document.querySelector('#rr-pulse').offsetTop-120,behavior:'smooth'}));
 await sleep(1400);
 await page.screenshot({path:'pulse-mobile-action-demo/start.png'});
 await sleep(650);
 await tap(page.locator('#rr-pulse-next'));
 await sleep(1300);
 await page.screenshot({path:'pulse-mobile-action-demo/race-5.png'});
 await tap(page.locator('#rr-pulse-next'));
 await sleep(1300);
 await page.screenshot({path:'pulse-mobile-action-demo/race-9.png'});
 await tap(page.locator('#rr-pulse-prev'));
 await sleep(780);
 await tap(page.locator('#rr-pulse-prev'));
 await sleep(800);
 await tap(page.locator('.rr-pulse-tool').first());
 await sleep(950);
 await page.screenshot({path:'pulse-mobile-action-demo/share-options.png'});
 assert.ok(await page.locator('.rr-pulse-menu').first().isVisible(),'Real manual Share menu opens');
 await tap(page.locator('.rr-pulse-tool').first());
 await sleep(600);
 await page.screenshot({path:'pulse-mobile-action-demo/finish.png'});
 assert.deepEqual(errors,[]);
 console.log('MOBILE_PULSE_ACTUAL_INTERACTION_PASS mobileHeight='+pos.height+
  ' three_source_backed_races=true buttons_clicked=true sharing_menu_verified=true live_changes=0');
 const video=page.video();
 await page.close();await context.close();
 const saved=await video.path();
 renameSync(saved,'pulse-mobile-action-demo/rail-rye-pulse-mobile-demo.webm');
 context=null;
}finally{
 if(context)await context.close().catch(()=>{});
 if(browser)await browser.close().catch(()=>{});
 await new Promise(done=>server.close(done));
}

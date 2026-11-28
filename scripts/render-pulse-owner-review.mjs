// Owner-only browser review: exact website files, sanitized certified feed,
// no public deployment, no fake runners, no full-field source payloads.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium,webkit} from 'playwright';
const folder=process.env.PULSE_PRIVATE_REHEARSAL_DIR;
const feed=JSON.parse(fs.readFileSync(path.join(folder,'2026-11-27.json'),'utf8'));
assert.equal(feed.status,'ok');
const candidates=feed.items.filter(i=>/^\d+$/.test(i.chip)&&i.scratches.every(s=>/^\d+$/.test(s.program)));
const first=candidates.find(i=>/kehoe beach/i.test(i.horse))||candidates.find(i=>i.kind==='NEW_FAVORITE')||candidates[0];
assert.ok(first,'No certified sample available');
const review={...feed,items:[first,...feed.items.filter(x=>x.id!==first.id)]};
const root=path.resolve('public'),out=path.resolve('pulse-owner-review');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(p==='/api/race-day-pulse'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(review));}
 if(p==='/api/products'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"products":[]}');}
 const file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}
 try{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
try{
 for(const [type,name,viewport] of [[webkit,'mobile',{width:390,height:700}],[chromium,'desktop',{width:1440,height:900}]]){
  const browser=await type.launch();
  try{
   const page=await browser.newPage({viewport,deviceScaleFactor:2,isMobile:name==='mobile',hasTouch:name==='mobile',reducedMotion:'reduce'});
   await page.goto(origin+'/');await page.locator('.rr-pulse-item').first().waitFor();
   await page.evaluate(()=>document.fonts.ready);
   await page.locator('.rr-pulse-item').first().locator('img').first().evaluate(i=>i.decode());
   await page.waitForFunction(()=>{const r=document.querySelector('#rr-pulse-rail'),c=r.firstElementChild;return Math.abs(c.getBoundingClientRect().left-r.getBoundingClientRect().left)<1.5&&c.getBoundingClientRect().right<=r.getBoundingClientRect().right+1.5;});
   await page.evaluate(()=>window.scrollTo(0,0));
   const geometry=await page.evaluate(()=>{const p=document.querySelector('#rr-pulse').getBoundingClientRect(),rail=document.querySelector('#rr-pulse-rail'),a=rail.children[0].getBoundingClientRect(),b=rail.children[1].getBoundingClientRect();return {pulseBottom:p.bottom,viewport:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,firstContained:a.left>=rail.getBoundingClientRect().left-1.5&&a.right<=rail.getBoundingClientRect().right+1.5,nextHidden:b.left>=rail.getBoundingClientRect().right-1.5}});
   assert.ok(!geometry.overflow&&geometry.firstContained&&geometry.nextHidden,JSON.stringify(geometry));
   if(name==='mobile')assert.ok(geometry.pulseBottom<=viewport.height+1,JSON.stringify(geometry));
   await page.screenshot({path:path.join(out,name+'.png')});
   await page.screenshot({path:path.join(out,name+'-full.png'),fullPage:true});
   if(name==='desktop'){
    await page.waitForFunction(()=>typeof globalThis.RRPulseRenderImage==='function'&&typeof globalThis.RRRaceTitles?.formatFairOdds==='function');
    for(const [format,file,w,h] of [['landscape','x.png',1200,675],['portrait','instagram.png',1080,1350]]){
     const bytes=Buffer.from(await page.evaluate(async ({item,format})=>Array.from(new Uint8Array(await (await globalThis.RRPulseRenderImage(item,format)).arrayBuffer())),{item:first,format}));
     assert.equal(bytes.readUInt32BE(16),w);assert.equal(bytes.readUInt32BE(20),h);fs.writeFileSync(path.join(out,file),bytes);
    }
   }
   console.log('OWNER_REVIEW_PASS',name,JSON.stringify(geometry));
  }finally{await browser.close();}
 }
}finally{await new Promise(r=>server.close(r));}

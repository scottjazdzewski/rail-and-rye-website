// Owner-only screenshots of REAL-source-qualified Pulse candidates.
// Does not call private TRI/R2, publish to site, or create a live link.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const data=JSON.parse(readFileSync('research/pulse/2026-11-26-candidate-preview.json','utf8'));
assert.equal(data.items.length,3);
const dir=resolve('public');
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.png':'image/png','.ico':'image/x-icon','.jpg':'image/jpeg'};
const server=createServer((req,res)=>{
 const {pathname}=new URL(req.url,'http://localhost');
 if(pathname==='/api/race-day-pulse'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return;}
 if(pathname==='/api/products'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({products:[]}));return;}
 const file=resolve(dir,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dir+'/')){res.writeHead(403);res.end();return;}
 try{res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));}
 catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
mkdirSync('pulse-source-preview',{recursive:true});
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.abort());
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('.rr-pulse-item').first().waitFor({timeout:12000});
  assert.equal(await page.locator('.rr-pulse-item').count(),4,'Three real candidates plus Hub link, no synthetic extras');
  assert.deepEqual(errors,[]);
  const imgs=page.locator('.rr-pulse-item:first-child .rr-pulse-saddle img');
  await imgs.first().evaluate(img=>img.decode());
  const style=await page.locator('.rr-pulse-item:first-child .rr-pulse-saddle').first().evaluate(el=>{
    const cs=getComputedStyle(el),img=getComputedStyle(el.querySelector('img'));
    return {background:cs.backgroundColor,opacity:cs.opacity,blend:img.mixBlendMode};
  });
  assert.equal(style.background,'rgb(255, 255, 255)');
  assert.equal(style.opacity,'1');
  assert.equal(style.blend,'normal');
  for(let i=0;i<3;i++){
    await page.locator('#rr-pulse-rail').evaluate((rail,index)=>{
      const el=rail.children[index];rail.scrollLeft=el.offsetLeft-rail.offsetLeft;
    },i);
    await page.waitForTimeout(300);
    const result=await page.locator('.rr-pulse-item').nth(i).evaluate(el=>{
      const r=el.getBoundingClientRect(),p=el.querySelector('.rr-pulse-message').getBoundingClientRect(),
       f=el.querySelector('.rr-pulse-item-footer').getBoundingClientRect();
      return {w:r.width,h:r.height,readable:p.bottom<=f.top+2,horse:el.querySelector('.rr-pulse-affected')?.textContent};
    });
    assert.ok(result.readable,'Narrative must not overlap footer '+JSON.stringify(result));
    if(width===390){
      await page.locator('.rr-pulse-item').nth(i).screenshot({path:'pulse-source-preview/mobile-race-'+data.items[i].race_number+'.png'});
    }
  }
  await page.locator('#rr-pulse-rail').evaluate(el=>el.scrollLeft=0);
  await page.waitForTimeout(250);
  await page.locator('#rr-pulse').screenshot({path:'pulse-source-preview/rail-'+width+'.png'});
  if(width===390){
    await page.locator('.rr-pulse-tool').first().click();
    const wait=page.waitForEvent('download',{timeout:15000});
    await page.locator('.rr-pulse-menu button').filter({hasText:'Save image'}).first().click();
    const dl=await wait;
    await dl.saveAs('pulse-source-preview/verified-race-12-share.png');
  }
  await page.close();
 }
 console.log('SOURCE-QUALIFIED PULSE PREVIEW PASS: three Churchill examples, actual saddle chips, 390/1280 screenshots, share PNG');
}finally{
 if(browser)await browser.close();
 await new Promise(r=>server.close(r));
}

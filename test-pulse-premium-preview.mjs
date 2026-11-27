import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const code=readFileSync('staging/pulse-preview-worker.js','utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const root=resolve('public');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp'};
const env={ASSETS:{async fetch(req){const p=resolve(root,'.'+new URL(req.url).pathname);if(!p.startsWith(root+'/'))return new Response('No',{status:403});try{return new Response(readFileSync(p),{headers:{'Content-Type':mime[extname(p)]||'application/octet-stream'}})}catch{return new Response('Not found',{status:404})}}}};
const server=createServer(async(req,res)=>{try{const r=await worker.fetch(new Request('http://localhost'+req.url,{method:req.method}),env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))}catch(e){res.writeHead(500);res.end(String(e))}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;mkdirSync('pulse-premium-preview',{recursive:true});
try{
 browser=await chromium.launch({headless:true});
 const base='http://127.0.0.1:'+server.address().port;
 const fixture=await (await fetch(base+'/api/race-day-pulse')).json();assert.equal(fixture.preview,true);assert.equal(fixture.items.length,4);
 assert.equal((await worker.fetch(new Request(base+'/api/race-day-pulse',{method:'POST'}),env)).status,405);
 for(const width of [320,375,390,430,768,1280,1440]){
  const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.abort());
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.locator('.rr-pulse-item').first().waitFor();
  assert.equal(await page.locator('.rr-pulse-item').count(),5);
  assert.equal(await page.locator('.rr-pulse-signal svg').count(),4);
  assert.ok((await page.locator('.rr-pulse-signal').allTextContents()).every(x=>x.trim()===''),'Icon only');
  assert.equal(await page.locator('.rr-pulse-numbers').count(),4);
  assert.equal(await page.locator('.rr-pulse-context-cell').count(),8);
  assert.equal(await page.locator('.rr-pulse-pace-comparison').count(),1);
  assert.ok(await page.locator('.rr-pulse-logo').evaluate(x=>x.decode().then(()=>x.naturalWidth>0)));
  assert.deepEqual(errors,[]);
  const geometry=await page.evaluate(()=>{const p=document.querySelector('#rr-pulse').getBoundingClientRect(),h=document.querySelector('.heritage-hero').getBoundingClientRect();return {height:p.height,top:p.top,bottom:p.bottom,heroBottom:h.bottom,page:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}});
  console.log('PREMIUM_GEOMETRY',width,JSON.stringify(geometry));
  await page.screenshot({path:'pulse-premium-preview/homepage-'+width+'.png'});
  if(width===390){await page.locator('#rr-pulse').screenshot({path:'pulse-premium-preview/mobile-pulse.png'});await page.locator('.rr-pulse-tool').first().click();const download=page.waitForEvent('download');await page.locator('.rr-pulse-menu button').filter({hasText:'Instagram image'}).first().click();await (await download).saveAs('pulse-premium-preview/instagram.png');}
  assert.ok(geometry.page<=geometry.viewport+1,'No page overflow');
  if(width>=1121)assert.ok(geometry.bottom<=geometry.heroBottom+2,'Desktop Pulse fits hero');
  else assert.ok(geometry.top>=geometry.heroBottom-1,'Mobile Pulse below hero');
  if(width<=390)assert.ok(geometry.height<=240,'Compact mobile Pulse including optional context');
  await page.close();
 }
 console.log('PREMIUM_PREVIEW_PASS');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}

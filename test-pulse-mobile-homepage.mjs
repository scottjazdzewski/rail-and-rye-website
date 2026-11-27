// Actual homepage, actual CSS/JS and isolated preview worker; no production writes.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync('staging/pulse-preview-worker.js','utf8')).toString('base64'));
const root=resolve('public'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'};
const env={ASSETS:{async fetch(req){const p=resolve(root,'.'+new URL(req.url).pathname);if(!p.startsWith(root+'/'))return new Response(null,{status:403});try{return new Response(req.method==='HEAD'?null:readFileSync(p),{headers:{'Content-Type':mime[extname(p)]||'application/octet-stream'}})}catch{return new Response(null,{status:404})}}}};
let empty=false;
const server=createServer(async(req,res)=>{try{const r=empty&&req.url==='/api/race-day-pulse'?Response.json({items:[]}):await worker.fetch(new Request('http://localhost'+req.url,{method:req.method}),env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))}catch(e){res.writeHead(500);res.end(String(e))}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
mkdirSync('pulse-mobile-homepage',{recursive:true});
try{
 for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch();
  try{
   for(const [width,height] of [[320,568],[375,667],[390,700],[430,780]]){
    const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    // Use the actual homepage typeface for the fold check; do not force Georgia fallback.
    const base='http://127.0.0.1:'+server.address().port;
    await page.goto(base+'/');await page.locator('.rr-pulse-item').first().waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.rr-pulse-item').first().locator('.rr-pulse-saddle img').first().evaluate(x=>x.decode());
    const count=await page.locator('.rr-pulse-item').count();assert.equal(count,4);
    for(let i=0;i<count;i++){
     if(i)await page.locator('#rr-pulse-next').click();
     await page.waitForFunction(i=>{const rail=document.querySelector('#rr-pulse-rail'),c=rail.children[i];return Math.abs(c.getBoundingClientRect().left-rail.getBoundingClientRect().left)<3},i);
     const g=await page.evaluate(i=>{const hero=document.querySelector('.heritage-hero'),pulse=document.querySelector('#rr-pulse'),body=document.querySelector('.heritage-body'),rail=document.querySelector('#rr-pulse-rail'),card=rail.children[i],r=rail.getBoundingClientRect(),c=card.getBoundingClientRect();return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,placement:hero.nextElementSibling===pulse&&pulse.nextElementSibling===body,heroBottom:hero.getBoundingClientRect().bottom,pulseTop:pulse.getBoundingClientRect().top,pulseBottom:pulse.getBoundingClientRect().bottom,bodyTop:body.getBoundingClientRect().top,fold:innerHeight,previewBanner:document.querySelector('body>div[role="status"]')?.getBoundingClientRect().height||0,height:pulse.getBoundingClientRect().height,headerVisible:hero.querySelector('header').getBoundingClientRect().bottom<=hero.getBoundingClientRect().bottom,memberVisible:hero.querySelector('.rr-home-membership-link').getBoundingClientRect().bottom<=hero.getBoundingClientRect().bottom,cardContained:c.left>=r.left-3&&c.right<=r.right+3&&c.bottom<=r.bottom+3,actions:[...card.querySelectorAll('.rr-pulse-compact-open')].map(x=>{const b=x.getBoundingClientRect();return {height:b.height,contained:b.left>=c.left&&b.right<=c.right&&b.bottom<=c.bottom}}),badge:card.querySelector('.rr-pulse-signal').getBoundingClientRect().width}},i);
     assert.ok(g.headerVisible&&g.memberVisible&&g.placement&&g.pulseTop>=g.heroBottom-1&&g.bodyTop>=g.pulseBottom-1,JSON.stringify(g));
     assert.ok(g.pageWidth<=g.width+1&&g.cardContained,JSON.stringify(g));
     assert.ok(g.actions.length===1&&g.actions.every(a=>a.height>=44&&a.contained),JSON.stringify(g));
     assert.equal(g.badge,36);assert.ok(g.height<=275,'Compact mobile module: '+JSON.stringify(g));
     if(width>=390)assert.ok(g.pulseBottom-g.previewBanner<=g.fold+1,'Full Pulse must fit initial mobile viewport before scrolling: '+JSON.stringify(g));
     console.log(name,width,i,JSON.stringify(g));
    }
    await page.locator('#rr-pulse-prev').click();
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:'pulse-mobile-homepage/'+name+'-'+width+'-viewport.png'});
    await page.screenshot({path:'pulse-mobile-homepage/'+name+'-'+width+'-full.png',fullPage:true});
    if(width===390){
     const card=page.locator('.rr-pulse-item').nth(count-2);
     await card.locator('.rr-pulse-compact-open').click();
     await page.locator('.rr-pulse-detail .rr-pulse-item').waitFor();
     await page.locator('.rr-pulse-detail .rr-pulse-tool').click();
     const menu=page.locator('.rr-pulse-menu');await menu.waitFor();
     assert.equal(await menu.getByRole('button',{name:'Download Card'}).count(),1);
     const dl=page.waitForEvent('download');await menu.getByRole('button',{name:'Download Card'}).click();assert.match((await dl).suggestedFilename(),/\.png$/);
    }
    assert.deepEqual(errors,[]);await page.close();
   }
   empty=true;const p=await browser.newPage({viewport:{width:390,height:844}});const response=p.waitForResponse(r=>r.url().endsWith('/api/race-day-pulse'));await p.goto('http://127.0.0.1:'+server.address().port+'/');await response;assert.ok(await p.locator('#rr-pulse').isHidden());await p.close();empty=false;
  }finally{await browser.close();}
 }
 console.log('PULSE MOBILE HOMEPAGE PASS');
}finally{await new Promise(r=>server.close(r));}

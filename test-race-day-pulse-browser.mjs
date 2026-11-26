// Race-Day Pulse synthetic browser/release QA. No private cards, customer info,
// race outcomes or paid selections are exposed. Run with Playwright Chromium.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const date='2026-11-26';
const make=(i)=>({
 id:'synthetic-downs-race-'+(i+1),date,track:'Synthetic Downs',
 race_number:i+1,updated_at:'2026-11-26T13:00:00Z',
 kind:i%2?'WIN_SHIFT':'NEW_FAVORITE',
 chip:String((i%12)+1),horse:'Sample Runner '+i,
 scratches:[{program:'3',horse:'Scratch Three'},{program:'12A',horse:'Scratch Twelve A'}],
 headline:i%2?'Scratch-driven projection shift':'New projected favorite',
 message:i%2?('With #3 scratched, #'+(i+1)+' Sample Runner '+i+' has risen from 18.2% to 25.3% in TRI updated win projections.'):
 ('With #3 scratched, #'+(i+1)+' Sample Runner '+i+' is TRI new projected favorite at 31.2%, up from 22.2% before the scratches.'),
 scratches:[{program:'3',horse:'Sample Scratched Horse 3'},{program:'11A',horse:'Also Scratched Runner 11A'}],
 hub_url:'/store/?date='+date
});
let mode='six';const fixture=()=>({date,status:'ok',items:mode==='empty'?[]:(mode==='one'?[make(0)]:Array.from({length:6},(_,i)=>make(i)))});
const dir=resolve('public');
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.jpg':'image/jpeg'};
const server=createServer((req,res)=>{
 const {pathname}=new URL(req.url,'http://localhost');
 if(pathname==='/api/race-day-pulse'){
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(fixture()));return;
 }
 if(pathname==='/api/products'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({products:[]}));return;}
 let target=pathname==='/'?'/index.html':pathname;
 const file=resolve(dir,'.'+target);
 if(!file.startsWith(dir+'/')){res.writeHead(403);res.end();return;}
 try{res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(readFileSync(file))}
 catch(e){res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true});
 const origin='http://127.0.0.1:'+server.address().port;
 mkdirSync('pulse-preview-screenshots',{recursive:true});
 for(const width of [320,375,390,430,768,1280]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,route=>route.abort());
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.locator('.rr-pulse-item').first().waitFor({timeout:12000});
  await page.locator('.rr-pulse-saddle img').first().evaluate(img=>img.decode());
  const layout=await page.evaluate(()=>({
   pageWidth:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth,
   pulse:document.getElementById('rr-pulse').getBoundingClientRect().width,
   cards:[...document.querySelectorAll('#rr-pulse-rail>.rr-pulse-item')].length,
   imgs:[...document.querySelectorAll('.rr-pulse-saddle img')].map(el=>el.naturalWidth),
   headline:getComputedStyle(document.querySelector('.rr-pulse-headline')).fontSize,
   railScrollable:document.getElementById('rr-pulse-rail').scrollWidth>document.getElementById('rr-pulse-rail').clientWidth
  }));
  assert.deepEqual(errors,[],'No runtime errors width '+width);
  assert.ok(layout.pageWidth<=layout.viewport+1,'No horizontal page overflow: '+JSON.stringify({width,layout}));
  assert.equal(layout.cards,7,'Six actual insights and one Intelligence Hub CTA');
  assert.ok(layout.imgs[0]>0,'Visible approved saddlecloth image loads; off-screen images may be lazy-loaded');
  const saddleStyle=await page.evaluate(()=>{
    const images=[...document.querySelectorAll('.rr-pulse-item:first-child .rr-pulse-saddle')];
    return images.map(el=>{
      const s=getComputedStyle(el),img=el.querySelector('img'),v=img?getComputedStyle(img):null;
      return {background:s.backgroundColor,opacity:s.opacity,blend:s.mixBlendMode,
        imgOpacity:v?.opacity,imgBlend:v?.mixBlendMode,imgBackground:v?.backgroundColor};
    });
  });
  assert.ok(saddleStyle.length>=3,'Featured horse plus both scratched horses have official chips');
  assert.ok(saddleStyle.every(x=>x.background==='rgb(255, 255, 255)'&&x.opacity==='1'&&
    x.blend==='normal'&&x.imgOpacity==='1'&&x.imgBlend==='normal'&&
    x.imgBackground==='rgb(255, 255, 255)'),
    'All featured and scratched saddlecloth art must follow live opaque-white alpha fix: '+JSON.stringify(saddleStyle));
  assert.ok((await page.locator('.rr-pulse-scratch-name').first().innerText()).includes('Scratched Horse'),
    'The scratch chip includes the real horse name');

  const chips=await page.locator('.rr-pulse-scratch-identity').first().locator('.rr-pulse-saddle').count();
  assert.equal(chips,1,'Named scratch has approved saddle chip');
  const appearance=await page.locator('.rr-pulse-saddle--scratch').first().evaluate(el=>{
    const box=getComputedStyle(el),img=getComputedStyle(el.querySelector('img'));
    return {background:box.backgroundColor,opacity:box.opacity,imgBackground:img.backgroundColor,
      imgOpacity:img.opacity,blend:img.mixBlendMode,filter:img.filter};
  });
  assert.equal(appearance.background,'rgb(255, 255, 255)','Opaque white scratch backing mirrors current live fix');
  assert.equal(appearance.imgOpacity,'1');
  assert.equal(appearance.blend,'normal');
  assert.equal(appearance.filter,'none');
  assert.ok(await page.locator('.rr-pulse-scratch-name').first().isVisible(),'Show actual scratched horse name');
  assert.ok(await page.locator('.rr-pulse-affected').first().isVisible(),'Show selected horse name');
  assert.ok(layout.railScrollable,'Scroller should overflow inside its own boundary');
  const geometry=await page.evaluate(()=>{
    const rail=document.querySelector('.rr-pulse-rail'),
      card=document.querySelector('.rr-pulse-item'),share=card.querySelector('.rr-pulse-tool'),
      body=card.querySelector('.rr-pulse-message'),footer=card.querySelector('.rr-pulse-item-footer');
    const cb=card.getBoundingClientRect(),sb=share.getBoundingClientRect(),
      bb=body.getBoundingClientRect(),fb=footer.getBoundingClientRect(),style=getComputedStyle(body),
      rb=rail.getBoundingClientRect();
    return {railLeft:rb.left,railRight:rb.right,railWidth:rail.clientWidth,
      cardLeft:cb.left,cardRight:cb.right,cardWidth:card.clientWidth,
      shareLeft:sb.left,shareRight:sb.right,shareTop:sb.top,shareBottom:sb.bottom,
      footerTop:fb.top,footerBottom:fb.bottom,
      messageLeft:bb.left,messageRight:bb.right,
      messageWidth:body.clientWidth,messageScroll:body.scrollWidth,messageHeight:bb.height,
      whiteSpace:style.whiteSpace,lineHeight:style.lineHeight};
  });
  assert.ok(geometry.cardRight<=geometry.railRight+2,
    'Compact Pulse card must not be clipped by its own scrolling viewport: '+JSON.stringify({width,geometry}));
  assert.ok(geometry.messageRight<=geometry.railRight+2,
    'Narrative text must fit the visible viewport: '+JSON.stringify({width,geometry}));
  assert.ok(geometry.shareRight<=geometry.railRight+2,
    'Share button must be on-screen: '+JSON.stringify({width,geometry}));
  assert.ok(geometry.shareRight<=geometry.cardRight+2&&geometry.shareLeft>=geometry.cardLeft-2,
    'Share must fit inside compact Pulse card: '+JSON.stringify({width,geometry}));
  assert.ok(geometry.shareBottom<=geometry.footerBottom+2,
    'Share must be visible in footer: '+JSON.stringify({width,geometry}));
  assert.ok(geometry.messageScroll<=geometry.messageWidth+2,
    'No cropped handicapper sentence: '+JSON.stringify({width,geometry}));
  assert.notEqual(geometry.whiteSpace,'nowrap','Message must wrap naturally');
  if(width<=430)assert.ok(geometry.messageHeight>22,'Mobile insight must wrap onto multiple readable lines');

  await page.screenshot({path:'pulse-preview-screenshots/pulse-'+width+'.png'});
  // A click opens manual share menu; never posts to X without the user.
  await page.locator('.rr-pulse-tool').first().click();
  assert.ok(await page.locator('.rr-pulse-menu').first().isVisible(),'Share control shows manual actions');
  const href=await page.locator('.rr-pulse-menu a').first().getAttribute('href');
  assert.match(href,/^https:\/\/x\.com\/intent\/tweet\?text=/);
  assert.ok(href.includes('pulse%2F'),'Share posts link to specific alert');
  if(width===390){
    const downloadEvent=page.waitForEvent('download',{timeout:12000});
    await page.locator('.rr-pulse-menu button').filter({hasText:'Save image'}).first().click();
    const download=await downloadEvent;
    assert.match(download.suggestedFilename(),/^rail-rye-.*\.png$/,'Branded image is a downloadable PNG');
    await download.saveAs('pulse-preview-screenshots/share-image.png');
  }
  await page.locator('#rr-pulse-next').click();
  assert.ok(!await page.locator('#rr-pulse-prev').isDisabled(),'Scroller arrows work');
  await page.close();
 }
 mode='empty';
 const empty=await browser.newPage();
 await empty.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await empty.waitForTimeout(800);
 assert.ok(await empty.locator('#rr-pulse').isHidden(),'No qualified updates means no scroller');
 await empty.close();
 mode='one';
 const one=await browser.newPage();
 await one.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await one.locator('.rr-pulse-item').first().waitFor({timeout:12000});
 assert.equal(await one.locator('.rr-pulse-item').count(),2,'One qualifying item plus CTA, no forced six');
 await one.close();
 console.log('RACE-DAY PULSE BROWSER QA PASS — six viewports, images, carousel, sharing, empty/one/six');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}

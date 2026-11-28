// Race-Day Pulse synthetic browser/release QA. No private cards, customer info,
// race outcomes or paid selections are exposed. Run with Playwright Chromium.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const date='2026-11-26';
const make=(i)=>({
 id:'synthetic-downs-race-'+(i+1),date,track:'Synthetic Downs',
 race_number:i+1,post_time_et:'3:15 PM ET',updated_at:'2026-11-26T13:00:00Z',
 kind:i===2?'FAVORITE_SCRATCHED':i===4?'F4_SHIFT':i%2?'WIN_SHIFT':'NEW_FAVORITE',
 chip:String((i%12)+1),horse:'Sample Runner '+i,
 scratches:[{program:'3',horse:'Scratch Three'},{program:'12A',horse:'Scratch Twelve A'}],
 headline:i%2?'Scratch-Driven Projection Shift':'New Projected Favorite',
 message:i%2?('With #3 scratched, #'+(i+1)+' Sample Runner '+i+' has risen from 18.2% to 25.3% in TRI updated win projections.'):
 ('With #3 scratched, #'+(i+1)+' Sample Runner '+i+' is TRI new projected favorite at 31.2%, up from 22.2% before the scratches.'),
 scratches:[{program:'3',horse:'Sample Scratched Horse 3'},{program:'11A',horse:'Also Scratched Runner 11A'}],
 metric:{label:'WIN',before:i%2?18.2:22.2,after:i%2?25.3:31.2},
 summary:{projected_rank:1,win_probability:i%2?25.3:31.2},
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
 if(/^\/pulse\/[^/]+\/[^/]+\/card-v1\.png$/.test(pathname)){res.writeHead(200,{'Content-Type':'image/png'});res.end();return;}
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
 for(const width of [768,1280,1440]){
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
  assert.equal(layout.cards,6,'Six actual insights; no synthetic CTA card');
  assert.equal(await page.locator('.rr-pulse-position').innerText(),'1/6');
  assert.ok(await page.locator('#rr-pulse-prev').isDisabled());
  for(const id of ['#rr-pulse-prev','#rr-pulse-next']){
    const centered=await page.locator(id).evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('svg').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<.5&&Math.abs(a.y+a.height/2-b.y-b.height/2)<.5;});
    assert.ok(centered,'Vector chevron must be centered');
  }
  assert.match(await page.locator('#rr-pulse-next').evaluate(el=>getComputedStyle(el).borderRadius),/^8px$/);
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
  // Scratch row is chips ONLY; the affected horse remains named in Analysis.
  assert.equal(await page.locator('.rr-pulse-scratch-name').count(),0,
    'Do not list scratched horses names in the compact Pulse scratch row');
  const identities=page.locator('.rr-pulse-item').first().locator('.rr-pulse-scratch-identity');
  assert.equal(await identities.count(),2,'Show all numbered scratch chips');
  assert.equal(await identities.first().locator('.rr-pulse-saddle').count(),1);
  const appearance=await page.locator('.rr-pulse-saddle--scratch').first().evaluate(el=>{
    const box=getComputedStyle(el),img=getComputedStyle(el.querySelector('img'));
    return {background:box.backgroundColor,opacity:box.opacity,imgBackground:img.backgroundColor,
      imgOpacity:img.opacity,blend:img.mixBlendMode,filter:img.filter};
  });
  assert.equal(appearance.background,'rgb(255, 255, 255)','Opaque white scratch backing mirrors approved live fix');
  assert.equal(appearance.imgOpacity,'1');
  assert.equal(appearance.blend,'normal');
  assert.equal(appearance.filter,'none');
  assert.ok(await page.locator('.rr-pulse-scratch-list').first().evaluate(el=>parseFloat(getComputedStyle(el).paddingTop)>=3),
    'Scratch chips have deliberate breathing room');
  assert.match(await page.locator('.rr-pulse-track').first().innerText(),/1ST/,'Use ordinal race labels');
  assert.ok((await page.locator('.rr-pulse-headline').first().innerText()).includes('Sample Runner 0'));
  assert.equal(await page.locator('.rr-pulse-logo').count(),1,'Approved brand mark appears in Pulse');
  assert.match(await page.locator('.rr-pulse-track').first().innerText(),/3:15 PM ET/);
  assert.equal(await page.locator('.rr-pulse-item').nth(2).locator('.rr-pulse-signal--favorite-scratched').getAttribute('aria-label'),'PROJECTED FAVORITE SCRATCHED');
  assert.equal(await page.locator('.rr-pulse-item').nth(4).locator('.rr-pulse-signal--rank').getAttribute('aria-label'),'SECOND-OR-THIRD PROBABILITY SHIFT');
  assert.match(await page.locator('.rr-pulse-headline').first().evaluate(el=>getComputedStyle(el).fontFamily),/^Inter/);
  const editorial=page.locator('.rr-pulse-message').first();
  assert.match(await editorial.evaluate(el=>getComputedStyle(el).fontFamily),/Montserrat/);
  assert.equal((await editorial.locator('.rr-pulse-message-horse').innerText()).trim(),'Sample Runner 0');
  const inline=editorial.locator('.rr-pulse-saddle--inline img');
  assert.equal(await inline.getAttribute('src'),'/assets/approved/saddlecloths/1.png');
  assert.equal(await inline.getAttribute('alt'),'Saddlecloth 1');
  assert.ok(await inline.evaluate(img=>img.getBoundingClientRect().width<22),'Inline program chip is smaller than the main horse chip');
  assert.equal(await editorial.locator('.rr-pulse-message-horse').evaluate(el=>getComputedStyle(el).fontWeight),'700');
  if(width<=640){
    assert.ok(await page.locator('.rr-pulse-affected').first().isHidden(),'Mobile repeats no redundant named-horse line');
    assert.match(await page.locator('.rr-pulse-message').first().innerText(),/Sample Runner 0/,
      'Mobile Analysis still names its affected horse');
  }else assert.ok(await page.locator('.rr-pulse-headline').first().isVisible(),
    'Desktop keeps the named featured horse line');
  assert.ok(layout.railScrollable,'Scroller should overflow inside its own boundary');
  const geometry=await page.evaluate(()=>{
    const rail=document.querySelector('.rr-pulse-rail'),
      card=document.querySelector('.rr-pulse-item'),share=card.querySelector('.rr-pulse-item-footer .rr-pulse-tool'),
      body=card.querySelector('.rr-pulse-message'),footer=card.querySelector('.rr-pulse-item-footer');
    const cb=card.getBoundingClientRect(),sb=share.getBoundingClientRect(),
      bb=body.getBoundingClientRect(),fb=footer.getBoundingClientRect(),style=getComputedStyle(body),
      rb=rail.getBoundingClientRect();
    return {railLeft:rb.left,railRight:rb.right,railWidth:rail.clientWidth,
      cardLeft:cb.left,cardRight:cb.right,cardWidth:card.clientWidth,cardBottom:cb.bottom,railBottom:rb.bottom,pillRadii:[...footer.querySelectorAll('a,button')].map(el=>getComputedStyle(el).borderTopLeftRadius),
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
  assert.ok(geometry.cardBottom<=geometry.railBottom+2,'Card must fit vertically without clipping: '+JSON.stringify(geometry));
  assert.ok(geometry.pillRadii.every(x=>parseFloat(x)>=30),'All three actions use rounded pills');
  assert.ok(geometry.shareRight<=geometry.railRight+2,
    'Share button must be on-screen: '+JSON.stringify({width,geometry}));
  assert.ok(geometry.shareRight<=geometry.cardRight+2&&geometry.shareLeft>=geometry.cardLeft-2,
    'Share must fit inside compact Pulse card: '+JSON.stringify({width,geometry}));
  assert.ok(geometry.shareBottom<=geometry.footerBottom+2,
    'Share must be visible in footer: '+JSON.stringify({width,geometry}));
  assert.ok(geometry.messageScroll<=geometry.messageWidth+2,
    'No cropped handicapper sentence: '+JSON.stringify({width,geometry}));
  assert.notEqual(geometry.whiteSpace,'nowrap','Message must wrap naturally');
  if(width<=430){
    assert.ok(geometry.messageHeight>0&&geometry.messageHeight<=85,
      'Mobile narrative stays readable and compact without forced clipping: '+JSON.stringify(geometry));
    assert.ok(await page.locator('#rr-pulse').evaluate(el=>el.getBoundingClientRect().height)<300,
      'Pulse should not dominate the mobile homepage');
    assert.ok(await page.evaluate(()=>document.querySelector('.heritage-hero').nextElementSibling?.id==='rr-pulse'),
      'On mobile Pulse belongs immediately below the original hero');
  }else if(width>=1121){
    assert.ok(await page.evaluate(()=>document.querySelector('.heritage-hero').contains(document.querySelector('#rr-pulse'))),
      'On desktop Pulse occupies right side of established homepage hero');
    const placement=await page.locator('#rr-pulse').evaluate(el=>{
      const r=el.getBoundingClientRect(),h=document.querySelector('.heritage-hero').getBoundingClientRect();
      return {left:r.left,right:r.right,heroCenter:h.left+h.width/2,heroBottom:h.bottom,pulseBottom:r.bottom};
    });
    assert.ok(placement.left>placement.heroCenter&&placement.pulseBottom<=placement.heroBottom+1,
      'Desktop Pulse must fit within open right hero without exceeding its bounds: '+JSON.stringify(placement));
  }

  await page.screenshot({path:'pulse-preview-screenshots/pulse-'+width+'.png'});
  if(width===390||width===1280)await page.screenshot({
    path:'pulse-preview-screenshots/full-homepage-'+width+'.png',fullPage:true
  });
  // Desktop opens and returns within the original homepage module.
  const open=page.locator('.rr-pulse-story-link').first();
  assert.equal(await open.innerText(),'Open Pulse');
  const beforeUrl=page.url();
  await open.click();
  assert.equal(page.url(),beforeUrl);
  assert.equal(await open.innerText(),'Back to Pulse');
  assert.equal(await open.getAttribute('aria-expanded'),'true');
  assert.ok(await page.locator('.rr-pulse-expanded-message').first().isVisible());
  assert.equal(await page.locator('.rr-pulse-item:visible').count(),1);
  await page.screenshot({path:'pulse-preview-screenshots/pulse-expanded-'+width+'.png'});
  await open.click();
  assert.equal(page.url(),beforeUrl);
  assert.equal(await open.innerText(),'Open Pulse');
  assert.ok(await page.locator('.rr-pulse-expanded-message').first().isHidden());
  assert.equal(await page.locator('.rr-pulse-item:visible').count(),6);
  // A click opens manual share menu; never posts to X without the user.
  await page.locator('.rr-pulse-item-footer .rr-pulse-tool').first().click();
  assert.ok(await page.locator('.rr-pulse-menu').first().isVisible(),'Share control shows manual actions');
  assert.deepEqual(await page.locator('.rr-pulse-menu button').allTextContents(),['Share to X','Download Card','Copy Link']);
  const href=await page.locator('.rr-pulse-menu a').first().getAttribute('href');
  assert.ok(new URL(href).pathname.startsWith('/pulse/'),'Share links to specific alert');
  if(width===1280){
    const downloadEvent=page.waitForEvent('download',{timeout:12000});
    await page.locator('.rr-pulse-menu button').filter({hasText:'Download Card'}).first().click();
    const download=await downloadEvent;
    assert.match(download.suggestedFilename(),/^rail-rye-.*\.png$/,'Branded image is a downloadable PNG');
    await download.saveAs('pulse-preview-screenshots/share-image.png');
    const png=readFileSync('pulse-preview-screenshots/share-image.png');
    assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),1350);
    const landscape=Buffer.from(await page.evaluate(async item=>{const blob=await globalThis.RRPulseRenderImage(item,'landscape');return Array.from(new Uint8Array(await blob.arrayBuffer()));},make(0)));
    assert.equal(landscape.readUInt32BE(16),1200);assert.equal(landscape.readUInt32BE(20),675);
    writeFileSync('pulse-preview-screenshots/x-image.png',landscape);
    await page.evaluate(()=>{window.open=(url)=>{window.__pulseShareURL=url;return null;};});
    await page.getByRole('button',{name:'Share to X',exact:true}).click();
    const shared=await page.evaluate(()=>window.__pulseShareURL);
    assert.equal(new URL(shared).origin,'https://x.com');
    assert.ok(new URL(shared).searchParams.get('url').includes('/pulse/'));
    assert.ok(new URL(shared).searchParams.get('text'));

  }
  await page.locator('.rr-pulse-item-footer .rr-pulse-tool').first().click();
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
 assert.equal(await one.locator('.rr-pulse-item').count(),1,'One qualifying item, no forced six');
 await one.close();
 console.log('RACE-DAY PULSE BROWSER QA PASS — desktop/tablet viewports, images, carousel, sharing, empty/one/six');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}

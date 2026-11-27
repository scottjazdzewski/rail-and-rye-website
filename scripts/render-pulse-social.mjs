// Deterministic, browser-rendered social PNGs from PUBLIC Pulse items only.
// node scripts/render-pulse-social.mjs --demo
// node scripts/render-pulse-social.mjs --feed /absolute/public-feed.json --out /tmp/pulse-social
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
const isDemo=args.includes('--demo');
const out=resolve(args.includes('--out')?arg('--out'):'public/assets/pulse-social');
const fixture=isDemo?{preview:true,items:(await import('../staging/pulse-preview-worker.js')).demo}:JSON.parse(readFileSync(arg('--feed'),'utf8'));
assert.ok(Array.isArray(fixture.items),'Only a public Pulse feed is accepted');
if(!isDemo)assert.equal(fixture.status,'ok','Only a released public feed is accepted');
const allowed=new Set(['id','date','track','race_number','updated_at','post_time_et','kind','chip','horse','headline','message','short_message','metric','summary','pace_fit','scratches','hub_url']);
for(const item of fixture.items){
 assert.match(item.id,/^[a-z0-9-]{2,120}$/);assert.match(item.date,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(item.id.startsWith('demo-'),isDemo);
 assert.ok(Object.keys(item).every(key=>allowed.has(key)),'Unexpected data: refuse to render a private/source payload');
 assert.ok(typeof item.message==='string'&&typeof item.track==='string');
 if(!isDemo)assert.equal(item.date,fixture.date,'Current released race day only');
}
const root=resolve('public');
const types={'.js':'text/javascript','.png':'image/png','.css':'text/css','.jpg':'image/jpeg','.webp':'image/webp'};
const html='<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/assets/rail-rye-core.css"><section id="rr-pulse" hidden><span id="rr-pulse-count"></span><button id="rr-pulse-prev"></button><button id="rr-pulse-next"></button><div id="rr-pulse-rail"></div></section><script src="/assets/race-day-pulse.js"></script>';
const server=createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(p==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(p==='/api/race-day-pulse'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({items:[]}));return;}
 const file=resolve(root,'.'+p);
 if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
 try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:675},deviceScaleFactor:1});
 const runtimeErrors=[];page.on('pageerror',error=>runtimeErrors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.waitForFunction(()=>typeof globalThis.RRPulseRenderImage==='function'&&typeof globalThis.RRRaceTitles?.formatFairOdds==='function');
 for(const item of fixture.items){
  const base64=await page.evaluate(async item=>{
    const blob=await globalThis.RRPulseRenderImage(item,'landscape');
    return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});
  },item);
  const png=Buffer.from(base64,'base64');assert.equal(png.readUInt32BE(0),0x89504e47);assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),675);assert.ok(png.length<2_000_000);
  const folder=join(out,item.date);mkdirSync(folder,{recursive:true});
  writeFileSync(join(folder,item.id+'.png'),png);console.log('Rendered '+item.date+'/'+item.id+' '+png.length+' bytes');
 }
 assert.deepEqual(runtimeErrors,[]);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}

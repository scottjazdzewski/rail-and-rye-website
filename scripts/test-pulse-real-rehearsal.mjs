// Real sanitized output only, in an ephemeral CI directory. No network writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {handlePulsePage,handlePulseImage} from '../src/race-day-pulse.js';
const dir=process.env.PULSE_PRIVATE_REHEARSAL_DIR;
assert.ok(dir);
const feed=JSON.parse(fs.readFileSync(path.join(dir,'2026-11-27.json'),'utf8'));
assert.equal(feed.status,'ok');assert.ok(feed.items.length>0);
const out=path.join(dir,'landscape');
const render=spawnSync(process.execPath,['scripts/render-pulse-social.mjs','--feed',path.join(dir,feed.date+'.json'),'--out',out],{encoding:'utf8',maxBuffer:4_000_000});
assert.equal(render.status,0,'Actual output landscape renderer failed (private details suppressed)');
const archive={schema_version:1,date:feed.date,items:feed.items};
const env={PULSE_PUBLICATION_ENABLED:'true',CARDS_BUCKET:{
 async list(){return {objects:[],truncated:false}},
 async get(k){
   if(k==='race-day-pulse/public/'+feed.date+'.json')return {json:async()=>archive};
   const prefix='race-day-pulse/social/v1/'+feed.date+'/';
   if(!k.startsWith(prefix))return null;
   const filename=path.join(out,feed.date,k.slice(prefix.length));
   if(!fs.existsSync(filename))return null;
   const b=fs.readFileSync(filename);return {size:b.length,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
 }
}};
let good=0;
for(const item of feed.items){
 const route=[null,item.date,item.id],url='https://railandryeracing.com/pulse/'+item.date+'/'+item.id;
 const image=await handlePulseImage(new Request(url+'/card-v1.png'),env,route);
 assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
 const bytes=Buffer.from(await image.arrayBuffer());assert.equal(bytes.readUInt32BE(16),1200);assert.equal(bytes.readUInt32BE(20),675);
 const html=await (await handlePulsePage(new Request(url),env,route)).text();
 assert.ok(html.includes('summary_large_image')&&html.includes(url+'/card-v1.png')&&html.includes('Download Card')&&html.includes('rr-pulse-primary'),'Missing rich preview or product action');
 assert.ok(!/model_receipts|f4_probabilities|parent_replay_proof|win_probability_exact/.test(html),'Private field leak');
 assert.equal((await handlePulseImage(new Request(url+'/card-v1.png'),{...env,PULSE_PUBLICATION_ENABLED:'false'},route)).status,404);
 assert.equal((await handlePulsePage(new Request(url),{...env,PULSE_PUBLICATION_ENABLED:'false'},route)).status,404);
 good++;
}
console.log('PULSE_REAL_REHEARSAL '+JSON.stringify({images:good,detail_pages:good,rich_metadata:good,release_disabled_checks:good*2}));

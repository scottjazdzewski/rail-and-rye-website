// Source-verified Race-Day Pulse regression checks. No paid data or secrets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('src/race-day-pulse.js','utf8');
const pulse=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const fingerprint='a'.repeat(64);
const f4=(win,p2=.15,p3=.15)=>({exact_p1:win/100,exact_p2:p2,exact_p3:p3});
function run(n,pwin,extra={}){
  return {program_number:String(n),horse_name:'Horse '+n,win_probability_exact:pwin,
    f4_probabilities:f4(pwin,...(extra.place||[]))};
}
function prescratch(date='2026-11-26'){
  return {schema_version:1,race_date:date,track_name:'Churchill Downs',projection_status:'prescratch',
    races:[{race_number:6,post_time_et:'3:20 PM ET',scratch_count:null,scratches:[],
      entries:[run(1,45),run(2,35),run(3,20)]}]};
}
function final(date='2026-11-26'){
  return {schema_version:1,race_date:date,track_name:'Churchill Downs',projection_status:'scratch_final',
    factor_basis:'verified_scratch_final',
    model_receipts:{tri_sha256:fingerprint,f4_sha256:fingerprint,prescratch_parent_sha256:fingerprint,official_changes_sha256:fingerprint},
    races:[{race_number:6,post_time_et:'3:20 PM ET',scratch_count:1,
      scratches:[{program_number:'3',horse_name:'Horse 3'}],entries:[run(1,35),run(2,65)]}]};
}
class R2 {
  constructor(){this.items=new Map()}
  async head(k){return this.items.has(k)?this.items.get(k):null}
  async put(k,value,meta={}){this.items.set(k,{data:value,customMetadata:meta.customMetadata||{},uploaded:new Date('2026-11-26T13:00:00Z')})}
  async get(k){const v=this.items.get(k);if(!v)return null;return {...v,async json(){return JSON.parse(v.data)}}}
  async list({prefix}){return {objects:[...this.items.entries()].filter(([k])=>k.startsWith(prefix)).map(([key,metadata])=>({key,uploaded:metadata.uploaded}))}}
}
const env={CARDS_BUCKET:new R2()};
const before=prescratch(),after=final();
const event=pulse.insightForRace(before.race_date,before.track_name,before.races[0],after.races[0],'2026-11-26T13:00:00Z');
assert.equal(event.kind,'NEW_FAVORITE');
assert.equal(event.chip,'2');
assert.match(event.message,/#3 scratched/);
assert.match(event.message,/#2 Horse 2/);
assert.match(event.message,/65\.0%/);
assert.ok(!event.message.includes('pace'),'Never invent unverified pace explanations');
assert.equal(event.hub_url,'/store/?date=2026-11-26');
assert.equal(pulse.insightForRace(before.race_date,before.track_name,before.races[0],
  {...after.races[0],scratch_count:0},null),null,'Reject scratch count mismatch');
assert.equal(await pulse.captureInitialPulseSnapshot(env,before),true);
assert.equal(await pulse.captureInitialPulseSnapshot(env,before),false,'Immutable prescratch first-write wins');
await env.CARDS_BUCKET.put('projections/dashboard/2026-11-26/churchill-downs.json',JSON.stringify(after),
  {customMetadata:{customer_publish_approved:'true',uploaded_at:'2026-11-26T13:00:00Z'}});
let feed=await pulse.readRaceDayPulse(env,Date.parse('2026-11-26T18:00:00Z'));
assert.equal(feed.items.length,1);
assert.equal(feed.items[0].kind,'NEW_FAVORITE');
assert.ok(!JSON.stringify(feed).includes('model_receipts'),'Never expose private scoring receipts');
assert.ok(!JSON.stringify(feed).includes('f4_probabilities'),'Never expose full F4 vectors');
// Published dashboard alone is insufficient.
const unapproved={CARDS_BUCKET:new R2()};
await pulse.captureInitialPulseSnapshot(unapproved,before);
await unapproved.CARDS_BUCKET.put('projections/dashboard/2026-11-26/churchill-downs.json',JSON.stringify(after));
assert.equal((await pulse.readRaceDayPulse(unapproved,Date.parse('2026-11-26T18:00:00Z'))).items.length,0);
// Certified scratch final without immutable initial cannot be compared.
const noBase={CARDS_BUCKET:new R2()};
await noBase.CARDS_BUCKET.put('projections/dashboard/2026-11-26/churchill-downs.json',JSON.stringify(after),
  {customMetadata:{customer_publish_approved:'true'}});
assert.equal((await pulse.readRaceDayPulse(noBase,Date.parse('2026-11-26T18:00:00Z'))).items.length,0);
// Missing source proof must fail closed.
const noProof={...after,factor_basis:'verified_prescratch'};
await env.CARDS_BUCKET.put('projections/dashboard/2026-11-26/churchill-downs.json',JSON.stringify(noProof),
  {customMetadata:{customer_publish_approved:'true'}});
assert.equal((await pulse.readRaceDayPulse(env,Date.parse('2026-11-26T18:00:00Z'))).items.length,0);
// Source can be uploaded for tomorrow but cannot appear before 3 AM Eastern.
const tomorrow=prescratch('2026-11-27'),tomorrowFinal=final('2026-11-27');
await pulse.captureInitialPulseSnapshot(env,tomorrow);
await env.CARDS_BUCKET.put('projections/dashboard/2026-11-27/churchill-downs.json',JSON.stringify(tomorrowFinal),
  {customMetadata:{customer_publish_approved:'true'}});
assert.equal((await pulse.readRaceDayPulse(env,Date.parse('2026-11-27T07:59:00Z'))).date,'2026-11-26');
assert.equal((await pulse.readRaceDayPulse(env,Date.parse('2026-11-27T08:01:00Z'))).date,'2026-11-27');
assert.equal((await pulse.readRaceDayPulse(env,Date.parse('2026-11-27T08:01:00Z'))).items.length,1);
// Public page displays specific source-backed fact and escapes untrusted text.
feed=await pulse.readRaceDayPulse(env,Date.parse('2026-11-27T08:01:00Z'));
const page=await pulse.handlePulsePage(new Request('https://railandryeracing.com/pulse/2026-11-27/'+feed.items[0].id),env,[null,'2026-11-27',feed.items[0].id]);
assert.equal(page.status,404,'Share pages never expose future race feeds via wall clock mock');
assert.ok(fs.readFileSync('public/index.html','utf8').includes('id="rr-pulse"'));
assert.ok(fs.readFileSync('public/assets/race-day-pulse.js','utf8').includes('navigator.share'));
assert.ok(fs.readFileSync('public/assets/race-day-pulse.js','utf8').includes('Save image'));
assert.ok(!fs.readFileSync('src/race-day-pulse.js','utf8').includes('Equibase'));
console.log('RACE-DAY PULSE TESTS PASS: certified feed, no-leak, cutoff, share controls, immutable snapshot');

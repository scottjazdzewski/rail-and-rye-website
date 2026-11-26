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
const fixtureAlerts=[
 ...Array.from({length:6},(_,i)=>({id:'a'+i,date:'2026-11-26',track:'Same Track',priority:100-i})),
 ...Array.from({length:4},(_,i)=>({id:'b'+i,date:'2026-11-26',track:'Other Track',priority:80-i}))
];
const diversified=pulse.choosePulseInsights(fixtureAlerts);
assert.equal(diversified.length,6);
assert.ok(diversified.filter(x=>x.track==='Other Track').length>=2,'Other tracks receive at least two slots in the first selection pass');
assert.equal(pulse.choosePulseInsights(fixtureAlerts.slice(0,6)).length,6,'Do not suppress a single track with six genuine stories');
assert.equal(pulse.choosePulseInsights(fixtureAlerts.slice(0,1)).length,1,'Never force six stories');
// Direct-to-R2 production paths sometimes bypass the API prescratch hook.
// The opt-in scheduled safety net may only preserve certified initial fields.
const gateEnv={CARDS_BUCKET:new R2()};
const clock=Date.parse('2026-11-26T08:10:00Z'); // 3:10 AM Eastern on Thanksgiving
assert.equal((await pulse.capturePublishedPulseBaselines(gateEnv,clock)).status,'disabled');
gateEnv.PULSE_CAPTURE_BASELINES_ENABLED='true';
assert.equal((await pulse.capturePublishedPulseBaselines(gateEnv,clock-600000)).status,'outside_snapshot_window');
const initial=prescratch();
initial.model_receipts={tri_sha256:fingerprint,f4_sha256:fingerprint};
await gateEnv.CARDS_BUCKET.put('projections/dashboard/2026-11-26/churchill-downs.json',
 JSON.stringify(initial),{customMetadata:{stage:'prescratch'}});
let captured=await pulse.capturePublishedPulseBaselines(gateEnv,clock);
assert.equal(captured.status,'checked');
assert.equal(captured.captured,1,'Official prescratch model is privately captured once');
assert.equal((await pulse.capturePublishedPulseBaselines(gateEnv,clock)).existing,1,'Existing baseline is immutable');
const stored=await gateEnv.CARDS_BUCKET.get('race-day-pulse/prescratch/2026-11-26/churchill-downs.json');
assert.equal((await stored.json()).projection_status,'prescratch');
const finals=final();
await gateEnv.CARDS_BUCKET.put('projections/dashboard/2026-11-26/churchill-downs.json',
 JSON.stringify(finals),{customMetadata:{stage:'SCRATCH_FINAL'}});
assert.equal((await pulse.capturePublishedPulseBaselines(gateEnv,Date.parse('2026-11-26T13:50:00Z'))).captured,0,
 'Never manufacture an original from a scratch-final field');
assert.equal((await stored.json()).projection_status,'prescratch');
const staleEnv={CARDS_BUCKET:new R2(),PULSE_CAPTURE_BASELINES_ENABLED:'true'};
await staleEnv.CARDS_BUCKET.put('projections/dashboard/2026-11-26/churchill-downs.json',
 JSON.stringify(initial),{customMetadata:{stage:'prescratch',release_at:'2026-11-27T08:00:00Z'}});
assert.equal((await pulse.capturePublishedPulseBaselines(staleEnv,clock)).captured,0,
 'Never snapshot a future-staged card');
const noReceipts={...initial,model_receipts:{}};
await staleEnv.CARDS_BUCKET.put('projections/dashboard/2026-11-26/churchill-downs.json',
 JSON.stringify(noReceipts),{customMetadata:{stage:'prescratch'}});
assert.equal((await pulse.capturePublishedPulseBaselines(staleEnv,clock)).captured,0,
 'Missing certified model receipts suppress baseline safety net');
const env={CARDS_BUCKET:new R2()};
const before=prescratch(),after=final();
const event=pulse.insightForRace(before.race_date,before.track_name,before.races[0],after.races[0],'2026-11-26T13:00:00Z');
const firstRevision=pulse.insightForRace(before.race_date,before.track_name,before.races[0],
 after.races[0],'2026-11-26T13:00:00Z',fingerprint+'|'+fingerprint);
const secondRevision=pulse.insightForRace(before.race_date,before.track_name,before.races[0],
 after.races[0],'2026-11-26T13:15:00Z','b'.repeat(64)+'|'+fingerprint);
assert.notEqual(firstRevision.id,secondRevision.id,'A newly certified revision gets a fresh, share-stable URL');
assert.match(firstRevision.id,/race-6-rev-[0-9a-f]{8}$/,'Opaque public revision marker, no raw 64-digit receipt');
const withExcludedAE={...after.races[0],scratch_count:2,
 scratches:[...after.races[0].scratches,{program_number:'13',horse_name:'Excluded Also Eligible'}]};
const aeFinding=pulse.insightForRace(before.race_date,before.track_name,before.races[0],
 withExcludedAE,'2026-11-26T13:00:00Z');
assert.equal(aeFinding.kind,'NEW_FAVORITE','Legitimate scratch analysis survives separate also-eligible listing');
assert.equal(aeFinding.scratches.length,1,'Only active-field removals are publicly credited');
assert.equal(aeFinding.scratches[0].program,'3');
assert.ok(!aeFinding.message.includes('#13'),'Excluded also-eligible is never described as a pace driver');
const onlyExcluded={...before.races[0],scratch_count:1,
 scratches:[{program_number:'13',horse_name:'Excluded Also Eligible'}]};
assert.equal(pulse.insightForRace(before.race_date,before.track_name,before.races[0],
 onlyExcluded,'2026-11-26T13:00:00Z'),null,
 'An also-eligible scratched outside the active field alone cannot create an insight');
const originalTurf={...before.races[0],surface:'Turf'};
const updatedDirt={...after.races[0],surface:'Dirt'};
const courseAlert=pulse.insightForRace(before.race_date,before.track_name,originalTurf,
 updatedDirt,'2026-11-26T15:00:00Z');
assert.equal(courseAlert.kind,'SURFACE_SWITCH','Certified course changes cannot be described as scratch-only changes');
assert.match(courseAlert.message,/moved from Turf to Dirt/);
assert.match(courseAlert.message,/confirmed active-field scratch/);
assert.ok(!courseAlert.message.includes('pace'),'Do not invent pace causation from a turf-to-dirt change');
const nonMaterial={...updatedDirt,entries:[run(1,45),run(2,55)]};
assert.equal(pulse.insightForRace(before.race_date,before.track_name,originalTurf,
 nonMaterial,'2026-11-26T15:00:00Z')?.kind,'SURFACE_SWITCH');
assert.equal(event.kind,'NEW_FAVORITE');
assert.equal(event.chip,'2');
assert.match(event.message,/#3 scratched/);
assert.match(event.message,/#2 Horse 2/);
assert.match(event.message,/65\.0%/);
assert.ok(!event.message.includes('pace'),'Never invent unverified pace explanations');
assert.equal(event.hub_url,'/intelligence/race-cards/?date=2026-11-26&track=Churchill%20Downs&race=6',
  'Pulse directs prospective buyer to the actual entitled race and fallback store flow');
const reader=fs.readFileSync('public/assets/projections-dashboard.js','utf8');
assert.ok(reader.includes('requestedTrack=links.get("track")'),
  'Entitlement-gated reader honors the featured exact track');
assert.ok(reader.includes('requestedRace=Number(links.get("race"))'),
  'Entitlement-gated reader honors the featured exact race');
assert.ok(fs.readFileSync('public/assets/rr-customer-reader.js','utf8').includes('location.replace("/store/?"+query)'),
  'Non-entitled visitors still use purchase flow rather than viewing private projections');
assert.equal(pulse.insightForRace(before.race_date,before.track_name,before.races[0],
  {...after.races[0],scratch_count:0},null),null,'Reject scratch count mismatch');
assert.equal(pulse.insightForRace(before.race_date,before.track_name,before.races[0],
  {...after.races[0],scratches:[{program_number:'3',horse_name:'WRONG HORSE'}]},null),null,
  'Never show a saddle chip with mismatched scratch horse identity');
assert.equal(pulse.insightForRace(before.race_date,before.track_name,before.races[0],
  {...after.races[0],entries:[run(1,35),{...run(2,65),horse_name:'WRONG RUNNER'}]},null),null,
  'Never show affected saddle chip for a mismatched active horse');
assert.equal(await pulse.captureInitialPulseSnapshot(env,before),true);
assert.equal(await pulse.captureInitialPulseSnapshot(env,before),false,'Immutable prescratch first-write wins');
await env.CARDS_BUCKET.put('projections/dashboard/2026-11-26/churchill-downs.json',JSON.stringify(after),
  {customMetadata:{customer_publish_approved:'true',uploaded_at:'2026-11-26T13:00:00Z'}});
let feed=await pulse.readRaceDayPulse(env,Date.parse('2026-11-26T18:00:00Z'));
assert.equal(feed.items.length,1);
assert.equal(feed.items[0].kind,'NEW_FAVORITE');
assert.ok(!JSON.stringify(feed).includes('model_receipts'),'Never expose private scoring receipts');
assert.ok(!JSON.stringify(feed).includes('f4_probabilities'),'Never expose full F4 vectors');
const historical=await env.CARDS_BUCKET.get('race-day-pulse/public/2026-11-26.json');
assert.ok(historical,'Share-safe public archive exists for selected published insights');
assert.equal(historical.customMetadata.public_safe_derived,'true');
const historicalBody=await historical.json();
assert.equal(historicalBody.items.length,1);
assert.ok(!JSON.stringify(historicalBody).includes('model_receipts'),'Historical share never stores model receipts');
assert.ok(!JSON.stringify(historicalBody).includes('f4_probabilities'),'Historical share never stores full F4');

// Existing private direct-R2 scratch publishers set uppercase SCRATCH_FINAL metadata.
await env.CARDS_BUCKET.put('projections/dashboard/2026-11-26/churchill-downs.json',JSON.stringify(after),
  {customMetadata:{stage:'SCRATCH_FINAL',uploaded_at:'2026-11-26T13:00:00Z'}});
assert.equal((await pulse.readRaceDayPulse(env,Date.parse('2026-11-26T18:00:00Z'))).items.length,1,
  'Certified direct-R2 scratch-final stage must publish Pulse without a website API upload');
const mismatchedParent=prescratch();
mismatchedParent.model_receipts={f4_sha256:'b'.repeat(64)};
const falseSource={CARDS_BUCKET:new R2()};
await pulse.captureInitialPulseSnapshot(falseSource,mismatchedParent);
await falseSource.CARDS_BUCKET.put('projections/dashboard/2026-11-26/churchill-downs.json',JSON.stringify(after),
  {customMetadata:{stage:'SCRATCH_FINAL'}});
assert.equal((await pulse.readRaceDayPulse(falseSource,Date.parse('2026-11-26T18:00:00Z'))).items.length,0,
  'Do not publish a snapshot with conflicting certified parent F4 receipt');
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
const originalNow=Date.now;Date.now=()=>Date.parse('2026-11-26T18:00:00Z');
try{
 const page=await pulse.handlePulsePage(new Request('https://railandryeracing.com/pulse/2026-11-27/'+feed.items[0].id),env,[null,'2026-11-27',feed.items[0].id]);
 assert.equal(page.status,404,'Share pages cannot expose tomorrow before scheduled release');
}finally{Date.now=originalNow;}
const originalClock=Date.now;
Date.now=()=>Date.parse('2026-11-27T16:00:00Z');
try{
 const preserved=await pulse.handlePulsePage(new Request('https://railandryeracing.com/pulse/2026-11-26/'+historicalBody.items[0].id),env,[null,'2026-11-26',historicalBody.items[0].id]);
 assert.equal(preserved.status,200,'Prior racing-day share URL survives 3AM rollover');
 const html=await preserved.text();
 assert.match(html,/New projected favorite/);
 assert.match(html,/Horse 2/);
 assert.match(html,/Explore Today’s Intelligence Hub/,'Expired old race links should route to current Hub');
 assert.match(html,/href="\/store\/"/);
 assert.ok(!html.includes('model_receipts'));
}finally{Date.now=originalClock;}
assert.ok(fs.readFileSync('public/index.html','utf8').includes('id="rr-pulse"'));
assert.ok(fs.readFileSync('public/assets/race-day-pulse.js','utf8').includes('navigator.share'));
assert.ok(fs.readFileSync('public/assets/race-day-pulse.js','utf8').includes('Save image'));
assert.ok(!fs.readFileSync('src/race-day-pulse.js','utf8').includes('Equibase'));
console.log('RACE-DAY PULSE TESTS PASS: certified feed, no-leak, cutoff, share controls, immutable snapshot');

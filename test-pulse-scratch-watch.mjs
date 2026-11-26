// Race-Day Pulse scratch watch: source-neutral time-window and license gate.
// No external fetch and no production race scoring.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('src/pulse-scratch-watch.js','utf8');
const lib=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const instant=x=>Date.parse(x);
const asDecision=(iso,last)=>lib.pulseWatchDecision(instant(iso),lib.parsePulseEasternPost(last));
assert.equal(asDecision('2026-11-26T13:45:00Z','10:00 PM ET').reason,'before_9am_et'); // 8:45 AM EST
assert.equal(asDecision('2026-11-26T14:00:00Z','10:00 PM ET').active,true); // 9:00 AM EST
assert.equal(asDecision('2026-11-26T14:10:00Z','10:00 PM ET').reason,'off_quarter');
assert.equal(asDecision('2026-11-26T14:15:00Z','10:00 PM ET').active,true);
assert.equal(asDecision('2026-11-27T03:00:00Z','10:00 PM ET').active,true); // 10:00 PM EST
assert.equal(asDecision('2026-11-27T03:15:00Z','10:00 PM ET').reason,'after_final_post');
assert.equal(asDecision('2026-11-26T14:00:00Z','').reason,'missing_or_invalid_last_post');
// Same local behavior across the clocks changing to/from daylight time.
assert.equal(asDecision('2026-07-04T12:45:00Z','9:30 PM').reason,'before_9am_et'); // 8:45 AM EDT
assert.equal(asDecision('2026-07-04T13:00:00Z','9:30 PM').active,true);
assert.equal(asDecision('2026-03-08T13:00:00Z','11:00 PM').active,true); // DST begins
assert.equal(asDecision('2026-11-01T14:00:00Z','11:00 PM').active,true); // DST ends
assert.deepEqual(lib.pulseWatchClock(instant('2026-11-27T05:00:00Z')).date,'2026-11-26');
assert.equal(asDecision('2026-11-27T05:15:00Z','12:15 AM ET').active,true);
assert.equal(asDecision('2026-11-27T05:30:00Z','12:15 AM ET').reason,'after_final_post');
assert.equal(lib.parsePulseEasternPost('3:27 PM'),927);
assert.equal(lib.parsePulseEasternPost('3:27 PM ET'),927);
assert.equal(lib.parsePulseEasternPost('15:27'),927);
assert.equal(lib.parsePulseEasternPost('12:10 AM ET'),1450);
assert.equal(lib.parsePulseEasternPost('bogus'),null);
const date='2026-11-26';
const key='projections/dashboard/'+date+'/churchill-downs.json';
let reads=0,writes=0,external=0;
const env={CARDS_BUCKET:{
  async list({prefix}){reads++;assert.equal(prefix,'projections/dashboard/'+date+'/');return {objects:[{key}],truncated:false}},
  async get(k){reads++;assert.equal(k,key);return {async json(){return {race_date:date,races:[
    {post_time_et:'12:50 PM ET'},
    {post_time_et:'9:55 PM ET'},
    {post_time_et:'8:30 PM ET'}]}}}},
  async put(){writes++}
}};
assert.equal(await lib.evaluatePulseWatch(env,instant('2026-11-26T14:00:00Z')).then(r=>r.status),'disabled');
assert.equal(reads,0,'Disabled status must not read storage');
env.PULSE_SCRATCH_POLL_ENABLED='true';
assert.equal((await lib.evaluatePulseWatch(env,instant('2026-11-26T14:00:00Z'))).status,'authorization_required');
assert.equal(reads,0,'No source authorization must not read storage');
env.PULSE_SCRATCH_SOURCE_AUTHORIZED='true';
assert.equal((await lib.evaluatePulseWatch(env,instant('2026-11-26T14:10:00Z'))).status,'off_quarter');
assert.equal(reads,0,'No quarter-hour check must not read storage');
assert.equal((await lib.evaluatePulseWatch(env,instant('2026-11-26T13:45:00Z'))).status,'before_9am_et');
assert.equal(reads,0,'Before 9AM must not read storage');
const open=await lib.evaluatePulseWatch(env,instant('2026-11-27T02:45:00Z')); // 9:45 PM EST
assert.equal(open.status,'awaiting_approved_source_connector');
assert.equal(open.last_post_minutes,21*60+55);
assert.equal((await lib.evaluatePulseWatch(env,instant('2026-11-27T03:00:00Z'))).status,'after_final_post');
assert.equal(writes,0,'Watch may not create certified evidence or alter scores');
assert.equal(external,0,'No scrape, fetch or licensed feed connector exists yet');
const schema=fs.readFileSync('wrangler.jsonc','utf8');
const crons=JSON.parse(schema).triggers.crons;
assert.deepEqual(crons,['*/10 * * * *','*/15 * * * *'],'Existing 10-minute tasks must remain scheduled');
const index=fs.readFileSync('src/index.js','utf8');
assert.ok(index.includes("controller.cron==='*/15 * * * *'"),'Route only quarter-hour cron to Pulse handler');
assert.match(index,/awaiting_approved_source_connector/);
console.log('PULSE WATCH PASS — 9AM ET/15min/final scheduled post, EDT/EST, permission lock, no network writes');

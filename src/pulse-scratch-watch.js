// Race-Day Pulse scratch-watch window.
// This module ONLY evaluates whether an authorized source check is due.
// It never fetches Equibase, initiates TRI/F4 scoring, or publishes a card.
// Source connector remains OFF until express permission and a separate QA gate.
const EASTERN='America/New_York';
const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
const datePieces=ms=>{
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:EASTERN,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date(ms));
  const v=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {date:v.year+'-'+v.month+'-'+v.day,hour:Number(v.hour),minute:Number(v.minute)};
};
const yesterday=ymd=>new Date(Date.parse(ymd+'T00:00:00Z')-86400000).toISOString().slice(0,10);
export function pulseWatchClock(now){
  const {date,hour,minute}=datePieces(now);
  // North American racing cards can finish shortly after midnight ET.
  return {date:hour<3?yesterday(date):date,minutes:hour<3?1440+hour*60+minute:hour*60+minute,
    hour,minute};
}
export function parsePulseEasternPost(postTime){
  // Existing Timeform dashboard post_time_et is human readable and ET-local.
  // A time before 03:00 is treated as the final stretch of the previous
  // racing date. Never attempt to infer a clock from the race number.
  if(typeof postTime!=='string')return null;
  const s=postTime.trim().toUpperCase().replace(/\s+(?:EST|EDT|ET)$/,'');
  let hour,minute;
  let m=/^(\d{1,2}):(\d{2})\s*(AM|PM)$/.exec(s);
  if(m){
    hour=Number(m[1]);minute=Number(m[2]);
    if(hour<1||hour>12||minute>59)return null;
    hour=(hour%12)+(m[3]==='PM'?12:0);
  }else{
    m=/^(\d{1,2}):(\d{2})$/.exec(s);
    if(!m)return null;
    hour=Number(m[1]);minute=Number(m[2]);
    if(hour>23||minute>59)return null;
  }
  const minutes=hour*60+minute;
  return hour<3?minutes+1440:minutes;
}
export function pulseWatchDecision(now,lastPostTime){
  const clock=pulseWatchClock(now);
  if(!Number.isFinite(lastPostTime)||lastPostTime<9*60||lastPostTime>24*60+179)
    return {active:false,reason:'missing_or_invalid_last_post',date:clock.date};
  if(clock.minute%15!==0)return {active:false,reason:'off_quarter',date:clock.date};
  if(clock.minutes<9*60)return {active:false,reason:'before_9am_et',date:clock.date};
  if(clock.minutes>lastPostTime)return {active:false,reason:'after_final_post',date:clock.date};
  return {active:true,reason:'within_watch_window',date:clock.date,
    local_minutes:clock.minutes,last_post_minutes:lastPostTime};
}
export async function pulseDayLastPost(env,date){
  if(!env?.CARDS_BUCKET||!dayPattern.test(date))return null;
  // Approved private Timeform-derived dashboard is the authoritative
  // *schedule* (never an externally scraped page).
  const prefix='projections/dashboard/'+date+'/';
  const listing=await env.CARDS_BUCKET.list({prefix,limit:100});
  if(listing.truncated)return null; // fail closed when not all tracks checked
  let latest=null;
  for(const ref of listing.objects||[]){
    if(!ref.key.startsWith(prefix)||!/^[-a-z0-9]+\.json$/.test(ref.key.slice(prefix.length)))continue;
    const object=await env.CARDS_BUCKET.get(ref.key);
    if(!object)continue;
    let card;
    try{card=await object.json();}catch{continue;}
    if(card?.race_date!==date||!Array.isArray(card.races))continue;
    for(const race of card.races){
      if(race?.cancelled||race?.status==='cancelled')continue;
      const m=parsePulseEasternPost(race?.post_time_et);
      if(m!==null&&m>=9*60)latest=Math.max(latest??0,m);
    }
  }
  return latest;
}
export async function evaluatePulseWatch(env,now=Date.now()){
  if(env?.PULSE_SCRATCH_POLL_ENABLED!=='true')return {status:'disabled'};
  if(env?.PULSE_SCRATCH_SOURCE_AUTHORIZED!=='true')
    return {status:'authorization_required'}; // never contact unapproved feed
  const clock=pulseWatchClock(now);
  if(clock.minute%15!==0)return {status:'off_quarter',date:clock.date};
  if(clock.minutes<9*60)return {status:'before_9am_et',date:clock.date};
  const last=await pulseDayLastPost(env,clock.date);
  const decision=pulseWatchDecision(now,last);
  if(!decision.active)return {status:decision.reason,date:decision.date};
  // An authorized RSS/XML source adapter and separately approved scorer
  // trigger are intentionally NOT included in this release. NO outbound fetch.
  return {status:'awaiting_approved_source_connector',date:clock.date,
    local_minutes:clock.minutes,last_post_minutes:last};
}

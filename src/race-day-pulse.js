// Race-Day Pulse: release-safe public insights derived from private, certified
// prescratch / scratch-final TRI + F4 cards. NO scoring engine or private API.
const BASE_PREFIX='race-day-pulse/prescratch/';
const DASH_PREFIX='projections/dashboard/';
const PUBLIC_ARCHIVE_PREFIX='race-day-pulse/public/';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=45, must-revalidate','X-Content-Type-Options':'nosniff'};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const HASH=/^[a-f0-9]{64}$/i;
const clean=(s,max=120)=>String(s||'').replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,max);
const slug=s=>clean(s,120).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const result=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:HEADERS});
const cardValid=c=>c&&c.schema_version===1&&DATE.test(c.race_date||'')&&typeof c.track_name==='string'&&Array.isArray(c.races);
const verifiedFinal=c=>cardValid(c)&&c.projection_status==='scratch_final'&&c.factor_basis==='verified_scratch_final'&&['tri_sha256','f4_sha256','prescratch_parent_sha256','official_changes_sha256'].every(k=>HASH.test(c.model_receipts?.[k]||''));
const baseKey=c=>BASE_PREFIX+c.race_date+'/'+slug(c.track_name)+'.json';
const trackKey=c=>DASH_PREFIX+c.race_date+'/'+slug(c.track_name)+'.json';
const archiveKey=date=>PUBLIC_ARCHIVE_PREFIX+date+'.json';
const pct=n=>n.toFixed(1)+'%';
function newYorkCutoff(now){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const day=parts.year+'-'+parts.month+'-'+parts.day;
  return Number(parts.hour)>=3?day:new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);
}
function runners(race){
  const map=new Map();
  if(!Array.isArray(race?.entries))return null;
  for(const item of race.entries){
    const n=clean(item?.program_number,8).toUpperCase(),w=item?.win_probability_exact;
    if(!n||map.has(n)||w==null||!Number.isFinite(Number(w))||Number(w)<0||Number(w)>100)return null;
    map.set(n,{program:n,horse:clean(item.horse_name,95),win:Number(w),f4:item.f4_probabilities||{}});
  }
  return map.size?map:null;
}
function winner(map){return [...map.values()].sort((a,b)=>b.win-a.win||a.program.localeCompare(b.program))[0];}
function compareRaces(previous,current){
  if(!current?.scratches?.length||current.scratch_count!==current.scratches.length)return null;
  const before=runners(previous),after=runners(current);
  if(!before||!after||after.size<2)return null;
  const removed=new Set(current.scratches.map(s=>clean(s.program_number,8).toUpperCase()));
  if(removed.size!==current.scratches.length||[...removed].some(p=>!before.has(p)||after.has(p)))return null;
  if([...after.keys()].some(p=>!before.has(p))||[...before.keys()].some(p=>!removed.has(p)&&!after.has(p)))return null;
  // Names matter for customer-facing chip identity. Suppress any race where
  // scorer/card source identity drifted, rather than printing the wrong horse.
  if([...after].some(([program,runner])=>runner.horse.toLocaleLowerCase('en')!==before.get(program)?.horse.toLocaleLowerCase('en')))return null;
  if(current.scratches.some(x=>{
    const program=clean(x.program_number,8).toUpperCase(),previous=before.get(program);
    return !previous||!previous.horse||!clean(x.horse_name,95)||
      clean(x.horse_name,95).toLocaleLowerCase('en')!==previous.horse.toLocaleLowerCase('en');
  }))return null;
  if([before,after].some(m=>Math.abs([...m.values()].reduce((s,r)=>s+r.win,0)-100)>0.00001))return null;
  return {before,after};
}
function lead(race){
  const s=race.scratches;
  if(s.length===1)return 'With #'+clean(s[0].program_number,8)+' scratched, ';
  if(s.length===2)return 'After #'+clean(s[0].program_number,8)+' and #'+clean(s[1].program_number,8)+' scratched, ';
  return 'Following '+s.length+' confirmed scratches, ';
}
export function insightForRace(date,track,initial,revised,updatedAt){
  const pair=compareRaces(initial,revised);
  if(!pair)return null;
  const {before,after}=pair,oldLead=winner(before),newLead=winner(after);
  const scratches=revised.scratches.map(x=>({
    program:clean(x.program_number,8).toUpperCase(),
    horse:clean(x.horse_name||before.get(clean(x.program_number,8).toUpperCase())?.horse,95)
  }));
  // Publish only the confirmed scratch identities and the explicitly selected
  // active horse. Never leak the complete runner field or private score vector.
  const common={id:slug(track)+'-race-'+revised.race_number,date,track:clean(track,90),race_number:revised.race_number,
    updated_at:updatedAt,post_time_et:clean(revised.post_time_et,38),
    hub_url:'/store/?date='+encodeURIComponent(date),chip:newLead.program,scratches};
  if(oldLead.program!==newLead.program){
    const earlier=before.get(newLead.program);
    const stayed=after.has(oldLead.program);
    const moved=earlier?newLead.win-earlier.win:0;
    // A scratched top choice creates an obvious new favorite by elimination.
    // Rank that routine change below genuine survivor-vs-survivor reversals.
    // Do not force publication of trivial elimination effects.
    if(stayed||moved>=4){
      return {...common,kind:stayed?'NEW_FAVORITE':'FAVORITE_SCRATCHED',
        headline:stayed?'New projected favorite':'New leader after favorite scratched',
        chip:newLead.program,horse:newLead.horse,
        priority:(stayed?100:42)+Math.max(0,moved),
        message:lead(revised)+'#'+newLead.program+' '+newLead.horse+' is TRI’s new projected favorite at '+pct(newLead.win)+
          (earlier?', up from '+pct(earlier.win)+' before the scratches.':'.')};
    }
  }
  const changed=[...after.values()].map(h=>({h,old:before.get(h.program),delta:h.win-before.get(h.program).win}))
    .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  if(changed[0]&&Math.abs(changed[0].delta)>=4){
    const x=changed[0];
    return {...common,kind:'WIN_SHIFT',headline:'Scratch-driven projection shift',chip:x.h.program,horse:x.h.horse,
      priority:50+Math.abs(x.delta),
      message:lead(revised)+'#'+x.h.program+' '+x.h.horse+' has '+(x.delta>0?'risen':'fallen')+' from '+
        pct(x.old.win)+' to '+pct(x.h.win)+' in TRI’s updated win projections.'};
  }
  const underneath=[...after.values()].map(h=>{
    const prior=before.get(h.program);
    const a=Number(h.f4.exact_p2)+Number(h.f4.exact_p3),b=Number(prior.f4.exact_p2)+Number(prior.f4.exact_p3);
    return {h,a,b,delta:(a-b)*100};
  }).filter(x=>Number.isFinite(x.a)&&Number.isFinite(x.b)&&x.a>=0&&x.a<=1&&x.b>=0&&x.b<=1)
    .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  if(underneath[0]&&Math.abs(underneath[0].delta)>=7){
    const x=underneath[0];
    return {...common,kind:'F4_SHIFT',headline:'Underneath outlook changes',chip:x.h.program,horse:x.h.horse,
      priority:20+Math.abs(x.delta),
      message:lead(revised)+'#'+x.h.program+' '+x.h.horse+' now carries a combined '+
        pct(x.a*100)+' chance of finishing second or third, versus '+pct(x.b*100)+' before the scratches.'};
  }
  return null; // No forced posts, no unverified pace-causality claims.
}
export async function captureInitialPulseSnapshot(env,initial){
  if(!env?.CARDS_BUCKET||!cardValid(initial)||initial.projection_status!=='prescratch')return false;
  const key=baseKey(initial);
  if(await env.CARDS_BUCKET.head(key))return false;
  await env.CARDS_BUCKET.put(key,JSON.stringify(initial),{httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:'private, no-store'}});
  return true;
}
export function choosePulseInsights(sortedCandidates,limit=6){
  // Encourage coverage across multiple tracks without manufacturing content.
  // When only one track has genuine alerts, it may still fill the scroller.
  const chosen=[],chosenIds=new Set(),trackCounts=new Map();
  for(const item of sortedCandidates){
    if(chosen.length>=limit)break;
    const key=slug(item.track);
    if((trackCounts.get(key)||0)>=2||chosenIds.has(item.id+'|'+item.date))continue;
    chosen.push(item);chosenIds.add(item.id+'|'+item.date);
    trackCounts.set(key,(trackCounts.get(key)||0)+1);
  }
  for(const item of sortedCandidates){
    if(chosen.length>=limit)break;
    const id=item.id+'|'+item.date;
    if(chosenIds.has(id))continue;
    chosen.push(item);chosenIds.add(id);
  }
  return chosen;
}
export async function readRaceDayPulse(env,now=Date.now()){
  const date=newYorkCutoff(now),items=[];
  if(!env?.CARDS_BUCKET)return {date,items,status:'unavailable'};
  const listing=await env.CARDS_BUCKET.list({prefix:DASH_PREFIX+date+'/',limit:100});
  for(const reference of listing.objects||[]){
    if(!new RegExp('^projections/dashboard/'+date+'/[a-z0-9-]+\\.json$').test(reference.key))continue;
    const object=await env.CARDS_BUCKET.get(reference.key);
    if(!object)continue;
    // Explicit release holds from the normal staging pipeline.
    const release=object.customMetadata?.release_at;
    if(release && (!Number.isFinite(Date.parse(release))||Date.parse(release)>now))continue;
    // No premature public exposure of unpublished / owner-review-only data.
    if(object.customMetadata?.customer_publish_approved!=='true'&&String(object.customMetadata?.stage||'').toUpperCase()!=='SCRATCH_FINAL')continue;
    let current,original;
    try{current=await object.json();}catch{continue;}
    if(!verifiedFinal(current)||current.race_date!==date)continue;
    const old=await env.CARDS_BUCKET.get(baseKey(current));
    if(!old)continue;
    try{original=await old.json();}catch{continue;}
    if(!cardValid(original)||original.race_date!==date||original.projection_status!=='prescratch'||slug(original.track_name)!==slug(current.track_name))continue;
    // Certified parent F4 ancestry must agree when that receipt exists.
    if(HASH.test(original.model_receipts?.f4_sha256||'')&&original.model_receipts.f4_sha256!==current.model_receipts.prescratch_parent_sha256)continue;
    const earlier=new Map(original.races.map(r=>[r.race_number,r]));
    const updatedAt=object.customMetadata?.uploaded_at||reference.uploaded?.toISOString?.()||null;
    for(const race of current.races){
      const post=insightForRace(date,current.track_name,earlier.get(race.race_number),race,updatedAt);
      if(post)items.push(post);
    }
  }
  items.sort((a,b)=>b.priority-a.priority||a.track.localeCompare(b.track)||a.race_number-b.race_number);
  const publicItems=choosePulseInsights(items).map(({priority,...rest})=>rest);
  // Save only facts we ALREADY exposed through this approved public API. This
  // lets old shared links remain useful after 3AM rollover or source pruning.
  // Never archive the private cards, runner matrices or F4 receipts.
  if(publicItems.length) {
    try{await preservePublicPulseArchive(env,date,publicItems);}
    catch(error){console.warn('Pulse public-archive preservation deferred',String(error).slice(0,120));}
  }
  return {date,items:publicItems,status:'ok'};
}
async function preservePublicPulseArchive(env,date,items){
  const key=archiveKey(date);
  const old=await env.CARDS_BUCKET.get(key);
  let history={schema_version:1,date,items:[]};
  if(old){
    const candidate=await old.json();
    if(candidate?.schema_version!==1||candidate.date!==date||!Array.isArray(candidate.items))
      throw Error('Existing public Pulse archive disagrees with date/schema');
    history=candidate;
  }
  const existing=new Map(history.items.filter(x=>x?.id&&x.date===date).map(x=>[x.id,x]));
  let changed=!old;
  for(const item of items){
    const older=existing.get(item.id);
    if(!older||JSON.stringify(older)!==JSON.stringify(item)){
      changed=true;existing.set(item.id,item);
    }
  }
  if(changed)await env.CARDS_BUCKET.put(key,JSON.stringify({schema_version:1,date,items:[...existing.values()].slice(-120)}),{
    httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:'private, no-store'},
    customMetadata:{public_safe_derived:'true',last_updated:new Date().toISOString()}
  });
}
async function archivedPulse(env,date,id){
  if(!DATE.test(date)||date>newYorkCutoff(Date.now())||!env?.CARDS_BUCKET)return null;
  const o=await env.CARDS_BUCKET.get(archiveKey(date));
  if(!o||o.customMetadata?.public_safe_derived!=='true')return null;
  const data=await o.json();
  if(data?.schema_version!==1||data.date!==date||!Array.isArray(data.items))return null;
  const item=data.items.find(x=>x?.date===date&&x.id===id);
  if(!item||!/^[-a-z0-9]{2,120}$/.test(String(item.id))||
     !['NEW_FAVORITE','FAVORITE_SCRATCHED','WIN_SHIFT','F4_SHIFT'].includes(item.kind))return null;
  return item;
}
export async function handlePulseApi(request,env){
  if(request.method!=='GET'&&request.method!=='HEAD')return result({error:'Method not allowed'},405);
  // Cache sanitized, public-only output at the Cloudflare edge, not private R2
  // documents. ET date in the cache key prevents yesterday's feed surviving a
  // 3AM rollover. A 45-second TTL bounds refresh latency after certified writes.
  const cache=globalThis.caches?.default;
  const cacheUrl=new URL('/api/race-day-pulse',request.url);
  cacheUrl.searchParams.set('et_date',newYorkCutoff(Date.now()));
  const cacheRequest=new Request(cacheUrl.toString(),{method:'GET'});
  if(cache){
    try{
      const cached=await cache.match(cacheRequest);
      if(cached)return request.method==='HEAD'?new Response(null,{headers:HEADERS}):cached;
    }catch(error){console.warn('Pulse cache lookup deferred',String(error).slice(0,100));}
  }
  const data=await readRaceDayPulse(env),response=result(data);
  if(cache&&data.status==='ok'){
    try{await cache.put(cacheRequest,response.clone());}
    catch(error){console.warn('Pulse cache store deferred',String(error).slice(0,100));}
  }
  return request.method==='HEAD'?new Response(null,{headers:HEADERS}):response;
}
const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function handlePulsePage(request,env,route){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
  const [,date,id]=route;
  const today=newYorkCutoff(Date.now());
  // Historical shares use the small public-only archive without expensive
  // current-day dashboard reads. Current shares use the verified moving feed.
  const feed=date===today?await readRaceDayPulse(env):null;
  const item=(feed?.items.find(x=>x.id===id))||await archivedPulse(env,date,id);
  if(!item)return new Response('This race-day insight is not available.',{status:404,headers:{'Cache-Control':'no-store'}});
  const title=item.track+' Race '+item.race_number+' | Race-Day Pulse';
  const desc=item.message;
  const canonical='https://railandryeracing.com/pulse/'+date+'/'+id;
  const sharedChip=(program,scratched=false)=>{
    const text=clean(program,8).toUpperCase(),parsed=/^(\d{1,2})([A-Z]?)$/.exec(text);
    const number=parsed?Number(parsed[1]):0;
    const className=scratched?'rr-pulse-saddle rr-pulse-saddle--scratch':'rr-pulse-saddle';
    if(number>=1&&number<=20)
      return '<span class="'+className+'"><img src="/assets/approved/saddlecloths/'+number+
        '.png" width="32" height="32" alt="Saddlecloth '+escape(text)+'">'+
        (parsed[2]?'<span class="rr-pulse-suffix">'+escape(parsed[2])+'</span>':'')+'</span>';
    return '<span class="'+className+' rr-pulse-saddle-fallback">'+escape(text)+'</span>';
  };
  const scratchLine=Array.isArray(item.scratches)&&item.scratches.length?
    '<div class="rr-pulse-share-scratches"><span class="rr-pulse-scratch-label">SCRATCHED</span>'+
    item.scratches.map(x=>'<span class="rr-pulse-scratch-identity">'+
      sharedChip(x.program,true)+'<span class="rr-pulse-scratch-name">'+escape(x.horse)+'</span></span>').join('')+
    '</div>':'';
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+escape(title)+'</title><meta name="description" content="'+escape(desc)+'">'+
    '<meta property="og:type" content="article"><meta property="og:title" content="'+escape(title)+'">'+
    '<meta property="og:description" content="'+escape(desc)+'"><meta property="og:url" content="'+escape(canonical)+'">'+
    '<meta property="og:image" content="https://railandryeracing.com/assets/approved/home/hero-dust-charged-finish.jpg">'+
    '<meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="'+escape(canonical)+'">'+
    '<link rel="stylesheet" href="/assets/rail-rye-core.css"><link rel="stylesheet" href="/assets/race-day-pulse.css">'+
    '</head><body class="rr-pulse-standalone"><main class="rr-pulse-share-page"><a class="rr-pulse-home-link" href="/">RAIL &amp; RYE RACING</a>'+
    '<article class="rr-pulse-story"><p class="rr-pulse-eyebrow">RACE-DAY PULSE · '+escape(date)+'</p>'+
    '<div class="rr-pulse-story-content">'+sharedChip(item.chip)+
    '<div><h1>'+escape(item.track)+' · Race '+item.race_number+'</h1><h2>'+escape(item.headline)+'</h2>'+
    '<p class="rr-pulse-affected">'+escape(item.horse||'')+'</p><p>'+escape(desc)+'</p></div></div>'+scratchLine+
    '<p class="rr-pulse-foot">Updated after source-verified scratch processing. Projections are estimates, not guarantees.</p>'+
    '<a class="rr-pulse-primary" href="'+escape(item.hub_url)+'">Explore the Intelligence Hub</a>'+
    '<a class="rr-pulse-secondary" href="/">See today’s Race-Day Pulse</a></article></main></body></html>';
  return new Response(request.method==='HEAD'?null:html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=45, must-revalidate','X-Content-Type-Options':'nosniff'}});
}

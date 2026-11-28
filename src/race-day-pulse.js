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
// Documented incomplete historical roster: CD Nov 27 R9 omitted confirmed AE #13.
// No later reconstruction may masquerade as a contemporaneous forecast.
const historicalRosterHolds=new Set(['2026-11-27|churchill-downs|9']);
const rosterHeld=(date,track,race)=>historicalRosterHolds.has(date+'|'+slug(track)+'|'+race.race_number)||race.final_field_roster_status==='UNRESOLVED'||race.retrospective===true;
function newYorkCutoff(now){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const day=parts.year+'-'+parts.month+'-'+parts.day;
  return Number(parts.hour)>=3?day:new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);
}
// Owner-approved first racing day. The optional start-date gate is evaluated
// at the same Eastern 3AM cutoff as the feed, never the server's UTC date.
export function pulseReleaseEnabled(env,now=Date.now()){
  if(env?.PULSE_PUBLICATION_ENABLED!=='true')return false;
  const start=env.PULSE_PUBLICATION_START_DATE;
  return start===undefined||start===''||(DATE.test(start)&&newYorkCutoff(now)>=start);
}
function runners(race){
  const map=new Map();
  if(!Array.isArray(race?.entries))return null;
  for(const item of race.entries){
    const n=clean(item?.program_number,8).toUpperCase(),w=item?.win_probability_exact;
    if(!n||map.has(n)||w==null||!Number.isFinite(Number(w))||Number(w)<0||Number(w)>100)return null;
    map.set(n,{program:n,horse:clean(item.horse_name,95),win:Number(w),f4:item.f4_probabilities||{},rank:Number.isInteger(item.rank)&&item.rank>0?item.rank:null});
  }
  return map.size?map:null;
}
function publicSummary(runner,field){
  // Rank is optional and comes from the certified scorer, not the PWIN sort.
  const rank=runner.rank&&runner.rank<=field.size?runner.rank:null;
  return {projected_rank:rank,win_probability:runner.win};
}
function winner(map){return [...map.values()].sort((a,b)=>b.win-a.win||a.program.localeCompare(b.program))[0];}
function compareRaces(previous,current){
  if(!current?.scratches?.length||current.scratch_count!==current.scratches.length)return null;
  const before=runners(previous),after=runners(current);
  if(!before||!after||after.size<2)return null;
  const listed=current.scratches.map(s=>clean(s.program_number,8).toUpperCase());
  if(new Set(listed).size!==listed.length)return null;
  // Certified scratch lists may also contain AEs that were never in the
  // original active field. They must NOT be credited with changing race pace
  // or projections. Only removed original starters count as change drivers.
  const activeScratches=current.scratches.filter(x=>before.has(clean(x.program_number,8).toUpperCase()));
  const removed=new Set(activeScratches.map(s=>clean(s.program_number,8).toUpperCase()));
  if(!removed.size||[...removed].some(p=>after.has(p)))return null;
  if([...after.keys()].some(p=>!before.has(p))||
     [...before.keys()].some(p=>!removed.has(p)&&!after.has(p)))return null;
  if(current.scratches.some(x=>after.has(clean(x.program_number,8).toUpperCase())))return null;
  // Names matter for customer-facing chip identity. Suppress any race where
  // scorer/card source identity drifted, rather than printing the wrong horse.
  if([...after].some(([program,runner])=>runner.horse.toLocaleLowerCase('en')!==before.get(program)?.horse.toLocaleLowerCase('en')))return null;
  if(activeScratches.some(x=>{
    const program=clean(x.program_number,8).toUpperCase(),previous=before.get(program);
    return !previous?.horse||!clean(x.horse_name,95)||
      clean(x.horse_name,95).toLocaleLowerCase('en')!==previous.horse.toLocaleLowerCase('en');
  }))return null;
  if([before,after].some(m=>Math.abs([...m.values()].reduce((s,r)=>s+r.win,0)-100)>0.00001))return null;
  return {before,after,activeScratches};
}
// Write only what the certified before/after cards establish. No invented
// form, running styles, pace pressure, value claims or post-hoc performance.
function lead(scratches){
  if(scratches.length===1)return 'With #'+clean(scratches[0].program_number,8)+' '+clean(scratches[0].horse_name,95)+' out, ';
  if(scratches.length===2)return 'With #'+clean(scratches[0].program_number,8)+' and #'+clean(scratches[1].program_number,8)+' out, ';
  return 'After '+scratches.length+' scratches, ';
}
function revisionToken(source){
  // Public-safe short label of a certified revision's source fingerprint.
  // Do not reveal raw internal hash, model coefficients or score receipts.
  if(!source)return '';
  let value=2166136261;
  for(const ch of String(source))value=Math.imul(value^ch.charCodeAt(0),16777619);
  return '-rev-'+(value>>>0).toString(16).padStart(8,'0');
}
export function insightForRace(date,track,initial,revised,updatedAt,sourceVersion=''){
  const pair=compareRaces(initial,revised);
  if(!pair)return null;
  const {before,after,activeScratches}=pair,oldLead=winner(before),newLead=winner(after);
  const initialSurface=clean(initial?.surface,28),finalSurface=clean(revised?.surface,28);
  const surfaceChanged=!!initialSurface&&!!finalSurface&&
    initialSurface.toLowerCase()!==finalSurface.toLowerCase();
  const raceName=ordinalRace(revised.race_number);
  const context=lead(activeScratches);
  const beforeSurface=initialSurface.toLowerCase(),afterSurface=finalSurface.toLowerCase();
  const scratches=activeScratches.map(x=>({
    program:clean(x.program_number,8).toUpperCase(),
    horse:clean(x.horse_name||before.get(clean(x.program_number,8).toUpperCase())?.horse,95)
  }));
  // Publish only the confirmed scratch identities and the explicitly selected
  // active horse. Never leak the complete runner field or private score vector.
  const common={id:slug(track)+'-race-'+revised.race_number+revisionToken(sourceVersion),
    date,track:clean(track,90),race_number:revised.race_number,
    updated_at:updatedAt,post_time_et:clean(revised.post_time_et,38),
    hub_url:'/intelligence/race-cards/?date='+encodeURIComponent(date)+
      '&track='+encodeURIComponent(track)+'&race='+encodeURIComponent(String(revised.race_number)),
    chip:newLead.program,scratches};
  // Hold mixed surface/scratch changes pending validated condition modeling.
  if(surfaceChanged)return null;
  if(oldLead.program!==newLead.program){
    const earlier=before.get(newLead.program);
    const stayed=after.has(oldLead.program);
    const moved=earlier?newLead.win-earlier.win:0;
    // A scratched top choice creates an obvious new favorite by elimination.
    // Rank that routine change below genuine survivor-vs-survivor reversals.
    // Do not force publication of trivial elimination effects.
    if(stayed||!after.has(oldLead.program)){
      return {...common,kind:stayed?'NEW_FAVORITE':'FAVORITE_SCRATCHED',
        headline:stayed?'New Projected Favorite':'New Leader After Favorite Scratched',
        chip:newLead.program,horse:newLead.horse,
        priority:(stayed?100:120)+Math.max(0,moved),
        metric:{label:'WIN',before:earlier.win,after:newLead.win},summary:publicSummary(newLead,after),
        short_message:stayed?'#'+newLead.program+' '+newLead.horse+' moves to the top of our projections.':'Projected favorite '+oldLead.horse+' scratched; '+newLead.horse+' now leads.',
        message:context+'#'+newLead.program+' '+newLead.horse+
          ' moves to the top of our projections for the '+raceName+'. '+
          'The revised win chance is '+pct(newLead.win)+
          (earlier?', up from '+pct(earlier.win)+' on the original card.':'.')};
    }
  }
  const changed=[...after.values()].map(h=>({h,old:before.get(h.program),delta:h.win-before.get(h.program).win}))
    .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  if(changed[0]&&Math.abs(changed[0].delta)>=4){
    const x=changed[0];
    return {...common,kind:'WIN_SHIFT',headline:'Projected Fair Odds Shift',chip:x.h.program,horse:x.h.horse,
      priority:50+Math.abs(x.delta),
      metric:{label:'WIN',before:x.old.win,after:x.h.win},summary:publicSummary(x.h,after),
      short_message:'Projected fair odds '+(x.delta>0?'shorten':'lengthen')+' after the scratches.',
      message:context+'#'+x.h.program+' '+x.h.horse+
        (x.h.program===newLead.program?' remains our top choice in the '+raceName+'.':' sees a change in the '+raceName+'.')+
        ' The win chance moves from '+pct(x.old.win)+' to '+pct(x.h.win)+
        '. '+(Math.abs(x.delta)<7?'A modest change, but enough to notice.':'That is a substantial change to the original projection.')};
  }
  return null; // No forced posts, no unverified pace-causality claims.
}
// Pace Advantage is a factual change in the TRI Pace Fit output after a
// certified scratch rerun, not an assertion that pace caused the PWIN change.
export function paceInsightsForRace(date,track,initial,revised,updatedAt,sourceVersion=''){
  const pair=compareRaces(initial,revised);
  if(!pair)return [];
  const norm=v=>String(v??'').trim().toLowerCase();
  if(!norm(initial.surface)||norm(initial.surface)!==norm(revised.surface))return [];
  for(const field of ['track_condition','distance','temporary_rail_feet'])if(norm(initial[field])!==norm(revised[field]))return [];
  const oldEntries=new Map(initial.entries.map(e=>[norm(e.program_number),e]));
  const currentEntries=new Map(revised.entries.map(e=>[norm(e.program_number),e]));
  const levels={red:0,gray:1,green:2};
  const names={red:'negative',gray:'neutral',green:'positive'};
  function fit(e){
    const a=Array.isArray(e?.metrics)?e.metrics.filter(m=>m?.label==='Pace Fit'):[];
    return a.length===1&&Object.hasOwn(levels,a[0].value)?a[0].value:null;
  }
  const {before,after,activeScratches}=pair;
  // Mixed rider/trainer changes are not a scratch-only pace comparison.
  for(const [key] of after){
    const a=oldEntries.get(norm(key)),b=currentEntries.get(norm(key));
    if(['jockey','trainer'].some(f=>norm(a?.[f])!==norm(b?.[f])))return [];
  }
  const paceNames={weak:'Weak',moderate:'Moderate',strong:'Strong'};
  // The dashboard's Moderate label may be an Insufficient-evidence fallback.
  // Require the frozen evaluator's original race metadata, not display labels.
  function verifiedPace(r){
    const m=r?.pace_meta,shape=paceNames[norm(m?.pace_shape)];
    if(!shape||norm(r.pace)!==norm(shape)||!Number.isInteger(m.field_size)||
      m.field_size!==r.entries.length||!Number.isInteger(m.early_evidence_n)||
      m.early_evidence_n<3||m.early_evidence_n>m.field_size||
      !Number.isFinite(m.early_coverage)||m.early_coverage<0.60||
      Math.abs(m.early_coverage-m.early_evidence_n/m.field_size)>1e-6||
      !Number.isInteger(m.fast_early_n)||m.fast_early_n<0||m.fast_early_n>m.early_evidence_n)return null;
    return shape;
  }
  const oldPace=verifiedPace(initial),newPace=verifiedPace(revised);
  if(!oldPace||!newPace)return [];
  const racePaceChanged=oldPace!==newPace;
  const candidates=[];
  for(const [key,runner] of after){
    const prev=before.get(key),a=fit(oldEntries.get(norm(key))),b=fit(currentEntries.get(norm(key)));
    if(a===null||b===null)continue;
    const fitChanged=levels[b]!==levels[a];
    if(!racePaceChanged&&!fitChanged)continue;
    // No arbitrary probability-point threshold or Gold dependency.
    // Describe the actual Pace Fit change and show the actual PWIN comparison.
    const horse=runner.horse;
    const label=racePaceChanged?'Projected race pace: '+oldPace+' → '+newPace+'.':'Pace Fit '+(levels[b]>levels[a]?'improves':'weakens')+' from '+names[a]+' to '+names[b]+'.';
    candidates.push({
      id:slug(track)+'-race-'+revised.race_number+'-pace-'+slug(key)+revisionToken(sourceVersion),
      date,track:clean(track,90),race_number:revised.race_number,updated_at:updatedAt,
      post_time_et:clean(revised.post_time_et,38),
      hub_url:'/intelligence/race-cards/?date='+encodeURIComponent(date)+'&track='+encodeURIComponent(track)+'&race='+encodeURIComponent(String(revised.race_number)),
      kind:'PACE_ADVANTAGE',headline:racePaceChanged?'Projected Pace Change':'Pace Fit Change',chip:key,horse,
      metric:{label:'WIN',before:prev.win,after:runner.win},pace_fit:{before:a,after:b},...(racePaceChanged?{race_pace:{before:oldPace,after:newPace}}:{}),
      summary:publicSummary(runner,after),short_message:label,
      message:racePaceChanged?lead(activeScratches)+'projected race pace changes from '+oldPace.toLowerCase()+' to '+newPace.toLowerCase()+'. '+horse+' has revised win probability '+pct(runner.win)+'.'+(fitChanged?' Pace Fit changes from '+names[a]+' to '+names[b]+'.':''):contextForPace(activeScratches,horse,a,b,names),
      scratches:activeScratches.map(x=>({program:clean(x.program_number,8).toUpperCase(),horse:clean(x.horse_name,95)})),
      priority:(racePaceChanged?95:65)+Math.abs(levels[b]-levels[a])*10+Math.abs(runner.win-prev.win)
    });
  }
  // Show the strongest pace change in each race without exposing the paid
  // full-field factor matrix. This is a race-level finding, not a daily cap.
  return candidates.sort((a,b)=>b.priority-a.priority||a.chip.localeCompare(b.chip)).slice(0,1);
}
function contextForPace(scratches,horse,a,b,names){
  return lead(scratches)+horse+"'s revised Pace Fit changes from "+names[a]+" to "+names[b]+".";
}
export async function captureInitialPulseSnapshot(env,initial){
  if(!env?.CARDS_BUCKET||!cardValid(initial)||initial.projection_status!=='prescratch')return false;
  const key=baseKey(initial);
  if(!HASH.test(initial.model_receipts?.tri_sha256||'')||!HASH.test(initial.model_receipts?.f4_sha256||''))return false;
  if(await env.CARDS_BUCKET.head(key))return false;
  const written=await env.CARDS_BUCKET.put(key,JSON.stringify(initial),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:'private, no-store'}});
  return written!==null;
}
export function choosePulseInsights(sortedCandidates){
  // All source-qualified insights, strongest first. No item quota or track quota.
  const seen=new Set();
  return sortedCandidates.filter(item=>{
    const key=item.id+'|'+item.date;
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}
export async function capturePublishedPulseBaselines(env,now=Date.now()){
  // Guarded private archive only. No public exposure and no private scorer.
  // Twice daily at 03:10 and 08:50 ET, as a safety net for direct-to-R2
  // publishers that bypass the website's prescratch upload hook.
  if(env?.PULSE_CAPTURE_BASELINES_ENABLED!=='true')return {status:'disabled',captured:0};
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const hour=Number(parts.hour),minute=Number(parts.minute);
  if(!((hour===3&&minute===10)||(hour===8&&minute===50)))
    return {status:'outside_snapshot_window',captured:0};
  const date=parts.year+'-'+parts.month+'-'+parts.day;
  if(!env.CARDS_BUCKET)return {status:'missing_private_storage',captured:0};
  const prefix=DASH_PREFIX+date+'/';
  const listing=await env.CARDS_BUCKET.list({prefix,limit:100});
  if(listing.truncated)return {status:'incomplete_dashboard_listing',captured:0};
  let captured=0,existing=0,unverified=0;
  for(const entry of listing.objects||[]){
    if(!entry.key.startsWith(prefix)||!/^[a-z0-9-]+\.json$/.test(entry.key.slice(prefix.length)))continue;
    const source=await env.CARDS_BUCKET.get(entry.key);
    if(!source)continue;
    let card;
    try{card=await source.json();}catch{unverified++;continue;}
    if(!cardValid(card)||card.race_date!==date||card.projection_status!=='prescratch'){
      unverified++;continue;
    }
    const validReceipts=HASH.test(card.model_receipts?.tri_sha256||'')&&
      HASH.test(card.model_receipts?.f4_sha256||'');
    const release=source.customMetadata?.release_at;
    const approved=['PRESCRATCH','PRESCRATCH_FINAL'].includes(String(source.customMetadata?.stage||'').toUpperCase())||
      source.customMetadata?.customer_publish_approved==='true';
    if(!validReceipts||!approved||(release&&(!Number.isFinite(Date.parse(release))||Date.parse(release)>now))){
      unverified++;continue;
    }
    if(await captureInitialPulseSnapshot(env,card))captured++;else existing++;
  }
  return {status:'checked',date,captured,existing,unverified};
}
export async function readRaceDayPulse(env,now=Date.now()){
  const date=newYorkCutoff(now),items=[];
  if(!env?.CARDS_BUCKET)return {date,items,status:'unavailable'};
  const references=[];let cursor;
  do{const listing=await env.CARDS_BUCKET.list({prefix:DASH_PREFIX+date+'/',limit:100,...(cursor?{cursor}:{})});references.push(...(listing.objects||[]));if(listing.truncated&&!listing.cursor)throw Error('Incomplete Pulse source listing');cursor=listing.truncated?listing.cursor:null;}while(cursor);
  for(const reference of references){
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
    // A certified replay can legitimately have a DIFFERENT F4 hash from
    // the original stored receipt, while independently proving byte-equivalent
    // original runner inputs and its own replay ancestry. Production scratch
    // publishers write this provenance in parent_replay_proof; never mistake
    // different hash domains for a failed lineage check.
    const parent=current.parent_replay_proof||{},stored=parent.stored_parent_receipts;
    const originalReceipts=original.model_receipts||{};
    const directParent=HASH.test(originalReceipts.f4_sha256||'')&&
      originalReceipts.f4_sha256===current.model_receipts.prescratch_parent_sha256;
    const storedMatches=stored&&typeof stored==='object'&&!Array.isArray(stored)&&
      Object.keys(stored).length===Object.keys(originalReceipts).length&&
      Object.entries(originalReceipts).every(([key,value])=>stored[key]===value);
    const certifiedReplay=!!storedMatches&&HASH.test(parent.replay_tri_sha256||'')&&
      parent.replay_f4_sha256===current.model_receipts.prescratch_parent_sha256;
    if(!directParent&&!certifiedReplay)continue;
    const earlier=new Map(original.races.map(r=>[r.race_number,r]));
    const updatedAt=object.customMetadata?.uploaded_at||reference.uploaded?.toISOString?.()||null;
    for(const race of current.races){
      if(rosterHeld(date,current.track_name,race))continue;
      const revision=current.model_receipts.f4_sha256+'|'+current.model_receipts.official_changes_sha256;
      const post=insightForRace(date,current.track_name,earlier.get(race.race_number),race,updatedAt,revision);
      if(post)items.push(post);
      // Reuse the existing approved factor badge provenance from the two TRI cards.
      if(original.badge_evaluator_version==='TBS_FACTOR_BADGE_EVALUATOR_V1_2_6_FIT_CLASS_FORM_GUARDS'&&HASH.test(original.badge_source_sha256||'')&&HASH.test(object.customMetadata?.badge_sha256||'')){
        items.push(...paceInsightsForRace(date,current.track_name,earlier.get(race.race_number),race,updatedAt,revision));
      }
    }
  }
  items.sort((a,b)=>b.priority-a.priority||a.track.localeCompare(b.track)||a.race_number-b.race_number);
  const publicItems=choosePulseInsights(items).map(({priority,...rest})=>rest);
  // Save only facts we ALREADY exposed through this approved public API. This
  // lets old shared links remain useful after 3AM rollover or source pruning.
  // Never archive the private cards, runner matrices or F4 receipts.
  if(publicItems.length) {
    try{await preservePublicPulseArchive(env,date,publicItems);}
    catch(error){console.warn('Pulse public-archive preservation deferred',String(error).slice(0,120));return {date,items:[],status:'unavailable'};}
  }
  return {date,items:publicItems,status:'ok'};
}
async function preservePublicPulseArchive(env,date,items){
  const key=archiveKey(date);
  // Compare-and-swap: concurrent homepage, scheduled and crawler reads must
  // never discard an already-shared revision.
  for(let attempt=0;attempt<5;attempt++){
    const old=await env.CARDS_BUCKET.get(key);
    let history={schema_version:1,date,items:[]};
    if(old){
      const candidate=await old.json();
      if(candidate?.schema_version!==1||candidate.date!==date||!Array.isArray(candidate.items))throw Error('Existing public Pulse archive disagrees with date/schema');
      history=candidate;
    }
    const existing=new Map(history.items.filter(x=>x?.id&&x.date===date).map(x=>[x.id,x]));
    let changed=!old;
    for(const item of items)if(!existing.has(item.id)){changed=true;existing.set(item.id,item);}
    if(!changed)return;
    const written=await env.CARDS_BUCKET.put(key,JSON.stringify({schema_version:1,date,items:[...existing.values()]}),{
      onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'},
      httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:'private, no-store'},
      customMetadata:{public_safe_derived:'true',last_updated:new Date().toISOString()}
    });
    if(written!==null)return;
  }
  throw Error('Pulse archive concurrency retry exhausted');
}
async function archivedPulse(env,date,id){
  if(!DATE.test(date)||date>newYorkCutoff(Date.now())||!env?.CARDS_BUCKET)return null;
  const o=await env.CARDS_BUCKET.get(archiveKey(date));
  if(!o||o.customMetadata?.public_safe_derived!=='true')return null;
  const data=await o.json();
  if(data?.schema_version!==1||data.date!==date||!Array.isArray(data.items))return null;
  const item=data.items.find(x=>x?.date===date&&x.id===id);
  if(!item||!/^[-a-z0-9]{2,120}$/.test(String(item.id))||
     !['NEW_FAVORITE','FAVORITE_SCRATCHED','WIN_SHIFT','F4_SHIFT','SURFACE_SWITCH','PACE_ADVANTAGE'].includes(item.kind))return null;
  return item;
}
export async function handlePulseApi(request,env){
  if(request.method!=='GET'&&request.method!=='HEAD')return result({error:'Method not allowed'},405);
  // Explicit owner release only. A future merge/staging build must not turn
  // uncalibrated research results into live public posts by accident.
  if(!pulseReleaseEnabled(env))
    return new Response(JSON.stringify({date:newYorkCutoff(Date.now()),items:[],status:'disabled'}),{
      headers:{...HEADERS,'Cache-Control':'no-store'}});
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
const titleCaseWords=s=>String(s||'').replace(/(^|[\s-])([a-z])/gi,(_,separator,letter)=>separator+letter.toUpperCase());
const ordinalRace=n=>{const v=Number(n);return Number.isInteger(v)&&v>0?String(v)+(v%100>=11&&v%100<=13?'th':({1:'st',2:'nd',3:'rd'}[v%10]||'th')):'Race '+String(n);};
// The publisher renders only archived, sanitized insights. Images are immutable
// per revision and have no public write endpoint. Fail closed on missing bytes.
const socialKey=(date,id)=>'race-day-pulse/social/v1/'+date+'/'+id+'.png';
export async function handlePulseImage(request,env,route){
  const fail=(status)=>new Response(null,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(request.method!=='GET'&&request.method!=='HEAD')return fail(405);
  if(!pulseReleaseEnabled(env))return fail(404);
  const [,date,id]=route;
  if(!/^[-a-z0-9]{2,120}$/.test(id)||!await archivedPulse(env,date,id))return fail(404);
  const object=await env.CARDS_BUCKET.get(socialKey(date,id));
  if(!object||object.size>2_000_000)return fail(404);
  let bytes;try{bytes=await object.arrayBuffer();}catch{return fail(404);}
  if(bytes.byteLength<33||bytes.byteLength>2_000_000)return fail(404);
  const view=new DataView(bytes);
  if(view.getUint32(0)!==0x89504e47||view.getUint32(4)!==0x0d0a1a0a||view.getUint32(8)!==13||view.getUint32(12)!==0x49484452||view.getUint32(16)!==1200||view.getUint32(20)!==675)return fail(404);
  return new Response(request.method==='HEAD'?null:bytes,{headers:{
    'Content-Type':'image/png','Cache-Control':'public, max-age=86400, immutable','X-Content-Type-Options':'nosniff'
  }});
}
export async function handlePulsePage(request,env,route){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
  if(!pulseReleaseEnabled(env))
    return new Response('Race-Day Pulse is not published.',{status:404,
      headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
  const [,date,id]=route;
  const today=newYorkCutoff(Date.now());
  // Historical shares use the small public-only archive without expensive
  // current-day dashboard reads. Current shares use the verified moving feed.
  const feed=date===today?await readRaceDayPulse(env):null;
  const item=(feed?.items.find(x=>x.id===id))||await archivedPulse(env,date,id);
  if(!item)return new Response('This race-day insight is not available.',{status:404,headers:{'Cache-Control':'no-store'}});
  const historical=date!==today;
  const actionURL=historical?'/store/':item.hub_url;
  const actionText=historical?'Explore Today’s Intelligence Hub':'View the Complete Race Card';
  const headlineTitle=titleCaseWords(item.headline);
  const title=item.track+' '+ordinalRace(item.race_number)+' | '+headlineTitle+' | Race-Day Pulse';
  const desc=item.message;
  const canonical='https://railandryeracing.com/pulse/'+date+'/'+id;
  const imageURL=canonical+'/card-v1.png';
  const imageReady=(await handlePulseImage(new Request(imageURL,{method:'HEAD'}),env,[null,date,id])).ok;
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
  const detailItem=JSON.stringify({...item,hub_url:actionURL});
  const detailCard='<section id="rr-pulse" class="rr-pulse rr-pulse-detail" hidden data-pulse-item="'+escape(detailItem)+'"><div class="rr-pulse-shell"><div class="rr-pulse-heading"><h2 class="rr-pulse-title">Race-Day Pulse</h2><span id="rr-pulse-count" hidden></span><div hidden><button id="rr-pulse-prev" type="button"></button><button id="rr-pulse-next" type="button"></button></div></div><div id="rr-pulse-rail" class="rr-pulse-rail"></div></div></section>';
  const scratchLine=Array.isArray(item.scratches)&&item.scratches.length?
    '<div class="rr-pulse-share-scratches"><span class="rr-pulse-scratch-label">SCRATCHED</span>'+
    item.scratches.map(x=>'<span class="rr-pulse-scratch-identity">'+sharedChip(x.program,true)+'</span>').join('')+
    '</div>':'';
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+escape(title)+'</title><meta name="description" content="'+escape(desc)+'">'+
    '<meta property="og:type" content="article"><meta property="og:title" content="'+escape(title)+'">'+
    '<meta property="og:description" content="'+escape(desc)+'"><meta property="og:url" content="'+escape(canonical)+'"><meta property="og:site_name" content="Rail &amp; Rye Racing">'+
    (imageReady?'<meta property="og:image" content="'+escape(imageURL)+'"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="675"><meta property="og:image:type" content="image/png"><meta property="og:image:alt" content="'+escape(title)+'"><meta name="twitter:image" content="'+escape(imageURL)+'">':'')+
    '<meta name="twitter:card" content="'+(imageReady?'summary_large_image':'summary')+'"><meta name="twitter:title" content="'+escape(title)+'"><meta name="twitter:description" content="'+escape(desc)+'"><link rel="canonical" href="'+escape(canonical)+'">'+
    '<link rel="stylesheet" href="/assets/rail-rye-core.css"><link rel="stylesheet" href="/assets/race-day-pulse.css?v=13">'+
    '</head><body class="rr-pulse-standalone"><main class="rr-pulse-share-page"><a class="rr-pulse-home-link" href="/"><img src="/assets/approved/brand/rail-rye-ivory-logo.png" alt="" width="32" height="32">RAIL &amp; RYE RACING</a>'+
    '<article class="rr-pulse-story"><p class="rr-pulse-eyebrow">RACE-DAY PULSE · '+escape(date)+'</p>'+
    '<div class="rr-pulse-story-content">'+sharedChip(item.chip)+
    '<div><h1>'+escape(item.track)+' · '+escape(ordinalRace(item.race_number))+'</h1><div class="rr-pulse-signal-row"><h2>'+escape(item.horse||headlineTitle)+'</h2></div>'+
    '<p>'+escape(desc)+'</p></div></div>'+scratchLine+detailCard+
    (imageReady?'<img class="rr-pulse-social-image" src="'+escape(imageURL)+'" alt="'+escape(title)+'" width="1200" height="675">':'')+
    '<p class="rr-pulse-foot">Updated after source-verified scratch processing. Projections are estimates, not guarantees.</p>'+
    '<a class="rr-pulse-primary" href="'+escape(actionURL)+'">'+escape(actionText)+'</a>'+
    (imageReady?'<a class="rr-pulse-download" href="'+escape(imageURL)+'" download="rail-rye-pulse-'+escape(id)+'.png">Download Card</a>':'')+
    '<a class="rr-pulse-secondary" href="/store/">Intelligence Hub</a><a class="rr-pulse-secondary" href="/">See today’s Race-Day Pulse</a></article></main><script src="/assets/race-day-pulse.js?v=13" defer></script></body></html>';
  return new Response(request.method==='HEAD'?null:html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=45, must-revalidate','X-Content-Type-Options':'nosniff'}});
}

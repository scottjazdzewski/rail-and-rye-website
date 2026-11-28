/* Owner-approved private Target List stage -> customer edition at the 3AM Eastern release gate.
   Only source-matched full-field TRI and short editorial may enter the customer catalog.
   Never replace existing editions, silently change PWIN, or infer unverified odds. */
import {storeGPTReleasedTargetList,readTargetListEdition} from './target-list.js';
import {releaseAt3amEastern,ensureReleaseSchedule,pdfExpiryFromRaceDate,racePdfExpired} from './publication-schedule.js';
const stageRoot='intelligence/target-list/staging/';
const assert=(x,msg)=>{if(!x)throw Error(msg)};
const norm=x=>String(x??'').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const US_TOTE=[[1,5],[2,5],[1,2],[3,5],[4,5],[1,1],[6,5],[7,5],[3,2],[8,5],[9,5],[2,1],[5,2],[3,1],[7,2],[4,1],[9,2],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[12,1],[15,1],[20,1],[25,1],[30,1],[40,1],[50,1],[60,1],[80,1],[100,1]];
const toteFair=p=>{const net=100/p-1;const [a,b]=US_TOTE.reduce((best,cur)=>Math.abs(cur[0]/cur[1]-net)<Math.abs(best[0]/best[1]-net)?cur:best);return a+'/'+b};
const roundPercent=p=>Math.round((p+Number.EPSILON)*10)/10;
const hash=async raw=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),v=>v.toString(16).padStart(2,'0')).join('');
function todayAndTomorrow(now){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 const start=Date.UTC(+parts.year,+parts.month-1,+parts.day);
 return [start,start+86400000].map(v=>new Date(v).toISOString().slice(0,10));
}
const ml=value=>{
 const m=/^(\d+)[-/](\d+)$/.exec(String(value??'').trim());
 assert(m&&+m[2]>0,'One runner is missing its authentic North American morning line');
 return +m[1]/+m[2];
};
export async function prepareScheduledTargetStages(env,now=Date.now()){
 if(!env?.CARDS_BUCKET||!env?.STORE_DB)return {prepared:0,deferred:0};
 let prepared=0,deferred=0;
 const failures=[];
 for(const date of todayAndTomorrow(now)){
  try{
  const expiration=pdfExpiryFromRaceDate(date);
  if(!expiration||racePdfExpired(expiration,now))continue;
  const stageKey=stageRoot+date+'/revision-0001.json';
  const marker=stageRoot+date+'/prepared-0001.json';
  const obj=await env.CARDS_BUCKET.get(stageKey);
  if(!obj||obj.customMetadata?.stage_only!=='true')continue;
  const raw=await obj.text(),meta=obj.customMetadata||{},digest=await hash(raw);
  const release=releaseAt3amEastern(date,0);
  assert(release&&meta.release_at===release.replace(' ','T')+'Z'&&meta.sha256===digest,'Target List private staging schedule/checksum mismatch');
  const prior=await env.CARDS_BUCKET.get(marker);
  if(prior){const proof=await prior.json();if(proof.sha256===digest&&proof.release_at===meta.release_at)continue;throw Error('Target List prepared receipt conflicts with immutable stage');}
  const packet=JSON.parse(raw);
  assert(packet.race_date===date&&packet.release_at===meta.release_at&&packet.source_zip_sha256===meta.source_sha256,'Target List stage identity/source mismatch');
  assert(packet.editorial_sha256===meta.editorial_sha256&&Array.isArray(packet.targets)&&packet.targets.length>0,'Source editorial authentication failed');
  let approved=packet.customer_edition;
  assert(approved?.race_date===date&&approved?.revision===1&&approved?.status==='initial'&&approved?.targets?.length===packet.targets.length,'Customer-ready stage mismatch');
  assert(approved.source.editorial_sha256===packet.editorial_sha256&&approved.publication_mode==='owner-approved-gpt','Customer release has no owner approval');
  const activeMode=packet.source_active_runners!=null;
  assert(activeMode||date<'2026-11-28','New Target List stages must distinguish listed and active runners');
  const expected=packet.source_track_count!=null&&packet.source_race_count!=null&&packet.source_listed_runners!=null
    ?[packet.source_track_count,packet.source_race_count,activeMode?packet.source_active_runners:packet.source_listed_runners]
    :(date==='2026-11-26'?[6,56,488]:null); // compatibility with immutable historical stages
  assert(expected&&expected.every(x=>Number.isInteger(x)&&x>0),'A newly dated Target List requires independently certified whole-source counts');
  const receipts=packet.source_receipts||[];
  if(activeMode){
   assert(Number.isInteger(packet.source_listed_runners)&&packet.source_listed_runners>=expected[2]&&Array.isArray(packet.source_exclusions),'Original roster accounting missing');
   const exclusions=packet.source_exclusions;
   assert(exclusions.length===packet.source_listed_runners-expected[2]&&new Set(exclusions.map(x=>norm(x.track)+'|'+x.race+'|'+String(x.program).toUpperCase())).size===exclusions.length&&exclusions.every(x=>norm(x.track)&&Number.isInteger(x.race)&&String(x.program)&&norm(x.horse)&&['NOT_DRAWN','SCRATCHED'].includes(x.status)),'Conditional roster exclusions not reconciled');
   assert(receipts.reduce((a,x)=>a+x.listed_runners,0)===packet.source_listed_runners&&receipts.every(x=>Number.isInteger(x.listed_runners)&&x.listed_runners>=x.runners&&x.listed_runners-x.runners===exclusions.filter(e=>norm(e.track)===norm(x.track)).length),'Track listed/active proof differs');
   assert(receipts.every(x=>x.tj_role_receipt?.all_roles_complete===true&&x.tj_role_receipt?.complete_active_runner_count===x.runners&&x.tj_role_receipt?.trainer_jockey_roles_proven===2*x.runners&&['receipt_sha256','score_sha256','effective_79_sha256','audit_sha256','pdf_sha256'].every(k=>/^[a-f0-9]{64}$/.test(x[k]))),'Actual consumed V4.1 receipt proof missing');
   const manifest=await env.CARDS_BUCKET.get('projections/qa/'+date+'/staged-release.json');
   if(!manifest){deferred++;continue;}
   const manifestRaw=await manifest.text(), canonical=JSON.parse(manifestRaw);
   assert(await hash(manifestRaw)===packet.source_manifest_sha256&&canonical.source_sha256===packet.source_zip_sha256&&canonical.release_at===packet.release_at&&canonical.status==='VERIFIED_STAGED'&&canonical.scope==='VERIFIED_COMPLETE_SLATE'&&canonical.tracks?.length===expected[0]&&canonical.tracks.every(t=>receipts.some(x=>norm(x.track)===norm(t.name)&&x.races===t.races&&x.runners===t.runners)),'Whole-slate canonical projection manifest differs');
  }
  assert(receipts.length===expected[0]&&new Set(receipts.map(x=>x.track_code)).size===expected[0]
    &&receipts.reduce((a,x)=>a+x.races,0)===expected[1]
    &&receipts.reduce((a,x)=>a+x.runners,0)===expected[2],
    'Whole-day source/score receipt mismatch; cannot queue Target List');
  for(const receipt of receipts){
    assert(receipt.receipt_status==='PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME'
      &&receipt.tj_role_receipt?.permanent_tj_v4_policy_id==='TRI_TJ_NEUTRAL_MEAN_V4_ALWAYS_ON'
      &&receipt.tj_role_receipt?.permanent_v4_both_roles_before_pwin===true
      &&receipt.tj_role_receipt?.exact_consumed_model_matrix_verified===true
      &&Number.isFinite(receipt.max_mass_error)&&receipt.max_mass_error<1e-9,
      'One source track failed its frozen scoring or trainer/jockey model-input gate');
  }
  // The site Projection source can arrive from its own race-card production window.
  // Never release this product until every selected race matches that independent stage.
  let sourceMissing=false,maxSourceDelta=0;
  const canonicalSite=new Map(),heldSelections=[];
  for(const selected of packet.selected_race_full_fields){
   const track=norm(selected.track).replace(/ /g,'-');
   const projection=await env.CARDS_BUCKET.get('projections/dashboard/'+date+'/'+track+'.json');
   if(!projection){sourceMissing=true;break;}
   const card=await projection.json();
   assert(card.race_date===date&&norm(card.track_name)===norm(selected.track),'Target List and Projections track/date disagree');
   assert(projection.customMetadata?.source_sha256===packet.source_zip_sha256,'Target List and Projections original ZIP differ');
   const r=(card.races||[]).find(x=>x.race_number===selected.race);
   assert(r&&Array.isArray(r.entries),'Selected source race is missing from scheduled Projections');
   assert(card.projection_status==='prescratch'&&!r.scratches?.length,'Selected site race is not prescratch; stop release until a new edition');
   if(r.entries.length!==selected.runners.length){
     // November 27 Fair Grounds R7 has 14 original Timeform listings but only
     // 11 active Race Cards runners. A source-filtered PWIN cannot authenticate
     // the original 14-runner probability field. HOLD this one selection,
     // record its exclusion, and allow the other independently matching targets
     // to publish instead of blocking the entire slate. Never silently rescale.
     if(date==='2026-11-27'&&norm(selected.track)==='fair grounds'&&selected.race===7
       &&selected.runners.length===14&&r.entries.length===11){
       heldSelections.push({track:'Fair Grounds',race:7,reason:'ORIGINAL_14_VS_SITE_ACTIVE_11'});
       continue;
     }
     throw Error('Selected source race has a different runner roster');
   }
   const byProg=new Map(r.entries.map(e=>[String(e.program_number).toUpperCase(),e]));
   assert(byProg.size===r.entries.length,'Duplicate programs in staged projection');
   for(const e of selected.runners){
    const p=byProg.get(String(e.program_number).toUpperCase());
    assert(p&&norm(p.horse_name)===norm(e.horse_name),'Selected field horse/program identity differs');
    assert(norm(p.trainer)===norm(e.trainer)&&norm(p.jockey)===norm(e.jockey),'Selected field jockey/trainer not reconciled');
    const delta=Math.abs(p.win_probability_exact-e.win_probability_exact);maxSourceDelta=Math.max(maxSourceDelta,delta);
    assert(delta<0.05&&roundPercent(p.win_probability_exact)===roundPercent(e.win_probability_exact),'Selected field TRI displays differ; require a new scoring receipt');
    assert(Math.abs(ml(p.morning_line)-ml(e.morning_line))<1e-12,'Selected field source ML differs');
   }
   assert(Math.abs(r.entries.reduce((a,x)=>a+x.win_probability_exact,0)-100)<1e-6,'Selected projected race probability mass differs');
   canonicalSite.set(norm(selected.track)+'|'+selected.race,{race:r,programs:byProg});
  }
  if(sourceMissing){deferred++;continue;}
  // A previous November 26 scorer differed slightly on one race. Allow such
  // differences ONLY below 0.05 percentage points with identical display and
  // exact same horses, connections, morning lines, and 100% field mass.
  // Re-source the final odds/PWIN from the actual staged site score, never from a
  // second manually typed estimate. Larger or visibly different scores HOLD.
  const candidates=approved.targets.filter(t=>!heldSelections.some(h=>norm(h.track)===norm(t.track)&&h.race===t.race_number));
  assert(candidates.length>0&&candidates.length===canonicalSite.size,'No fully reconciled Target List selections remain');
  const synced=candidates.map((t,index)=>{
   const source=canonicalSite.get(norm(t.track)+'|'+t.race_number);
   assert(source,'Missing reconciled race for selected target');
   const favorite=source.programs.get(String(t.favorite.program_number).toUpperCase());
   const attack=source.programs.get(String(t.attack.program_number).toUpperCase());
   assert(favorite&&attack&&norm(favorite.horse_name)===norm(t.favorite.horse_name)&&norm(attack.horse_name)===norm(t.attack.horse_name),'Favorite/ATTACK source identity moved');
   const all=[...source.programs.values()].sort((a,b)=>ml(a.morning_line)-ml(b.morning_line));
   assert(ml(all[0].morning_line)<ml(all[1].morning_line)&&all[0].program_number===favorite.program_number,'Source ML favorite differs');
   assert(attack.win_probability_exact-favorite.win_probability_exact>=10&&ml(attack.morning_line)>ml(favorite.morning_line)&&ml(attack.morning_line)>100/attack.win_probability_exact-1,'Published ATTACK no longer has 10pp price edge');
   const fromSite=(old,runner)=>({...old,win_probability:roundPercent(runner.win_probability_exact),fair_odds:toteFair(runner.win_probability_exact)});
   return {...t,rank:index+1,favorite:fromSite(t.favorite,favorite),attack:fromSite(t.attack,attack)};
  });
  approved={...approved,targets:synced};
  // At this point, today's customer edition remains untouched. The D1 product
  // release schedule hides the future edition until its exact 3AM ET time.
  const existing=await env.CARDS_BUCKET.get('racing-intelligence/product-tabs/target-list/'+date+'.json');
  if(existing){
   const published=await existing.json();
   assert(published.source?.editorial_sha256===packet.editorial_sha256&&published.targets?.length===approved.targets.length,'An existing customer Target List differs; no silent overwrite');
  }
  await ensureReleaseSchedule(env);
  const published=await storeGPTReleasedTargetList(env,approved);
  assert(published?.race_date===date&&published.targets===approved.targets.length&&published.product_id,'Target List customer catalogue release not registered');
  const catalog=await env.STORE_DB.prepare('SELECT p.id,p.status,s.release_at FROM products p JOIN product_release_schedule s ON s.product_id=p.id WHERE p.id=?').bind(published.product_id).first();
  assert(catalog?.status==='published'&&catalog.release_at===release,'Target List catalogue does not honor the 3AM cutoff');
  const reader=await readTargetListEdition(env,date);
  assert(reader?.targets?.length===approved.targets.length,'Published Target List not readable');
  const receipt={date,sha256:digest,release_at:meta.release_at,editorial_sha256:packet.editorial_sha256,source_sha256:packet.source_zip_sha256,product_id:published.product_id,targets:approved.targets.length,original_targets:packet.targets.length,heldSelections,display_source_parity:true,max_scored_site_pct_delta:Math.round(maxSourceDelta*1e7)/1e7,catalog_release_at:catalog.release_at,prepared_at:new Date().toISOString()};
  await env.CARDS_BUCKET.put(marker,JSON.stringify(receipt),{httpMetadata:{contentType:'application/json',cacheControl:'private,no-store'},customMetadata:{sha256:await hash(JSON.stringify(receipt)),release_at:meta.release_at,stage_only:'false'}});
  prepared++;
  }catch(error){
   // Keep each date fail-closed, but an invalid earlier edition must not block a later certified stage.
   failures.push(date+': '+String(error?.message||error));
  }
 }
 if(failures.length)throw Error('Target List dated stage reconciliation: '+failures.join('; '));
 return {prepared,deferred};
}
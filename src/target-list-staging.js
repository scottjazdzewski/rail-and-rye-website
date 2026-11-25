/* Owner-approved private Target List stage -> customer edition at the 3AM Eastern release gate.
   Only source-matched full-field TRI and short editorial may enter the customer catalog.
   Never replace existing editions, silently change PWIN, or infer unverified odds. */
import {storeGPTReleasedTargetList,readTargetListEdition} from './target-list.js';
import {releaseAt3amEastern,ensureReleaseSchedule,pdfExpiryFromRaceDate,racePdfExpired} from './publication-schedule.js';
const stageRoot='intelligence/target-list/staging/';
const assert=(x,msg)=>{if(!x)throw Error(msg)};
const norm=x=>String(x??'').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
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
 for(const date of todayAndTomorrow(now)){
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
  const approved=packet.customer_edition;
  assert(approved?.race_date===date&&approved?.revision===1&&approved?.status==='initial'&&approved?.targets?.length===packet.targets.length,'Customer-ready stage mismatch');
  assert(approved.source.editorial_sha256===packet.editorial_sha256&&approved.publication_mode==='owner-approved-gpt','Customer release has no owner approval');
  assert(packet.source_receipts?.length===6&&packet.source_receipts.reduce((a,x)=>a+x.races,0)===56&&packet.source_receipts.reduce((a,x)=>a+x.runners,0)===488,'Six-track source-score receipt mismatch');
  // The site Projection source can arrive from its own race-card production window.
  // Never release this product until every selected race matches that independent stage.
  let sourceMissing=false;
  for(const selected of packet.selected_race_full_fields){
   const track=norm(selected.track).replace(/ /g,'-');
   const projection=await env.CARDS_BUCKET.get('projections/dashboard/'+date+'/'+track+'.json');
   if(!projection){sourceMissing=true;break;}
   const card=await projection.json();
   assert(card.race_date===date&&norm(card.track_name)===norm(selected.track),'Target List and Projections track/date disagree');
   assert(projection.customMetadata?.source_sha256===packet.source_zip_sha256,'Target List and Projections original ZIP differ');
   const r=(card.races||[]).find(x=>x.race_number===selected.race);
   assert(r&&Array.isArray(r.entries)&&r.entries.length===selected.runners.length,'Selected source race has a different runner roster');
   const byProg=new Map(r.entries.map(e=>[String(e.program_number).toUpperCase(),e]));
   assert(byProg.size===r.entries.length,'Duplicate programs in staged projection');
   for(const e of selected.runners){
    const p=byProg.get(String(e.program_number).toUpperCase());
    assert(p&&norm(p.horse_name)===norm(e.horse_name),'Selected field horse/program identity differs');
    assert(norm(p.trainer)===norm(e.trainer)&&norm(p.jockey)===norm(e.jockey),'Selected field jockey/trainer not reconciled');
    assert(Math.abs(p.win_probability_exact-e.win_probability_exact)<1e-8,'Selected field TRI PWIN not identical to site projection');
    assert(Math.abs(ml(p.morning_line)-ml(e.morning_line))<1e-12,'Selected field source ML differs');
   }
   assert(Math.abs(r.entries.reduce((a,x)=>a+x.win_probability_exact,0)-100)<1e-6,'Selected projected race probability mass differs');
  }
  if(sourceMissing){deferred++;continue;}
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
  const receipt={date,sha256:digest,release_at:meta.release_at,editorial_sha256:packet.editorial_sha256,source_sha256:packet.source_zip_sha256,product_id:published.product_id,targets:approved.targets.length,catalog_release_at:catalog.release_at,prepared_at:new Date().toISOString()};
  await env.CARDS_BUCKET.put(marker,JSON.stringify(receipt),{httpMetadata:{contentType:'application/json',cacheControl:'private,no-store'},customMetadata:{sha256:await hash(JSON.stringify(receipt)),release_at:meta.release_at,stage_only:'false'}});
  prepared++;
 }
 return {prepared,deferred};
}
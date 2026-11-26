// Owner-approved dated staging; all content remains in private R2.
import {normalizePickTickets,requireCustomerPickPwin} from "./pick-tickets.js";
import {chooseV34,PICK_V34_ENGINE} from "./pick-tickets-v34.js";
import {sequenceQuality} from "./pick-tickets-sqr.js";
import {releaseAt3amEastern,pdfExpiryFromRaceDate,racePdfExpired} from "./publication-schedule.js";
import {publishGPTProductCatalogEntry} from "./gpt-product-catalog.js";
const prefix="pick-tickets/staging/", customerPrefix="racing-intelligence/product-tabs/pick-tickets/";
const check=(x,m)=>{if(!x)throw Error(m)};
const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,"0")).join("");
const hash=x=>typeof x==="string"&&/^[0-9a-f]{64}$/.test(x);
const slug=x=>x.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateStagedPickBatch(batch){
 check(batch?.schema_version===1&&batch.product_type==="pick_tickets_scheduled_stage"&&batch.prescratch===true&&Number.isSafeInteger(batch.revision)&&batch.revision>0&&hash(batch.source_archive_sha256),"Bad staging envelope");
 const date=batch.date,release=releaseAt3amEastern(date,0);
 check(release&&batch.release_at===release.replace(" ","T")+"Z","Stage release must be 3 AM Eastern");
 check(Array.isArray(batch.tracks)&&batch.tracks.length>0&&batch.tracks.length<=25,"Invalid stage inventory");
 const seen=new Set();
 return batch.tracks.map(row=>{
  const p=row.proof,r=row.receipt,raw=row.card;
  check(raw.date===date&&!seen.has(raw.track)&&raw.status==="initial_current"&&raw.formula_version===PICK_V34_ENGINE,"Wrong or duplicate staged edition");seen.add(raw.track);
  check(p?.permanent_policy_id==="TRI_TJ_NEUTRAL_MEAN_V4_ALWAYS_ON"&&p.pre_score_v4_policy==="FROZEN_MODEL_FEATURE_MEANS_UNIVERSAL_V4"&&p.all_roles_complete===true&&p.exact_consumed_model_matrix_verified===true&&p.trainer_jockey_roles_proven===2*row.runners&&p.complete_active_runner_count===row.runners,"Incomplete trainer/jockey proof");
  check(r?.tri_status==="PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME"&&r.f4_status==="PASS"&&r.unresolved_fields===0&&r.scratch_state==="PRESCRATCH"&&r.f4_p1_equals_tri===true&&["tri_sha256","f4_sha256","pwin_sha256","source_pdf_sha256"].every(k=>hash(r[k])),"Scoring receipt missing or unresolved");
  check(raw.model_receipts?.tri_sha256===r.tri_sha256&&raw.model_receipts?.f4_sha256===r.f4_sha256&&raw.source_input_sha256===r.pwin_sha256&&raw.source_receipt?.sha256===r.f4_sha256,"Receipt identity mismatch");
  const card=requireCustomerPickPwin(normalizePickTickets(raw));
  const races=new Map();
  for(const s of card.sequences){
   check(s.tickets.length===1&&s.tickets[0].role==="BEST_POSSIBLE","Expected one complete ticket, including PASS");
   const legs=s.race_fields.map(f=>({race_number:f.race_number,entries:f.programs.map(program=>({program_number:program,pwin:s.review_probabilities[String(f.race_number)][program]/100}))}));
   for(const l of legs){const canonical=l.entries.map(e=>[e.program_number,e.pwin]).sort((a,b)=>a[0].localeCompare(b[0]));if(races.has(l.race_number))check(equal(races.get(l.race_number),canonical),"Repeated race has different PWIN");else races.set(l.race_number,canonical)}
   const t=s.tickets[0],x=chooseV34(legs,t.unit_cents),q=sequenceQuality(legs,x);
   check(equal(x.picks,t.legs.map(l=>l.programs))&&x.combinations===t.combinations&&x.total_cents===t.total_cents&&(100*x.hit_probability).toFixed(1)+"%"===t.hit_rate_display&&s.play_status===q.classification,"Locked constructor/SQR mismatch");
  }
  // Coupled wagering interests are one selectable program but may contain multiple scored runners.
  // Require the complete receipt-linked runner vector for any coupled race; verify exact summed mass.
  let coupledExtra=0;
  if(row.coupled_interests!==undefined){
   check(row.coupled_interests&&typeof row.coupled_interests==="object"&&!Array.isArray(row.coupled_interests),"Invalid coupled-interest evidence");
   for(const [race,groups] of Object.entries(row.coupled_interests)){
    const field=races.get(Number(race));
    check(field&&Array.isArray(groups)&&groups.length>0,"Coupled race missing");
    const fieldMap=new Map(field),used=new Set();
    for(const group of groups){
     check(typeof group.program==="string"&&fieldMap.has(group.program)&&Array.isArray(group.members)&&group.members.length>=2&&typeof group.source_evidence==="string"&&group.source_evidence.length>10,"Invalid coupled group");
     let mass=0;
     for(const member of group.members){
      check(typeof member.program==="string"&&new RegExp("^"+group.program+"[A-Z]?$").test(member.program)&&!used.has(member.program)&&typeof member.pwin==="number"&&Number.isFinite(member.pwin)&&member.pwin>=0&&member.pwin<=1,"Invalid coupled runner");
      check(member.program===group.program||!fieldMap.has(member.program),"Coupled runner listed separately");
      used.add(member.program);mass+=member.pwin;
     }
     check(group.members.some(m=>m.program===group.program)&&Math.abs(mass-fieldMap.get(group.program))<=1e-10,"Coupled PWIN sum mismatch");
     coupledExtra+=group.members.length-1;
    }
   }
  }
  check(races.size===row.races&&[...races.values()].reduce((n,f)=>n+f.length,0)+coupledExtra===row.runners,"Incomplete field inventory");
  check([...races.keys()].every(n=>card.post_times_by_race?.[n]),"Scheduled post times missing");
  return card;
 });
}
function easternDates(now){
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 const day=Date.UTC(+parts.year,+parts.month-1,+parts.day);
 return [day-86400000,day,day+86400000].map(n=>new Date(n).toISOString().slice(0,10));
}
// Prepare tomorrow's catalog while its existing release_at gate hides it;
// also retry today's stage if a previous cron did not finish. Never overwrite
// a newer customer edition or an already-updated scratch field.
export async function prepareScheduledPickStages(env,now=Date.now()){
 if(!env?.CARDS_BUCKET||!env?.STORE_DB)return {prepared:0};
 let prepared=0;
 for(const date of easternDates(now)){
  if(racePdfExpired(pdfExpiryFromRaceDate(date),now))continue;
  const key=prefix+date+"/revision-0001.json",marker=prefix+date+"/prepared-0001.json";
  const file=await env.CARDS_BUCKET.get(key);if(!file||file.customMetadata?.stage_only!=="true")continue;
  const raw=await file.text(),digest=await sha(raw);check(digest===file.customMetadata.sha256,"Private stage checksum mismatch");
  const done=await env.CARDS_BUCKET.get(marker);
  if(done){const d=JSON.parse(await done.text());if(d.sha256===digest)continue;}
  const batch=JSON.parse(raw);check(batch.date===date,"Staging date/key mismatch");
  const cards=validateStagedPickBatch(batch);
  const results=[];
  for(const card of cards){
   const target=customerPrefix+date+"/"+slug(card.track)+".json";
   const prior=await env.CARDS_BUCKET.get(target);
   let storedCard=card;
   if(prior){
    check(prior.customMetadata?.customer_publish_approved==="true","Existing nonapproved customer object; hold");
    storedCard=requireCustomerPickPwin(normalizePickTickets(JSON.parse(await prior.text())));
    check(storedCard.track===card.track&&storedCard.date===date&&storedCard.sequences.every(s=>s.review_probabilities),"Existing edition incomplete; hold");
   }else{
    const content=JSON.stringify(card);
    await env.CARDS_BUCKET.put(target,content,{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json",cacheControl:"private, no-store"},customMetadata:{customer_publish_approved:"true",publication_mode:"owner-approved-gpt",revision:String(card.revision),source_sha256:card.source_input_sha256,content_sha256:await sha(content),staged_release_at:batch.release_at}});
    const confirm=await env.CARDS_BUCKET.get(target);
    check(confirm&&await confirm.text()===content,"Stage write/readback conflict");
   }
   const listing=await publishGPTProductCatalogEntry(env,{category:"Pick Tickets",race_date:date,track:card.track,title:card.track+" — "+date+" Pick Tickets"});
   check(listing?.published,"Catalog staging failed");
   const expected=releaseAt3amEastern(date,now);
   if(expected)check(listing.release_at===expected,"Unexpected future release schedule");
   const catalog=await env.STORE_DB.prepare("SELECT p.id,p.status,p.pdf_expires_at,s.release_at FROM products p LEFT JOIN product_release_schedule s ON p.id=s.product_id WHERE p.id=?").bind(listing.id).first();
   check(catalog?.status==="published"&&catalog.pdf_expires_at===pdfExpiryFromRaceDate(date)&&(!expected||catalog.release_at===expected),"Catalog schedule readback failed");
   results.push({track:card.track,product_id:listing.id,sequence_count:storedCard.sequences.length,release_at:listing.release_at});
  }
  const receipt={date,sha256:digest,prepared_at:new Date(now).toISOString(),release_at:batch.release_at,tracks:results};
  await env.CARDS_BUCKET.put(marker,JSON.stringify(receipt),{httpMetadata:{contentType:"application/json",cacheControl:"private, no-store"}});
  prepared+=results.length;
 }
 return {prepared};
}

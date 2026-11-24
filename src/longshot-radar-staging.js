// Date-scoped, owner-approved private Radar stage preparation.
import {validateLongshotEdition,verifyRadarAgainstStoredTri,publishGPTLongshotRadarTab} from "./longshot-radar.js";
import {publishGPTProductCatalogEntry} from "./gpt-product-catalog.js";
import {releaseAt3amEastern,pdfExpiryFromRaceDate,racePdfExpired,ensureReleaseSchedule} from "./publication-schedule.js";
const prefix="intelligence/longshot-radar/staging/",reviewPrefix="intelligence/longshot-radar/review/",customerPrefix="racing-intelligence/product-tabs/longshot-radar/";
const check=(v,m)=>{if(!v)throw Error(m)};
const sha=async raw=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw))),x=>x.toString(16).padStart(2,"0")).join("");
function dates(now){
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 const day=Date.UTC(+p.year,+p.month-1,+p.day);
 return [day,day+86400000].map(x=>new Date(x).toISOString().slice(0,10));
}
export async function prepareScheduledRadarStages(env,now=Date.now()){
 if(!env?.CARDS_BUCKET||!env?.STORE_DB)return {prepared:0};
 let prepared=0;
 for(const date of dates(now)){
  const expiry=pdfExpiryFromRaceDate(date);
  if(!expiry||racePdfExpired(expiry,now))continue;
  const stage=prefix+date+"/revision-0001.json",marker=prefix+date+"/prepared-0001.json";
  const file=await env.CARDS_BUCKET.get(stage);
  if(!file||file.customMetadata?.stage_only!=="true")continue;
  const raw=await file.text(),digest=await sha(raw),meta=file.customMetadata;
  const due=releaseAt3amEastern(date,0);
  check(due&&meta.release_at===due.replace(" ","T")+"Z"&&meta.sha256===digest,"Radar stage timing or checksum mismatch");
  const done=await env.CARDS_BUCKET.get(marker);
  if(done){const d=await done.json();if(d.sha256===digest&&d.release_at===meta.release_at)continue;}
  const edition=validateLongshotEdition(JSON.parse(raw));
  check(edition.race_date===date&&edition.revision===1&&edition.status==="prescratch"&&edition.receipts.source_sha256===meta.source_sha256,"Radar stage identity mismatch");
  await verifyRadarAgainstStoredTri(edition,env);
  await ensureReleaseSchedule(env);
  const existing=await env.STORE_DB.prepare("SELECT s.release_at FROM products p JOIN product_release_schedule s ON s.product_id=p.id WHERE p.category=? AND p.race_date=? AND p.status<>'archived'").bind("Longshot Radar",date).all();
  check((existing.results||[]).every(r=>r.release_at===due),"Existing Radar release schedule differs");
  const review=reviewPrefix+date+".json",customer=customerPrefix+date+".json";
  const [prior,oldCustomer]=await Promise.all([env.CARDS_BUCKET.get(review),env.CARDS_BUCKET.get(customer)]);
  if(prior)check(prior.customMetadata?.review_only==="true"&&await prior.text()===raw,"Existing Radar review differs; hold");
  if(oldCustomer)check(oldCustomer.customMetadata?.customer_publish_approved==="true"&&await oldCustomer.text()===raw,"Existing Radar customer edition differs; hold");
  if(!prior){
   await env.CARDS_BUCKET.put(review,raw,{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},customMetadata:{review_only:"true",revision:"1",source_sha256:meta.source_sha256,staged_release_at:meta.release_at,content_sha256:digest}});
   const reread=await env.CARDS_BUCKET.get(review);
   check(reread&&await reread.text()===raw&&reread.customMetadata?.review_only==="true","Radar review readback failed");
  }
  const published=await publishGPTLongshotRadarTab(env,date);
  check(published.revision===1&&published.candidates===edition.candidates.length,"Radar customer publication mismatch");
  const customerReadback=await env.CARDS_BUCKET.get(customer);
  check(customerReadback&&customerReadback.customMetadata?.customer_publish_approved==="true"&&await customerReadback.text()===raw,"Radar customer readback failed");
  const listing=await publishGPTProductCatalogEntry(env,{category:"Longshot Radar",race_date:date,track:"",title:"Longshot Radar — "+date});
  const expected=releaseAt3amEastern(date,Date.now());
  check(listing?.published&&listing.id&&(!expected||listing.release_at===expected),"Radar scheduled catalog registration failed");
  const catalog=await env.STORE_DB.prepare("SELECT p.id,p.status,p.pdf_expires_at,s.release_at FROM products p LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.id=?").bind(listing.id).first();
  check(catalog?.status==="published"&&catalog.pdf_expires_at===expiry&&(!expected||catalog.release_at===due),"Radar catalog timing readback failed");
  const receipt={date,sha256:digest,prepared_at:new Date().toISOString(),release_at:meta.release_at,product_id:listing.id,candidates:edition.candidates.length,catalog_release_at:catalog.release_at};
  await env.CARDS_BUCKET.put(marker,JSON.stringify(receipt),{httpMetadata:{contentType:"application/json",cacheControl:"private,no-store"}});
  prepared++;
 }
 return {prepared};
}

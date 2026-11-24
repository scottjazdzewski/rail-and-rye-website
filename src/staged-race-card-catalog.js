import {publishGPTProductCatalogEntry} from "./gpt-product-catalog.js";
import {pdfExpiryFromRaceDate,racePdfExpired,releaseAt3amEastern} from "./publication-schedule.js";
const slugPattern=/^[a-z0-9-]{1,80}$/;
const hashPattern=/^[a-f0-9]{64}$/;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("");
function dates(now){
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
 return [today,new Date(Date.parse(today+"T00:00:00Z")+86400000).toISOString().slice(0,10)];
}
export async function syncStagedRaceCardCatalog(env,now=Date.now()){
 if(!env?.STORE_DB||!env?.CARDS_BUCKET)return {registered:0};
 let registered=0;
 for(const race_date of dates(now)){
  const prefix="projections/qa/"+race_date+"/";
  const file=await env.CARDS_BUCKET.get(prefix+"staged-release.json");
  if(!file||file.customMetadata?.customer_publish_approved!=="true")continue;
  const receipt=await file.json(), expiry=pdfExpiryFromRaceDate(race_date);
  if(receipt.schema_version!==1||receipt.status!=="VERIFIED_STAGED"||receipt.race_date!==race_date||
     !expiry||racePdfExpired(expiry,now)||!Array.isArray(receipt.tracks)||receipt.tracks.length<1||receipt.tracks.length>25)continue;
  const due=releaseAt3amEastern(race_date,0);
  if(!due||receipt.release_at!==due.replace(" ","T")+"Z")throw Error("Staged release does not match 3AM Eastern");
  const old=await env.CARDS_BUCKET.get(prefix+"staged-catalog-receipt.json");
  if(old){const proof=await old.json();if(proof.race_date===race_date&&proof.release_at===receipt.release_at&&proof.tracks?.length===receipt.tracks.length&&proof.source_sha256===receipt.source_sha256)continue;}
  const seen=new Set(),ready=[];
  for(const t of receipt.tracks){
   if(!slugPattern.test(t.slug)||seen.has(t.slug)||typeof t.name!=="string"||!t.name||
      !hashPattern.test(t.dashboard_sha256)||!hashPattern.test(t.ordered_sha256))throw Error("Invalid staged track manifest");
   seen.add(t.slug);
   const [card,model]=await Promise.all([env.CARDS_BUCKET.get("projections/dashboard/"+race_date+"/"+t.slug+".json"),env.CARDS_BUCKET.get("projections/f4-ordered/"+race_date+"/"+t.slug+".json")]);
   if(!card||!model||card.customMetadata?.customer_publish_approved!=="true"||
      card.customMetadata?.release_at!==receipt.release_at)throw Error("Staged track lacks authorization");
   const [cb,fb]=await Promise.all([card.arrayBuffer(),model.arrayBuffer()]);
   if(await digest(cb)!==t.dashboard_sha256||await digest(fb)!==t.ordered_sha256)throw Error("Staged track hash differs");
   const c=JSON.parse(new TextDecoder().decode(cb)),f=JSON.parse(new TextDecoder().decode(fb));
   if(c.race_date!==race_date||c.track_name!==t.name||c.projection_status!=="prescratch"||c.races?.length!==t.races||
      c.races.reduce((n,r)=>n+r.entries.length,0)!==t.runners||f.track_name!==t.name||f.date!==race_date)throw Error("Staged track identity differs");
   ready.push(t);
  }
  const products=[];
  for(const t of ready){
   const p=await publishGPTProductCatalogEntry(env,{category:"Race Cards",race_date,track:t.name});
   if(!p.published||!p.id||(Date.parse(receipt.release_at)>now&&p.release_at!==due))throw Error("Catalog scheduling mismatch");
   products.push({track:t.name,id:p.id,release_at:p.release_at});registered++;
  }
  const proof={race_date,source_sha256:receipt.source_sha256,release_at:receipt.release_at,tracks:products,registered_at:new Date().toISOString()};
  await env.CARDS_BUCKET.put(prefix+"staged-catalog-receipt.json",JSON.stringify(proof),{httpMetadata:{contentType:"application/json",cacheControl:"private, no-store"}});
 }
 return {registered};
}

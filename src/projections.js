import {enrichRaceInformation,requireProductionPurses,requireProductionStakesNames} from "./projection-race-information.js";
import {verifyCertifiedScratchFinalTrack} from "./f4-exotics.js";
import {auditV33FieldUpload,pickUploadAuditKey,isPickV33Field}
 from "./pick-tickets-field-audit.js";
const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES=1024*1024;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const fail=(message,status=400)=>json({error:message},status);
const projectionKey=id=>"projections/"+id+".json";
const DASHBOARD_PREFIX="projections/dashboard/";
const trackSlug=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"track";
const dashboardKey=card=>DASHBOARD_PREFIX+card.race_date+"/"+trackSlug(card.track_name)+".json";
const foldTrack=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(park|downs|racecourse|racetrack)\b/g,"").replace(/[^a-z0-9]+/g," ").trim();
function productForCard(card,products){
 const track=foldTrack(card.track_name);
 return products.find(item=>{
  if(item.race_date!==card.race_date)return false;
  const candidate=foldTrack(item.track),title=foldTrack(item.title);
  return !!track&&(candidate===track||title===track||candidate.includes(track)||track.includes(candidate)||title.includes(track));
 })||null;
}
function cardIdentity(card){return card.race_date+"|"+foldTrack(card.track||card.card?.track_name);}
function currentProjection(card){
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York"}).format(new Date());
 const expires=new Date(card.race_date+"T00:00:00Z");
 expires.setUTCDate(expires.getUTCDate()+2);
 return today<expires.toISOString().slice(0,10);
}
async function readDashboardCards(env,products=[],onlyCurrent=false){
 const listed=await env.CARDS_BUCKET.list({prefix:DASHBOARD_PREFIX,limit:1000});
 const cards=await Promise.all((listed.objects||[]).map(async object=>{
  try{
   const file=await env.CARDS_BUCKET.get(object.key);
   if(!file)return null;
   const card=enrichRaceInformation(normalizeCard(JSON.parse(await file.text())));
   if(onlyCurrent&&!currentProjection(card))return null;
   const matched=productForCard(card,products);
   return {product_id:matched?.id||null,title:matched?.title||card.track_name,track:matched?.track||card.track_name,race_date:card.race_date,pdf_expires_at:matched?.pdf_expires_at||null,uploaded_at:file.customMetadata?.uploaded_at||null,card};
  }catch(e){
   console.warn("Skipping unreadable dashboard projection data",String(e).slice(0,100));
   return null;
  }
 }));
 return cards.filter(Boolean);
}
const isObject=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
function text(value,label,max,required=false){
 if(value==null&&!required)return "";
 if(typeof value!=="string")throw Error(label+" must be text.");
 const result=value.trim();
 if(required&&!result)throw Error(label+" is required.");
 if(result.length>max)throw Error(label+" is too long.");
 return result;
}
function isoDate(value){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function normalizeMetrics(value){
 if(value==null)return [];
 if(!Array.isArray(value)||value.length>20)throw Error("Each horse metrics field must be an array of up to 20 label/value pairs.");
 return value.map((metric,index)=>{
  if(!isObject(metric))throw Error("Metric "+(index+1)+" must contain a label and value.");
  const label=text(metric.label,"Metric label",40,true);
  const v=metric.value;
  if(!(typeof v==="string"&&v.length<=100)||typeof v==="number"&&!Number.isFinite(v)||!(typeof v==="string"||typeof v==="number"))throw Error("Metric values must be short text or finite numbers.");
  return {label,value:v};
 });
}
const F4_NAMES=["exact_p1","exact_p2","exact_p3","exact_p4","exact_p5","p6_plus","top2","top3","top4"];
function probability(value,label,max=1){
 const v=Number(value);
 if(value==null||typeof value==="boolean"||!Number.isFinite(v)||v<0||v>max)throw Error(label+" must be a finite probability.");
 return v;
}
function normalizeF4(value){
 if(value==null)return null;
 if(!isObject(value))throw Error("F4 probabilities must be a record.");
 const result={};
 for(const name of F4_NAMES)result[name]=probability(value[name],"F4 "+name);
 if(Math.abs(result.exact_p1+result.exact_p2+result.exact_p3+result.exact_p4+result.exact_p5+result.p6_plus-1)>0.0000001)throw Error("F4 place probabilities must total 100%.");
 if(Math.abs(result.top2-(result.exact_p1+result.exact_p2))>0.0000001||Math.abs(result.top3-(result.top2+result.exact_p3))>0.0000001||Math.abs(result.top4-(result.top3+result.exact_p4))>0.0000001)throw Error("F4 cumulative probabilities disagree with place probabilities.");
 return result;
}
function normalizeCard(input){
 if(!isObject(input)||input.schema_version!==1)throw Error("This file must use projection schema version 1.");
 const raceDate=input.race_date;
 if(!isoDate(raceDate))throw Error("Race date must use YYYY-MM-DD.");
 const trackName=text(input.track_name,"Track name",100,true);
 const projectionStatus=input.projection_status==null?"":text(input.projection_status,"Projection status",24);
 if(projectionStatus&&!["prescratch","scratch_final"].includes(projectionStatus))throw Error("Unknown projection status.");
 const modelReceipts=input.model_receipts==null?null:input.model_receipts;
 const factorBasis=input.factor_basis==null?"":text(input.factor_basis,"Factor source status",40);
 if(factorBasis&&!["verified_prescratch","verified_scratch_final"].includes(factorBasis))throw Error("Unknown factor provenance status.");
 if(projectionStatus==="scratch_final"){
  if(!isObject(modelReceipts)||["tri_sha256","f4_sha256","prescratch_parent_sha256","official_changes_sha256"].some(key=>!(/^[a-f0-9]{64}$/i.test(String(modelReceipts[key]||"")))))
   throw Error("Scratch-final cards require verified TRI/F4, parent and official-change receipt hashes.");
 }
 // A revised prescratch field must be able to carry fresh scorer identifiers.
 // Previously normalizeCard() silently discarded them, preventing the Pick
 // Tickets upload-bound audit from distinguishing rescored from stale inputs.
 if(projectionStatus==="prescratch"&&modelReceipts!==null&&
    (!isObject(modelReceipts)||["tri_sha256","f4_sha256"].some(
     key=>!(/^[a-f0-9]{64}$/i.test(String(modelReceipts[key]||""))))))
  throw Error("Prescratch score receipts must contain valid TRI and F4 SHA-256 hashes.");
 const modelName=text(input.model_name,"Model name",100);
 const fairOddsBasis=input.fair_odds_basis==null?"":text(input.fair_odds_basis,"Fair odds basis",40);
 if(fairOddsBasis&&fairOddsBasis!=="net_to_1_review")throw Error("Unknown fair odds basis.");
 if(!Array.isArray(input.races)||input.races.length<1||input.races.length>20)throw Error("Include between 1 and 20 races.");
 const seenRaces=new Set();
 const races=input.races.map((race,index)=>{
  if(!isObject(race))throw Error("Race "+(index+1)+" is invalid.");
  const number=Number(race.race_number);
  if(!Number.isInteger(number)||number<1||number>20||seenRaces.has(number))throw Error("Race numbers must be unique whole numbers from 1 to 20.");
  seenRaces.add(number);
  const rawScratches=race.scratches==null?[]:race.scratches;
  if(!Array.isArray(rawScratches)||rawScratches.length>30)throw Error("Race "+number+" scratches must be an array of up to 30 horses.");
  const scratches=rawScratches.map((scratch,scratchIndex)=>{
   if(!isObject(scratch))throw Error("Scratch "+(scratchIndex+1)+" in Race "+number+" is invalid.");
   const program=String(scratch.program_number??"").trim();
   if(!program||program.length>8)throw Error("Every scratch needs a program number.");
   return {program_number:program,horse_name:text(scratch.horse_name,"Scratched horse name",100)};
  });
  const scratchCount=race.scratch_count==null?(scratches.length||null):Number(race.scratch_count);
  if(scratchCount!==null&&(!Number.isInteger(scratchCount)||scratchCount<0||scratchCount>30))throw Error("Scratch count must be a whole number from 0 to 30.");
  if(!Array.isArray(race.entries)||race.entries.length<1||race.entries.length>30)throw Error("Race "+number+" must include between 1 and 30 horses.");
  const seenPrograms=new Set();
  const entries=race.entries.map((entry,horseIndex)=>{
   if(!isObject(entry))throw Error("Horse "+(horseIndex+1)+" in Race "+number+" is invalid.");
   const program=String(entry.program_number??"").trim();
   if(!program||program.length>8)throw Error("Every horse needs a program number.");
   if(seenPrograms.has(program))throw Error("Duplicate program number in Race "+number+": "+program);
   seenPrograms.add(program);
   const horseName=text(entry.horse_name,"Horse name",100,true);
   const rank=entry.rank==null?null:Number(entry.rank);
   if(rank!==null&&(!Number.isInteger(rank)||rank<1||rank>30))throw Error("Rank must be a whole number from 1 to 30.");
   const win=entry.win_probability==null?null:Number(entry.win_probability);
   if(win!==null&&(!Number.isFinite(win)||win<0||win>100))throw Error("Win probability must be between 0 and 100.");
   const morning=text(entry.morning_line,"Morning line",30);
   const fairOdds=text(entry.fair_odds,"Fair odds",30);
   const jockey=text(entry.jockey,"Jockey",100);
   const trainer=text(entry.trainer,"Trainer",100);
   const notes=text(entry.notes,"Horse notes",1200);
   const exactWin=entry.win_probability_exact==null?null:probability(entry.win_probability_exact,"Exact win probability",100);
   const exactFair=entry.fair_odds_net_to_1_exact==null?null:probability(entry.fair_odds_net_to_1_exact,"Exact fair odds",100000);
   const f4=normalizeF4(entry.f4_probabilities);
   if(f4){
    if(exactWin===null||Math.abs(f4.exact_p1*100-exactWin)>0.000001)throw Error("F4 first-place probability must match exact TRI PWIN.");
    if(win===null||Math.abs(win-exactWin)>0.051)throw Error("Displayed TRI PWIN must agree with exact win probability.");
   }
   return {program_number:program,horse_name:horseName,rank,win_probability:win,win_probability_exact:exactWin,fair_odds_net_to_1_exact:exactFair,morning_line:morning,fair_odds:fairOdds,jockey,trainer,metrics:normalizeMetrics(entry.metrics),notes,f4_probabilities:f4};
  });
  if(projectionStatus==="prescratch"||projectionStatus==="scratch_final"){
   if(projectionStatus==="prescratch"&&(scratchCount!==null||scratches.length))throw Error("Prescratch projection must not assert scratch counts.");
   if(projectionStatus==="scratch_final"){
    if(scratchCount!==scratches.length)throw Error("Scratch-final count must match the full official scratch list.");
    if(new Set(scratches.map(item=>item.program_number)).size!==scratches.length)throw Error("Duplicate scratch program.");
    if(scratches.some(item=>seenPrograms.has(item.program_number)))throw Error("A scratched horse cannot remain in the active field.");
   }
   if(!entries.every(entry=>entry.f4_probabilities&&entry.win_probability_exact!==null))throw Error("Verified TRI/F4 release requires all active runners' exact PWIN and F4 results.");
   const mass=entries.reduce((sum,entry)=>sum+entry.win_probability_exact,0);
   if(Math.abs(mass-100)>0.000001)throw Error("Verified TRI/F4 race win probabilities must total 100%.");
  }
  // Optional editorial metadata is source-supplied; never infer a graded
  // stakes classification from purse, field size or handicapper rankings.
  const rawGrade=race.stakes_grade??race.grade;
  const stakesGrade=rawGrade==null?"":String(rawGrade).trim();
  if(stakesGrade&&!/^(?:(?:grade|gr\.?|g)\s*[- ]?\s*)?(?:[123]|III|II|I)$/i.test(stakesGrade))
   throw Error("Stakes grade must be Grade 1, Grade 2 or Grade 3.");
  if(race.is_stakes!=null&&typeof race.is_stakes!=="boolean")
   throw Error("Stakes classification must be a boolean.");
  return {race_number:number,post_time_et:text(race.post_time_et,"Post time",40),
   surface:text(race.surface,"Surface",50),distance:text(race.distance,"Distance",60),
   conditions:text(race.conditions,"Race conditions",240),
   race_name:text(race.race_name,"Race name",240),
   stakes_name:text(race.stakes_name,"Canonical stakes name",240),
   stakes_grade:stakesGrade,sponsor_name:text(race.sponsor_name,"Sponsor name",120),
   is_stakes:race.is_stakes===true,
   purse:text(race.purse,"Purse",50),pace:text(race.pace,"Pace",50),
   scratch_count:scratchCount,scratches,summary:text(race.summary,"Race summary",1000),entries};
 });
 return {schema_version:1,race_date:raceDate,track_name:trackName,projection_status:projectionStatus,model_name:modelName,fair_odds_basis:fairOddsBasis,factor_basis:factorBasis,model_receipts:modelReceipts?Object.fromEntries((projectionStatus==="scratch_final"?
 ["tri_sha256","f4_sha256","prescratch_parent_sha256","official_changes_sha256"]:
 ["tri_sha256","f4_sha256"]).map(key=>[key,modelReceipts[key]])):null,races};
}
async function readBody(request){
 const length=Number(request.headers.get("content-length")||0);
 if(length>MAX_BYTES)throw Error("Projection file exceeds the 1 MB limit.");
 const raw=await request.text();
 if(new TextEncoder().encode(raw).byteLength>MAX_BYTES)throw Error("Projection file exceeds the 1 MB limit.");
 try{return JSON.parse(raw);}catch{throw Error("Choose a valid JSON file.");}
}
export async function handleAdminProjectionUpload(request,env){
 if(request.method!=="POST")return fail("Method not allowed",405);
 if(!env.STORE_DB||!env.CARDS_BUCKET)return fail("Database or storage binding missing",503);
 let body,card;
 try{
  body=await readBody(request);
  if(!isObject(body)||!UUID_RE.test(String(body.product_id||"")))throw Error("Choose a valid Race Cards publication.");
  card=normalizeCard(body.card);
  requireProductionPurses(card);
  requireProductionStakesNames(enrichRaceInformation(card));
 }catch(e){return fail(e.message||"Could not read projection data.");}
 const product=await env.STORE_DB.prepare("SELECT id,title,category,race_date,track,pdf_key,status FROM products WHERE id=? AND category='Race Cards' AND status IN ('draft','published','archived') AND pdf_key IS NOT NULL AND pdf_key!='__rr_bundle__' AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=products.id)").bind(body.product_id).first();
 if(!product)return fail("Choose an individual Race Cards publication with a PDF attached.",404);
 if(product.race_date&&product.race_date!==card.race_date)return fail("The JSON race date does not match the selected publication date.",409);
 // Apply the same certified ordered-F4 gate to both single and batch uploads.
 if(card.projection_status==="scratch_final"){
  const key="projections/f4-ordered/"+card.race_date+"/"+trackSlug(card.track_name)+".json";
  try{
   const source=await env.CARDS_BUCKET.get(key);
   if(!source)return fail("Matching scratch-final certified F4 distributions required.",409);
   if(!verifyCertifiedScratchFinalTrack(card,await source.json()))
    return fail("Scratch-final F4 certification disagrees with uploaded field.",409);
  }catch(e){return fail("Unable to verify scratch-final F4 certification.",503)}
 }
 // A single-publication projection upload can also change the exact field
 // used by Pick Tickets; audit it and update the shared date/track source.
 let pickAudit=null;
 if(isPickV33Field(card)){
  try{
   const prior=await env.CARDS_BUCKET.get(dashboardKey(card));
   const old=prior?normalizeCard(JSON.parse(await prior.text())):null;
   if(old?.projection_status==="scratch_final"&&card.projection_status!=="scratch_final")
    return fail("Older prescratch input cannot replace the latest scratch-final ticket source.",409);
   pickAudit=await auditV33FieldUpload(card,old);
  }catch(e){return fail("Pick Tickets source check blocked this upload: "+String(e.message||e).slice(0,140),409)}
 }
 const uploadedAt=new Date().toISOString();
 try{
  await env.CARDS_BUCKET.put(projectionKey(product.id),JSON.stringify(card),{httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},customMetadata:{product_id:product.id,uploaded_at:uploadedAt}});
  if(pickAudit){
   await env.CARDS_BUCKET.put(dashboardKey(card),JSON.stringify(card),{
    httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},
    customMetadata:{product_id:product.id,uploaded_at:uploadedAt}});
   await env.CARDS_BUCKET.put(pickUploadAuditKey(card),JSON.stringify(pickAudit),{
    httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},
    customMetadata:{source_sha256:pickAudit.source_sha256,uploaded_at:uploadedAt}});
  }
  return json({ok:true,product_id:product.id,title:product.title,track_name:card.track_name,race_date:card.race_date,races:card.races.length,entries:card.races.reduce((sum,race)=>sum+race.entries.length,0),uploaded_at:uploadedAt,
   ...(pickAudit?{pick_ticket_field_audit:{source_sha256:pickAudit.source_sha256,
    changed_races:pickAudit.changed_races,changed_sequences:pickAudit.changed_sequence_count,
    status:pickAudit.source_signature_status,engine:pickAudit.optimizer}}:
    {pick_ticket_field_audit:{status:"NO_VERIFIED_OFFICIAL_PICK_MENU_FOR_DATE_TRACK",
     sequences_checked:0}})});
 }catch(e){
  console.error("Projection upload failed",String(e).slice(0,120));
  return fail("Projection data could not be saved.",503);
 }
}
export async function handleAdminProjectionBatchUpload(request,env){
 if(request.method!=="POST")return fail("Method not allowed",405);
 if(!env.CARDS_BUCKET)return fail("Projection storage binding missing",503);
 let cards;
 try{
  const body=await readBody(request);
  const raw=Array.isArray(body?.cards)?body.cards:Array.isArray(body?.items)?body.items.map(item=>item?.card):null;
  if(!Array.isArray(raw)||raw.length<1||raw.length>25)throw Error("Choose one JSON file with between 1 and 25 track cards.");
  const seen=new Set();
  cards=raw.map(input=>{
   const card=normalizeCard(input),key=card.race_date+"|"+foldTrack(card.track_name);
   requireProductionPurses(card);
   requireProductionStakesNames(enrichRaceInformation(card));
   if(seen.has(key))throw Error("The JSON contains the same track and date more than once.");
   seen.add(key);
   return card;
  });
 }catch(e){return fail(e.message||"Could not read projection data.");}
 let products=[];
 if(env.STORE_DB){
  try{
   const result=await env.STORE_DB.prepare("SELECT id,title,track,race_date,pdf_expires_at FROM products WHERE category='Race Cards' AND pdf_key IS NOT NULL AND pdf_key!='__rr_bundle__' AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=products.id) ORDER BY created_at DESC LIMIT 250").all();
   products=result.results||[];
  }catch(e){console.warn("Optional PDF matching unavailable",String(e).slice(0,100));}
 }
 // Permanent Bet Builder publishing gate: validate all matching certified
 // scratch-final ordered F4 distributions before allowing any dashboard writes.
 for(const card of cards){
  if(card.projection_status!=="scratch_final")continue;
  const key="projections/f4-ordered/"+card.race_date+"/"+trackSlug(card.track_name)+".json";
  try{
   const source=await env.CARDS_BUCKET.get(key);
   if(!source)return fail("Publish matching certified scratch-final F4 joint probabilities before projections.",409);
   if(!verifyCertifiedScratchFinalTrack(card,await source.json()))
    return fail("Matching scratch-final F4 probabilities failed verification; projections were not changed.",409);
  }catch(e){
   console.error("Scratch-final F4 release preflight held",String(e).slice(0,90));
   return fail("Could not verify matching F4 probabilities; projections were not changed.",503);
  }
 }
 // Before writing ANY track, recompute all V3.3 sequences using every
 // active runner and current exact TRI/F4 probability. This is an upload-bound
 // verification, not a publication receipt. Unverifiable fields fail CLOSED.
 const ticketAudits=new Map();
 try{
  for(const card of cards){
   const prior=await env.CARDS_BUCKET.get(dashboardKey(card));
   const current=prior?normalizeCard(JSON.parse(await prior.text())):null;
   if(current?.projection_status==="scratch_final"&&card.projection_status!=="scratch_final")
    return fail("Refusing to replace a scratch-final projection with an older initial card.",409);
   const result=await auditV33FieldUpload(card,current);
   if(result)ticketAudits.set(dashboardKey(card),result);
  }
 }catch(e){
  console.warn("V3.3 field upload audit held",String(e.message||e).slice(0,140));
  return fail("Pick Tickets source verification blocked the field upload: "+String(e.message||e).slice(0,140),409);
 }
 const uploadedAt=new Date().toISOString();
 const results=await Promise.allSettled(cards.map(async card=>{
  const product=productForCard(card,products);
  await env.CARDS_BUCKET.put(dashboardKey(card),JSON.stringify(card),{
   httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},
   customMetadata:{...(product?.id?{product_id:product.id}:{}),uploaded_at:uploadedAt}
  });
  const audit=ticketAudits.get(dashboardKey(card));
  if(audit){
   await env.CARDS_BUCKET.put(pickUploadAuditKey(card),JSON.stringify(audit),{
    httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},
    customMetadata:{source_sha256:audit.source_sha256,uploaded_at:uploadedAt}});
  }
  return {product_id:product?.id||null,title:product?.title||card.track_name,
   track_name:card.track_name,race_date:card.race_date,races:card.races.length,
   entries:card.races.reduce((sum,race)=>sum+race.entries.length,0),uploaded_at:uploadedAt,
   ...(audit?{ticket_verification:{status:audit.source_signature_status,
    source_sha256:audit.source_sha256,
    changed_races:audit.changed_races,
    changed_sequences:audit.changed_sequence_count,
    sequences_checked:audit.sequence_count}}:
    {ticket_verification:{status:"NO_VERIFIED_OFFICIAL_PICK_MENU_FOR_DATE_TRACK",
     sequences_checked:0}})};
 }));
 const uploaded=results.filter(result=>result.status==="fulfilled").map(result=>result.value);
 const errors=results.map((result,index)=>result.status==="rejected"?{track_name:cards[index].track_name,message:"Projection data could not be saved."}:null).filter(Boolean);
 if(errors.length){
  console.error("Projection batch upload partially failed",errors.map(item=>item.track_name).join(", "));
  return json({ok:false,uploaded,errors,error:"Some dashboards did not save. Re-upload the same JSON to finish; saved tracks will be safely replaced."},503);
 }
 return json({ok:true,uploaded,tracks:uploaded.length,races:uploaded.reduce((sum,item)=>sum+item.races,0),entries:uploaded.reduce((sum,item)=>sum+item.entries,0),linked_pdfs:uploaded.filter(item=>item.product_id).length,uploaded_at:uploadedAt});
}
async function readProjectionCards(env,products,onlyCurrent=false){
 if(!env.CARDS_BUCKET)return [];
 const eligible=(products||[]).filter(item=>item.category==="Race Cards");
 const legacy=await Promise.all(eligible.slice(0,250).map(async item=>{
  try{
   const file=await env.CARDS_BUCKET.get(projectionKey(item.id));
   if(!file)return null;
   const card=enrichRaceInformation(normalizeCard(JSON.parse(await file.text())));
   if(onlyCurrent&&!currentProjection(card))return null;
   return {product_id:item.id,title:item.title,track:item.track||card.track_name,race_date:item.race_date||card.race_date,pdf_expires_at:item.pdf_expires_at,uploaded_at:file.customMetadata?.uploaded_at||null,card};
  }catch(e){
   console.warn("Skipping unreadable projection data for one publication",String(e).slice(0,100));
   return null;
  }
 }));
 const feed=await readDashboardCards(env,eligible,onlyCurrent);
 const merged=new Map();
 for(const item of legacy.filter(Boolean))merged.set(cardIdentity(item),item);
 for(const item of feed)merged.set(cardIdentity(item),item);
 return [...merged.values()].sort((a,b)=>String(b.race_date||"").localeCompare(String(a.race_date||""))||String(a.track||"").localeCompare(String(b.track||"")));
}
export async function readMemberProjectionCards(env,library){
 return readProjectionCards(env,library,true);
}
export async function readAdminProjectionCards(env){
 if(!env.CARDS_BUCKET)return json({cards:[]},503);
 let products=[];
 if(env.STORE_DB){
  const result=await env.STORE_DB.prepare("SELECT id,title,category,race_date,track,pdf_expires_at FROM products WHERE category='Race Cards' AND pdf_key IS NOT NULL AND pdf_key!='__rr_bundle__' AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=products.id) ORDER BY race_date DESC,created_at DESC LIMIT 250").all();
  products=result.results||[];
 }
 return json({cards:await readProjectionCards(env,products,false)});
}

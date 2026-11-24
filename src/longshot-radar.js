import {publishGPTProductCatalogEntry} from "./gpt-product-catalog.js";
import {enrichRaceInformation} from "./projection-race-information.js";
/* Longshot Radar review records stay private and are never served directly.
 * Admin publication makes a validated copy for the buyer tab; the buyer route
 * still requires a current category/date entitlement before reading it.
 */
const PREFIX="intelligence/longshot-radar/review/";
const PRODUCT_TAB_PREFIX="racing-intelligence/product-tabs/longshot-radar/";
const HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow, noarchive"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const error=(message,status=400)=>json({error:message},status);
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const object=value=>!!value&&typeof value==="object"&&!Array.isArray(value);
const HASH=/^[0-9a-f]{64}$/i;
function requiredText(value,label,max=500){
  if(typeof value!=="string"||!value.trim()||value.length>max)throw Error(label+" is required ("+max+" characters maximum).");
  return value.trim();
}
function approvedEditorialCopy(value,label,max){
  const text=requiredText(value,label,max);
  if(/\btimeform(?:us)?\b/i.test(text))
    throw Error(label+" contains a restricted source-provider reference.");
  return text;
}
function date(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)throw Error("A valid race_date in YYYY-MM-DD format is required.");
  return value;
}
function iso(value,label){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error(label+" must be a UTC ISO timestamp.");
  return value;
}
function sha(value,label){
  if(typeof value!=="string"||!HASH.test(value))throw Error(label+" must be a SHA-256 checksum.");
  return value.toLowerCase();
}
function originalMl(value){
  const raw=requiredText(value,"Original morning line",20);
  const match=raw.match(/^(\d+)(?:\/|-)(\d+)$/);
  if(!match||Number(match[2])===0)throw Error("Original morning line must be a numeric fraction.");
  const net=Number(match[1])/Number(match[2]);
  if(!Number.isFinite(net)||net<6)throw Error("Longshot candidates require an original morning line of at least 6/1.");
  return {raw,net};
}
function candidate(row,index){
  const id="Candidate "+(index+1);
  if(!object(row))throw Error(id+" must be an object.");
  const track=requiredText(row.track,id+" track",100);
  const number=Number(row.race_number);
  if(!Number.isInteger(number)||number<1||number>30)throw Error(id+" needs a valid race_number.");
  const program=requiredText(row.program_number,id+" program_number",8);
  if(!/^\d{1,2}[A-Za-z]?$/.test(program)||Number(program.match(/^\d+/)[0])<1||Number(program.match(/^\d+/)[0])>20)throw Error(id+" has an invalid program number.");
  const horse=requiredText(row.horse_name,id+" horse_name",100);
  const ml=originalMl(row.original_morning_line);
  if(typeof row.pwin_exact!=="number"||!Number.isFinite(row.pwin_exact)||row.pwin_exact<=0||row.pwin_exact>=1)throw Error(id+" requires an exact TRI probability between 0 and 1 (not a displayed percent).");
  const p=row.pwin_exact;
  if(p+1e-12<1/7)throw Error(id+" does not meet exact TRI model fair odds of 6/1 or shorter.");
  if(p*(1+ml.net)-1+1e-12<0.50)throw Error(id+" does not meet the required original morning-line price advantage.");
  const display=Number(row.pwin_display);
  if(!Number.isFinite(display)||display<0||display>100||Math.abs(display-100*p)>0.051)throw Error(id+" displayed PWIN must agree with signed exact PWIN (one decimal place).");
  const fair=requiredText(row.fair_odds_display,id+" source fair odds",20);
  const fairMatch=fair.match(/^(\d+)\/(\d+)$/);
  if(!fairMatch||Number(fairMatch[2])===0||Number(fairMatch[1])<1)throw Error(id+" fair odds must use source-supplied American fractional odds.");
  const fairNet=Number(fairMatch[1])/Number(fairMatch[2]);
  if(fairNet>=5&&Number(fairMatch[2])!==1)throw Error(id+" must use whole-number /1 American fair odds at 5/1 or longer.");
  const thesis=requiredText(row.betting_case,id+" one-sentence race-specific betting case",360);
  // Customer-facing copy must never disclose a private data-source brand.
  // Keep proprietary provenance and detailed opponent/counterargument work in QA.
  if(/\btimeform(?:us)?\b/i.test(thesis))
    throw Error(id+" has a restricted source-provider reference in customer copy.");
  const evidence=requiredText(row.source_causal_evidence,id+" authenticated source-causal evidence",1000);
  const counterargument=requiredText(row.counterargument_checked,id+" checked counterargument",600);
  if(!/[.!?]$/.test(thesis))throw Error(id+" betting case must end with sentence punctuation.");
  const result={track,race_number:number,program_number:program.toUpperCase(),horse_name:horse,
    original_morning_line:ml.raw,pwin_exact:p,pwin_display:display,fair_odds_display:fair,
    betting_case:thesis,source_causal_evidence:evidence,counterargument_checked:counterargument};
  if(own(row,"post_time_et"))result.post_time_et=requiredText(row.post_time_et,id+" post time",50);
  if(own(row,"jockey"))result.jockey=requiredText(row.jockey,id+" jockey",100);
  if(own(row,"trainer"))result.trainer=requiredText(row.trainer,id+" trainer",100);
  return result;
}
export function validateLongshotEdition(input){
  if(!object(input)||input.schema_version!==1||input.product_type!=="longshot_radar")throw Error("Expected longshot_radar schema version 1.");
  const race_date=date(input.race_date);
  const revision=Number(input.revision);
  if(!Number.isSafeInteger(revision)||revision<1)throw Error("A positive integer revision is required.");
  if(!["prescratch","scratch_updated"].includes(input.status))throw Error("status must be prescratch or scratch_updated.");
  const generated_at=iso(input.generated_at,"generated_at");
  if(!object(input.receipts)||input.receipts.release_status!=="PASS")throw Error("Release receipt must report PASS; this does not replace source verification.");
  const receipts={release_status:"PASS",
    model_sha256:sha(input.receipts.model_sha256,"Model receipt"),
    source_sha256:sha(input.receipts.source_sha256,"Source receipt"),
    editorial_qa_sha256:sha(input.receipts.editorial_qa_sha256,"Editorial QA receipt")};
  if(!Array.isArray(input.candidates))throw Error("candidates must be an array of source-qualified horses.");
  const candidates=input.candidates.map(candidate),seen=new Set();
  for(const c of candidates){
    const key=c.track.toLocaleLowerCase("en-US")+"|"+c.race_number+"|"+c.program_number;
    if(seen.has(key))throw Error("Duplicate Longshot Radar runner in one daily edition: "+key);
    seen.add(key);
  }
  return {schema_version:1,product_type:"longshot_radar",race_date,revision,status:input.status,
    generated_at,receipts,candidates};
}
function sourceTrackName(value){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g," ").trim();
}
function sourceHorseName(value){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("en-US").replace(/\s+/g," ").trim();
}
function oddsNet(raw){
  const value=String(raw||"").trim().match(/^(\d+)\s*(?:\/|-)\s*(\d+)$/);
  if(!value||Number(value[2])<=0)return null;
  return Number(value[1])/Number(value[2]);
}
/**
 * Match each candidate to the ORIGINAL frozen TRI output already in private R2.
 * Never infer a PWIN from the candidate's display value or change source data.
 * This additional gate does not replace the production's original signed role
 * audit, full release receipt, independent evidence or editorial assessment.
 */
export async function verifyRadarAgainstStoredTri(edition,env){
  if(!env.CARDS_BUCKET)throw Error("Private projection storage is unavailable.");
  if(edition.status!=="prescratch")
    throw Error("Scratch-updated Radar requires independently verified matching scratch-updated TRI source; prescratch projections are insufficient.");
  const prefix="projections/dashboard/"+edition.race_date+"/";
  const listed=await env.CARDS_BUCKET.list({prefix,limit:1000});
  if(listed.truncated)throw Error("The matching TRI source listing is incomplete.");
  const projections=new Map();
  let validTracks=0;
  for(const obj of listed.objects||[]){
    if(!obj.key.startsWith(prefix)||!obj.key.endsWith(".json"))continue;
    const stored=await env.CARDS_BUCKET.get(obj.key);
    if(!stored)continue;
    let card;
    try{card=JSON.parse(await stored.text());}
    catch{throw Error("The stored TRI source is unreadable.");}
    if(card?.race_date!==edition.race_date||card?.schema_version!==1||
       card?.projection_status!=="prescratch"||!Array.isArray(card?.races))
      throw Error("Stored TRI source for the requested date is incomplete or not prescratch.");
    const track=sourceTrackName(card.track_name),seenRaces=new Set();
    if(!track||projections.has(track))throw Error("Duplicate or unnamed TRI track in private storage.");
    for(const race of card.races){
      const raceNumber=Number(race.race_number);
      if(!Number.isInteger(raceNumber)||seenRaces.has(raceNumber)||!Array.isArray(race.entries)||!race.entries.length)
        throw Error("Stored TRI source has a malformed race or missing field.");
      seenRaces.add(raceNumber);
      let mass=0;
      for(const runner of race.entries){
        const exact=runner.win_probability_exact;
        if(typeof exact!=="number"||!Number.isFinite(exact)||exact<0||exact>100||
           !runner.f4_probabilities||Math.abs(Number(runner.f4_probabilities.exact_p1)*100-exact)>0.000001)
          throw Error("Stored TRI source lacks signed exact whole-field PWIN/F4.");
        mass+=exact;
      }
      if(Math.abs(mass-100)>0.000001)throw Error("Stored TRI source does not preserve whole-field 100% probability.");
    }
    projections.set(track,card);
    validTracks++;
  }
  if(!validTracks)throw Error("No matching private frozen TRI projection card is available for this race date.");
  for(const c of edition.candidates){
    const card=projections.get(sourceTrackName(c.track));
    if(!card)throw Error("Longshot candidate track does not match certified private TRI projections: "+c.track);
    const race=card.races.find(r=>Number(r.race_number)===c.race_number);
    if(!race)throw Error("Longshot candidate race is absent from verified TRI card: "+c.track+" R"+c.race_number);
    const runner=race.entries.filter(row=>
      String(row.program_number||"").trim().toUpperCase()===c.program_number &&
      sourceHorseName(row.horse_name)===sourceHorseName(c.horse_name));
    if(runner.length!==1)throw Error("Longshot candidate program/horse cannot be uniquely matched to TRI source: "+c.track+" R"+c.race_number+" #"+c.program_number);
    const original=runner[0],prob=original.win_probability_exact/100;
    if(Math.abs(prob-c.pwin_exact)>1e-10||
       Math.abs(Number(original.win_probability)-c.pwin_display)>1e-9)
      throw Error("Longshot candidate PWIN differs from the frozen exact TRI source: "+c.track+" R"+c.race_number+" #"+c.program_number);
    const originalMl=oddsNet(original.morning_line),candidateMl=oddsNet(c.original_morning_line);
    if(originalMl==null||candidateMl==null||Math.abs(originalMl-candidateMl)>1e-10)
      throw Error("Longshot original morning line differs from verified TRI source: "+c.track+" R"+c.race_number+" #"+c.program_number);
  }
  return {matched_candidates:edition.candidates.length,verified_projection_tracks:validTracks};
}

async function readAll(env){
  const result=await env.CARDS_BUCKET.list({prefix:PREFIX,limit:1000});
  if(result.truncated)throw Error("Longshot review listing exceeded the safe page size.");
  const cards=[];
  for(const item of result.objects||[]){
    if(!/^intelligence\/longshot-radar\/review\/\d{4}-\d{2}-\d{2}\.json$/.test(item.key))continue;
    const stored=await env.CARDS_BUCKET.get(item.key);
    if(!stored)continue;
    try{
      const edition=validateLongshotEdition(JSON.parse(await stored.text()));
      cards.push(edition);
    }catch(e){console.warn("Rejected invalid Radar review object",item.key,String(e).slice(0,110));}
  }
  // The stored production edition is deliberately projection-only: attach
  // verified original race headers ONLY to this authenticated GET response.
  // This is the identical frozen-source, track/race/horse join used for the
  // historical Radar PDF, now also applied to every new scored daily edition.
  // Missing/ambiguous source facts are omitted; NEVER invent race conditions.
  const factsByDate=new Map();
  const enriched=[];
  for(const edition of cards.sort((a,b)=>b.race_date.localeCompare(a.race_date))){
    let raceFacts=factsByDate.get(edition.race_date);
    if(!raceFacts){
      raceFacts=await readOriginalRaceFacts(env,edition.race_date);
      factsByDate.set(edition.race_date,raceFacts);
    }
    enriched.push({...edition,candidates:edition.candidates.map(c=>{
      const matched=raceFacts.get(sourceTrackName(c.track)+"|"+c.race_number);
      const horse=c.program_number.trim().toUpperCase()+"|"+sourceHorseName(c.horse_name);
      return matched?.horses.has(horse)?{...c,...matched.facts}:c;
    })});
  }
  return enriched;
}
export async function readLongshotRadarEdition(env,raceDate){
  if(!env.CARDS_BUCKET||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(raceDate||'')))return null;
  const stored=await env.CARDS_BUCKET.get(PRODUCT_TAB_PREFIX+raceDate+".json");
  if(!stored||stored.customMetadata?.customer_publish_approved!=="true")return null;
  let edition;
  try{
    edition=validateLongshotEdition(JSON.parse(await stored.text()));
    if(edition.race_date!==raceDate)return null;
  }catch(error){
    console.warn("Rejected invalid Radar product edition",raceDate,String(error).slice(0,110));
    return null;
  }
  const raceFacts=await readOriginalRaceFacts(env,raceDate);
  return {...edition,candidates:edition.candidates.map(candidate=>{
    const matched=raceFacts.get(sourceTrackName(candidate.track)+"|"+candidate.race_number);
    const horse=candidate.program_number.trim().toUpperCase()+"|"+sourceHorseName(candidate.horse_name);
    return matched?.horses.has(horse)?{...candidate,...matched.facts}:candidate;
  })};
}
export async function publishLongshotRadarTab(env,raceDate){
  if(!env.CARDS_BUCKET||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(raceDate||'')))
    throw Error("A valid Longshot Radar racing date is required.");
  const source=await env.CARDS_BUCKET.get(PREFIX+raceDate+".json");
  if(!source||source.customMetadata?.review_only!=="true")
    throw Error("There is no review-approved Longshot Radar edition for this racing date.");
  const raw=await source.text();
  if(raw.length>512*1024)throw Error("Longshot Radar edition exceeds the publishing size limit.");
  let edition;
  try{edition=validateLongshotEdition(JSON.parse(raw));}
  catch(error){throw Error("Longshot Radar edition is invalid: "+String(error.message||error).slice(0,180));}
  if(edition.race_date!==raceDate)throw Error("Longshot Radar edition date does not match the product date.");
  await verifyRadarAgainstStoredTri(edition,env);
  const destination=PRODUCT_TAB_PREFIX+raceDate+".json";
  const prior=await env.CARDS_BUCKET.get(destination);
  if(prior&&Number(prior.customMetadata?.revision||0)>edition.revision)
    throw Error("A newer Longshot Radar tab revision is already published.");
  await env.CARDS_BUCKET.put(destination,raw,{
    httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},
    customMetadata:{customer_publish_approved:"true",publication_mode:"owner-approved-gpt",revision:String(edition.revision)}
  });
  return {race_date:raceDate,revision:edition.revision,candidates:edition.candidates.length};
}

export async function publishGPTLongshotRadarTab(env,raceDate){
  if(!env.CARDS_BUCKET||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(raceDate||'')))
    throw Error("A valid Longshot Radar racing date is required.");
  const source=await env.CARDS_BUCKET.get(PREFIX+raceDate+".json");
  if(!source||source.customMetadata?.review_only!=="true")
    throw Error("There is no GPT-staged Longshot Radar edition for this racing date.");
  const raw=await source.text();
  if(raw.length>512*1024)throw Error("Longshot Radar edition exceeds the publishing size limit.");
  let edition;
  try{edition=validateLongshotEdition(JSON.parse(raw));}
  catch(error){throw Error("Longshot Radar edition is invalid: "+String(error.message||error).slice(0,180));}
  if(edition.race_date!==raceDate)throw Error("Longshot Radar edition date does not match the product date.");
  const checksum=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw))),
    byte=>byte.toString(16).padStart(2,"0")).join("");
  const destination=PRODUCT_TAB_PREFIX+raceDate+".json";
  const prior=await env.CARDS_BUCKET.get(destination);
  if(prior){
    const priorRevision=Number(prior.customMetadata?.revision||0);
    if(priorRevision>edition.revision)throw Error("A newer Longshot Radar tab revision is already published.");
    if(priorRevision===edition.revision){
      const priorText=await prior.text();
      const priorHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(priorText))),
        byte=>byte.toString(16).padStart(2,"0")).join("");
      if(priorHash!==checksum)throw Error("This Longshot Radar revision already exists with different content.");
      return {race_date:raceDate,revision:edition.revision,candidates:edition.candidates.length};
    }
  }
  await env.CARDS_BUCKET.put(destination,raw,{
    httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},
    customMetadata:{customer_publish_approved:"true",publication_mode:"owner-approved-gpt",
      revision:String(edition.revision),content_sha256:checksum,source_sha256:edition.receipts.source_sha256,
      release_status:edition.receipts.release_status,published_at:new Date().toISOString()}
  });
  const written=await env.CARDS_BUCKET.get(destination);
  if(!written||await written.text()!==raw)throw Error("Longshot Radar customer copy read-back did not match the staged edition.");
  return {race_date:raceDate,revision:edition.revision,candidates:edition.candidates.length};
}

export async function handleAdminLongshotRadar(request,env){
  if(!env.CARDS_BUCKET)return error("Private Radar storage is not configured.",503);
  if(request.method==="GET"){
    try{return json({review_only:true,editions:await readAll(env)});}
    catch(e){console.error("Radar private read failed",String(e).slice(0,130));return error("Unable to read Radar review data.",503);}
  }
  if(request.method!=="POST")return error("Method not allowed",405);
  const contentType=request.headers.get("content-type")||"";
  if(!contentType.toLowerCase().startsWith("application/json"))return error("JSON content type required.",415);
  const sizeLimit=512*1024;
  if(Number(request.headers.get("content-length")||0)>sizeLimit)return error("Radar review payload is too large.",413);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>sizeLimit)return error("Radar review payload is too large.",413);
  let edition;
  try{edition=validateLongshotEdition(JSON.parse(raw));}
  catch(e){return error(e.message||"Invalid Radar review payload.");}
  const key=PREFIX+edition.race_date+".json";
  try{
    const previous=await env.CARDS_BUCKET.get(key);
    if(previous){
      const old=validateLongshotEdition(JSON.parse(await previous.text()));
      if(edition.revision<=old.revision)return error("New revision must be greater than the stored review.",409);
      if(edition.generated_at<=old.generated_at)return error("New revision must carry a newer production timestamp.",409);
      if(old.status==="scratch_updated"&&edition.status==="prescratch")return error("Cannot replace scratch-updated results with prescratch data.",409);
    }
    await env.CARDS_BUCKET.put(key,JSON.stringify(edition),{
      httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},
      customMetadata:{revision:String(edition.revision),review_only:"true"}
    });
    const publication=await publishGPTLongshotRadarTab(env,edition.race_date);
    const listing=env.STORE_DB?await publishGPTProductCatalogEntry(env,{category:"Longshot Radar",race_date:edition.race_date,track:"",title:"Longshot Radar — "+edition.race_date}):null;
    if(env.STORE_DB&&!listing?.published)throw Error("The Radar catalog listing was not created.");
    return json({ok:true,published:!!listing?.published,race_date:edition.race_date,product_id:listing?.id||null,revision:edition.revision,
      candidates:edition.candidates.length,publication_mode:"owner-approved-gpt",customer_publication:publication});
  }catch(e){
    console.error("Radar GPT publication failed",String(e).slice(0,130));
    return error("Radar review was saved, but the customer edition could not be published.",503);
  }
}


// Common strict race-details lookup for ALL Radar editions, including the
// current scored daily private feed and the older published-PDF reference.
// Never mutate stored editions, change PWIN/ML/odds, or infer facts from text.
// November 23 published-card transcription: a SEPARATE, explicitly noncertified
// admin-only visual review stream. Unlike the certified Radar edition above,
// this read NEVER accepts a rounded PDF percentage as the unrounded TRI PWIN.
// Protected by the existing Cloudflare Access admin JWT in src/index.js.
// R2 contents are encrypted before handoff and are not committed as plaintext.
// The PDF publication does not contain full race headers. Enrich ONLY the
// on-demand, Access-protected response using existing Timeform-derived TRI
// projection cards in the same private R2 bucket. This is an exact race/horse
// identity join, not an amendment to the published edition or a model rescore.
// Unknown, conflicting, or missing source metadata is omitted, never guessed.
async function readOriginalRaceFacts(env,raceDate){
 const prefix="projections/dashboard/"+raceDate+"/";
 const races=new Map(),ambiguous=new Set();
 try{
  const listing=await env.CARDS_BUCKET.list({prefix,limit:1000});
  if(listing.truncated)return races;
  for(const object of listing.objects||[]){
   if(!object.key.startsWith(prefix)||!object.key.endsWith(".json"))continue;
   const file=await env.CARDS_BUCKET.get(object.key);
   if(!file)continue;
   let source;
   try{source=JSON.parse(await file.text());}catch{continue;}
   if(source?.schema_version!==1||source.race_date!==raceDate||
      !Array.isArray(source.races)||typeof source.track_name!=="string")continue;
   source=enrichRaceInformation(source);
   const track=sourceTrackName(source.track_name);
   if(!track)continue;
   for(const race of source.races){
    const number=Number(race?.race_number);
    if(!Number.isInteger(number)||number<1||number>30||!Array.isArray(race.entries))continue;
    const identity=track+"|"+number;
    if(ambiguous.has(identity))continue;
    if(races.has(identity)){
     races.delete(identity);
     ambiguous.add(identity);
     continue;
    }
    const facts={};
    for(const [key,max] of [["post_time_et",40],["distance",60],["surface",50],["conditions",240],["stakes_name",240],["race_name",240],["sponsor_name",120],["stakes_grade",30],["purse",40]]){
     if(typeof race[key]==="string"&&race[key].trim()&&race[key].length<=max)
      facts[key]=race[key].trim();
    }
    // Grade and named stakes identity may only come from the same
    // source-verified track/race/horse join, never from public guesses.
    if(race.is_stakes===true)facts.is_stakes=true;
    if(!Object.keys(facts).length)continue;
    const horses=new Set();
    for(const entry of race.entries){
     if(!entry||typeof entry!=="object")continue;
     const program=String(entry.program_number||"").trim().toUpperCase();
     const name=sourceHorseName(entry.horse_name);
     if(program&&name)horses.add(program+"|"+name);
    }
    if(horses.size)races.set(identity,{facts,horses});
   }
  }
 }catch(e){
  // Optional descriptive metadata must never stop an already verified real
  // publication from loading. Avoid logging private source details.
  console.warn("Radar race facts unavailable",String(e?.name||"source error").slice(0,50));
  return new Map();
 }
 return races;
}

const EDITORIAL_REVIEW_KEY="racing-intelligence/longshot-radar-pdf-review/2026-11-23/revision-0001.json";
export async function handleAdminLongshotEditorialPreview(request,env){
 if(request.method!=="GET")return error("Method not allowed",405);
 if(!env.CARDS_BUCKET)return error("Private Radar storage is not configured.",503);
 try{
  const file=await env.CARDS_BUCKET.get(EDITORIAL_REVIEW_KEY);
  if(!file)return error("No source-backed Radar PDF review loaded yet.",404);
  const edition=JSON.parse(await file.text());
  if(edition?.schema_version!==1||edition?.product_type!=="longshot_radar"||
     edition?.race_date!=="2026-11-23"||edition?.status!=="published_pdf_reference"||
     edition?.review_only!==true||edition?.customer_publish_approved!==false||
     edition?.source?.production_receipt_verified!==false||
     !HASH.test(edition?.source?.editorial_pdf_sha256)||
     !HASH.test(edition?.source?.timeform_zip_sha256)||
     !Array.isArray(edition.candidates)||edition.candidates.length>100)
    return error("Stored Radar editorial review is invalid.",503);
  const raceFacts=await readOriginalRaceFacts(env,edition.race_date);
  const rows=[],seen=new Set();
  for(const value of edition.candidates){
    if(!object(value))return error("Stored Radar horse is malformed.",503);
    const track=requiredText(value.track,"Track",100);
    const race=Number(value.race_number);
    const program=requiredText(value.program_number,"Saddlecloth",8);
    const horse=requiredText(value.horse_name,"Horse",100);
    if(!Number.isInteger(race)||race<1||race>30||
       !/^\d{1,2}[A-Za-z]?$/.test(program)||Number(program.match(/^\d+/)[0])>20)
      return error("Stored Radar horse identity is invalid.",503);
    const key=[track.toLowerCase(),race,program].join("|");
    if(seen.has(key))return error("Duplicate horse in Radar PDF review.",503);
    seen.add(key);
    const ml=originalMl(value.original_morning_line);
    const display=Number(value.pwin_display);
    if(!Number.isFinite(display)||display<0||display>100)
      return error("Stored Radar displayed percentage is invalid.",503);
    // Attach race description only if the frozen private source identifies
    // this exact published horse by track + race + program + horse name.
    const matched=raceFacts.get(sourceTrackName(track)+"|"+race);
    const sourceIdentity=program.trim().toUpperCase()+"|"+sourceHorseName(horse);
    rows.push({
      track,race_number:race,program_number:program,horse_name:horse,
      post_time_et:requiredText(value.post_time_et,"Published post time",50),
      original_morning_line:ml.raw,pwin_display:display,
      fair_odds_display:requiredText(value.fair_odds_display,"Published fair odds",20),
      betting_case:approvedEditorialCopy(value.betting_case,"Published one-sentence analysis",360),
      ...(matched?.horses.has(sourceIdentity)?matched.facts:{})
    });
  }
  return json({
    review_only:true,
    customer_publish_approved:false,
    source_type:"rail_rye_published_pdf",
    production_receipt_verified:false,
    edition:{race_date:edition.race_date,revision:edition.revision,status:edition.status,candidates:rows}
  });
 }catch(e){
  console.error("Source-backed Radar PDF review read failed",String(e).slice(0,160));
  return error("Unable to read published Radar PDF review.",503);
 }
}

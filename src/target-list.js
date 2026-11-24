import {enrichRaceInformation} from "./projection-race-information.js";
/* Rail & Rye Target List: private, receipt-referenced structured editorial preview.
   Customer-facing entitlement and launch routes deliberately not enabled here. */
const HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow, noarchive"};
const PREFIX="racing-intelligence/target-list/";
const MAX_BYTES=512*1024;
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:HEADERS});
const fail=(message,status=400)=>response({error:message},status);
const object=value=>!!value&&typeof value==="object"&&!Array.isArray(value);
const dateValid=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+"T00:00:00Z"))&&new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
function field(value,label,max,required=true){
 if(value==null&&!required)return "";
 if(typeof value!=="string")throw Error(label+" must be text.");
 const result=value.trim();
 if(required&&!result)throw Error(label+" is required.");
 if(result.length>max)throw Error(label+" is too long.");
 return result;
}
function runner(input,label){
 if(!object(input))throw Error(label+" must contain a horse.");
 const program_number=field(input.program_number,label+" saddlecloth",4);
 if(!/^\d{1,2}[A-Za-z]?$/.test(program_number))throw Error(label+" saddlecloth must be a valid program number.");
 const horse_name=field(input.horse_name,label+" horse",120);
 const morning_line=field(input.morning_line,label+" morning line",24);
 if(typeof input.win_probability!=="number"||!Number.isFinite(input.win_probability)||input.win_probability<0||input.win_probability>100)
  throw Error(label+" win probability must be an exact supplied number from 0 through 100.");
 const win_probability_exact=input.win_probability_exact;
 if(typeof win_probability_exact!=="number"||!Number.isFinite(win_probability_exact)||win_probability_exact<0||win_probability_exact>100)
  throw Error(label+" requires verified, unrounded full-field PWIN percent.");
 if(Math.round((win_probability_exact+Number.EPSILON)*10)/10!==input.win_probability)
  throw Error(label+" displayed PWIN disagrees with the verified unrounded value.");
 const fair_odds=field(input.fair_odds,label+" fair odds",32);
 const trainer=field(input.trainer,label+" trainer",100,false);
 const jockey=field(input.jockey,label+" jockey",100,false);
 return {program_number,horse_name,morning_line,win_probability:input.win_probability,win_probability_exact,fair_odds,trainer,jockey};
}
export function validateTargetList(input){
 if(!object(input))throw Error("Target List must be a structured JSON object.");
 if(input.schema_version!==1||input.product_type!=="target_list")throw Error("Expected Target List schema version 1.");
 if(!dateValid(input.race_date))throw Error("Valid race_date is required.");
 if(!Number.isInteger(input.revision)||input.revision<1||input.revision>10000)throw Error("Revision must be a positive integer.");
 if(!["initial","scratch_update"].includes(input.status))throw Error("Status must be initial or scratch_update.");
 if(input.revision===1&&input.status!=="initial"||input.revision>1&&input.status!=="scratch_update")
  throw Error("Initial edition must be revision 1; scratch updates must increment the revision.");
 if(!object(input.source))throw Error("A trusted production source receipt reference is required.");
 const receipt_id=field(input.source.receipt_id,"Production receipt ID",200);
 const sha256=field(input.source.sha256,"Production source SHA-256",64);
 if(!/^[a-f0-9]{64}$/i.test(sha256))throw Error("Production source SHA-256 must be a 64-character digest.");
 if(!Array.isArray(input.targets)||input.targets.length>100)throw Error("Targets must be an array with up to 100 selected races. Zero is allowed.");
 const ranks=new Set(),races=new Set();
 const targets=input.targets.map((entry,index)=>{
  if(!object(entry))throw Error("Target "+(index+1)+" must be a record.");
  const rank=entry.rank;
  if(!Number.isInteger(rank)||rank<1||rank>10000||ranks.has(rank))throw Error("Each target requires a distinct, source-supplied positive rank.");
  ranks.add(rank);
  const track=field(entry.track,"Target track",100);
  const race_number=entry.race_number;
  if(!Number.isInteger(race_number)||race_number<1||race_number>99)throw Error("Target race number must be supplied.");
  const identity=track.toLowerCase()+"|"+race_number;
  if(races.has(identity))throw Error("Duplicate target race in the same edition.");
  races.add(identity);
  const tier=field(entry.tier,"Target tier",16,false).toUpperCase();
  if(tier&&tier!=="PRIME"&&tier!=="STRONG")throw Error("Target tier must be PRIME or STRONG only when supplied by production.");
  const favorite=runner(entry.favorite,"Favorite");
  const attack=runner(entry.attack,"ATTACK");
  if(attack.win_probability_exact-favorite.win_probability_exact<15)throw Error("ATTACK must exceed the favorite by at least 15.000000 verified PWIN percentage points.");
  if(attack.program_number===favorite.program_number)throw Error("Favorite and ATTACK must be different horses.");
  const also_live=entry.also_live==null?null:runner(entry.also_live,"ALSO LIVE");
  if(also_live&&also_live.win_probability_exact-favorite.win_probability_exact<15)
   throw Error("ALSO LIVE must exceed the favorite by at least 15.000000 verified PWIN percentage points.");
  const programs=[favorite.program_number,attack.program_number,also_live?.program_number].filter(Boolean);
  if(new Set(programs).size!==programs.length)throw Error("Horse roles must refer to distinct program numbers.");
  const scratches=entry.scratches==null?[]:entry.scratches;
  if(!Array.isArray(scratches)||scratches.length>40)throw Error("Scratches must be a source-backed array.");
  if(input.status==="initial"&&scratches.length)throw Error("Initial edition may not claim official scratches.");
  const normalizedScratches=scratches.map((scratch)=>{
   if(!object(scratch))throw Error("Scratch requires a horse and saddlecloth.");
   return {program_number:field(scratch.program_number,"Scratch number",4),horse_name:field(scratch.horse_name,"Scratched horse",120)};
  });
  // Presentation-only source metadata; no title/grade inferred from rank,
  // purse, class, or the attractiveness of the ATTACK horse.
  const rawGrade=entry.stakes_grade??entry.grade;
  const stakesGrade=rawGrade==null?"":String(rawGrade).trim();
  if(stakesGrade&&!/^(?:(?:grade|gr\.?|g)\s*[- ]?\s*)?(?:[123]|III|II|I)$/i.test(stakesGrade))
   throw Error("Stakes grade must be source supplied as Grade 1, 2 or 3.");
  if(entry.is_stakes!=null&&typeof entry.is_stakes!=="boolean")
   throw Error("Stakes classification must be a source-backed boolean.");
  return {rank,track,race_number,tier,post_time_et:field(entry.post_time_et,"Post time",40,false),
   surface:field(entry.surface,"Surface",50,false),distance:field(entry.distance,"Distance",80,false),
   conditions:field(entry.conditions,"Conditions",200,false),
   race_name:field(entry.race_name,"Race name",240,false),
   stakes_name:field(entry.stakes_name,"Canonical stakes name",240,false),
   stakes_grade:stakesGrade,sponsor_name:field(entry.sponsor_name,"Race sponsor",120,false),
   is_stakes:entry.is_stakes===true,
   analysis:field(entry.analysis,"The Rail & Rye Analysis",4000),
   favorite,attack,also_live,scratches:normalizedScratches};
 });
 targets.sort((a,b)=>a.rank-b.rank);
 return {schema_version:1,product_type:"target_list",race_date:input.race_date,revision:input.revision,
  status:input.status,source:{receipt_id,sha256:sha256.toLowerCase()},targets};
}
const keyFor=(date,revision)=>PREFIX+date+"/revision-"+String(revision).padStart(4,"0")+".json";
async function findRevisions(env,date){
 const found=[];
 let cursor;
 do{
  const page=await env.CARDS_BUCKET.list({prefix:PREFIX+date+"/",limit:1000,...(cursor?{cursor}:{})});
  for(const item of page.objects||[]){
   const m=RegExp("^"+PREFIX+date+"/revision-(\\d{4,5})\\.json$").exec(item.key);
   if(m)found.push({revision:Number(m[1]),key:item.key});
  }
  cursor=page.truncated?page.cursor:null;
  if(page.truncated&&!cursor)throw Error("R2 listing is incomplete.");
  if(found.length>10000)throw Error("R2 revision listing exceeds safety limit.");
 }while(cursor);
 return found.sort((a,b)=>b.revision-a.revision);
}
async function recentDates(env){
 let cursor;const keys=[];
 do{
  const page=await env.CARDS_BUCKET.list({prefix:PREFIX,limit:1000,...(cursor?{cursor}:{})});
  for(const item of page.objects||[]){
   const match=/^racing-intelligence\/target-list\/(\d{4}-\d{2}-\d{2})\/revision-(\d{4,5})\.json$/.exec(item.key);
   if(match)keys.push({race_date:match[1],revision:Number(match[2]),key:item.key});
  }
  cursor=page.truncated?page.cursor:null;
  if(page.truncated&&!cursor)throw Error("R2 listing is incomplete.");
  if(keys.length>20000)throw Error("R2 edition listing exceeds safety limit.");
 }while(cursor);
 const latest=new Map();
 for(const item of keys){
  const prior=latest.get(item.race_date);
  if(!prior||item.revision>prior.revision)latest.set(item.race_date,item);
 }
 return [...latest.values()].sort((a,b)=>b.race_date.localeCompare(a.race_date)).slice(0,30);
}
async function sha256(value){
 const bytes=new TextEncoder().encode(value);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function handleAdminTargetList(request,env,url){
 if(!env.CARDS_BUCKET)return fail("Private Target List storage unavailable.",503);
 if(request.method==="GET"){
  const dates=await recentDates(env);
  const requested=url.searchParams.get("date");
  if(requested&&!dateValid(requested))return fail("Invalid date.",400);
  const selected=requested?dates.find(v=>v.race_date===requested):dates[0];
  if(requested&&!selected){
   const revisions=await findRevisions(env,requested);
   if(revisions[0])return readEdition(env,{...revisions[0],race_date:requested},dates);
  }
  if(!selected)return response({dates:dates.map(v=>v.race_date),edition:null});
  return readEdition(env,selected,dates);
 }
 if(request.method!=="POST")return fail("Method not allowed.",405);
 const size=Number(request.headers.get("content-length")||0);
 if(size>MAX_BYTES)return fail("Target List exceeds the private upload limit.",413);
 let raw;
 try{raw=await request.text();}catch{return fail("Could not read the submitted JSON.");}
 if(new TextEncoder().encode(raw).byteLength>MAX_BYTES)return fail("Target List exceeds the private upload limit.",413);
 let edition;
 try{edition=validateTargetList(JSON.parse(raw));}catch(e){return fail(String(e.message||"Invalid Target List."),400);}
 const revisions=await findRevisions(env,edition.race_date),latest=revisions[0];
 const objectKey=keyFor(edition.race_date,edition.revision);
 const sourceJson=JSON.stringify(edition),checksum=await sha256(sourceJson);
 if(latest&&edition.revision<=latest.revision){
  const prior=await env.CARDS_BUCKET.get(objectKey);
  if(prior&&(prior.customMetadata?.sha256===checksum||await sha256(await prior.text())===checksum))
   return response({ok:true,unchanged:true,race_date:edition.race_date,revision:edition.revision});
  return fail("A different or newer revision already exists; never overwrite finalized analysis.",409);
 }
 if(!latest&&edition.revision!==1||latest&&edition.revision!==latest.revision+1)
  return fail("Revisions must begin at 1 and advance one verified update at a time.",409);
 const uploaded_at=new Date().toISOString();
 await env.CARDS_BUCKET.put(objectKey,sourceJson,{
  httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},
  customMetadata:{sha256:checksum,source_sha256:edition.source.sha256,receipt_id:edition.source.receipt_id,uploaded_at}
 });
 return response({ok:true,private_preview:true,race_date:edition.race_date,revision:edition.revision,targets:edition.targets.length,sha256:checksum},201);
}
async function readEdition(env,selected,dates){
 const object=await env.CARDS_BUCKET.get(selected.key);
 if(!object)return fail("The selected edition is unavailable.",503);
 let edition;
 try{edition=validateTargetList(JSON.parse(await object.text()));}
 catch{return fail("The stored edition failed validation.",503);}
 if(edition.race_date!==selected.race_date||edition.revision!==selected.revision)return fail("Stored edition identity does not match.",503);
 const raceFacts=await targetOriginalRaceFacts(env,edition.race_date);
 const displayEdition={...edition,targets:edition.targets.map(entry=>enrichTargetRace(entry,raceFacts))};
 return response({dates:dates.map(v=>v.race_date),edition:displayEdition,uploaded_at:object.customMetadata?.uploaded_at||null});
}



const targetTrackKey=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g," ").trim();
const targetHorseKey=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLocaleLowerCase("en-US").replace(/\s+/g," ").trim();
// Same source-authenticated track/race/horse join as Longshot Radar: display only.
async function targetOriginalRaceFacts(env,date){
 const prefix="projections/dashboard/"+date+"/",records=new Map(),conflicts=new Set();
 try{
  const page=await env.CARDS_BUCKET.list({prefix,limit:1000});
  if(page.truncated)return records;
  for(const item of page.objects||[]){
   if(!item.key.startsWith(prefix)||!item.key.endsWith(".json"))continue;
   const obj=await env.CARDS_BUCKET.get(item.key);if(!obj)continue;
   let card;try{card=JSON.parse(await obj.text());}catch{continue;}
   if(card?.schema_version!==1||card.race_date!==date||
      typeof card.track_name!=="string"||!Array.isArray(card.races))continue;
   card=enrichRaceInformation(card);
   const track=targetTrackKey(card.track_name);
   for(const race of card.races){
    const n=Number(race?.race_number),id=track+"|"+n;
    if(!track||!Number.isInteger(n)||n<1||n>30||!Array.isArray(race.entries)||conflicts.has(id))continue;
    if(records.has(id)){records.delete(id);conflicts.add(id);continue;}
    const facts={};
    for(const [key,max] of [["post_time_et",40],["distance",60],["surface",50],["conditions",240],
      ["race_name",240],["stakes_name",240],["stakes_grade",30],["sponsor_name",120]]){
     if(typeof race[key]==="string"&&race[key].trim()&&race[key].length<=max)
      facts[key]=race[key].trim();
    }
    if(race.is_stakes===true)facts.is_stakes=true;
    const horses=new Set();
    for(const runner of race.entries){
     const program=String(runner?.program_number||"").trim().toUpperCase();
     const name=targetHorseKey(runner?.horse_name);
     if(program&&name)horses.add(program+"|"+name);
    }
    if(Object.keys(facts).length&&horses.size)records.set(id,{facts,horses});
   }
  }
 }catch{return new Map();}
 return records;
}
function enrichTargetRace(entry,all){
 const original=all.get(targetTrackKey(entry.track)+"|"+entry.race_number);
 if(!original)return entry;
 const matches=runner=>runner&&original.horses.has(String(runner.program_number||"")
   .trim().toUpperCase()+"|"+targetHorseKey(runner.horse_name));
 if(!matches(entry.favorite)&&!matches(entry.attack))return entry;
 const copy={...entry};
 for(const [key,value] of Object.entries(original.facts))if(!copy[key])copy[key]=value;
 return copy;
}

/* Separated editorial review lane.
   Never mix a displayed review with receipt-certified production editions.
   The JSON is private R2 only, not a public static asset. */
const REVIEW_PREFIX="racing-intelligence/target-list-review/";
export async function readAdminTargetListReview(env,url){
 if(!env.CARDS_BUCKET)return fail("Private Target List review storage unavailable.",503);
 const date=url.searchParams.get("date");
 if(date&&!dateValid(date))return fail("Invalid race date.",400);
 const rows=[];let cursor;
 do{
  const page=await env.CARDS_BUCKET.list({prefix:REVIEW_PREFIX,limit:1000,...(cursor?{cursor}:{})});
  for(const obj of page.objects||[]){
   const matched=/^racing-intelligence\/target-list-review\/(\d{4}-\d{2}-\d{2})\/revision-(\d{4})\.json$/.exec(obj.key);
   if(matched&&dateValid(matched[1]))rows.push({date:matched[1],revision:Number(matched[2]),key:obj.key});
  }
  cursor=page.truncated?page.cursor:null;
  if(page.truncated&&!cursor)return fail("Incomplete private review index.",503);
  if(rows.length>10000)return fail("Private review index too large.",503);
 }while(cursor);
 const editions=new Map();
 for(const entry of rows){
  const last=editions.get(entry.date);
  if(!last||last.revision<entry.revision)editions.set(entry.date,entry);
 }
 const dates=[...editions.keys()].sort((a,b)=>b.localeCompare(a)).slice(0,60);
 const chosen=date?editions.get(date):editions.get(dates[0]);
 if(!chosen)return response({dates,edition:null,review_only:true});
 const obj=await env.CARDS_BUCKET.get(chosen.key);
 if(!obj)return fail("Private review edition unavailable.",503);
 const plain=await obj.text();
 if(plain.length>512*1024)return fail("Private review payload exceeds limit.",503);
 const checksum=await sha256(plain);
 if(!obj.customMetadata?.sha256||obj.customMetadata.sha256!==checksum)
  return fail("Private review integrity check failed.",503);
 let edition;
 try{edition=JSON.parse(plain);}catch{return fail("Invalid stored private review.",503);}
 if(!object(edition)||edition.schema_version!==1||edition.product_type!=="target_list"||
    edition.review_only!==true||edition.customer_publish_approved!==false||
    edition.production_receipt_verified!==false||
    edition.race_date!==chosen.date||edition.revision!==chosen.revision||
    !Array.isArray(edition.targets)||edition.targets.length>100)
  return fail("Stored private review is not safe for preview.",503);
 // A reviewer can inspect the original published values without pretending they
 // are certified unrounded TRI figures. Certified uploads use validateTargetList().
 try{
  if(!object(edition.source)||!/^[a-f0-9]{64}$/.test(edition.source.editorial_sha256||'')||
     !/^[a-f0-9]{64}$/.test(edition.source.timeforms_zip_sha256||'')||
     edition.source.tri_full_field_receipt_id!=null||edition.source.tri_unrounded_scoring_receipt_sha256!=null)
   throw Error('Missing review-only source custody.');
  if(!['initial','scratch_update','editorial_update'].includes(edition.status))throw Error('Invalid review status.');
  if(edition.revision===1&&edition.status!=='initial'||edition.revision>1&&!['scratch_update','editorial_update'].includes(edition.status))throw Error('Invalid review revision.');
  const ids=new Set(),ranks=new Set();
  for(const item of edition.targets){
   if(!object(item)||!Number.isInteger(item.rank)||item.rank<1||ranks.has(item.rank))throw Error('Invalid rank.');
   ranks.add(item.rank);const track=field(item.track,'Track',100);
   if(!Number.isInteger(item.race_number)||item.race_number<1||item.race_number>99)throw Error('Invalid race.');
   const id=track.toLowerCase()+'|'+item.race_number;
   if(ids.has(id))throw Error('Duplicate race.');ids.add(id);
   field(item.analysis,'Editorial analysis',4000);
   field(item.post_time_et,'Post time',40,false);
   for(const role of ['favorite','attack']){
    const horse=item[role];if(!object(horse))throw Error('Missing source horse.');
    if(!/^\d{1,2}[A-Za-z]?$/.test(field(horse.program_number,'Saddlecloth',4)))throw Error('Invalid saddlecloth.');
    field(horse.horse_name,'Horse',120);field(horse.morning_line,'Morning line',24);field(horse.fair_odds,'Fair odds',32);
    if(typeof horse.win_probability!=='number'||!Number.isFinite(horse.win_probability)||horse.win_probability<0||horse.win_probability>100)
     throw Error('Invalid displayed PWIN.');
    if(horse.win_probability_exact!=null||horse.unrounded_verified_pwin!=null)throw Error('Uncertified review cannot claim verified exact scores.');
   }
   if(item.attack.program_number===item.favorite.program_number||item.attack.win_probability<=item.favorite.win_probability)
    throw Error('Invalid ATTACK candidate.');
   if(item.also_live!=null)throw Error('Unverified secondary runner.');
   if(item.scratches!=null&&(!Array.isArray(item.scratches)||edition.status==='initial'&&item.scratches.length))throw Error('Invalid scratch status.');
  }
 }catch(e){return fail('Private review fields failed validation.',503);}
 const raceFacts=await targetOriginalRaceFacts(env,edition.race_date);
 const displayEdition={...edition,targets:edition.targets.map(entry=>enrichTargetRace(entry,raceFacts))};
 return response({dates,edition:displayEdition,review_only:true,demo_example:false,
  uploaded_at:obj.customMetadata?.uploaded_at||null});
}

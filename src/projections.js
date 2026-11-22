const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES=1024*1024;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const fail=(message,status=400)=>json({error:message},status);
const projectionKey=id=>"projections/"+id+".json";
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
function normalizeCard(input){
 if(!isObject(input)||input.schema_version!==1)throw Error("This file must use projection schema version 1.");
 const raceDate=input.race_date;
 if(!isoDate(raceDate))throw Error("Race date must use YYYY-MM-DD.");
 const trackName=text(input.track_name,"Track name",100,true);
 if(!Array.isArray(input.races)||input.races.length<1||input.races.length>20)throw Error("Include between 1 and 20 races.");
 const seenRaces=new Set();
 const races=input.races.map((race,index)=>{
  if(!isObject(race))throw Error("Race "+(index+1)+" is invalid.");
  const number=Number(race.race_number);
  if(!Number.isInteger(number)||number<1||number>20||seenRaces.has(number))throw Error("Race numbers must be unique whole numbers from 1 to 20.");
  seenRaces.add(number);
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
   const notes=text(entry.notes,"Horse notes",1200);
   return {program_number:program,horse_name:horseName,rank,win_probability:win,morning_line:morning,metrics:normalizeMetrics(entry.metrics),notes};
  });
  return {race_number:number,post_time_et:text(race.post_time_et,"Post time",40),surface:text(race.surface,"Surface",50),distance:text(race.distance,"Distance",60),conditions:text(race.conditions,"Race conditions",240),summary:text(race.summary,"Race summary",1000),entries};
 });
 return {schema_version:1,race_date:raceDate,track_name:trackName,races};
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
 }catch(e){return fail(e.message||"Could not read projection data.");}
 const product=await env.STORE_DB.prepare("SELECT id,title,category,race_date,track,pdf_key,status FROM products WHERE id=? AND category='Race Cards' AND status IN ('draft','published','archived') AND pdf_key IS NOT NULL AND pdf_key!='__rr_bundle__' AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=products.id)").bind(body.product_id).first();
 if(!product)return fail("Choose an individual Race Cards publication with a PDF attached.",404);
 if(product.race_date&&product.race_date!==card.race_date)return fail("The JSON race date does not match the selected publication date.",409);
 const uploadedAt=new Date().toISOString();
 try{
  await env.CARDS_BUCKET.put(projectionKey(product.id),JSON.stringify(card),{httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},customMetadata:{product_id:product.id,uploaded_at:uploadedAt}});
  return json({ok:true,product_id:product.id,title:product.title,track_name:card.track_name,race_date:card.race_date,races:card.races.length,entries:card.races.reduce((sum,race)=>sum+race.entries.length,0),uploaded_at:uploadedAt});
 }catch(e){
  console.error("Projection upload failed",String(e).slice(0,120));
  return fail("Projection data could not be saved.",503);
 }
}
export async function readMemberProjectionCards(env,library){
 if(!env.CARDS_BUCKET)return [];
 const products=(library||[]).filter(item=>item.category==="Race Cards").slice(0,80);
 const cards=await Promise.all(products.map(async item=>{
  try{
   const file=await env.CARDS_BUCKET.get(projectionKey(item.id));
   if(!file)return null;
   const card=normalizeCard(JSON.parse(await file.text()));
   return {product_id:item.id,title:item.title,track:item.track||card.track_name,race_date:item.race_date||card.race_date,pdf_expires_at:item.pdf_expires_at,uploaded_at:file.customMetadata?.uploaded_at||null,card};
  }catch(e){
   console.warn("Skipping unreadable projection data for one publication",String(e).slice(0,100));
   return null;
  }
 }));
 return cards.filter(Boolean);
}

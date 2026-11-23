import {getPickTicketsIntake} from './pick-tickets-intake.js';
import {buildPrescratchPickTicketReview,readPrivatePickProjections} from './pick-tickets-auto.js';
import {readAdminProjectionCards} from './projections.js';
/* Pick Tickets: admin-only dashboard staging. No scoring, public data, or customer-launch route. */
const PREFIX="pick-tickets/dashboard/";
const ARCHIVE="pick-tickets/revisions/";
const HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow, noarchive","X-Content-Type-Options":"nosniff"};
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const text=(v,label,max,required=true)=>{
 if(typeof v!=="string"||(required&&!v.trim())||v.length>max)throw Error(label+" must be text of at most "+max+" characters.");
 return v.trim();
};
const obj=v=>!!v&&typeof v==="object"&&!Array.isArray(v);
const integer=(v,label,min,max)=>{
 if(!Number.isSafeInteger(v)||v<min||v>max)throw Error(label+" must be a whole number between "+min+" and "+max+".");
 return v;
};
const validDate=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v;
const slug=v=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
const currentKey=c=>PREFIX+c.date+"/"+slug(c.track)+".json";
const revisionKey=(c,hash)=>ARCHIVE+c.date+"/"+slug(c.track)+"/r"+String(c.revision).padStart(5,"0")+"-"+hash.slice(0,16)+".json";
const programValue=(v,label)=>{
 const p=text(v,label,8).toUpperCase();
 if(!/^[0-9]{1,2}[A-Z]?$/.test(p))throw Error(label+" needs an explicit saddle number (not ALL or a range).");
 return p;
};
const validPercent=(value,label)=>{const p=value==null?"":text(value,label,32,false);if(p&&!/^(?:100(?:\.0+)?|[0-9]{1,2}(?:\.[0-9]+)?)%$/.test(p))throw Error(label+" must be a certified percentage.");return p;};
const unique=(values,label)=>{
 if(new Set(values).size!==values.length)throw Error(label+" contains duplicate entries.");
 return values;
};
function normalizeTicket(input,first,last,label){
 if(!obj(input))throw Error(label+" must be a ticket.");
 const role=text(input.role,label+" role",24);
 if(!["LEAN","FULL_COVERAGE","BEST_POSSIBLE"].includes(role))throw Error(label+" has an unknown ticket role.");
 const title=text(input.title,label+" name",80);
 const unit_cents=integer(input.unit_cents,label+" wager denomination",1,100000);
 const combinations=integer(input.combinations,label+" combinations",1,1000000000);
 const total_cents=integer(input.total_cents,label+" total cost",1,100000000000);
 if(!Array.isArray(input.legs)||input.legs.length!==last-first+1)throw Error(label+" must include every race in this sequence.");
 let computed=1;
 const legs=input.legs.map((leg,i)=>{
  if(!obj(leg)||leg.race_number!==first+i)throw Error(label+" race legs must be in official consecutive race order.");
  if(!Array.isArray(leg.programs)||leg.programs.length<1||leg.programs.length>30)throw Error(label+" race "+leg.race_number+" requires explicit runner numbers.");
  const programs=unique(leg.programs.map((p,j)=>programValue(p,label+" program "+(j+1))),label+" race "+leg.race_number);
  computed*=programs.length;
  if(!Number.isSafeInteger(computed))throw Error(label+" combinations overflow.");
  return {race_number:leg.race_number,programs};
 });
 // Audits source arithmetic. Never changes source selections, odds, probability or status.
 if(computed!==combinations||unit_cents*combinations!==total_cents)throw Error(label+" source combination/denomination/cost audit failed.");
 return {role,title,unit_cents,combinations,total_cents,legs,
  hit_rate_display:validPercent(input.hit_rate_display,label+" ticket hit rate"),
  notes:input.notes==null?"":text(input.notes,label+" ticket notes",1200,false)};
}
function normalizeSequence(s,index){
 const label="Sequence "+(index+1);
 if(!obj(s))throw Error(label+" must be an object.");
 const name=text(s.name,label+" name",100);
 const first=integer(s.start_race,label+" start",1,20),last=integer(s.end_race,label+" end",first,20);
 if(last-first+1<3)throw Error(label+" must span at least three consecutive races.");
 const play_status=text(s.play_status,label+" status",20);
 if(!["PLAY","CONDITIONAL","PASS"].includes(play_status))throw Error(label+" must be PLAY, CONDITIONAL or PASS.");
 if(!Array.isArray(s.tickets)||s.tickets.length<1||s.tickets.length>6)throw Error(label+" needs source-certified tickets.");
 const tickets=s.tickets.map((t,i)=>normalizeTicket(t,first,last,label+" ticket "+(i+1)));
 unique(tickets.map(t=>t.role),label+" ticket tiers");
 if(play_status==="PASS"&&!tickets.some(t=>t.role==="BEST_POSSIBLE"))throw Error(label+" is PASS but lacks a source-supplied BEST_POSSIBLE ticket.");
 const hit_rate=validPercent(s.hit_rate_display,label+" hit rate");
 // Optional complete field enables custom ticket selection outside published tiers.
 // Without verified race_fields, UI limits choices to submitted ticket runners.
 let race_fields=[];
 if(s.race_fields!==undefined){
  if(!Array.isArray(s.race_fields)||s.race_fields.length!==last-first+1)throw Error(label+" race_fields must cover every sequence race.");
  race_fields=s.race_fields.map((field,i)=>{
   if(!obj(field)||field.race_number!==first+i||!Array.isArray(field.programs)||!field.programs.length||field.programs.length>30)throw Error(label+" race_fields must list real runner numbers in race order.");
   return {race_number:field.race_number,programs:unique(field.programs.map((p,j)=>programValue(p,label+" eligible runner "+j)),label+" eligible field")};
  });
  for(const ticket of tickets)for(const leg of ticket.legs){
   const eligible=race_fields.find(r=>r.race_number===leg.race_number);
   if(leg.programs.some(p=>!eligible.programs.includes(p)))throw Error(label+" ticket contains a program not in the certified race_fields.");
  }
 }
 return {name,start_race:first,end_race:last,play_status,hit_rate_display:hit_rate,
  recommendation:s.recommendation==null?"":text(s.recommendation,label+" recommendation",1500,false),
  tickets,...(s.race_fields!==undefined?{race_fields}:{})};
}
export function normalizePickTickets(input){
 if(!obj(input)||input.schema_version!==1||input.product_type!=="pick_tickets")throw Error("Expected certified Pick Tickets schema version 1.");
 if(!validDate(input.date))throw Error("A real YYYY-MM-DD race date is required.");
 const track=text(input.track,"Track",100);
 if(!slug(track))throw Error("Invalid track.");
 const revision=integer(input.revision,"Revision",1,99999);
 const status=text(input.status,"Source status",30);
 if(!["initial_current","scratch_updated"].includes(status))throw Error("Source status must be initial_current or scratch_updated.");
 if(!obj(input.source_receipt))throw Error("Production receipt required.");
 const reference=text(input.source_receipt.reference,"Production receipt reference",160);
 const sha256=text(input.source_receipt.sha256,"Production receipt SHA256",64).toLowerCase();
 if(!/^[0-9a-f]{64}$/.test(sha256))throw Error("Source receipt SHA256 must be 64 hex characters.");
 const scratch_verified_at=input.scratch_verified_at==null?"":text(input.scratch_verified_at,"Scratch verified timestamp",36,false);
 if(status==="scratch_updated"&&(!scratch_verified_at||!Number.isFinite(Date.parse(scratch_verified_at))))throw Error("Scratch-updated editions require a verified scratch timestamp.");
 if(!Array.isArray(input.sequences)||input.sequences.length<1||input.sequences.length>80)throw Error("Include between 1 and 80 source-certified sequences.");
 const sequences=input.sequences.map(normalizeSequence);
 unique(sequences.map(s=>s.name+"|"+s.start_race+"|"+s.end_race),"Sequence identities");
 return {schema_version:1,product_type:"pick_tickets",date:input.date,track,revision,status,
  source_receipt:{reference,sha256},scratch_verified_at,sequences};
}
async function sha256(source){
 const bytes=new TextEncoder().encode(source);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
async function parseBody(request){
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw Error("Expected application/json.");
 const length=Number(request.headers.get("content-length")||0);
 if(length>3*1024*1024)throw Error("Upload exceeds the 3MB limit.");
 const source=await request.text();
 if(new TextEncoder().encode(source).length>3*1024*1024)throw Error("Upload exceeds the 3MB limit.");
 let body;try{body=JSON.parse(source);}catch{throw Error("Select a valid JSON export.");}
 const raw=Array.isArray(body?.cards)?body.cards:Array.isArray(body)?body:[body];
 if(raw.length<1||raw.length>25)throw Error("Upload 1–25 track editions per batch.");
 // Admin-only mock fixtures are never valid published/source-certified data.
 if(raw.some(c=>c?.is_demo||c?.status==="demo"||c?.source_receipt?.reference?.startsWith("MOCK-")||c?.source_receipt?.sha256==="0".repeat(64)))throw Error("Mock layout selections cannot be uploaded as certified tickets.");
 const cards=raw.map(normalizePickTickets);
 unique(cards.map(c=>currentKey(c)),"Track/date editions");
 return cards;
}
async function readCards(env){
 const listed=await env.CARDS_BUCKET.list({prefix:PREFIX,limit:1000});
 const records=await Promise.all((listed.objects||[]).map(async obj=>{
  try{
   const file=await env.CARDS_BUCKET.get(obj.key);
   if(!file)return null;
   const card=normalizePickTickets(JSON.parse(await file.text()));
   return {card,updated_at:file.customMetadata?.updated_at||null,content_sha256:file.customMetadata?.content_sha256||null};
  }catch(e){console.warn("Invalid private Pick Tickets edition skipped",obj.key,String(e).slice(0,100));return null;}
 }));
 return records.filter(Boolean).sort((a,b)=>b.card.date.localeCompare(a.card.date)||a.card.track.localeCompare(b.card.track));
}
export async function handleAdminPickTickets(request,env){
 if(!env.CARDS_BUCKET)return respond({error:"Private R2 storage is not configured."},503);
 if(request.method==="GET"){
  const certified=await readCards(env);
  let prescratch={cards:[],rejected:[]};
  try{
   // Prefer the five current date-keyed R2 projections; no legacy D1/PDF lookup.
   const direct=await readPrivatePickProjections(env);
   if(direct.length)prescratch=buildPrescratchPickTicketReview(direct);
   if(prescratch.cards.length===0){
    // Backward-compatible fallback for authorized legacy projection revisions.
    const result=await readAdminProjectionCards(env);
    if(result.ok){
     const source=await result.json();
     const legacy=buildPrescratchPickTicketReview(source.cards||[]);
     if(legacy.cards.length)prescratch=legacy;
    }
   }
  }catch(e){console.warn("Private provisional Pick Tickets projection intake unavailable",String(e).slice(0,160));}
  const saved=new Set(certified.map(x=>x.card.date+"|"+x.card.track));
  const review=prescratch.cards.filter(x=>!saved.has(x.card.date+"|"+x.card.track));
  return respond({cards:[...certified,...review],intake:getPickTicketsIntake(),
   review_count:review.length,review_rejected:prescratch.rejected,demo:false});
 }
 if(request.method!=="POST")return respond({error:"Method not allowed."},405);
 let cards;try{cards=await parseBody(request);}catch(e){return respond({error:e.message},400);}
 const toWrite=[];
 try{
  // Preflight ALL editions before any write. A stale prescratch run cannot displace a scratch revision.
  for(const card of cards){
   const key=currentKey(card),data=JSON.stringify(card),hash=await sha256(data);
   const prior=await env.CARDS_BUCKET.get(key);
   if(prior){
    const previous=normalizePickTickets(JSON.parse(await prior.text()));
    const oldHash=await sha256(JSON.stringify(previous));
    if(card.revision<previous.revision)throw Error(card.track+": revision rollback rejected.");
    if(previous.status==="scratch_updated"&&card.status==="initial_current")throw Error(card.track+": scratch-updated edition cannot be replaced with initial data.");
    if(card.revision===previous.revision&&hash!==oldHash)throw Error(card.track+": same revision contains different data. Increment the certified revision.");
    if(card.revision===previous.revision&&hash===oldHash)continue;
   }
   toWrite.push({card,key,data,hash});
  }
 }catch(e){return respond({error:e.message},409);}
 const updated=[];
 for(const item of toWrite){
  const updatedAt=new Date().toISOString();
  try{
   const metadata={content_sha256:item.hash,updated_at:updatedAt,receipt_sha256:item.card.source_receipt.sha256};
   const options={httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},customMetadata:metadata};
   await env.CARDS_BUCKET.put(revisionKey(item.card,item.hash),item.data,options);
   await env.CARDS_BUCKET.put(item.key,item.data,options);
   const written=await env.CARDS_BUCKET.get(item.key);
   if(!written||await sha256(await written.text())!==item.hash)throw Error("R2 read-back checksum did not match.");
   updated.push({track:item.card.track,date:item.card.date,revision:item.card.revision,sha256:item.hash});
  }catch(e){console.error("Pick Tickets private upload failed",item.key,String(e).slice(0,160));return respond({error:"A track could not be written and verified in private storage.",updated},503);}
 }
 return respond({ok:true,updated,unchanged:cards.length-updated.length});
}
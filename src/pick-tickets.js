import {publishGPTProductCatalogEntry} from "./gpt-product-catalog.js";
import {pickPostTimes} from "./pick-tickets-post-times.js";
import {buildV34TrialCard,PICK_V34_ENGINE,PICK_V34_TRIAL_SCALES,usesV34,hasV34ReceiptPair} from './pick-tickets-v34.js';
import {getPickTicketsIntake,getPickTicketsIntake1124} from './pick-tickets-intake.js';
import {buildPrescratchPickTicketReview,buildV33PostScratchReviewed,
 buildV33ScratchFieldPreview,readPrivatePickProjections,readPrivatePickProjections1124,
 pickMenuForDate} from './pick-tickets-auto.js';
import {PICK_V33_ENGINE,PICK_V33_COST_SCALE_DOLLARS,
 PICK_V33_MIN_LEG_COVERAGE} from './pick-tickets-v33.js';
import {readAdminProjectionCards} from './projections.js';
import {enrichRaceInformation,genericStakesTitle} from './projection-race-information.js';
import {getNov23ScratchLedger,sourceIsScratchCurrent,officialScratchSequenceCount} from './pick-tickets-scratch-1123.js';
import {PICK_MENU_1123} from './pick-tickets-auto.js';
import {auditV33FieldUpload,pickUploadAuditKey,projectionFieldFingerprint,
 matchStoredTicketToLatestSource,isPickV33Field} from './pick-tickets-field-audit.js';
/* Pick Tickets: admin-only dashboard staging. No scoring, public data, or customer-launch route. */
const PREFIX="pick-tickets/dashboard/";
const CUSTOMER_PREFIX="racing-intelligence/product-tabs/pick-tickets/";
const ARCHIVE="pick-tickets/revisions/";
const HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow, noarchive","X-Content-Type-Options":"nosniff"};
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const text=(v,label,max,required=true)=>{
 if(typeof v!=="string"||(required&&!v.trim())||v.length>max)throw Error(label+" must be text of at most "+max+" characters.");
 return v.trim();
};
const obj=v=>!!v&&typeof v==="object"&&!Array.isArray(v);

function publicScratches(value){
 if(!obj(value))return null;
 const safe={};
 for(const [race,numbers] of Object.entries(value)){
  if(!/^(?:[1-9]|1[0-9]|20)$/.test(race)||!Array.isArray(numbers)||numbers.length>30)continue;
  const clean=[...new Set(numbers.map(item=>String(item||"").trim().toUpperCase()).filter(item=>/^[0-9]{1,2}[A-Z]?$/.test(item)))];
  if(clean.length)safe[race]=clean;
 }
 return Object.keys(safe).length?safe:null;
}
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
// Preserve complete exact source probabilities on the protected customer path.
// Reject partial vectors, wrong fields and arithmetic inconsistent with the ticket.
function normalizeReviewProbabilities(raw,fields,tickets,label){
 if(raw===undefined)return undefined;
 if(!obj(raw)||!fields.length||Object.keys(raw).length!==fields.length)throw Error(label+" requires complete PWIN fields.");
 const safe={};
 for(const field of fields){
  const key=String(field.race_number),v=raw[key];
  if(!obj(v)||Object.keys(v).length!==field.programs.length)throw Error(label+" PWIN field mismatch.");
  let sum=0;const probs={};
  for(const p of field.programs){
   const n=v[p];
   if(!Object.hasOwn(v,p)||typeof n!=="number"||!Number.isFinite(n)||n<0||n>100)throw Error(label+" invalid PWIN.");
   probs[p]=n;sum+=n;
  }
  if(Math.abs(sum-100)>1e-5)throw Error(label+" PWIN mass must equal 100%.");
  safe[key]=probs;
 }
 for(const ticket of tickets){
  if(!ticket.hit_rate_display)continue;
  const hit=100*ticket.legs.reduce((h,l)=>h*l.programs.reduce((n,p)=>n+safe[String(l.race_number)][p],0)/100,1);
  const shown=Number.parseFloat(ticket.hit_rate_display),digits=(ticket.hit_rate_display.split(".")[1]||"").replace("%","").length;
  if(Math.abs(hit-shown)>.5*Math.pow(10,-digits)+1e-8)throw Error(label+" PWIN does not match ticket hit rate.");
 }
 return safe;
}
function normalizedPostTimes(value){
 if(!obj(value))return undefined;
 const result={};
 for(const [k,v] of Object.entries(value))if(/^(?:[1-9]|1[0-9]|20)$/.test(k)&&typeof v==="string"&&/^(?:[1-9]|1[0-2]):[0-5][0-9] [AP]M(?: ET)?$/.test(v))result[k]=v;
 return Object.keys(result).length?result:undefined;
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
 const probabilities=normalizeReviewProbabilities(s.review_probabilities,race_fields,tickets,label);
 return {name,start_race:first,end_race:last,play_status,hit_rate_display:hit_rate,
  recommendation:s.recommendation==null?"":text(s.recommendation,label+" recommendation",1500,false),
  tickets,...(s.race_fields!==undefined?{race_fields}:{}),
  ...(probabilities?{review_probabilities:probabilities}:{})};
}
export function normalizePickTickets(input){
 if(!obj(input)||input.schema_version!==1||input.product_type!=="pick_tickets")throw Error("Expected Pick Tickets schema version 1.");
 if(!validDate(input.date))throw Error("A real YYYY-MM-DD race date is required.");
 const track=text(input.track,"Track",100);
 if(!slug(track))throw Error("Invalid track.");
 const revision=integer(input.revision,"Revision",1,99999);
 const status=text(input.status,"Source status",30);
 if(!["initial_current","scratch_updated"].includes(status))throw Error("Source status must be initial_current or scratch_updated.");
 const ownerRelease=input.publication_mode==="owner-approved-gpt";
 let sourceReceipt=null;
 if(!ownerRelease){
  if(!obj(input.source_receipt))throw Error("Production receipt required.");
  const reference=text(input.source_receipt.reference,"Production receipt reference",160);
  const sha256=text(input.source_receipt.sha256,"Production receipt SHA256",64).toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(sha256))throw Error("Source receipt SHA256 must be 64 hex characters.");
  sourceReceipt={reference,sha256};
 }
 const scratch_verified_at=input.scratch_verified_at==null?"":text(input.scratch_verified_at,"Scratch verified timestamp",36,false);
 if(status==="scratch_updated"&&!ownerRelease&&(!scratch_verified_at||!Number.isFinite(Date.parse(scratch_verified_at))))throw Error("Scratch-updated editions require a verified scratch timestamp.");
 if(!Array.isArray(input.sequences)||input.sequences.length<1||input.sequences.length>80)throw Error("Include between 1 and 80 Pick Ticket sequences.");
 const sequences=input.sequences.map(normalizeSequence);
 unique(sequences.map(s=>s.name+"|"+s.start_race+"|"+s.end_race),"Sequence identities");
 const formula_version=input.formula_version==null?"":text(input.formula_version,"Formula version",90,false);
 const source_input_sha256=input.source_input_sha256==null?"":text(input.source_input_sha256,"Source field SHA-256",64,false).toLowerCase();
 if(source_input_sha256&&!/^[a-f0-9]{64}$/.test(source_input_sha256))throw Error("Source input SHA-256 must be 64 hex.");
 if(ownerRelease&&!/^[a-f0-9]{64}$/.test(source_input_sha256))throw Error("Owner-released GPT tickets must identify the source field.");
 if(formula_version===PICK_V33_ENGINE&&input.date==="2026-11-23"&&PICK_MENU_1123.some(x=>x.track===track)&&!source_input_sha256)
  throw Error("Certified V3.3 Pick Tickets must identify the exact uploaded TRI field.");
 const scratches=publicScratches(input.scratches_by_race);
 const postTimes=normalizedPostTimes(input.post_times_by_race);
 return {schema_version:1,product_type:"pick_tickets",date:input.date,track,revision,status,
  formula_version,source_input_sha256,...(sourceReceipt?{source_receipt:sourceReceipt}:{}),
  ...(ownerRelease?{publication_mode:"owner-approved-gpt"}:{}),scratch_verified_at,sequences,
  ...(scratches?{scratches_by_race:scratches}:{}),...(postTimes?{post_times_by_race:postTimes}:{})};
}
function normalizeStoredPickTickets(raw){
 const hasReceipt=obj(raw?.source_receipt)&&typeof raw.source_receipt.sha256==="string";
 const hasSourceHash=typeof raw?.source_input_sha256==="string"&&/^[a-f0-9]{64}$/i.test(raw.source_input_sha256);
 return normalizePickTickets(!hasReceipt&&hasSourceHash?{...raw,publication_mode:"owner-approved-gpt"}:raw);
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
 const cards=raw.map(card=>{
  const hasReceipt=obj(card?.source_receipt)&&typeof card.source_receipt.sha256==="string";
  const hasSourceHash=typeof card?.source_input_sha256==="string"&&/^[a-f0-9]{64}$/i.test(card.source_input_sha256);
  return normalizePickTickets(!hasReceipt&&hasSourceHash?{...card,publication_mode:"owner-approved-gpt"}:card);
 });
 unique(cards.map(c=>currentKey(c)),"Track/date editions");
 return cards;
}
async function readCards(env){
 const listed=await env.CARDS_BUCKET.list({prefix:PREFIX,limit:1000});
 const records=await Promise.all((listed.objects||[]).map(async obj=>{
  try{
   const file=await env.CARDS_BUCKET.get(obj.key);
   if(!file)return null;
   const card=normalizeStoredPickTickets(JSON.parse(await file.text()));
   // Authenticated administrator-only R2 audit allows source-based custom
   // ticket hit recalculation after the model's actual scratch-final run.
   // Never put private runner PWIN in a public JS file, git JSON or open route.
   if(card.date==="2026-11-23"&&card.status==="scratch_updated"&&
      ["Mountaineer","Zia Park"].includes(card.track)){
    try{
     const auditKey="pick-tickets/scorer-audit/"+card.date+"/"+slug(card.track)+".json";
     const result=await env.CARDS_BUCKET.get(auditKey);
     if(result){
      const audit=JSON.parse(await result.text());
      if(audit.track===card.track&&
         audit.f4_receipt_sha256===card.source_receipt.sha256&&
         audit.source_input_changes?.length===0&&audit.active_runners){
       const proofs=new Map();
       for(const [race,rows] of Object.entries(audit.active_runners)){
        if(!Array.isArray(rows)||!rows.length)throw Error("R2 source audit has no complete field.");
        const mass=rows.reduce((v,r)=>v+(Number.isFinite(r.pwin)?r.pwin:0),0);
        if(Math.abs(mass-1)>1e-10||rows.some(r=>!Number.isFinite(r.pwin)||r.pwin<0||
           r.pwin>1||Math.abs(r.pwin-r.f4_p1)>1e-12))throw Error("F4/PWIN source audit mismatch.");
        proofs.set(race,Object.fromEntries(rows.map(r=>[String(r.program),r.pwin*100])));
       }
       for(const sequence of card.sequences){
        if(!sequence.race_fields?.every(x=>Object.keys(proofs.get(String(x.race_number))||{}).length===x.programs.length))continue;
        sequence.review_probabilities=Object.fromEntries(sequence.race_fields.map(x=>[
         String(x.race_number),proofs.get(String(x.race_number))]));
       }
      }
     }
    }catch(e){console.warn("Scratch-final private ticket audit unavailable",String(e).slice(0,100));}
   }
   return {card,updated_at:file.customMetadata?.updated_at||null,content_sha256:file.customMetadata?.content_sha256||null};
  }catch(e){console.warn("Invalid private Pick Tickets edition skipped",obj.key,String(e).slice(0,100));return null;}
 }));
 return records.filter(Boolean).sort((a,b)=>b.card.date.localeCompare(a.card.date)||a.card.track.localeCompare(b.card.track));
}
// Read-only descriptive facts for customer ticket legs. Exact date and track
// joins only; duplicate source cards are ambiguous. Never return horse data here.
function pickRaceTitles(source){
 const titles={};
 for(const race of enrichRaceInformation(source).races||[]){
  const name=String(race.stakes_name||race.race_name||race.conditions||"").trim();
  const stakes=race.is_stakes===true||/(?:\\bStakes?\\b|\\bStks?\\.?\\b|\\bS\\.(?:\\s|$))/i.test(name);
  if(!stakes||!name||genericStakesTitle(name))continue;
  titles[String(race.race_number)]={race_number:race.race_number,stakes_name:race.stakes_name||"",
   race_name:race.race_name||"",conditions:race.conditions||"",
   stakes_grade:race.stakes_grade||"",sponsor_name:race.sponsor_name||"",is_stakes:stakes};
 }
 return titles;
}
async function attachCustomerRaceTitles(env,cards){
 const dates=[...new Set(cards.map(card=>card.date))];
 for(const date of dates){
  try{
   const prefix="projections/dashboard/"+date+"/",listing=await env.CARDS_BUCKET.list({prefix,limit:1000});
   if(listing.truncated)continue;
   const sources=new Map(),ambiguous=new Set();
   for(const item of listing.objects||[]){
    if(!item.key.startsWith(prefix)||!item.key.endsWith(".json"))continue;
    const file=await env.CARDS_BUCKET.get(item.key);if(!file)continue;
    let source;try{source=JSON.parse(await file.text());}catch{continue;}
    if(source?.schema_version!==1||source.race_date!==date||typeof source.track_name!=="string"||!Array.isArray(source.races))continue;
    const track=source.track_name.trim().toLowerCase();
    if(sources.has(track)){ambiguous.add(track);continue;}
    sources.set(track,source);
   }
   for(const card of cards.filter(c=>c.date===date)){
    const track=card.track.trim().toLowerCase(),source=sources.get(track);
    if(!source||ambiguous.has(track))continue;
    const facts=pickRaceTitles(source);
    if(Object.keys(facts).length)card.stakes_by_race=facts;
   }
  }catch(e){console.warn("Pick race title metadata unavailable",String(e?.name||"source error"));}
 }
}
export async function readPublishedPickTicketCards(env,raceDate){
 if(!env.CARDS_BUCKET)return [];
 if(raceDate&&!validDate(raceDate))return [];
 const prefix=CUSTOMER_PREFIX+(raceDate?raceDate+"/":"");
 const listed=await env.CARDS_BUCKET.list({prefix,limit:1000});
 const cards=[];
 for(const object of listed.objects||[]){
  const match=/^racing-intelligence\/product-tabs\/pick-tickets\/(\d{4}-\d{2}-\d{2})\/([a-z0-9-]+)\.json$/.exec(object.key);
  if(!match||(raceDate&&match[1]!==raceDate))continue;
  const file=await env.CARDS_BUCKET.get(object.key);
  if(!file||file.customMetadata?.customer_publish_approved!=="true")continue;
  try{
   const raw=JSON.parse(await file.text());
   const ownerRelease=raw?.publication_mode==="owner-approved-gpt";
   if(ownerRelease!== (file.customMetadata?.publication_mode==="owner-approved-gpt"))continue;
   const card=normalizePickTickets(raw),scratches=publicScratches(raw?.scratches_by_race);
   if(card.date===match[1])cards.push({...card,...(scratches?{scratches_by_race:scratches}:{})});
  }catch(error){console.warn("Invalid published Pick Tickets edition skipped",object.key,String(error).slice(0,100));}
 }
 // Backfill older approved copies that were stripped by the former serializer.
 // Only match the exact certified current field and identical ticket arithmetic;
 // never change a paid edition's selections, label or hit rate here.
 const missing=cards.filter(c=>c.source_input_sha256&&c.sequences.some(s=>!s.review_probabilities));
 if(missing.length){
  try{
   const response=await handleAdminPickTickets(new Request("https://internal.invalid/api/admin/pick-tickets",{method:"GET"}),env);
   if(response.ok){
    const data=await response.json();
    for(const card of missing){
     const row=(data.cards||[]).find(r=>r.card?.date===card.date&&r.card?.track===card.track&&r.card?.source_input_sha256===card.source_input_sha256);
     if(!row)continue;
     enrichPublishedPickFromVerified(card,row);
    }
   }
  }catch(e){console.warn("Published Pick PWIN backfill unavailable",String(e).slice(0,120));}
 }
 await attachCustomerRaceTitles(env,cards);
 return cards.sort((a,b)=>b.date.localeCompare(a.date)||a.track.localeCompare(b.track));
}
export function enrichPublishedPickFromVerified(card,row){
 const source=row?.card;
 if(!card.source_input_sha256||source?.source_input_sha256!==card.source_input_sha256||
    source.date!==card.date||source.track!==card.track||source.formula_version!==card.formula_version)return false;
 let repaired=false;
 for(const seq of card.sequences){
  if(seq.review_probabilities)continue;
  const match=source.sequences?.find(s=>s.name===seq.name&&s.start_race===seq.start_race&&s.end_race===seq.end_race);
  if(!match?.review_probabilities||!seq.race_fields||
     JSON.stringify(match.race_fields)!==JSON.stringify(seq.race_fields))continue;
  const identity=t=>JSON.stringify([t.role,t.unit_cents,t.combinations,t.total_cents,t.legs,t.hit_rate_display]);
  if(JSON.stringify(match.tickets.map(identity))!==JSON.stringify(seq.tickets.map(identity)))continue;
  try{seq.review_probabilities=normalizeReviewProbabilities(match.review_probabilities,seq.race_fields,seq.tickets,"Published sequence");repaired=true;}catch{}
 }
 if(!card.post_times_by_race&&row.post_times_by_race)card.post_times_by_race=normalizedPostTimes(row.post_times_by_race);
 return repaired;
}

export async function publishGPTPickTicketReviews(env){
 if(!env?.CARDS_BUCKET)throw Error("Private Pick Tickets storage is not configured.");
 const response=await handleAdminPickTickets(new Request("https://internal.invalid/api/admin/pick-tickets",{method:"GET"}),env);
 if(!response.ok)throw Error("Pick Tickets review inventory is unavailable.");
 const body=await response.json(),published=[],skipped=[];
 for(const row of body.cards||[]){
  if(row?.review_only!==true)continue;
  const source=row?.card||row;
  const date=source?.date,track=source?.track;
  try{
   const customerCard=normalizePickTickets({...source,publication_mode:"owner-approved-gpt",
    ...(row.scratches_by_race?{scratches_by_race:row.scratches_by_race}:{}),
    ...(row.post_times_by_race?{post_times_by_race:row.post_times_by_race}:{})});
   const customerKey=CUSTOMER_PREFIX+customerCard.date+"/"+slug(customerCard.track)+".json";
   const customerJson=JSON.stringify(customerCard),customerHash=await sha256(customerJson);
   const prior=await env.CARDS_BUCKET.get(customerKey);
   if(prior){
    const priorRevision=Number(prior.customMetadata?.revision||0);
    if(priorRevision>customerCard.revision)throw Error("A newer customer edition is already published.");
    if(priorRevision===customerCard.revision){
     const priorText=await prior.text();
     if(await sha256(priorText)!==customerHash)throw Error("This revision already exists with different content.");
    }
   }
   const publishedAt=new Date().toISOString();
   await env.CARDS_BUCKET.put(customerKey,customerJson,{
    httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},
    customMetadata:{customer_publish_approved:"true",publication_mode:"owner-approved-gpt",
     revision:String(customerCard.revision),content_sha256:customerHash,
     source_sha256:customerCard.source_input_sha256,published_at:publishedAt}
   });
   const written=await env.CARDS_BUCKET.get(customerKey);
   if(!written||await sha256(await written.text())!==customerHash)throw Error("R2 read-back checksum did not match.");
   const listing=env.STORE_DB?await publishGPTProductCatalogEntry(env,{category:"Pick Tickets",race_date:customerCard.date,track:customerCard.track,
    title:customerCard.track+" — "+customerCard.date+" Pick Tickets"}):null;
   if(env.STORE_DB&&!listing?.published)throw Error("The store catalog listing was not created.");
   published.push({date:customerCard.date,track:customerCard.track,revision:customerCard.revision,product_id:listing?.id||null});
  }catch(error){skipped.push({date,track,reason:String(error.message||error).slice(0,180)});}
 }
 return {published,skipped,source_rejections:body.source_rejections||[]};
}

export async function handleAdminPickTickets(request,env){
 if(!env.CARDS_BUCKET)return respond({error:"Private R2 storage is not configured."},503);
 if(request.method==="GET"){
  // Every displayed ticket must match the latest field upload; an older R2
  // edition can never take precedence solely because its status is newer.
  const stored=await readCards(env);
  const sourceRejects=[],reviews=[],authorized=[],sourceVersions=[];
  const staleRevisions=[];
  let sources=[];
  try{sources=[...await readPrivatePickProjections(env),...await readPrivatePickProjections1124(env)]}
  catch(e){sourceRejects.push({reason:"Private source Projections are unavailable."})}
  const byTrack=new Map();
  for(const row of sources){
   const card=row?.card||row;
   if(!isPickV33Field(card))continue;
   const sourceKey=card.race_date+'|'+card.track_name;
   const prior=byTrack.get(sourceKey);
   if(!prior||(prior.card.projection_status!=="scratch_final"&&
       card.projection_status==="scratch_final"))
    byTrack.set(sourceKey,{card,uploaded_at:row.uploaded_at||null});
  }
  // Re-audit the exact current source if the ingestion-side audit has not
  // been staged (legacy files). No guessed prior score or mixed old source.
  const currentAudits=new Map();
  for(const entry of byTrack.values()){
   const card=entry.card;
   try{
    const currentHash=await projectionFieldFingerprint(card);
    let audit=null;
    const staged=await env.CARDS_BUCKET.get(pickUploadAuditKey(card));
    if(staged){
     const record=JSON.parse(await staged.text());
     if(record.source_sha256===currentHash&&record.optimizer===PICK_V33_ENGINE&&
        record.review_only===true&&
        record.review_card?.sequences?.length===
          pickMenuForDate(card.race_date).filter(x=>x.track===card.track_name).length){
      audit=record;
     }
    }
    if(!audit)audit=await auditV33FieldUpload(card);
    if(audit.source_sha256!==currentHash)
     throw Error("Input changed while the ticket field was being verified.");
    currentAudits.set(card.race_date+"|"+card.track_name,audit);
    const review=structuredClone(audit.review_card);
    review.source_input_sha256=currentHash;
    const changed=new Map((audit.sequences||[]).map(x=>
     [x.name+"|"+x.start_race+"|"+x.end_race,x]));
    review.sequences=review.sequences.map(seq=>{
     const update=changed.get(seq.name+"|"+seq.start_race+"|"+seq.end_race);
     return {...seq,upload_change:update?{
      selections_changed:update.selections_changed,
      cost_changed:update.cost_changed,
      hit_changed:update.hit_changed,
      previous_ticket:update.previous_ticket
     }:null};
    });
    review.field_verification={
     status:audit.source_signature_status,
     source_sha256:currentHash,
     source_changed:audit.source_changed,
     changed_races:audit.changed_races,
     changed_sequence_count:audit.changed_sequence_count,
     verified_at:entry.uploaded_at,
     source_stage:card.projection_status,
     score_freshness_verified:audit.score_freshness_verified
    };
    sourceVersions.push({track:card.track_name,date:card.race_date,
     sha256:currentHash,updated_at:entry.uploaded_at,sequence_count:audit.sequence_count,
     changed_sequence_count:audit.changed_sequence_count,
     review_status:audit.source_signature_status});
    // Upload can be mathematically reoptimized and still be WRONG when the
    // input field changed without a corresponding fresh scorer receipt.
    // Preserve the source/version audit for admins, but NEVER offer these
    // selections (nor a stale earlier edition) as usable picks.
    if(audit.input_changes_require_rescoring||
       (card.projection_status==="scratch_final"&&
        audit.scratch_scoring_ready!==true)){
     sourceRejects.push({track:card.track_name,
      reason:card.projection_status==="scratch_final"?
       "Scratch-adjusted runner lists are not a TRI rerun. Fresh certified postscratch TRI/F4 scores and complete field receipts are required before ticket choices can be displayed.":
       "Updated field requires new TRI/F4 scoring receipts before Pick Tickets can be displayed."});
     continue;
    }
    reviews.push({card:review,updated_at:entry.uploaded_at,
     review_only:true});
   }catch(e){sourceRejects.push({track:card.track_name,
    reason:"Unable to verify exact uploaded field: "+String(e.message||e).slice(0,145)})}
  }
  // Legacy paid editions outside this five-track November 23 trial retain
  // their existing treatment. All in-scope editions require source hash,
  // exact reoptimized picks, and explicit customer approval in the audit.
  for(const entry of stored){
   const c=entry.card;
   if(c.date==="2026-11-23"&&PICK_MENU_1123.some(x=>x.track===c.track)){
    const audited=currentAudits.get(c.date+"|"+c.track);
    if(audited&&sourceIsScratchCurrent(c)&&
       matchStoredTicketToLatestSource(c,audited))authorized.push(entry);
    else staleRevisions.push({date:c.date,track:c.track,revision:c.revision,
     reason:"Saved ticket not approved for this exact current TRI field."});
   }else if(c.formula_version===PICK_V33_ENGINE&&c.date<="2026-11-23"&&
            sourceIsScratchCurrent(c)){
    authorized.push(entry);
   }else staleRevisions.push({date:c.date,track:c.track,revision:c.revision,
    reason:"No current-field audit and approved official sequence menu for this date and track."});
  }
  // Verified release editions outrank math reviews only when the source
  // identity and exact selections both match. Otherwise show newly built
  // private review tickets, never stale stored tickets.
  const released=new Set(authorized.map(x=>x.card.date+"|"+x.card.track));
  const reviewCards=reviews.filter(x=>!released.has(x.card.date+"|"+x.card.track));
  const scratch_update=getNov23ScratchLedger();
  scratch_update.dependent_sequences=officialScratchSequenceCount(PICK_MENU_1123);
  // Display-only, certified source-backed event metadata for ticket legs.
  // No TRI, F4, wager combinations, receipts or signed R2 cards are altered.
  const displayed=[...authorized,...reviewCards].map(item=>{
   const source=byTrack.get(item.card.date+"|"+item.card.track)?.card;
   if(!source)return item;
   const stakes=pickRaceTitles(source);
   const postTimes=pickPostTimes(item.card,source);
   const scratches={};
   for(const race of source.races||[]){
    if(race.scratches?.length)scratches[String(race.race_number)]=race.scratches.map(p=>String(typeof p==="object"?p.program_number:p).toUpperCase());
   }
   return {...item,...(Object.keys(stakes).length?{stakes_by_race:stakes}:{}),
    ...(Object.keys(postTimes).length?{post_times_by_race:postTimes}:{}),
    ...(Object.keys(scratches).length?{scratches_by_race:scratches}:{})};
  });
  // V3.4 is the owner-approved default from Nov 24. Earlier editions
  // remain historical V3.3; explicit baseline is a protected QA rollback view.
  const mode=new URL(request.url).searchParams.get("trial");
  const baseline=mode==="v33",onlyV34=mode==="v34";
  let output=[];
  for(const item of displayed){
   if(!usesV34(item.card.date)){
    if(!onlyV34)output.push(item);
    continue;
   }
   if(baseline){output.push(item);continue}
   if(item.review_only!==true)continue;
   const source=byTrack.get(item.card.date+"|"+item.card.track)?.card;
   if(!hasV34ReceiptPair(source)){
    sourceRejects.push({track:item.card.track,reason:"V3.4 requires both current scorer receipt hashes."});continue;
   }
   try{
    const audit=currentAudits.get(item.card.date+"|"+item.card.track);
    // Rebuild from the exact audited full field rather than old selected horses.
    const converted=buildV34TrialCard(item.card);
    if(audit?.v34_review_card&&JSON.stringify(audit.v34_review_card.sequences.map(x=>x.tickets))!==JSON.stringify(converted.sequences.map(x=>x.tickets)))throw Error("V3.4 stored audit differs from exact current construction");
    output.push({...item,card:converted});
   }catch(e){sourceRejects.push({track:item.card.track,reason:"V3.4 held: "+String(e.message||e).slice(0,100)})}
  }
  return respond({cards:output,
   ...(onlyV34?{trial:"V3.4",trial_engine:PICK_V34_ENGINE}:{}),
   default_engine:PICK_V34_ENGINE,
   intake:getPickTicketsIntake1124(),scratch_update,
   stale_revisions:staleRevisions,source_rejections:sourceRejects,
   latest_field_versions:sourceVersions,
   engine:baseline?PICK_V33_ENGINE:PICK_V34_ENGINE,
   soft_cost_scale_dollars:baseline?PICK_V33_COST_SCALE_DOLLARS:null,
   cost_scale_by_length:baseline?null:PICK_V34_TRIAL_SCALES,
   minimum_leg_coverage:baseline?PICK_V33_MIN_LEG_COVERAGE:null,
   private_review_only:true,
   review_count:output.filter(x=>x.review_only===true).length,demo:false});
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
    const previous=normalizeStoredPickTickets(JSON.parse(await prior.text()));
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
   const metadata={content_sha256:item.hash,updated_at:updatedAt,
    ...(item.card.source_receipt?{receipt_sha256:item.card.source_receipt.sha256}:{}),
    ...(item.card.publication_mode?{publication_mode:item.card.publication_mode}:{}),
    ...(item.card.source_input_sha256?{source_sha256:item.card.source_input_sha256}:{})};
   const options={httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},customMetadata:metadata};
   await env.CARDS_BUCKET.put(revisionKey(item.card,item.hash),item.data,options);
   await env.CARDS_BUCKET.put(item.key,item.data,options);
   const written=await env.CARDS_BUCKET.get(item.key);
   if(!written||await sha256(await written.text())!==item.hash)throw Error("R2 read-back checksum did not match.");
   updated.push({track:item.card.track,date:item.card.date,revision:item.card.revision,sha256:item.hash});
  }catch(e){console.error("Pick Tickets private upload failed",item.key,String(e).slice(0,160));return respond({error:"A track could not be written and verified in private storage.",updated},503);}
 }
// A successful GPT-window push is the Pick Tickets publication event.
 // Rebuild from the existing exact-field audit before creating the customer copy;
 // the admin review response itself remains private.
 let verified={cards:[],source_rejections:[],latest_field_versions:[]};
 if(cards.some(card=>card.publication_mode!=="owner-approved-gpt")){
  const verification=await handleAdminPickTickets(new Request("https://internal.invalid/api/admin/pick-tickets",{method:"GET"}),env);
  if(!verification.ok)return respond({ok:false,updated,error:"Pick Tickets saved, but publication verification is unavailable."},503);
  verified=await verification.json();
 }
 const published=[],held=[];
 for(const source of cards){
  const ownerRelease=source.publication_mode==="owner-approved-gpt";
  const blocked=ownerRelease?false:(verified.source_rejections||[]).some(item=>item.track===source.track);
  const row=ownerRelease?null:(verified.cards||[]).find(item=>{
   const card=item?.card||item;
   return card?.date===source.date&&card?.track===source.track;
  });
  const card=ownerRelease?source:(row?.card||row);
  if(!ownerRelease&&(blocked||!card)){
   held.push({date:source.date,track:source.track,reason:"Current source audit did not approve this edition for customer access."});
   continue;
  }
  const sourceVersion=ownerRelease?null:(verified.latest_field_versions||[]).find(item=>item.date===source.date&&item.track===source.track);
  if(!ownerRelease&&row?.review_only===true&&(!sourceVersion||card.source_input_sha256!==sourceVersion.sha256)){
   held.push({date:source.date,track:source.track,reason:"The customer copy did not match the verified source field."});
   continue;
  }
  let customerCard;
  const scratches=publicScratches(ownerRelease?source.scratches_by_race:row?.scratches_by_race);
  try{customerCard=normalizePickTickets({...card,...(scratches?{scratches_by_race:scratches}:{}),...(row?.post_times_by_race?{post_times_by_race:row.post_times_by_race}:{})});}catch{
   held.push({date:source.date,track:source.track,reason:"The customer edition failed structural validation."});
   continue;
  }
  const customerKey=CUSTOMER_PREFIX+customerCard.date+"/"+slug(customerCard.track)+".json";
  const customerJson=JSON.stringify(customerCard),customerHash=await sha256(customerJson);
  const publishedAt=new Date().toISOString();
  try{
   await env.CARDS_BUCKET.put(customerKey,customerJson,{
    httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"private, no-store"},
    customMetadata:{customer_publish_approved:"true",revision:String(customerCard.revision),
     content_sha256:customerHash,published_at:publishedAt,
     ...(customerCard.source_receipt?{source_sha256:customerCard.source_receipt.sha256}:{}),
     ...(customerCard.publication_mode?{publication_mode:customerCard.publication_mode,
       source_sha256:customerCard.source_input_sha256}:{})}
   });
   const written=await env.CARDS_BUCKET.get(customerKey);
   if(!written||await sha256(await written.text())!==customerHash)throw Error("R2 read-back checksum did not match.");
   if(env.STORE_DB){
    const listing=await publishGPTProductCatalogEntry(env,{category:"Pick Tickets",race_date:customerCard.date,track:customerCard.track,title:customerCard.track+" — "+customerCard.date+" Pick Tickets"});
    if(!listing?.published)throw Error("Store catalog listing was not created.");
   }
   published.push({date:customerCard.date,track:customerCard.track,revision:customerCard.revision});
  }catch(error){
   console.error("Pick Tickets customer publication failed",customerKey,String(error).slice(0,120));
   return respond({ok:false,updated,published,held,error:"Pick Tickets saved, but a customer edition could not be verified."},503);
  }
 }
 return respond({ok:held.length===0,updated,published,held,unchanged:cards.length-updated.length,...(held.length?{error:"One or more editions did not pass the customer-publication audit."}:{})},200);
}
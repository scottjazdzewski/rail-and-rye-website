// Forward hard gate for ALL customer Pick Tickets, including direct R2 uploads.
// No model changes. Official evidence is supplied by the private Race Cards run.
import {verifyCertifiedScratchFinalTrack} from "./f4-exotics.js";
export const PICK_FINAL_FIELD_GATE_VERSION="2026-11-28-final-field-v1";
export const requiresFinalPickField=date=>typeof date==="string"&&date>="2026-11-28";
const need=(ok,msg)=>{if(!ok)throw Error("PICK_SCRATCH_HOLD: "+msg)};
const hash=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
export const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,"0")).join("");
const slug=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
export const finalFieldReceiptKey=(date,track)=>"projections/qa/"+date+"/final-fields/"+slug(track)+".json";
const clock=s=>typeof s==="string"&&/(?:Z|[+-]\d\d:\d\d)$/.test(s)?Date.parse(s):NaN;
const easternDate=t=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
const identity=(rows,program="program",horse="horse")=>{
 need(Array.isArray(rows),"missing roster");
 const map=new Map();
 for(const r of rows){const p=r[program],h=r[horse];need(typeof p==="string"&&p.trim()===p&&p.length>0&&typeof h==="string"&&h.trim().length>0&&!map.has(p),"invalid/duplicate runner identity");map.set(p,h);}
 return map;
};
const equal=(a,b)=>a.size===b.size&&[...a].every(([k,v])=>b.get(k)===v);
const sameSet=(a,b)=>a.size===b.size&&[...a].every(x=>b.has(x));
export function verifyFinalFieldReceipt(proof,base,ordered,now=Date.now()){
 need(proof?.schema_version===1&&proof.status==="VERIFIED_FINAL_FIELD"&&proof.unresolved_fields===0,"missing, pending or unresolved official field receipt");
 need(base?.projection_status==="scratch_final"&&base.factor_basis==="verified_scratch_final"&&proof.race_date===base.race_date&&proof.track===base.track_name,"canonical scratch-final identity");
 need(hash(proof.dashboard_sha256)&&hash(proof.ordered_sha256)&&hash(proof.latest_notice_sha256)&&hash(proof.official_changes_sha256)&&proof.official_changes_sha256===base.model_receipts?.official_changes_sha256,"source and official-change binding");
 const observed=clock(proof.verified_at),notice=clock(proof.latest_notice_received_at);
 need(Number.isFinite(observed)&&Number.isFinite(notice)&&observed>=notice&&observed<=now+60000&&easternDate(observed)===base.race_date,"invalid or stale notice chronology");
 need(verifyCertifiedScratchFinalTrack(base,ordered),"canonical F4 does not match TRI and active field");
 need(Array.isArray(proof.races)&&proof.races.length===base.races.length,"whole-track roster proof incomplete");
 const seen=new Set(),fields=new Map(),scratches=new Map();let oldestOfficial=observed;
 for(const r of base.races){
  const n=r.race_number,e=proof.races.find(x=>x.race_number===n);
  need(e&&!seen.has(n)&&e.race_date===base.race_date&&e.track===base.track_name&&hash(e.source_sha256),"missing race roster proof "+n);seen.add(n);
  const t=clock(e.official_retrieved_at);
  need(typeof e.official_url==="string"&&e.official_url.startsWith("https://")&&hash(e.official_evidence_sha256)&&Number.isFinite(t)&&t>=notice&&t<=observed&&easternDate(t)===base.race_date,"fresh official source required R"+n);
  oldestOfficial=Math.min(oldestOfficial,t);
  const orig=identity(e.original),official=identity(e.official);
  need(equal(orig,official),"all original and official runners must be accounted for R"+n);
  need(e.official.every(x=>["ACTIVE","SCRATCHED","NOT_DRAWN"].includes(x.status)),"unresolved draw-in R"+n);
  const active=identity(e.official.filter(x=>x.status==="ACTIVE")),scr=identity(e.official.filter(x=>x.status==="SCRATCHED"));
  need(equal(active,identity(r.entries,"program_number","horse_name"))&&equal(scr,identity(r.scratches,"program_number","horse_name"))&&r.scratch_count===scr.size,"official roster/scratches differ R"+n);
  const probs=new Map(r.entries.map(x=>[x.program_number,x.win_probability_exact]));
  need([...probs.values()].every(p=>typeof p==="number"&&Number.isFinite(p)&&p>=0&&p<=100)&&Math.abs([...probs.values()].reduce((a,b)=>a+b,0)-100)<1e-6,"invalid canonical probability mass");
  // Coupled wagering interests are allowed only with explicit source-bound evidence.
  const used=new Set();
  for(const g of e.coupled_interests||[]){
   need(typeof g.program==="string"&&Array.isArray(g.members)&&g.members.length>=2&&typeof g.official_url==="string"&&g.official_url.startsWith("https://")&&hash(g.official_evidence_sha256),"unverified coupled interest R"+n);
   need(!used.has(g.program)&&new Set(g.members).size===g.members.length&&g.members.every(p=>active.has(p)&&!used.has(p)&&probs.has(p))&&(!probs.has(g.program)||g.members.includes(g.program)),"invalid coupled interest R"+n);
   const mass=g.members.reduce((a,p)=>a+probs.get(p),0);
   for(const p of g.members){used.add(p);probs.delete(p);}used.add(g.program);probs.set(g.program,mass);
  }
  fields.set(n,probs);scratches.set(n,new Set(scr.keys()));
 }
 return {fields,scratches,verifiedAt:observed,oldestOfficialAt:oldestOfficial};
}
export function verifyPickAgainstFinalField(card,field){
 need(card.status==="scratch_updated","prescratch ticket cannot be customer-published");
 need(Array.isArray(card.sequences)&&card.sequences.length>0,"missing sequences");
 const declared=card.scratches_by_race||{};
 for(const [n,programs] of field.scratches)need(sameSet(programs,new Set(declared[String(n)]||[])),"ticket scratches differ R"+n);
 need(Object.keys(declared).every(n=>field.scratches.has(Number(n))),"unknown ticket scratch race");
 for(const s of card.sequences){
  need(Array.isArray(s.race_fields)&&s.race_fields.length===s.end_race-s.start_race+1&&s.review_probabilities,"complete sequence fields required");
  for(let i=0;i<s.race_fields.length;i++){
   const f=s.race_fields[i],p=field.fields.get(f.race_number),v=s.review_probabilities[String(f.race_number)];
   need(f.race_number===s.start_race+i&&p&&Array.isArray(f.programs)&&f.programs.length===p.size&&sameSet(new Set(f.programs),new Set(p.keys()))&&v&&Object.keys(v).length===p.size&&[...p].every(([k,value])=>typeof v[k]==="number"&&Math.abs(v[k]-value)<1e-7),"ticket field/PWIN differs R"+f.race_number);
  }
  for(const ticket of s.tickets||[])for(const leg of ticket.legs||[])need(field.fields.has(leg.race_number)&&leg.programs.every(p=>field.fields.get(leg.race_number).has(p)),"ticket includes inactive runner");
 }
}
export async function requireFinalPickField(env,card,{publishedAt=null,now=Date.now()}={}){
 if(!requiresFinalPickField(card.date))return;
 need(env?.CARDS_BUCKET,"private field storage unavailable");
 const key=finalFieldReceiptKey(card.date,card.track),baseKey="projections/dashboard/"+card.date+"/"+slug(card.track)+".json",f4Key="projections/f4-ordered/"+card.date+"/"+slug(card.track)+".json";
 const [cert,b,f]=await Promise.all([env.CARDS_BUCKET.get(key),env.CARDS_BUCKET.get(baseKey),env.CARDS_BUCKET.get(f4Key)]);
 need(cert&&b&&f&&cert.customMetadata?.customer_publish_approved==="true","canonical final-field approval missing");
 const [ct,bt,ft]=await Promise.all([cert.text(),b.text(),f.text()]);
 const proof=JSON.parse(ct),base=JSON.parse(bt),ordered=JSON.parse(ft);
 need(base.race_date===card.date&&base.track_name===card.track&&await digest(bt)===proof.dashboard_sha256&&await digest(ft)===proof.ordered_sha256,"canonical source changed since official reconciliation");
 const field=verifyFinalFieldReceipt(proof,base,ordered,now);
 const released=publishedAt===null?now:clock(publishedAt);
 need(Number.isFinite(released)&&released>=field.verifiedAt&&released-field.oldestOfficialAt<=30*60*1000&&released<=now+60000,"official field must be rechecked within 30 minutes before publication");
 verifyPickAgainstFinalField(card,field);
 const again=await env.CARDS_BUCKET.get(key);
 need(again&&again.customMetadata?.customer_publish_approved==="true"&&await again.text()===ct,"official notice changed during gate");
}

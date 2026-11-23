/** Rail & Rye — field-bound V3.3 ticket verification.
 * Every date/track projection-field upload gets a fresh, all-sequence exact
 * TRI optimization and an R2 audit tied to the exact source JSON SHA-256.
 * This is a PRIVATE review artifact. It NEVER constitutes a score receipt,
 * customer release, or automatic approval of jockey/source changes.
 */
import {PICK_MENU_1123,buildV33ScratchFieldPreview,
 buildPrescratchPickTicketReview} from "./pick-tickets-auto.js";
import {PICK_V33_ENGINE} from "./pick-tickets-v33.js";

export const PICK_UPLOAD_AUDIT_PREFIX="pick-tickets/field-audits/";
const slug=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
export const pickUploadAuditKey=card=>PICK_UPLOAD_AUDIT_PREFIX+card.race_date+"/"+slug(card.track_name)+".json";
export const isPickV33Field=card=>!!card&&card.race_date==="2026-11-23"&&
 PICK_MENU_1123.some(s=>s.track===card.track_name);
export async function projectionFieldFingerprint(card){
 const source=JSON.stringify(card);
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(source));
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
const ticketKey=s=>s.name+"|"+s.start_race+"|"+s.end_race;
const identity=t=>JSON.stringify(t.legs.map(l=>[l.race_number,l.programs]));
const same= (a,b)=>JSON.stringify(a)===JSON.stringify(b);
function changedRaces(oldCard,newCard){
 if(!oldCard)return newCard.races.map(r=>r.race_number).sort((a,b)=>a-b);
 const prior=new Map((oldCard.races||[]).map(r=>[r.race_number,r]));
 return newCard.races.filter(r=>!same(prior.get(r.race_number),r))
  .map(r=>r.race_number).sort((a,b)=>a-b);
}
function scoreInputChanged(oldCard,newCard){
 if(!oldCard)return false;
 // A horse-name/program mapping, race condition, scratched interest, jockey,
 // weight/scoring metric, TRI/F4 probability, model identity or provenance
 // change can make existing recommendations stale. Check the FULL normalized
 // input, not just jockey and PWIN. Ignore presentation-only card metadata.
 if(oldCard.projection_status!==newCard.projection_status||
    oldCard.factor_basis!==newCard.factor_basis||
    oldCard.model_name!==newCard.model_name)return true;
 const old=new Map((oldCard.races||[]).map(r=>[r.race_number,r]));
 if(old.size!==newCard.races.length)return true;
 for(const race of newCard.races){
  const was=old.get(race.race_number);
  if(!was)return true;
  if(!same(was,race))return true;
 }
 return false;
}
function auditSequences(review,oldReview){
 const before=new Map((oldReview?.sequences||[]).map(s=>[ticketKey(s),s]));
 return review.sequences.map(s=>{
  const newer=s.tickets[0],earlier=before.get(ticketKey(s))?.tickets?.[0];
  if(s.tickets.length!==1||!newer||!s.review_meta?.selected_leg_coverage?.every(p=>p+1e-12>=.5))
   throw Error("V3.3 full-sequence selection or coverage audit failed.");
  if(newer.combinations!==newer.legs.reduce((p,l)=>p*l.programs.length,1)||
     newer.total_cents!==newer.combinations*newer.unit_cents)
   throw Error("V3.3 cost and combinations do not match.");
  return {name:s.name,start_race:s.start_race,end_race:s.end_race,
   combinations:newer.combinations,cost_cents:newer.total_cents,
   hit_rate:newer.hit_rate_display,
   leg_counts:newer.legs.map(l=>l.programs.length),
   leg_coverage:s.review_meta.selected_leg_coverage,
   previous_ticket:earlier?{
    combinations:earlier.combinations,
    cost_cents:earlier.total_cents,
    hit_rate:earlier.hit_rate_display,
    legs:earlier.legs.map(l=>({race_number:l.race_number,programs:l.programs}))
   }:null,
   selections_changed:!earlier||identity(earlier)!==identity(newer),
   cost_changed:!earlier||earlier.total_cents!==newer.total_cents,
   hit_changed:!earlier||earlier.hit_rate_display!==newer.hit_rate_display};
 });
}
function previewFor(card){
 let result;
 if(card.projection_status==="scratch_final")result=buildV33ScratchFieldPreview({card});
 else if(card.projection_status==="prescratch"){
  const built=buildPrescratchPickTicketReview([{card}]);
  result=built.cards[0]||null;
 }
 if(!result?.card||result.card.optimizer_basis!==PICK_V33_ENGINE)
  throw Error("V3.3 cannot verify every race in this uploaded field; no Pick Tickets accepted.");
 return result.card;
}
export async function auditV33FieldUpload(card,previousCard=null){
 if(!isPickV33Field(card))return null;
 const sourceSha=await projectionFieldFingerprint(card);
 const priorSha=previousCard?await projectionFieldFingerprint(previousCard):null;
 const review=previewFor(card),oldReview=previousCard?(()=>{try{return previewFor(previousCard)}catch{return null}})():null;
 const expected=PICK_MENU_1123.filter(s=>s.track===card.track_name).length;
 if(review.sequences.length!==expected)throw Error("V3.3 did not cover all official sequences on this upload.");
 const sequences=auditSequences(review,oldReview);
 const changed=changedRaces(previousCard,card);
 const inputChanged=scoreInputChanged(previousCard,card);
 const oldReceipts=previousCard?.model_receipts||{};
 const newReceipts=card.model_receipts||{};
 const scoreUpdated=!previousCard||oldReceipts.tri_sha256!==newReceipts.tri_sha256||
  oldReceipts.f4_sha256!==newReceipts.f4_sha256;
 const signedFinal=card.projection_status==="scratch_final"&&
  card.factor_basis==="verified_scratch_final"&&
  !!newReceipts.tri_sha256&&!!newReceipts.f4_sha256&&
  !!newReceipts.official_changes_sha256&&!!newReceipts.prescratch_parent_sha256;
 const sourceInputHold=inputChanged&&!scoreUpdated;
 const newScratches=Number(review.additional_scratch_count||0);
 return {
  schema_version:1,date:card.race_date,track:card.track_name,
  source_sha256:sourceSha,previous_source_sha256:priorSha,
  optimizer:PICK_V33_ENGINE,review_only:true,
  stage:card.projection_status,model_factor_basis:card.factor_basis,
  source_signature_status:sourceInputHold?"INPUT_CHANGED_WITHOUT_NEW_SCORE_RECEIPT":
   !signedFinal?"AWAITING_CERTIFIED_CURRENT_SCORING":
   newScratches>0?"ADDITIONAL_SCRATCH_PROOF_PENDING":"MATH_VERIFIED_RELEASE_GATED",
  score_freshness_verified:!sourceInputHold&&signedFinal&&newScratches===0,
  production_release_approved:false,
  input_changes_require_rescoring:sourceInputHold,
  new_scratch_count:newScratches,
  changed_races:changed,
  source_changed:priorSha!==sourceSha,
  changed_sequence_count:sequences.filter(s=>s.selections_changed||s.cost_changed||s.hit_changed).length,
  sequence_count:sequences.length,sequences,review_card:review
 };
}
export function matchStoredTicketToLatestSource(stored,audit){
 if(!audit||audit.production_release_approved!==true||
    stored.formula_version!==PICK_V33_ENGINE||
    stored.source_input_sha256!==audit.source_sha256||
    !audit.score_freshness_verified||!Array.isArray(stored.sequences)||
    stored.sequences.length!==audit.review_card.sequences.length)return false;
 const reference=new Map(audit.review_card.sequences.map(s=>[ticketKey(s),s]));
 return stored.sequences.every(s=>{
  const r=reference.get(ticketKey(s));
  if(!r||s.tickets.length!==1||r.tickets.length!==1)return false;
  const actual=s.tickets[0],expected=r.tickets[0];
  return identity(actual)===identity(expected)&&
   actual.combinations===expected.combinations&&
   actual.total_cents===expected.total_cents&&
   actual.unit_cents===expected.unit_cents&&
   actual.hit_rate_display===expected.hit_rate_display;
 });
}

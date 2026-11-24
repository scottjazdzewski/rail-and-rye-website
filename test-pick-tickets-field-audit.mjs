import assert from "node:assert/strict";
import {handleAdminProjectionBatchUpload} from "./src/projections.js";
import {handleAdminPickTickets,normalizePickTickets} from "./src/pick-tickets.js";
import {auditV33FieldUpload,pickUploadAuditKey,projectionFieldFingerprint,
 matchStoredTicketToLatestSource} from "./src/pick-tickets-field-audit.js";
import {getNov23ScratchLedger} from "./src/pick-tickets-scratch-1123.js";
import {getPickTicketsIntake} from "./src/pick-tickets-intake.js";
import {PICK_V33_ENGINE} from "./src/pick-tickets-v33.js";
class R2 {
 constructor(){this.objects=new Map()}
 async list({prefix}){return {objects:[...this.objects.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))}}
 async get(key){const x=this.objects.get(key);return x?{
  text:async()=>x.text,json:async()=>JSON.parse(x.text),customMetadata:x.metadata||{}
 }:null}
 async put(key,data,options={}){this.objects.set(key,{text:String(data),metadata:options.customMetadata||{}})}
}
const env={CARDS_BUCKET:new R2()};
const official=getNov23ScratchLedger().tracks.find(x=>x.name==="Finger Lakes");
const original=getPickTicketsIntake().tracks.find(x=>x.name==="Finger Lakes");
assert.equal(original.race_count,8);
assert.equal(original.analysis_runner_count,60);
const f4=p=>({
 exact_p1:p,exact_p2:0,exact_p3:0,exact_p4:0,exact_p5:0,
 p6_plus:1-p,top2:p,top3:p,top4:p
});
function raceEntries(programs,leaderPct=null){
 const n=programs.length;
 const main=leaderPct===null?100/n:leaderPct;
 return programs.map((number,i)=>{
  const pct=leaderPct===null?main:(i===0?main:(100-main)/(n-1));
  return {program_number:String(number),horse_name:"QA "+number,
   win_probability:pct,win_probability_exact:pct,
   jockey:"Synthetic Jockey",trainer:"Synthetic Trainer",
   f4_probabilities:f4(pct/100)};
 });
}
function fullTrack(stage="prescratch"){
 const count=original.race_count;
 const runners=stage==="prescratch"?original.analysis_runner_count:
  original.analysis_runner_count-official.scratch_count;
 const base=Math.floor(runners/count),extra=runners%count;
 return {schema_version:1,race_date:"2026-11-23",track_name:"Finger Lakes",
  projection_status:stage,factor_basis:"verified_prescratch",
  ...(stage==="scratch_final"?{model_receipts:{
   tri_sha256:"a".repeat(64),f4_sha256:"b".repeat(64),
   prescratch_parent_sha256:"c".repeat(64),
   official_changes_sha256:"d".repeat(64)}}:{}),
  races:Array.from({length:count},(_,i)=>{
   const race=i+1,raw=official.scratches[String(race)]||[];
   const programs=Array.from({length:30},(_,j)=>String(j+1))
    .filter(p=>stage==="prescratch"||!raw.includes(p))
    .slice(0,base+(i<extra?1:0));
   return {race_number:race,purse:"$10,000", // synthetic QA fixture, never published
    scratch_count:stage==="prescratch"?null:raw.length,
    scratches:stage==="prescratch"?[]:raw.map(p=>({program_number:p,horse_name:"QA Scratched "+p})),
    entries:raceEntries(programs)};
  })};
}
const pre=fullTrack();
let response=await handleAdminProjectionBatchUpload(new Request(
 "https://railandryeracing.com/api/admin/projections/batch",{
 method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({cards:[pre]})}),env);
assert.equal(response.status,200,"initial official pre-field upload");
let data=await response.json();
assert.equal(data.uploaded[0].ticket_verification.sequences_checked,7);
assert.equal(data.uploaded[0].ticket_verification.changed_races.length,8);
const sourceKey="projections/dashboard/2026-11-23/finger-lakes.json";
const saved=JSON.parse(await (await env.CARDS_BUCKET.get(sourceKey)).text());
const auditKey=pickUploadAuditKey(saved);
const preAudit=JSON.parse(await (await env.CARDS_BUCKET.get(auditKey)).text());
assert.equal(preAudit.optimizer,PICK_V33_ENGINE);
assert.equal(preAudit.sequence_count,7);
assert.equal(preAudit.source_sha256,await projectionFieldFingerprint(saved));
assert.equal(preAudit.changed_sequence_count,7);
response=await handleAdminPickTickets(new Request(
 "https://railandryeracing.com/api/admin/pick-tickets"),env);
let shown=await response.json();
assert.equal(shown.cards.length,1);
assert.equal(shown.cards[0].card.source_input_sha256,preAudit.source_sha256);
assert.equal(shown.cards[0].card.sequences.length,7);
assert.ok(shown.cards[0].card.sequences.every(s=>s.tickets.length===1));
assert.ok(shown.cards[0].card.sequences.every(s=>s.review_meta.selected_leg_coverage.every(x=>x>=.5-1e-12)));
assert.equal(shown.latest_field_versions[0].sha256,preAudit.source_sha256);
const initial=structuredClone(shown.cards[0].card);
const first=initial.sequences[0].tickets[0];

const revised=fullTrack();
revised.races[0].entries=raceEntries(revised.races[0].entries.map(x=>x.program_number),70);
response=await handleAdminProjectionBatchUpload(new Request(
 "https://railandryeracing.com/api/admin/projections/batch",{
 method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({cards:[revised]})}),env);
assert.equal(response.status,200,"new verified field triggers entire ticket rebuild");
data=await response.json();
assert.deepEqual(data.uploaded[0].ticket_verification.changed_races,[1]);
assert.ok(data.uploaded[0].ticket_verification.changed_sequences>=1);
const currentCard=JSON.parse(await (await env.CARDS_BUCKET.get(sourceKey)).text());
const currentAudit=JSON.parse(await (await env.CARDS_BUCKET.get(auditKey)).text());
assert.notEqual(currentAudit.source_sha256,preAudit.source_sha256);
assert.equal(currentAudit.previous_source_sha256,preAudit.source_sha256);
assert.equal(currentAudit.sequence_count,7);
assert.equal(currentAudit.source_signature_status,"INPUT_CHANGED_WITHOUT_NEW_SCORE_RECEIPT");
assert.equal(currentAudit.production_release_approved,false);
assert.ok(currentAudit.sequences.some(x=>x.selections_changed));
assert.ok(currentAudit.sequences.some(x=>x.previous_ticket));
response=await handleAdminPickTickets(new Request(
 "https://railandryeracing.com/api/admin/pick-tickets"),env);
shown=await response.json();
// The newly optimized field does NOT carry a new scorer receipt. Mathematics
// alone cannot authorize choices built from possibly stale TRI/F4 factors.
assert.equal(shown.cards.length,0,"never show unrescored changes as ticket choices");
assert.equal(shown.latest_field_versions[0].sha256,currentAudit.source_sha256);
assert.equal(shown.latest_field_versions[0].review_status,"INPUT_CHANGED_WITHOUT_NEW_SCORE_RECEIPT");
assert.ok(shown.source_rejections.some(x=>x.reason.includes("new TRI/F4 scoring receipts")));

// A fresh prescratch TRI/F4 receipt pair is retained by the importer and
// clears the input-change hold, exposing the independently reoptimized field.
const rescored=structuredClone(revised);
rescored.model_receipts={tri_sha256:"a".repeat(64),f4_sha256:"b".repeat(64)};
response=await handleAdminProjectionBatchUpload(new Request(
 "https://railandryeracing.com/api/admin/projections/batch",{
 method:"POST",headers:{"content-type":"application/json"},
 body:JSON.stringify({cards:[rescored]})}),env);
assert.equal(response.status,200,"fresh prescratch score identifiers must be accepted");
const refreshed=JSON.parse(await (await env.CARDS_BUCKET.get(sourceKey)).text());
assert.deepEqual(refreshed.model_receipts,rescored.model_receipts,
 "prescratch scorer receipts must not be silently discarded");
const refreshedAudit=JSON.parse(await (await env.CARDS_BUCKET.get(auditKey)).text());
assert.equal(refreshedAudit.input_changes_require_rescoring,false);
assert.equal(refreshedAudit.source_sha256,await projectionFieldFingerprint(refreshed));
response=await handleAdminPickTickets(new Request(
 "https://railandryeracing.com/api/admin/pick-tickets"),env);
shown=await response.json();
assert.equal(shown.cards.length,1,"fresh score upload unlocks the current private ticket review");
assert.equal(shown.cards[0].card.source_input_sha256,refreshedAudit.source_sha256);
assert.ok(shown.cards[0].card.sequences.some(x=>x.tickets[0]));
const after=shown.cards[0].card.sequences[0].tickets[0];
assert.notDeepEqual(after.legs,first.legs,"updated field must change dependent selections");

// Horse identity is part of the scored field, not just PWIN: changing a name
// while keeping the same number, factors and score receipt must HOLD picks.
const renamed=structuredClone(refreshed);
renamed.races[0].entries[0].horse_name="Different Entry Name";
const renameAudit=await auditV33FieldUpload(renamed,refreshed);
assert.equal(renameAudit.source_signature_status,"INPUT_CHANGED_WITHOUT_NEW_SCORE_RECEIPT");
assert.equal(renameAudit.input_changes_require_rescoring,true);
const partialReceipt=structuredClone(rescored);
delete partialReceipt.model_receipts.f4_sha256;
const partial=await handleAdminProjectionBatchUpload(new Request(
 "https://railandryeracing.com/api/admin/projections/batch",{
 method:"POST",headers:{"content-type":"application/json"},
 body:JSON.stringify({cards:[partialReceipt]})}),env);
assert.equal(partial.status,400,"partial TRI/F4 receipt pairs are never accepted");
// An old certified-looking edition must never override the current source.
const oldEdition={
 schema_version:1,product_type:"pick_tickets",date:initial.date,track:initial.track,
 revision:2,status:"scratch_updated",formula_version:PICK_V33_ENGINE,
 source_input_sha256:preAudit.source_sha256,
 source_receipt:{reference:"QA-FROZEN-RECEIPT",sha256:"a".repeat(64)},
 scratch_verified_at:"2026-11-23T20:00:00Z",
 sequences:initial.sequences.map(s=>({
  name:s.name,start_race:s.start_race,end_race:s.end_race,
  play_status:s.play_status,hit_rate_display:s.hit_rate_display,
  tickets:s.tickets, race_fields:s.race_fields
 }))
};
const normalized=normalizePickTickets(oldEdition);
await env.CARDS_BUCKET.put("pick-tickets/dashboard/2026-11-23/finger-lakes.json",JSON.stringify(normalized));
response=await handleAdminPickTickets(new Request(
 "https://railandryeracing.com/api/admin/pick-tickets"),env);
shown=await response.json();
assert.equal(shown.cards.length,1,"no stale second card");
assert.equal(shown.cards[0].card.source_input_sha256,refreshedAudit.source_sha256);
assert.equal(shown.stale_revisions.length,1,"stale stored edition detected");
assert.equal(matchStoredTicketToLatestSource(normalized,currentAudit),false);

const invalid=fullTrack();
invalid.races[0].entries[0].win_probability_exact=95;
const blocked=await handleAdminProjectionBatchUpload(new Request(
 "https://railandryeracing.com/api/admin/projections/batch",{
 method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({cards:[invalid]})}),env);
assert.notEqual(blocked.status,200,"incomplete source must not displace current tickets");
assert.equal(await projectionFieldFingerprint(JSON.parse(await (await env.CARDS_BUCKET.get(sourceKey)).text())),
 refreshedAudit.source_sha256,"bad upload leaves published source unchanged");

// A subsequent official scratched runner changes the source and must be
// represented by a new field and new model scores; baseline alone is not enough.
const post=fullTrack("scratch_final");
const baseline=await auditV33FieldUpload(post);
assert.equal(baseline.sequence_count,7);
assert.equal(baseline.new_scratch_count,0);
assert.equal(baseline.source_signature_status,"AWAITING_CERTIFIED_CURRENT_SCORING");
assert.equal(baseline.scratch_scoring_ready,false);
assert.equal(baseline.requires_external_tri_rescoring,true);
assert.equal(baseline.score_freshness_verified,false);
// Even a complete 100%-normalized post-scratch field CANNOT represent a TRI
// rerun when its underlying factor basis is still verified_prescratch.
await env.CARDS_BUCKET.put(sourceKey,JSON.stringify(post),{customMetadata:{}});
const scratchReview=await handleAdminPickTickets(new Request(
 "https://railandryeracing.com/api/admin/pick-tickets"),env);
const scratchView=await scratchReview.json();
assert.equal(scratchView.cards.length,0,"unrescored scratches MUST NOT display newly calculated picks");
assert.equal(scratchView.latest_field_versions[0].review_status,
 "AWAITING_CERTIFIED_CURRENT_SCORING");
assert.ok(scratchView.source_rejections.some(x=>
 x.reason.includes("Scratch-adjusted runner lists are not a TRI rerun")));
// The mathematical optimizer still recomputes all 7 official sequences
// internally; it cannot self-certify its input PWIN and F4 as fresh TRI.
assert.equal(scratchView.latest_field_versions[0].sequence_count,7);
// A genuine certified current scorer must provide post-scratch provenance,
// a fresh TRI hash, a fresh F4 hash, parent, and official changes hashes.
const certified=structuredClone(post);
certified.factor_basis="verified_scratch_final";
const certifiedAudit=await auditV33FieldUpload(certified);
assert.equal(certifiedAudit.scratch_scoring_ready,true);
assert.equal(certifiedAudit.score_freshness_verified,true);
assert.equal(certifiedAudit.sequence_count,7);
const partlyUpdated=structuredClone(certified);
partlyUpdated.races[0].entries=raceEntries(
 partlyUpdated.races[0].entries.map(x=>x.program_number),60);
partlyUpdated.model_receipts.tri_sha256="e".repeat(64); // F4 unchanged!
const partlyAudit=await auditV33FieldUpload(partlyUpdated,certified);
assert.equal(partlyAudit.input_changes_require_rescoring,true,
 "TRI-alone or F4-alone receipt changes are not a full score rerun");
assert.equal(partlyAudit.scratch_scoring_ready,false);
const fullyUpdated=structuredClone(partlyUpdated);
fullyUpdated.model_receipts.f4_sha256="f".repeat(64);
const fullyAudit=await auditV33FieldUpload(fullyUpdated,certified);
assert.equal(fullyAudit.input_changes_require_rescoring,false);
assert.equal(fullyAudit.scratch_scoring_ready,true);
const more=structuredClone(post);
const scratchRace=more.races[0];
const newly=scratchRace.entries.pop().program_number;
scratchRace.scratches.push({program_number:newly,horse_name:"QA Extra Scratch"});
scratchRace.scratch_count+=1;
scratchRace.entries=raceEntries(scratchRace.entries.map(x=>x.program_number));
const extra=await auditV33FieldUpload(more,post);
assert.equal(extra.new_scratch_count,1);
assert.equal(extra.source_signature_status,"INPUT_CHANGED_WITHOUT_NEW_SCORE_RECEIPT");
assert.equal(extra.score_freshness_verified,false);
const missing=structuredClone(more);
missing.races[0].scratches.pop();
await assert.rejects(()=>auditV33FieldUpload(missing,post),/cannot verify every race/);
// The November 24 track uses its separately verified 7-sequence wager menu.
// It must NOT inherit the November 23 date or fabricate a customer release.
 // Unknown future dates still require a separately sourced official wager menu.
const nextDay=fullTrack();
nextDay.race_date="2026-11-24";
const nextResponse=await handleAdminProjectionBatchUpload(new Request(
 "https://railandryeracing.com/api/admin/projections/batch",{
 method:"POST",headers:{"content-type":"application/json"},
 body:JSON.stringify({cards:[nextDay]})}),env);
assert.equal(nextResponse.status,200);
const nextResult=await nextResponse.json();
assert.equal(nextResult.uploaded[0].ticket_verification.status,
 "AWAITING_CERTIFIED_CURRENT_SCORING");
assert.equal(nextResult.uploaded[0].ticket_verification.sequences_checked,7);
const newSource=JSON.parse(await (await env.CARDS_BUCKET.get(
 "projections/dashboard/2026-11-24/finger-lakes.json")).text());
const newAudit=JSON.parse(await (await env.CARDS_BUCKET.get(
 pickUploadAuditKey(newSource))).text());
assert.equal(newAudit.date,"2026-11-24");
assert.equal(newAudit.review_card.date,"2026-11-24");
assert.equal(newAudit.sequence_count,7);
assert.equal(newAudit.production_release_approved,false);
assert.equal(newAudit.v34_review_card,undefined,"no V3.4 without scorer receipts");
const currentRoute="https://railandryeracing.com/api/admin/pick-tickets";
const missingPairView=await (await handleAdminPickTickets(new Request(currentRoute),env)).json();
assert.equal(missingPairView.cards.some(x=>x.card.date==="2026-11-24"),false,"no fallback to V3.3 for current scoreless fields");
const scoredNext=structuredClone(nextDay);
scoredNext.model_receipts={tri_sha256:"a".repeat(64),f4_sha256:"b".repeat(64)};
const scoredResponse=await handleAdminProjectionBatchUpload(new Request(
 "https://railandryeracing.com/api/admin/projections/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({cards:[scoredNext]})}),env);
assert.equal(scoredResponse.status,200);
const scoredSource=JSON.parse(await (await env.CARDS_BUCKET.get("projections/dashboard/2026-11-24/finger-lakes.json")).text());
const lockedAudit=JSON.parse(await (await env.CARDS_BUCKET.get(pickUploadAuditKey(scoredSource))).text());
assert.equal(lockedAudit.active_optimizer,"V3.4-TRI-ONLY-LENGTH-SENSITIVE-TRIAL-A");
assert.equal(lockedAudit.v34_review_card.sequences.length,7);
const currentView=await (await handleAdminPickTickets(new Request(currentRoute),env)).json();
const activeNext=currentView.cards.find(x=>x.card.date==="2026-11-24");
assert.equal(activeNext.card.formula_version,lockedAudit.active_optimizer);
assert.deepEqual(activeNext.card.sequences.map(s=>s.tickets),lockedAudit.v34_review_card.sequences.map(s=>s.tickets));
const baselineView=await (await handleAdminPickTickets(new Request(currentRoute+"?trial=v33"),env)).json();
assert.equal(baselineView.cards.find(x=>x.card.date==="2026-11-24").card.formula_version,PICK_V33_ENGINE);
const changedNext=structuredClone(scoredSource);
changedNext.races[0].entries[0].horse_name="QA Changed Horse";
const heldAudit=await auditV33FieldUpload(changedNext,scoredSource);
assert.equal(heldAudit.input_changes_require_rescoring,true);
assert.equal(heldAudit.v34_review_card,undefined,"no V3.4 with stale receipt pair");

const unknown=fullTrack();unknown.race_date="2026-11-25";
const unknownResponse=await handleAdminProjectionBatchUpload(new Request(
 "https://railandryeracing.com/api/admin/projections/batch",{
 method:"POST",headers:{"content-type":"application/json"},
 body:JSON.stringify({cards:[unknown]})}),env);
assert.equal(unknownResponse.status,200);
const unknownResult=await unknownResponse.json();
assert.equal(unknownResult.uploaded[0].ticket_verification.status,
 "NO_VERIFIED_OFFICIAL_PICK_MENU_FOR_DATE_TRACK");
assert.equal(unknownResult.uploaded[0].ticket_verification.sequences_checked,0);
console.log("PASS: every latest field upload reoptimizes full-field V3.3 tickets; source hashes, new scratches, prior-choice comparison and stale edition failsafes.");

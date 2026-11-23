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
   return {race_number:race,
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
assert.equal(shown.cards.length,1);
assert.equal(shown.cards[0].card.source_input_sha256,currentAudit.source_sha256);
assert.equal(shown.latest_field_versions[0].sha256,currentAudit.source_sha256);
assert.ok(shown.cards[0].card.sequences.some(s=>s.upload_change?.selections_changed));
const after=shown.cards[0].card.sequences[0].tickets[0];
assert.notDeepEqual(after.legs,first.legs,"updated field must change dependent selections");
assert.ok(shown.cards[0].card.sequences[0].upload_change.previous_ticket);
assert.equal(shown.cards[0].card.sequences[0].upload_change.previous_ticket.combinations,first.combinations);

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
assert.equal(shown.cards[0].card.source_input_sha256,currentAudit.source_sha256);
assert.equal(shown.stale_revisions.length,1,"stale stored edition detected");
assert.equal(matchStoredTicketToLatestSource(normalized,currentAudit),false);

const invalid=fullTrack();
invalid.races[0].entries[0].win_probability_exact=95;
const blocked=await handleAdminProjectionBatchUpload(new Request(
 "https://railandryeracing.com/api/admin/projections/batch",{
 method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({cards:[invalid]})}),env);
assert.notEqual(blocked.status,200,"incomplete source must not displace current tickets");
assert.equal(await projectionFieldFingerprint(JSON.parse(await (await env.CARDS_BUCKET.get(sourceKey)).text())),
 currentAudit.source_sha256,"bad upload leaves published source unchanged");

// A subsequent official scratched runner changes the source and must be
// represented by a new field and new model scores; baseline alone is not enough.
const post=fullTrack("scratch_final");
const baseline=await auditV33FieldUpload(post);
assert.equal(baseline.sequence_count,7);
assert.equal(baseline.new_scratch_count,0);
const more=structuredClone(post);
const scratchRace=more.races[0];
const newly=scratchRace.entries.pop().program_number;
scratchRace.scratches.push({program_number:newly,horse_name:"QA Extra Scratch"});
scratchRace.scratch_count+=1;
const extra=await auditV33FieldUpload(more,post);
assert.equal(extra.new_scratch_count,1);
assert.equal(extra.source_signature_status,"INPUT_CHANGED_WITHOUT_NEW_SCORE_RECEIPT");
assert.equal(extra.score_freshness_verified,false);
const missing=structuredClone(more);
missing.races[0].scratches.pop();
await assert.rejects(()=>auditV33FieldUpload(missing,post),/cannot verify every race/);
console.log("PASS: every latest field upload reoptimizes full-field V3.3 tickets; source hashes, new scratches, prior-choice comparison and stale edition failsafes.");

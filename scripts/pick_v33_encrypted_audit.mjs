// One-off source audit. Never commit source scores or emit ticket rows to stdout
// except for the JSON consumed by the encrypting parent process.
import fs from "node:fs";
import crypto from "node:crypto";
import {buildV33ScratchFieldPreview,verifyV32OwnerScratchSnapshot,PICK_MENU_1123}
 from "../src/pick-tickets-auto.js";
import {chooseV33,PICK_V33_ENGINE} from "../src/pick-tickets-v33.js";
import {sourceIsScratchCurrent} from "../src/pick-tickets-scratch-1123.js";
import {auditV33FieldUpload} from "../src/pick-tickets-field-audit.js";
const input=JSON.parse(fs.readFileSync(0,"utf8"));
const date="2026-11-23";
const output={date,engine:PICK_V33_ENGINE,source_rows:[],tracks:[],authorized_editions:[],overall:{}};
const key=c=>c.track_name||c.track;
const toHash=o=>crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
for(const raw of input.sources||[]){
 const card=raw.card;
 const track=key(card);
 if(card.race_date!==date)continue;
 const row={track,source_sha256:toHash(card),
  projection_status:card.projection_status,
  factor_basis:card.factor_basis||null,
  race_count:Array.isArray(card.races)?card.races.length:0,
  runner_count:Array.isArray(card.races)?card.races.reduce((n,x)=>n+(x.entries?.length||0),0):0,
  scorer_receipt_presence:{
   tri:Boolean(card.model_receipts?.tri_sha256),
   f4:Boolean(card.model_receipts?.f4_sha256)
  }};
 row.declared_scratch_count=Array.isArray(card.races)?
  card.races.reduce((n,r)=>n+(Array.isArray(r.scratches)?r.scratches.length:0),0):0;
 output.source_rows.push(row);
 let evidence={};
 try{
  // Cross-check the actual dashboard's new every-upload source verifier.
  const fieldAudit=await auditV33FieldUpload(card);
  row.upload_field_gate={ok:fieldAudit?.sequence_count===
   PICK_MENU_1123.filter(x=>x.track===track).length,
   status:fieldAudit?.source_signature_status||null};
  evidence=verifyV32OwnerScratchSnapshot(card);
  row.scratch_ledger_check=evidence;
  if(!evidence.ok){row.status="SCRATCH_RECONCILIATION_REJECTED";continue;}
  const preview=buildV33ScratchFieldPreview(raw);
  if(!preview){row.status="SOURCE_MATH_REJECTED";continue;}
  row.status="PRIVATE_V33_MATH_PREVIEW";
  row.sequence_count=preview.card.sequences.length;
  const sequences=[];
  for(const seq of preview.card.sequences){
   const t=seq.tickets[0];
   const legs=Array.from({length:seq.end_race-seq.start_race+1},(_,i)=>{
    const number=seq.start_race+i;
    const field=card.races.find(x=>x.race_number===number);
    return {race_number:number,
     entries:field.entries.map(x=>({
      program_number:String(x.program_number),
      pwin:Number(x.win_probability_exact)/100,
      f4_p1:Number(x.f4_probabilities?.exact_p1)
     }))
    };
   });
   const sourceResult=chooseV33(legs,t.unit_cents);
   const ticketCounts=t.legs.map(x=>x.programs.length);
   const checks={
    combos:sourceResult.combinations===t.combinations&&ticketCounts.reduce((p,n)=>p*n,1)===t.combinations,
    dollars:sourceResult.total_cents===t.total_cents&&t.combinations*t.unit_cents===t.total_cents,
    win_probability:Math.abs(sourceResult.hit_probability*100-Number.parseFloat(t.hit_rate_display))<=.05000001,
    selections:JSON.stringify(sourceResult.picks)===JSON.stringify(t.legs.map(x=>x.programs)),
    leg_coverage:sourceResult.leg_coverage.every(x=>x+1e-12>=.5)
   };
   sequences.push({
    name:seq.name,start_race:seq.start_race,end_race:seq.end_race,
    wager_type:seq.end_race-seq.start_race+1,
    base_cents:t.unit_cents,combinations:t.combinations,cost_cents:t.total_cents,
    displayed_hit_rate:t.hit_rate_display,exact_hit_probability:sourceResult.hit_probability,
    score:Math.log(sourceResult.hit_probability)-(sourceResult.total_cents/100)/30,
    leg_counts:ticketCounts,leg_coverage:sourceResult.leg_coverage,
    runner_numbers:t.legs.map(x=>x.programs),
    complete_leg_fields:legs,
    marginal_opportunity_cost:sourceResult.marginal_opportunity_cost,
    internal_checks:checks
   });
  }
  output.tracks.push({track,source_sha256:row.source_sha256,
   stage:row.projection_status,factor_basis:row.factor_basis,
   active_runners:row.runner_count,
   sequences});
 }catch(err){row.status="ERROR";row.error=String(err.message||err).slice(0,180);}
}
for(const raw of input.stored||[]){
 const c=raw.card;
 if(c?.date!==date)continue;
 let matches=false;
 try{matches=c.formula_version===PICK_V33_ENGINE&&sourceIsScratchCurrent(c);}
 catch{}
 output.authorized_editions.push({track:c.track,
  formula_version:c.formula_version||null,
  status:c.status,revision:c.revision,
  source_receipt_sha256:c.source_receipt?.sha256||null,
  authorized_current:matches,
  sequences:matches?(c.sequences||[]).map(s=>({
   name:s.name,start_race:s.start_race,end_race:s.end_race,
   combinations:s.tickets?.[0]?.combinations,
   cost_cents:s.tickets?.[0]?.total_cents,
   programs:s.tickets?.[0]?.legs?.map(l=>l.programs),
   shown_hit_rate:s.tickets?.[0]?.hit_rate_display
  })):undefined
 });
}
const expected=new Map(PICK_MENU_1123.map(x=>[x.track+"|"+x.start_race+"-"+x.end_race+"|"+x.name,x]));
const checked=output.tracks.flatMap(x=>x.sequences.map(s=>x.track+"|"+s.start_race+"-"+s.end_race+"|"+s.name));
output.overall={
 source_tracks:output.source_rows.length,
 eligible_tracks:output.tracks.length,
 upload_field_gate_pass:output.source_rows.filter(r=>r.upload_field_gate?.ok).length,
 upload_field_gate_failed:output.source_rows.filter(r=>!r.upload_field_gate?.ok)
   .map(r=>({track:r.track,reason:r.error||r.status})),
 source_runner_total:output.source_rows.reduce((n,x)=>n+x.runner_count,0),
 audited_sequences:checked.length,
 expected_sequences:expected.size,
 missing_sequences:[...expected.keys()].filter(k=>!checked.includes(k)),
 extra_sequences:checked.filter(k=>!expected.has(k)),
 math_discrepancies:output.tracks.flatMap(x=>x.sequences.filter(s=>Object.values(s.internal_checks).some(v=>!v))
  .map(s=>x.track+" "+s.name+" R"+s.start_race+"-"+s.end_race)),
 stored_authorized:output.authorized_editions.filter(x=>x.authorized_current).length
};
process.stdout.write(JSON.stringify(output));

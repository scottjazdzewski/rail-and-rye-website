import fs from 'node:fs';
import {review as protect} from './pick_rp_protection_1127.mjs';
import {normalizeV32Legs} from '../src/pick-tickets-v32.js';import assert from 'node:assert/strict';
import {chooseV34} from '../src/pick-tickets-v34.js';
import {sequenceQuality} from '../src/pick-tickets-sqr.js';
import {approvedPrivateAdditions,validateLockedSelection} from '../src/pick-tickets-output-validation.js';
import {normalizePickTickets,requireCustomerPickPwin} from '../src/pick-tickets.js';
import {verifyCertifiedScratchFinalTrack} from '../src/f4-exotics.js';
import {requireProductionPurses,requireProductionStakesNames} from '../src/projection-race-information.js';
const {row,canonical,source_archive_sha256}=JSON.parse(fs.readFileSync('/tmp/rr-pick-rp-r2-in.json','utf8'));
const c=structuredClone(row.card);const classes={PLAY:0,CONDITIONAL:0,PASS:0};assert.equal(approvedPrivateAdditions(row,source_archive_sha256).size,0);
let max=0;
if(canonical){
 const {projection,model}=canonical;assert.ok(verifyCertifiedScratchFinalTrack(projection,model));requireProductionPurses(projection);requireProductionStakesNames(projection);
 const fields=new Map(projection.races.map(r=>[r.race_number,Object.fromEntries(r.entries.map(e=>[String(e.program_number),e.win_probability_exact]))]));
 c.source_input_sha256=canonical.dashboard_sha256;c.model_receipts=projection.model_receipts;c.source_receipt={reference:'NOV27-VERIFIED-CANONICAL-SCRATCH-FINAL',sha256:projection.model_receipts.f4_sha256};
 for(const s of c.sequences){
  const t=s.tickets[0];const legs=s.race_fields.map(f=>({race_number:f.race_number,entries:Object.entries(fields.get(f.race_number)).map(([program_number,p])=>({program_number,pwin:p/100}))}));
  for(const l of legs)for(const e of l.entries)max=Math.max(max,Math.abs(s.review_probabilities[String(l.race_number)][e.program_number]-100*e.pwin));
  const x=chooseV34(legs,t.unit_cents),q=sequenceQuality(legs,x);
  s.race_fields=legs.map(l=>({race_number:l.race_number,programs:l.entries.map(e=>e.program_number)}));s.review_probabilities=Object.fromEntries(legs.map(l=>[String(l.race_number),fields.get(l.race_number)]));
  t.legs=x.picks.map((programs,i)=>({race_number:legs[i].race_number,programs}));t.combinations=x.combinations;t.total_cents=x.total_cents;t.hit_rate_display=s.hit_rate_display=(100*x.hit_probability).toFixed(1)+'%';s.play_status=q.classification;
 }
}
for(const s of c.sequences){const legs=s.race_fields.map(f=>({race_number:f.race_number,entries:f.programs.map(program_number=>({program_number,pwin:s.review_probabilities[String(f.race_number)][program_number]/100}))}));validateLockedSelection(legs,s,undefined);classes[s.play_status]++;}
const protection=[];
for(const s of c.sequences){
 const t=s.tickets[0],legs=normalizeV32Legs(s.race_fields.map(f=>({race_number:f.race_number,entries:f.programs.map(program_number=>({program_number,pwin:s.review_probabilities[String(f.race_number)][program_number]/100}))})));
 const r=protect(legs,t);
 if(r.targets.length){assert.ok(!r.approved&&!r.cheaperNeedsMinimum,'Qualifying reconstruction requires review before release');protection.push({name:s.name,start:s.start_race,end:s.end_race,...r});}
}
fs.writeFileSync('/tmp/rr-pick-rp-r2-protection.json',JSON.stringify({reviewed:c.sequences.length,flagged:protection.length,approved:0,alternatives:protection}));
console.log('PICK_RP_PROTECTION_PASS',c.sequences.length,protection.length,'approved 0');
const final=requireCustomerPickPwin(normalizePickTickets(c));assert.equal(final.sequences.length,c.sequences.length);fs.writeFileSync('/tmp/rr-pick-rp-r2-out.json',JSON.stringify(final));console.log('PICK_RP_R2_CONSTRUCTION_PASS',c.track,JSON.stringify({runners:row.runners,sequences:c.sequences.length,classes,independent_to_canonical_max_pp:max}));

import fs from 'node:fs';import assert from 'node:assert/strict';
import {chooseV34} from '../src/pick-tickets-v34.js';
import {sequenceQuality} from '../src/pick-tickets-sqr.js';
import {approvedPrivateAdditions,validateLockedSelection} from '../src/pick-tickets-output-validation.js';
import {normalizePickTickets,requireCustomerPickPwin} from '../src/pick-tickets.js';
import {verifyCertifiedScratchFinalTrack} from '../src/f4-exotics.js';
import {requireProductionPurses,requireProductionStakesNames} from '../src/projection-race-information.js';
const {row,projection,model,audit,scratches}=JSON.parse(fs.readFileSync('/tmp/rr-pick-1127-scratch-input.json','utf8'));
assert.ok(verifyCertifiedScratchFinalTrack(projection,model));requireProductionPurses(projection);requireProductionStakesNames(projection);
const c=structuredClone(row.card),classes={PLAY:0,CONDITIONAL:0,PASS:0};
c.revision=2;c.status='scratch_updated';c.scratch_verified_at=audit.official_snapshot_utc;c.scratches_by_race=scratches;c.source_input_sha256=audit.canonical_dashboard_sha256;c.model_receipts=projection.model_receipts;c.source_receipt={reference:'NOV27-VERIFIED-CANONICAL-SCRATCH-FINAL',sha256:projection.model_receipts.f4_sha256};
assert.equal(approvedPrivateAdditions({card:c},audit.source_archive_sha256).size,0);
const fields=new Map();
for(const r of projection.races){
 const v=new Map(r.entries.map(e=>[String(e.program_number),e.win_probability_exact]));
 for(const g of row.coupled_interests?.[String(r.race_number)]||[]){
  const members=g.members.map(m=>m.program).filter(k=>v.has(k));if(!members.length)continue;
  assert.ok(typeof g.source_evidence==='string'&&g.source_evidence.length>10);
  const total=members.reduce((a,k)=>a+v.get(k),0);for(const k of members)v.delete(k);v.set(g.program,total);
 }
 for(const k of v.keys())assert.ok(!/[A-Z]$/.test(k)||!v.has(k.replace(/[A-Z]$/,'')),'Unverified coupled wagering interest');
 assert.ok(Math.abs([...v.values()].reduce((a,b)=>a+b,0)-100)<1e-6);fields.set(r.race_number,Object.fromEntries(v));
}
let picks=0,costs=0,hits=0;
for(const s of c.sequences){
 const t=s.tickets[0],old=JSON.stringify(t.legs),oc=t.total_cents,oh=s.hit_rate_display;
 const legs=s.race_fields.map(f=>({race_number:f.race_number,entries:Object.entries(fields.get(f.race_number)).map(([program_number,p])=>({program_number,pwin:p/100}))}));
 const x=chooseV34(legs,t.unit_cents),quality=sequenceQuality(legs,x);
 s.race_fields=legs.map(l=>({race_number:l.race_number,programs:l.entries.map(e=>e.program_number)}));
 s.review_probabilities=Object.fromEntries(legs.map(l=>[String(l.race_number),fields.get(l.race_number)]));
 t.legs=x.picks.map((programs,i)=>({race_number:legs[i].race_number,programs}));t.combinations=x.combinations;t.total_cents=x.total_cents;t.hit_rate_display=s.hit_rate_display=(100*x.hit_probability).toFixed(1)+'%';s.play_status=quality.classification;
 validateLockedSelection(legs,s,undefined);classes[s.play_status]++;picks+=+(old!==JSON.stringify(t.legs));costs+=+(oc!==t.total_cents);hits+=+(oh!==s.hit_rate_display);
}
const final=requireCustomerPickPwin(normalizePickTickets(c));
assert.equal(final.sequences.length,audit.sequences);
for(const s of final.sequences)for(const f of s.race_fields)for(const k of f.programs)assert.equal(s.review_probabilities[String(f.race_number)][k],fields.get(f.race_number)[k]);
fs.writeFileSync('/tmp/rr-pick-1127-scratch-output.json',JSON.stringify(final));
console.log('PICK_1127_CANONICAL_CONSTRUCTION_PASS',audit.track,JSON.stringify({runners:audit.runners,sequences:audit.sequences,classes,picks,costs,hits}));

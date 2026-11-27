import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chooseV34} from '../src/pick-tickets-v34.js';
import {sequenceQuality} from '../src/pick-tickets-sqr.js';
import {approvedPrivateAdditions,validateLockedSelection} from '../src/pick-tickets-output-validation.js';
import {normalizePickTickets,requireCustomerPickPwin} from '../src/pick-tickets.js';
import {verifyCertifiedScratchFinalTrack} from '../src/f4-exotics.js';
import {requireProductionPurses,requireProductionStakesNames} from '../src/projection-race-information.js';
const {batch,projection,model,canonical}=JSON.parse(fs.readFileSync('/tmp/rr-pick-1126-cd-r3-canonical.json','utf8'));
assert.ok(verifyCertifiedScratchFinalTrack(projection,model));
requireProductionPurses(projection);requireProductionStakesNames(projection);
const row=batch.tracks[0],c=row.card,classes={PLAY:0,CONDITIONAL:0,PASS:0};
assert.equal(approvedPrivateAdditions(row,batch.source_archive_sha256).size,0);
c.source_input_sha256=canonical.sha256;c.model_receipts=projection.model_receipts;c.source_receipt={reference:'APPROVED-SCRATCH04-CANONICAL-CD-2026-11-26',sha256:projection.model_receipts.f4_sha256};
const fields=new Map(projection.races.map(r=>[r.race_number,Object.fromEntries(r.entries.map(e=>[String(e.program_number),e.win_probability_exact]))]));
for(const s of c.sequences){
 const t=s.tickets[0],legs=s.race_fields.map(f=>({race_number:f.race_number,entries:Object.entries(fields.get(f.race_number)).map(([program_number,p])=>({program_number,pwin:p/100}))}));
 const x=chooseV34(legs,t.unit_cents),quality=sequenceQuality(legs,x);
 s.race_fields=legs.map(l=>({race_number:l.race_number,programs:l.entries.map(e=>e.program_number)}));
 s.review_probabilities=Object.fromEntries(legs.map(l=>[String(l.race_number),fields.get(l.race_number)]));
 t.legs=x.picks.map((programs,i)=>({race_number:legs[i].race_number,programs}));t.combinations=x.combinations;t.total_cents=x.total_cents;
 t.hit_rate_display=s.hit_rate_display=(100*x.hit_probability).toFixed(1)+'%';s.play_status=quality.classification;
 validateLockedSelection(legs,s,undefined);classes[s.play_status]++;
}
const final=requireCustomerPickPwin(normalizePickTickets(c));assert.equal(final.revision,3);assert.equal(final.sequences.length,19);
for(const s of final.sequences)for(const f of s.race_fields)for(const k of f.programs)assert.equal(s.review_probabilities[String(f.race_number)][k],fields.get(f.race_number)[k]);
fs.writeFileSync('/tmp/rr-pick-1126-cd-r3-output.json',JSON.stringify(final));
console.log('NOV26_CD_R3_CANONICAL_CONSTRUCTION_PASS',JSON.stringify({runners:projection.races.reduce((n,r)=>n+r.entries.length,0),sequences:final.sequences.length,classes}));

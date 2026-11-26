import fs from "node:fs";
import assert from "node:assert/strict";
import {chooseV34} from "../src/pick-tickets-v34.js";
import {sequenceQuality} from "../src/pick-tickets-sqr.js";
import {validateStagedPickBatch} from "../src/pick-tickets-staging.js";
const {batch,upstream}=JSON.parse(fs.readFileSync("/tmp/rr-pick-stage-canonical-input.json","utf8"));
let changes=0,hitChanges=0;
for(const row of batch.tracks){
 const card=row.card,u=upstream[card.track],projection=u.projection;
 assert.ok(projection);
 const local=row.runner_pwin;
 row.independent_local_runner_pwin=local;
 row.runner_pwin={};
 row.canonical_source={kind:"APPROVED_PROJECTION_SNAPSHOT_V1",key:u.key,sha256:u.sha256,tri_sha256:projection.model_receipts.tri_sha256,f4_sha256:projection.model_receipts.f4_sha256,source_archive_sha256:batch.source_archive_sha256};
 card.source_input_sha256=u.sha256;
 card.model_receipts={...projection.model_receipts};
 card.source_receipt={reference:"APPROVED-PROJECTIONS-"+batch.date+"-"+card.track,sha256:projection.model_receipts.f4_sha256};
 const fields={};
 for(const race of projection.races){
  const n=String(race.race_number),entries=race.entries,old=new Map(local[n].map(x=>[x[0],x]));
  assert.equal(entries.length,old.size);
  const rs=entries.map(e=>{
   const program=String(e.program_number),l=old.get(program);
   assert.ok(l&&l[1].toLowerCase()===e.horse_name.toLowerCase());
   const p=e.win_probability_exact/100,f=e.f4_probabilities.exact_p1;
   assert.ok(Number.isFinite(p)&&p>=0&&p<=1&&Math.abs(p-f)<1e-12);
   return [program,e.horse_name,p,f];
  });
  assert.equal(new Set(rs.map(x=>x[0])).size,rs.length);
  assert.ok(Math.abs(rs.reduce((a,x)=>a+x[2],0)-1)<1e-10);
  row.runner_pwin[n]=rs;
  const g=Object.fromEntries(rs.map(x=>[x[0],x[2]]));
  for(const group of row.coupled_interests?.[n]||[]){
   let mass=0;
   for(const m of group.members){assert.ok(Object.hasOwn(g,m.program));m.pwin=g[m.program];mass+=g[m.program];delete g[m.program];}
   g[group.program]=mass;
  }
  fields[n]=g;
 }
 for(const q of card.sequences){
  const legs=q.race_fields.map(f=>({race_number:f.race_number,entries:Object.entries(fields[f.race_number]).map(([program_number,pwin])=>({program_number,pwin}))}));
  const t=q.tickets[0],old=JSON.stringify(t.legs),prior=t.hit_rate_display,x=chooseV34(legs,t.unit_cents),quality=sequenceQuality(legs,x);
  q.race_fields=legs.map(l=>({race_number:l.race_number,programs:l.entries.map(e=>e.program_number)}));
  q.review_probabilities=Object.fromEntries(legs.map(l=>[String(l.race_number),Object.fromEntries(l.entries.map(e=>[e.program_number,e.pwin*100]))]));
  t.legs=x.picks.map((programs,i)=>({race_number:legs[i].race_number,programs}));t.combinations=x.combinations;t.total_cents=x.total_cents;
  t.hit_rate_display=q.hit_rate_display=(100*x.hit_probability).toFixed(1)+"%";q.play_status=quality.classification;
  changes+=old!==JSON.stringify(t.legs);hitChanges+=prior!==t.hit_rate_display;
 }
}
const cards=validateStagedPickBatch(batch);
assert.equal(cards.length,6);assert.equal(cards.reduce((n,x)=>n+x.sequences.length,0),78);
fs.writeFileSync("/tmp/rr-pick-stage-1126.json",JSON.stringify(batch));
console.log("CANONICAL_CONSTRUCTION_PASS",JSON.stringify({tracks:6,sequences:78,changed_picks:changes,changed_display_hit:hitChanges,classes:cards.flatMap(c=>c.sequences).reduce((a,q)=>(a[q.play_status]=(a[q.play_status]||0)+1,a),{})}));

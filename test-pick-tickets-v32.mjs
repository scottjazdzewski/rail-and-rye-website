import assert from "node:assert/strict";
import {chooseV32,exactV32Frontier,verifyV32ScratchTransition,PICK_V32_ENGINE,
 PICK_V32_COST_SCALE_DOLLARS} from "./src/pick-tickets-v32.js";

// Frozen by original Drive V3.2 source — expected output generated from the
// unmodified Python tri_only_construct.py + pick_ticket_engine.py.
// The Python source package's test_v3/test_v3_2 must ALSO be run independently.
const data=[
 {p:[[60,30,10],[50,40,10],[70,30]],unit:50,n:8,hit:.81,picks:[["1","2"],["1","2"],["1","2"]],frontier:8},
 {p:[[44,24,16,10,6],[44,24,16,10,6],[44,24,16,10,6]],unit:50,n:18,hit:.479808,picks:[["1","2"],["1","2","3"],["1","2","3"]],frontier:21},
 {p:[[20,20,20,20,20],[20,20,20,20,20],[20,20,20,20,20]],unit:50,n:30,hit:.24,picks:[["1","2"],["1","2","3"],["1","2","3","4","5"]],frontier:30},
 {p:[[70,20,10],[70,20,10],[70,20,10],[70,20,10],[70,20,10]],unit:20,n:32,hit:.59049,picks:[["1","2"],["1","2"],["1","2"],["1","2"],["1","2"]],frontier:15},
 {p:[[33,33,17,17],[33,33,17,17],[33,33,17,17]],unit:100,n:8,hit:.287496,picks:[["1","2"],["1","2"],["1","2"]],frontier:15},
 {p:[[45,25,15,10,5],[35,25,20,15,5],[51,26,14,9],[42,23,18,10,7]],unit:50,n:18,hit:.237048,picks:[["1","2"],["1","2","3"],["1"],["1","2","3"]],frontier:40},
 {p:[[80,20,0],[80,20,0],[80,20,0]],unit:50,n:8,hit:1,picks:[["1","2"],["1","2"],["1","2"]],frontier:4}
];
assert.equal(PICK_V32_ENGINE,"V3.2-TRI-ONLY-SINGLE-RECTANGLE");
assert.equal(PICK_V32_COST_SCALE_DOLLARS,15);
const fields=row=>row.p.map((prob,i)=>({race_number:i+1,
 entries:prob.map((p,j)=>({program_number:String(j+1),pwin:p/100}))}));
for(const [i,fixture] of data.entries()){
 const legs=fields(fixture),a=chooseV32(legs,fixture.unit),b=chooseV32(legs,fixture.unit);
 assert.deepEqual(a,b,"deterministic "+i);
 assert.equal(a.combinations,fixture.n,"Python exact frontier choice "+i);
 assert.equal(a.total_cents,fixture.n*fixture.unit);
 assert.ok(Math.abs(a.hit_probability-fixture.hit)<1e-11,"Python PWIN product parity "+i);
 assert.deepEqual(a.picks,fixture.picks,"Python tie-break / ranked-prefix parity "+i);
 assert.equal(a.frontier_points,fixture.frontier);
 assert.equal(exactV32Frontier(legs,fixture.unit).length,fixture.frontier);
 assert.equal(a.marginal_additions.length+a.marginal_removals.length>0,true);
 assert.equal(a.projected_return,null);
 assert.equal(a.play_status,null);
 assert.equal(a.qualified_for_publication,false);
 for(const marginal of [...a.marginal_additions,...a.marginal_removals]){
  assert.ok(!Object.values(marginal).some(v=>typeof v==="number"&&!Number.isFinite(v)));
 }
}
// The $15 is a soft cost preference, NOT a fixed spend or combination count.
const extreme=fields(data[0]);
const small=chooseV32(extreme,20),expensive=chooseV32(extreme,200);
assert.ok(small.combinations>=expensive.combinations);
assert.equal(chooseV32(extreme,50,{costScaleDollars:15}).combinations,8);
assert.throws(()=>chooseV32(extreme,50,{costScaleDollars:0}),/INVALID_COST_SCALE/);
assert.throws(()=>chooseV32([extreme[0],extreme[0]],50),/BAD_RACE_ORDER/);
assert.throws(()=>chooseV32(extreme.map(x=>({...x,entries:x.entries.slice(0,2)})),50),/RACE_PROBABILITIES_NOT_NORMALIZED/);
assert.throws(()=>chooseV32(extreme.map(x=>({...x,entries:[...x.entries,x.entries[0]]})),50),/COUPLED_OR_DUPLICATE_INTERESTS_UNRESOLVED/);

// Post-scratch still needs the independently confirmed manifest AND fresh PWIN.
const pres={date:"2026-11-23",track:"TEST",source_sha256:"a".repeat(64),legs:fields(data[0])};
const post=structuredClone(pres);post.source_sha256="b".repeat(64);
post.legs[0].entries=[{program_number:"1",pwin:.75},{program_number:"2",pwin:.25}];
const manifest={date:pres.date,track:pres.track,official_status:"CONFIRMED",
 sequence_status:"ACTIVE",prescratch_sha256:pres.source_sha256,
 postscratch_sha256:post.source_sha256,scratches:{"1":["3"]},activations:{}};
assert.equal(verifyV32ScratchTransition(pres,post,manifest).reused_prescratch_probabilities,false);
assert.throws(()=>verifyV32ScratchTransition(pres,post,{...manifest,official_status:"PENDING"}),/SCRATCH_NOTICE_NOT_CONFIRMED/);
assert.throws(()=>verifyV32ScratchTransition(pres,post,{...manifest,postscratch_sha256:"wrong"}),/STALE_POSTSCRATCH_MANIFEST/);
assert.throws(()=>verifyV32ScratchTransition(pres,post,{...manifest,scratches:{}}),/SCRATCH_FIELD_MISMATCH_R1/);
assert.throws(()=>verifyV32ScratchTransition(pres,post,{...manifest,sequence_status:"CANCELLED"}),/SEQUENCE_CANCELLED_OR_CHANGED_HOLD/);
console.log("PASS: exact Python V3.2 DP parity in seven fixtures; no artificial cost caps; official scratch guards.");

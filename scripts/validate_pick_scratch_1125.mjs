import fs from "node:fs";
import assert from "node:assert/strict";
import {normalizePickTickets,requireCustomerPickPwin} from "../src/pick-tickets.js";
import {chooseV34,PICK_V34_ENGINE} from "../src/pick-tickets-v34.js";
import {sequenceQuality} from "../src/pick-tickets-sqr.js";
const {parent,corrected,customers,batch}=JSON.parse(fs.readFileSync("/tmp/rr-pick-scratch-1125-input.json","utf8"));
const specs={
 "Churchill Downs":{code:"CD",n:10,before:97,after:88,sequences:15,scr:{"3":["1"],"4":["4","7"],"5":["4"],"8":["13"],"9":["3"],"10":["2","14","15"]}},
 "Finger Lakes":{code:"FL",n:8,before:61,after:57,sequences:7,scr:{"1":["7"],"2":["2"],"4":["3"],"7":["6"]}},
 "Mahoning Valley":{code:"MVR",n:8,before:64,after:55,sequences:10,scr:{"1":["5"],"2":["5"],"3":["9"],"5":["1"],"6":["1","7","8"],"7":["4"],"8":["6"]}},
 "Parx Racing":{code:"PRX",n:9,before:72,after:62,sequences:12,scr:{"1":["3"],"2":["4","6"],"3":["3"],"4":["4"],"5":["4"],"6":["2","9","10"],"8":["3"]}},
 "Tampa Bay Downs":{code:"TAM",n:9,before:74,after:60,sequences:13,scr:{"2":["6"],"4":["2","4"],"5":["2","4"],"6":["2","6"],"7":["3","5","8","10"],"8":["8"],"9":["8","9"]}},
 "Charles Town":{code:"CT",n:8,before:68,after:63,sequences:11,scr:{"3":["8"],"5":["1"],"6":["2","3"],"7":["4"]}}
};
const eq=(a,b)=>assert.deepEqual(a,b),sorted=x=>[...x].sort();
const valid=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=1;
const hash=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const results=[],holds=[];
for(const row of batch.tracks){
 const track=row.track,s=specs[track];try{
 assert.ok(s);eq(row.code,s.code);eq(row.scratches,s.scr);eq(row.races.length,s.n);
 const a=parent.tracks.find(x=>x.card.track===track),p=customers[track];assert.ok(a&&p);eq(a.receipt.source_pdf_sha256,row.original_pdf_sha256);
 const pre=row.pre,post=row.post;
 for(const [r,count] of [[pre,s.before],[post,s.after]]){
  assert.ok(hash(r.tri_sha256)&&hash(r.f4_sha256)&&hash(r.pwin_sha256)&&hash(r.features_sha256));
  eq(r.tri_status,"PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME");eq(r.f4_status,"PASS");eq(r.starters,count);
  eq(r.races,s.n);eq(r.roles,2*count);eq(r.input_gate,true);eq(r.exact_matrix,true);eq(r.role_complete,true);
 }
 eq(post.parent_f4_sha256,pre.f4_sha256);eq(post.scratch_verified,true);
 assert.notEqual(pre.pwin_sha256,post.pwin_sha256);eq(post.unresolved,0);
 const base=normalizePickTickets(a.card),correctedRow=corrected?.tracks?.find(x=>x.card.track===track);
 const allowed=[base,...(correctedRow?[normalizePickTickets(correctedRow.card)]:[])];
 const current=normalizePickTickets(p);
 assert.ok(current.status==="initial_current","Existing scratch revision must not be overwritten");
 assert.ok(allowed.some(x=>JSON.stringify(x)===JSON.stringify(current)),"Current customer card differs from certified queued parent");
 eq(current.formula_version,PICK_V34_ENGINE);eq(current.sequences.length,s.sequences);
 const by=new Map(),preMap=new Map();
 for(const r of row.races){
  assert.ok(Number.isInteger(r.race_number)&&r.race_number>=1&&r.race_number<=s.n&&!by.has(r.race_number));
  const rp=String(r.race_number),old=r.pre_entries,now=r.entries;
  const oldp=Object.fromEntries(old.map(e=>[e[0],e[2]])),newp=Object.fromEntries(now.map(e=>[e[0],e[2]]));
  eq(Object.keys(oldp).length,old.length);eq(Object.keys(newp).length,now.length);
  eq(sorted(Object.keys(newp)),sorted(Object.keys(oldp).filter(x=>!(s.scr[rp]||[]).includes(x))));
  assert.ok(old.every(e=>valid(e[2])&&e[1])&&now.every(e=>valid(e[2])&&Math.abs(e[2]-e[3])<1e-12&&e[1]===old.find(o=>o[0]===e[0])?.[1]));
  for(const p of [oldp,newp])assert.ok(Math.abs(Object.values(p).reduce((a,b)=>a+b,0)-1)<1e-9);
  if(!s.scr[rp]&&!(s.code==="TAM"&&[5,7,9].includes(r.race_number))&&!(s.code==="CT"&&r.race_number===7))
   for(const k of Object.keys(newp))assert.ok(Math.abs(oldp[k]-newp[k])<1e-10,"Unchanged field changed");
  preMap.set(r.race_number,oldp);by.set(r.race_number,newp);
 }
 eq([...preMap.values()].reduce((n,p)=>n+Object.keys(p).length,0),s.before);eq([...by.values()].reduce((n,p)=>n+Object.keys(p).length,0),s.after);
 let maxReplay=0;
 for(const seq of base.sequences)for(const f of seq.race_fields){
  const v=preMap.get(f.race_number);eq(sorted(f.programs),sorted(Object.keys(v)));
  for(const p of f.programs)maxReplay=Math.max(maxReplay,Math.abs(seq.review_probabilities[String(f.race_number)][p]/100-v[p]));
 }
 assert.ok(maxReplay<1e-9,"Frozen parent replay differs from original staged scores: "+maxReplay);
 if(s.code==="CD"){
  for(const n of [4,7,10])eq(row.final_state["20261125|CD|"+n].temporary_rail_feet,24);
  assert.ok(Object.hasOwn(by.get(10),"13"),"Eligible #13 Statutory must be included after #2 scratches");
 }
 if(s.code==="TAM"){
  for(const n of [5,7,9]){const a=row.final_state["20261125|TAM|"+n];eq(a.surface_family,"dirt");assert.ok(Math.abs(a.target_dist_f-(8+40/220))<1e-10);eq(a.track_condition,"GOOD");}
  for(const [n,ps] of [[5,["6","10"]],[7,["11","12"]],[9,["10"]]])for(const p of ps)assert.ok(Object.hasOwn(by.get(n),p),"MTO/conditional activation missing");
 }
 if(s.code==="CT"){eq(row.source_change.original_pdf_sha256,row.original_pdf_sha256);eq(row.source_change.derived_scoring_pdf_sha256,row.scoring_pdf_sha256);assert.notEqual(row.original_pdf_sha256,row.scoring_pdf_sha256);assert.ok(row.source_change.source_change.includes("Sunday Diaz Jr."));}
 else eq(row.original_pdf_sha256,row.scoring_pdf_sha256);
 let changedTickets=0,changedCost=0,changedHit=0,classes={PLAY:0,CONDITIONAL:0,PASS:0};
 const sequences=current.sequences.map(seq=>{
  const fields=seq.race_fields.map(f=>({race_number:f.race_number,programs:Object.keys(by.get(f.race_number))}));
  const probabilities=Object.fromEntries(fields.map(f=>[String(f.race_number),Object.fromEntries(f.programs.map(p=>[p,100*by.get(f.race_number)[p]]))]));
  const legs=fields.map(f=>({race_number:f.race_number,entries:f.programs.map(p=>({program_number:p,pwin:by.get(f.race_number)[p]}))}));
  eq(seq.tickets.length,1);const old=seq.tickets[0],x=chooseV34(legs,old.unit_cents),q=sequenceQuality(legs,x);
  const ticket={...old,combinations:x.combinations,total_cents:x.total_cents,legs:x.picks.map((programs,i)=>({race_number:legs[i].race_number,programs})),hit_rate_display:(100*x.hit_probability).toFixed(1)+"%",notes:""};
  if(JSON.stringify(old.legs)!==JSON.stringify(ticket.legs))changedTickets++;if(old.total_cents!==ticket.total_cents)changedCost++;if(old.hit_rate_display!==ticket.hit_rate_display)changedHit++;classes[q.classification]++;
  return {...seq,play_status:q.classification,hit_rate_display:ticket.hit_rate_display,recommendation:"",tickets:[ticket],race_fields:fields,review_probabilities:probabilities};
 });
 const card=requireCustomerPickPwin(normalizePickTickets({...current,revision:current.revision+1,status:"scratch_updated",publication_mode:"owner-approved-gpt",source_input_sha256:post.pwin_sha256,scratch_verified_at:row.snapshot_at,scratches_by_race:s.scr,sequences}));
 results.push({track,card,summary:{track,runners:s.after,sequences:s.sequences,scratches:s.before-s.after,changedTickets,changedCost,changedHit,classes,revision:card.revision}});
 }catch(e){holds.push({track,reason:String(e.message||e).slice(0,240)});}
}
fs.writeFileSync("/tmp/rr-pick-scratch-1125-output.json",JSON.stringify({results,holds}));
console.log("PICK_SCRATCH_VALIDATION",JSON.stringify({approved:results.map(x=>x.summary),holds}));

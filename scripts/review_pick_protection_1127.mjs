// Owner-authorized, date-scoped private single-protection review. No scoring changes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {exactV32Frontier,normalizeV32Legs} from '../src/pick-tickets-v32.js';
import {sequenceQuality} from '../src/pick-tickets-sqr.js';
import {normalizePickTickets,requireCustomerPickPwin} from '../src/pick-tickets.js';
const EPS=1e-12;
const product=a=>a.reduce((x,y)=>x*y,1);
function evalTicket(legs,picks,unit){
 const coverage=legs.map((l,i)=>picks[i].reduce((a,k)=>{const e=l.entries.find(e=>e.program===k);assert.ok(e);return a+e.pwin},0));
 const n=product(picks.map(x=>x.length));
 return {picks,leg_coverage:coverage,combinations:n,total_cents:n*unit,hit_probability:product(coverage)};
}
function review(legs,t){
 const unit=t.unit_cents,base=evalTicket(legs,t.legs.map(l=>l.programs),unit);
 assert.equal(base.total_cents,t.total_cents);assert.equal(base.combinations,t.combinations);
 const weak=base.picks.map((p,i)=>p.length===1&&base.leg_coverage[i]<.4-EPS);
 const sub50=base.picks.map((p,i)=>p.length===1&&base.leg_coverage[i]<.5-EPS);
 const wide=Math.max(...base.leg_coverage);
 const reasons=[];const targets=new Set();
 if(wide>=.9-EPS&&sub50.some(Boolean)){reasons.push('SUB50_WITH_90_COVERAGE');sub50.forEach((v,i)=>{if(v)targets.add(i)});}
 if(weak.filter(Boolean).length>=2){reasons.push('MULTIPLE_SUB40');weak.forEach((v,i)=>{if(v)targets.add(i)});}
 // Explicit conservative implementation of the discretionary broad-coverage trigger.
 if(wide>=.75-EPS&&weak.some(Boolean)){reasons.push('SUB40_WITH_75_COVERAGE');weak.forEach((v,i)=>{if(v)targets.add(i)});}
 if(wide>=.8-EPS&&sub50.some(Boolean)){reasons.push('SUB50_WITH_80_COVERAGE');sub50.forEach((v,i)=>{if(v)targets.add(i)});}
 if(!targets.size)return {base,reasons,targets:[],weakCount:weak.filter(Boolean).length};
 const exact=exactV32Frontier(legs.map(l=>({race_number:l.race_number,entries:l.entries.map(e=>({program_number:e.program,pwin:e.pwin}))})),unit);
 const unconstrained=exact.filter(x=>x.total_cents<=base.total_cents).sort((a,b)=>b.hit_probability-a.hit_probability||a.total_cents-b.total_cents)[0];
 // Exact dynamic frontier over top-k allocations under explicit per-leg protections.
 // For any fixed k, top-k maximizes probability; DP retains the highest hit at each cost.
 let dp=new Map([[1,{hit:1,picks:[]}]]);
 for(let i=0;i<legs.length;i++){
  const ranked=[...legs[i].entries].sort((a,b)=>b.pwin-a.pwin||(a.program<b.program?-1:a.program>b.program?1:0));
  let mass=0;const next=new Map();
  for(let k=1;k<=ranked.length;k++){
   mass+=ranked[k-1].pwin;
   if(k===1&&(targets.has(i)||(!sub50[i]&&mass<.5-EPS)))continue;
   const picks=ranked.slice(0,k).map(e=>e.program);
   for(const [n,prev] of dp){
    const cost=n*k,hit=prev.hit*mass,old=next.get(cost);
    if(!old||hit>old.hit+EPS)next.set(cost,{hit,picks:[...prev.picks,picks]});
   }
  }
  dp=next;
 }
 const protectedAll=[...dp.values()].map(v=>evalTicket(legs,v.picks,unit));
 const bestWithin=cap=>protectedAll.filter(x=>x.total_cents<=cap).sort((a,b)=>b.hit_probability-a.hit_probability||a.total_cents-b.total_cents)[0]??null;
 const preserving=protectedAll.filter(x=>x.hit_probability+EPS>=base.hit_probability).sort((a,b)=>a.total_cents-b.total_cents||b.hit_probability-a.hit_probability);
 const least=preserving[0]??null;
 const same=bestWithin(base.total_cents),plus25=bestWithin(Math.floor(base.total_cents*1.25)),plus50=bestWithin(Math.floor(base.total_cents*1.5));
 // No new weak single, all targeted singles protected, no loss of modeled hit.
 // A lower-cost candidate needs explicit verified sequence minimum; for this run
 // retain the previously certified total unless a same-cost alternative qualifies.
 const equalCost=protectedAll.filter(x=>x.total_cents===base.total_cents&&x.hit_probability+EPS>=base.hit_probability).sort((a,b)=>b.hit_probability-a.hit_probability)[0]??null;
 const approved=equalCost??null;
 return {base,reasons,targets:[...targets].map(i=>legs[i].race_number),weakCount:weak.filter(Boolean).length,unconstrained,same,least,plus25,plus50,approved,cheaperNeedsMinimum:preserving.some(x=>x.total_cents<base.total_cents)};
}
const summary=x=>x?{cost:x.total_cents,hit_pct:100*x.hit_probability,coverage:x.leg_coverage.map(v=>100*v),widths:x.picks.map(p=>p.length),combinations:x.combinations}:null;
if(process.argv.includes('--test')){
 const legs=[{race_number:1,entries:[.35,.30,.2,.15].map((pwin,i)=>({program:String(i+1),pwin}))},{race_number:2,entries:[.36,.30,.20,.14].map((pwin,i)=>({program:String(i+1),pwin}))},{race_number:3,entries:[.4,.35,.25].map((pwin,i)=>({program:String(i+1),pwin}))}];
 const r=review(legs,{unit_cents:50,total_cents:150,combinations:3,legs:[{programs:['1']},{programs:['1']},{programs:['1','2','3']}]});
 assert.deepEqual(r.targets,[1,2]);assert.equal(r.approved,null);assert.ok(r.least.total_cents>150);assert.ok(r.least.picks[0].length>=2&&r.least.picks[1].length>=2);
 // Independent brute-force comparison of the constrained optimizer.
 let best=0;for(let a=2;a<=4;a++)for(let b=2;b<=4;b++)for(let c=2;c<=3;c++){const k=a*b*c;if(k*50<=450)best=Math.max(best,product([a,b,c].map((n,i)=>legs[i].entries.slice(0,n).reduce((s,e)=>s+e.pwin,0))));}
 const r2=review(legs,{unit_cents:50,total_cents:300,combinations:6,legs:[{programs:['1']},{programs:['1','2']},{programs:['1','2','3']}]});
 assert.ok(r2.plus50);assert.ok(Math.abs(r2.plus50.hit_probability-best)<1e-12);
 console.log('SINGLE_PROTECTION_REGRESSION_PASS');process.exit(0);
}
const inp=JSON.parse(fs.readFileSync('/tmp/pick-protection-input.json','utf8'));
const result={cards:[],rows:[],totals:{reviewed:0,eligible:0,flagged:0,flagged_eligible:0,eligible_same_cost:0,eligible_within25:0,eligible_within50:0,eligible_higher_cost:0,cheaper_minimum_hold:0,missing_post:0,improved:0,weak_eliminated:0}};
for(const row of inp.cards){
 const c=structuredClone(row.card),old=c.sequences;
 assert.deepEqual(requireCustomerPickPwin(normalizePickTickets(c)),c);
 for(const [i,s] of old.entries()){
  const t=s.tickets[0];assert.equal(s.tickets.length,1);
  const legs=normalizeV32Legs(s.race_fields.map(f=>({race_number:f.race_number,entries:f.programs.map(k=>({program_number:k,pwin:s.review_probabilities[String(f.race_number)][k]/100}))})));
  const r=review(legs,t),post=row.posts[String(s.start_race)]??null,eligible=post!==null&&Date.parse(post)>Date.parse(inp.cutoff);
  const z=result.totals;z.reviewed++;if(eligible)z.eligible++;if(!post)z.missing_post++;
  if(!r.targets.length)continue;
  z.flagged++;if(eligible){z.flagged_eligible++;if(r.same&&r.same.hit_probability+EPS>=r.base.hit_probability)z.eligible_same_cost++;if(r.least&&r.least.total_cents<=r.base.total_cents*1.25)z.eligible_within25++;if(r.least&&r.least.total_cents<=r.base.total_cents*1.5)z.eligible_within50++;if(r.least&&r.least.total_cents>r.base.total_cents)z.eligible_higher_cost++;if(r.cheaperNeedsMinimum)z.cheaper_minimum_hold++;}
  const rec={track:c.track,index:i,name:s.name,start:s.start_race,end:s.end_race,post,eligible,reasons:r.reasons,targets:r.targets,base:summary(r.base),unconstrained:summary(r.unconstrained),same:summary(r.same),least:summary(r.least),plus25:summary(r.plus25),plus50:summary(r.plus50),approved:eligible?summary(r.approved):null};
  // All full selections stay inside the private archive, never workflow logs.
  result.rows.push({...rec,private_alternatives:{base:r.base,same:r.same,least:r.least,plus25:r.plus25,plus50:r.plus50,approved:r.approved}});
  if(!eligible||!r.approved)continue;
  const x=r.approved;
  assert.ok(x.hit_probability+EPS>=r.base.hit_probability&&x.total_cents===t.total_cents);
  for(const n of r.targets)assert.ok(x.picks[legs.findIndex(l=>l.race_number===n)].length>1);
  const weakAfter=x.picks.filter((p,j)=>p.length===1&&x.leg_coverage[j]<.4-EPS).length;
  assert.ok(weakAfter<=r.weakCount);
  const q=sequenceQuality(legs,x);
  t.legs=x.picks.map((p,j)=>({race_number:legs[j].race_number,programs:p}));t.combinations=x.combinations;t.total_cents=x.total_cents;t.hit_rate_display=s.hit_rate_display=(100*x.hit_probability).toFixed(1)+'%';s.play_status=q.classification;
  z.improved++;z.weak_eliminated+=r.weakCount-weakAfter;
 }
 const changed=old.map((s,i)=>JSON.stringify(s)!==JSON.stringify(row.card.sequences[i])?i:-1).filter(i=>i>=0);
 if(changed.length){c.revision++;assert.deepEqual(normalizePickTickets(c),c);result.cards.push({key:row.key,card:c,changed});}
}
assert.equal(result.totals.reviewed,173);
fs.writeFileSync('/tmp/pick-protection-output.json',JSON.stringify(result));
console.log('SINGLE_PROTECTION_REVIEW_SUMMARY',JSON.stringify(result.totals));
for(const row of result.rows.filter(r=>r.eligible)){const f=x=>x?{c:x.cost,h:+x.hit_pct.toFixed(6)}:null;console.log('SINGLE_PROTECTION_ELIGIBLE',JSON.stringify({track:row.track,name:row.name,start:row.start,end:row.end,targets:row.targets,base:f(row.base),same:f(row.same),least:f(row.least),plus25:f(row.plus25),plus50:f(row.plus50),approved:f(row.approved)}));}

// Owner-authorized, date-scoped private single-protection review. No scoring changes.

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
export function review(legs,t){
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

// Source-driven Nov 23 interim Pick Ticket constructor, private admin preview only.
// NEVER import or embed paid TRI data here. Read current full-field PWIN from private
// R2 Projections on request; reject missing/mismatched exact model distributions.
// No tote, payout, pool-size, ROI, or profitability estimates are made.
export const PICK_DAY="2026-11-23";

const add=(a,n,starts,unit_cents,label)=>starts.map(start=>({
  track:a,name:label||"Pick "+n,start_race:start,end_race:start+n-1,unit_cents
}));

export const PICK_MENU_1123=Object.freeze([
 ...add("Finger Lakes",5,[1,4],50,"Pick 5"),
 ...add("Finger Lakes",3,[2,3,6],50),
 ...add("Finger Lakes",4,[3,5],50),
 ...add("Mahoning Valley",3,[1,2,3,4,5,6,7,8],50),
 ...add("Mahoning Valley",5,[1,6],50),
 ...add("Mahoning Valley",4,[7],50),
 ...add("Mahoning Valley",6,[5],20,"Buckeye Pick 6"),
 ...add("Mountaineer",4,[1,5],50),
 ...add("Mountaineer",3,[2,6],100),
 ...add("Mountaineer",5,[4],50),
 ...add("Parx Racing",3,[1,2,3,4,5,6,7],100),
 ...add("Parx Racing",4,[1,2,4,6],50),
 ...add("Parx Racing",5,[5],50,"Philly Big 5"),
 ...add("Zia Park",5,[1,6],50),
 ...add("Zia Park",4,[2,7],50),
 ...add("Zia Park",3,[3,8],50)
]);

const counts={"Finger Lakes":8,"Mahoning Valley":10,"Mountaineer":8,"Parx Racing":9,"Zia Park":10};
const isNumber=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=100;
const displayPct=n=>(Math.round(n*10)/10).toFixed(1)+"%";
function checkCard(card){
 if(!card||card.race_date!==PICK_DAY||card.projection_status!=="prescratch"||
   !Object.hasOwn(counts,card.track_name)||
   !Array.isArray(card.races)||card.races.length!==counts[card.track_name])return null;
 const races=new Map();
 for(const r of card.races){
  if(!Number.isInteger(r.race_number)||races.has(r.race_number)||r.scratch_count!==null||
    (r.scratches?.length||0)>0||!Array.isArray(r.entries)||r.entries.length<2)return null;
  const seen=new Set(),entries=[];
  for(const e of r.entries){
   const number=String(e.program_number||"").toUpperCase();
   const p=e.win_probability_exact;
   if(!/^[0-9]{1,2}[A-Z]?$/.test(number)||seen.has(number)||!isNumber(p)||
      !e.f4_probabilities||Math.abs(e.f4_probabilities.exact_p1*100-p)>0.000001)return null;
   seen.add(number);
   entries.push({number,p});
  }
  const mass=entries.reduce((n,e)=>n+e.p,0);
  if(Math.abs(mass-100)>0.000001)return null;
  entries.sort((a,b)=>b.p-a.p||parseInt(a.number,10)-parseInt(b.number,10)||a.number.localeCompare(b.number));
  races.set(r.race_number,entries);
 }
 if(races.size!==counts[card.track_name]||[...races.keys()].some(r=>r<1||r>counts[card.track_name]))return null;
 return races;
}
// beta=0.5 balances improvement in model hit chance against multiplicative ticket
// complexity. Explicit interim coverage-efficiency heuristic, NOT estimated ROI.
function legSelection(entries,beta){
 let cumulative=0,best=-1,bestK=0;
 for(let i=0;i<entries.length;i++){
  cumulative+=entries[i].p/100;
  const score=cumulative/Math.pow(i+1,beta);
  if(score>best+1e-12){best=score;bestK=i+1}
 }
 const picks=entries.slice(0,bestK);
 return {programs:picks.map(x=>x.number),coverage:picks.reduce((sum,x)=>sum+x.p,0)/100,
   count:picks.length};
}
function candidate(spec,races,beta){
 let combinations=1,hit=1;const legs=[];
 for(let n=spec.start_race;n<=spec.end_race;n++){
  const field=races.get(n);if(!field)return null;
  const selection=legSelection(field,beta);
  combinations*=selection.count;hit*=selection.coverage;
  if(!Number.isSafeInteger(combinations)||combinations>1e9)return null;
  legs.push({race_number:n,programs:selection.programs});
 }
 const total=combinations*spec.unit_cents;
 if(!Number.isSafeInteger(total)||total>1e11)return null;
 return {legs,combinations,total_cents:total,hit_pct:hit*100,unit_cents:spec.unit_cents};
}
// Interim V2: start from the model's lean selection and admit additional runners
// only when the incremental PWIN coverage outweighs the additional combinations
// under a stronger cost-sensitivity exponent (0.60 vs the old balanced 0.50).
// No fixed spending cap, singles count, sequence hit target, or combination quota.
export const FOCUSED_COST_EXPONENT=0.60;
function focusedLeg(entries,leanLeg,balancedLeg){
 const lower=leanLeg.count,upper=balancedLeg.count;
 if(lower<1||upper<lower||upper>entries.length)return null;
 let count=lower;
 let mass=entries.slice(0,count).reduce((sum,e)=>sum+e.p,0)/100;
 const additions=[];
 while(count<upper){
  const next=entries[count];
  const addedMass=next.p/100;
  const before=mass/Math.pow(count,FOCUSED_COST_EXPONENT);
  const after=(mass+addedMass)/Math.pow(count+1,FOCUSED_COST_EXPONENT);
  // A marginal runner must improve the coverage-to-combination score.
  // Exact ties favor the smaller, less expensive ticket.
  if(after<=before+1e-12)break;
  additions.push({program:next.number,runner_win_probability_pct:next.p,
   leg_coverage_before_pct:mass*100,leg_coverage_after_pct:(mass+addedMass)*100});
  mass+=addedMass;
  count++;
 }
 return {count,programs:entries.slice(0,count).map(e=>e.number),coverage:mass,additions};
}
function focusedCandidate(spec,races,lean,balanced){
 let combinations=1,hit=1;
 const legs=[],marginals=[];
 for(let i=0,number=spec.start_race;number<=spec.end_race;i++,number++){
  const entries=races.get(number);
  if(!entries)return null;
  const leg=focusedLeg(entries,
   {count:lean.legs[i].programs.length},
   {count:balanced.legs[i].programs.length});
  if(!leg)return null;
  legs.push({race_number:number,programs:leg.programs});
  combinations*=leg.count;
  hit*=leg.coverage;
  if(!Number.isSafeInteger(combinations)||combinations>1e9)return null;
  marginals.push({race_number:number,additions:leg.additions});
 }
 const total=combinations*spec.unit_cents;
 if(!Number.isSafeInteger(total)||total>1e11)return null;
 // Inspect each added horse at the final other-leg coverage level.
 for(let i=0;i<legs.length;i++){
  const leg=legs[i],entries=races.get(leg.race_number);
  const k=leg.programs.length;
  const otherLegMass=legs.reduce((p,l,j)=>{
   if(i===j)return p;
   return p*l.programs.reduce((m,number)=>m+entriesFor(races,l.race_number,number),0)/100;
  },1);
  const otherLegCombinations=combinations/k;
  for(const added of marginals[i].additions){
   added.additional_combinations=otherLegCombinations;
   added.additional_cost_cents=otherLegCombinations*spec.unit_cents;
   added.additional_complete_hit_pct=added.runner_win_probability_pct*otherLegMass;
  }
 }
 return {legs,combinations,total_cents:total,hit_pct:hit*100,
  unit_cents:spec.unit_cents,marginal_checks:marginals};
}
function entriesFor(races,raceNumber,number){
 return races.get(raceNumber).find(e=>e.number===number)?.p??0;
}
function compare(a,b){return a.total_cents===b.total_cents&&a.combinations===b.combinations&&
 a.legs.every((l,i)=>l.programs.join("|")===b.legs[i].programs.join("|"))}
function buildSequence(spec,races){
 const lean=candidate(spec,races,.65),balanced=candidate(spec,races,.5),
       wide=candidate(spec,races,.35);
 if(!lean||!balanced||!wide)return null;
 const focused=focusedCandidate(spec,races,lean,balanced);
 if(!focused||focused.combinations>balanced.combinations||
   focused.combinations<lean.combinations)return null;
 const label=c=>"$"+(c.total_cents/100).toFixed(2)+" / "+displayPct(c.hit_pct);
 const alternatives=[["lean",lean],["focused",focused],["former_balanced",balanced],["wide",wide]]
  .filter(([name,c])=>name==="focused"||!compare(c,focused));
 const comparisons=alternatives.map(([name,c])=>name+": "+label(c)).join("; ");
 const savings=balanced.total_cents-focused.total_cents;
 const coverageSacrifice=Math.max(0,balanced.hit_pct-focused.hit_pct);
 const field=Array.from({length:spec.end_race-spec.start_race+1},(_,i)=>{
  const race_number=spec.start_race+i;
  return {race_number,programs:races.get(race_number).map(e=>e.number)};
 });
 const nonSingles=focused.legs.filter(l=>l.programs.length>1).length;
 const notes="Ticket comparison: "+comparisons+
  ". Uses 0.60 cost-sensitive marginal PWIN coverage, between lean and former balanced."+
  " Compared with former balanced: "+(savings/100).toFixed(2)+" USD less cost; "+
  displayPct(coverageSacrifice)+" less model-implied hit chance."+
  " Constructed using verified source inputs where available.";
 return {
  name:spec.name,start_race:spec.start_race,end_race:spec.end_race,
  // Status is still awaiting independently approved ticket classification.
  // PWIN coverage and cost alone do not establish wagering profitability.
  play_status:"CONDITIONAL",hit_rate_display:displayPct(focused.hit_pct),
  recommendation:"Ticket construction. "+comparisons+".",
  race_fields:field,
  // Paid runner PWIN is only emitted by the existing Access-protected admin route.
  review_probabilities:Object.fromEntries(Array.from({length:spec.end_race-spec.start_race+1},(_,i)=>{
   const n=spec.start_race+i;
   return [String(n),Object.fromEntries(races.get(n).map(e=>[e.number,e.p]))];
  })),
  tickets:[{role:"BEST_POSSIBLE",title:"Rail & Rye Ticket",
   unit_cents:focused.unit_cents,combinations:focused.combinations,
   total_cents:focused.total_cents,legs:focused.legs,
   hit_rate_display:displayPct(focused.hit_pct),notes}],
  review_meta:{
   method:"PWIN_FOCUSED_MARGINAL_0_60_V2",
   classification_method:"AWAITING_APPROVED_CLASSIFICATION",
   alternatives:alternatives.map(([type,c])=>({
    type,hit_rate_display:displayPct(c.hit_pct),combinations:c.combinations,
    unit_cents:c.unit_cents,total_cents:c.total_cents
   })),
   saved_combinations_vs_former_balanced:balanced.combinations-focused.combinations,
   saved_cents_vs_former_balanced:savings,
   hit_pct_point_change_vs_former_balanced:focused.hit_pct-balanced.hit_pct,
   marginal_checks:focused.marginal_checks,
   non_single_legs:nonSingles
  }
 };
}
// Current Projections data lives in this same private bucket. Read exact known
// track/date objects without requiring any legacy products/PDF or D1 table.
// Every candidate still goes through the full-field gate in checkCard().
export async function readPrivatePickProjections(env){
 if(!env?.CARDS_BUCKET)return [];
 const tracks=Object.keys(counts);
 const found=await Promise.all(tracks.map(async track=>{
  const slug=track.toLowerCase().replace(/[^a-z0-9]+/g,"-");
  try{
   const file=await env.CARDS_BUCKET.get("projections/dashboard/"+PICK_DAY+"/"+slug+".json");
   if(!file)return null;
   return {card:JSON.parse(await file.text()),uploaded_at:file.customMetadata?.uploaded_at||null};
  }catch(e){console.warn("Unreadable source Projections card for private ticket preview",track);return null}
 }));
 const direct=found.filter(Boolean);
 // Secure encrypted issue-comment handoff writes source scores to private R2,
 // so the interface can show the actual 11/23 model tickets even if the
 // independent Projections module has not yet staged its own dashboard JSON.
 try{
  const stored=await env.CARDS_BUCKET.get("pick-tickets/interim/2026-11-23/revision-0001.json");
  if(stored){
   const src=JSON.parse(await stored.text());
   if(src?.schema_version===1&&src?.product_type==="pick_tickets_interim_pwin"&&
      src.race_date===PICK_DAY&&src.review_only===true&&
      src.customer_publish_approved===false&&
      src.source_status==="PRESCRATCH_SCORES_PASSED__SCRATCHES_AND_BADGES_NOT_CERTIFIED"&&
      Array.isArray(src.tracks)&&src.tracks.length===5){
    const names=new Set(direct.map(x=>x.card.track_name));
    for(const track of src.tracks){
     if(!Object.hasOwn(counts,track.track)||names.has(track.track)||!Array.isArray(track.races))continue;
     const c={race_date:PICK_DAY,track_name:track.track,projection_status:"prescratch",
      races:track.races.map(r=>({
       race_number:r.race_number,scratch_count:null,scratches:[],
       entries:(r.entries||[]).map(e=>({
        program_number:e[0],win_probability_exact:e[1],f4_probabilities:{exact_p1:e[2]}
       }))
      }))};
     direct.push({card:c,uploaded_at:stored.customMetadata?.uploaded_at||null});
    }
   }
  }
 }catch(e){console.warn("Sealed private interim PWIN intake unreadable; skipping",String(e).slice(0,110));}
 return direct;
}
export function buildPrescratchPickTicketReview(cards){
 const results=[],rejected=[];
 for(const wrapped of cards||[]){
  const card=wrapped?.card||wrapped;
  if(card?.race_date!==PICK_DAY||!Object.hasOwn(counts,card?.track_name))continue;
  const races=checkCard(card);
  if(!races){rejected.push({track:card.track_name,reason:"Missing exact full-field current prescratch PWIN/F4 validation."});continue}
  const menu=PICK_MENU_1123.filter(s=>s.track===card.track_name);
  const sequences=menu.map(spec=>buildSequence(spec,races));
  if(sequences.some(x=>x===null)){rejected.push({track:card.track_name,reason:"Candidate ticket arithmetic could not be verified."});continue}
  sequences.sort((a,b)=>a.start_race-b.start_race||
   (a.end_race-a.start_race)-(b.end_race-b.start_race)||a.name.localeCompare(b.name));
  results.push({card:{
   schema_version:1,product_type:"pick_tickets",date:PICK_DAY,track:card.track_name,
   revision:1,status:"initial_current",review_only:true,
   source_type:"PRIVATE_R2_PRESCRATCH_PROJECTIONS_NOT_SCORER_RECEIPT",
   source_receipt:null,
   optimizer_basis:"INTERIM_COVERAGE_EFFICIENCY_NOT_EV",
   sequences
  },updated_at:wrapped?.uploaded_at||null,review_only:true});
 }
 return {cards:results,rejected,source:"private_r2_projections",review_only:true};
}

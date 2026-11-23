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
function compare(a,b){return a.total_cents===b.total_cents&&a.combinations===b.combinations&&
 a.legs.every((l,i)=>l.programs.join("|")===b.legs[i].programs.join("|"))}
function buildSequence(spec,races){
 const narrow=candidate(spec,races,.65),balanced=candidate(spec,races,.5),
       wider=candidate(spec,races,.35);
 if(!narrow||!balanced||!wider)return null;
 const label=c=>"$"+(c.total_cents/100).toFixed(2)+" / "+displayPct(c.hit_pct);
 const alternatives=[["narrower",narrow],["balanced",balanced],["wider",wider]]
   .filter(([n,c])=>n==="balanced"||!compare(c,balanced));
 const comparisons=alternatives.map(([n,c])=>n+": "+label(c)).join("; ");
 const field=Array.from({length:spec.end_race-spec.start_race+1},(_,i)=>{
  const race_number=spec.start_race+i;
  return {race_number,programs:races.get(race_number).map(e=>e.number)};
 });
 const nonSingles=balanced.legs.filter(l=>l.programs.length>1).length;
 const notes="Interim model-coverage construction. "+comparisons+
  ". Selections maximize the ratio of cumulative leg PWIN to the square root of leg coverage count."+
  " Model hit probability assumes independent race outcomes; not a projected return.";
 return {
  name:spec.name,start_race:spec.start_race,end_race:spec.end_race,
  // With no combination payout evidence, do not claim a profitable PLAY.
  play_status:"CONDITIONAL",hit_rate_display:displayPct(balanced.hit_pct),
  recommendation:"Prescratch model-coverage recommendation. "+comparisons+".",
  race_fields:field,
  // Only emitted by this Access-protected admin endpoint; never committed as paid data.
  review_probabilities:Object.fromEntries(Array.from({length:spec.end_race-spec.start_race+1},(_,i)=>{
   const n=spec.start_race+i;
   return [String(n),Object.fromEntries(races.get(n).map(e=>[e.number,e.p]))];
  })),
  tickets:[{role:"BEST_POSSIBLE",title:"Rail & Rye Model-Coverage Ticket",
   unit_cents:balanced.unit_cents,combinations:balanced.combinations,
   total_cents:balanced.total_cents,legs:balanced.legs,
   hit_rate_display:displayPct(balanced.hit_pct),notes}],
  review_meta:{method:"PWIN_COVERAGE_PER_SQRT_COMBOS_V1",alternatives:alternatives.map(([type,c])=>({
   type,hit_rate_display:displayPct(c.hit_pct),combinations:c.combinations,
   unit_cents:c.unit_cents,total_cents:c.total_cents
  })),non_single_legs:nonSingles}
 };
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

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
import {chooseV32,verifyV32ScratchTransition,PICK_V32_ENGINE,
 PICK_V32_COST_SCALE_DOLLARS} from "./pick-tickets-v32.js";

const isNumber=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=100;
const displayPct=n=>(n*100).toFixed(1)+"%";

/** Current betting interests only. Never infer a missing horse, field, jockey, or PWIN. */
function checkedCurrentFields(card){
 if(!card||card.race_date!==PICK_DAY||!Object.hasOwn(counts,card.track_name)||
    !["prescratch","scratch_final"].includes(card.projection_status)||
    !Array.isArray(card.races)||card.races.length!==counts[card.track_name])return null;
 const out=new Map();
 for(const race of card.races){
  const number=race.race_number;
  if(!Number.isInteger(number)||number<1||number>counts[card.track_name]||
     out.has(number)||!Array.isArray(race.entries)||race.entries.length<2)return null;
  const seen=new Set(),entries=[];
  for(const row of race.entries){
   const program=String(row.program_number??"").trim().toUpperCase();
   const pct=row.win_probability_exact, p1=row.f4_probabilities?.exact_p1;
   if(!/^[0-9]{1,2}[A-Z]?$/.test(program)||seen.has(program)||
      !isNumber(pct)||!isNumber(p1*100)||Math.abs(pct/100-p1)>1e-8)return null;
   seen.add(program);entries.push({program_number:program,pwin:pct/100});
  }
  if(Math.abs(entries.reduce((n,e)=>n+e.pwin,0)-1)>1e-5)return null;
  out.set(number,{race_number:number,entries});
 }
 if(out.size!==counts[card.track_name])return null;
 return out;
}
function makeSequenceV32(spec,races,stage){
 const legs=Array.from({length:spec.end_race-spec.start_race+1},(_,i)=>
  races.get(spec.start_race+i));
 if(legs.some(x=>!x))return null;
 const chosen=chooseV32(legs,spec.unit_cents);
 const picks=chosen.picks.map((programs,i)=>({race_number:spec.start_race+i,programs}));
 const fields=legs.map(l=>({race_number:l.race_number,programs:l.entries.map(e=>e.program_number)}));
 const probs=Object.fromEntries(legs.map(l=>
  [String(l.race_number),Object.fromEntries(l.entries.map(e=>[e.program_number,e.pwin*100]))]));
 const ticket={role:"BEST_POSSIBLE",title:"Rail & Rye Ticket",
  unit_cents:spec.unit_cents,combinations:chosen.combinations,total_cents:chosen.total_cents,
  legs:picks,hit_rate_display:displayPct(chosen.hit_probability),
  notes:"One ticket per sequence using the exact TRI-only cost/probability frontier."};
 return {name:spec.name,start_race:spec.start_race,end_race:spec.end_race,
  play_status:"CONDITIONAL",
  recommendation:"One ticket per official sequence using TRI win probabilities.",
  hit_rate_display:ticket.hit_rate_display,race_fields:fields,review_probabilities:probs,
  tickets:[ticket],
  review_meta:{
   method:PICK_V32_ENGINE,
   objective:"ARGMAX(log(H)-C/S)",
   soft_cost_scale_dollars:PICK_V32_COST_SCALE_DOLLARS,
   frontier_points:chosen.frontier_points,
   stage,
   // Internals retained for QA only; the UI never shows a payout projection.
   required_break_even_dividend:chosen.break_even_average_winning_dividend,
   marginal_additions:chosen.marginal_additions,
   marginal_removals:chosen.marginal_removals,
   profitability_validation:"NOT_PERFORMED",
   publication_qualified:false
  }};
}
function buildTrackV32(card,wrapped){
 const current=checkedCurrentFields(card);
 if(!current)return null;
 const stage=card.projection_status==="scratch_final"?"POSTSCRATCH":"PRESCRATCH";
 // Source authenticity/official scratch changes are separately verified by
 // the private scoring and release gates. This result is NEVER customer-approved.
 const sequences=PICK_MENU_1123.filter(x=>x.track===card.track_name)
  .map(x=>makeSequenceV32(x,current,stage));
 if(sequences.some(x=>!x))return null;
 sequences.sort((a,b)=>a.start_race-b.start_race||
  (a.end_race-a.start_race)-(b.end_race-b.start_race)||a.name.localeCompare(b.name));
 return {card:{schema_version:1,product_type:"pick_tickets",
  date:PICK_DAY,track:card.track_name,revision:1,status:stage==="POSTSCRATCH"?"scratch_updated":"initial_current",
  review_only:true,source_type:"PRIVATE_R2_TRI_V32_REQUIRES_SEPARATE_RELEASE_VERIFICATION",
  source_receipt:null,optimizer_basis:PICK_V32_ENGINE,sequences},
  updated_at:wrapped?.uploaded_at||null,review_only:true};
}

export function buildV32PostScratchReviewed({before,after,manifest,preHash,postHash}){
 const old=checkedCurrentFields(before),now=checkedCurrentFields(after);
 if(!old||!now||before.projection_status!=="prescratch"||
   after.projection_status!=="scratch_final"||
   before.track_name!==after.track_name)return null;
 const oldSeq={date:PICK_DAY,track:before.track_name,source_sha256:preHash,
  legs:[...old.values()]};
 const newSeq={date:PICK_DAY,track:after.track_name,source_sha256:postHash,
  legs:[...now.values()]};
 verifyV32ScratchTransition(oldSeq,newSeq,manifest);
 return buildTrackV32(after,null);
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
  if(card.projection_status!=="prescratch"){
   rejected.push({track:card.track_name,reason:"Fresh complete official postscratch field and matching manifest required."});
   continue;
  }
  try{
   const result=buildTrackV32(card,wrapped);
   if(result)results.push(result);
   else rejected.push({track:card.track_name,reason:"Incomplete or invalid TRI PWIN/F4 betting-interest field."});
  }catch(e){rejected.push({track:card.track_name,reason:"V3.2 source gate: "+String(e.message||e).slice(0,115)})}
 }
 return {cards:results,rejected,source:"private_r2_projections",review_only:true,
  engine:PICK_V32_ENGINE};
}

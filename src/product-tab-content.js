import {readMemberProjectionCards} from './projections.js';
import {readPublishedPickTicketCards} from './pick-tickets.js';
import {readLongshotRadarEdition} from './longshot-radar.js';
import {readTargetListEdition} from './target-list.js';

import {trackCovered} from './product-entitlements.js';

export const PRODUCT_TAB_CATEGORIES=['Race Cards','Pick Tickets','Longshot Radar','Target List'];
const text=(value,max=500)=>typeof value==='string'?value.slice(0,max):'';
const num=value=>value==null||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
function publicProjection(card){
 return {race_date:card.race_date,track_name:card.track_name,projection_status:card.projection_status,
  ...(card.model_receipts?{model_receipts:Object.fromEntries(["tri_sha256","f4_sha256","prescratch_parent_sha256","official_changes_sha256"].filter(k=>/^[a-f0-9]{64}$/i.test(String(card.model_receipts[k]||""))).map(k=>[k,card.model_receipts[k]]))}:{}),
  races:(card.races||[]).map(race=>({
   race_number:race.race_number,post_time_et:race.post_time_et,distance:race.distance,
   surface:race.surface,pace:race.pace,conditions:race.conditions,race_name:race.race_name,
   stakes_name:race.stakes_name,stakes_grade:race.stakes_grade,is_stakes:race.is_stakes===true,
   purse:race.purse,scratch_count:race.scratch_count,
   scratches:(race.scratches||[]).map(item=>({program_number:text(item.program_number,8),horse_name:text(item.horse_name,100)})),
   entries:(race.entries||[]).map(entry=>({
    program_number:text(entry.program_number,8),horse_name:text(entry.horse_name,100),
    rank:num(entry.rank),win_probability:num(entry.win_probability),win_probability_exact:num(entry.win_probability_exact),
    ...(entry.f4_probabilities?{f4_probabilities:Object.fromEntries(["exact_p1","exact_p2","exact_p3","exact_p4","exact_p5","p6_plus","top2","top3","top4"].map(k=>[k,num(entry.f4_probabilities[k])]))}:{}),morning_line:text(entry.morning_line,30),
    fair_odds:text(entry.fair_odds,30),trainer:text(entry.trainer,100),jockey:text(entry.jockey,100),
    metrics:Array.isArray(entry.metrics)?entry.metrics.map(m=>({label:text(m.label,40),value:m.value})):[],
    notes:text(entry.notes,1200)
   })).sort((a,b)=>(b.win_probability??-1)-(a.win_probability??-1))
  }))
 };
}
function publicPick(item){
 if(item?.review_only===true)return null;
 const card=item?.card||item;
 if(!card||card.date==null||!Array.isArray(card.sequences))return null;
 return {date:card.date,track:card.track,
  ...(card.scratches_by_race?{scratches_by_race:card.scratches_by_race}:{}),
  ...(card.post_times_by_race?{post_times_by_race:card.post_times_by_race}:{}),
  ...(card.stakes_by_race?{stakes_by_race:card.stakes_by_race}:{}),
  sequences:card.sequences.map(sequence=>({
   name:sequence.name,start_race:sequence.start_race,end_race:sequence.end_race,
   play_status:sequence.play_status,hit_rate_display:sequence.hit_rate_display,
   recommendation:text(sequence.recommendation,1500),
   ...(Array.isArray(sequence.race_fields)?{race_fields:sequence.race_fields.map(f=>({race_number:f.race_number,programs:f.programs}))}:{}),
   ...(sequence.review_probabilities?{review_probabilities:sequence.review_probabilities}:{}),
   tickets:(sequence.tickets||[]).map(ticket=>({
    role:ticket.role,title:ticket.title,unit_cents:ticket.unit_cents,
    combinations:ticket.combinations,total_cents:ticket.total_cents,
    hit_rate_display:ticket.hit_rate_display,notes:text(ticket.notes,1200),
    legs:(ticket.legs||[]).map(leg=>({race_number:leg.race_number,programs:leg.programs}))
   }))
  }))
 };
}
function publicLongshot(edition){
 if(!edition||!Array.isArray(edition.candidates))return null;
 return {race_date:edition.race_date,candidates:edition.candidates.map(row=>({
  track:text(row.track,100),race_number:row.race_number,post_time_et:text(row.post_time_et,40),
  distance:text(row.distance,80),surface:text(row.surface,50),conditions:text(row.conditions,240),
  race_name:text(row.race_name,240),stakes_name:text(row.stakes_name,240),stakes_grade:text(row.stakes_grade,20),
  is_stakes:row.is_stakes===true,purse:text(row.purse,40),program_number:text(row.program_number,8),
  horse_name:text(row.horse_name,100),original_morning_line:text(row.original_morning_line,20),
  pwin_display:num(row.pwin_display),fair_odds_display:text(row.fair_odds_display,20),
  betting_case:text(row.betting_case,360),
  jockey:text(row.jockey,100),trainer:text(row.trainer,100)
 }))};
}
function publicTarget(edition){
 if(!edition||!Array.isArray(edition.targets))return null;
 const runner=value=>value?({
  program_number:text(value.program_number,4),horse_name:text(value.horse_name,120),
  morning_line:text(value.morning_line,24),win_probability:num(value.win_probability),
  fair_odds:text(value.fair_odds,32),trainer:text(value.trainer,100),jockey:text(value.jockey,100)
 }):null;
 return {race_date:edition.race_date,targets:edition.targets.map(row=>({
  rank:row.rank,track:text(row.track,100),race_number:row.race_number,tier:text(row.tier,16),
  post_time_et:text(row.post_time_et,40),surface:text(row.surface,50),distance:text(row.distance,80),
  conditions:text(row.conditions,200),race_name:text(row.race_name,240),
  stakes_name:text(row.stakes_name,240),stakes_grade:text(row.stakes_grade,20),is_stakes:row.is_stakes===true,purse:text(row.purse,40),
  analysis:text(row.analysis,4000),favorite:runner(row.favorite),attack:runner(row.attack),
  also_live:runner(row.also_live),scratches:Array.isArray(row.scratches)?row.scratches.map(x=>({
   program_number:text(x.program_number,4),horse_name:text(x.horse_name,120)
  })): []
 }))};
}

export async function readProductTabEdition(env,category,raceDate,products=[]){
 if(!PRODUCT_TAB_CATEGORIES.includes(category)||!/^\d{4}-\d{2}-\d{2}$/.test(String(raceDate||'')))return null;
 if(category==='Race Cards'){
  const eligible=(products||[]).filter(p=>p.category==='Race Cards'&&p.race_date===raceDate);
  if(!eligible.length)return null;
  const cards=await readMemberProjectionCards(env,eligible);
  const matching=cards.filter(item=>item.card?.race_date===raceDate&&
   trackCovered(eligible,category,item.card?.track_name)).map(item=>({
   product_id:item.product_id,title:text(item.title,140),track:text(item.track,100),
   race_date:item.race_date,card:publicProjection(item.card)
  }));
  return matching.length?{category,race_date:raceDate,cards:matching}:null;
 }
 if(category==='Pick Tickets'){
  const cards=(await readPublishedPickTicketCards(env,raceDate)).map(publicPick).filter(card=>card&&trackCovered(products,category,card.track));
  return cards.length?{category,race_date:raceDate,cards}:null;
 }
 if(category==='Longshot Radar'){
  const edition=await readLongshotRadarEdition(env,raceDate),safe=publicLongshot(edition);
  if(!safe)return null;
  safe.candidates=safe.candidates.filter(row=>trackCovered(products,category,row.track));
  return safe.candidates.length?{category,race_date:raceDate,...safe}:null;
 }
 const edition=await readTargetListEdition(env,raceDate),safe=publicTarget(edition);
 if(!safe)return null;
 safe.targets=safe.targets.filter(row=>trackCovered(products,category,row.track));
 return safe.targets.length?{category,race_date:raceDate,...safe}:null;
}

export async function hasProductTabData(env,category,raceDate,products=[]){
 try{
  const edition=await readProductTabEdition(env,category,raceDate,products);
  if(!edition)return false;
  if(category==='Race Cards'||category==='Pick Tickets')return Array.isArray(edition.cards)&&edition.cards.length>0;
  if(category==='Longshot Radar')return Array.isArray(edition.candidates)&&edition.candidates.length>0;
  if(category==='Target List')return Array.isArray(edition.targets)&&edition.targets.length>0;
  return false;
 }catch(error){
  console.warn('Product tab readiness check held',category,raceDate,String(error).slice(0,110));
  return false;
 }
}

function normalizedProductTrack(value){
 return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
  .replace(/\b(park|downs|racecourse|racetrack)\b/g,"").replace(/[^a-z0-9]+/g," ").trim();
}
function productTrack(product){
 if(product?.track)return product.track;
 return String(product?.title||"").replace(/\s+[—-]\s+\d{4}-\d{2}-\d{2}.*$/,"");
}
function sameProductTrack(a,b){
 const x=normalizedProductTrack(a),y=normalizedProductTrack(b);
 return !!x&&!!y&&(x===y||x.includes(y)||y.includes(x));
}
export async function readyProductTabProductIds(env,products=[]){
 const ready=new Set(),groups=new Map();
 for(const product of products||[]){
  if(!product?.id||!PRODUCT_TAB_CATEGORIES.includes(product.category)||!/^\d{4}-\d{2}-\d{2}$/.test(String(product.race_date||"")))continue;
  const key=product.category+"|"+product.race_date;
  if(!groups.has(key))groups.set(key,{category:product.category,date:product.race_date,products:[]});
  groups.get(key).products.push(product);
 }
 for(const group of groups.values()){
  let edition;
  try{edition=await readProductTabEdition(env,group.category,group.date,group.products);}
  catch(error){console.warn("Product catalog readiness batch held",group.category,group.date,String(error).slice(0,100));continue;}
  if(!edition)continue;
  if(group.category==="Race Cards"){
   for(const card of edition.cards||[]){
    for(const product of group.products){
     if((product.id&&card.product_id===product.id)||(product.track&&sameProductTrack(card.track,product.track)))ready.add(product.id);
    }
   }
  }else if(group.category==="Pick Tickets"){
   for(const card of edition.cards||[]){
    for(const product of group.products)if(sameProductTrack(card.track,productTrack(product)))ready.add(product.id);
   }
  }else if(group.category==="Longshot Radar"&&edition.candidates?.length){
   for(const product of group.products)ready.add(product.id);
  }else if(group.category==="Target List"&&edition.targets?.length){
   for(const product of group.products)ready.add(product.id);
  }
 }
 return ready;
}

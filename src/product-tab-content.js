import {readMemberProjectionCards,readGPTPublishedProjectionCards} from './projections.js';
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

const TARGET_LIST_PREFIX="racing-intelligence/target-list/";
const LONGSHOT_PRODUCT_PREFIX="racing-intelligence/product-tabs/longshot-radar/";
function inProductWindow(raceDate){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(raceDate||'')))return false;
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York"}).format(new Date());
 const expiry=new Date(raceDate+"T00:00:00Z");
 if(Number.isNaN(expiry.getTime()))return false;
 expiry.setUTCDate(expiry.getUTCDate()+2);
 return today<expiry.toISOString().slice(0,10);
}
function directProduct(category,raceDate,track=""){
 const when=String(raceDate||"");
 const place=String(track||"").trim();
 const title=category==="Race Cards"?place+" — "+when+" Race Card":
  category==="Pick Tickets"?place+" — "+when+" Pick Tickets":
  category==="Longshot Radar"?"Longshot Radar — "+when:"Target List — "+when;
 return {category,race_date:when,track:place,title,
  description:"Digital access to the published "+category+(place?" for "+place:"")+" edition dated "+when+". Open it in the Rail & Rye Racing Intelligence Hub."};
}
/* GPT window pushes are the publication event. Discover only structured,
   source-validated editions in private storage; checkout remains behind the
   existing product/date entitlement and Stripe checks. */
export async function discoverGPTPublishedProducts(env){
 if(!env.CARDS_BUCKET)return [];
 const found=new Map();
 const add=(category,date,track="")=>{
  if(!inProductWindow(date))return;
  const product=directProduct(category,date,track);
  found.set([category,date,product.track.toLowerCase()].join("|"),product);
 };
 try{
  const projections=await readGPTPublishedProjectionCards(env);
  for(const row of projections||[])add("Race Cards",row.race_date,row.track||row.card?.track_name||"");
 }catch(error){console.warn("GPT Race Cards catalog scan held",String(error).slice(0,100));}
 try{
  const targetList=await env.CARDS_BUCKET.list({prefix:TARGET_LIST_PREFIX,limit:1000});
  const targetDates=new Set();
  for(const object of targetList.objects||[]){
   const match=/^racing-intelligence\/target-list\/(\d{4}-\d{2}-\d{2})\/revision-\d{4,5}\.json$/.exec(object.key);
   if(match&&inProductWindow(match[1]))targetDates.add(match[1]);
  }
  for(const date of targetDates){
   try{
    const edition=await readTargetListEdition(env,date);
    if(Array.isArray(edition?.targets)&&edition.targets.length)add("Target List",date);
   }catch(error){console.warn("GPT Target List catalog sync held",date,String(error).slice(0,100));}
  }
 }catch(error){console.warn("GPT Target List catalog scan held",String(error).slice(0,100));}
 try{
  const radar=await env.CARDS_BUCKET.list({prefix:LONGSHOT_PRODUCT_PREFIX,limit:1000});
  for(const object of radar.objects||[]){
   const match=/^racing-intelligence\/product-tabs\/longshot-radar\/(\d{4}-\d{2}-\d{2})\.json$/.exec(object.key);
   if(!match||!inProductWindow(match[1]))continue;
   try{
    const edition=await readLongshotRadarEdition(env,match[1]);
    if(Array.isArray(edition?.candidates)&&edition.candidates.length)add("Longshot Radar",match[1]);
   }catch(error){console.warn("GPT Longshot catalog sync held",match[1],String(error).slice(0,100));}
  }
 }catch(error){console.warn("GPT Longshot catalog scan held",String(error).slice(0,100));}
 try{
  const tickets=await readPublishedPickTicketCards(env);
  for(const card of tickets||[])if(Array.isArray(card.sequences)&&card.sequences.length)add("Pick Tickets",card.date,card.track);
 }catch(error){console.warn("GPT Pick Tickets catalog scan held",String(error).slice(0,100));}
 return [...found.values()];
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

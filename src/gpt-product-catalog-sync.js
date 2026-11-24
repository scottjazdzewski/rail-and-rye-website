import {readPublishedPickTicketCards,publishGPTPickTicketReviews} from "./pick-tickets.js";
import {readLongshotRadarEdition,publishLongshotRadarTab} from "./longshot-radar.js";
import {readTargetListEdition,publishGPTTargetListReviews} from "./target-list.js";
import {hasProductTabData} from "./product-tab-content.js";
import {publishGPTProductCatalogEntry} from "./gpt-product-catalog.js";

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const PICK_PREFIX="racing-intelligence/product-tabs/pick-tickets/";
const RADAR_PREFIX="racing-intelligence/product-tabs/longshot-radar/";
const TARGET_PREFIX="racing-intelligence/target-list/";
const TARGET_GPT_PREFIX="racing-intelligence/product-tabs/target-list/";

async function listKeys(bucket,prefix){
 const keys=[];let cursor;
 do{
  const page=await bucket.list({prefix,limit:1000,...(cursor?{cursor}:{})});
  for(const item of page.objects||[])keys.push(item.key);
  if(keys.length>10000)throw Error("The live edition inventory exceeds the 10,000-object safety limit.");
  cursor=page.truncated?page.cursor:null;
  if(page.truncated&&!cursor)throw Error("The live edition inventory is incomplete.");
 }while(cursor);
 return keys;
}
export async function syncExistingGPTProductCatalog(env,action="sync_existing"){
 if(!env?.STORE_DB||!env?.CARDS_BUCKET)throw Error("Store database or private product storage is not configured.");
 if(action==="publish_gpt_reviews"){
  const published=[],skipped=[];
  const picks=await publishGPTPickTicketReviews(env);
  published.push(...(picks.published||[]).map(item=>({...item,category:"Pick Tickets",race_date:item.race_date||item.date})));
  skipped.push(...(picks.skipped||[]).map(item=>({...item,race_date:item.race_date||item.date})));
  const radarDates=new Set((await listKeys(env.CARDS_BUCKET,"intelligence/longshot-radar/review/")).map(key=>
   /^intelligence\/longshot-radar\/review\/(\d{4}-\d{2}-\d{2})\.json$/.exec(key)?.[1]||null
  ).filter(Boolean));
  for(const race_date of [...radarDates].sort()){
   try{
    const customer=await publishLongshotRadarTab(env,race_date);
    const listing=await publishGPTProductCatalogEntry(env,{category:"Longshot Radar",race_date,track:"",
     title:"Longshot Radar — "+race_date});
    if(!listing?.published)throw Error("The store catalog listing was not created.");
    published.push({category:"Longshot Radar",race_date,revision:customer.revision,product_id:listing.id});
   }catch(error){skipped.push({category:"Longshot Radar",race_date,reason:String(error.message||error).slice(0,180)});}
  }
  const targets=await publishGPTTargetListReviews(env);
  published.push(...(targets.published||[]));
  skipped.push(...(targets.skipped||[]));
  const catalog=await syncExistingGPTProductCatalog(env,"sync_existing");
  const seen=new Set(published.map(item=>item.category+"|"+item.race_date+"|"+String(item.track||"").toLowerCase()));
  for(const item of catalog.synced||[]){
   const key=item.category+"|"+item.race_date+"|"+String(item.track||"").toLowerCase();
   if(!seen.has(key)){seen.add(key);published.push({...item,source:"catalog sync"});}
  }
  return {ok:true,action,published_count:published.length,skipped_count:skipped.length,published,skipped,
   catalog_sync_count:catalog.synced_count||0};
 }
 const synced=[],skipped=[],seen=new Set();
 const add=async(category,race_date,track="")=>{
  const key=category+"|"+race_date+"|"+track.toLowerCase();
  if(seen.has(key))return;
  seen.add(key);
  const product={id:"gpt-catalog-sync",category,race_date,track};
  if(!await hasProductTabData(env,category,race_date,[product])){
   skipped.push({category,race_date,track,reason:"No customer-ready edition was found."});
   return;
  }
  try{
   const listing=await publishGPTProductCatalogEntry(env,{category,race_date,track});
   if(!listing?.published)throw Error("The catalog did not confirm publication.");
   synced.push({category,race_date,track,product_id:listing.id,created:listing.created===true});
  }catch(error){
   skipped.push({category,race_date,track,reason:String(error.message||error).slice(0,160)});
  }
 };
 for(const card of await readPublishedPickTicketCards(env)){
  if(DATE.test(String(card?.date||""))&&typeof card?.track==="string"&&card.track.trim())
   await add("Pick Tickets",card.date,card.track.trim());
 }
 const radarDates=new Set((await listKeys(env.CARDS_BUCKET,RADAR_PREFIX)).map(key=>{
  if(!key.startsWith(RADAR_PREFIX))return null;
  return /^(\d{4}-\d{2}-\d{2})\.json$/.exec(key.slice(RADAR_PREFIX.length))?.[1]||null;
 }).filter(Boolean));
 for(const race_date of [...radarDates].sort()){
  const edition=await readLongshotRadarEdition(env,race_date);
  if(edition?.candidates?.length)await add("Longshot Radar",race_date,"");
 }
 const targetKeys=[...await listKeys(env.CARDS_BUCKET,TARGET_PREFIX),...await listKeys(env.CARDS_BUCKET,TARGET_GPT_PREFIX)];
 const targetDates=new Set(targetKeys.map(key=>
  /^racing-intelligence\/target-list\/(\d{4}-\d{2}-\d{2})\/revision-\d{4,5}\.json$/.exec(key)?.[1]||
  /^racing-intelligence\/product-tabs\/target-list\/(\d{4}-\d{2}-\d{2})\.json$/.exec(key)?.[1]||null
 ).filter(Boolean));
 for(const race_date of [...targetDates].sort()){
  const edition=await readTargetListEdition(env,race_date).catch(()=>null);
  if(edition?.targets?.length)await add("Target List",race_date,"");
 }
 return {ok:true,synced_count:synced.length,skipped_count:skipped.length,synced,skipped};
}

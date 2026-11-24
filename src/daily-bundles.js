import {BUNDLE_KEY} from "./bundles.js";
import {ensureReleaseSchedule,releaseAt3amEastern} from "./publication-schedule.js";
import {PRODUCT_TAB_CATEGORIES,readyProductTabProductIds} from "./product-tab-content.js";

const AUTO_CATEGORIES=["Race Cards","Pick Tickets"];
const ET_DATE_FORMAT=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"});
const ET_CLOCK_FORMAT=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});
const partsFor=(formatter,date)=>Object.fromEntries(formatter.formatToParts(date).map(part=>[part.type,part.value]));
function currentEasternDate(now=new Date()){
  const p=partsFor(ET_DATE_FORMAT,now);
  return p.year+"-"+p.month+"-"+p.day;
}
function dateOffset(value,days){
  const p=validDate(value);
  if(!p)return null;
  const moved=new Date(Date.UTC(p.year,p.month-1,p.day+days));
  return moved.toISOString().slice(0,10);
}
function validDate(value){
  const m=String(value||"").match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if(!m)return null;
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),dt=new Date(Date.UTC(y,mo-1,d));
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d?{year:y,month:mo,day:d}:null;
}
function saleEndsAt3amEastern(raceDate){
  const parsed=validDate(raceDate);
  if(!parsed)return null;
  const following=new Date(Date.UTC(parsed.year,parsed.month-1,parsed.day+1));
  const target=Date.UTC(following.getUTCFullYear(),following.getUTCMonth(),following.getUTCDate(),3,0,0);
  let guess=target+5*60*60*1000;
  for(let i=0;i<4;i++){
    const p=partsFor(ET_CLOCK_FORMAT,new Date(guess));
    const wall=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));
    guess+=target-wall;
  }
  return new Date(guess).toISOString().replace("T"," ").slice(0,19);
}
async function stableBundleId(date,key){
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("rail-rye-daily-bundle|"+key+"|"+date)));
  bytes[6]=(bytes[6]&15)|80;
  bytes[8]=(bytes[8]&63)|128;
  const h=Array.from(bytes.slice(0,16),b=>b.toString(16).padStart(2,"0")).join("");
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20,32);
}
function slugFor(title,id){
  return (title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,65)||"bundle")+"-"+id.slice(0,8);
}
function ordered(items){
  return [...items].sort((a,b)=>String(a.track||a.title||"").localeCompare(String(b.track||b.title||""),"en")||String(a.id).localeCompare(String(b.id)));
}
function trackKey(product){
  const source=String(product.track||product.title||"").split(" — ")[0].split(" - ")[0];
  return source.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g,"");
}
function trackCountFor(byCategory){
  const cards=byCategory.get("Race Cards")||[];
  const tickets=byCategory.get("Pick Tickets")||[];
  const source=cards.length?cards:tickets;
  return new Set(source.map(trackKey).filter(Boolean)).size;
}
function dailyBundlePriceCents(kind,trackCount){
  const tier=trackCount<=6?0:trackCount<=11?1:2;
  return (kind==="universal"?600:400)+tier*100;
}
function bundleDescription(kind,date,trackCount){
  if(kind==="universal")return "One day of access to all published Race Cards, Pick Tickets, Longshot Radar, and Target List editions for "+date+" across "+trackCount+" tracks. Price is tiered by the number of tracks. Access ends at 3:00 AM Eastern the following morning.";
  const noun=kind==="race-cards"?"Race Cards":"Pick Tickets";
  return "All published "+noun+" editions for "+date+" across "+trackCount+" tracks. Price is tiered by the number of tracks. Access ends at 3:00 AM Eastern the following morning.";
}
async function syncOneBundle(env,{date,kind,category,title,items,priceCents,trackCount,releaseAt}){
  const db=env.STORE_DB,children=ordered(items);
  if(children.length<2||children.length>100)return "skipped";
  const expiresAt=saleEndsAt3amEastern(date);
  if(!expiresAt||Date.parse(expiresAt.replace(" ","T")+"Z")<=Date.now())return "skipped";
  let existing=await db.prepare("SELECT p.id,p.title,p.slug,p.category,p.race_date,p.description,p.price_cents,p.status,p.pdf_expires_at,s.release_at FROM products p LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.pdf_key=? AND p.category=? AND p.race_date=? AND p.title=? AND p.status!='archived' ORDER BY p.created_at DESC LIMIT 1")
    .bind(BUNDLE_KEY,category,date,title).first();
  if(!existing){
    const retired=await db.prepare("SELECT id FROM products WHERE pdf_key=? AND category=? AND race_date=? AND title=? AND status='archived' ORDER BY created_at DESC LIMIT 1")
      .bind(BUNDLE_KEY,category,date,title).first();
    if(retired)return "skipped";
    const id=await stableBundleId(date,kind);
    const deterministic=await db.prepare("SELECT p.id,p.title,p.slug,p.category,p.race_date,p.description,p.price_cents,p.status,p.pdf_key,p.pdf_expires_at,s.release_at FROM products p LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.id=?")
      .bind(id).first();
    if(deterministic){
      if(deterministic.pdf_key!==BUNDLE_KEY||deterministic.status==="archived")return "skipped";
      existing=deterministic;
    }else{
      existing=null;
    }
  }
  const id=existing?.id||await stableBundleId(date,kind);
  const currentItems=existing?await db.prepare("SELECT p.id,p.price_cents FROM bundle_items bi JOIN products p ON p.id=bi.product_id WHERE bi.bundle_id=? ORDER BY bi.position").bind(id).all():{results:[]};
  const previous=currentItems.results||[];
  const previousIds=previous.map(item=>item.id);
  const childIds=children.map(item=>item.id);
  const itemsChanged=previousIds.length!==childIds.length||previousIds.some((value,index)=>value!==childIds[index]);
  const finalPrice=priceCents;
  const description=bundleDescription(kind,date,trackCount);
  const slug=existing?.slug||slugFor(title,id);
  const parentChanged=!existing||existing.title!==title||existing.slug!==slug||existing.category!==category||
    existing.race_date!==date||existing.description!==description||existing.price_cents!==finalPrice||
    existing.status!=="published"||existing.pdf_expires_at!==expiresAt||(existing.release_at||null)!==(releaseAt||null);
  const ops=[];
  if(parentChanged){
    ops.push(db.prepare("INSERT INTO products (id,title,slug,category,race_date,track,description,price_cents,pdf_key,status,pdf_expires_at) VALUES (?,?,?,?,?,?,?,?,'__rr_bundle__','published',?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,slug=excluded.slug,category=excluded.category,race_date=excluded.race_date,track=excluded.track,description=excluded.description,price_cents=excluded.price_cents,status='published',pdf_expires_at=excluded.pdf_expires_at WHERE products.pdf_key='__rr_bundle__' AND products.status!='archived'")
      .bind(id,title,slug,category,date,"",description,finalPrice,expiresAt));
  }
  if(releaseAt){
    if((existing?.release_at||null)!==releaseAt)ops.push(db.prepare("INSERT INTO product_release_schedule(product_id,release_at) VALUES (?,?) ON CONFLICT(product_id) DO UPDATE SET release_at=excluded.release_at").bind(id,releaseAt));
  }else if(existing?.release_at)ops.push(db.prepare("DELETE FROM product_release_schedule WHERE product_id=?").bind(id));
  if(itemsChanged){
    ops.push(db.prepare("DELETE FROM bundle_items WHERE bundle_id=?").bind(id));
    children.forEach((child,index)=>ops.push(db.prepare("INSERT INTO bundle_items (bundle_id,product_id,position) VALUES (?,?,?)").bind(id,child.id,index)));
  }
  if(ops.length)await db.batch(ops);
  if(!existing)return "created";
  return ops.length?"updated":"unchanged";
}
export async function ensureUpcomingProductReleaseSchedules(env){
  if(!env?.STORE_DB)return 0;
  await ensureReleaseSchedule(env);
  const today=currentEasternDate(),lastScheduledDate=dateOffset(today,366);
  const result=await env.STORE_DB.prepare("SELECT p.id,p.race_date FROM products p LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.status='published' AND p.category IN ('Race Cards','Pick Tickets','Longshot Radar','Target List') AND p.race_date>=? AND p.race_date<=? AND s.product_id IS NULL ORDER BY p.race_date,p.id LIMIT 1200")
    .bind(today,lastScheduledDate).all();
  const ops=[];
  for(const product of result.results||[]){
    const releaseAt=releaseAt3amEastern(product.race_date);
    if(releaseAt)ops.push(env.STORE_DB.prepare("INSERT OR IGNORE INTO product_release_schedule(product_id,release_at) VALUES (?,?)").bind(product.id,releaseAt));
  }
  for(let i=0;i<ops.length;i+=80)await env.STORE_DB.batch(ops.slice(i,i+80));
  return ops.length;
}
function bundleReleaseAt(date,products){
  const candidates=products.map(item=>item.release_at).filter(value=>value&&Date.parse(String(value).replace(" ","T")+"Z")>Date.now());
  const automatic=releaseAt3amEastern(date);
  if(automatic)candidates.push(automatic);
  return candidates.sort((a,b)=>Date.parse(String(b).replace(" ","T")+"Z")-Date.parse(String(a).replace(" ","T")+"Z"))[0]||null;
}
export async function syncDailyBundles(env){
  if(!env?.STORE_DB)return {skipped:true,created:0,updated:0};
  await ensureUpcomingProductReleaseSchedules(env);
  const today=currentEasternDate(),lastScheduledDate=dateOffset(today,7);
  const result=await env.STORE_DB.prepare("SELECT p.id,p.title,p.category,p.race_date,p.track,p.price_cents,p.pdf_key,p.pdf_expires_at,p.status,s.release_at FROM products p LEFT JOIN product_release_schedule s ON s.product_id=p.id LEFT JOIN bundle_only_assets a ON a.product_id=p.id WHERE p.status='published' AND p.category IN ('Race Cards','Pick Tickets','Longshot Radar','Target List') AND p.race_date>=? AND p.race_date<=? AND p.pdf_expires_at IS NOT NULL AND datetime(p.pdf_expires_at)>CURRENT_TIMESTAMP AND COALESCE(p.pdf_key,'')<>? AND a.product_id IS NULL ORDER BY p.race_date,p.category,COALESCE(p.track,p.title),p.id LIMIT 600")
    .bind(today,lastScheduledDate,BUNDLE_KEY).all();
  const candidates=result.results||[];
  const readyIds=await readyProductTabProductIds(env,candidates);
  const byDate=new Map();
  for(const product of candidates){
    if(!readyIds.has(product.id))continue;
    if(!byDate.has(product.race_date))byDate.set(product.race_date,[]);
    byDate.get(product.race_date).push(product);
  }
  const stats={created:0,updated:0,unchanged:0,skipped:0};
  const record=value=>{stats[value]=(stats[value]||0)+1;};
  for(const [date,products] of byDate){
    const byCategory=new Map();
    for(const product of products){
      if(!byCategory.has(product.category))byCategory.set(product.category,[]);
      byCategory.get(product.category).push(product);
    }
    const trackCount=trackCountFor(byCategory);
    if(trackCount<1){record("skipped");continue;}
    const releaseAt=bundleReleaseAt(date,products);
    for(const category of AUTO_CATEGORIES){
      const items=byCategory.get(category)||[];
      if(items.length<2||items.length>100){if(items.length>100)record("skipped");continue;}
      const kind=category==="Race Cards"?"race-cards":"pick-tickets";
      const bundle=await syncOneBundle(env,{
        date,kind,category,title:category==="Race Cards"?"All Race Cards":"All Pick Tickets",
        items,trackCount,priceCents:dailyBundlePriceCents(kind,trackCount),releaseAt
      });
      record(bundle);
    }
    const hasEveryCategory=PRODUCT_TAB_CATEGORIES.every(category=>(byCategory.get(category)||[]).length>0);
    const allItems=PRODUCT_TAB_CATEGORIES.flatMap(category=>byCategory.get(category)||[]);
    if(hasEveryCategory&&allItems.length>=2&&allItems.length<=100){
      const bundle=await syncOneBundle(env,{
        date,kind:"universal",category:"Race Cards",title:"Universal Access",items:allItems,trackCount,
        priceCents:dailyBundlePriceCents("universal",trackCount),releaseAt
      });
      record(bundle);
    }else if(allItems.length>100){
      record("skipped");
    }
  }
  return stats;
}

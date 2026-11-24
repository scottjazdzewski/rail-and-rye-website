import {ensureReleaseSchedule,ensureRacePdfExpirySchema,pdfExpiryFromRaceDate,racePdfExpired,releaseAt3amEastern} from "./publication-schedule.js";

const enc=new TextEncoder();
const BUNDLE_KEY="__rr_bundle__";
const CATEGORIES=new Set(["Race Cards","Pick Tickets","Longshot Radar","Target List"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEAD={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const out=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const bad=(message,status=400)=>out({error:message},status);
const validPrice=value=>Number.isSafeInteger(value)&&value>=50&&value<=500000;
const DEFAULT_GPT_PRICES={"Race Cards":200,"Pick Tickets":200,"Longshot Radar":100,"Target List":100};
async function ensureGPTPriceDefaults(env){
 const db=env.STORE_DB;
 await db.prepare("CREATE TABLE IF NOT EXISTS gpt_product_price_defaults (category TEXT PRIMARY KEY CHECK(category IN ('Race Cards','Pick Tickets','Longshot Radar','Target List')),price_cents INTEGER NOT NULL CHECK(price_cents BETWEEN 50 AND 500000),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 await db.batch(Object.entries(DEFAULT_GPT_PRICES).map(([category,price])=>
  db.prepare("INSERT OR IGNORE INTO gpt_product_price_defaults(category,price_cents) VALUES (?,?)").bind(category,price)));
}
async function readGPTPriceDefaults(env){
 await ensureGPTPriceDefaults(env);
 const result=await env.STORE_DB.prepare("SELECT category,price_cents FROM gpt_product_price_defaults").all();
 const prices={...DEFAULT_GPT_PRICES};
 for(const row of result.results||[])if(Object.prototype.hasOwnProperty.call(DEFAULT_GPT_PRICES,row.category)&&validPrice(row.price_cents))prices[row.category]=row.price_cents;
 return prices;
}
function sameOrigin(request){const u=new URL(request.url);return request.headers.get("origin")===u.origin&&request.headers.get("sec-fetch-site")!=="cross-site";}
function slug(title,id){
 return (String(title||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"publication")+"-"+id.slice(0,8);
}
async function directId(category,raceDate,track){
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(
  "rr-gpt-product-v1|"+category+"|"+raceDate+"|"+String(track||"").trim().toLowerCase())));
 const parts=Array.from(digest.slice(0,16),value=>value.toString(16).padStart(2,"0"));
 parts[6]=(parseInt(parts[6],16)&15|80).toString(16).padStart(2,"0");
 parts[8]=(parseInt(parts[8],16)&63|128).toString(16).padStart(2,"0");
 const hex=parts.join("");
 return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
}
function titleFor(category,raceDate,track){
 if(category==="Race Cards")return (track||"Race Cards")+" — "+raceDate+" Race Card";
 if(category==="Pick Tickets")return (track||"Pick Tickets")+" — "+raceDate+" Pick Tickets";
 if(category==="Longshot Radar")return "Longshot Radar — "+raceDate;
 return "Target List — "+raceDate;
}

/* A successful authenticated GPT push creates its dated, purchasable catalog row.
   The caller writes and validates customer-approved R2 content first. */
export async function publishGPTProductCatalogEntry(env,entry){
 if(!env?.STORE_DB)return {id:null,published:false,reason:"Store catalog is not configured."};
 const category=String(entry?.category||"");
 const raceDate=String(entry?.race_date||"");
 const track=String(entry?.track||"").trim().slice(0,100);
 if(!CATEGORIES.has(category)||!/^\d{4}-\d{2}-\d{2}$/.test(raceDate))
  throw Error("A supported product category and racing date are required.");
 const expiry=pdfExpiryFromRaceDate(raceDate);
 if(!expiry||racePdfExpired(expiry))throw Error("This racing date is outside the live product window.");
 const suppliedPrice=entry?.price_cents;
 if(suppliedPrice!==undefined&&!validPrice(suppliedPrice))throw Error("Price must be between $0.50 and $5,000.");
 await ensureReleaseSchedule(env);
 await ensureRacePdfExpirySchema(env);
 const defaults=await readGPTPriceDefaults(env);
 const defaultPrice=defaults[category];
 const price=suppliedPrice===undefined?defaultPrice:suppliedPrice;
 const title=String(entry?.title||titleFor(category,raceDate,track)).trim().slice(0,140);
 const description=String(entry?.description||"Digital access to the published "+category+(track?" for "+track:"")+" edition dated "+raceDate+". Open it in the Rail & Rye Racing Intelligence Hub.").slice(0,4000);
 const existing=await env.STORE_DB.prepare("SELECT p.id,p.status,p.pdf_key,s.release_at FROM products p LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.category=? AND p.race_date=? AND LOWER(COALESCE(TRIM(p.track),''))=? AND (p.pdf_key IS NULL OR p.pdf_key<>?) AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=p.id) AND p.status<>'archived' ORDER BY CASE WHEN p.status='published' THEN 0 ELSE 1 END,p.created_at DESC LIMIT 1")
   .bind(category,raceDate,track.toLowerCase(),BUNDLE_KEY).first();
 const existingRelease=existing?.release_at||null;
 const existingReleaseIsFuture=existingRelease&&Date.parse(existingRelease.replace(" ","T")+"Z")>Date.now();
 const releaseAt=existingReleaseIsFuture?existingRelease:releaseAt3amEastern(raceDate);
 if(releaseAt&&Date.parse(releaseAt.replace(" ","T")+"Z")>Date.now()+366*86400*1000)
  throw Error("The racing date is beyond the one-year publication window.");
 const scheduleOperation=id=>releaseAt
  ?env.STORE_DB.prepare("INSERT INTO product_release_schedule(product_id,release_at) VALUES (?,?) ON CONFLICT(product_id) DO UPDATE SET release_at=excluded.release_at").bind(id,releaseAt)
  :env.STORE_DB.prepare("DELETE FROM product_release_schedule WHERE product_id=?").bind(id);
 if(existing?.status==="published"){
  const update=suppliedPrice===undefined
   ?env.STORE_DB.prepare("UPDATE products SET pdf_expires_at=? WHERE id=? AND status='published'").bind(expiry,existing.id)
   :env.STORE_DB.prepare("UPDATE products SET price_cents=?,pdf_expires_at=? WHERE id=? AND status='published'").bind(price,expiry,existing.id);
  await env.STORE_DB.batch([update,scheduleOperation(existing.id)]);
  return {id:existing.id,title,created:false,published:true,release_at:releaseAt};
 }
 if(existing&&existing.pdf_key!==null&&existing.pdf_key!==""){
  // Keep dormant PDF-backed desk rows separate from tab-only GPT products.
 }else if(existing){
  const update=suppliedPrice===undefined
   ?env.STORE_DB.prepare("UPDATE products SET status='published',pdf_expires_at=? WHERE id=? AND status<>'archived'").bind(expiry,existing.id)
   :env.STORE_DB.prepare("UPDATE products SET status='published',price_cents=?,pdf_expires_at=? WHERE id=? AND status<>'archived'").bind(price,expiry,existing.id);
  await env.STORE_DB.batch([update,scheduleOperation(existing.id)]);
  return {id:existing.id,title,published:true,created:false,release_at:releaseAt};
 }
 let id=await directId(category,raceDate,track);
 const occupied=await env.STORE_DB.prepare("SELECT id FROM products WHERE id=?").bind(id).first();
 if(occupied)id=crypto.randomUUID();
 const ops=[env.STORE_DB.prepare("INSERT INTO products (id,title,slug,category,race_date,track,description,price_cents,pdf_key,image_url,status,pdf_expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
   .bind(id,title,slug(title,id),category,raceDate,track,description,price,null,null,"published",expiry)];
 if(releaseAt)ops.push(scheduleOperation(id));
 await env.STORE_DB.batch(ops);
 return {id,title,created:true,published:true,release_at:releaseAt};
}

/* GPT-only catalog control. Prices are explicit; bundle membership is a
   validated set of existing product IDs passed to the existing bundle service. */
export async function handleAdminGPTProductCatalog(request,env,bundleHandler,syncHandler){
 if(!env?.STORE_DB)return bad("Store catalog is unavailable.",503);
 if(request.method==="GET"){
  try{return out({default_prices:await readGPTPriceDefaults(env)});}
  catch(error){console.error("GPT price defaults read failed",String(error).slice(0,120));return bad("Could not load GPT price defaults.",503);}
 }
 if(request.method!=="POST")return bad("Method not allowed",405);
 if(!sameOrigin(request))return bad("Same-origin request required",403);
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return bad("Expected JSON",400);
 if(Number(request.headers.get("content-length")||0)>12000)return bad("Request too large",413);
 const raw=await request.text();
 if(raw.length>12000)return bad("Request too large",413);
 let body;try{body=JSON.parse(raw);}catch{return bad("Invalid JSON",400);}
 if(body?.action==="default_prices"){
  const supplied=body.prices_cents;
  if(!supplied||typeof supplied!=="object"||Array.isArray(supplied)||
    Object.keys(DEFAULT_GPT_PRICES).some(category=>!validPrice(supplied[category])))
   return bad("Set a valid price for Race Cards, Pick Tickets, Longshot Radar and Target List.");
  try{
   await ensureGPTPriceDefaults(env);
   const entries=Object.entries(DEFAULT_GPT_PRICES);
   const ops=entries.map(([category])=>env.STORE_DB.prepare(
    "INSERT INTO gpt_product_price_defaults(category,price_cents,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(category) DO UPDATE SET price_cents=excluded.price_cents,updated_at=CURRENT_TIMESTAMP"
   ).bind(category,supplied[category]));
   for(const [category] of entries)ops.push(env.STORE_DB.prepare(
    "UPDATE products SET price_cents=? WHERE category=? AND status='published' AND pdf_key IS NULL AND pdf_expires_at IS NOT NULL AND datetime(pdf_expires_at)>CURRENT_TIMESTAMP"
   ).bind(supplied[category],category));
   const results=await env.STORE_DB.batch(ops);
   const updated_count=results.slice(entries.length).reduce((sum,result)=>sum+Number(result?.meta?.changes??result?.changes??0),0);
   return out({ok:true,default_prices:supplied,updated_count});
  }catch(error){console.error("GPT price defaults save failed",String(error).slice(0,140));return bad("Could not save GPT product price defaults.",503);}
 }
 if(body?.action==="sync_existing"||body?.action==="publish_gpt_reviews"){
  if(typeof syncHandler!=="function")return bad("Catalog synchronization is unavailable.",503);
  try{return out(await syncHandler(env,body.action));}
  catch(error){console.error("GPT catalog publication failed",String(error).slice(0,140));return bad("Could not publish the staged GPT editions.",503);}
 }
 if(body?.action==="price"){
  const id=String(body.product_id||"");
  const price=body.price_cents;
  if(!UUID.test(id))return bad("Choose a valid product ID.");
  if(!validPrice(price))return bad("Price must be between $0.50 and $5,000.");
  const product=await env.STORE_DB.prepare("SELECT id,status,category,pdf_key FROM products WHERE id=? AND category<>'Stable Notes'").bind(id).first();
  if(!product||product.status==="archived")return bad("Product not found or archived.",404);
  if(product.pdf_key===BUNDLE_KEY&&price<50)return bad("Bundles must cost at least $0.50.");
  await env.STORE_DB.prepare("UPDATE products SET price_cents=? WHERE id=? AND status<>'archived'").bind(price,id).run();
  return out({ok:true,product_id:id,price_cents:price});
 }
 if(body?.action!=="bundle")return bad("Use action 'price' or 'bundle'.");
 if(typeof bundleHandler!=="function")return bad("Bundle service unavailable.",503);
 const bundleId=body.bundle_id==null?null:String(body.bundle_id);
 if(bundleId&&!UUID.test(bundleId))return bad("Invalid bundle ID.");
 let current=null,releaseAt=null,currentIds=[];
 if(bundleId){
  await ensureReleaseSchedule(env);
  current=await env.STORE_DB.prepare("SELECT p.id,p.title,p.description,p.category,p.race_date,p.price_cents,p.status,s.release_at FROM products p LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.id=? AND p.pdf_key=?").bind(bundleId,BUNDLE_KEY).first();
  if(!current)return bad("Bundle not found.",404);
  releaseAt=current.release_at||null;
  const items=await env.STORE_DB.prepare("SELECT product_id FROM bundle_items WHERE bundle_id=? ORDER BY position").bind(bundleId).all();
  currentIds=(items.results||[]).map(item=>item.product_id);
 }
 let productIds;
 if(Array.isArray(body.product_ids))productIds=body.product_ids;
 else if(current){
  const add=body.add_product_ids===undefined?[]:body.add_product_ids;
  const remove=body.remove_product_ids===undefined?[]:body.remove_product_ids;
  if(!Array.isArray(add)||!Array.isArray(remove))return bad("Track additions and removals must be product ID lists.");
  if([...add,...remove].some(id=>typeof id!=="string"||!UUID.test(id)))return bad("Track changes must use valid product IDs.");
  const removed=new Set(remove);
  productIds=[...currentIds.filter(id=>!removed.has(id)),...add.filter(id=>!currentIds.includes(id))];
 }else return bad("Select the product IDs to include in this bundle.");
 if(!Array.isArray(productIds)||productIds.length<2||productIds.length>24||productIds.some(id=>typeof id!=="string"||!UUID.test(id))||new Set(productIds).size!==productIds.length)
  return bad("Select 2–24 different racing tabs.");
 const title=String(body.title??current?.title??"Universal Access").trim();
 const description=String(body.description??current?.description??"Unlock the selected racing intelligence tabs for the chosen date.").trim();
 const category=String(body.category??current?.category??"");
 const raceDate=String(body.race_date??current?.race_date??"");
 const price=body.price_cents===undefined?current?.price_cents:body.price_cents;
 const status=String(body.status??current?.status??"published");
 if(title.length<3||title.length>140)return bad("Bundle title must contain 3–140 characters.");
 if(description.length>4000)return bad("Bundle description is too long.");
 if(!CATEGORIES.has(category))return bad("Choose a supported racing product category.");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raceDate))return bad("Bundle date must use YYYY-MM-DD.");
 if(!Number.isSafeInteger(price)||price<50||price>500000)return bad("Set an explicit bundle price of at least $0.50, up to $5,000.");
 if(!["draft","published","archived"].includes(status))return bad("Invalid bundle status.");
 const payload={title,description,category,race_date:raceDate,price_cents:price,status,product_ids:productIds};
 if(!bundleId&&body.id!==undefined)payload.id=body.id;
 if(body.release_at!==undefined)payload.release_at=body.release_at;
 else if(current&&releaseAt)payload.release_at=releaseAt;
 const headers=new Headers(request.headers);headers.delete("content-length");headers.set("content-type","application/json");
 const method=bundleId?"PATCH":"POST";
 const path=bundleId?"/api/admin/bundles/"+bundleId:"/api/admin/bundles";
 const bundleRequest=new Request(request.url,{method,headers,body:JSON.stringify(payload)});
 return bundleHandler(bundleRequest,path);
}

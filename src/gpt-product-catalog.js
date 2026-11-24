import {ensureReleaseSchedule,ensureRacePdfExpirySchema,pdfExpiryFromRaceDate,racePdfExpired} from "./publication-schedule.js";

const enc=new TextEncoder();
const BUNDLE_KEY="__rr_bundle__";
const CATEGORIES=new Set(["Race Cards","Pick Tickets","Longshot Radar","Target List"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEAD={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const out=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const bad=(message,status=400)=>out({error:message},status);
const validPrice=value=>Number.isSafeInteger(value)&&value>=50&&value<=500000;
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
 const override=Number(env.RR_GPT_PRODUCT_PRICE_CENTS);
 const defaultPrice=Number.isSafeInteger(override)&&validPrice(override)?override:999;
 const price=suppliedPrice===undefined?defaultPrice:suppliedPrice;
 const title=String(entry?.title||titleFor(category,raceDate,track)).trim().slice(0,140);
 const description=String(entry?.description||"Digital access to the published "+category+(track?" for "+track:"")+" edition dated "+raceDate+". Open it in the Rail & Rye Racing Intelligence Hub.").slice(0,4000);
 const existing=await env.STORE_DB.prepare("SELECT id,status,pdf_key FROM products WHERE category=? AND race_date=? AND LOWER(COALESCE(TRIM(track),''))=? AND (pdf_key IS NULL OR pdf_key<>?) AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=products.id) AND status<>'archived' ORDER BY CASE WHEN status='published' THEN 0 ELSE 1 END,created_at DESC LIMIT 1")
   .bind(category,raceDate,track.toLowerCase(),BUNDLE_KEY).first();
 if(existing?.status==="published"){
  await env.STORE_DB.prepare("DELETE FROM product_release_schedule WHERE product_id=?").bind(existing.id).run();
  if(suppliedPrice===undefined){
   await env.STORE_DB.prepare("UPDATE products SET pdf_expires_at=? WHERE id=? AND status='published'").bind(expiry,existing.id).run();
  }else{
   await env.STORE_DB.prepare("UPDATE products SET price_cents=?,pdf_expires_at=? WHERE id=? AND status='published'").bind(price,expiry,existing.id).run();
  }
  return {id:existing.id,title,created:false,published:true};
 }
 if(existing&&existing.pdf_key!==null&&existing.pdf_key!==""){
  // Keep dormant PDF-backed desk rows separate from tab-only GPT products.
 }else if(existing){
  await env.STORE_DB.prepare("DELETE FROM product_release_schedule WHERE product_id=?").bind(existing.id).run();
  if(suppliedPrice===undefined){
   await env.STORE_DB.prepare("UPDATE products SET status='published',pdf_expires_at=? WHERE id=? AND status<>'archived'").bind(expiry,existing.id).run();
  }else{
   await env.STORE_DB.prepare("UPDATE products SET status='published',price_cents=?,pdf_expires_at=? WHERE id=? AND status<>'archived'").bind(price,expiry,existing.id).run();
  }
  return {id:existing.id,title,published:true,created:false};
 }
 let id=await directId(category,raceDate,track);
 const occupied=await env.STORE_DB.prepare("SELECT id FROM products WHERE id=?").bind(id).first();
 if(occupied)id=crypto.randomUUID();
 await env.STORE_DB.prepare("INSERT INTO products (id,title,slug,category,race_date,track,description,price_cents,pdf_key,image_url,status,pdf_expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
   .bind(id,title,slug(title,id),category,raceDate,track,description,price,null,null,"published",expiry).run();
 return {id,title,created:true,published:true};
}

/* GPT-only catalog control. Prices are explicit; bundle membership is a
   validated set of existing product IDs passed to the existing bundle service. */
export async function handleAdminGPTProductCatalog(request,env,bundleHandler,syncHandler){
 if(!env?.STORE_DB)return bad("Store catalog is unavailable.",503);
 if(request.method!=="POST")return bad("Method not allowed",405);
 if(!sameOrigin(request))return bad("Same-origin request required",403);
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return bad("Expected JSON",400);
 if(Number(request.headers.get("content-length")||0)>12000)return bad("Request too large",413);
 const raw=await request.text();
 if(raw.length>12000)return bad("Request too large",413);
 let body;try{body=JSON.parse(raw);}catch{return bad("Invalid JSON",400);}
 if(body?.action==="sync_existing"){
  if(typeof syncHandler!=="function")return bad("Catalog synchronization is unavailable.",503);
  try{return out(await syncHandler(env));}
  catch(error){console.error("GPT catalog sync failed",String(error).slice(0,140));return bad("Could not sync existing live GPT editions.",503);}
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
 if(body.release_at!==undefined)payload.release_at=body.release_at;
 else if(current&&releaseAt)payload.release_at=releaseAt;
 const headers=new Headers(request.headers);headers.delete("content-length");headers.set("content-type","application/json");
 const method=bundleId?"PATCH":"POST";
 const path=bundleId?"/api/admin/bundles/"+bundleId:"/api/admin/bundles";
 const bundleRequest=new Request(request.url,{method,headers,body:JSON.stringify(payload)});
 return bundleHandler(bundleRequest,path);
}

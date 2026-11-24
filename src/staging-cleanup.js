import {ensureReleaseSchedule} from "./publication-schedule.js";

const BUNDLE_KEY="__rr_bundle__";
const RACING_CATEGORIES=["Race Cards","Pick Tickets","Longshot Radar","Target List"];
const MAX_BATCH=50;

function cleanLimit(value,fallback){
 const n=Number(value);
 return Number.isInteger(n)?Math.max(1,Math.min(MAX_BATCH,n)):fallback;
}

async function hasLiveDependency(env,id){
 const [bundle,order]=await Promise.all([
  env.STORE_DB.prepare("SELECT b.id FROM bundle_items bi JOIN products b ON b.id=bi.bundle_id WHERE bi.product_id=? AND b.pdf_key=? AND (b.status='draft' OR (b.status='published' AND (b.pdf_expires_at IS NULL OR datetime(b.pdf_expires_at)>CURRENT_TIMESTAMP))) LIMIT 1")
   .bind(id,BUNDLE_KEY).first(),
  env.STORE_DB.prepare("SELECT o.id FROM orders o LEFT JOIN bundle_order_items bi ON bi.order_id=o.id AND bi.product_id=? JOIN products p ON p.id=? WHERE (o.product_id=p.id OR bi.product_id=p.id) AND ((o.status='paid' AND datetime(o.paid_at,'+'||o.access_days||' days')>CURRENT_TIMESTAMP AND COALESCE(bi.pdf_expires_at,o.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP) OR (o.status IN ('initiated','pending') AND datetime(o.created_at)>=datetime('now','-2 days'))) LIMIT 1")
   .bind(id,id).first()
 ]);
 return !!(bundle||order);
}

async function listPdfKeys(env,id){
 const prefix="cards/"+id+"/",keys=[];
 let cursor,round=0;
 do{
  if(++round>10)throw Error("Too many versions for automatic staging cleanup.");
  const page=await env.CARDS_BUCKET.list({prefix,limit:500,...(cursor?{cursor}:{})});
  for(const item of page.objects||[]){
   if(!item.key.startsWith(prefix))throw Error("Unexpected storage key; automatic staging cleanup stopped.");
   keys.push(item.key);
  }
  if(page.truncated&&!page.cursor)throw Error("Incomplete storage listing; automatic staging cleanup stopped.");
  cursor=page.truncated?page.cursor:null;
 }while(cursor);
 return keys;
}

async function purgePrivateDrafts(env,limit){
 const rows=await env.STORE_DB.prepare(
  "SELECT p.id,p.status,p.pdf_key,a.created_at AS staged_at FROM products p JOIN bundle_only_assets a ON a.product_id=p.id LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE a.purged_at IS NULL AND p.status IN ('draft','archived') AND a.created_at<=datetime('now','-2 days') AND (p.race_date IS NULL OR (p.pdf_expires_at IS NOT NULL AND datetime(p.pdf_expires_at)<=CURRENT_TIMESTAMP)) AND (s.release_at IS NULL OR s.release_at<=CURRENT_TIMESTAMP) ORDER BY a.created_at ASC,p.id ASC LIMIT ?"
 ).bind(limit).all();
 let purged=0;
 for(const row of rows.results||[]){
  const current=await env.STORE_DB.prepare(
   "SELECT p.status,p.pdf_key,a.purged_at,a.created_at FROM products p JOIN bundle_only_assets a ON a.product_id=p.id LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.id=? AND a.purged_at IS NULL AND p.status IN ('draft','archived') AND a.created_at<=datetime('now','-2 days') AND (p.race_date IS NULL OR (p.pdf_expires_at IS NOT NULL AND datetime(p.pdf_expires_at)<=CURRENT_TIMESTAMP)) AND (s.release_at IS NULL OR s.release_at<=CURRENT_TIMESTAMP)"
  ).bind(row.id).first();
  if(!current||await hasLiveDependency(env,row.id))continue;
  const prefix="cards/"+row.id+"/";
  if(current.pdf_key&&!current.pdf_key.startsWith(prefix)){
   console.warn("Staging cleanup skipped unexpected PDF key",row.id);
   continue;
  }
  let keys;
  try{keys=await listPdfKeys(env,row.id);}
  catch(error){console.warn("Staging PDF listing deferred",row.id,String(error).slice(0,120));continue;}
  try{
   for(let i=0;i<keys.length;i+=500)await env.CARDS_BUCKET.delete(keys.slice(i,i+500));
   await env.CARDS_BUCKET.delete("covers/"+row.id).catch(()=>{});
  }catch(error){
   console.warn("Staging PDF deletion deferred",row.id,String(error).slice(0,120));
   continue;
  }
  await env.STORE_DB.batch([
   env.STORE_DB.prepare("UPDATE products SET pdf_key=NULL,status='archived' WHERE id=? AND status IN ('draft','archived')").bind(row.id),
   env.STORE_DB.prepare("UPDATE bundle_only_assets SET purged_at=COALESCE(purged_at,CURRENT_TIMESTAMP) WHERE product_id=?").bind(row.id),
   env.STORE_DB.prepare("DELETE FROM product_release_schedule WHERE product_id=? AND release_at<=CURRENT_TIMESTAMP").bind(row.id)
  ]);
  purged++;
 }
 return purged;
}

async function purgeIndividualDrafts(env,limit){
 const rows=await env.STORE_DB.prepare(
  "SELECT p.id,p.pdf_key FROM products p LEFT JOIN bundle_only_assets a ON a.product_id=p.id LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE a.product_id IS NULL AND p.status='draft' AND p.pdf_key IS NOT NULL AND p.pdf_key<>? AND COALESCE(p.pdf_uploaded_at,p.created_at)<=datetime('now','-2 days') AND (p.race_date IS NULL OR (p.pdf_expires_at IS NOT NULL AND datetime(p.pdf_expires_at)<=CURRENT_TIMESTAMP)) AND (s.release_at IS NULL OR s.release_at<=CURRENT_TIMESTAMP) ORDER BY COALESCE(p.pdf_uploaded_at,p.created_at) ASC,p.id ASC LIMIT ?"
 ).bind(BUNDLE_KEY,limit).all();
 let purged=0;
 for(const row of rows.results||[]){
  const current=await env.STORE_DB.prepare(
   "SELECT p.pdf_key FROM products p LEFT JOIN bundle_only_assets a ON a.product_id=p.id LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.id=? AND a.product_id IS NULL AND p.status='draft' AND p.pdf_key IS NOT NULL AND p.pdf_key<>? AND COALESCE(p.pdf_uploaded_at,p.created_at)<=datetime('now','-2 days') AND (p.race_date IS NULL OR (p.pdf_expires_at IS NOT NULL AND datetime(p.pdf_expires_at)<=CURRENT_TIMESTAMP)) AND (s.release_at IS NULL OR s.release_at<=CURRENT_TIMESTAMP)"
  ).bind(row.id,BUNDLE_KEY).first();
  if(!current||await hasLiveDependency(env,row.id))continue;
  const prefix="cards/"+row.id+"/";
  if(!current.pdf_key.startsWith(prefix)){
   console.warn("Staging cleanup skipped unexpected individual PDF key",row.id);
   continue;
  }
  let keys;
  try{keys=await listPdfKeys(env,row.id);}
  catch(error){console.warn("Staging PDF listing deferred",row.id,String(error).slice(0,120));continue;}
  try{
   for(let i=0;i<keys.length;i+=500)await env.CARDS_BUCKET.delete(keys.slice(i,i+500));
   await env.CARDS_BUCKET.delete("covers/"+row.id).catch(()=>{});
  }catch(error){
   console.warn("Staging PDF deletion deferred",row.id,String(error).slice(0,120));
   continue;
  }
  await env.STORE_DB.batch([
   env.STORE_DB.prepare("UPDATE products SET pdf_key=NULL,status='archived' WHERE id=? AND status='draft' AND pdf_key=?").bind(row.id,current.pdf_key),
   env.STORE_DB.prepare("DELETE FROM product_release_schedule WHERE product_id=? AND release_at<=CURRENT_TIMESTAMP").bind(row.id)
  ]);
  purged++;
 }
 return purged;
}

async function archiveExpiredCatalogRows(env,limit){
 const rows=await env.STORE_DB.prepare(
  "SELECT p.id FROM products p LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.category IN ('Race Cards','Pick Tickets','Longshot Radar','Target List') AND p.status IN ('draft','published') AND p.pdf_key IS NULL AND p.race_date IS NOT NULL AND p.created_at<=datetime('now','-2 days') AND p.pdf_expires_at IS NOT NULL AND datetime(p.pdf_expires_at)<=CURRENT_TIMESTAMP AND (s.release_at IS NULL OR s.release_at<=CURRENT_TIMESTAMP) AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=p.id) ORDER BY p.created_at ASC,p.id ASC LIMIT ?"
 ).bind(limit).all();
 let archived=0;
 for(const row of rows.results||[]){
  if(await hasLiveDependency(env,row.id))continue;
  const result=await env.STORE_DB.prepare(
   "UPDATE products SET status='archived' WHERE id=? AND category IN ('Race Cards','Pick Tickets','Longshot Radar','Target List') AND status IN ('draft','published') AND pdf_key IS NULL AND pdf_expires_at IS NOT NULL AND datetime(pdf_expires_at)<=CURRENT_TIMESTAMP AND created_at<=datetime('now','-2 days')"
  ).bind(row.id).run();
  if(result.meta?.changes){
   await env.STORE_DB.prepare("DELETE FROM product_release_schedule WHERE product_id=? AND release_at<=CURRENT_TIMESTAMP").bind(row.id).run();
   archived++;
  }
 }
 return archived;
}

export async function purgeStaleRacingStaging(env,limit=24){
 if(!env?.STORE_DB||!env?.CARDS_BUCKET)return {catalog_archived:0,private_pdfs_purged:0};
 await ensureReleaseSchedule(env);
 const pageLimit=cleanLimit(limit,24);
 const catalog_archived=await archiveExpiredCatalogRows(env,pageLimit);
 const private_pdfs_purged=await purgePrivateDrafts(env,pageLimit)+await purgeIndividualDrafts(env,pageLimit);
 return {catalog_archived,private_pdfs_purged};
}

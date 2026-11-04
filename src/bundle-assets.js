/* Private PDF repository. Files live in R2 via the protected admin upload;
   drafts stay out of public products and checkout until the owner publishes. */
import {ensureReleaseSchedule,pdfExpiryFromRaceDate} from './publication-schedule.js';
const CATEGORIES=new Set(['Race Cards','Longshot Radar','Stable Notes','Target List']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEAD={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const fail=(error,status=400)=>json({error},status);
function originOk(request){
  const origin=new URL(request.url).origin;
  return request.headers.get('origin')===origin&&request.headers.get('sec-fetch-site')!=='cross-site';
}
function parseDate(v){
  if(v==null||v==='')return null;
  if(typeof v!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v))throw Error('Invalid racing date');
  const d=new Date(v+'T00:00:00Z');
  if(Number.isNaN(+d)||d.toISOString().slice(0,10)!==v)throw Error('Invalid racing date');
  return v;
}
async function readMeta(request){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error('Expected JSON');
  if(Number(request.headers.get('content-length')||0)>10000)throw Error('Request too large');
  const raw=await request.text();
  if(raw.length>10000)throw Error('Request too large');
  let p;try{p=JSON.parse(raw);}catch{throw Error('Invalid JSON');}
  if(!p||Array.isArray(p)||typeof p!=='object')throw Error('Invalid PDF metadata');
  const id=p.id==null||p.id===''?null:String(p.id);
  if(id&&!UUID.test(id))throw Error('Invalid private PDF request ID');
  const title=String(p.title||'').trim(), category=String(p.category||'').trim();
  const race_date=parseDate(p.race_date);
  const pdf_expires_at=race_date?pdfExpiryFromRaceDate(race_date):null;
  if(race_date&&!pdf_expires_at)throw Error('Invalid racing date');
  const track=String(p.track||'').trim();
  if(title.length<3||title.length>140)throw Error('PDF name must contain 3–140 characters');
  if(category&&!CATEGORIES.has(category))throw Error('Invalid collection');
  if(track.length>100)throw Error('Racetrack name too long');
  return {id,title,category,race_date,track,pdf_expires_at};
}
export async function handleAdminBundleAssets(request,env,path){
  if(!env.STORE_DB||!env.CARDS_BUCKET)return fail('Database or private storage unavailable',503);
  if(!['GET','POST','PATCH','DELETE'].includes(request.method))return fail('Method not allowed',405);
  await ensureReleaseSchedule(env);
  if(request.method!=='GET'&&!originOk(request))return fail('Same-origin request required',403);
  if(path==='/api/admin/bundle-assets'&&request.method==='GET'){
    const rows=await env.STORE_DB.prepare(
      `SELECT p.id,p.title,p.category,p.race_date,p.track,p.pdf_expires_at,p.status,a.created_at AS uploaded_at,
         CASE WHEN p.pdf_key IS NOT NULL THEN 1 ELSE 0 END AS has_pdf
       FROM products p JOIN bundle_only_assets a ON a.product_id=p.id
       WHERE a.purged_at IS NULL
       ORDER BY a.created_at DESC,p.id DESC LIMIT 250`).all();
    return json({assets:rows.results||[]});
  }
  if(path==='/api/admin/bundle-assets'&&request.method==='POST'){
    let p;try{p=await readMeta(request);}catch(e){return fail(e.message);}
    const id=p.id||crypto.randomUUID();
    const existing=await env.STORE_DB.prepare(
      'SELECT p.status,p.pdf_key,a.product_id AS asset_id,a.purged_at FROM products p LEFT JOIN bundle_only_assets a ON a.product_id=p.id WHERE p.id=?'
    ).bind(id).first();
    if(existing){
      if(!existing.asset_id)return fail('This request ID is already in use',409);
      if(existing.purged_at)return fail('This private PDF was already deleted',410);
      if(existing.status!=='draft')return fail('Archived PDFs cannot be reused',409);
      await env.STORE_DB.prepare(
        'UPDATE products SET title=?,category=?,race_date=?,track=?,pdf_expires_at=? WHERE id=? AND status=\'draft\''
      ).bind(p.title,p.category,p.race_date,p.track,p.pdf_expires_at,id).run();
      return json({id,created:false,has_pdf:!!existing.pdf_key});
    }
    await env.STORE_DB.batch([
      env.STORE_DB.prepare(
        'INSERT INTO products (id,title,slug,category,race_date,track,description,price_cents,pdf_key,image_url,status,pdf_expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(id,p.title,'bundle-private-'+id,p.category,p.race_date,p.track,'',0,null,null,'draft',p.pdf_expires_at),
      env.STORE_DB.prepare('INSERT INTO bundle_only_assets (product_id) VALUES (?)').bind(id)
    ]);
    return json({id,created:true,has_pdf:false},201);
  }
  const individual=path.match(/^\/api\/admin\/bundle-assets\/([0-9a-f-]{36})\/individual$/i);
  if(individual&&request.method==='POST'&&UUID.test(individual[1])){
    const id=individual[1];
    const asset=await env.STORE_DB.prepare('SELECT p.status,p.pdf_key,p.category,p.race_date,p.pdf_expires_at,a.purged_at FROM products p JOIN bundle_only_assets a ON a.product_id=p.id WHERE p.id=?').bind(id).first();
    if(!asset)return fail('PDF repository item not found',404);
    if(asset.status!=='draft'||asset.purged_at)return fail('Only active private draft PDFs can become individual publications',409);
    if(!asset.pdf_key)return fail('Upload the PDF before assigning it to an individual publication',409);
    // Assigning changes only the private draft type. Collection, racing date and price
    // are completed in the individual editor before the owner publishes it.
    await env.STORE_DB.prepare('DELETE FROM bundle_only_assets WHERE product_id=? AND purged_at IS NULL').bind(id).run();
    return json({id,individual_draft:true});
  }
  // Physically remove every stored version of an archived private PDF, after
  // checking active bundles, paid entitlements and unfinished checkouts.
  // Keep a tiny D1 tombstone for audit/history and foreign-key stability.
  const purge=path.match(/^\/api\/admin\/bundle-assets\/([0-9a-f-]{36})\/purge$/i);
  if(purge&&request.method==='POST'&&UUID.test(purge[1])){
    const id=purge[1], prefix='cards/'+id+'/';
    const asset=await env.STORE_DB.prepare(
      'SELECT p.status,p.pdf_key,a.purged_at FROM products p JOIN bundle_only_assets a ON a.product_id=p.id WHERE p.id=?'
    ).bind(id).first();
    if(!asset)return fail('Private PDF not found',404);
    if(asset.purged_at)return fail('This private PDF has already been permanently deleted',410);
    if(asset.status!=='archived')return fail('Archive the private PDF first',409);
    if(asset.pdf_key&&!asset.pdf_key.startsWith(prefix))
      return fail('Unexpected storage key; manual review required before deletion',409);
    const activeBundle=await env.STORE_DB.prepare(
      `SELECT b.title FROM bundle_items bi JOIN products b ON b.id=bi.bundle_id
       WHERE bi.product_id=? AND b.status IN ('draft','published') AND b.pdf_key='__rr_bundle__' LIMIT 1`
    ).bind(id).first();
    if(activeBundle)return fail('Archive the bundle "'+activeBundle.title+'" before permanently deleting this PDF',409);
    // Pending Checkout Sessions can still complete. Do not remove their files.
    const dependent=await env.STORE_DB.prepare(
      `SELECT o.id FROM orders o
       LEFT JOIN bundle_order_items bi ON bi.order_id=o.id
       WHERE (bi.product_id=? OR o.pdf_key LIKE ?)
         AND ((o.status='paid' AND datetime(o.paid_at, '+' || o.access_days || ' days')>CURRENT_TIMESTAMP)
           OR (o.status IN ('initiated','pending') AND o.created_at>=datetime('now','-2 days')))
       LIMIT 1`
    ).bind(id,prefix+'%').first();
    if(dependent)return fail('This PDF is still within a customer access window or an unfinished checkout. Try again after access expires.',409);
    // List all versions, not just the latest pdf_key. Previous uploads may
    // remain in R2 to honor an older purchased version.
    const keys=[];let cursor,round=0,bytes=0;
    do{
      if(++round>10)return fail('Too many PDF versions for direct deletion; use manual review',409);
      const batch=await env.CARDS_BUCKET.list({prefix,limit:500,...(cursor?{cursor}:{})});
      for(const item of batch.objects||[]){
        if(!item.key.startsWith(prefix))return fail('Unexpected R2 listing; deletion cancelled',500);
        keys.push(item.key);bytes+=(item.size||0);
      }
      if(batch.truncated&&!batch.cursor)return fail('Incomplete R2 listing; deletion cancelled',503);
      cursor=batch.truncated?batch.cursor:null;
    }while(cursor);
    // A failure retains the archived metadata so the owner can safely retry.
    for(let i=0;i<keys.length;i+=500)await env.CARDS_BUCKET.delete(keys.slice(i,i+500));
    await env.STORE_DB.batch([
      env.STORE_DB.prepare(
        "UPDATE products SET pdf_key=NULL WHERE id=? AND status='archived'"
      ).bind(id),
      env.STORE_DB.prepare(
        'UPDATE bundle_only_assets SET purged_at=CURRENT_TIMESTAMP WHERE product_id=? AND purged_at IS NULL'
      ).bind(id)
    ]);
    return json({deleted:true,files_deleted:keys.length,bytes_deleted:bytes});
  }
  // Archive is reversible at the data level but never deletes R2 PDFs or
  // paid buyer snapshots. Refuse while a published bundle still depends on it.
  const archive=path.match(/^\/api\/admin\/bundle-assets\/([0-9a-f-]{36})\/archive$/i);
  if(archive&&request.method==='PATCH'&&UUID.test(archive[1])){
    const id=archive[1];
    const asset=await env.STORE_DB.prepare(
      'SELECT p.status FROM products p JOIN bundle_only_assets a ON a.product_id=p.id WHERE p.id=?'
    ).bind(id).first();
    if(!asset)return fail('Bundle-only PDF not found',404);
    if(asset.status==='archived')return json({id,archived:true,already_archived:true});
    if(asset.status!=='draft')return fail('Only private draft PDFs can be archived',409);
    const active=await env.STORE_DB.prepare(
      `SELECT b.title FROM bundle_items bi JOIN products b ON b.id=bi.bundle_id
       WHERE bi.product_id=? AND b.status='published' AND b.pdf_key='__rr_bundle__'
       ORDER BY b.title LIMIT 1`
    ).bind(id).first();
    if(active)return fail('This PDF is included in the published bundle "'+active.title+'". Archive that bundle first, then archive this private PDF.',409);
    // The same active-bundle condition is rechecked atomically in the update.
    const result=await env.STORE_DB.prepare(
      `UPDATE products SET status='archived'
       WHERE id=? AND status='draft'
         AND EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=products.id)
         AND NOT EXISTS(
           SELECT 1 FROM bundle_items bi JOIN products b ON b.id=bi.bundle_id
           WHERE bi.product_id=products.id AND b.status='published' AND b.pdf_key='__rr_bundle__'
         )`
    ).bind(id).run();
    if(!result.meta?.changes)return fail('Unable to archive: check whether a published bundle still uses this PDF.',409);
    return json({id,archived:true});
  }
  const m=path.match(/^\/api\/admin\/bundle-assets\/([0-9a-f-]{36})$/i);
  if(!m||!['PATCH','DELETE'].includes(request.method)||!UUID.test(m[1]))return fail('Not found',404);
  const id=m[1];
  if(request.method==='DELETE'){
    const old=await env.STORE_DB.prepare(
      'SELECT p.status,p.pdf_key,a.purged_at FROM products p JOIN bundle_only_assets a ON a.product_id=p.id WHERE p.id=?'
    ).bind(id).first();
    if(!old)return fail('Private PDF not found',404);
    if(old.purged_at)return fail('This private PDF was already deleted',410);
    if(old.status!=='draft'||old.pdf_key)return fail('Only draft entries marked PDF missing can be deleted here',409);
    const [bundleUse,orderUse,entitlementUse]=await Promise.all([
      env.STORE_DB.prepare('SELECT bundle_id FROM bundle_items WHERE product_id=? LIMIT 1').bind(id).first(),
      env.STORE_DB.prepare('SELECT id FROM orders WHERE product_id=? LIMIT 1').bind(id).first(),
      env.STORE_DB.prepare('SELECT order_id FROM bundle_order_items WHERE product_id=? LIMIT 1').bind(id).first()
    ]);
    if(bundleUse||orderUse||entitlementUse)return fail('This PDF has bundle or customer history and cannot be deleted from this shortcut',409);
    const deleted=await env.STORE_DB.batch([
      env.STORE_DB.prepare('DELETE FROM product_release_schedule WHERE product_id=?').bind(id),
      env.STORE_DB.prepare('DELETE FROM bundle_only_assets WHERE product_id=? AND purged_at IS NULL').bind(id),
      env.STORE_DB.prepare("DELETE FROM products WHERE id=? AND status='draft' AND pdf_key IS NULL").bind(id)
    ]);
    if(!deleted?.[2]?.meta?.changes)return fail('Unable to delete this incomplete upload. Refresh and try again.',409);
    return json({id,deleted:true});
  }
  const old=await env.STORE_DB.prepare(
    'SELECT p.status FROM products p JOIN bundle_only_assets a ON a.product_id=p.id WHERE p.id=?'
  ).bind(id).first();
  if(!old)return fail('Bundle-only PDF not found',404);
  if(old.status!=='draft')return fail('Archived PDF cannot be edited',409);
  let p;try{p=await readMeta(request);}catch(e){return fail(e.message);}
  await env.STORE_DB.prepare(
    "UPDATE products SET title=?,category=?,race_date=?,track=?,pdf_expires_at=? WHERE id=? AND status='draft'"
  ).bind(p.title,p.category,p.race_date,p.track,p.pdf_expires_at,id).run();
  return json({id,updated:true});
}

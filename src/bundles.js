/* Automatic bundles: only server-authorized admin users can edit memberships.
   Buyer entitlements are captured at checkout, not resolved from the live catalog
   after payment. R2 keys are never exposed in an API response. */
import {ensureReleaseSchedule,validReleaseAt} from './publication-schedule.js';
export const BUNDLE_KEY = '__rr_bundle__';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES=new Set(['Race Cards','Longshot Radar','Stable Notes','Target List']);
const HEAD={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const out=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const bad=(message,status=400)=>out({error:message},status);
function validDate(s) {
  if (!s) return true;
  if (typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d=new Date(s+'T00:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===s;
}
function originOk(request) {
  const u=new URL(request.url);return request.headers.get('origin')===u.origin&&request.headers.get('sec-fetch-site')!=='cross-site';
}
async function payload(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw Error('Expected JSON');
  if (Number(request.headers.get('content-length')||0)>12000) throw Error('Request too large');
  const raw=await request.text();if(raw.length>12000)throw Error('Request too large');
  let data;try{data=JSON.parse(raw);}catch{throw Error('Invalid JSON');}
  const title=String(data?.title||'').trim();
  const description=String(data?.description||'').trim();
  const category=String(data?.category||'');
  const race_date=data?.race_date||null;
  const price_cents=Number(data?.price_cents);
  const status=String(data?.status||'draft');
  const product_ids=data?.product_ids;
  const release_at=data?.release_at===undefined?undefined:(data.release_at||null);
  if(title.length<3||title.length>140)throw Error('Bundle name must contain 3–140 characters');
  if(description.length>4000)throw Error('Bundle description too long');
  if(!CATEGORIES.has(category))throw Error('Invalid collection');
  if(!validDate(race_date))throw Error('Invalid race date');
  if(!Number.isSafeInteger(price_cents)||price_cents<0||price_cents>500000)throw Error('Invalid price');
  if(!['draft','published','archived'].includes(status))throw Error('Invalid status');
  if(status==='published'&&price_cents<50)throw Error('Bundles must cost at least $0.50 to publish');
  if(!validReleaseAt(release_at))throw Error('Invalid scheduled release timestamp');
  if(release_at&&status!=='published')throw Error('Scheduled bundles must have published status');
  if(!Array.isArray(product_ids)||product_ids.length<2||product_ids.length>12||
    product_ids.some(x=>typeof x!=='string'||!UUID.test(x))||
    new Set(product_ids).size!==product_ids.length)throw Error('Select 2–12 different published PDFs');
  return {title,description,category,race_date,price_cents,status,product_ids,release_at};
}
function releaseWindowValid(utc){
  const time=Date.parse(utc.replace(' ','T')+'Z');
  return time>=Date.now()+60000&&time<=Date.now()+366*86400000;
}
function eligibleChild(p){return !!p&&!!p.pdf_key&&p.pdf_key!==BUNDLE_KEY&&!p.pending_release&&(p.status==='published'||(p.status==='draft'&&!!p.asset_id));}
async function validatedChildren(env,ids) {
  const rows=[];
  for (const id of ids) {
    const p=await env.STORE_DB.prepare("SELECT p.id,p.title,p.pdf_key,p.status,a.product_id AS asset_id,CASE WHEN s.release_at>CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS pending_release FROM products p LEFT JOIN bundle_only_assets a ON a.product_id=p.id LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.id=?").bind(id).first();
    if(!eligibleChild(p))
      throw Error('Include only published individual PDFs or uploaded bundle-only PDFs');
    rows.push(p);
  }
  return rows;
}
function slugFor(title,id) {
  return (title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||'bundle')+'-'+id.slice(0,8);
}
async function allBundles(env) {
  const products=await env.STORE_DB.prepare(
    "SELECT p.id,p.title,p.category,p.race_date,p.description,p.price_cents,p.status,s.release_at FROM products p LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.pdf_key=? ORDER BY p.created_at DESC LIMIT 100"
  ).bind(BUNDLE_KEY).all();
  const bundles=[];
  for (const b of products.results||[]) {
    const items=await env.STORE_DB.prepare(
      "SELECT bi.product_id,p.title,p.category,p.status,p.pdf_key,a.product_id AS asset_id,CASE WHEN s.release_at>CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS pending_release FROM bundle_items bi LEFT JOIN products p ON p.id=bi.product_id LEFT JOIN bundle_only_assets a ON a.product_id=p.id LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE bi.bundle_id=? ORDER BY bi.position"
    ).bind(b.id).all();
    bundles.push({...b,categories:[...new Set([b.category,...(items.results||[]).map(x=>x.category)].filter(Boolean))],product_ids:(items.results||[]).map(x=>x.product_id),
      components:(items.results||[]).map(x=>({id:x.product_id,title:x.title,status:x.status,available:eligibleChild(x),bundle_only:!!x.asset_id}))});
  }
  const singles=await env.STORE_DB.prepare(
    "SELECT p.id,p.title,p.category,p.race_date,p.price_cents,p.status,CASE WHEN a.product_id IS NOT NULL THEN 1 ELSE 0 END AS bundle_only FROM products p LEFT JOIN bundle_only_assets a ON a.product_id=p.id WHERE (p.status='published' OR (p.status='draft' AND a.product_id IS NOT NULL)) AND p.pdf_key IS NOT NULL AND p.pdf_key != ? AND NOT EXISTS(SELECT 1 FROM product_release_schedule s WHERE s.product_id=p.id AND s.release_at>CURRENT_TIMESTAMP) ORDER BY p.race_date DESC, p.title LIMIT 250"
  ).bind(BUNDLE_KEY).all();
  return out({bundles,available_products:singles.results||[]});
}
export async function handleAdminBundles(request,env,path) {
  if (!env.STORE_DB) return bad('Database unavailable',503);
  await ensureReleaseSchedule(env);
  if (!['GET','POST','PATCH'].includes(request.method))return bad('Method not allowed',405);
  if(request.method!=='GET'&&!originOk(request))return bad('Same-origin request required',403);
  if(path==='/api/admin/bundles'&&request.method==='GET')return allBundles(env);
  if(path==='/api/admin/bundles'&&request.method==='POST') {
    let b;try{
      b=await payload(request);
      if(b.release_at&&!releaseWindowValid(b.release_at))throw Error('Choose a release at least one minute ahead, within the next year');
      await validatedChildren(env,b.product_ids);
    }catch(e){return bad(e.message);}
    const id=crypto.randomUUID();
    const ops=[env.STORE_DB.prepare(
      "INSERT INTO products (id,title,slug,category,race_date,track,description,price_cents,pdf_key,image_url,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(id,b.title,slugFor(b.title,id),b.category,b.race_date,'',b.description,b.price_cents,BUNDLE_KEY,null,b.status)];
    b.product_ids.forEach((p,i)=>ops.push(env.STORE_DB.prepare(
      'INSERT INTO bundle_items (bundle_id,product_id,position) VALUES (?,?,?)'
    ).bind(id,p,i)));
    if(b.release_at)ops.push(env.STORE_DB.prepare(
      'INSERT INTO product_release_schedule(product_id,release_at) VALUES (?,?)'
    ).bind(id,b.release_at));
    await env.STORE_DB.batch(ops);
    return out({id,created:true},201);
  }
  const m=path.match(/^\/api\/admin\/bundles\/([0-9a-f-]{36})$/i);
  if(!m||request.method!=='PATCH')return bad('Not found',404);
  const id=m[1];
  const original=await env.STORE_DB.prepare("SELECT p.id,p.status,s.release_at FROM products p LEFT JOIN product_release_schedule s ON s.product_id=p.id WHERE p.id=? AND p.pdf_key=?").bind(id,BUNDLE_KEY).first();
  if(!original)return bad('Bundle not found',404);
  let b,release_at;
  try{
    b=await payload(request);
    if(b.product_ids.includes(id))throw Error('Bundles cannot contain bundles');
    release_at=b.status==='published'?(b.release_at===undefined?(original.release_at||null):b.release_at):null;
    if(release_at&&release_at!==original.release_at){
      if(!releaseWindowValid(release_at))throw Error('Choose a release at least one minute ahead, within the next year');
      if(original.status==='published'&&(!original.release_at||Date.parse(original.release_at.replace(' ','T')+'Z')<=Date.now()))
        throw Error('An already-live bundle cannot be scheduled again. Create a new draft');
    }
    if(b.status!=='archived')await validatedChildren(env,b.product_ids);
  }catch(e){return bad(e.message);}
  const ops=[
    env.STORE_DB.prepare("UPDATE products SET title=?,category=?,race_date=?,description=?,price_cents=?,status=? WHERE id=? AND pdf_key=?")
      .bind(b.title,b.category,b.race_date,b.description,b.price_cents,b.status,id,BUNDLE_KEY),
    env.STORE_DB.prepare('DELETE FROM bundle_items WHERE bundle_id=?').bind(id)
  ];
  b.product_ids.forEach((p,i)=>ops.push(env.STORE_DB.prepare(
    'INSERT INTO bundle_items (bundle_id,product_id,position) VALUES (?,?,?)'
  ).bind(id,p,i)));
  if(release_at){
    ops.push(env.STORE_DB.prepare('INSERT INTO product_release_schedule(product_id,release_at) VALUES (?,?) ON CONFLICT(product_id) DO UPDATE SET release_at=excluded.release_at').bind(id,release_at));
  }else{
    ops.push(env.STORE_DB.prepare('DELETE FROM product_release_schedule WHERE product_id=?').bind(id));
  }
  await env.STORE_DB.batch(ops);
  return out({id,updated:true});
}

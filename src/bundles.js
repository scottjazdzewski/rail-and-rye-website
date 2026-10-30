/* Automatic bundles: only server-authorized admin users can edit memberships.
   Buyer entitlements are captured at checkout, not resolved from the live catalog
   after payment. R2 keys are never exposed in an API response. */
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
  if(title.length<3||title.length>140)throw Error('Bundle name must contain 3–140 characters');
  if(description.length>4000)throw Error('Bundle description too long');
  if(!CATEGORIES.has(category))throw Error('Invalid collection');
  if(!validDate(race_date))throw Error('Invalid race date');
  if(!Number.isSafeInteger(price_cents)||price_cents<0||price_cents>500000)throw Error('Invalid price');
  if(!['draft','published','archived'].includes(status))throw Error('Invalid status');
  if(status==='published'&&price_cents<50)throw Error('Bundles must cost at least $0.50 to publish');
  if(!Array.isArray(product_ids)||product_ids.length<2||product_ids.length>12||
    product_ids.some(x=>typeof x!=='string'||!UUID.test(x))||
    new Set(product_ids).size!==product_ids.length)throw Error('Select 2–12 different published PDFs');
  return {title,description,category,race_date,price_cents,status,product_ids};
}
async function validatedChildren(env,ids) {
  const rows=[];
  for (const id of ids) {
    const p=await env.STORE_DB.prepare("SELECT id,title,pdf_key,status FROM products WHERE id=?").bind(id).first();
    if(!p||p.status!=='published'||!p.pdf_key||p.pdf_key===BUNDLE_KEY)
      throw Error('All included PDFs must be published individual products');
    rows.push(p);
  }
  return rows;
}
function slugFor(title,id) {
  return (title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||'bundle')+'-'+id.slice(0,8);
}
async function allBundles(env) {
  const products=await env.STORE_DB.prepare(
    "SELECT id,title,category,race_date,description,price_cents,status FROM products WHERE pdf_key=? ORDER BY created_at DESC LIMIT 100"
  ).bind(BUNDLE_KEY).all();
  const bundles=[];
  for (const b of products.results||[]) {
    const items=await env.STORE_DB.prepare(
      "SELECT bi.product_id,p.title,p.status,p.pdf_key FROM bundle_items bi LEFT JOIN products p ON p.id=bi.product_id WHERE bi.bundle_id=? ORDER BY bi.position"
    ).bind(b.id).all();
    bundles.push({...b,product_ids:(items.results||[]).map(x=>x.product_id),
      components:(items.results||[]).map(x=>({id:x.product_id,title:x.title,status:x.status,available:x.status==='published'&&!!x.pdf_key&&x.pdf_key!==BUNDLE_KEY}))});
  }
  const singles=await env.STORE_DB.prepare(
    "SELECT id,title,category,race_date,price_cents FROM products WHERE status='published' AND pdf_key IS NOT NULL AND pdf_key != ? ORDER BY race_date DESC, title LIMIT 250"
  ).bind(BUNDLE_KEY).all();
  return out({bundles,available_products:singles.results||[]});
}
export async function handleAdminBundles(request,env,path) {
  if (!env.STORE_DB) return bad('Database unavailable',503);
  if (!['GET','POST','PATCH'].includes(request.method))return bad('Method not allowed',405);
  if(request.method!=='GET'&&!originOk(request))return bad('Same-origin request required',403);
  if(path==='/api/admin/bundles'&&request.method==='GET')return allBundles(env);
  if(path==='/api/admin/bundles'&&request.method==='POST') {
    let b;try{b=await payload(request);await validatedChildren(env,b.product_ids);}catch(e){return bad(e.message);}
    const id=crypto.randomUUID();
    const ops=[env.STORE_DB.prepare(
      "INSERT INTO products (id,title,slug,category,race_date,track,description,price_cents,pdf_key,image_url,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(id,b.title,slugFor(b.title,id),b.category,b.race_date,'',b.description,b.price_cents,BUNDLE_KEY,null,b.status)];
    b.product_ids.forEach((p,i)=>ops.push(env.STORE_DB.prepare(
      'INSERT INTO bundle_items (bundle_id,product_id,position) VALUES (?,?,?)'
    ).bind(id,p,i)));
    await env.STORE_DB.batch(ops);
    return out({id,created:true},201);
  }
  const m=path.match(/^\/api\/admin\/bundles\/([0-9a-f-]{36})$/i);
  if(!m||request.method!=='PATCH')return bad('Not found',404);
  const id=m[1];
  const original=await env.STORE_DB.prepare("SELECT id FROM products WHERE id=? AND pdf_key=?").bind(id,BUNDLE_KEY).first();
  if(!original)return bad('Bundle not found',404);
  let b;try{b=await payload(request);if(b.product_ids.includes(id))throw Error('Bundles cannot contain bundles');await validatedChildren(env,b.product_ids);}catch(e){return bad(e.message);}
  const ops=[
    env.STORE_DB.prepare("UPDATE products SET title=?,category=?,race_date=?,description=?,price_cents=?,status=? WHERE id=? AND pdf_key=?")
      .bind(b.title,b.category,b.race_date,b.description,b.price_cents,b.status,id,BUNDLE_KEY),
    env.STORE_DB.prepare('DELETE FROM bundle_items WHERE bundle_id=?').bind(id)
  ];
  b.product_ids.forEach((p,i)=>ops.push(env.STORE_DB.prepare(
    'INSERT INTO bundle_items (bundle_id,product_id,position) VALUES (?,?,?)'
  ).bind(id,p,i)));
  await env.STORE_DB.batch(ops);
  return out({id,updated:true});
}

/* Private, bundle-only PDF library. Files live in R2 via the existing protected
   admin PDF upload; public products/checkout never expose draft assets. */
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
  const title=String(p.title||'').trim(), category=String(p.category||'Race Cards');
  const race_date=parseDate(p.race_date);
  const track=String(p.track||'').trim();
  if(title.length<3||title.length>140)throw Error('PDF name must contain 3–140 characters');
  if(!CATEGORIES.has(category))throw Error('Invalid collection');
  if(track.length>100)throw Error('Racetrack name too long');
  return {title,category,race_date,track};
}
export async function handleAdminBundleAssets(request,env,path){
  if(!env.STORE_DB||!env.CARDS_BUCKET)return fail('Database or private storage unavailable',503);
  if(!['GET','POST','PATCH'].includes(request.method))return fail('Method not allowed',405);
  if(request.method!=='GET'&&!originOk(request))return fail('Same-origin request required',403);
  if(path==='/api/admin/bundle-assets'&&request.method==='GET'){
    const rows=await env.STORE_DB.prepare(
      `SELECT p.id,p.title,p.category,p.race_date,p.track,p.status,
         CASE WHEN p.pdf_key IS NOT NULL THEN 1 ELSE 0 END AS has_pdf
       FROM products p JOIN bundle_only_assets a ON a.product_id=p.id
       ORDER BY a.created_at DESC,p.id DESC LIMIT 250`).all();
    return json({assets:rows.results||[]});
  }
  if(path==='/api/admin/bundle-assets'&&request.method==='POST'){
    let p;try{p=await readMeta(request);}catch(e){return fail(e.message);}
    const id=crypto.randomUUID();
    await env.STORE_DB.batch([
      env.STORE_DB.prepare(
        'INSERT INTO products (id,title,slug,category,race_date,track,description,price_cents,pdf_key,image_url,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(id,p.title,'bundle-private-'+id,p.category,p.race_date,p.track,'',0,null,null,'draft'),
      env.STORE_DB.prepare('INSERT INTO bundle_only_assets (product_id) VALUES (?)').bind(id)
    ]);
    return json({id,created:true},201);
  }
  const m=path.match(/^\/api\/admin\/bundle-assets\/([0-9a-f-]{36})$/i);
  if(!m||request.method!=='PATCH'||!UUID.test(m[1]))return fail('Not found',404);
  const id=m[1];
  const old=await env.STORE_DB.prepare(
    'SELECT p.status FROM products p JOIN bundle_only_assets a ON a.product_id=p.id WHERE p.id=?'
  ).bind(id).first();
  if(!old)return fail('Bundle-only PDF not found',404);
  if(old.status!=='draft')return fail('Archived PDF cannot be edited',409);
  let p;try{p=await readMeta(request);}catch(e){return fail(e.message);}
  await env.STORE_DB.prepare(
    "UPDATE products SET title=?,category=?,race_date=?,track=? WHERE id=? AND status='draft'"
  ).bind(p.title,p.category,p.race_date,p.track,id).run();
  return json({id,updated:true});
}

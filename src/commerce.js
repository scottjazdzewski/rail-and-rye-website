/* Rail & Rye test-only digital delivery. No live payments, no public R2 URLs.
   Stripe secrets are Cloudflare Worker SECRETS, never source files. */
const enc = new TextEncoder();
const API_JSON = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const reply = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:API_JSON});
const error = (m,s=400)=>reply({error:m},s);
const SESSION_RE=/^cs_test_[A-Za-z0-9_]{10,200}$/;
const UUID_RE=/^[0-9a-f-]{36}$/i;
const MAX_BODY=128*1024;

function stripeReady(env){ return !!env.STRIPE_SECRET_KEY?.startsWith('sk_test_'); }
async function stripeRequest(env,method,endpoint,data){
  const headers={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,"Stripe-Version":"2025-09-30.clover"};
  if(data){headers['Content-Type']='application/x-www-form-urlencoded';}
  const r=await fetch(`https://api.stripe.com/v1/${endpoint}`,{method,headers,body:data?data.toString():undefined});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) {console.error('Stripe API error',r.status,j?.error?.code||'unknown');throw Error('Stripe could not start checkout');}
  return j;
}
function sameOrigin(request){const u=new URL(request.url);return request.headers.get('origin')===u.origin&&request.headers.get('sec-fetch-site')!=='cross-site';}
function orderSessionId(url){ const parts=url.pathname.split('/');const id=parts[3];return SESSION_RE.test(id||'')?id:null;}
function cacheNoStore(resp){resp.headers.set('Cache-Control','no-store');return resp;}
function hex(bytes){return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');}
function safeEq(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function verifyStripeWebhook(raw,header,secret){
  if(!header||!secret?.startsWith('whsec_'))return false;
  const t=header.match(/(?:^|,)\s*t=(\d+)/)?.[1];const signatures=[...header.matchAll(/(?:^|,)\s*v1=([a-f0-9]{64})/g)].map(m=>m[1]);
  if(!t||!signatures.length||Math.abs(Date.now()/1000-Number(t))>300)return false;
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=hex(await crypto.subtle.sign('HMAC',key,enc.encode(t+'.'+raw)));
  return signatures.some(v=>safeEq(sig,v));
}
async function webhook(request,env){
  if(request.method!=='POST')return error('Method not allowed',405);
  if(!stripeReady(env)||!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')||!env.STORE_DB)return error('Webhook not configured',503);
  if(Number(request.headers.get('content-length')||0)>MAX_BODY)return error('Payload too large',413);
  const body=await request.text();if(enc.encode(body).byteLength>MAX_BODY)return error('Payload too large',413);
  if(!await verifyStripeWebhook(body,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET))return error('Invalid webhook signature',400);
  let evt;try{evt=JSON.parse(body);}catch{return error('Malformed event',400);}
  if(!/^evt_[\w-]{8,}$/.test(evt?.id||'')||typeof evt?.type!=='string'||evt?.livemode!==false)return error('Invalid test event',400);
  const obj=evt.data?.object||{};
  const put=env.STORE_DB.prepare('INSERT OR IGNORE INTO stripe_events (event_id,event_type) VALUES (?,?)').bind(evt.id,evt.type);
  let ops=[put];
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(evt.type)){
    if(obj.livemode===false&&obj.payment_status==='paid'&&obj.mode==='payment'&&obj.currency==='usd'&&obj.metadata?.order_id&&typeof obj.id==='string'&&Number.isSafeInteger(obj.amount_total)){
      ops.push(env.STORE_DB.prepare(`UPDATE orders SET status='paid',stripe_payment_intent=?,buyer_email=?,paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP)
        WHERE id=? AND stripe_session_id=? AND amount_cents=? AND status IN ('pending','paid')`)
        .bind(typeof obj.payment_intent==='string'?obj.payment_intent:null, String(obj.customer_details?.email||'').slice(0,254),obj.metadata.order_id,obj.id,obj.amount_total));
    }
  }else if(evt.type==='checkout.session.async_payment_failed'&&typeof obj.id==='string'){
    ops.push(env.STORE_DB.prepare(`UPDATE orders SET status='failed' WHERE stripe_session_id=? AND status='pending'`).bind(obj.id));
  }else if(evt.type==='charge.refunded' && typeof obj.payment_intent==='string' && obj.refunded===true){
    ops.push(env.STORE_DB.prepare(`UPDATE orders SET status='refunded',revoked_at=CURRENT_TIMESTAMP WHERE stripe_payment_intent=?`).bind(obj.payment_intent));
  }else if(evt.type==='charge.dispute.created'&&typeof obj.payment_intent==='string'){
    ops.push(env.STORE_DB.prepare(`UPDATE orders SET status='revoked',revoked_at=CURRENT_TIMESTAMP WHERE stripe_payment_intent=?`).bind(obj.payment_intent));
  }
  // Single transaction prevents recording a Stripe event without applying its order update.
  await env.STORE_DB.batch(ops);
  return reply({received:true});
}
async function listProducts(env){
  if(!env.STORE_DB)return error('Catalog temporarily unavailable',503);
  const records=await env.STORE_DB.prepare(`SELECT id,title,slug,category,race_date,track,description,price_cents,image_url
    FROM products WHERE status='published' AND pdf_key IS NOT NULL ORDER BY race_date DESC,created_at DESC LIMIT 150`).all();
  return reply({products:records.results||[],checkout_ready:stripeReady(env)});
}
async function checkout(request,env){
  if(request.method!=='POST')return error('Method not allowed',405);
  if(!stripeReady(env)||!env.STORE_DB)return error('Test checkout not configured',503);
  if(!sameOrigin(request))return error('Same-origin request required',403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return error('Expected JSON',400);
  if(Number(request.headers.get('content-length')||0)>1000)return error('Request too large',413);
  let data;try{data=await request.json();}catch{return error('Invalid JSON',400);}
  if(!UUID_RE.test(data?.product_id||''))return error('Invalid product',400);
  const p=await env.STORE_DB.prepare(`SELECT id,title,description,price_cents,pdf_key,category,status
    FROM products WHERE id=? AND status='published' AND pdf_key IS NOT NULL`).bind(data.product_id).first();
  if(!p)return error('Product is not available',404);
  if(!Number.isSafeInteger(p.price_cents)||p.price_cents<50||p.price_cents>500000)return error('Product is not available for purchase',400);
  const orderId=crypto.randomUUID();
  await env.STORE_DB.prepare(`INSERT INTO orders (id,product_id,product_title,pdf_key,amount_cents,status)
    VALUES (?,?,?,?,?,'initiated')`).bind(orderId,p.id,p.title,p.pdf_key,p.price_cents).run();
  const base=new URL(request.url).origin;
  const fields=new URLSearchParams({
    mode:'payment',
    'payment_method_types[0]':'card',
    'line_items[0][quantity]':'1',
    'line_items[0][price_data][currency]':'usd',
    'line_items[0][price_data][unit_amount]':String(p.price_cents),
    'line_items[0][price_data][product_data][name]':p.title.slice(0,120),
    'line_items[0][price_data][product_data][description]':String(p.description||'Rail & Rye racing analysis PDF').slice(0,450),
    'metadata[order_id]':orderId,
    'metadata[product_id]':p.id,
    client_reference_id:orderId,
    success_url:`${base}/store/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:`${base}/store/?cancelled=1`
  });
  let session;
  try{
    session=await stripeRequest(env,'POST','checkout/sessions',fields);
    if(session.livemode!==false||typeof session.url!=='string'||!session.url.startsWith('https://checkout.stripe.com/')||!SESSION_RE.test(session.id))throw Error('Unexpected Stripe session');
    await env.STORE_DB.prepare(`UPDATE orders SET stripe_session_id=?,status='pending' WHERE id=? AND status='initiated'`).bind(session.id,orderId).run();
  }catch(e){
    await env.STORE_DB.prepare(`UPDATE orders SET status='failed' WHERE id=? AND status='initiated'`).bind(orderId).run().catch(()=>{});
    console.error('Checkout creation failed',String(e));return error('Unable to start test checkout',502);
  }
  return reply({url:session.url});
}
async function orderStatus(url,env){
  const id=orderSessionId(url);if(!id)return error('Invalid session',400);
  if(!env.STORE_DB)return error('Orders unavailable',503);
  const o=await env.STORE_DB.prepare(`SELECT id,product_title,amount_cents,status,paid_at,download_count
    FROM orders WHERE stripe_session_id=?`).bind(id).first();
  if(!o)return error('Order not found',404);
  return reply({title:o.product_title,amount_cents:o.amount_cents,status:o.status,paid_at:o.paid_at,downloads_remaining:Math.max(0,5-o.download_count)});
}
async function download(url,env){
  const id=orderSessionId(url);if(!id)return error('Invalid session',400);
  if(!env.STORE_DB||!env.CARDS_BUCKET)return error('Downloads unavailable',503);
  const row=await env.STORE_DB.prepare(`SELECT pdf_key,product_title FROM orders WHERE stripe_session_id=? AND status='paid'
    AND paid_at>=datetime('now','-30 days') AND download_count<5`).bind(id).first();
  if(!row)return error('Download not available or expired',403);
  const obj=await env.CARDS_BUCKET.get(row.pdf_key);if(!obj)return error('PDF temporarily unavailable',503);
  const upd=await env.STORE_DB.prepare(`UPDATE orders SET download_count=download_count+1 WHERE stripe_session_id=?
    AND status='paid' AND paid_at>=datetime('now','-30 days') AND download_count<5`).bind(id).run();
  if(!upd.meta?.changes)return error('Download limit reached',403);
  const name=String(row.product_title||'rail-and-rye').normalize('NFKD').replace(/[^a-zA-Z0-9 -]/g,'').trim().replace(/\s+/g,'-').slice(0,70)||'rail-and-rye';
  return new Response(obj.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${name}.pdf"`,
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
}
export async function handleCommerce(request,env,url){
  const p=url.pathname;
  if(p==='/api/products'&&request.method==='GET')return listProducts(env);
  if(p==='/api/checkout')return checkout(request,env);
  if(p==='/api/stripe/webhook')return webhook(request,env);
  if(/^\/api\/orders\/[^/]+\/status$/.test(p)&&request.method==='GET')return orderStatus(url,env);
  if(/^\/api\/orders\/[^/]+\/download$/.test(p)&&request.method==='GET')return download(url,env);
  return error('Not found',404);
}

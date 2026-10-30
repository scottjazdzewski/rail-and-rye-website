import {BUNDLE_KEY} from './bundles.js';
/* Rail & Rye fail-closed checkout. Default sandbox. Live activation is separate,
   requires verified Stripe keys and an explicit control flag; no public R2 URLs.
   Stripe secrets are Cloudflare Worker SECRETS, never source files. */
const enc = new TextEncoder();
const API_JSON = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const reply = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:API_JSON});
const error = (m,s=400)=>reply({error:m},s);
const SESSION_RE=/^cs_(?:test|live)_[A-Za-z0-9_]{10,200}$/;
const UUID_RE=/^[0-9a-f-]{36}$/i;
const MAX_BODY=128*1024;
const RR_SITE='https://railandryeracing.com';
const MAIL_FROM='Rail & Rye Racing <orders@railandryeracing.com>';
const JOB_RE=/^(purchase|recover)-[0-9a-f-]{36}$/i;
const ACCESS_RE=/^((?:purchase|recover)-[0-9a-f-]{36})\.([a-f0-9]{64})$/i;
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function testEmailAllowed(env,email){ // Test-only checkout: never email arbitrary Stripe test-card users.
  return !!env.ADMIN_EMAIL&&String(email||'').trim().toLowerCase()===String(env.ADMIN_EMAIL).trim().toLowerCase();
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function normalizeEmail(s){return String(s||'').trim().toLowerCase();}
// Explicit two-part activation: absent/invalid controls NEVER trigger live sales.
function checkoutMode(env){
  // No live sales without two explicit flags; once live mode has been requested,
  // an incomplete configuration PAUSES checkout instead of falling back to test.
  if(env.RR_PAYMENT_MODE==='live')return env.RR_LIVE_ACTIVATION==='CONFIRM_LIVE_SALES'?'live':'paused';
  if(env.RR_PAYMENT_MODE==='paused')return 'paused';
  return 'test';
}
function stripeKey(env,mode){return mode==='live'?env.STRIPE_LIVE_SECRET_KEY:env.STRIPE_SECRET_KEY;}
// Live Stripe Checkout supports both standard (sk_live_) and least-privilege
// restricted (rk_live_) keys; sandbox remains pinned to sk_test_.
function stripeReadyFor(env,mode){
  const key=stripeKey(env,mode);
  return typeof key==='string' && (mode==='live' ? /^(?:sk|rk)_live_/.test(key) : key.startsWith('sk_test_'));
}
// Never create a charge unless fulfillment resources and the relevant webhook
// signing secret are present. The live path additionally requires a dedicated
// PDF signing key, to keep delivery credentials independent of Stripe secrets.
function stripeReady(env){
  const mode=checkoutMode(env);
  if(mode==='paused')return false;
  const mailReady=typeof env.RESEND_API_KEY==='string'&&env.RESEND_API_KEY.startsWith('re_');
  const signingReady=typeof deliverySigningKey(env)==='string'&&deliverySigningKey(env).length>=16;
  const webhookReady=typeof webhookSecret(env,mode)==='string'&&webhookSecret(env,mode).startsWith('whsec_');
  const liveReady=mode!=='live'||(typeof env.RR_DELIVERY_SIGNING_KEY==='string'&&env.RR_DELIVERY_SIGNING_KEY.length>=32);
  return !!env.STORE_DB&&!!env.CARDS_BUCKET&&stripeReadyFor(env,mode)&&mailReady&&signingReady&&webhookReady&&liveReady;
}
// Admin can inspect readiness without exposing any secret values.
export function checkoutReadiness(env){return {payment_mode:checkoutMode(env),checkout_ready:stripeReady(env)};}
function webhookSecret(env,mode){return mode==='live'?env.STRIPE_LIVE_WEBHOOK_SECRET:env.STRIPE_WEBHOOK_SECRET;}
function deliverySigningKey(env){return env.RR_DELIVERY_SIGNING_KEY||env.STRIPE_WEBHOOK_SECRET;}
function sessionMode(sessionId){return String(sessionId||'').startsWith('cs_live_')?'live':'test';}
function recipientAllowed(env,email,sessionId){return sessionMode(sessionId)==='live'?EMAIL_RE.test(normalizeEmail(email)) && normalizeEmail(email).length<=254:testEmailAllowed(env,email);}
async function stripeRequest(env,mode,method,endpoint,data){
  const headers={Authorization:`Bearer ${stripeKey(env,mode)}`,"Stripe-Version":"2025-09-30.clover"};
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
async function webhook(request,env,ctx,mode){
  if(request.method!=='POST')return error('Method not allowed',405);
  const secret=webhookSecret(env,mode);
  if(!secret?.startsWith('whsec_')||!env.STORE_DB)return error('Webhook not configured',503);
  if(Number(request.headers.get('content-length')||0)>MAX_BODY)return error('Payload too large',413);
  const body=await request.text();if(enc.encode(body).byteLength>MAX_BODY)return error('Payload too large',413);
  if(!await verifyStripeWebhook(body,request.headers.get('stripe-signature'),secret))return error('Invalid webhook signature',400);
  let evt;try{evt=JSON.parse(body);}catch{return error('Malformed event',400);}
  if(!/^evt_[\w-]{8,}$/.test(evt?.id||'')||typeof evt?.type!=='string'||evt?.livemode!==(mode==='live'))return error('Invalid event mode',400);
  const obj=evt.data?.object||{};
  const put=env.STORE_DB.prepare('INSERT OR IGNORE INTO stripe_events (event_id,event_type) VALUES (?,?)').bind(evt.id,evt.type);
  let ops=[put];
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(evt.type)){
    if(obj.livemode===(mode==='live')&&obj.payment_status==='paid'&&obj.mode==='payment'&&obj.currency==='usd'&&obj.metadata?.order_id&&typeof obj.id==='string'&&SESSION_RE.test(obj.id)&&sessionMode(obj.id)===mode&&Number.isSafeInteger(obj.amount_total)&&typeof obj.payment_intent==='string'){
      ops.push(env.STORE_DB.prepare(`UPDATE orders SET status='paid',stripe_payment_intent=?,buyer_email=?,paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP)
        WHERE id=? AND stripe_session_id=? AND amount_cents=? AND status IN ('pending','paid')
        AND NOT EXISTS (SELECT 1 FROM payment_revocations WHERE payment_intent=?)`)
        .bind(obj.payment_intent, normalizeEmail(obj.customer_details?.email).slice(0,254),obj.metadata.order_id,obj.id,obj.amount_total,obj.payment_intent));
      // Durable, idempotent email outbox. Created transactionally only for paid
      // orders and the one permitted test recipient. Never email a stranger in sandbox.
      if(recipientAllowed(env,obj.customer_details?.email,obj.id)) {
        ops.push(env.STORE_DB.prepare(`INSERT OR IGNORE INTO email_jobs (id,order_id,email,purpose)
          SELECT 'purchase-'||id,id,buyer_email,'purchase' FROM orders
          WHERE id=? AND stripe_session_id=? AND status='paid' AND lower(buyer_email)=?`)
          .bind(obj.metadata.order_id,obj.id,normalizeEmail(obj.customer_details?.email)));
      }
    }
  }else if(evt.type==='checkout.session.async_payment_failed'&&typeof obj.id==='string'){
    ops.push(env.STORE_DB.prepare(`UPDATE orders SET status='failed' WHERE stripe_session_id=? AND status='pending'`).bind(obj.id));
  }else if(evt.type==='charge.refunded' && typeof obj.payment_intent==='string' && obj.refunded===true){
    ops.push(env.STORE_DB.prepare(`INSERT OR IGNORE INTO payment_revocations (payment_intent,reason) VALUES (?,'refund')`).bind(obj.payment_intent));
    ops.push(env.STORE_DB.prepare(`UPDATE orders SET status='refunded',revoked_at=CURRENT_TIMESTAMP WHERE stripe_payment_intent=?`).bind(obj.payment_intent));
  }else if(evt.type==='charge.dispute.created'&&typeof obj.payment_intent==='string'){
    ops.push(env.STORE_DB.prepare(`INSERT OR IGNORE INTO payment_revocations (payment_intent,reason) VALUES (?,'dispute')`).bind(obj.payment_intent));
    ops.push(env.STORE_DB.prepare(`UPDATE orders SET status='revoked',revoked_at=CURRENT_TIMESTAMP WHERE stripe_payment_intent=?`).bind(obj.payment_intent));
  }
  // Single transaction prevents recording a Stripe event without applying its order update.
  await env.STORE_DB.batch(ops);
  if(ops.length>1 && ctx?.waitUntil) ctx.waitUntil(sendQueuedEmails(env,2).catch(e=>console.warn('Email queue retry scheduled',String(e))));
  return reply({received:true});
}
// Deterministic, signed 24-hour PDF links. A link is a bearer credential,
// but never contains a Stripe session ID or exposes an R2 object key.
async function jobSignature(env,jobId,orderId,keyOverride){
  const signingSecret=keyOverride||deliverySigningKey(env);
  if(!signingSecret)throw Error('Delivery signing key missing');
  const key=await crypto.subtle.importKey('raw',enc.encode(signingSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,enc.encode(`rr-delivery-v3|${jobId}|${orderId}`)));
}
async function deliveryLink(env,j){
  return `${RR_SITE}/store/access.html?code=${encodeURIComponent(j.id+'.'+await jobSignature(env,j.id,j.order_id))}`;
}
async function resendEmail(env,j,order){
  if(!env.RESEND_API_KEY?.startsWith('re_') || !deliverySigningKey(env)) throw Error('Email integration is not configured');
  if(!recipientAllowed(env,j.email,order.stripe_session_id))throw Error('Delivery recipient not eligible');
  const link=await deliveryLink(env,j);
  const title=String(order.product_title||'Race Card');
  const live=sessionMode(order.stripe_session_id)==='live';
  const intro=j.purpose==='recover'?'Here is your requested replacement download link.':live?'Your purchase is confirmed and your PDF is ready.':'Your Stripe sandbox purchase is confirmed and your test PDF is ready.';
  const textBody=`Rail & Rye Racing\n\n${intro}\n\n${title}\nDownload your PDF: ${link}\n\nThis secure link expires 24 hours after delivery. PDF access is limited to 5 downloads within 30 days of payment and ends when an order is refunded. To request a new link, visit ${RR_SITE}/store/recover.html\n\n${live?'For support: support@railandryeracing.com':'SANDBOX TEST EMAIL - NO REAL PAYMENT WAS TAKEN.'}\n\nRail & Rye Racing`;
  const html=`<!doctype html><html><body style="background:#f7f5ef;color:#12253c;font-family:Arial,sans-serif;padding:28px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e1d7c9;padding:30px"><p style="font:28px Georgia,serif;letter-spacing:4px;color:#0b203a">RAIL &amp; RYE</p><p style="font-size:11px;color:#987548;letter-spacing:2px">SECURE DIGITAL DELIVERY${live?'':' · SANDBOX'}</p><h1 style="font:30px Georgia,serif;color:#0b203a">Your race card is ready</h1><p>${escapeHtml(intro)}</p><h2 style="font:22px Georgia,serif">${escapeHtml(title)}</h2><p><a style="display:inline-block;padding:17px 20px;background:#0b203a;color:#fff;text-decoration:none" href="${escapeHtml(link)}">ACCESS YOUR PDF</a></p><p style="line-height:1.7;color:#566477;font-size:13px">Link expires 24 hours after delivery. Purchases allow up to 5 downloads within 30 days; refunded orders lose access. <a href="${RR_SITE}/store/recover.html">Request a new link</a>.</p>${live?'<p style="font-size:12px;color:#a36728">Questions? Email support@railandryeracing.com</p>':'<p style="font-size:12px;color:#a36728">SANDBOX ONLY — NO REAL CHARGES</p>'}</div></body></html>`;
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`rr-v3-${j.id}`},
    body:JSON.stringify({from:MAIL_FROM,to:[j.email],subject:`Rail & Rye | ${j.purpose==='recover'?'Your replacement PDF link':'Your race card is ready'}${live?'':' (TEST)'}`,html,text:textBody})
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.id){console.warn('Resend delivery failed',response.status,body?.name||'unknown');throw Error('Email provider request failed');}
  return String(body.id).slice(0,120);
}
// Called after webhook via waitUntil and from the 10-minute cron. Claim a job
// atomically; duplicate webhooks and concurrent workers cannot double-send it.
export async function sendQueuedEmails(env,limit=8){
  if(!env.STORE_DB||!env.RESEND_API_KEY?.startsWith('re_')||!deliverySigningKey(env))return 0;
  const pending=await env.STORE_DB.prepare(`SELECT j.id,j.order_id,j.email,j.purpose,j.attempts,o.stripe_session_id
    FROM email_jobs j JOIN orders o ON o.id=j.order_id
    WHERE o.status='paid' AND o.paid_at>=datetime('now','-30 days')
    AND j.attempts<6 AND ((j.state='queued' AND j.next_attempt_at<=CURRENT_TIMESTAMP)
    OR (j.state='sending' AND j.claimed_at<datetime('now','-3 minutes')))
    ORDER BY j.created_at ASC LIMIT ?`).bind(limit).all();
  let sent=0;
  for(const j of pending.results||[]){
    if(!JOB_RE.test(j.id)||!recipientAllowed(env,j.email,j.stripe_session_id))continue;
    const claim=await env.STORE_DB.prepare(`UPDATE email_jobs SET state='sending',claimed_at=CURRENT_TIMESTAMP,attempts=attempts+1
      WHERE id=? AND attempts<6 AND ((state='queued' AND next_attempt_at<=CURRENT_TIMESTAMP)
        OR (state='sending' AND claimed_at<datetime('now','-3 minutes')))`)
      .bind(j.id).run();
    if(!claim.meta?.changes)continue;
    try{
      const o=await env.STORE_DB.prepare(`SELECT product_title,status,stripe_session_id FROM orders WHERE id=?`).bind(j.order_id).first();
      if(o?.status!=='paid')continue;
      const providerId=await resendEmail(env,j,o);
      await env.STORE_DB.prepare(`UPDATE email_jobs SET state='sent',provider_id=?,sent_at=CURRENT_TIMESTAMP,last_error=NULL
        WHERE id=? AND state='sending'`).bind(providerId,j.id).run();
      sent++;
    }catch(e){
      // Bounded exponential backoff, no sensitive token/email in logs.
      const minutes=Math.min(60,2**Math.min(6,(j.attempts||0)+1));
      await env.STORE_DB.prepare(`UPDATE email_jobs SET state='queued',last_error='Delivery temporarily unavailable',
        next_attempt_at=datetime('now',?||' minutes') WHERE id=? AND state='sending'`)
        .bind('+'+minutes,j.id).run();
      console.warn('Delivery job retry queued',j.id,String(e).slice(0,100));
    }
  }
  return sent;
}

// Paid bundle items always use the PDF key snapshotted at checkout. Archiving or
// updating a product never removes a previously purchased PDF entitlement.
async function bundleItems(env,orderId) {
  const rows=await env.STORE_DB.prepare(
    'SELECT product_id AS id,product_title AS title,download_count FROM bundle_order_items WHERE order_id=? ORDER BY position LIMIT 12'
  ).bind(orderId).all();
  return (rows.results||[]).map(p=>({id:p.id,title:p.title,downloads_remaining:Math.max(0,5-p.download_count)}));
}
async function downloadBundleItem(env,orderId,itemId) {
  if(!UUID_RE.test(itemId||''))return error('Select an included PDF',400);
  const item=await env.STORE_DB.prepare(`SELECT bi.product_title,bi.pdf_key FROM bundle_order_items bi
    JOIN orders o ON o.id=bi.order_id WHERE bi.order_id=? AND bi.product_id=?
    AND o.status='paid' AND o.paid_at>=datetime('now','-30 days') AND bi.download_count<5`).bind(orderId,itemId).first();
  if(!item)return error('Download not available or expired',403);
  const file=await env.CARDS_BUCKET.get(item.pdf_key);
  if(!file)return error('PDF temporarily unavailable',503);
  const change=await env.STORE_DB.prepare(`UPDATE bundle_order_items SET download_count=download_count+1
    WHERE order_id=? AND product_id=? AND download_count<5
    AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='paid' AND paid_at>=datetime('now','-30 days'))`)
    .bind(orderId,itemId,orderId).run();
  if(!change.meta?.changes)return error('Download not available',403);
  const filename=String(item.product_title||'rail-and-rye').normalize('NFKD').replace(/[^a-zA-Z0-9 -]/g,'').trim().replace(/\s+/g,'-').slice(0,70)||'rail-and-rye';
  return new Response(file.body,{headers:{'Content-Type':'application/pdf',
    'Content-Disposition':`attachment; filename="${filename}.pdf"`,
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
}
async function deliveryItems(request,env) {
  if(request.method!=='POST')return error('Method not allowed',405);
  if(!sameOrigin(request))return error('Same-origin request required',403);
  if(!env.STORE_DB)return error('Downloads unavailable',503);
  if(Number(request.headers.get('content-length')||0)>1000)return error('Request too large',413);
  let data;try{data=await request.json();}catch{return error('Invalid request',400);}
  const order=await accessJob(data?.code,env);
  if(!order)return error('Link invalid, expired, or order unavailable. Request a new link.',403);
  if(order.pdf_key!==BUNDLE_KEY)return reply({bundle:false,items:[{id:null,title:order.product_title,downloads_remaining:5-order.download_count}]});
  return reply({bundle:true,items:await bundleItems(env,order.order_id)});
}

async function accessJob(code,env){
  const m=ACCESS_RE.exec(code||'');if(!m||!deliverySigningKey(env))return null;
  const j=await env.STORE_DB.prepare(`SELECT j.id,j.order_id,j.created_at,o.product_title,o.pdf_key,o.status,o.paid_at,o.download_count
    FROM email_jobs j JOIN orders o ON o.id=j.order_id WHERE j.id=? AND j.state='sent'
    AND j.sent_at>=datetime('now','-24 hours') AND o.status='paid'
    AND o.paid_at>=datetime('now','-30 days') AND (o.pdf_key='__rr_bundle__' OR o.download_count<5)`).bind(m[1]).first();
  if(!j)return null;
  const supplied=m[2].toLowerCase();
  // V4/V4.1 used the Stripe TEST webhook secret to sign delivery URLs. A new
  // V5 dedicated signing key must NOT invalidate still-active emailed links.
  // The old-key fallback is limited by the same 24-hour DB expiration above.
  const valid=safeEq(await jobSignature(env,j.id,j.order_id),supplied)||
    (!!env.RR_DELIVERY_SIGNING_KEY&&!!env.STRIPE_WEBHOOK_SECRET&&
      safeEq(await jobSignature(env,j.id,j.order_id,env.STRIPE_WEBHOOK_SECRET),supplied));
  return valid?j:null;
}
async function accessPdf(request,env){
  if(request.method!=='POST')return error('Method not allowed',405);
  if(!sameOrigin(request))return error('Same-origin request required',403);
  if(!env.STORE_DB||!env.CARDS_BUCKET)return error('Downloads unavailable',503);
  if(Number(request.headers.get('content-length')||0)>1000)return error('Request too large',413);
  let data;try{data=await request.json();}catch{return error('Invalid request',400);}
  const j=await accessJob(data?.code,env);
  if(!j)return error('Link invalid, expired, or order unavailable. Request a new link.',403);
  if(j.pdf_key===BUNDLE_KEY)return downloadBundleItem(env,j.order_id,data?.item_id);
  const object=await env.CARDS_BUCKET.get(j.pdf_key);
  if(!object)return error('PDF temporarily unavailable',503);
  const count=await env.STORE_DB.prepare(`UPDATE orders SET download_count=download_count+1 WHERE id=?
    AND status='paid' AND paid_at>=datetime('now','-30 days') AND download_count<5`).bind(j.order_id).run();
  if(!count.meta?.changes)return error('Download not available',403);
  const name=String(j.product_title||'rail-and-rye').normalize('NFKD').replace(/[^a-zA-Z0-9 -]/g,'').trim().replace(/\s+/g,'-').slice(0,70)||'rail-and-rye';
  return new Response(object.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${name}.pdf"`,
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
}
async function throttle(env,key,limit){
  const r=await env.STORE_DB.prepare(`INSERT INTO recovery_limits (key,last_request,window_count)
    VALUES (?,CURRENT_TIMESTAMP,1)
    ON CONFLICT(key) DO UPDATE SET last_request=CURRENT_TIMESTAMP,
    window_count=CASE WHEN last_request<datetime('now','-15 minutes') THEN 1 ELSE window_count+1 END
    WHERE last_request<datetime('now','-15 minutes') OR window_count<?`).bind(key,limit).run();
  return !!r.meta?.changes;
}
async function hashThrottle(env,s){return (await jobSignature(env,'limit',s)).slice(0,48);}
async function recover(request,env,ctx){
  if(request.method!=='POST')return error('Method not allowed',405);
  if(!sameOrigin(request)||!request.headers.get('content-type')?.includes('application/json'))return error('Invalid request',403);
  if(!env.STORE_DB||!env.RESEND_API_KEY||!deliverySigningKey(env))return error('Recovery unavailable',503);
  if(Number(request.headers.get('content-length')||0)>1000)return error('Request too large',413);
  let data;try{data=await request.json();}catch{return error('Invalid email',400);}
  const email=normalizeEmail(data?.email);
  if(email.length>254||!EMAIL_RE.test(email))return error('Enter a valid email address',400);
  const neutral=()=>reply({message:'If an eligible purchase exists for that email, a recovery link will be sent shortly.'});
  // Recovery is based on the original PAID SESSION mode, not today's sales
  // switch. Pausing live checkout must not lock out previous live customers.
  const emailKey=await hashThrottle(env,'email:'+email);
  const addr=(request.headers.get('cf-connecting-ip')||'unknown').slice(0,80);
  const ipKey=await hashThrottle(env,'ip:'+addr);
  const allowedIp=await throttle(env,ipKey,6);
  const allowedEmail=await throttle(env,emailKey,1);
  if(!allowedIp||!allowedEmail)return neutral();
  const paid=await env.STORE_DB.prepare(`SELECT id,stripe_session_id FROM orders WHERE lower(buyer_email)=? AND status='paid'
    AND paid_at>=datetime('now','-30 days') AND (pdf_key='__rr_bundle__' OR download_count<5) ORDER BY paid_at DESC LIMIT 8`).bind(email).all();
  let queued=0;
  for(const order of paid.results||[]){
    // Legacy Stripe sandbox purchases may NEVER send recovery mail to an
    // arbitrary address; authentic live purchases can recover while paused.
    if(!recipientAllowed(env,email,order.stripe_session_id))continue;
    await env.STORE_DB.prepare(`INSERT INTO email_jobs (id,order_id,email,purpose) VALUES (?,?,?,'recover')`)
      .bind('recover-'+crypto.randomUUID(),order.id,email).run();
    queued++;
  }
  if(queued && ctx?.waitUntil)ctx.waitUntil(sendQueuedEmails(env,8).catch(()=>{}));
  return neutral();
}

async function listProducts(env){
  if(!env.STORE_DB)return error('Catalog temporarily unavailable',503);
  const records=await env.STORE_DB.prepare(`SELECT id,title,slug,category,race_date,track,description,price_cents,image_url,pdf_key
    FROM products WHERE status='published' AND pdf_key IS NOT NULL ORDER BY race_date DESC,created_at DESC LIMIT 150`).all();
  const products=[];
  for(const p of records.results||[]){
    const {pdf_key,...publicFields}=p;
    if(pdf_key!==BUNDLE_KEY){products.push({...publicFields,kind:'single'});continue;}
    // Fail closed: a published bundle must still contain 2–12 available PDFs.
    const children=await env.STORE_DB.prepare(`SELECT c.title,c.status,c.pdf_key,a.product_id AS asset_id FROM bundle_items bi
      LEFT JOIN products c ON c.id=bi.product_id LEFT JOIN bundle_only_assets a ON a.product_id=c.id WHERE bi.bundle_id=? ORDER BY bi.position`).bind(p.id).all();
    const items=children.results||[];
    if(items.length<2||items.length>12||items.some(c=>!c.pdf_key||c.pdf_key===BUNDLE_KEY||!(c.status==='published'||(c.status==='draft'&&c.asset_id))))continue;
    products.push({...publicFields,kind:'bundle',bundle_count:items.length,included_titles:items.map(x=>x.title)});
  }
  return reply({products,checkout_ready:stripeReady(env),checkout_mode:checkoutMode(env)});
}
async function checkout(request,env){
  if(request.method!=='POST')return error('Method not allowed',405);
  const mode=checkoutMode(env);
  if(!stripeReady(env)||!env.STORE_DB)return error('Checkout unavailable',503);
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
  const ops=[env.STORE_DB.prepare(`INSERT INTO orders (id,product_id,product_title,pdf_key,amount_cents,status)
    VALUES (?,?,?,?,?,'initiated')`).bind(orderId,p.id,p.title,p.pdf_key,p.price_cents)];
  if(p.pdf_key===BUNDLE_KEY){
    const children=await env.STORE_DB.prepare(`SELECT c.id,c.title,c.pdf_key,c.status,a.product_id AS asset_id FROM bundle_items bi
      LEFT JOIN products c ON c.id=bi.product_id LEFT JOIN bundle_only_assets a ON a.product_id=c.id WHERE bi.bundle_id=? ORDER BY bi.position`).bind(p.id).all();
    const items=children.results||[];
    if(items.length<2||items.length>12||items.some(c=>!c.pdf_key||c.pdf_key===BUNDLE_KEY||!(c.status==='published'||(c.status==='draft'&&c.asset_id))))
      return error('Bundle contents are currently unavailable',409);
    items.forEach((c,i)=>ops.push(env.STORE_DB.prepare(
      'INSERT INTO bundle_order_items (order_id,product_id,product_title,pdf_key,position) VALUES (?,?,?,?,?)'
    ).bind(orderId,c.id,c.title,c.pdf_key,i)));
  }
  await env.STORE_DB.batch(ops);
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
    session=await stripeRequest(env,mode,'POST','checkout/sessions',fields);
    if(session.livemode!==(mode==='live')||typeof session.url!=='string'||!session.url.startsWith('https://checkout.stripe.com/')||!SESSION_RE.test(session.id)||sessionMode(session.id)!==mode)throw Error('Unexpected Stripe session');
    await env.STORE_DB.prepare(`UPDATE orders SET stripe_session_id=?,status='pending' WHERE id=? AND status='initiated'`).bind(session.id,orderId).run();
  }catch(e){
    await env.STORE_DB.prepare(`UPDATE orders SET status='failed' WHERE id=? AND status='initiated'`).bind(orderId).run().catch(()=>{});
    console.error('Checkout creation failed',String(e));return error('Unable to start checkout',502);
  }
  return reply({url:session.url});
}
async function orderStatus(url,env){
  const id=orderSessionId(url);if(!id)return error('Invalid session',400);
  if(!env.STORE_DB)return error('Orders unavailable',503);
  const o=await env.STORE_DB.prepare(`SELECT id,product_title,pdf_key,amount_cents,status,paid_at,download_count
    FROM orders WHERE stripe_session_id=?`).bind(id).first();
  if(!o)return error('Order not found',404);
  const bundle=o.pdf_key===BUNDLE_KEY;
  return reply({title:o.product_title,amount_cents:o.amount_cents,status:o.status,paid_at:o.paid_at,
    downloads_remaining:bundle?null:Math.max(0,5-o.download_count),bundle,
    items:bundle&&o.status==='paid'?await bundleItems(env,o.id):[],checkout_mode:sessionMode(id)});
}
async function download(url,env){
  const id=orderSessionId(url);if(!id)return error('Invalid session',400);
  if(!env.STORE_DB||!env.CARDS_BUCKET)return error('Downloads unavailable',503);
  const row=await env.STORE_DB.prepare(`SELECT id,pdf_key,product_title FROM orders WHERE stripe_session_id=? AND status='paid'
    AND paid_at>=datetime('now','-30 days') AND (pdf_key=? OR download_count<5)`).bind(id,BUNDLE_KEY).first();
  if(!row)return error('Download not available or expired',403);
  if(row.pdf_key===BUNDLE_KEY)return downloadBundleItem(env,row.id,url.searchParams.get('item_id'));
  const obj=await env.CARDS_BUCKET.get(row.pdf_key);if(!obj)return error('PDF temporarily unavailable',503);
  const upd=await env.STORE_DB.prepare(`UPDATE orders SET download_count=download_count+1 WHERE stripe_session_id=?
    AND status='paid' AND paid_at>=datetime('now','-30 days') AND download_count<5`).bind(id).run();
  if(!upd.meta?.changes)return error('Download limit reached',403);
  const name=String(row.product_title||'rail-and-rye').normalize('NFKD').replace(/[^a-zA-Z0-9 -]/g,'').trim().replace(/\s+/g,'-').slice(0,70)||'rail-and-rye';
  return new Response(obj.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${name}.pdf"`,
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
}
export async function handleCommerce(request,env,url,ctx){
  const p=url.pathname;
  if(p==='/api/products'&&request.method==='GET')return listProducts(env);
  if(p==='/api/checkout')return checkout(request,env);
  if(p==='/api/stripe/webhook')return webhook(request,env,ctx,'test');
  if(p==='/api/stripe/live-webhook')return webhook(request,env,ctx,'live');
  if(p==='/api/delivery/download')return accessPdf(request,env);
  if(p==='/api/delivery/items')return deliveryItems(request,env);
  if(p==='/api/recovery/request')return recover(request,env,ctx);
  if(/^\/api\/orders\/[^/]+\/status$/.test(p)&&request.method==='GET')return orderStatus(url,env);
  if(/^\/api\/orders\/[^/]+\/download$/.test(p)&&request.method==='GET')return download(url,env);
  return error('Not found',404);
}

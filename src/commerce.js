import {BUNDLE_KEY} from './bundles.js';
import {ensureReleaseSchedule,ensureRacePdfExpirySchema,racePdfExpired,pdfExpiryFromRaceDate} from './publication-schedule.js';
import {processMembershipStripeEvent} from './memberships.js';
import {hasProductTabData,discoverGPTPublishedProducts} from './product-tab-content.js';
/* Rail & Rye fail-closed checkout. Default sandbox. Live activation is separate,
   requires verified Stripe keys and an explicit control flag; no public R2 URLs.
   Stripe secrets are Cloudflare Worker SECRETS, never source files. */
const enc = new TextEncoder();
const TAB_KEY='__rr_tab_access__';
const API_JSON = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const reply = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:API_JSON});
const error = (m,s=400)=>reply({error:m},s);
const SESSION_RE=/^cs_(?:test|live)_[A-Za-z0-9_]{10,200}$/;
const UUID_RE=/^[0-9a-f-]{36}$/i;
const MAX_BODY=128*1024;
const RR_SITE='https://railandryeracing.com';
const MAIL_FROM='Rail & Rye Racing <orders@railandryeracing.com>';
const JOB_RE=/^(purchase|recover|update)-[0-9a-f-]{36}$/i;
const ACCESS_RE=/^((?:purchase|recover|update)-[0-9a-f-]{36})\.([a-f0-9]{64})$/i;
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
export function checkoutReadiness(env){
  const payment_mode=checkoutMode(env);
  const inspectMode=payment_mode==='paused'?(env.RR_PAYMENT_MODE==='live'?'live':'test'):payment_mode;
  const delivery=deliverySigningKey(env);
  return {payment_mode,checkout_ready:stripeReady(env),requirements:{
    store_database:!!env.STORE_DB,
    private_storage:!!env.CARDS_BUCKET,
    stripe_key:stripeReadyFor(env,inspectMode),
    stripe_webhook:typeof webhookSecret(env,inspectMode)==='string'&&webhookSecret(env,inspectMode).startsWith('whsec_'),
    email_delivery:typeof env.RESEND_API_KEY==='string'&&env.RESEND_API_KEY.startsWith('re_'),
    access_signing_key:typeof delivery==='string'&&delivery.length>=16,
    live_activation:env.RR_PAYMENT_MODE!=='live'||env.RR_LIVE_ACTIVATION==='CONFIRM_LIVE_SALES',
    dedicated_live_signing_key:inspectMode!=='live'||(typeof env.RR_DELIVERY_SIGNING_KEY==='string'&&env.RR_DELIVERY_SIGNING_KEY.length>=32)
  }};
}
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

// Checkout Sessions can represent unused shipping/tax totals as null. These
// digital products allow no nonzero shipping or tax, while Stripe calculates
// any promotion discount and final amount.
function checkoutAmountsValid(session,expectedSubtotal){
  const subtotal=session.amount_subtotal,discount=session.total_details?.amount_discount;
  const tax=session.total_details?.amount_tax,shipping=session.total_details?.amount_shipping;
  return Number.isSafeInteger(subtotal)&&subtotal>=50&&
    (expectedSubtotal===undefined||subtotal===expectedSubtotal)&&
    Number.isSafeInteger(discount)&&discount>=0&&discount<=subtotal&&
    (tax===0||tax===null||tax===undefined)&&
    (shipping===0||shipping===null||shipping===undefined)&&
    Number.isSafeInteger(session.amount_total)&&session.amount_total===subtotal-discount;
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
  try{ops.push(...await processMembershipStripeEvent(env,evt,mode));}
  catch(e){console.error('Membership webhook processing failed',String(e).slice(0,120));return error('Membership event could not be processed',500);}
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(evt.type)){
    // Stripe, not the browser, calculates the promotion discount. Match the
    // original catalog subtotal to D1 and verify the exact discounted total.
    // No shipping or tax is configured for these digital-only Checkout Sessions.
    const subtotal=obj.amount_subtotal;
    const amountsValid=checkoutAmountsValid(obj);
    const paidIntent=obj.amount_total>0&&obj.payment_status==='paid'&&
      typeof obj.payment_intent==='string'&&obj.payment_intent.startsWith('pi_');
    // A 100%-off Stripe-hosted Checkout Session has no PaymentIntent. Require
    // Stripe's no_payment_required status, no intent and a fully verified total.
    const freeCheckout=obj.amount_total===0&&
      (obj.payment_status==='no_payment_required'||obj.payment_status==='paid')&&
      (obj.payment_intent===null||obj.payment_intent===undefined);
    if(obj.livemode===(mode==='live')&&amountsValid&&(paidIntent||freeCheckout)&&
      obj.mode==='payment'&&obj.currency==='usd'&&obj.metadata?.order_id&&
      typeof obj.id==='string'&&SESSION_RE.test(obj.id)&&sessionMode(obj.id)===mode){
      ops.push(env.STORE_DB.prepare(`UPDATE orders SET status='paid',stripe_payment_intent=?,buyer_email=?,paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP)
        WHERE id=? AND stripe_session_id=? AND amount_cents=? AND status IN ('pending','paid')
        AND NOT EXISTS (SELECT 1 FROM payment_revocations WHERE payment_intent=?)`)
        .bind(paidIntent?obj.payment_intent:null, normalizeEmail(obj.customer_details?.email).slice(0,254),obj.metadata.order_id,obj.id,subtotal,paidIntent?obj.payment_intent:null));
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
  const title=String(order.product_title||'Racing Intelligence');
  const live=sessionMode(order.stripe_session_id)==='live';
  const intro=j.purpose==='recover'?'Here is your replacement access link.':live?'Your purchase is confirmed and your tabs are ready.':'Your Stripe sandbox purchase is confirmed and the test tabs are ready.';
  const accessLimit='The secure activation link expires 24 hours after delivery. Once activated, your purchased tab access lasts up to '+String(order.access_days||7)+' days and ends at the racing-date access cutoff. Refunded orders lose access.';
  const textBody='Rail & Rye Racing\\n\\n'+intro+'\\n\\n'+title+'\\nOpen your purchase: '+link+'\\n\\n'+accessLimit+' Visit '+RR_SITE+'/store/recover.html to request a replacement link.\\n\\n'+(live?'For support: support@railandryeracing.com':'SANDBOX TEST EMAIL - NO REAL PAYMENT WAS TAKEN.')+'\\n\\nRail & Rye Racing';
  const html='<!doctype html><html><body style="background:#f7f5ef;color:#12253c;font-family:Arial,sans-serif;padding:28px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e1d7c9;padding:30px"><p style="font:28px Georgia,serif;letter-spacing:4px;color:#0b203a">RAIL &amp; RYE</p><p style="font-size:11px;color:#987548;letter-spacing:2px">SECURE TAB ACCESS'+(live?'':' · SANDBOX')+'</p><h1 style="font:30px Georgia,serif;color:#0b203a">Your purchase is ready</h1><p>'+escapeHtml(intro)+'</p><h2 style="font:22px Georgia,serif">'+escapeHtml(title)+'</h2><p><a style="display:inline-block;padding:17px 20px;background:#0b203a;color:#fff;text-decoration:none" href="'+escapeHtml(link)+'">OPEN YOUR PURCHASE</a></p><p style="line-height:1.7;color:#566477;font-size:13px">'+escapeHtml(accessLimit)+' <a href="'+RR_SITE+'/store/recover.html">Request a replacement access link</a>.</p>'+(live?'<p style="font-size:12px;color:#a36728">Questions? Email support@railandryeracing.com</p>':'<p style="font-size:12px;color:#a36728">SANDBOX ONLY — NO REAL CHARGES</p>')+'</div></body></html>';
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'rr-tab-v1-'+j.id},
    body:JSON.stringify({from:MAIL_FROM,to:[j.email],subject:'Rail & Rye | Your tab access is ready'+(live?'':' (TEST)'),html,text:textBody})
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.id){console.warn('Resend delivery failed',response.status,body?.name||'unknown');throw Error('Email provider request failed');}
  return String(body.id).slice(0,120);
}
export async function sendQueuedEmails(env,limit=8){
  if(!env.STORE_DB||!env.RESEND_API_KEY?.startsWith('re_')||!deliverySigningKey(env))return 0;
  const pending=await env.STORE_DB.prepare(`SELECT j.id,j.order_id,j.email,j.purpose,j.attempts,o.stripe_session_id
    FROM email_jobs j JOIN orders o ON o.id=j.order_id
    WHERE o.status='paid' AND datetime(o.paid_at, '+' || o.access_days || ' days') > CURRENT_TIMESTAMP
    AND (
      (o.pdf_key=? AND EXISTS(SELECT 1 FROM products sku WHERE sku.id=o.product_id AND
        ((sku.pdf_key=? AND EXISTS(SELECT 1 FROM bundle_order_items bi JOIN products bp ON bp.id=bi.product_id
          WHERE bi.order_id=o.id AND COALESCE(bi.pdf_expires_at,bp.pdf_expires_at)>CURRENT_TIMESTAMP))
         OR ((sku.pdf_key IS NULL OR sku.pdf_key<>?) AND COALESCE(o.pdf_expires_at,sku.pdf_expires_at)>CURRENT_TIMESTAMP))))
      OR (o.pdf_key<>? AND COALESCE(o.pdf_expires_at,(SELECT pdf_expires_at FROM products WHERE id=o.product_id))>CURRENT_TIMESTAMP)
      OR (o.pdf_key=? AND EXISTS(SELECT 1 FROM bundle_order_items bi JOIN products p ON p.id=bi.product_id WHERE bi.order_id=o.id AND COALESCE(bi.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP)))
    AND j.attempts<6 AND ((j.state='queued' AND j.next_attempt_at<=CURRENT_TIMESTAMP)
    OR (j.state='sending' AND j.claimed_at<datetime('now','-3 minutes')))
    ORDER BY j.created_at ASC LIMIT ?`).bind(TAB_KEY,BUNDLE_KEY,BUNDLE_KEY,BUNDLE_KEY,BUNDLE_KEY,limit).all();
  let sent=0;
  for(const j of pending.results||[]){
    if(!JOB_RE.test(j.id)||!recipientAllowed(env,j.email,j.stripe_session_id))continue;
    const claim=await env.STORE_DB.prepare(`UPDATE email_jobs SET state='sending',claimed_at=CURRENT_TIMESTAMP,attempts=attempts+1
      WHERE id=? AND attempts<6 AND ((state='queued' AND next_attempt_at<=CURRENT_TIMESTAMP)
        OR (state='sending' AND claimed_at<datetime('now','-3 minutes')))`)
      .bind(j.id).run();
    if(!claim.meta?.changes)continue;
    try{
      const o=await env.STORE_DB.prepare(`SELECT product_title,pdf_key,status,stripe_session_id,access_days,pdf_expires_at FROM orders WHERE id=?`).bind(j.order_id).first();
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
  sent += await sendQueuedProductUpdateEmails(env,Math.max(0,limit-sent));
  return sent;
}

async function sendProductUpdateEmail(env,j,order){
  if(!env.RESEND_API_KEY?.startsWith('re_')||!deliverySigningKey(env))throw Error('Email integration is not configured');
  if(!recipientAllowed(env,j.email,order.stripe_session_id))throw Error('Delivery recipient not eligible');
  const link=await deliveryLink(env,j),title=String(j.product_title||'your publication');
  const live=sessionMode(order.stripe_session_id)==='live';
  const textBody='Rail & Rye Racing\n\nA revised PDF is ready for '+title+', which you previously purchased.\nDownload the updated PDF: '+link+'\n\nThis secure link expires 24 hours after delivery. Your purchase access remains active until its original expiration date, with up to 5 downloads of this revised PDF before its two-day racing-date cutoff. Need a copy after expiry? Email support@railandryeracing.com. Refunded orders lose access.\n\n'+(live?'For support: support@railandryeracing.com':'SANDBOX TEST EMAIL - NO REAL PAYMENT WAS TAKEN.')+'\n\nRail & Rye Racing';
  const html='<!doctype html><html><body style="background:#f7f5ef;color:#12253c;font-family:Arial,sans-serif;padding:28px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e1d7c9;padding:30px"><p style="font:28px Georgia,serif;letter-spacing:4px;color:#0b203a">RAIL &amp; RYE</p><p style="font-size:11px;color:#987548;letter-spacing:2px">PRODUCT UPDATE'+(live?'':' · SANDBOX')+'</p><h1 style="font:30px Georgia,serif;color:#0b203a">An updated PDF is ready</h1><p>A revised PDF is available for a publication you previously purchased.</p><h2 style="font:22px Georgia,serif">'+escapeHtml(title)+'</h2><p><a style="display:inline-block;padding:17px 20px;background:#0b203a;color:#fff;text-decoration:none" href="'+escapeHtml(link)+'">DOWNLOAD UPDATED PDF</a></p><p style="line-height:1.7;color:#566477;font-size:13px">This secure link expires 24 hours after delivery. Your original purchase access window remains in effect, with up to 5 downloads of this revised PDF before the two-day racing-date cutoff. Email support@railandryeracing.com if you need a copy after expiry. Refunded orders lose access.</p>'+(live?'<p style="font-size:12px;color:#a36728">Questions? Email support@railandryeracing.com</p>':'<p style="font-size:12px;color:#a36728">SANDBOX ONLY — NO REAL CHARGES</p>')+'</div></body></html>';
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'rr-update-'+j.id},body:JSON.stringify({from:MAIL_FROM,to:[j.email],subject:'Rail & Rye | Updated PDF: '+title+(live?'':' (TEST)'),html,text:textBody})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.id){console.warn('Resend update notice failed',response.status,body?.name||'unknown');throw Error('Email provider request failed');}
  return String(body.id).slice(0,120);
}

// Replace a published PDF or bundle-only PDF. Entitlements include standalone
// buyers and bundle snapshots; queue one secure update link per active paid
// order. Historical PDF snapshots remain untouched.
export async function replacePdfAndNotifyBuyers(env,item,pdfKey){
  await env.STORE_DB.prepare("CREATE TABLE IF NOT EXISTS product_update_jobs (id TEXT PRIMARY KEY,order_id TEXT NOT NULL,product_id TEXT NOT NULL,email TEXT NOT NULL,product_title TEXT NOT NULL,updated_pdf_key TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','sent')),attempts INTEGER NOT NULL DEFAULT 0,download_count INTEGER NOT NULL DEFAULT 0 CHECK(download_count>=0),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,claimed_at TEXT,sent_at TEXT,provider_id TEXT,last_error TEXT,UNIQUE(order_id,product_id,updated_pdf_key),FOREIGN KEY(order_id) REFERENCES orders(id))").run();
  await env.STORE_DB.prepare('CREATE INDEX IF NOT EXISTS idx_product_update_jobs_due ON product_update_jobs(state,next_attempt_at)').run();
  const purchases=await env.STORE_DB.prepare("SELECT o.id AS order_id,o.buyer_email AS email,o.stripe_session_id FROM orders o WHERE o.status='paid' AND o.buyer_email IS NOT NULL AND datetime(o.paid_at, '+' || o.access_days || ' days') > CURRENT_TIMESTAMP AND o.pdf_key<>? AND ((o.product_id=? AND COALESCE(o.pdf_expires_at,(SELECT pdf_expires_at FROM products WHERE id=o.product_id))>CURRENT_TIMESTAMP) OR EXISTS(SELECT 1 FROM bundle_order_items bi JOIN products p ON p.id=bi.product_id WHERE bi.order_id=o.id AND bi.product_id=? AND COALESCE(bi.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP))").bind(TAB_KEY,item.id,item.id).all();
  const statements=[env.STORE_DB.prepare('UPDATE products SET pdf_key=? WHERE id=?').bind(pdfKey,item.id)];
  for(const order of purchases.results||[]){
    if(!recipientAllowed(env,order.email,order.stripe_session_id))continue;
    statements.push(env.STORE_DB.prepare('INSERT OR IGNORE INTO product_update_jobs (id,order_id,product_id,email,product_title,updated_pdf_key) VALUES (?,?,?,?,?,?)').bind('update-'+crypto.randomUUID(),order.order_id,item.id,normalizeEmail(order.email),item.title,pdfKey));
  }
  await env.STORE_DB.batch(statements);
  return statements.length-1;
}

async function sendQueuedProductUpdateEmails(env,limit=8){
  if(!env.STORE_DB||!env.RESEND_API_KEY?.startsWith('re_')||!deliverySigningKey(env))return 0;
  let pending;
  try{pending=await env.STORE_DB.prepare("SELECT j.id,j.order_id,j.product_id,j.email,j.product_title,j.attempts,o.stripe_session_id FROM product_update_jobs j JOIN orders o ON o.id=j.order_id JOIN products p ON p.id=j.product_id WHERE o.status='paid' AND datetime(o.paid_at, '+' || o.access_days || ' days') > CURRENT_TIMESTAMP AND ((o.product_id=j.product_id AND COALESCE(o.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP) OR EXISTS(SELECT 1 FROM bundle_order_items bi WHERE bi.order_id=o.id AND bi.product_id=j.product_id AND COALESCE(bi.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP)) AND j.attempts<6 AND ((j.state='queued' AND j.next_attempt_at<=CURRENT_TIMESTAMP) OR (j.state='sending' AND j.claimed_at<datetime('now','-3 minutes'))) ORDER BY j.created_at ASC LIMIT ?").bind(limit).all();}
  catch{return 0;}
  let sent=0;
  for(const j of pending.results||[]){
    if(!/^update-[0-9a-f-]{36}$/i.test(j.id)||!recipientAllowed(env,j.email,j.stripe_session_id))continue;
    const claim=await env.STORE_DB.prepare("UPDATE product_update_jobs SET state='sending',claimed_at=CURRENT_TIMESTAMP,attempts=attempts+1 WHERE id=? AND attempts<6 AND ((state='queued' AND next_attempt_at<=CURRENT_TIMESTAMP) OR (state='sending' AND claimed_at<datetime('now','-3 minutes')))").bind(j.id).run();
    if(!claim.meta?.changes)continue;
    try{
      const order=await env.STORE_DB.prepare('SELECT status,stripe_session_id,access_days FROM orders WHERE id=?').bind(j.order_id).first();
      if(order?.status!=='paid')continue;
      const providerId=await sendProductUpdateEmail(env,j,order);
      await env.STORE_DB.prepare("UPDATE product_update_jobs SET state='sent',provider_id=?,sent_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=? AND state='sending'").bind(providerId,j.id).run();
      sent++;
    }catch(e){
      const minutes=Math.min(60,2**Math.min(6,(j.attempts||0)+1));
      await env.STORE_DB.prepare("UPDATE product_update_jobs SET state='queued',last_error='Delivery temporarily unavailable',next_attempt_at=datetime('now',?||' minutes') WHERE id=? AND state='sending'").bind('+'+minutes,j.id).run();
      console.warn('Product update notice retry queued',j.id,String(e).slice(0,100));
    }
  }
  return sent;
}

// Paid bundle items always use the PDF key snapshotted at checkout. Archiving or
// updating a product never removes a previously purchased PDF entitlement.
async function bundleItems(env,orderId) {
  const rows=await env.STORE_DB.prepare(
    `SELECT bi.product_id AS id,bi.product_title AS title,bi.download_count,
       COALESCE(bi.pdf_expires_at,p.pdf_expires_at) AS pdf_expires_at,
       CASE WHEN COALESCE(bi.pdf_expires_at,p.pdf_expires_at) IS NULL
         OR datetime(COALESCE(bi.pdf_expires_at,p.pdf_expires_at))<=CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired
     FROM bundle_order_items bi LEFT JOIN products p ON p.id=bi.product_id
     WHERE bi.order_id=? ORDER BY bi.position LIMIT 12`
  ).bind(orderId).all();
  return (rows.results||[]).map(p=>({id:p.id,title:p.title,downloads_remaining:Math.max(0,5-p.download_count),expires_at:p.pdf_expires_at,expired:!!p.expired}));
}
async function downloadBundleItem(env,orderId,itemId) {
  if(!UUID_RE.test(itemId||''))return error('Select an included PDF',400);
  const item=await env.STORE_DB.prepare(`SELECT bi.product_title,bi.pdf_key FROM bundle_order_items bi
    JOIN orders o ON o.id=bi.order_id JOIN products p ON p.id=bi.product_id
    WHERE bi.order_id=? AND bi.product_id=? AND o.status='paid'
    AND datetime(o.paid_at, '+' || o.access_days || ' days') > CURRENT_TIMESTAMP
    AND COALESCE(bi.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP
    AND bi.download_count<5`).bind(orderId,itemId).first();
  if(!item)return error('This racing-date access period has ended.',410);
  if(item.pdf_key===TAB_KEY)return error('This purchase is available in My Racing Tabs.',410);
  const file=await env.CARDS_BUCKET.get(item.pdf_key);
  if(!file)return error('PDF temporarily unavailable',503);
  const change=await env.STORE_DB.prepare(`UPDATE bundle_order_items SET download_count=download_count+1
    WHERE order_id=? AND product_id=? AND download_count<5
      AND COALESCE(pdf_expires_at,(SELECT pdf_expires_at FROM products WHERE id=?))>CURRENT_TIMESTAMP
      AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='paid' AND datetime(paid_at, '+' || access_days || ' days') > CURRENT_TIMESTAMP)`)
    .bind(orderId,itemId,itemId,orderId).run();
  if(!change.meta?.changes)return error('Download not available or expired',403);
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
  if(order.pdf_key===TAB_KEY)return reply({tab_access:true,next_url:'/my-products/',bundle:false,items:[]});
  if(order.purpose==='update')return reply({bundle:false,items:[{id:null,title:order.product_title,downloads_remaining:Math.max(0,5-order.download_count),expires_at:order.pdf_expires_at}]});
  if(order.pdf_key!==BUNDLE_KEY)return reply({bundle:false,items:[{id:null,title:order.product_title,downloads_remaining:5-order.download_count,expires_at:order.pdf_expires_at}]});
  return reply({bundle:true,items:await bundleItems(env,order.order_id)});
}

async function deliveryBundleArchive(request,env){
  if(request.method!=='POST')return error('Method not allowed',405);
  if(!sameOrigin(request))return error('Same-origin request required',403);
  if(!env.STORE_DB||!env.CARDS_BUCKET)return error('Downloads unavailable',503);
  if(Number(request.headers.get('content-length')||0)>1000)return error('Request too large',413);
  let data;try{data=await request.json();}catch{return error('Invalid request',400);}
  const j=await accessJob(data?.code,env);
  if(!j||j.purpose==='update'||j.pdf_key!==BUNDLE_KEY)return error('Bundle download not available or expired',403);
  const order=await env.STORE_DB.prepare(`SELECT id,product_title FROM orders WHERE id=? AND pdf_key=?
    AND status='paid' AND datetime(paid_at, '+' || access_days || ' days') > CURRENT_TIMESTAMP`).bind(j.order_id,BUNDLE_KEY).first();
  if(!order)return error('Bundle download not available or expired',403);
  return bundleArchiveResponse(env,order);
}
async function accessJob(code,env){
  const m=ACCESS_RE.exec(code||'');if(!m||!deliverySigningKey(env))return null;
  const isUpdate=m[1].startsWith('update-');
  const j=isUpdate
    ? await env.STORE_DB.prepare(`SELECT j.id,j.order_id,j.created_at,j.product_title,j.updated_pdf_key AS pdf_key,j.download_count,'update' AS purpose,
        o.status,o.paid_at,o.stripe_session_id,
        COALESCE((SELECT bi.pdf_expires_at FROM bundle_order_items bi WHERE bi.order_id=o.id AND bi.product_id=j.product_id),
          o.pdf_expires_at,p.pdf_expires_at) AS pdf_expires_at
      FROM product_update_jobs j JOIN orders o ON o.id=j.order_id JOIN products p ON p.id=j.product_id
      WHERE j.id=? AND j.state='sent' AND j.sent_at>=datetime('now','-24 hours') AND j.download_count<5
        AND o.status='paid' AND datetime(o.paid_at, '+' || o.access_days || ' days') > CURRENT_TIMESTAMP
        AND COALESCE((SELECT bi.pdf_expires_at FROM bundle_order_items bi WHERE bi.order_id=o.id AND bi.product_id=j.product_id),
          o.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP`).bind(m[1]).first()
    : await env.STORE_DB.prepare(`SELECT j.id,j.order_id,j.created_at,j.purpose,o.product_title,o.pdf_key,o.status,o.paid_at,o.download_count,o.stripe_session_id,
        COALESCE(o.pdf_expires_at,p.pdf_expires_at) AS pdf_expires_at
      FROM email_jobs j JOIN orders o ON o.id=j.order_id LEFT JOIN products p ON p.id=o.product_id
      WHERE j.id=? AND j.state='sent' AND j.sent_at>=datetime('now','-24 hours') AND o.status='paid'
        AND datetime(o.paid_at, '+' || o.access_days || ' days') > CURRENT_TIMESTAMP
        AND ((o.pdf_key=? AND EXISTS(SELECT 1 FROM bundle_order_items bi JOIN products bp ON bp.id=bi.product_id
          WHERE bi.order_id=o.id AND COALESCE(bi.pdf_expires_at,bp.pdf_expires_at)>CURRENT_TIMESTAMP))
          OR (o.pdf_key<>? AND COALESCE(o.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP
            AND o.pdf_key IS NOT NULL AND o.download_count<5))`).bind(m[1],BUNDLE_KEY,BUNDLE_KEY).first();
  if(!j)return null;
  const supplied=m[2].toLowerCase();
  const valid=safeEq(await jobSignature(env,j.id,j.order_id),supplied)||
    (!!env.RR_DELIVERY_SIGNING_KEY&&!!env.STRIPE_WEBHOOK_SECRET&&
      safeEq(await jobSignature(env,j.id,j.order_id,env.STRIPE_WEBHOOK_SECRET),supplied));
  return valid?j:null;
}

export async function verifyStoreAccessCode(code,env){
  const match=ACCESS_RE.exec(String(code||''));
  if(!match||match[1].startsWith('update-')||!env.STORE_DB||!deliverySigningKey(env))return null;
  const job=await env.STORE_DB.prepare(`SELECT j.id,j.order_id FROM email_jobs j JOIN orders o ON o.id=j.order_id
    WHERE j.id=? AND j.purpose IN ('purchase','recover') AND j.state='sent'
      AND j.sent_at>=datetime('now','-24 hours') AND o.status='paid'
      AND datetime(o.paid_at, '+' || o.access_days || ' days')>CURRENT_TIMESTAMP`).bind(match[1]).first();
  if(!job)return null;
  const supplied=match[2].toLowerCase();
  const valid=safeEq(await jobSignature(env,job.id,job.order_id),supplied)||
    (!!env.RR_DELIVERY_SIGNING_KEY&&!!env.STRIPE_WEBHOOK_SECRET&&
      safeEq(await jobSignature(env,job.id,job.order_id,env.STRIPE_WEBHOOK_SECRET),supplied));
  return valid?job.order_id:null;
}

async function accessPdf(request,env){
  if(request.method!=='POST')return error('Method not allowed',405);
  if(!sameOrigin(request))return error('Same-origin request required',403);
  if(!env.STORE_DB||!env.CARDS_BUCKET)return error('Downloads unavailable',503);
  if(Number(request.headers.get('content-length')||0)>1000)return error('Request too large',413);
  let data;try{data=await request.json();}catch{return error('Invalid request',400);}
  const j=await accessJob(data?.code,env);
  if(!j)return error('This PDF is no longer available after its two-day race-date window. Need a copy? Email support@railandryeracing.com.',410);
  if(j.pdf_key===TAB_KEY)return error('This purchase is available in My Racing Tabs.',410);
  if(j.pdf_key===BUNDLE_KEY)return downloadBundleItem(env,j.order_id,data?.item_id);
  const object=await env.CARDS_BUCKET.get(j.pdf_key);
  if(!object)return error('PDF temporarily unavailable',503);
  const count=j.purpose==='update'
    ? await env.STORE_DB.prepare(`UPDATE product_update_jobs SET download_count=download_count+1
      WHERE id=? AND download_count<5 AND EXISTS(SELECT 1 FROM orders o
        WHERE o.id=? AND o.status='paid' AND datetime(o.paid_at, '+' || o.access_days || ' days')>CURRENT_TIMESTAMP)
      AND COALESCE((SELECT bi.pdf_expires_at FROM bundle_order_items bi WHERE bi.order_id=? AND bi.product_id=(SELECT product_id FROM product_update_jobs WHERE id=?)),
        (SELECT pdf_expires_at FROM orders WHERE id=?),
        (SELECT pdf_expires_at FROM products WHERE id=(SELECT product_id FROM product_update_jobs WHERE id=?)))>CURRENT_TIMESTAMP`).bind(j.id,j.order_id,j.order_id,j.id,j.order_id,j.id).run()
    : await env.STORE_DB.prepare(`UPDATE orders SET download_count=download_count+1 WHERE id=?
      AND status='paid' AND datetime(paid_at, '+' || access_days || ' days') > CURRENT_TIMESTAMP AND download_count<5
      AND COALESCE(pdf_expires_at,(SELECT pdf_expires_at FROM products WHERE id=product_id))>CURRENT_TIMESTAMP`).bind(j.order_id).run();
  if(!count.meta?.changes)return error('Download not available or expired',403);
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
  const paid=await env.STORE_DB.prepare(`SELECT o.id,o.stripe_session_id FROM orders o WHERE lower(o.buyer_email)=? AND o.status='paid'
    AND datetime(o.paid_at, '+' || o.access_days || ' days') > CURRENT_TIMESTAMP
    AND (
      (o.pdf_key=? AND EXISTS(SELECT 1 FROM products sku WHERE sku.id=o.product_id AND
        ((sku.pdf_key=? AND EXISTS(SELECT 1 FROM bundle_order_items bi JOIN products bp ON bp.id=bi.product_id WHERE bi.order_id=o.id AND COALESCE(bi.pdf_expires_at,bp.pdf_expires_at)>CURRENT_TIMESTAMP))
         OR ((sku.pdf_key IS NULL OR sku.pdf_key<>?) AND COALESCE(o.pdf_expires_at,sku.pdf_expires_at)>CURRENT_TIMESTAMP))))
      OR (o.pdf_key=? AND EXISTS(SELECT 1 FROM bundle_order_items bi JOIN products p ON p.id=bi.product_id WHERE bi.order_id=o.id AND COALESCE(bi.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP))
      OR (o.pdf_key<>? AND o.download_count<5 AND COALESCE(o.pdf_expires_at,(SELECT pdf_expires_at FROM products WHERE id=o.product_id))>CURRENT_TIMESTAMP))
    ORDER BY o.paid_at DESC LIMIT 8`).bind(email,TAB_KEY,BUNDLE_KEY,BUNDLE_KEY,BUNDLE_KEY,BUNDLE_KEY).all();
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

const GPT_PRODUCT_CATEGORIES=new Set(["Race Cards","Pick Tickets","Longshot Radar","Target List"]);
function directProductSlug(title,id){
  return (String(title||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"publication")+"-"+id.slice(0,8);
}
async function directProductId(category,raceDate,track){
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(
    "rr-gpt-product-v1|"+category+"|"+raceDate+"|"+String(track||"").trim().toLowerCase())));
  const parts=Array.from(digest.slice(0,16),value=>value.toString(16).padStart(2,"0"));
  parts[6]=(parseInt(parts[6],16)&15|80).toString(16).padStart(2,"0");
  parts[8]=(parseInt(parts[8],16)&63|128).toString(16).padStart(2,"0");
  const hex=parts.join("");
  return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
}
async function syncGPTPublishedCatalog(env){
  let entries=[];
  try{entries=await discoverGPTPublishedProducts(env);}
  catch(error){console.warn("GPT publication catalog discovery deferred",String(error).slice(0,130));return;}
  const configuredPrice=Number(env.RR_GPT_PRODUCT_PRICE_CENTS);
  // Matches the existing publication price default; an explicit runtime value
  // can override it. Existing product prices and titles are always preserved.
  const defaultPrice=Number.isSafeInteger(configuredPrice)&&configuredPrice>=0&&configuredPrice<=500000?configuredPrice:999;
  for(const entry of entries||[]){
    const category=String(entry?.category||""),raceDate=String(entry?.race_date||"");
    const track=String(entry?.track||"").trim(),expiry=pdfExpiryFromRaceDate(raceDate);
    if(!GPT_PRODUCT_CATEGORIES.has(category)||!expiry||racePdfExpired(expiry))continue;
    const candidate={...entry,track,pdf_expires_at:expiry};
    try{
      if(!await hasProductTabData(env,category,raceDate,[candidate]))continue;
      let existing=await env.STORE_DB.prepare(`SELECT id,status,pdf_key FROM products
        WHERE category=? AND race_date=? AND LOWER(COALESCE(TRIM(track),''))=?
        AND (pdf_key IS NULL OR pdf_key<>?)
        AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=products.id)
        AND status<>'archived'
        ORDER BY CASE WHEN status='published' THEN 0 ELSE 1 END,created_at DESC LIMIT 1`)
        .bind(category,raceDate,track.toLowerCase(),BUNDLE_KEY).first();
      if(existing?.status==="published")continue;
      if(existing&&existing.pdf_key!==null&&existing.pdf_key!=="")existing=null;
      if(existing){
        const schedule=await env.STORE_DB.prepare("SELECT release_at FROM product_release_schedule WHERE product_id=?").bind(existing.id).first();
        if(schedule?.release_at){
          const releaseAt=Date.parse(String(schedule.release_at).replace(" ","T")+"Z");
          if(!Number.isFinite(releaseAt)||releaseAt>Date.now())continue;
        }
        await env.STORE_DB.prepare("UPDATE products SET status='published',pdf_expires_at=? WHERE id=? AND status<>'archived'")
          .bind(expiry,existing.id).run();
        continue;
      }
      const id=await directProductId(category,raceDate,track),title=String(entry.title||category+" — "+raceDate).slice(0,140);
      const description=String(entry.description||"Digital access to the published "+category+" edition dated "+raceDate+".").slice(0,4000);
      await env.STORE_DB.prepare(`INSERT OR IGNORE INTO products
        (id,title,slug,category,race_date,track,description,price_cents,pdf_key,image_url,status,pdf_expires_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id,title,directProductSlug(title,id),category,raceDate,track,description,defaultPrice,null,null,"published",expiry).run();
    }catch(error){
      console.warn("GPT publication catalog sync held",category,raceDate,track,String(error).slice(0,120));
    }
  }
}

export async function listProducts(env){
  if(!env.STORE_DB)return error('Catalog temporarily unavailable',503);
  await ensureReleaseSchedule(env);
  await ensureRacePdfExpirySchema(env);
  await syncGPTPublishedCatalog(env);
  const records=await env.STORE_DB.prepare(`SELECT id,title,slug,category,race_date,track,description,price_cents,image_url,pdf_key,pdf_expires_at
    FROM products WHERE status='published' AND category <> 'Stable Notes'
    AND NOT EXISTS(SELECT 1 FROM product_release_schedule s WHERE s.product_id=products.id AND s.release_at>CURRENT_TIMESTAMP)
    AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=products.id)
    ORDER BY race_date DESC,created_at DESC LIMIT 150`).all();
  const products=[];
  for(const p of records.results||[]){
    const {pdf_key,...publicFields}=p;
    if(pdf_key!==BUNDLE_KEY){
      if(racePdfExpired(p.pdf_expires_at))continue;
      if(!await hasProductTabData(env,p.category,p.race_date,[p]))continue;
      products.push({...publicFields,kind:'single',delivery_mode:'tab',categories:[p.category]});continue;
    }
    // Fail closed: every published bundle must contain 2–12 available tab editions.
    const children=await env.STORE_DB.prepare(`SELECT c.id,c.title,c.category,c.race_date,c.track,c.pdf_expires_at,c.status,c.pdf_key,a.product_id AS asset_id,
      CASE WHEN c.pdf_expires_at IS NULL OR datetime(c.pdf_expires_at)<=CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired,
      CASE WHEN s.release_at>CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS pending_release FROM bundle_items bi
      LEFT JOIN products c ON c.id=bi.product_id LEFT JOIN bundle_only_assets a ON a.product_id=c.id
      LEFT JOIN product_release_schedule s ON s.product_id=c.id WHERE bi.bundle_id=? ORDER BY bi.position`).bind(p.id).all();
    const items=children.results||[];
    if(items.length<2||items.length>12||items.some(c=>c.pdf_key===BUNDLE_KEY||c.expired||c.pending_release||c.category==='Stable Notes'||!(c.status==='published'||c.status==='draft')))continue;
    const tabReady=await Promise.all(items.map(item=>hasProductTabData(env,item.category,item.race_date,[item])));
    if(tabReady.some(ready=>!ready))continue;
    // A bundle unlocks each included category/date in the customer tabs.
    const categories=[...new Set([p.category,...items.map(x=>x.category)].filter(Boolean))];
    products.push({...publicFields,kind:'bundle',delivery_mode:'tab',categories,bundle_count:items.length,included_titles:items.map(x=>x.title),
      included_products:items.map(x=>({id:x.id,title:x.title,category:x.category,race_date:x.race_date,track:x.track,pdf_expires_at:x.pdf_expires_at}))});
  }
  return reply({products,checkout_ready:stripeReady(env),checkout_mode:checkoutMode(env)});
}
export async function publicProductForShare(env,id){
  if(!env.STORE_DB||! /^[0-9a-f-]{36}$/i.test(String(id||'')))return null;
  await ensureReleaseSchedule(env);
  const product=await env.STORE_DB.prepare(`SELECT id,title,slug,category,race_date,track,description,price_cents,image_url,pdf_key,pdf_expires_at
    FROM products WHERE id=? AND status='published'
    AND NOT EXISTS(SELECT 1 FROM product_release_schedule s WHERE s.product_id=products.id AND s.release_at>CURRENT_TIMESTAMP)
    AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=products.id) AND category <> 'Stable Notes'`).bind(id).first();
  if(!product)return null;
  const {pdf_key,...publicFields}=product;
  if(pdf_key!==BUNDLE_KEY){
    if(racePdfExpired(product.pdf_expires_at)||!await hasProductTabData(env,product.category,product.race_date,[product]))return null;
    return {...publicFields,kind:'single',delivery_mode:'tab'};
  }
  const children=await env.STORE_DB.prepare(`SELECT c.id,c.title,c.category,c.race_date,c.track,c.pdf_expires_at,c.status,c.pdf_key,a.product_id AS asset_id,
    CASE WHEN c.pdf_expires_at IS NULL OR datetime(c.pdf_expires_at)<=CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired,
    CASE WHEN s.release_at>CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS pending_release FROM bundle_items bi
    LEFT JOIN products c ON c.id=bi.product_id LEFT JOIN bundle_only_assets a ON a.product_id=c.id
    LEFT JOIN product_release_schedule s ON s.product_id=c.id WHERE bi.bundle_id=? ORDER BY bi.position`).bind(id).all();
  const items=children.results||[];
  if(items.length<2||items.length>12||items.some(c=>c.pdf_key===BUNDLE_KEY||c.expired||c.pending_release||c.category==='Stable Notes'||!(c.status==='published'||c.status==='draft')))return null;
  const tabReady=await Promise.all(items.map(item=>hasProductTabData(env,item.category,item.race_date,[item])));
  if(tabReady.some(ready=>!ready))return null;
  return {...publicFields,kind:'bundle',delivery_mode:'tab',bundle_count:items.length,
    categories:[...new Set([publicFields.category,...items.map(x=>x.category)].filter(Boolean))],
    included_titles:items.map(x=>x.title),
    included_products:items.map(x=>({id:x.id,title:x.title,category:x.category,race_date:x.race_date,track:x.track,pdf_expires_at:x.pdf_expires_at}))};
}

async function checkout(request,env){
  if(request.method!=='POST')return error('Method not allowed',405);
  const mode=checkoutMode(env);
  if(!stripeReady(env)||!env.STORE_DB)return error('Checkout unavailable',503);
  await ensureReleaseSchedule(env);
  if(!sameOrigin(request))return error('Same-origin request required',403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return error('Expected JSON',400);
  if(Number(request.headers.get('content-length')||0)>1000)return error('Request too large',413);
  let data;try{data=await request.json();}catch{return error('Invalid JSON',400);}
  if(!UUID_RE.test(data?.product_id||''))return error('Invalid product',400);
  const p=await env.STORE_DB.prepare(`SELECT id,title,description,price_cents,pdf_key,category,status,race_date,track,pdf_expires_at
    FROM products WHERE id=? AND status='published'
    AND NOT EXISTS(SELECT 1 FROM product_release_schedule s WHERE s.product_id=products.id AND s.release_at>CURRENT_TIMESTAMP)
    AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=products.id)`).bind(data.product_id).first();
  if(!p)return error('Product is not available',404);
  if(!Number.isSafeInteger(p.price_cents)||p.price_cents<50||p.price_cents>500000)return error('Product is not available for purchase',400);
  const expiryFor=value=>value&&Number.isFinite(Date.parse(String(value).replace(' ','T')+'Z'))?String(value):null;
  if(p.pdf_key!==BUNDLE_KEY&&!await hasProductTabData(env,p.category,p.race_date,[p]))return error('This racing tab has not been published yet.',409);
  const orderId=crypto.randomUUID(),children=[];
  if(p.pdf_key===BUNDLE_KEY){
    const result=await env.STORE_DB.prepare(`SELECT c.id,c.title,c.category,c.race_date,c.track,c.pdf_key,c.status,c.pdf_expires_at,a.product_id AS asset_id,
      CASE WHEN c.pdf_expires_at IS NULL OR datetime(c.pdf_expires_at)<=CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired,
      CASE WHEN s.release_at>CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS pending_release
      FROM bundle_items bi LEFT JOIN products c ON c.id=bi.product_id
      LEFT JOIN bundle_only_assets a ON a.product_id=c.id
      LEFT JOIN product_release_schedule s ON s.product_id=c.id
      WHERE bi.bundle_id=? ORDER BY bi.position`).bind(p.id).all();
    children.push(...(result.results||[]));
    if(children.length<2||children.length>12||children.some(x=>x.pdf_key===BUNDLE_KEY||x.expired||x.pending_release||!(x.status==='published'||x.status==='draft')))
      return error('Bundle contents are currently unavailable',409);
    const ready=await Promise.all(children.map(item=>hasProductTabData(env,item.category,item.race_date,[item])));
    if(ready.some(value=>!value))return error('A tab in this bundle has not been published yet.',409);
  }else if(racePdfExpired(p.pdf_expires_at)){
    return error('This racing-date access period has ended.',410);
  }
  const accessDeadlines=(children.length?children.map(x=>expiryFor(x.pdf_expires_at)): [expiryFor(p.pdf_expires_at)]).filter(Boolean);
  if(accessDeadlines.length!==(children.length||1))return error('Racing-date access timing is missing. Please contact support.',409);
  const earliestExpiry=Math.min(...accessDeadlines.map(value=>Date.parse(value.replace(' ','T')+'Z')));
  const now=Date.now(),sessionExpiry=Math.min(now+24*60*60*1000,earliestExpiry);
  if(sessionExpiry<now+30*60*1000)return error('The racing-date access period is nearly over, so checkout is no longer available.',410);
  const orderExpiresAt=p.pdf_key===BUNDLE_KEY?null:expiryFor(p.pdf_expires_at);
  const ops=[env.STORE_DB.prepare(`INSERT INTO orders (id,product_id,product_title,pdf_key,amount_cents,status,access_days,pdf_expires_at)
    VALUES (?,?,?,?,?,'initiated',7,?)`).bind(orderId,p.id,p.title,TAB_KEY,p.price_cents,orderExpiresAt)];
  children.forEach((item,i)=>ops.push(env.STORE_DB.prepare(
    'INSERT INTO bundle_order_items (order_id,product_id,product_title,pdf_key,position,pdf_expires_at) VALUES (?,?,?,?,?,?)'
  ).bind(orderId,item.id,item.title,TAB_KEY,i,expiryFor(item.pdf_expires_at))));
  await env.STORE_DB.batch(ops);
  const base=new URL(request.url).origin;
  const fields=new URLSearchParams({
    mode:'payment',
    'branding_settings[display_name]':'Rail & Rye',
    'payment_method_types[0]':'card',
    allow_promotion_codes:'true',
    expires_at:String(Math.floor(sessionExpiry/1000)),
    'line_items[0][quantity]':'1',
    'line_items[0][price_data][currency]':'usd',
    'line_items[0][price_data][unit_amount]':String(p.price_cents),
    'line_items[0][price_data][product_data][name]':p.title.slice(0,120),
    'line_items[0][price_data][product_data][description]':String(p.description||'Rail & Rye racing intelligence tab access').slice(0,450),
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

async function confirmPendingOrder(env,id,order,ctx){
  const mode=sessionMode(id);
  if(!stripeReadyFor(env,mode)||!env.STORE_DB)return;
  let session;
  try{
    session=await stripeRequest(env,mode,'GET','checkout/sessions/'+encodeURIComponent(id));
  }catch(e){
    console.warn('Pending checkout could not be reconciled',String(e).slice(0,100));
    return;
  }
  const subtotal=session.amount_subtotal;
  const amountsValid=checkoutAmountsValid(session,order.amount_cents);
  const paidIntent=session.amount_total>0&&session.payment_status==='paid'&&
    typeof session.payment_intent==='string'&&session.payment_intent.startsWith('pi_');
  const freeCheckout=session.amount_total===0&&
    (session.payment_status==='no_payment_required'||session.payment_status==='paid')&&
    (session.payment_intent===null||session.payment_intent===undefined);
  if(session.id!==id||session.livemode!==(mode==='live')||session.status!=='complete'||
    session.mode!=='payment'||session.currency!=='usd'||session.metadata?.order_id!==order.id||
    !amountsValid||!(paidIntent||freeCheckout))return;
  const email=normalizeEmail(session.customer_details?.email).slice(0,254);
  const ops=[env.STORE_DB.prepare(`UPDATE orders SET status='paid',stripe_payment_intent=?,buyer_email=?,paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP)
    WHERE id=? AND stripe_session_id=? AND amount_cents=? AND status='pending'
    AND NOT EXISTS (SELECT 1 FROM payment_revocations WHERE payment_intent=?)`)
    .bind(paidIntent?session.payment_intent:null,email,order.id,id,subtotal,paidIntent?session.payment_intent:null)];
  if(recipientAllowed(env,email,id)){
    ops.push(env.STORE_DB.prepare(`INSERT OR IGNORE INTO email_jobs (id,order_id,email,purpose)
      SELECT 'purchase-'||id,id,buyer_email,'purchase' FROM orders
      WHERE id=? AND stripe_session_id=? AND status='paid' AND lower(buyer_email)=?`)
      .bind(order.id,id,email));
  }
  await env.STORE_DB.batch(ops);
  if(ctx?.waitUntil)ctx.waitUntil(sendQueuedEmails(env,2).catch(e=>console.warn('Email queue retry scheduled',String(e))));
}
async function orderStatus(url,env,ctx){
  const id=orderSessionId(url);if(!id)return error('Invalid session',400);
  if(!env.STORE_DB)return error('Orders unavailable',503);
  const lookup=()=>env.STORE_DB.prepare(`SELECT o.id,o.product_title,o.pdf_key,p.pdf_key AS catalog_pdf_key,o.amount_cents,o.status,o.paid_at,o.download_count,o.access_days,
      datetime(o.paid_at, '+' || o.access_days || ' days') AS expires_at,
      COALESCE(o.pdf_expires_at,p.pdf_expires_at) AS pdf_expires_at
    FROM orders o LEFT JOIN products p ON p.id=o.product_id WHERE o.stripe_session_id=?`).bind(id).first();
  let o=await lookup();
  if(!o)return error('Order not found',404);
  if(o.status==='pending'&&url.searchParams.get('confirm')==='1'){
    await confirmPendingOrder(env,id,o,ctx);
    o=await lookup();
  }
  const bundle=o.catalog_pdf_key===BUNDLE_KEY;
  const fileExpired=!bundle&&(!o.pdf_expires_at||Date.parse(String(o.pdf_expires_at).replace(' ','T')+'Z')<=Date.now());
  return reply({title:o.product_title,amount_cents:o.amount_cents,status:o.status,paid_at:o.paid_at,access_days:o.access_days,delivery_mode:'tab',
    expires_at:o.expires_at,pdf_expires_at:o.pdf_expires_at,file_expired:fileExpired,
    downloads_remaining:bundle?null:Math.max(0,5-o.download_count),bundle,
    items:bundle&&o.status==='paid'?await bundleItems(env,o.id):[],checkout_mode:sessionMode(id)});
}

const ZIP_CRC_TABLE=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0;}return table;})();
function zipCrcUpdate(crc,bytes){for(let i=0;i<bytes.length;i++)crc=ZIP_CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);return crc>>>0;}
function zipSafePdfName(value,used){
  let base=String(value||'publication').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9 ._-]/g,'').replace(/\s+/g,' ').replace(/^\.+|\.+$/g,'').trim().slice(0,90);
  base=base.replace(/\.pdf$/i,'').trim()||'publication';
  let name=base+'.pdf',n=2;while(used.has(name.toLowerCase()))name=base+'-'+(n++)+'.pdf';used.add(name.toLowerCase());return name;
}
function zipSafeArchiveName(value){
  const base=String(value||'rail-and-rye-bundle').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9 ._-]/g,'').replace(/\s+/g,' ').replace(/^\.+|\.+$/g,'').trim().slice(0,90).replace(/\.zip$/i,'').trim();
  return (base||'rail-and-rye-bundle')+'.zip';
}
async function* bundleZipChunks(env,orderId,items,state){
  const encoder=new TextEncoder(),used=new Set(),centralEntries=[];let offset=0;
  for(const item of items){
    const file=await env.CARDS_BUCKET.get(item.pdf_key);
    if(!file||!file.body)throw Error('PDF temporarily unavailable');
    if(!Number.isSafeInteger(file.size)||file.size<0||file.size>0xffffffff)throw Error('PDF size is not supported in a ZIP');
    const change=await env.STORE_DB.prepare(`UPDATE bundle_order_items SET download_count=download_count+1
      WHERE order_id=? AND product_id=? AND download_count<5
      AND COALESCE(pdf_expires_at,(SELECT pdf_expires_at FROM products WHERE id=?))>CURRENT_TIMESTAMP
      AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='paid'
      AND datetime(paid_at, '+' || access_days || ' days') > CURRENT_TIMESTAMP)`).bind(orderId,item.id,item.id,orderId).run();    if(!change.meta?.changes)throw Error('Download not available or expired');
    const name=zipSafePdfName(item.product_title,used),nameBytes=encoder.encode(name),localOffset=offset;
    const local=new Uint8Array(30+nameBytes.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0808,true);
    lv.setUint16(8,0,true);lv.setUint16(10,0,true);lv.setUint16(12,0x21,true);
    lv.setUint32(14,0,true);lv.setUint32(18,0,true);lv.setUint32(22,0,true);
    lv.setUint16(26,nameBytes.length,true);lv.setUint16(28,0,true);local.set(nameBytes,30);
    yield local;offset+=local.length;
    let crc=0xffffffff,size=0;const reader=file.body.getReader();state.reader=reader;
    try{
      for(;;){
        const part=await reader.read();if(part.done)break;
        size+=part.value.byteLength;if(size>0xffffffff)throw Error('PDF size is not supported in a ZIP');
        crc=zipCrcUpdate(crc,part.value);yield part.value;offset+=part.value.byteLength;
      }
    }finally{
      if(state.reader===reader)state.reader=null;
      try{reader.releaseLock();}catch{}
    }
    if(size!==file.size)throw Error('PDF download was incomplete');
    crc=(crc^0xffffffff)>>>0;
    const descriptor=new Uint8Array(16),dv=new DataView(descriptor.buffer);
    dv.setUint32(0,0x08074b50,true);dv.setUint32(4,crc,true);dv.setUint32(8,size,true);dv.setUint32(12,size,true);
    yield descriptor;offset+=descriptor.length;
    const central=new Uint8Array(46+nameBytes.length),cv=new DataView(central.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);
    cv.setUint16(8,0x0808,true);cv.setUint16(10,0,true);cv.setUint16(12,0,true);cv.setUint16(14,0x21,true);
    cv.setUint32(16,crc,true);cv.setUint32(20,size,true);cv.setUint32(24,size,true);
    cv.setUint16(28,nameBytes.length,true);cv.setUint16(30,0,true);cv.setUint16(32,0,true);
    cv.setUint16(34,0,true);cv.setUint16(36,0,true);cv.setUint32(38,0,true);cv.setUint32(42,localOffset,true);
    central.set(nameBytes,46);centralEntries.push(central);
  }
  const centralOffset=offset,centralSize=centralEntries.reduce((sum,entry)=>sum+entry.length,0);
  for(const entry of centralEntries){yield entry;offset+=entry.length;}
  const end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);
  ev.setUint16(8,centralEntries.length,true);ev.setUint16(10,centralEntries.length,true);
  ev.setUint32(12,centralSize,true);ev.setUint32(16,centralOffset,true);ev.setUint16(20,0,true);
  yield end;
}
function bundleZipStream(env,orderId,items){
  const state={reader:null},iterator=bundleZipChunks(env,orderId,items,state)[Symbol.asyncIterator]();let cancelled=false;
  return new ReadableStream({
    async pull(controller){
      if(cancelled)return;
      try{const next=await iterator.next();if(cancelled)return;if(next.done)controller.close();else controller.enqueue(next.value);}
      catch(error){if(!cancelled)controller.error(error);}
    },
    async cancel(){
      cancelled=true;
      try{await state.reader?.cancel();}catch{}
      try{await iterator.return?.();}catch{}
    }
  });
}
async function bundleArchiveResponse(env,order){
  if(!env.STORE_DB||!env.CARDS_BUCKET)return error('Downloads unavailable',503);
  const result=await env.STORE_DB.prepare(`SELECT bi.product_id AS id,bi.product_title,bi.pdf_key,bi.download_count
    FROM bundle_order_items bi JOIN products p ON p.id=bi.product_id
    WHERE bi.order_id=? AND COALESCE(bi.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP
    ORDER BY bi.position LIMIT 12`).bind(order.id).all();
  const items=result.results||[];
  if(!items.length)return error('No PDFs remain available in this bundle. Need a copy? Email support@railandryeracing.com.',410);
  if(items.some(item=>!UUID_RE.test(item.id||'')||!item.pdf_key||item.download_count>=5))return error('One or more available PDFs have reached their download limit',403);
  const files=await Promise.all(items.map(item=>env.CARDS_BUCKET.head(item.pdf_key)));
  if(files.some(file=>!file))return error('One or more bundle PDFs are temporarily unavailable',503);
  const body=bundleZipStream(env,order.id,items);
  const filename=zipSafeArchiveName(order.product_title||'Rail and Rye Bundle');
  return new Response(body,{headers:{
    'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${filename}"`,
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'
  }});
}

async function downloadBundleArchive(url,env){
  const session=orderSessionId(url);if(!session)return error('Invalid session',400);
  if(!env.STORE_DB||!env.CARDS_BUCKET)return error('Downloads unavailable',503);
  const order=await env.STORE_DB.prepare(`SELECT id,product_title FROM orders WHERE stripe_session_id=? AND pdf_key=?
    AND status='paid' AND datetime(paid_at, '+' || access_days || ' days') > CURRENT_TIMESTAMP`).bind(session,BUNDLE_KEY).first();
  if(!order)return error('Bundle download not available or expired',403);
  return bundleArchiveResponse(env,order);
}
async function download(url,env){
  const id=orderSessionId(url);if(!id)return error('Invalid session',400);
  if(!env.STORE_DB||!env.CARDS_BUCKET)return error('Downloads unavailable',503);
  const row=await env.STORE_DB.prepare(`SELECT o.id,o.pdf_key,o.product_title FROM orders o
    LEFT JOIN products p ON p.id=o.product_id WHERE o.stripe_session_id=? AND o.status='paid'
    AND datetime(o.paid_at, '+' || o.access_days || ' days') > CURRENT_TIMESTAMP
    AND (o.pdf_key=? OR (o.download_count<5 AND COALESCE(o.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP))`).bind(id,BUNDLE_KEY).first();
  if(!row)return error('This PDF is no longer available. Need a copy? Email support@railandryeracing.com.',410);
  if(row.pdf_key===TAB_KEY)return error('This purchase is available in My Racing Tabs.',410);
  if(row.pdf_key===BUNDLE_KEY)return downloadBundleItem(env,row.id,url.searchParams.get('item_id'));
  const obj=await env.CARDS_BUCKET.get(row.pdf_key);if(!obj)return error('PDF temporarily unavailable',503);
  const upd=await env.STORE_DB.prepare(`UPDATE orders SET download_count=download_count+1 WHERE stripe_session_id=?
    AND status='paid' AND datetime(paid_at, '+' || access_days || ' days') > CURRENT_TIMESTAMP AND download_count<5
    AND COALESCE(pdf_expires_at,(SELECT pdf_expires_at FROM products WHERE id=product_id))>CURRENT_TIMESTAMP`).bind(id).run();
  if(!upd.meta?.changes)return error('Download limit reached or PDF expired',403);
  const name=String(row.product_title||'rail-and-rye').normalize('NFKD').replace(/[^a-zA-Z0-9 -]/g,'').trim().replace(/\s+/g,'-').slice(0,70)||'rail-and-rye';
  return new Response(obj.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${name}.pdf"`,
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
}

// Free publications are explicitly public. Require a currently published $0
// individual product on EVERY request; never expose R2 object keys or paid PDFs.
// No order, payment method, account or buyer email is required.
async function freeDownload(request,env,url){
  if(request.method!=='GET')return error('Method not allowed',405);
  const match=url.pathname.match(/^\/api\/free-download\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if(!match)return error('Not found',404);
  if(!env.STORE_DB||!env.CARDS_BUCKET)return error('Tab access unavailable',503);
  await ensureReleaseSchedule(env);
  const product=await env.STORE_DB.prepare(`SELECT id,category,race_date FROM products WHERE id=? AND status='published' AND price_cents=0
    AND pdf_expires_at IS NOT NULL AND pdf_expires_at>CURRENT_TIMESTAMP
    AND NOT EXISTS(SELECT 1 FROM product_release_schedule s WHERE s.product_id=products.id AND s.release_at>CURRENT_TIMESTAMP)
    AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=products.id)`).bind(match[1]).first();
  if(!product||!await hasProductTabData(env,product.category,product.race_date,[product]))return error('This free racing tab is not available.',404);
  const target=new URL('/my-products/?category='+encodeURIComponent(product.category)+'&date='+encodeURIComponent(product.race_date),url.origin);
  return Response.redirect(target.toString(),302);
}
export async function handleCommerce(request,env,url,ctx){
  if(env.STORE_DB)await ensureRacePdfExpirySchema(env);
  const p=url.pathname;
  if(p==='/api/products'&&request.method==='GET')return listProducts(env);
  if(p.startsWith('/api/free-download/'))return freeDownload(request,env,url);
  if(p==='/api/checkout')return checkout(request,env);
  if(p==='/api/stripe/webhook')return webhook(request,env,ctx,'test');
  if(p==='/api/stripe/live-webhook')return webhook(request,env,ctx,'live');
  if(p==='/api/delivery/download')return accessPdf(request,env);
  if(p==='/api/delivery/download-all')return deliveryBundleArchive(request,env);
  if(p==='/api/delivery/items')return deliveryItems(request,env);
  if(p==='/api/recovery/request')return recover(request,env,ctx);
  if(/^\/api\/orders\/[^/]+\/status$/.test(p)&&request.method==='GET')return orderStatus(url,env,ctx);
  if(/^\/api\/orders\/[^/]+\/download$/.test(p)&&request.method==='GET')return download(url,env);
  if(/^\/api\/orders\/[^/]+\/download-all$/.test(p)&&request.method==='GET')return downloadBundleArchive(url,env);
  return error('Not found',404);
}

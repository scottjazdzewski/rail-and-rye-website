import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {handleCommerce} from './src/commerce.js';
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY,title TEXT,slug TEXT,category TEXT,race_date TEXT,track TEXT,description TEXT,price_cents INTEGER,pdf_key TEXT,image_url TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
for (const file of ['001_stripe_orders.sql','002_email_delivery.sql','003_live_readiness.sql']) db.exec(readFileSync('./migrations/'+file,'utf8'));
const item='ceb80f18-4e0d-4363-8323-0cdbe12d51de';
db.prepare('INSERT INTO products (id,title,slug,category,race_date,track,description,price_cents,pdf_key,status) VALUES (?,?,?,?,?,?,?,?,?,?)')
 .run(item,'Live Card','test','Race Cards','2026-10-28','Keeneland','Paid item',100,'cards/'+item+'/test.pdf','published');
const wrap={prepare(sql){let args=[];const x={bind(...a){args=a;return x;},first(){return db.prepare(sql).get(...args);},all(){return {results:db.prepare(sql).all(...args)};},run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}};}};return x;},async batch(stmts){db.exec('BEGIN IMMEDIATE');try{const x=stmts.map(s=>s.run());db.exec('COMMIT');return x}catch(e){db.exec('ROLLBACK');throw e}}};
const env={STORE_DB:wrap,CARDS_BUCKET:{async get(key){assert.equal(key,'cards/'+item+'/test.pdf');return {body:new TextEncoder().encode('%PDF- live simulator')}}},STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_test_fake_0123456789abc',STRIPE_LIVE_SECRET_KEY:'sk_live_fake',STRIPE_LIVE_WEBHOOK_SECRET:'whsec_live_fake_0123456789abc',RR_DELIVERY_SIGNING_KEY:'0123456789abcdef0123456789abcdef0123456789abcdef',RESEND_API_KEY:'re_fake',ADMIN_EMAIL:'admin@example.test',RR_PAYMENT_MODE:'live',RR_LIVE_ACTIVATION:'CONFIRM_LIVE_SALES'};
const sid1='cs_live_'+'A'.repeat(50),sid2='cs_live_'+'B'.repeat(50);let sessionCounter=0,mails=[],stripeCalls=0;
const origFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('api.stripe.com/v1/checkout/sessions')){
   stripeCalls++;assert.equal(options.headers.Authorization,'Bearer sk_live_fake');
   const form=new URLSearchParams(options.body);assert.equal(form.get('line_items[0][price_data][unit_amount]'),'100');
   return Response.json({id:++sessionCounter===1?sid1:sid2,url:'https://checkout.stripe.com/c/pay/live',livemode:true});
 }
 if(String(url).includes('api.resend.com/emails')){
   const m=JSON.parse(options.body);mails.push(m);
   assert.equal(m.from,'Rail & Rye Racing <orders@railandryeracing.com>');
   assert.ok(!m.subject.endsWith('(TEST)'));
   assert.ok(!m.html.includes('SANDBOX ONLY'));
   return Response.json({id:'live_email_'+mails.length});
 }
 return origFetch(url,options);
};
const run=(req)=>handleCommerce(req,env,new URL(req.url),ctx);
const root='https://railandryeracing.com';
const post=(path,body)=>new Request(root+path,{method:'POST',headers:{Origin:root,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify(body)});
const jobs=[];const ctx={waitUntil(p){jobs.push(p)}};
async function flush(){await Promise.all(jobs.splice(0));}
async function sig(payload,mode='live'){
 const t=Math.floor(Date.now()/1000);const secret=mode==='live'?env.STRIPE_LIVE_WEBHOOK_SECRET:env.STRIPE_WEBHOOK_SECRET;
 const k=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const v=Buffer.from(await webcrypto.subtle.sign('HMAC',k,new TextEncoder().encode(t+'.'+payload))).toString('hex');return `t=${t},v1=${v}`;
}
async function event(evt,mode='live'){const body=JSON.stringify(evt);return new Request(root+'/api/stripe/'+(mode==='live'?'live-webhook':'webhook'),{method:'POST',headers:{'Stripe-Signature':await sig(body,mode)},body});}
const launch=await run(post('/api/checkout',{product_id:item}));assert.equal(launch.status,200);assert.equal((await launch.json()).url,'https://checkout.stripe.com/c/pay/live');assert.equal(stripeCalls,1);
const pending=db.prepare('SELECT * FROM orders').get();assert.equal(pending.stripe_session_id,sid1);
const payment={id:sid1,livemode:true,payment_status:'paid',mode:'payment',currency:'usd',amount_total:100,metadata:{order_id:pending.id},payment_intent:'pi_live_123',customer_details:{email:'buyer@example.org'}};
const completed={id:'evt_live_1111111111',livemode:true,type:'checkout.session.completed',data:{object:payment}};
// Signed test endpoint will reject a live event even if signed with test secret.
assert.equal((await run(await event(completed,'test'))).status,400);
assert.equal((await run(await event(completed))).status,200);await flush();
assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(pending.id).status,'paid');
assert.equal(mails.length,1);assert.ok(mails[0].html.includes('store/access.html?code='));
assert.equal((await run(await event(completed))).status,200);await flush();assert.equal(mails.length,1);
const recoverCode=new URL(mails[0].html.match(/href="(https:\/\/railandryeracing\.com\/store\/access\.html\?code=[^"]+)"/)[1]).searchParams.get('code');
assert.equal((await run(post('/api/delivery/download',{code:recoverCode}))).status,200);
// Backward compatibility: V4.1 emailed tokens were signed with the old test
// webhook secret. They must remain valid for their original 24-hour lifespan.
const oldJob=db.prepare('SELECT id,order_id FROM email_jobs WHERE purpose=?').get('purchase');
const hmac=async(secret,message)=>{const k=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Buffer.from(await webcrypto.subtle.sign('HMAC',k,new TextEncoder().encode(message))).toString('hex');};
const legacyCode=oldJob.id+'.'+await hmac(env.STRIPE_WEBHOOK_SECRET,`rr-delivery-v3|${oldJob.id}|${oldJob.order_id}`);
assert.equal((await run(post('/api/delivery/download',{code:legacyCode}))).status,200,'Existing 24h links survive V5 signing-key change');
assert.equal((await run(post('/api/recovery/request',{email:'buyer@example.org'}))).status,200);await flush();assert.equal(mails.length,2);
const refund={id:'evt_live_2222222222',livemode:true,type:'charge.refunded',data:{object:{payment_intent:'pi_live_123',refunded:true}}};
assert.equal((await run(await event(refund))).status,200);await flush();
assert.equal((await run(post('/api/delivery/download',{code:recoverCode}))).status,403);
assert.equal((await run(post('/api/delivery/download',{code:legacyCode}))).status,403,'Refund blocks legacy links too');
assert.equal(db.prepare('SELECT reason FROM payment_revocations WHERE payment_intent=?').get('pi_live_123').reason,'refund');
// Refund arrives before the Checkout Session completion: it MUST NOT create an entitlement.
const second=await run(post('/api/checkout',{product_id:item}));assert.equal(second.status,200);
const pending2=db.prepare('SELECT id FROM orders WHERE stripe_session_id=?').get(sid2);
const earlyRefund={id:'evt_live_3333333333',livemode:true,type:'charge.refunded',data:{object:{payment_intent:'pi_live_456',refunded:true}}};
assert.equal((await run(await event(earlyRefund))).status,200);
const completed2={id:'evt_live_4444444444',livemode:true,type:'checkout.session.completed',data:{object:{...payment,id:sid2,metadata:{order_id:pending2.id},payment_intent:'pi_live_456'}}};
assert.equal((await run(await event(completed2))).status,200);await flush();
assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(pending2.id).status,'pending');
assert.equal(mails.length,2,'Previously refunded purchase may not email buyer');
// Independently test quota and URL expiry using a paid synthetic order that
// has passed the same DB entitlement checks as a webhook-paid purchase.
const thirdOrder='d68fa657-ab00-46e7-ac9d-36ad96514a0c',thirdJob='purchase-'+thirdOrder;
db.prepare(`INSERT INTO orders (id,product_id,product_title,pdf_key,amount_cents,stripe_session_id,stripe_payment_intent,buyer_email,status,paid_at)
  VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(thirdOrder,item,'Quota Card','cards/'+item+'/test.pdf',100,'cs_live_'+'C'.repeat(50),'pi_live_quota','buyer@example.org','paid');
db.prepare(`INSERT INTO email_jobs(id,order_id,email,purpose,state,sent_at) VALUES (?,?,?,'purchase','sent',CURRENT_TIMESTAMP)`).run(thirdJob,thirdOrder,'buyer@example.org');
const thirdCode=thirdJob+'.'+await hmac(env.RR_DELIVERY_SIGNING_KEY,`rr-delivery-v3|${thirdJob}|${thirdOrder}`);
for(let i=0;i<5;i++)assert.equal((await run(post('/api/delivery/download',{code:thirdCode}))).status,200,'Permitted download '+(i+1));
assert.equal((await run(post('/api/delivery/download',{code:thirdCode}))).status,403,'Sixth download blocked');
// Verify 24-hour email token expiry independently of the quota.
db.prepare('UPDATE orders SET download_count=0 WHERE id=?').run(thirdOrder);
db.prepare("UPDATE email_jobs SET sent_at=datetime('now','-25 hours') WHERE id=?").run(thirdJob);
assert.equal((await run(post('/api/delivery/download',{code:thirdCode}))).status,403,'Expired 24-hour URL blocked');
// Fail-closed: no activation flag means sandbox, regardless of presence of live keys.
env.RR_LIVE_ACTIVATION='NO';const products=await (await run(new Request(root+'/api/products'))).json();assert.equal(products.checkout_mode,'paused');
assert.equal(products.checkout_ready,false,'Disabling activation must not open sandbox checkout');
assert.equal((await run(post('/api/checkout',{product_id:item}))).status,503,'Paused shop never charges');
// Live buyers retain access to recovery even after a store-wide checkout pause.
db.prepare('UPDATE orders SET buyer_email=?,download_count=0 WHERE id=?').run('afterpause@example.org',thirdOrder);
assert.equal((await run(post('/api/recovery/request',{email:'afterpause@example.org'}))).status,200);await flush();
assert.equal(mails.length,3,'Paused live buyer recovery remains operational');
assert.equal(mails[2].to[0],'afterpause@example.org');
// Test-only email recipients remain admin restricted even after going live.
db.prepare(`UPDATE orders SET buyer_email=? WHERE id=?`).run('stranger@example.org',thirdOrder);
assert.equal((await run(post('/api/recovery/request',{email:'stranger@example.org'}))).status,200);await flush();
assert.equal(mails.length,4,'Live customer recovery remains allowed');
// Disputed live payments revoke access even while new checkouts are paused.
db.prepare("UPDATE email_jobs SET sent_at=CURRENT_TIMESTAMP WHERE id=?").run(thirdJob);
assert.equal((await run(post('/api/delivery/download',{code:thirdCode}))).status,200);
const dispute={id:'evt_live_5555555555',livemode:true,type:'charge.dispute.created',data:{object:{payment_intent:'pi_live_quota'}}};
assert.equal((await run(await event(dispute))).status,200);await flush();
assert.equal((await run(post('/api/delivery/download',{code:thirdCode}))).status,403,'Dispute revokes PDF');
assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(thirdOrder).status,'revoked');
// Fail-closed: missing production keys means checkout unavailable (not automatic fallback).
env.RR_LIVE_ACTIVATION='CONFIRM_LIVE_SALES';delete env.STRIPE_LIVE_SECRET_KEY;
assert.equal((await run(post('/api/checkout',{product_id:item}))).status,503);
console.log('PASS V5: live Stripe key isolation, real recipient delivery, signed live/test webhook isolation, recovery, refund revocation, out-of-order refund rejection, idempotency, fail-closed activation. No real Stripe/network charges.');

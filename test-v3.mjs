import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {handleCommerce,sendQueuedEmails} from './src/commerce.js';
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY,title TEXT,slug TEXT,category TEXT,race_date TEXT,track TEXT,description TEXT,price_cents INTEGER,pdf_key TEXT,image_url TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
db.exec(readFileSync('./migrations/001_stripe_orders.sql','utf8'));
db.exec(readFileSync('./migrations/002_email_delivery.sql','utf8'));
db.exec(readFileSync('./migrations/003_live_readiness.sql','utf8'));
const item='ceb80f18-4e0d-4363-8323-0cdbe12d51de';
db.prepare('INSERT INTO products (id,title,slug,category,race_date,track,description,price_cents,pdf_key,status) VALUES (?,?,?,?,?,?,?,?,?,?)')
 .run(item,'TEST — Keeneland Race Card','test','Race Cards','2026-10-28','Keeneland','Safe test item',100,'cards/'+item+'/test.pdf','published');
const wrap={prepare(sql){let args=[];const x={bind(...a){args=a;return x;},first(){return db.prepare(sql).get(...args);},all(){return {results:db.prepare(sql).all(...args)};},run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}};}};return x;},async batch(stmts){db.exec('BEGIN IMMEDIATE');try{const x=stmts.map(s=>s.run());db.exec('COMMIT');return x}catch(e){db.exec('ROLLBACK');throw e}}};
const env={STORE_DB:wrap,CARDS_BUCKET:{async get(key){assert.equal(key,'cards/'+item+'/test.pdf');return {body:new TextEncoder().encode('%PDF- sandbox test')}}},STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_test_fake_0123456789abc',RESEND_API_KEY:'re_test_fake',ADMIN_EMAIL:'buyer@example.test'};
const sid='cs_test_'+'A'.repeat(50);
let mails=[];let resendFail=false, stripeCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('api.stripe.com/v1/checkout/sessions')){stripeCalls++;const f=new URLSearchParams(options.body);assert.equal(f.get('line_items[0][price_data][unit_amount]'),'100');return new Response(JSON.stringify({id:sid,url:'https://checkout.stripe.com/c/pay/test',livemode:false}),{status:200});}
 if(String(url).includes('api.resend.com/emails')){if(resendFail)return new Response(JSON.stringify({name:'fake_error'}),{status:429});const m=JSON.parse(options.body);assert.equal(m.from,'Rail & Rye Racing <orders@railandryeracing.com>');assert.equal(options.headers['Idempotency-Key'].startsWith('rr-v3-'),true);mails.push(m);return new Response(JSON.stringify({id:'email_'+mails.length}),{status:200});}
 return originalFetch(url,options);
};
function get(path){return new Request('https://railandryeracing.com'+path)}
function post(path,data,{origin='https://railandryeracing.com',ip='192.0.2.1'}={}){return new Request('https://railandryeracing.com'+path,{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify(data)})}
const tasks=[];const ctx={waitUntil(p){tasks.push(p)}};
async function flush(){const pending=tasks.splice(0);await Promise.all(pending);}
const run=(req)=>handleCommerce(req,env,new URL(req.url),ctx);
const signup=await run(post('/api/checkout',{product_id:item}));assert.equal(signup.status,200);assert.equal((await signup.json()).url,'https://checkout.stripe.com/c/pay/test');assert.equal(stripeCalls,1);
const pending=db.prepare('SELECT * FROM orders').get();assert.equal(pending.status,'pending');
const sig=async(body)=>{const t=Math.floor(Date.now()/1000);const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const val=Buffer.from(await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+body))).toString('hex');return `t=${t},v1=${val}`;};
async function event(e){const data=JSON.stringify(e);return new Request('https://railandryeracing.com/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':await sig(data)},body:data});}
const payment={id:sid,livemode:false,payment_status:'paid',mode:'payment',currency:'usd',amount_total:100,metadata:{order_id:pending.id},payment_intent:'pi_test_123',customer_details:{email:env.ADMIN_EMAIL}};
const evt={id:'evt_11111111111111',livemode:false,type:'checkout.session.completed',data:{object:payment}};
const noSig=await run(new Request('https://railandryeracing.com/api/stripe/webhook',{method:'POST',body:JSON.stringify(evt)}));assert.equal(noSig.status,400);
assert.equal((await run(await event(evt))).status,200);await flush();
assert.equal(db.prepare('SELECT status FROM orders').get().status,'paid');assert.equal(db.prepare('SELECT state FROM email_jobs').get().state,'sent');assert.equal(mails.length,1);assert.ok(mails[0].html.includes('railandryeracing.com/store/access.html?code='));
assert.equal((await run(await event(evt))).status,200);await flush();assert.equal(mails.length,1,'Duplicate webhook must not send duplicate email');
const code=new URL((mails[0].html.match(/href="(https:\/\/railandryeracing\.com\/store\/access\.html\?code=[^"]+)"/)||[])[1]).searchParams.get('code');assert.ok(code);
const untrusted=await run(post('/api/delivery/download',{code},{origin:'https://evil.example'}));assert.equal(untrusted.status,403);
const invalid=await run(post('/api/delivery/download',{code:code.slice(0,-1)+(code.endsWith('0')?'1':'0')}));assert.equal(invalid.status,403);
const pdf=await run(post('/api/delivery/download',{code}));assert.equal(pdf.status,200);assert.equal(await pdf.text(),'%PDF- sandbox test');assert.equal(db.prepare('SELECT download_count FROM orders').get().download_count,1);
// Purchase-recovery requests are generic, throttled and never reveal other users' orders.
const other=await (await run(post('/api/recovery/request',{email:'notbuyer@example.test'}))).json();assert.match(other.message,/If an eligible purchase/);
const first=await (await run(post('/api/recovery/request',{email:env.ADMIN_EMAIL}))).json();assert.match(first.message,/If an eligible purchase/);await flush();assert.equal(mails.length,2);
const throttled=await run(post('/api/recovery/request',{email:env.ADMIN_EMAIL}));assert.equal(throttled.status,200);await flush();assert.equal(mails.length,2,'Repeated request within 15 minutes may not cause another email');
const recoverLink=new URL(mails[1].html.match(/href="(https:\/\/railandryeracing\.com\/store\/access\.html\?code=[^"]+)"/)[1]).searchParams.get('code');assert.equal((await run(post('/api/delivery/download',{code:recoverLink}))).status,200);
// Refund should immediately invalidate both originally emailed and recovered URLs.
const refundEvt={id:'evt_22222222222222',livemode:false,type:'charge.refunded',data:{object:{id:'ch_123',payment_intent:'pi_test_123',refunded:true}}};assert.equal((await run(await event(refundEvt))).status,200);await flush();assert.equal(db.prepare('SELECT status FROM orders').get().status,'refunded');assert.equal((await run(post('/api/delivery/download',{code}))).status,403);assert.equal((await run(post('/api/delivery/download',{code:recoverLink}))).status,403);
assert.equal((await run(get('/api/orders/'+sid+'/download'))).status,403);
console.log('PASS V3: Stripe Checkout, signed webhook, idempotent Resend purchase email, signed link download, malicious origin/tampered URL denied, generic rate-limited recovery, emailed recovery link, full refund revokes both links.');

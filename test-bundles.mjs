import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {handleCommerce,sendQueuedEmails} from './src/commerce.js';
import {handleAdminBundles,BUNDLE_KEY} from './src/bundles.js';

// Real in-memory SQLite with all four production migrations.
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY,title TEXT,slug TEXT,category TEXT,race_date TEXT,track TEXT,description TEXT,price_cents INTEGER,pdf_key TEXT,image_url TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
for(const file of ['001_stripe_orders.sql','002_email_delivery.sql','003_live_readiness.sql','004_automatic_bundles.sql'])
  db.exec(readFileSync('./migrations/'+file,'utf8'));
const id1='11111111-1111-4111-8111-111111111111',id2='22222222-2222-4222-8222-222222222222',
  id3='33333333-3333-4333-8333-333333333333';
const add=db.prepare("INSERT INTO products (id,title,slug,category,race_date,track,description,price_cents,pdf_key,status) VALUES (?,?,?,?,?,?,?,?,?,?)");
add.run(id1,'Friday Card','friday','Race Cards','2026-10-30','Keeneland','Friday edition',999,'cards/friday/v1.pdf','published');
add.run(id2,'Saturday Card','saturday','Race Cards','2026-10-31','Keeneland','Saturday edition',1499,'cards/saturday/v1.pdf','published');
add.run(id3,'Unpublished Card','draft','Race Cards','2026-11-01','Keeneland','Not for sale',999,'cards/draft/v1.pdf','draft');
const d1={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},first(){return db.prepare(sql).get(...args);},
  all(){return {results:db.prepare(sql).all(...args)};},run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}};}};return q;},
  async batch(stmts){db.exec('BEGIN IMMEDIATE');try{const r=stmts.map(s=>s.run());db.exec('COMMIT');return r;}
  catch(e){db.exec('ROLLBACK');throw e;}}};
let reads=[];
const env={STORE_DB:d1,CARDS_BUCKET:{async get(key){reads.push(key);return {body:new TextEncoder().encode('%PDF-1.7 bundle test')};}},
  STRIPE_LIVE_SECRET_KEY:'rk_live_fake',STRIPE_LIVE_WEBHOOK_SECRET:'whsec_live_fake_abc',
  RR_DELIVERY_SIGNING_KEY:'0123456789abcdef0123456789abcdef0123456789abcdef',
  RESEND_API_KEY:'re_fake',ADMIN_EMAIL:'admin@example.test',
  RR_PAYMENT_MODE:'live',RR_LIVE_ACTIVATION:'CONFIRM_LIVE_SALES'};
const root='https://railandryeracing.com',ctx={jobs:[],waitUntil(p){this.jobs.push(p);}};
const post=(path,data)=>new Request(root+path,{method:'POST',headers:{Origin:root,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify(data)});
const patch=(path,data)=>new Request(root+path,{method:'PATCH',headers:{Origin:root,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify(data)});
const commerce=(req)=>handleCommerce(req,env,new URL(req.url),ctx);
const admin=(req)=>handleAdminBundles(req,env,new URL(req.url).pathname);
const basic={title:"Breeders' Cup Weekend",description:'Friday and Saturday premium cards',category:'Race Cards',
  race_date:'2026-10-30',price_cents:1999,status:'published',product_ids:[id1,id2]};
let result=await admin(post('/api/admin/bundles',{...basic,product_ids:[id1,id1]}));
assert.equal(result.status,400,'Duplicate child IDs must be rejected');
result=await admin(post('/api/admin/bundles',{...basic,product_ids:[id1,id3]}));
assert.equal(result.status,400,'Draft PDF cannot enter a published bundle');
result=await admin(post('/api/admin/bundles',basic));
assert.equal(result.status,201);const bundleId=(await result.json()).id;
assert.equal(db.prepare("SELECT pdf_key FROM products WHERE id=?").get(bundleId).pdf_key,BUNDLE_KEY);
const adminList=await (await admin(new Request(root+'/api/admin/bundles'))).json();
assert.equal(adminList.bundles.length,1);
assert.deepEqual(adminList.bundles[0].product_ids,[id1,id2]);
const catalog=await (await commerce(new Request(root+'/api/products'))).json();
const bundle=catalog.products.find(x=>x.id===bundleId);
assert.equal(bundle?.kind,'bundle');assert.equal(bundle.bundle_count,2);
assert.deepEqual(bundle.included_titles,['Friday Card','Saturday Card']);
assert.ok(!JSON.stringify(catalog).includes('cards/friday/v1.pdf'),'Never expose R2 storage keys');

const sid='cs_live_'+'A'.repeat(50);
let emails=[],stripeCalls=0;
globalThis.fetch=async(url,options)=>{
  if(String(url).includes('/checkout/sessions')){
    stripeCalls++;
    const form=new URLSearchParams(options.body);
    assert.equal(options.headers.Authorization,'Bearer rk_live_fake');
    assert.equal(form.get('line_items[0][price_data][unit_amount]'),'1999','Server owns price');
    return Response.json({id:sid,url:'https://checkout.stripe.com/c/pay/bundle',livemode:true});
  }
  if(String(url).includes('api.resend.com/emails')){
    const msg=JSON.parse(options.body);emails.push(msg);
    return Response.json({id:'email_'+emails.length});
  }
  throw Error('Unexpected external call '+url);
};
result=await commerce(post('/api/checkout',{product_id:bundleId,price_cents:1}));
assert.equal(result.status,200);assert.equal(stripeCalls,1);
const order=db.prepare('SELECT * FROM orders WHERE product_id=?').get(bundleId);
assert.equal(order.status,'pending');assert.equal(order.pdf_key,BUNDLE_KEY);
let snapshots=db.prepare('SELECT product_id,product_title,pdf_key FROM bundle_order_items WHERE order_id=? ORDER BY position').all(order.id);
assert.deepEqual(snapshots.map(x=>x.pdf_key),['cards/friday/v1.pdf','cards/saturday/v1.pdf']);
assert.equal((await commerce(new Request(root+'/api/orders/'+sid+'/download?item_id='+id1))).status,403,'No download before signed payment');
assert.equal((await commerce(post('/api/delivery/download',{code:'bogus',item_id:id1}))).status,403);

async function sign(payload){
 const t=Math.floor(Date.now()/1000);
 const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(env.STRIPE_LIVE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const v=Buffer.from(await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+payload))).toString('hex');
 return 't='+t+',v1='+v;
}
const paid={id:'evt_bundle_1234567890',livemode:true,type:'checkout.session.completed',data:{object:{
 id:sid,livemode:true,payment_status:'paid',mode:'payment',currency:'usd',amount_total:1999,
 metadata:{order_id:order.id},payment_intent:'pi_bundle_123',customer_details:{email:'buyer@example.org'}}}};
const raw=JSON.stringify(paid);
result=await commerce(new Request(root+'/api/stripe/live-webhook',{method:'POST',headers:{'Stripe-Signature':await sign(raw)},body:raw}));
assert.equal(result.status,200);await Promise.all(ctx.jobs.splice(0));
assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(order.id).status,'paid');
assert.equal(emails.length,1,'One email for whole bundle, not separate charges');
const orderStatus=await (await commerce(new Request(root+'/api/orders/'+sid+'/status'))).json();
assert.equal(orderStatus.bundle,true);assert.equal(orderStatus.items.length,2);
assert.equal((await commerce(new Request(root+'/api/orders/'+sid+'/download'))).status,400);
assert.equal((await commerce(new Request(root+'/api/orders/'+sid+'/download?item_id='+id3))).status,403);
assert.equal((await commerce(new Request(root+'/api/orders/'+sid+'/download?item_id='+id1))).status,200);
assert.equal(reads.at(-1),'cards/friday/v1.pdf');

const link=emails[0].html.match(/href="(https:\/\/railandryeracing\.com\/store\/access\.html\?code=[^"]+)"/)?.[1];
assert.ok(link,'Purchase email includes signed 24-hour delivery link');
const code=new URL(link).searchParams.get('code');
const itemsRes=await commerce(post('/api/delivery/items',{code}));
assert.equal(itemsRes.status,200);const listed=await itemsRes.json();
assert.equal(listed.bundle,true);assert.equal(listed.items.length,2);
assert.ok(!JSON.stringify(listed).includes('cards/saturday/v1.pdf'));
for(let i=0;i<4;i++)assert.equal((await commerce(post('/api/delivery/download',{code,item_id:id1}))).status,200);
assert.equal((await commerce(post('/api/delivery/download',{code,item_id:id1}))).status,403,'Sixth Friday download denied');
for(let i=0;i<5;i++)assert.equal((await commerce(post('/api/delivery/download',{code,item_id:id2}))).status,200);
assert.equal((await commerce(post('/api/delivery/download',{code,item_id:id2}))).status,403,'Each PDF has its own limit');
// Earlier purchases keep old PDF snapshot even if a later edition replaces it.
db.prepare("UPDATE products SET pdf_key=?,status='archived' WHERE id=?").run('cards/saturday/v2.pdf',id2);
result=await commerce(post('/api/checkout',{product_id:bundleId}));
assert.equal(result.status,409,'Unavailable child blocks future bundle checkout');
// Explicit archive remains possible after an included product becomes unavailable.
result=await admin(patch('/api/admin/bundles/'+bundleId,{...basic,status:'archived'}));
assert.equal(result.status,200);
db.prepare('UPDATE bundle_order_items SET download_count=0 WHERE order_id=? AND product_id=?').run(order.id,id2);
assert.equal((await commerce(post('/api/delivery/download',{code,item_id:id2}))).status,200);
assert.equal(reads.at(-1),'cards/saturday/v1.pdf','Fulfillment must use frozen historical PDF');
const refund={id:'evt_bundle_refunded_123',livemode:true,type:'charge.refunded',data:{object:{payment_intent:'pi_bundle_123',refunded:true}}};
const refundRaw=JSON.stringify(refund);
assert.equal((await commerce(new Request(root+'/api/stripe/live-webhook',{method:'POST',headers:{'Stripe-Signature':await sign(refundRaw)},body:refundRaw}))).status,200);
assert.equal((await commerce(post('/api/delivery/download',{code,item_id:id2}))).status,403,'Refund revokes bundle');
assert.equal((await commerce(new Request(root+'/api/orders/'+sid+'/download?item_id='+id2))).status,403);
console.log('PASS automatic bundles: admin validation, single-price checkout, purchase snapshots, signed webhook, buyer email, per-PDF quotas, archived versions, and refund revocation. No real charges.');

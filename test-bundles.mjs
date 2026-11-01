import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {handleCommerce,sendQueuedEmails} from './src/commerce.js';
import {handleAdminBundles,BUNDLE_KEY} from './src/bundles.js';
import {handleAdminBundleAssets} from './src/bundle-assets.js';

// Real in-memory SQLite with production migrations, including the private library.
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY,title TEXT,slug TEXT,category TEXT,race_date TEXT,track TEXT,description TEXT,price_cents INTEGER,pdf_key TEXT,image_url TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
for(const file of ['001_stripe_orders.sql','002_email_delivery.sql','003_live_readiness.sql','004_automatic_bundles.sql','005_bundle_only_assets.sql','006_seven_day_access.sql'])
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
assert.deepEqual(bundle.categories,['Race Cards'],'Same-category bundle has no duplicate categories');
assert.deepEqual(bundle.included_titles,['Friday Card','Saturday Card']);
assert.ok(!JSON.stringify(catalog).includes('cards/friday/v1.pdf'),'Never expose R2 storage keys');

const sid='cs_live_'+'A'.repeat(50);
let emails=[],stripeCalls=0;
globalThis.fetch=async(url,options)=>{
  if(String(url).includes('/checkout/sessions')){
    stripeCalls++;
    const form=new URLSearchParams(options.body);
    assert.equal(options.headers.Authorization,'Bearer rk_live_fake');
    assert.equal(form.get('line_items[0][price_data][unit_amount]'),'1999','Server owns price');assert.equal(form.get('allow_promotion_codes'),'true','Stripe-hosted promotion code input enabled');
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
assert.equal(order.access_days,7,'Bundle purchases also get seven-day access');
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
 id:sid,livemode:true,payment_status:'paid',mode:'payment',currency:'usd',amount_subtotal:1999,amount_total:1999,total_details:{amount_discount:0,amount_tax:0,amount_shipping:0},
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

const assetAdmin=req=>handleAdminBundleAssets(req,env,new URL(req.url).pathname);
const bundleOnlyMeta={title:'Private Sunday Notes',category:'Stable Notes',race_date:'2026-11-01',track:'Keeneland'};
result=await assetAdmin(post('/api/admin/bundle-assets',bundleOnlyMeta));
assert.equal(result.status,201,'Private PDF record can be created without a product listing');
const privateId=(await result.json()).id;
assert.equal(db.prepare('SELECT status FROM products WHERE id=?').get(privateId).status,'draft');
assert.equal((await assetAdmin(new Request(root+'/api/admin/bundle-assets'))).status,200);
const privateList=await (await assetAdmin(new Request(root+'/api/admin/bundle-assets'))).json();
assert.equal(privateList.assets[0].has_pdf,0,'No PDF is ready before upload');
assert.ok(!privateList.assets[0].pdf_key,'Do not expose R2 keys in private library list');
assert.equal((await assetAdmin(patch('/api/admin/bundle-assets/'+privateId,{...bundleOnlyMeta,title:'Edited Private Notes'}))).status,200);
db.prepare('UPDATE products SET pdf_key=? WHERE id=?').run('cards/'+privateId+'/notes-v1.pdf',privateId);
const available=await (await admin(new Request(root+'/api/admin/bundles'))).json();
assert.ok(available.available_products.some(p=>p.id===privateId&&p.bundle_only===1),
  'Uploaded private PDFs appear in bundle selection');
assert.ok(!available.available_products.some(p=>p.id===id3),'Ordinary unpublished drafts are not eligible');
assert.ok(!(await (await commerce(new Request(root+'/api/products'))).json()).products.some(p=>p.id===privateId),
  'Private PDF must never have a standalone listing');
assert.equal((await commerce(post('/api/checkout',{product_id:privateId}))).status,404,
  'Bundle-only PDF cannot be purchased as an individual product');
const privateBundleInput={...basic,title:'Keeneland Private Library Bundle',product_ids:[id1,privateId]};
result=await admin(post('/api/admin/bundles',privateBundleInput));
assert.equal(result.status,201,'Published bundle may contain protected PDF and published individual PDF');
const privateBundleId=(await result.json()).id;
const pub=await (await commerce(new Request(root+'/api/products'))).json();
assert.ok(pub.products.some(p=>p.id===privateBundleId&&p.kind==='bundle'));
assert.deepEqual(pub.products.find(p=>p.id===privateBundleId).categories,['Race Cards','Stable Notes'],
  'Bundle containing Race Cards and Stable Notes appears in both collections under one product ID');
assert.deepEqual((await (await admin(new Request(root+'/api/admin/bundles'))).json()).bundles
 .find(b=>b.id===privateBundleId).categories,['Race Cards','Stable Notes'],
  'Admin preview shows every automatic collection placement');
assert.ok(!JSON.stringify(pub).includes('cards/'+privateId+'/notes-v1.pdf'));
const privateSid='cs_live_'+'B'.repeat(50);
globalThis.fetch=async(url,options)=>{
  if(!String(url).includes('/checkout/sessions'))throw Error('Unexpected external call');
  const fields=new URLSearchParams(options.body);
  assert.equal(fields.get('line_items[0][price_data][unit_amount]'),'1999');
  return Response.json({id:privateSid,url:'https://checkout.stripe.com/c/pay/privatebundle',livemode:true});
};
result=await commerce(post('/api/checkout',{product_id:privateBundleId}));
assert.equal(result.status,200);
const privateOrder=db.prepare('SELECT id FROM orders WHERE product_id=?').get(privateBundleId);
const privateKeys=db.prepare('SELECT pdf_key FROM bundle_order_items WHERE order_id=? ORDER BY position').all(privateOrder.id).map(x=>x.pdf_key);
assert.deepEqual(privateKeys,['cards/friday/v1.pdf','cards/'+privateId+'/notes-v1.pdf']);
db.prepare('UPDATE products SET pdf_key=? WHERE id=?').run('cards/'+privateId+'/notes-v2.pdf',privateId);
assert.equal(db.prepare('SELECT pdf_key FROM bundle_order_items WHERE order_id=? AND product_id=?').get(privateOrder.id,privateId).pdf_key,
  'cards/'+privateId+'/notes-v1.pdf','Previous buyers retain their purchased private PDF version');
console.log('PASS bundle-only library: private metadata, public invisibility, no standalone checkout, bundle selection, secure checkout snapshots. No real charges.');

const denied=await assetAdmin(patch('/api/admin/bundle-assets/'+privateId+'/archive',{}));
assert.equal(denied.status,409,'A live bundle prevents private PDF archiving');
assert.equal(db.prepare('SELECT status FROM products WHERE id=?').get(privateId).status,'draft');
await admin(patch('/api/admin/bundles/'+privateBundleId,{...privateBundleInput,status:'archived'}));
const archived=await assetAdmin(patch('/api/admin/bundle-assets/'+privateId+'/archive',{}));
assert.equal(archived.status,200);
assert.equal(db.prepare('SELECT status FROM products WHERE id=?').get(privateId).status,'archived');
const inventory=await (await assetAdmin(new Request(root+'/api/admin/bundle-assets'))).json();
assert.ok(inventory.assets.some(a=>a.id===privateId&&a.status==='archived'));
const candidates=await (await admin(new Request(root+'/api/admin/bundles'))).json();
assert.ok(!candidates.available_products.some(a=>a.id===privateId));
assert.equal((await assetAdmin(patch('/api/admin/bundle-assets/'+privateId,bundleOnlyMeta))).status,409);
assert.equal(db.prepare('SELECT pdf_key FROM bundle_order_items WHERE order_id=? AND product_id=?').get(privateOrder.id,privateId).pdf_key,'cards/'+privateId+'/notes-v1.pdf');
console.log('PASS private PDF archiving: live bundle protection, retired inventory, buyer snapshots preserved.');

const activeUnpaid=db.prepare('SELECT status FROM orders WHERE id=?').get(privateOrder.id);
assert.equal(activeUnpaid.status,'pending');
let deletion=await assetAdmin(post('/api/admin/bundle-assets/'+privateId+'/purge',{}));
assert.equal(deletion.status,409,'Incomplete Stripe checkout blocks physical deletion');
db.prepare("UPDATE orders SET status='paid',paid_at=CURRENT_TIMESTAMP,access_days=7 WHERE id=?").run(privateOrder.id);
assert.equal((await commerce(new Request(root+'/api/orders/'+privateSid+'/download?item_id='+privateId))).status,200,
 'Buyer can download the private PDF inside the seven-day window');
deletion=await assetAdmin(post('/api/admin/bundle-assets/'+privateId+'/purge',{}));
assert.equal(deletion.status,409,'Paid order within seven days blocks physical deletion');
db.prepare("UPDATE orders SET paid_at=datetime('now','-8 days') WHERE id=?").run(privateOrder.id);
assert.equal((await commerce(new Request(root+'/api/orders/'+privateSid+'/download?item_id='+privateId))).status,403,
 'At eight days, paid customer no longer has download entitlement');
const deletedKeys=[];
env.CARDS_BUCKET.list=async ({prefix})=>({objects:[
 {key:prefix+'notes-v1.pdf',size:2000},{key:prefix+'notes-v2.pdf',size:3000}
],truncated:false});
env.CARDS_BUCKET.delete=async keys=>{deletedKeys.push(...(Array.isArray(keys)?keys:[keys]));};
deletion=await assetAdmin(post('/api/admin/bundle-assets/'+privateId+'/purge',{}));
assert.equal(deletion.status,200,'Expired, archived PDF may be physically purged');
const purgeResult=await deletion.json();
assert.equal(purgeResult.files_deleted,2);
assert.equal(purgeResult.bytes_deleted,5000);
assert.equal(deletedKeys.length,2,'All uploaded versions removed from R2');
assert.equal(db.prepare('SELECT pdf_key FROM products WHERE id=?').get(privateId).pdf_key,null);
assert.ok(db.prepare('SELECT purged_at FROM bundle_only_assets WHERE product_id=?').get(privateId).purged_at);
const postPurge=await (await assetAdmin(new Request(root+'/api/admin/bundle-assets'))).json();
assert.ok(!postPurge.assets.some(a=>a.id===privateId),'Permanently deleted PDF disappears from admin inventory');
assert.equal(db.prepare('SELECT pdf_key FROM bundle_order_items WHERE order_id=? AND product_id=?').get(privateOrder.id,privateId).pdf_key,
 'cards/'+privateId+'/notes-v1.pdf','Prior order snapshot must be retained for history');
assert.equal((await assetAdmin(post('/api/admin/bundle-assets/'+privateId+'/purge',{}))).status,410);
console.log('PASS: Seven-day new purchases and guarded R2 purge after checkout/entitlement expiry.');


// Timed bundle releases use the same embargo table as scheduled single PDFs.
// Exercise every endpoint with real SQLite, keeping the live checkout fixture fake.
const scheduledChild='55555555-5555-4555-8555-555555555555';
add.run(scheduledChild,'Sunday Stable Notes','sunday-stable','Stable Notes','2026-11-01','Keeneland','Stable Notes research',799,'cards/sunday-stable/v1.pdf','published');
const futureRelease=new Date(Date.now()+2*86400000).toISOString().slice(0,19).replace('T',' ');
const laterRelease=new Date(Date.now()+3*86400000).toISOString().slice(0,19).replace('T',' ');
const pastRelease=new Date(Date.now()-3600000).toISOString().slice(0,19).replace('T',' ');
const timed={...basic,title:'Scheduled Racing Intelligence Package',category:'Race Cards',
  product_ids:[id1,scheduledChild],race_date:'2026-11-01',release_at:futureRelease};
assert.equal((await admin(post('/api/admin/bundles',{...timed,release_at:'2026-02-30 12:00:00'}))).status,400,
  'Malformed dates must never schedule a bundle');
assert.equal((await admin(post('/api/admin/bundles',{...timed,status:'draft'}))).status,400,
  'Private bundle drafts cannot masquerade as scheduled published releases');
assert.equal((await admin(post('/api/admin/bundles',{...timed,release_at:pastRelease}))).status,400,
  'Past release times are not accepted at bundle creation');
result=await admin(post('/api/admin/bundles',timed));
assert.equal(result.status,201,'Bundle with future release can be created atomically');
const timedId=(await result.json()).id;
let scheduleRow=db.prepare('SELECT release_at FROM product_release_schedule WHERE product_id=?').get(timedId);
assert.equal(scheduleRow?.release_at,futureRelease,'Schedule is committed with bundle and its PDF membership');
let timedAdmin=(await (await admin(new Request(root+'/api/admin/bundles'))).json()).bundles.find(b=>b.id===timedId);
assert.equal(timedAdmin.release_at,futureRelease,'Publisher can see the scheduled release');
assert.deepEqual(timedAdmin.categories,['Race Cards','Stable Notes'],'Mixed-category listing retains all placements');
assert.ok(!(await (await commerce(new Request(root+'/api/products'))).json()).products.some(p=>p.id===timedId),
  'Scheduled bundle absent from every public collection before release');
const ordersBefore=db.prepare('SELECT count(*) AS count FROM orders').get().count;
assert.equal((await commerce(post('/api/checkout',{product_id:timedId}))).status,404,
  'Direct Stripe checkout is unavailable before bundle release');
assert.equal(db.prepare('SELECT count(*) AS count FROM orders').get().count,ordersBefore,
  'Scheduled bundle cannot create a pending payment before release');
result=await admin(patch('/api/admin/bundles/'+timedId,{...timed,release_at:laterRelease}));
assert.equal(result.status,200,'Can reschedule a pending bundle');
assert.equal(db.prepare('SELECT release_at FROM product_release_schedule WHERE product_id=?').get(timedId).release_at,laterRelease);
result=await admin(patch('/api/admin/bundles/'+timedId,{...timed,title:'Updated scheduled package',release_at:undefined}));
assert.equal(result.status,200,'Updating scheduled bundle details without release_at must preserve embargo');
assert.equal(db.prepare('SELECT release_at FROM product_release_schedule WHERE product_id=?').get(timedId).release_at,laterRelease);
result=await admin(patch('/api/admin/bundles/'+timedId,{...timed,status:'draft',release_at:null}));
assert.equal(result.status,200,'Cancel scheduled bundle returns it to a private draft');
assert.equal(db.prepare('SELECT status FROM products WHERE id=?').get(timedId).status,'draft');
assert.equal(db.prepare('SELECT release_at FROM product_release_schedule WHERE product_id=?').get(timedId),undefined,
  'Cancelling removes the release gate');
assert.ok(!(await (await commerce(new Request(root+'/api/products'))).json()).products.some(p=>p.id===timedId));
result=await admin(patch('/api/admin/bundles/'+timedId,{...timed,release_at:futureRelease}));
assert.equal(result.status,200,'A cancelled private bundle may be scheduled again');
db.prepare('UPDATE product_release_schedule SET release_at=? WHERE product_id=?').run(pastRelease,timedId);
const availableAfterRelease=(await (await commerce(new Request(root+'/api/products'))).json()).products;
const visible=availableAfterRelease.find(p=>p.id===timedId);
assert.equal(visible?.kind,'bundle','Bundle appears automatically once clock passes release');
assert.deepEqual(visible.categories,['Race Cards','Stable Notes']);
assert.equal(visible.bundle_count,2);
assert.equal((await admin(patch('/api/admin/bundles/'+timedId,{...timed,release_at:laterRelease}))).status,400,
  'An already-live bundle may not be hidden again under a new future schedule');
assert.equal((await admin(patch('/api/admin/bundles/'+timedId,{...timed,status:'archived',release_at:null}))).status,200,
  'Archiving a bundle clears any old release record');
assert.equal(db.prepare('SELECT release_at FROM product_release_schedule WHERE product_id=?').get(timedId),undefined);
console.log('PASS scheduled bundles: future release, secure embargo, cross-category listing, rescheduling, cancel, archive, and no early Stripe orders.');

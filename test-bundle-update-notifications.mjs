import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {replacePdfAndNotifyBuyers,sendQueuedEmails,handleCommerce} from './src/commerce.js';

// Exercise the same SQLite outbox, bundle order snapshots and access-token
// restrictions used by the Cloudflare Worker. No real emails or Stripe charges.
const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE products (id TEXT PRIMARY KEY,title TEXT,slug TEXT,category TEXT,race_date TEXT,track TEXT,description TEXT,price_cents INTEGER,pdf_key TEXT,image_url TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
for(const name of ['001_stripe_orders.sql','002_email_delivery.sql','003_live_readiness.sql','004_automatic_bundles.sql','005_bundle_only_assets.sql','006_seven_day_access.sql'])
 db.exec(readFileSync('migrations/'+name,'utf8'));
const STORE_DB={prepare(sql){
 let args=[];
 const statement={
  bind(...values){args=values;return statement;},
  first(){return db.prepare(sql).get(...args);},
  all(){return {results:db.prepare(sql).all(...args)};},
  run(){const out=db.prepare(sql).run(...args);return {meta:{changes:out.changes}};}
 };
 return statement;
},async batch(statements){
 db.exec('BEGIN IMMEDIATE');
 try{const result=statements.map(s=>s.run());db.exec('COMMIT');return result}
 catch(error){db.exec('ROLLBACK');throw error}
}};
const pid={
 private:'11111111-1111-4111-8111-111111111111',
 published:'22222222-2222-4222-8222-222222222222',
 bundle:'33333333-3333-4333-8333-333333333333',
 other:'44444444-4444-4444-8444-444444444444'
};
const makeProduct=db.prepare("INSERT INTO products (id,title,slug,category,price_cents,pdf_key,status) VALUES(?,?,?,?,?,?,?)");
makeProduct.run(pid.private,'Private Racing Intelligence Notes','private-notes','Stable Notes',0,'cards/private-v1.pdf','draft');
makeProduct.run(pid.published,'Race Card Analysis','race-cards','Race Cards',799,'cards/card-v1.pdf','published');
makeProduct.run(pid.bundle,'All-In Racing Intelligence','all-in','Race Cards',1999,'__rr_bundle__','published');
makeProduct.run(pid.other,'Unrelated Card','other','Race Cards',899,'cards/other.pdf','published');
db.prepare("INSERT INTO bundle_only_assets(product_id) VALUES (?)").run(pid.private);
const bundleOrderId='55555555-5555-4555-8555-555555555555';
const otherBundleOrderId='66666666-6666-4666-8666-666666666666';
const expiredOrderId='77777777-7777-4777-8777-777777777777';
const revokedOrderId='88888888-8888-4888-8888-888888888888';
const pendingOrderId='99999999-9999-4999-8999-999999999999';
const testOrderId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const directOrderId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const foreignTestOrderId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const insertOrder=db.prepare("INSERT INTO orders (id,product_id,product_title,pdf_key,amount_cents,stripe_session_id,buyer_email,status,paid_at,access_days) VALUES(?,?,?,?,?,?,?, ?,datetime('now',?),7)");
const addOrder=(id,productId,key,email,status='paid',paidOffset='0 days',mode='live')=>{
 insertOrder.run(id,productId,productId===pid.bundle?'All-In Racing Intelligence':'Race Card Analysis',key,1999,
  'cs_'+mode+'_'+id.replace(/-/g,''),email,status,paidOffset);
};
addOrder(bundleOrderId,pid.bundle,'__rr_bundle__','active-bundle@example.org');
addOrder(otherBundleOrderId,pid.bundle,'__rr_bundle__','other-bundle@example.org');
addOrder(expiredOrderId,pid.bundle,'__rr_bundle__','expired@example.org','paid','-8 days');
addOrder(revokedOrderId,pid.bundle,'__rr_bundle__','refunded@example.org','revoked');
addOrder(pendingOrderId,pid.bundle,'__rr_bundle__','pending@example.org','pending');
addOrder(testOrderId,pid.bundle,'__rr_bundle__','admin@example.org','paid','0 days','test');
addOrder(foreignTestOrderId,pid.bundle,'__rr_bundle__','stranger@example.org','paid','0 days','test');
addOrder(directOrderId,pid.published,'cards/card-v1.pdf','direct@example.org');
const addSnapshot=db.prepare('INSERT INTO bundle_order_items(order_id,product_id,product_title,pdf_key,position) VALUES(?,?,?,?,?)');
for(const id of [bundleOrderId,expiredOrderId,revokedOrderId,pendingOrderId,testOrderId,foreignTestOrderId]){
 addSnapshot.run(id,pid.private,'Private Racing Intelligence Notes','cards/private-v1.pdf',0);
 addSnapshot.run(id,pid.published,'Race Card Analysis','cards/card-v1.pdf',1);
}
addSnapshot.run(otherBundleOrderId,pid.other,'Unrelated Card','cards/other.pdf',0);
const filesRead=[];
const env={STORE_DB,
 CARDS_BUCKET:{async get(key){filesRead.push(key);return {body:new TextEncoder().encode('%PDF-1.7 revised edition')}}},
 RESEND_API_KEY:'re_fake',RR_DELIVERY_SIGNING_KEY:'0123456789abcdef0123456789abcdef0123456789abcdef',
 ADMIN_EMAIL:'admin@example.org'};
const emails=[];
globalThis.fetch=async(url,options)=>{
 assert.ok(String(url).includes('api.resend.com/emails'),'No external request except stubbed email');
 const msg=JSON.parse(options.body);emails.push(msg);
 return Response.json({id:'resend_fake_'+emails.length});
};
const readJobs=()=>db.prepare("SELECT order_id,email,product_id,updated_pdf_key,state FROM product_update_jobs ORDER BY order_id").all();
const privateItem=db.prepare('SELECT * FROM products WHERE id=?').get(pid.private);
const privateNotices=await replacePdfAndNotifyBuyers(env,privateItem,'cards/private-v2.pdf');
assert.equal(privateNotices,2,'Only paid active live bundle customer and permitted sandbox admin receive notification');
assert.equal(db.prepare('SELECT pdf_key FROM products WHERE id=?').get(pid.private).pdf_key,'cards/private-v2.pdf');
let jobs=readJobs();
assert.deepEqual(jobs.map(x=>x.order_id).sort(),[bundleOrderId,testOrderId].sort());
assert.ok(jobs.every(x=>x.product_id===pid.private&&x.updated_pdf_key==='cards/private-v2.pdf'));
assert.equal(db.prepare('SELECT pdf_key FROM bundle_order_items WHERE order_id=? AND product_id=?').get(bundleOrderId,pid.private).pdf_key,'cards/private-v1.pdf',
 'Historical purchased bundle downloads must remain intact');
assert.equal(await sendQueuedEmails(env,8),2,'Two eligible update notices delivered');
assert.equal(emails.length,2);
assert.ok(emails.every(e=>e.subject.includes('Private Racing Intelligence Notes')));
const bundleEmail=emails.find(e=>e.to[0]==='active-bundle@example.org');
assert.ok(bundleEmail,'Live bundle buyer receives an email');
const match=bundleEmail.html.match(/href="(https:\/\/railandryeracing\.com\/store\/access\.html\?code=[^"]+)"/);
assert.ok(match,'Email contains secure signed updated PDF URL');
const accessCode=new URL(match[1]).searchParams.get('code');
const root='https://railandryeracing.com';
const request=(path,body)=>new Request(root+path,{method:'POST',headers:{Origin:root,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify(body)});
assert.equal((await handleCommerce(request('/api/delivery/download',{code:accessCode}),env,new URL(root+'/api/delivery/download'),{})).status,200);
assert.equal(filesRead.at(-1),'cards/private-v2.pdf','Updated link delivers NEW PDF');
assert.equal((await handleCommerce(new Request(root+'/api/orders/'+'cs_live_'+bundleOrderId.replace(/-/g,'')+'/download?item_id='+pid.private),env,new URL(root+'/api/orders/'+'cs_live_'+bundleOrderId.replace(/-/g,'')+'/download?item_id='+pid.private),{})).status,200);
assert.equal(filesRead.at(-1),'cards/private-v1.pdf','Original paid bundle access still delivers original purchased edition');
assert.equal(await sendQueuedEmails(env,8),0,'No duplicate notifications after send');
assert.equal(emails.length,2);

// Published PDFs already notify both direct buyers and those who bought a bundle.
const publishedItem=db.prepare('SELECT * FROM products WHERE id=?').get(pid.published);
const publishedNotices=await replacePdfAndNotifyBuyers(env,publishedItem,'cards/card-v2.pdf');
assert.equal(publishedNotices,3,'Active bundle buyers and direct buyer get published-PDF notice');
assert.equal(await sendQueuedEmails(env,8),3);
assert.equal(emails.length,5);
assert.equal(emails.filter(e=>e.to[0]==='direct@example.org').length,1);
assert.equal(emails.filter(e=>e.to[0]==='active-bundle@example.org').length,2,
 'One notice per included PDF replacement, no duplicate per replacement');
assert.equal(db.prepare('SELECT pdf_key FROM bundle_order_items WHERE order_id=? AND product_id=?').get(bundleOrderId,pid.published).pdf_key,'cards/card-v1.pdf');
const src=readFileSync('src/index.js','utf8');
assert.ok(src.includes("SELECT product_id FROM bundle_only_assets WHERE product_id=? AND purged_at IS NULL"),
 'Actual authenticated private-library PDF upload must pass through replacement notifier');
assert.ok(src.includes('await replacePdfAndNotifyBuyers(env,item,key)'));
console.log('PASS bundle update emails: private & published PDFs, active paid buyer selection, sandbox recipient rules, secure revised download, original snapshots, expired/refunded/unpaid exclusions, no duplicates.');

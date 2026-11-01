import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleCommerce} from './src/commerce.js';
import {ensureReleaseSchedule,validReleaseAt} from './src/publication-schedule.js';

const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE products (
 id TEXT PRIMARY KEY,title TEXT,slug TEXT,category TEXT,race_date TEXT,track TEXT,
 description TEXT,price_cents INTEGER,pdf_key TEXT,image_url TEXT,status TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE bundle_only_assets(product_id TEXT PRIMARY KEY);
CREATE TABLE bundle_items(bundle_id TEXT,product_id TEXT,position INTEGER);
CREATE TABLE orders (id TEXT PRIMARY KEY, product_id TEXT, product_title TEXT,
 pdf_key TEXT,amount_cents INTEGER,status TEXT,access_days INTEGER,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
const STORE_DB={prepare(sql){
 let args=[];
 const statement={bind(...values){args=values;return statement;},
  first(){return db.prepare(sql).get(...args);},
  all(){return {results:db.prepare(sql).all(...args)};},
  run(){return db.prepare(sql).run(...args);}};
 return statement;
},async batch(entries){
 db.exec('BEGIN IMMEDIATE');
 try{const out=entries.map(q=>q.run());db.exec('COMMIT');return out;}
 catch(err){db.exec('ROLLBACK');throw err;}
}};
let pdfReads=0;
const env={STORE_DB,CARDS_BUCKET:{async get(key){pdfReads++;return {body:new TextEncoder().encode('%PDF-1.7 scheduled fixture')};}},
 STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_fake',RESEND_API_KEY:'re_fake',
 RR_DELIVERY_SIGNING_KEY:'123456789abcdef0123456789abcdef0123456789abcdef',ADMIN_EMAIL:'test@example.com'};
const id=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const add=db.prepare('INSERT INTO products(id,title,slug,category,price_cents,pdf_key,status) VALUES(?,?,?,?,?,?,?)');
add.run(id[0],'Scheduled free','scheduled-free','Race Cards',0,'cards/scheduled-free.pdf','published');
add.run(id[1],'Scheduled paid','scheduled-paid','Race Cards',999,'cards/scheduled-paid.pdf','published');
add.run(id[2],'Existing free','existing-free','Race Cards',0,'cards/existing-free.pdf','published');
add.run(id[3],'Bundle with unpublished card','bundle','Race Cards',1599,'__rr_bundle__','published');
db.prepare('INSERT INTO bundle_items(bundle_id,product_id,position) VALUES(?,?,?)').run(id[3],id[1],0);
db.prepare('INSERT INTO bundle_items(bundle_id,product_id,position) VALUES(?,?,?)').run(id[3],id[2],1);
await ensureReleaseSchedule(env);
await ensureReleaseSchedule(env); // Idempotent on deployed and already-migrated stores.
assert.equal(db.prepare("SELECT count(*) AS total FROM sqlite_master WHERE type='table' AND name='product_release_schedule'").get().total,1);
const future=new Date(Date.now()+24*3600_000).toISOString().slice(0,19).replace('T',' ');
const past=new Date(Date.now()-3600_000).toISOString().slice(0,19).replace('T',' ');
assert.ok(validReleaseAt(future));
assert.ok(validReleaseAt(past));
assert.ok(!validReleaseAt('2026-02-30 12:34:00'));
assert.ok(!validReleaseAt('2026-11-01T05:30:00Z'));
assert.ok(!validReleaseAt('2026-11-01 01:30:00-04:00'));
const save=db.prepare('INSERT INTO product_release_schedule(product_id,release_at) VALUES (?,?)');
save.run(id[0],future);save.run(id[1],future);
const root='https://railandryeracing.com';
const get=async path=>{
 const request=new Request(root+path);
 return handleCommerce(request,env,new URL(request.url),{});
};
const listing=await (await get('/api/products')).json();
assert.ok(listing.products.some(p=>p.id===id[2]),'Existing public products remain visible');
assert.ok(!listing.products.some(p=>[id[0],id[1],id[3]].includes(p.id)),
 'Future free/paid releases and bundles containing those files stay hidden');
assert.equal((await get('/api/free-download/'+id[0])).status,404,
 'A scheduled $0 PDF cannot be opened with its direct URL');
assert.equal(pdfReads,0,'No R2 read before release');
const post=new Request(root+'/api/checkout',{method:'POST',headers:{Origin:root,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify({product_id:id[1]})});
assert.equal((await handleCommerce(post,env,new URL(post.url),{})).status,404,
 'Stripe checkout cannot start early for a scheduled paid publication');
assert.equal(db.prepare('SELECT count(*) AS total FROM orders').get().total,0,'No order made for embargoed product');
assert.equal((await handleCommerce(new Request(root+'/api/checkout',{method:'POST',headers:{Origin:root,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify({product_id:id[3]})}),env,new URL(root+'/api/checkout'),{})).status,409,
 'Bundle containing a future-release PDF cannot be purchased early');
db.prepare('UPDATE product_release_schedule SET release_at=? WHERE product_id IN (?,?)').run(past,id[0],id[1]);
const released=await (await get('/api/products')).json();
assert.ok(released.products.some(p=>p.id===id[0]),'Scheduled free PDF appears after release');
assert.ok(released.products.some(p=>p.id===id[1]),'Scheduled paid PDF appears after release');
assert.ok(released.products.some(p=>p.id===id[3]),'Bundle eligibility recovers after component release');
assert.equal((await get('/api/free-download/'+id[0])).status,200,'Scheduled free PDF opens after release');
assert.equal(pdfReads,1,'Only released PDF read from R2');
const src=readFileSync('./src/index.js','utf8');
assert.ok(src.includes('await ensureReleaseSchedule(env)'),'Admin and covers initialize schedule gating');
assert.ok(src.includes('INSERT INTO product_release_schedule')&&src.includes('env.STORE_DB.batch(ops)'),
 'Schedule and publish status are written transactionally');
console.log('PASS scheduled publications: UTC validation, automatic release, public catalog/checkout/free-download embargo, bundle leak prevention, admin atomic gate, schema auto-setup.');

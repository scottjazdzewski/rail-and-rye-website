import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleCommerce} from './src/commerce.js';

// Test direct free downloads without any Stripe keys, sessions, orders or mail.
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE products (
  id TEXT PRIMARY KEY,title TEXT,slug TEXT,category TEXT,race_date TEXT,track TEXT,
  description TEXT,price_cents INTEGER,pdf_key TEXT,image_url TEXT,status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE bundle_only_assets (product_id TEXT PRIMARY KEY);
CREATE TABLE bundle_items (bundle_id TEXT,product_id TEXT,position INTEGER);`);
const freeId='11111111-1111-4111-8111-111111111111',
  paidId='22222222-2222-4222-8222-222222222222',
  draftId='33333333-3333-4333-8333-333333333333',
  privateId='44444444-4444-4444-8444-444444444444',
  bundleId='55555555-5555-4555-8555-555555555555',
  archivedId='66666666-6666-4666-8666-666666666666';
const add=db.prepare(`INSERT INTO products (id,title,slug,category,price_cents,pdf_key,status)
  VALUES (?,?,?,?,?,?,?)`);
add.run(freeId,'Free Friday Race Card','free-friday','Race Cards',0,'cards/free/friday.pdf','published');
add.run(paidId,'Paid Saturday Race Card','paid-saturday','Race Cards',990,'cards/paid/saturday.pdf','published');
add.run(draftId,'Draft Preview','draft','Race Cards',0,'cards/draft/preview.pdf','draft');
add.run(privateId,'Private Bundle Bonus','private','Race Cards',0,'cards/private/bonus.pdf','published');
add.run(bundleId,'Bundle Sentinel','bundle','Race Cards',0,'__rr_bundle__','published');
add.run(archivedId,'Archived Free Card','archived','Race Cards',0,'cards/archive.pdf','archived');
db.prepare('INSERT INTO bundle_only_assets (product_id) VALUES (?)').run(privateId);
const STORE_DB={prepare(sql){
  let args=[];
  const query={bind(...a){args=a;return query;},
    first(){return db.prepare(sql).get(...args);},
    all(){return {results:db.prepare(sql).all(...args)};},
    run(){return db.prepare(sql).run(...args);}};
  return query;
}};
let reads=[];
const env={STORE_DB,CARDS_BUCKET:{async get(key){
  reads.push(key);
  return {body:new TextEncoder().encode('%PDF-1.7 test direct download')};
}}};
const root='https://railandryeracing.com';
const req=path=>{const request=new Request(root+path);return handleCommerce(request,env,new URL(request.url),{});};
const catalog=await (await req('/api/products')).json();
const pub=catalog.products.find(p=>p.id===freeId);
assert.ok(pub,'A published free PDF must appear in public store');
assert.equal(pub.price_cents,0);
assert.equal(pub.kind,'single');
assert.ok(!catalog.products.some(p=>p.id===draftId||p.id===privateId),'Unpublished/private PDFs excluded from public catalog');
const free=await req('/api/free-download/'+freeId);
assert.equal(free.status,200,'Published free PDF downloads without Stripe');
assert.equal(free.headers.get('Content-Type'),'application/pdf');
assert.equal(free.headers.get('Cache-Control'),'no-store');
assert.ok(free.headers.get('Content-Disposition').includes('Free-Friday-Race-Card.pdf'));
assert.equal((await free.text()).startsWith('%PDF-'),true);
assert.deepEqual(reads,['cards/free/friday.pdf']);
for(const id of [paidId,draftId,privateId,bundleId,archivedId]){
  const resp=await req('/api/free-download/'+id);
  assert.equal(resp.status,404,'Never download paid, private, bundle, draft or archived PDFs: '+id);
}
assert.equal(reads.length,1,'Rejected URLs may not access any R2 object');
const malformed=await req('/api/free-download/not-an-id');
assert.equal(malformed.status,404);
const post=new Request(root+'/api/free-download/'+freeId,{method:'POST'});
assert.equal((await handleCommerce(post,env,new URL(post.url),{})).status,405,'Only safe GETs permitted');
// A prior free link cannot bypass a later pricing change.
db.prepare('UPDATE products SET price_cents=500 WHERE id=?').run(freeId);
assert.equal((await req('/api/free-download/'+freeId)).status,404);
assert.equal(reads.length,1,'No R2 exposure after price changes');
console.log('PASS: Published $0 PDF direct download, no Stripe or order; no R2 keys leaked; paid/private/draft/bundle/archived blocked; price changes revoke public access.');

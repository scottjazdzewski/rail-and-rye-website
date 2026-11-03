/* A scheduled edition is stored with its PDF already attached, but stays
   invisible until its UTC release instant. D1 schema is provisioned idempotently
   so existing deployed stores do not require a manual migration. */
const ready=new WeakMap();
const expiryReady=new WeakMap();
export async function ensureReleaseSchedule(env){
  if(!env?.STORE_DB)throw Error('Publication database unavailable');
  const db=env.STORE_DB;
  let pending=ready.get(db);
  if(!pending){
    pending=Promise.resolve(db.prepare(`CREATE TABLE IF NOT EXISTS product_release_schedule (
      product_id TEXT PRIMARY KEY,
      release_at TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    )`).run());
    ready.set(db,pending);
    pending.catch(()=>{if(ready.get(db)===pending)ready.delete(db);});
  }
  await pending;
  await ensureRacePdfExpirySchema(env);
}
export async function ensureRacePdfExpirySchema(env){
  if(!env?.STORE_DB)throw Error('Publication database unavailable');
  const db=env.STORE_DB;let pending=expiryReady.get(db);
  if(!pending){
    pending=(async()=>{
      await db.prepare("CREATE TABLE IF NOT EXISTS bundle_only_assets (product_id TEXT PRIMARY KEY,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES products(id))").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS product_update_jobs (id TEXT PRIMARY KEY,order_id TEXT NOT NULL,product_id TEXT NOT NULL,email TEXT NOT NULL,product_title TEXT NOT NULL,updated_pdf_key TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','sent')),attempts INTEGER NOT NULL DEFAULT 0,download_count INTEGER NOT NULL DEFAULT 0 CHECK(download_count>=0),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,claimed_at TEXT,sent_at TEXT,provider_id TEXT,last_error TEXT,UNIQUE(order_id,product_id,updated_pdf_key),FOREIGN KEY(order_id) REFERENCES orders(id))").run();
      for(const [table,column] of [['products','first_post_at'],['orders','pdf_expires_at'],['orders','pdf_purged_at'],['bundle_order_items','pdf_expires_at'],['bundle_order_items','pdf_purged_at'],['bundle_only_assets','purged_at'],['product_update_jobs','pdf_purged_at']]){
        const info=await db.prepare('PRAGMA table_info('+table+')').all();
        if((info.results||[]).some(row=>row.name===column))continue;
        try{await db.prepare('ALTER TABLE '+table+' ADD COLUMN '+column+' TEXT').run();}
        catch(error){
          const after=await db.prepare('PRAGMA table_info('+table+')').all();
          if(!(after.results||[]).some(row=>row.name===column))throw error;
        }
      }
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_products_first_post_at ON products(first_post_at)').run();
    })();
    expiryReady.set(db,pending);
    pending.catch(()=>{if(expiryReady.get(db)===pending)expiryReady.delete(db);});
  }
  await pending;
}
// UTC second string; public publishing inputs convert New York time before storage.
export function validRacePostAt(value){
  if(value===null||value===undefined||value==='')return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))return false;
  const epoch=Date.parse(value.replace(' ','T')+'Z');
  return Number.isFinite(epoch)&&new Date(epoch).toISOString().replace('T',' ').slice(0,19)===value;
}
// Exact UTC second string; no locale ambiguity in SQL comparisons.
export function validReleaseAt(value){
  if(value===null||value===undefined||value==='')return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))return false;
  const epoch=Date.parse(value.replace(' ','T')+'Z');
  return Number.isFinite(epoch)&&new Date(epoch).toISOString().replace('T',' ').slice(0,19)===value;
}

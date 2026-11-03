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
      for(const [table,column] of [['products','pdf_expires_at'],['orders','pdf_expires_at'],['orders','pdf_purged_at'],['bundle_order_items','pdf_expires_at'],['bundle_order_items','pdf_purged_at'],['bundle_only_assets','purged_at'],['product_update_jobs','pdf_purged_at']]){
        const info=await db.prepare('PRAGMA table_info('+table+')').all();
        if((info.results||[]).some(row=>row.name===column))continue;
        try{await db.prepare('ALTER TABLE '+table+' ADD COLUMN '+column+' TEXT').run();}
        catch(error){
          const after=await db.prepare('PRAGMA table_info('+table+')').all();
          if(!(after.results||[]).some(row=>row.name===column))throw error;
        }
      }
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_products_pdf_expires_at ON products(pdf_expires_at)').run();
      // Fill current and legacy products from the racing date, so uploads made
      // before this policy change expire without a manual time entry.
      for(;;){
        const rows=await db.prepare("SELECT id,race_date FROM products WHERE pdf_expires_at IS NULL AND race_date IS NOT NULL AND date(race_date)=race_date LIMIT 50").all();
        const batch=(rows.results||[]).map(row=>{
          const expiry=pdfExpiryFromRaceDate(row.race_date);
          return expiry?db.prepare("UPDATE products SET pdf_expires_at=? WHERE id=? AND pdf_expires_at IS NULL").bind(expiry,row.id):null;
        }).filter(Boolean);
        if(!batch.length)break;
        await db.batch(batch);
      }
      // Recalculate legacy paid-order snapshots too. The cutoff now comes from
      // the PDF's racing date, including bundle members with their own dates.
      await db.batch([
        db.prepare(`UPDATE orders SET pdf_expires_at=(
          SELECT p.pdf_expires_at FROM products p WHERE p.id=orders.product_id
        ) WHERE pdf_key<>'__rr_bundle__'
          AND pdf_expires_at IS NOT (
            SELECT p.pdf_expires_at FROM products p WHERE p.id=orders.product_id
          )`),
        db.prepare(`UPDATE bundle_order_items SET pdf_expires_at=(
          SELECT p.pdf_expires_at FROM products p WHERE p.id=bundle_order_items.product_id
        ) WHERE pdf_expires_at IS NOT (
          SELECT p.pdf_expires_at FROM products p WHERE p.id=bundle_order_items.product_id
        )`)
      ]);
    })();
    expiryReady.set(db,pending);
    pending.catch(()=>{if(expiryReady.get(db)===pending)expiryReady.delete(db);});
  }
  await pending;
}
// Expire at 12:00 AM ET two calendar days after the racing date.
export function pdfExpiryFromRaceDate(value){
  const match=String(value||'').match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const original=new Date(Date.UTC(year,month-1,day));
  if(original.getUTCFullYear()!==year||original.getUTCMonth()!==month-1||original.getUTCDate()!==day)return null;
  const expiryDate=new Date(Date.UTC(year,month-1,day+2));
  const target=Date.UTC(expiryDate.getUTCFullYear(),expiryDate.getUTCMonth(),expiryDate.getUTCDate(),0,0,0);
  let guess=target+5*60*60*1000;
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  for(let i=0;i<3;i++){
    const parts=Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part=>[part.type,part.value]));
    const wall=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
    guess+=target-wall;
  }
  return new Date(guess).toISOString().replace('T',' ').slice(0,19);
}
export function racePdfExpired(value,now=Date.now()){
  if(!value)return true;
  const source=String(value);
  const epoch=Date.parse(source.includes('T')?source:source.replace(' ','T')+'Z');
  return !Number.isFinite(epoch)||epoch<=now;
}
// Exact UTC second string; no locale ambiguity in SQL comparisons.
export function validReleaseAt(value){
  if(value===null||value===undefined||value==='')return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))return false;
  const epoch=Date.parse(value.replace(' ','T')+'Z');
  return Number.isFinite(epoch)&&new Date(epoch).toISOString().replace('T',' ').slice(0,19)===value;
}

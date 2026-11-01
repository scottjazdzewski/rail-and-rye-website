/* A scheduled edition is stored with its PDF already attached, but stays
   invisible until its UTC release instant. D1 schema is provisioned idempotently
   so existing deployed stores do not require a manual migration. */
const ready=new WeakMap();
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
}
// Exact UTC second string; no locale ambiguity in SQL comparisons.
export function validReleaseAt(value){
  if(value===null||value===undefined||value==='')return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))return false;
  const epoch=Date.parse(value.replace(' ','T')+'Z');
  return Number.isFinite(epoch)&&new Date(epoch).toISOString().replace('T',' ').slice(0,19)===value;
}

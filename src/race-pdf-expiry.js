import {ensureRacePdfExpirySchema} from './publication-schedule.js';
const BUNDLE_KEY='__rr_bundle__';
export async function purgeExpiredRacePdfs(env,limit=8){
  if(!env?.STORE_DB||!env?.CARDS_BUCKET)return 0;
  await ensureRacePdfExpirySchema(env);
  const candidates=await env.STORE_DB.prepare(`SELECT product_id,pdf_key,MIN(expiration) AS expiration FROM (
      SELECT p.id AS product_id,p.pdf_key,p.pdf_expires_at AS expiration
        FROM products p LEFT JOIN bundle_only_assets a ON a.product_id=p.id
        WHERE p.pdf_key IS NOT NULL AND p.pdf_key<>?
          AND (p.status IN ('published','archived') OR EXISTS(SELECT 1 FROM bundle_items bi JOIN products b ON b.id=bi.bundle_id WHERE bi.product_id=p.id AND b.pdf_key=? AND b.status IN ('published','archived')))
          AND (a.product_id IS NULL OR a.purged_at IS NULL)
      UNION ALL
      SELECT o.product_id,o.pdf_key,COALESCE(o.pdf_expires_at,p.pdf_expires_at) AS expiration
        FROM orders o JOIN products p ON p.id=o.product_id
        WHERE o.pdf_key IS NOT NULL AND o.pdf_key<>? AND o.pdf_purged_at IS NULL
      UNION ALL
      SELECT bi.product_id,bi.pdf_key,COALESCE(bi.pdf_expires_at,p.pdf_expires_at) AS expiration
        FROM bundle_order_items bi JOIN products p ON p.id=bi.product_id JOIN orders o ON o.id=bi.order_id
        WHERE bi.pdf_purged_at IS NULL AND bi.pdf_key IS NOT NULL
      UNION ALL
      SELECT j.product_id,j.updated_pdf_key AS pdf_key,
        COALESCE((SELECT bi.pdf_expires_at FROM bundle_order_items bi WHERE bi.order_id=o.id AND bi.product_id=j.product_id),
          o.pdf_expires_at,p.pdf_expires_at) AS expiration
        FROM product_update_jobs j JOIN orders o ON o.id=j.order_id JOIN products p ON p.id=j.product_id
        WHERE j.pdf_purged_at IS NULL AND j.updated_pdf_key IS NOT NULL
    ) refs
    WHERE datetime(expiration)<=CURRENT_TIMESTAMP
    GROUP BY product_id,pdf_key ORDER BY MIN(expiration),product_id LIMIT ?`)
    .bind(BUNDLE_KEY,BUNDLE_KEY,BUNDLE_KEY,Math.max(1,Math.min(50,limit))).all();
  let purged=0;
  for(const row of candidates.results||[]){
    const prefix='cards/'+row.product_id+'/';
    if(!row.pdf_key||!row.pdf_key.startsWith(prefix)){console.warn('Expired PDF cleanup skipped unexpected storage key',row.product_id);continue;}
    const active=await env.STORE_DB.prepare(`SELECT
      EXISTS(SELECT 1 FROM products p WHERE p.id=? AND p.pdf_key=? AND p.pdf_expires_at IS NOT NULL AND p.pdf_expires_at>CURRENT_TIMESTAMP)
      OR EXISTS(SELECT 1 FROM orders o JOIN products p ON p.id=o.product_id WHERE o.pdf_key=? AND o.product_id=?
        AND o.status='paid' AND datetime(o.paid_at,'+'||o.access_days||' days')>CURRENT_TIMESTAMP
        AND COALESCE(o.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP)
      OR EXISTS(SELECT 1 FROM bundle_order_items bi JOIN orders o ON o.id=bi.order_id JOIN products p ON p.id=bi.product_id
        WHERE bi.pdf_key=? AND bi.product_id=? AND o.status='paid'
        AND datetime(o.paid_at,'+'||o.access_days||' days')>CURRENT_TIMESTAMP
        AND COALESCE(bi.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP)
      OR EXISTS(SELECT 1 FROM product_update_jobs j JOIN orders o ON o.id=j.order_id JOIN products p ON p.id=j.product_id
        WHERE j.updated_pdf_key=? AND j.product_id=? AND j.pdf_purged_at IS NULL AND o.status='paid'
        AND datetime(o.paid_at,'+'||o.access_days||' days')>CURRENT_TIMESTAMP
        AND COALESCE((SELECT bi.pdf_expires_at FROM bundle_order_items bi WHERE bi.order_id=o.id AND bi.product_id=j.product_id),
          o.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP) AS active`)
      .bind(row.product_id,row.pdf_key,row.pdf_key,row.product_id,row.pdf_key,row.product_id,row.pdf_key,row.product_id).first();
    if(active?.active)continue;
    try{await env.CARDS_BUCKET.delete(row.pdf_key);}
    catch(error){console.warn('Expired PDF deletion deferred',row.product_id,String(error).slice(0,120));continue;}
    await env.STORE_DB.batch([
      env.STORE_DB.prepare(`UPDATE products SET pdf_key=NULL,status='archived'
        WHERE id=? AND pdf_key=? AND (pdf_expires_at IS NOT NULL AND pdf_expires_at<=CURRENT_TIMESTAMP)`)
        .bind(row.product_id,row.pdf_key),
      env.STORE_DB.prepare(`UPDATE orders SET pdf_purged_at=CURRENT_TIMESTAMP
        WHERE pdf_key=? AND pdf_purged_at IS NULL AND (status<>'paid' OR datetime(paid_at,'+'||access_days||' days')<=CURRENT_TIMESTAMP
          OR COALESCE(pdf_expires_at,(SELECT pdf_expires_at FROM products WHERE id=product_id))<=CURRENT_TIMESTAMP)`).bind(row.pdf_key),
      env.STORE_DB.prepare(`UPDATE bundle_order_items SET pdf_purged_at=CURRENT_TIMESTAMP
        WHERE pdf_key=? AND pdf_purged_at IS NULL AND EXISTS(SELECT 1 FROM orders o JOIN products p ON p.id=bundle_order_items.product_id
          WHERE o.id=bundle_order_items.order_id AND (o.status<>'paid' OR datetime(o.paid_at,'+'||o.access_days||' days')<=CURRENT_TIMESTAMP
            OR COALESCE(bundle_order_items.pdf_expires_at,p.pdf_expires_at)<=CURRENT_TIMESTAMP))`).bind(row.pdf_key),
      env.STORE_DB.prepare(`UPDATE product_update_jobs SET pdf_purged_at=CURRENT_TIMESTAMP
        WHERE updated_pdf_key=? AND pdf_purged_at IS NULL AND EXISTS(SELECT 1 FROM orders o JOIN products p ON p.id=product_update_jobs.product_id
          WHERE o.id=product_update_jobs.order_id AND (o.status<>'paid' OR datetime(o.paid_at,'+'||o.access_days||' days')<=CURRENT_TIMESTAMP
            OR COALESCE((SELECT bi.pdf_expires_at FROM bundle_order_items bi WHERE bi.order_id=o.id AND bi.product_id=product_update_jobs.product_id),
              o.pdf_expires_at,p.pdf_expires_at)<=CURRENT_TIMESTAMP))`).bind(row.pdf_key),
      env.STORE_DB.prepare('UPDATE bundle_only_assets SET purged_at=COALESCE(purged_at,CURRENT_TIMESTAMP) WHERE product_id=? AND NOT EXISTS(SELECT 1 FROM products WHERE id=? AND pdf_key IS NOT NULL)')
        .bind(row.product_id,row.product_id),
      env.STORE_DB.prepare(`UPDATE products SET status='archived' WHERE pdf_key=? AND status='published' AND id IN (
        SELECT bi.bundle_id FROM bundle_items bi JOIN products c ON c.id=bi.product_id WHERE c.id=? AND c.pdf_key IS NULL
      )`).bind(BUNDLE_KEY,row.product_id)
    ]);
    purged++;
  }
  return purged;
}

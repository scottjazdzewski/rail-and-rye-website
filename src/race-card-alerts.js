const SITE = 'https://railandryeracing.com';
const MAIL_FROM = 'Rail & Rye Racing <orders@railandryeracing.com>';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const encoder = new TextEncoder();
const schemaReady = new WeakMap();
const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function json(data, status) {
  return new Response(JSON.stringify(data), {status: status || 200, headers: API_HEADERS});
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, function (char) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
  });
}
function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !!origin && origin === new URL(request.url).origin &&
    request.headers.get('sec-fetch-site') !== 'cross-site';
}
function uuid() {
  return crypto.randomUUID();
}
function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(function (value) { return value.toString(16).padStart(2, '0'); }).join('');
}
function hex(bytes) {
  return Array.from(new Uint8Array(bytes)).map(function (value) {
    return value.toString(16).padStart(2, '0');
  }).join('');
}
async function tokenHash(token) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}
async function ensureSchema(env) {
  if (!env || !env.STORE_DB) throw new Error('Database unavailable');
  const db = env.STORE_DB;
  let pending = schemaReady.get(db);
  if (!pending) {
    pending = (async function () {
      await db.prepare("CREATE TABLE IF NOT EXISTS race_card_alert_subscribers (subscriber_id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE, consented_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmation_token_hash TEXT, confirmation_expires_at TEXT, confirmation_sent_at TEXT, confirmed_at TEXT, unsubscribed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS race_card_alert_ip_limits (ip_hash TEXT PRIMARY KEY, window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, requests INTEGER NOT NULL DEFAULT 1)").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS race_card_announcements (product_id TEXT PRIMARY KEY, available_at TEXT NOT NULL, queued_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS race_card_alert_jobs (product_id TEXT NOT NULL, subscriber_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','sent','failed','cancelled')), attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, claimed_at TEXT, sent_at TEXT, provider_id TEXT, last_error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(product_id, subscriber_id))").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_race_card_alert_jobs_queue ON race_card_alert_jobs(state, next_attempt_at, created_at)").run();
    })();
    schemaReady.set(db, pending);
    pending.catch(function () {
      if (schemaReady.get(db) === pending) schemaReady.delete(db);
    });
  }
  await pending;
}
async function resend(env, message, idempotencyKey) {
  if (!env.RESEND_API_KEY || !env.RESEND_API_KEY.startsWith('re_')) {
    throw new Error('Email integration unavailable');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.headers
    })
  });
  const result = await response.json().catch(function () { return {}; });
  if (!response.ok || !result.id) {
    console.warn('Race Card alert email was not accepted', response.status, result.name || 'provider error');
    throw new Error('Email provider request failed');
  }
  return String(result.id).slice(0, 120);
}
function confirmationMessage(token) {
  const link = SITE + '/api/race-card-alerts/confirm?token=' + encodeURIComponent(token);
  const text = 'Confirm your request to receive an email when a new Rail & Rye Race Card is published: ' + link + '\n\nIf you did not request this, ignore this message. You will not receive alerts unless you confirm.';
  const html = '<!doctype html><html><body style="background:#f7f3e9;color:#102b3c;font-family:Arial,sans-serif;padding:28px"><div style="max-width:560px;margin:auto;background:#fffaf0;border:1px solid #c7a260;padding:30px"><p style="font:26px Georgia,serif;letter-spacing:4px">RAIL &amp; RYE</p><p style="font-size:11px;color:#9b713b;letter-spacing:2px">RACE CARD EMAIL ALERTS</p><h1 style="font:30px Georgia,serif">Confirm your email</h1><p>Confirm that you want an email when a new Rail &amp; Rye Race Card is published. We will send only these card availability alerts, and you can unsubscribe at any time.</p><p><a style="display:inline-block;padding:15px 20px;background:#0b2b3d;color:#fff1d4;text-decoration:none" href="' + escapeHtml(link) + '">CONFIRM EMAIL ALERTS</a></p><p style="font-size:13px;color:#596a6c">If you did not request alerts, ignore this message.</p></div></body></html>';
  return {subject: 'Confirm Rail & Rye Race Card alerts', text: text, html: html};
}
async function subscribe(request, env) {
  if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);
  if (!sameOrigin(request)) return json({error: 'Same-origin request required'}, 403);
  const size = Number(request.headers.get('content-length') || 0);
  if (size > 4096) return json({error: 'Request too large'}, 413);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({error: 'Request too large'}, 413);
    body = JSON.parse(raw);
  } catch (_) {
    return json({error: 'Invalid request'}, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({error: 'Invalid request'}, 400);
  if (String(body.website || '').trim()) return json({message: 'Check your inbox to confirm your request.'}, 202);
  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email) || email.length > 254 || body.consent !== true) {
    return json({error: 'Enter a valid email and confirm the alert opt-in.'}, 400);
  }
  if (!env.RESEND_API_KEY || !env.RESEND_API_KEY.startsWith('re_')) {
    return json({error: 'Email alerts are temporarily unavailable. Please try again later.'}, 503);
  }
  try {
    await ensureSchema(env);
    const current = await env.STORE_DB.prepare("SELECT subscriber_id, confirmed_at, unsubscribed_at FROM race_card_alert_subscribers WHERE email=?").bind(email).first();
    if (current && current.confirmed_at && !current.unsubscribed_at) {
      return json({message: 'That address is already confirmed for Race Card alerts.'}, 200);
    }
    const ip = String(request.headers.get('cf-connecting-ip') || '');
    if (ip) {
      const ipHash = await tokenHash(ip + '|' + env.RESEND_API_KEY);
      await env.STORE_DB.prepare("INSERT INTO race_card_alert_ip_limits (ip_hash,window_started_at,requests) VALUES (?,CURRENT_TIMESTAMP,1) ON CONFLICT(ip_hash) DO UPDATE SET requests=CASE WHEN window_started_at>datetime('now','-1 hour') THEN requests+1 ELSE 1 END,window_started_at=CASE WHEN window_started_at>datetime('now','-1 hour') THEN window_started_at ELSE CURRENT_TIMESTAMP END").bind(ipHash).run();
      const limit = await env.STORE_DB.prepare("SELECT requests FROM race_card_alert_ip_limits WHERE ip_hash=?").bind(ipHash).first();
      await env.STORE_DB.prepare("DELETE FROM race_card_alert_ip_limits WHERE window_started_at<datetime('now','-1 day')").run();
      if (Number(limit && limit.requests) > 5) return json({error: 'Please wait before requesting another confirmation email.'}, 429);
    }
    const subscriberId = current ? current.subscriber_id : uuid();
    const token = randomToken();
    const hash = await tokenHash(token);
    const saved = await env.STORE_DB.prepare("INSERT INTO race_card_alert_subscribers (subscriber_id,email,consented_at,confirmation_token_hash,confirmation_expires_at,confirmation_sent_at,confirmed_at,unsubscribed_at) VALUES (?,?,CURRENT_TIMESTAMP,?,datetime('now','+1 day'),CURRENT_TIMESTAMP,NULL,NULL) ON CONFLICT(email) DO UPDATE SET consented_at=CURRENT_TIMESTAMP,confirmation_token_hash=excluded.confirmation_token_hash,confirmation_expires_at=excluded.confirmation_expires_at,confirmation_sent_at=CURRENT_TIMESTAMP,confirmed_at=NULL,unsubscribed_at=NULL WHERE race_card_alert_subscribers.confirmation_sent_at IS NULL OR race_card_alert_subscribers.confirmation_sent_at<datetime('now','-15 minutes')").bind(subscriberId, email, hash).run();
    if (!saved.meta || !saved.meta.changes) return json({message: 'If that address can receive alerts, check your inbox for a confirmation link.'}, 202);
    await resend(env, Object.assign({to: email}, confirmationMessage(token)), 'rr-alert-confirm-' + subscriberId + '-' + hash.slice(0, 12));
    return json({message: 'Check your inbox for a confirmation link to activate Race Card alerts.'}, 202);
  } catch (error) {
    console.warn('Race Card alert signup failed', String(error).slice(0, 120));
    return json({error: 'We could not send the confirmation email. Please try again.'}, 503);
  }
}
function redirectWithAlert(kind) {
  return Response.redirect(SITE + '/race-cards/?alerts=' + encodeURIComponent(kind), 303);
}
async function confirm(request, env, url) {
  if (request.method !== 'GET') return json({error: 'Method not allowed'}, 405);
  const token = String(url.searchParams.get('token') || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return redirectWithAlert('invalid');
  try {
    await ensureSchema(env);
    const hash = await tokenHash(token);
    const subscriber = await env.STORE_DB.prepare("SELECT subscriber_id FROM race_card_alert_subscribers WHERE confirmation_token_hash=? AND confirmation_expires_at>CURRENT_TIMESTAMP").bind(hash).first();
    if (!subscriber) return redirectWithAlert('invalid');
    await env.STORE_DB.prepare("UPDATE race_card_alert_subscribers SET confirmed_at=CURRENT_TIMESTAMP,confirmation_token_hash=NULL,confirmation_expires_at=NULL,unsubscribed_at=NULL WHERE subscriber_id=? AND confirmation_token_hash=?").bind(subscriber.subscriber_id, hash).run();
    return redirectWithAlert('confirmed');
  } catch (error) {
    console.warn('Race Card alert confirmation failed', String(error).slice(0, 100));
    return redirectWithAlert('unavailable');
  }
}
function htmlResponse(html, status) {
  return new Response(html, {
    status: status || 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}
function unsubscribePage(subscriberId, complete) {
  const copy = complete
    ? '<h1>Race Card alerts stopped</h1><p>This email address will no longer receive new-card alerts.</p>'
    : '<h1>Stop Race Card alerts?</h1><p>Confirm below to stop future Rail &amp; Rye Race Card emails.</p><form method="post" action="/api/race-card-alerts/unsubscribe?id=' + encodeURIComponent(subscriberId) + '"><button type="submit">UNSUBSCRIBE</button></form>';
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Race Card email preferences | Rail &amp; Rye</title><body style="margin:0;background:#f7f3e9;color:#102b3c;font:16px/1.6 Arial,sans-serif;padding:10vh 20px"><main style="max-width:620px;margin:auto;background:#fffaf0;border:1px solid #c7a260;padding:32px"><p style="font:26px Georgia,serif;letter-spacing:4px">RAIL &amp; RYE</p>' + copy + '<p><a href="' + SITE + '/race-cards/">Return to Race Cards</a></p></main></body></html>';
}
async function unsubscribe(request, env, url) {
  const subscriberId = String(url.searchParams.get('id') || '');
  if (!/^[0-9a-f-]{36}$/i.test(subscriberId)) return htmlResponse(unsubscribePage('', true), 200);
  if (request.method === 'GET') return htmlResponse(unsubscribePage(subscriberId, false), 200);
  if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);
  try {
    await ensureSchema(env);
    await env.STORE_DB.batch([
      env.STORE_DB.prepare("UPDATE race_card_alert_subscribers SET unsubscribed_at=COALESCE(unsubscribed_at,CURRENT_TIMESTAMP) WHERE subscriber_id=?").bind(subscriberId),
      env.STORE_DB.prepare("UPDATE race_card_alert_jobs SET state='cancelled',last_error=NULL WHERE subscriber_id=? AND state IN ('queued','sending')").bind(subscriberId)
    ]);
  } catch (error) {
    console.warn('Race Card alert unsubscribe failed', String(error).slice(0, 100));
    return htmlResponse(unsubscribePage(subscriberId, false), 503);
  }
  return htmlResponse(unsubscribePage('', true), 200);
}
export async function handleRaceCardAlerts(request, env, url) {
  if (!env.STORE_DB) return json({error: 'Database unavailable'}, 503);
  const path = url.pathname;
  if (path === '/api/race-card-alerts/subscribe') return subscribe(request, env);
  if (path === '/api/race-card-alerts/confirm') return confirm(request, env, url);
  if (path === '/api/race-card-alerts/unsubscribe') return unsubscribe(request, env, url);
  return json({error: 'Not found'}, 404);
}
async function queueDueAnnouncements(env) {
  const pending = await env.STORE_DB.prepare("SELECT a.product_id FROM race_card_announcements a JOIN products p ON p.id=a.product_id WHERE a.queued_at IS NULL AND a.available_at<=CURRENT_TIMESTAMP AND p.status='published' AND p.category='Race Cards' ORDER BY a.created_at ASC LIMIT 25").all();
  for (const item of pending.results || []) {
    await env.STORE_DB.batch([
      env.STORE_DB.prepare("INSERT OR IGNORE INTO race_card_alert_jobs (product_id,subscriber_id) SELECT ?,subscriber_id FROM race_card_alert_subscribers WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL").bind(item.product_id),
      env.STORE_DB.prepare("UPDATE race_card_announcements SET queued_at=CURRENT_TIMESTAMP WHERE product_id=? AND queued_at IS NULL").bind(item.product_id)
    ]);
  }
}
export async function syncRaceCardAnnouncement(env, productId, releaseAt, createIfMissing) {
  await ensureSchema(env);
  if (createIfMissing) {
    await env.STORE_DB.prepare("INSERT INTO race_card_announcements (product_id,available_at) VALUES (?,COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(product_id) DO UPDATE SET available_at=excluded.available_at WHERE race_card_announcements.queued_at IS NULL").bind(productId, releaseAt || null).run();
  } else {
    await env.STORE_DB.prepare("UPDATE race_card_announcements SET available_at=COALESCE(?,CURRENT_TIMESTAMP) WHERE product_id=? AND queued_at IS NULL").bind(releaseAt || null, productId).run();
  }
  await sendRaceCardAlerts(env, 20);
}
async function sendAlert(env, job) {
  const editionUrl = SITE + '/store/?edition=' + encodeURIComponent(job.product_id);
  const unsubscribeUrl = SITE + '/api/race-card-alerts/unsubscribe?id=' + encodeURIComponent(job.subscriber_id);
  const title = String(job.title || 'New Rail & Rye Race Card');
  const date = job.race_date ? ' · ' + job.race_date : '';
  const track = job.track ? ' · ' + job.track : '';
  const description = String(job.description || '').slice(0, 1200);
  const subject = 'New Rail & Rye Race Card: ' + title;
  const text = 'A new Rail & Rye Race Card is available.\n\n' + title + date + track + (description ? '\n\n' + description : '') + '\n\nView the publication: ' + editionUrl + '\n\nTo stop these alerts, visit: ' + unsubscribeUrl + '\n';
  const html = '<!doctype html><html><body style="background:#f7f3e9;color:#102b3c;font-family:Arial,sans-serif;padding:28px"><main style="max-width:600px;margin:auto;background:#fffaf0;border:1px solid #c7a260;padding:30px"><p style="font:26px Georgia,serif;letter-spacing:4px">RAIL &amp; RYE</p><p style="font-size:11px;color:#9b713b;letter-spacing:2px">NEW RACE CARD</p><h1 style="font:30px Georgia,serif">' + escapeHtml(title) + '</h1><p>' + escapeHtml(date ? date.slice(3) : '') + (track ? ' · ' + escapeHtml(job.track) : '') + '</p>' + (description ? '<p>' + escapeHtml(description) + '</p>' : '') + '<p><a style="display:inline-block;padding:15px 20px;background:#0b2b3d;color:#fff1d4;text-decoration:none" href="' + escapeHtml(editionUrl) + '">VIEW RACE CARD</a></p><p style="font-size:12px;color:#596a6c">You received this because you confirmed Rail &amp; Rye Race Card email alerts. <a href="' + escapeHtml(unsubscribeUrl) + '">Unsubscribe</a>.</p></main></body></html>';
  return resend(env, {
    to: job.email,
    subject: subject,
    text: text,
    html: html,
    headers: {
      'List-Unsubscribe': '<' + unsubscribeUrl + '>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  }, 'rr-race-card-alert-' + job.product_id + '-' + job.subscriber_id);
}
export async function sendRaceCardAlerts(env, limit) {
  if (!env || !env.STORE_DB || !env.RESEND_API_KEY || !env.RESEND_API_KEY.startsWith('re_')) return 0;
  await ensureSchema(env);
  await queueDueAnnouncements(env);
  const max = Math.max(1, Math.min(Number(limit) || 16, 30));
  const pending = await env.STORE_DB.prepare("SELECT j.product_id,j.subscriber_id,j.attempts,s.email,p.title,p.description,p.race_date,p.track FROM race_card_alert_jobs j JOIN race_card_alert_subscribers s ON s.subscriber_id=j.subscriber_id JOIN products p ON p.id=j.product_id WHERE j.attempts<12 AND s.confirmed_at IS NOT NULL AND s.unsubscribed_at IS NULL AND p.status='published' AND p.category='Race Cards' AND ((j.state='queued' AND j.next_attempt_at<=CURRENT_TIMESTAMP) OR (j.state='sending' AND j.claimed_at<datetime('now','-3 minutes'))) ORDER BY j.created_at ASC LIMIT ?").bind(max).all();
  let sent = 0;
  for (const job of pending.results || []) {
    const claim = await env.STORE_DB.prepare("UPDATE race_card_alert_jobs SET state='sending',claimed_at=CURRENT_TIMESTAMP,attempts=attempts+1 WHERE product_id=? AND subscriber_id=? AND attempts<12 AND ((state='queued' AND next_attempt_at<=CURRENT_TIMESTAMP) OR (state='sending' AND claimed_at<datetime('now','-3 minutes')))").bind(job.product_id, job.subscriber_id).run();
    if (!claim.meta || !claim.meta.changes) continue;
    try {
      const providerId = await sendAlert(env, job);
      await env.STORE_DB.prepare("UPDATE race_card_alert_jobs SET state='sent',provider_id=?,sent_at=CURRENT_TIMESTAMP,last_error=NULL WHERE product_id=? AND subscriber_id=? AND state='sending'").bind(providerId, job.product_id, job.subscriber_id).run();
      sent++;
    } catch (error) {
      const tries = Number(job.attempts || 0) + 1;
      const minutes = Math.min(720, 5 * Math.pow(2, Math.min(8, tries - 1)));
      const state = tries >= 12 ? 'failed' : 'queued';
      await env.STORE_DB.prepare("UPDATE race_card_alert_jobs SET state=?,last_error='Delivery temporarily unavailable',next_attempt_at=datetime('now',?||' minutes') WHERE product_id=? AND subscriber_id=? AND state='sending'").bind(state, '+' + minutes, job.product_id, job.subscriber_id).run();
      console.warn('Race Card alert retry queued', job.product_id, String(error).slice(0, 80));
    }
  }
  return sent;
}

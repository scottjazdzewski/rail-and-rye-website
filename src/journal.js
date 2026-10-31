const MAX_ARTICLE_COVER = 6 * 1024 * 1024;
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:JSON_HEADERS});
const fail = (message, status=400) => json({error:message}, status);
let schemaPromise = null;

async function ensureJournalSchema(env) {
  if (!env.STORE_DB) throw Error("Journal database binding missing");
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await env.STORE_DB.prepare("CREATE TABLE IF NOT EXISTS journal_articles (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, category TEXT NOT NULL, publish_date TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', body_text TEXT NOT NULL DEFAULT '', cover_key TEXT, cover_type TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
      await env.STORE_DB.prepare("CREATE INDEX IF NOT EXISTS journal_articles_public_order ON journal_articles(status, publish_date DESC, created_at DESC)").run();
      await env.STORE_DB.prepare("CREATE INDEX IF NOT EXISTS journal_articles_admin_order ON journal_articles(updated_at DESC)").run();
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}
function trustedOrigin(request) {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site";
}
function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0,10) === value;
}
function slugFor(title, id) {
  const base = title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0,70) || "story";
  return base + "-" + id.slice(0,8);
}
async function parseArticleJSON(request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw Error("Expected JSON");
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 140000) throw Error("Article is too long to save");
  const text = await request.text();
  if (text.length > 120000) throw Error("Article is too long to save");
  return JSON.parse(text);
}
function readArticle(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("Invalid article details");
  const title = String(data.title || "").trim();
  const category = String(data.category || "").trim();
  const publish_date = String(data.publish_date || "");
  const excerpt = String(data.excerpt || "").trim();
  const body_text = String(data.body_text || "").trim();
  const status = String(data.status || "draft");
  if (title.length < 3 || title.length > 140) throw Error("Title must be 3–140 characters");
  if (category.length < 2 || category.length > 60) throw Error("Add a category of 2–60 characters");
  if (!validDate(publish_date)) throw Error("Choose a valid publication date");
  if (excerpt.length > 500) throw Error("Keep the summary to 500 characters or fewer");
  if (body_text.length > 80000) throw Error("Keep article text under 80,000 characters");
  if (!["draft","published","archived"].includes(status)) throw Error("Invalid article status");
  if (status === "published" && excerpt.length < 20) throw Error("Add a short summary before publishing");
  if (status === "published" && body_text.length < 80) throw Error("Add the article text before publishing");
  return {title, category, publish_date, excerpt, body_text, status};
}
function articleShape(row, options={}) {
  if (!row) return null;
  const result = {
    slug: row.slug,
    title: row.title,
    category: row.category,
    publish_date: row.publish_date,
    excerpt: row.excerpt,
    cover_url: row.cover_key ? "/media/journal/" + row.id : null
  };
  if (options.admin) {
    result.id = row.id;
    result.status = row.status;
    result.updated_at = row.updated_at;
    result.created_at = row.created_at;
  }
  if (options.full) result.body_text = row.body_text;
  return result;
}

export async function handlePublicJournal(request, env, pathname) {
  if (request.method !== "GET") return fail("Method not allowed", 405);
  if (!env.STORE_DB) return fail("Journal is not available", 503);
  try { await ensureJournalSchema(env); }
  catch (error) { console.error("Journal schema setup failed", error); return fail("Journal is temporarily unavailable", 503); }
  if (pathname === "/api/journal/articles") {
    const result = await env.STORE_DB.prepare("SELECT id,slug,title,category,publish_date,excerpt,cover_key,status,created_at,updated_at FROM journal_articles WHERE status='published' ORDER BY publish_date DESC, created_at DESC LIMIT 250").all();
    return json({articles:(result.results || []).map(row => articleShape(row))});
  }
  const match = pathname.match(/^\/api\/journal\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (!match) return fail("Article not found", 404);
  const row = await env.STORE_DB.prepare("SELECT id,slug,title,category,publish_date,excerpt,body_text,cover_key,status,created_at,updated_at FROM journal_articles WHERE slug=? AND status='published'").bind(match[1]).first();
  if (!row) return fail("Article not found", 404);
  return json({article:articleShape(row, {full:true})});
}

export async function handleAdminJournal(request, env, pathname) {
  if (!env.STORE_DB) return fail("Journal database binding missing", 503);
  if (!["GET","POST","PATCH","PUT"].includes(request.method)) return fail("Method not allowed", 405);
  if (request.method !== "GET" && !trustedOrigin(request)) return fail("Same-origin request required", 403);
  try { await ensureJournalSchema(env); }
  catch (error) { console.error("Journal schema setup failed", error); return fail("Journal storage is temporarily unavailable", 503); }

  if (pathname === "/api/admin/articles") {
    if (request.method === "GET") {
      const result = await env.STORE_DB.prepare("SELECT id,slug,title,category,publish_date,excerpt,cover_key,status,created_at,updated_at FROM journal_articles ORDER BY updated_at DESC, id DESC LIMIT 250").all();
      return json({articles:(result.results || []).map(row => articleShape(row, {admin:true}))});
    }
    if (request.method !== "POST") return fail("Method not allowed", 405);
    let data;
    try { data = readArticle(await parseArticleJSON(request)); }
    catch (error) { return fail(error.message, 422); }
    const id = crypto.randomUUID();
    const slug = slugFor(data.title, id);
    const now = new Date().toISOString();
    await env.STORE_DB.prepare("INSERT INTO journal_articles (id,slug,title,category,publish_date,excerpt,body_text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id,slug,data.title,data.category,data.publish_date,data.excerpt,data.body_text,data.status,now,now).run();
    const row = await env.STORE_DB.prepare("SELECT * FROM journal_articles WHERE id=?").bind(id).first();
    return json({article:articleShape(row,{admin:true,full:true})}, 201);
  }

  const match = pathname.match(/^\/api\/admin\/articles\/([0-9a-f-]{36})(?:\/(cover))?$/i);
  if (!match) return fail("Not found", 404);
  const id = match[1];
  const action = match[2] || "";
  const current = await env.STORE_DB.prepare("SELECT * FROM journal_articles WHERE id=?").bind(id).first();
  if (!current) return fail("Article not found", 404);

  if (!action && request.method === "GET") return json({article:articleShape(current,{admin:true,full:true})});
  if (!action && request.method === "PATCH") {
    let data;
    try { data = readArticle(await parseArticleJSON(request)); }
    catch (error) { return fail(error.message, 422); }
    const now = new Date().toISOString();
    await env.STORE_DB.prepare("UPDATE journal_articles SET title=?,category=?,publish_date=?,excerpt=?,body_text=?,status=?,updated_at=? WHERE id=?")
      .bind(data.title,data.category,data.publish_date,data.excerpt,data.body_text,data.status,now,id).run();
    const row = await env.STORE_DB.prepare("SELECT * FROM journal_articles WHERE id=?").bind(id).first();
    return json({article:articleShape(row,{admin:true,full:true})});
  }
  if (action === "cover" && request.method === "PUT") {
    if (!env.CARDS_BUCKET) return fail("Image storage is not available", 503);
    const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!["image/jpeg","image/png","image/webp"].includes(type)) return fail("Use a JPG, PNG, or WebP cover image");
    const size = Number(request.headers.get("content-length") || request.headers.get("x-file-size"));
    if (!Number.isSafeInteger(size) || size < 8 || size > MAX_ARTICLE_COVER) return fail("Cover image must be smaller than 6 MB", 413);
    const body = await request.arrayBuffer();
    if (body.byteLength !== size) return fail("Invalid image size");
    const bytes = new Uint8Array(body);
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13;
    const webp = String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
    if (!(type === "image/jpeg" && jpg || type === "image/png" && png || type === "image/webp" && webp)) return fail("Image format does not match file contents");
    const extension = type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
    const key = "journal-covers/" + id + "/" + crypto.randomUUID() + "." + extension;
    try {
      await env.CARDS_BUCKET.put(key,body,{httpMetadata:{contentType:type}});
      await env.STORE_DB.prepare("UPDATE journal_articles SET cover_key=?,cover_type=?,updated_at=? WHERE id=?")
        .bind(key,type,new Date().toISOString(),id).run();
    } catch (error) {
      await env.CARDS_BUCKET.delete(key).catch(() => {});
      console.error("Journal cover upload failed",error);
      return fail("Cover image could not be saved. Please try again.",500);
    }
    if (current.cover_key && current.cover_key !== key) await env.CARDS_BUCKET.delete(current.cover_key).catch(() => {});
    const row = await env.STORE_DB.prepare("SELECT * FROM journal_articles WHERE id=?").bind(id).first();
    return json({article:articleShape(row,{admin:true,full:true})});
  }
  return fail("Not found",404);
}

export async function publicJournalCover(env, id) {
  if (!env.STORE_DB || !env.CARDS_BUCKET) return fail("Image not found",404);
  await ensureJournalSchema(env);
  const row = await env.STORE_DB.prepare("SELECT cover_key,cover_type FROM journal_articles WHERE id=? AND status='published'").bind(id).first();
  if (!row?.cover_key) return fail("Image not found",404);
  const object = await env.CARDS_BUCKET.get(row.cover_key);
  if (!object) return fail("Image not found",404);
  return new Response(object.body,{headers:{
    "Content-Type":row.cover_type || object.httpMetadata?.contentType || "application/octet-stream",
    "Cache-Control":"public, max-age=300",
    "X-Content-Type-Options":"nosniff"
  }});
}

import { handleCommerce, sendQueuedEmails } from './commerce.js';
/* Rail & Rye admin MVP. Dependencies: Cloudflare Workers, R2, D1, Cloudflare Access.
   Admin routes FAIL CLOSED until ACCESS_TEAM_DOMAIN, ACCESS_AUD and ADMIN_EMAIL
   are configured in Cloudflare Worker runtime variables, and a matching Access
   self-hosted application protects /admin* and /api/admin*.
   Do not publish credentials or allow public R2 access. */

const MAX_PDF = 75 * 1024 * 1024;
const MAX_COVER = 6 * 1024 * 1024;
const CATEGORIES = new Set(["Race Cards", "Longshot Radar", "Stable Notes", "Target List"]);
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const textHeaders = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:jsonHeaders});
const fail = (message,status=400) => json({error:message},status);

const enc = new TextEncoder();
let cachedKeys = {url:"", keys:[], expires:0};
function base64url(str) {
  const s = str.replace(/-/g,"+").replace(/_/g,"/");
  const raw = atob(s.padEnd(Math.ceil(s.length / 4)*4,"="));
  return Uint8Array.from(raw, c=>c.charCodeAt(0));
}
function decodePart(s) { return JSON.parse(new TextDecoder().decode(base64url(s))); }
function accessConfig(env) {
  const aud=String(env.ACCESS_AUD||"").trim();
  const email=String(env.ADMIN_EMAIL||"").trim().toLowerCase();
  const raw=String(env.ACCESS_TEAM_DOMAIN||"").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!aud || !email || !/^[a-z0-9.-]+\.cloudflareaccess\.com$/.test(raw)) return null;
  return {aud,email,issuer:`https://${raw}`,jwks:`https://${raw}/cdn-cgi/access/certs`};
}
async function verifyAdmin(request,env) {
  const config=accessConfig(env);
  if (!config) return {ok:false,response:fail("Admin authentication not configured. See setup guide.",503)};
  // Header is inserted by Cloudflare Access after authentication, but is NOT
  // trusted without verifying its signature, issuer, audience and expiry.
  const token=request.headers.get("cf-access-jwt-assertion");
  if (!token) return {ok:false,response:fail("Access sign-in required",401)};
  const parts=token.split(".");
  if(parts.length!==3) return {ok:false,response:fail("Invalid access token",403)};
  try {
    const header=decodePart(parts[0]);
    const claims=decodePart(parts[1]);
    if(header.alg!=="RS256"||typeof header.kid!=="string") throw Error("Invalid token algorithm");
    const now=Math.floor(Date.now()/1000);
    const audOk=Array.isArray(claims.aud)?claims.aud.includes(config.aud):claims.aud===config.aud;
    if(claims.iss!==config.issuer||!audOk||!Number.isFinite(claims.exp)||claims.exp<=now||
       (claims.nbf!==undefined&&claims.nbf>now+60)||String(claims.email||"").toLowerCase()!==config.email) throw Error("Unauthorized claims");
    if(cachedKeys.url!==config.jwks||cachedKeys.expires<Date.now()) {
      const response=await fetch(config.jwks,{headers:{Accept:"application/json"}});
      if(!response.ok) throw Error("Access keys unavailable");
      const body=await response.json();
      if(!Array.isArray(body.keys)) throw Error("Invalid Access keys");
      cachedKeys={url:config.jwks,keys:body.keys,expires:Date.now()+5*60*1000};
    }
    let jwk=cachedKeys.keys.find(k=>k.kid===header.kid&&k.kty==="RSA");
    if(!jwk) { // Key rotation: refresh immediately once.
      const res=await fetch(config.jwks); if(!res.ok) throw Error("Access key fetch failed");
      const b=await res.json(); cachedKeys={url:config.jwks,keys:b.keys||[],expires:Date.now()+5*60*1000};
      jwk=cachedKeys.keys.find(k=>k.kid===header.kid&&k.kty==="RSA");
    }
    if(!jwk) throw Error("Unknown signing key");
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,base64url(parts[2]),enc.encode(parts[0]+"."+parts[1]));
    if(!valid) throw Error("Invalid signature");
    return {ok:true,email:config.email};
  } catch(e) {
    console.warn("Rail & Rye: rejected admin token",String(e));
    return {ok:false,response:fail("Administrator access denied",403)};
  }
}
function validDate(x) { return !x || (typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(`${x}T00:00:00Z`))&&new Date(`${x}T00:00:00Z`).toISOString().slice(0,10)===x); }
function readProduct(data) {
  if(!data||typeof data!=="object"||Array.isArray(data)) throw Error("Invalid product payload");
  const title=String(data.title||"").trim();
  const category=String(data.category||"");
  const race_date=data.race_date?String(data.race_date):null;
  const track=String(data.track||"").trim();
  const description=String(data.description||"").trim();
  const price_cents=Number(data.price_cents);
  const status=String(data.status||"draft");
  if(title.length<3||title.length>140) throw Error("Title must be 3–140 characters");
  if(!CATEGORIES.has(category)) throw Error("Invalid category");
  if(!validDate(race_date)) throw Error("Invalid date");
  if(track.length>100||description.length>4000) throw Error("Track or description too long");
  if(!Number.isSafeInteger(price_cents)||price_cents<0||price_cents>500000) throw Error("Invalid price");
  if(!["draft","published","archived"].includes(status)) throw Error("Invalid status");
  return {title,category,race_date,track,description,price_cents,status};
}
async function parseJSON(request) {
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw Error("Expected JSON");
  const size=Number(request.headers.get("content-length")||0);
  if(size>16000) throw Error("Request too large");
  const body=await request.text(); if(body.length>16000) throw Error("Request too large");
  return JSON.parse(body);
}
function trustedOrigin(request) {
  const origin=request.headers.get("origin");
  return !!origin&&origin===new URL(request.url).origin&&request.headers.get("sec-fetch-site")!=="cross-site";
}
function slugFor(title,id) {return (title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"product")+"-"+id.slice(0,8);}
async function fetchProduct(env,id) {return env.STORE_DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();}
async function handleAdminAPI(request,env,pathname) {
  if(!env.STORE_DB||!env.CARDS_BUCKET) return fail("Database or storage binding missing",503);
  if(!["GET","POST","PATCH","PUT"].includes(request.method)) return fail("Method not allowed",405);
  if(request.method!=="GET"&&!trustedOrigin(request)) return fail("Same-origin request required",403);
  if(pathname==="/api/admin/status"&&request.method==="GET") return json({ready:true,categories:[...CATEGORIES],max_pdf_bytes:MAX_PDF});
  if(pathname==="/api/admin/products") {
    if(request.method==="GET") {
      const result=await env.STORE_DB.prepare("SELECT * FROM products ORDER BY created_at DESC, id DESC LIMIT 250").all();
      return json({products:result.results||[]});
    }
    if(request.method==="POST") {
      let data; try{data=readProduct(await parseJSON(request));}catch(e){return fail(e.message);}
      if(data.status==="published") return fail("Upload a PDF before publishing");
      const id=crypto.randomUUID(),slug=slugFor(data.title,id);
      await env.STORE_DB.prepare(`INSERT INTO products (id,title,slug,category,race_date,track,description,price_cents,pdf_key,image_url,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id,data.title,slug,data.category,data.race_date,data.track,data.description,data.price_cents,null,null,data.status).run();
      return json({product:await fetchProduct(env,id)},201);
    }
  }
  const match=pathname.match(/^\/api\/admin\/products\/([0-9a-f-]{36})(?:\/(pdf|cover))?$/i);
  if(!match) return fail("Not found",404);
  const id=match[1], action=match[2];
  const item=await fetchProduct(env,id);if(!item)return fail("Product not found",404);
  if(!action&&request.method==="PATCH") {
    let data;try{data=readProduct(await parseJSON(request));}catch(e){return fail(e.message);}
    if(data.status==="published"&&!item.pdf_key) return fail("Upload a PDF before publishing");
    await env.STORE_DB.prepare(`UPDATE products SET title=?,category=?,race_date=?,track=?,description=?,price_cents=?,status=? WHERE id=?`)
      .bind(data.title,data.category,data.race_date,data.track,data.description,data.price_cents,data.status,id).run();
    return json({product:await fetchProduct(env,id)});
  }
  if(action==="pdf"&&request.method==="PUT") {
    const type=request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const size=Number(request.headers.get("content-length")||request.headers.get("x-file-size"));
    if(type!=="application/pdf"||!Number.isSafeInteger(size)||size<5||size>MAX_PDF) return fail("Upload a PDF smaller than 75 MB",413);
    if(!request.body) return fail("Empty upload");
    // Validate the first PDF bytes while preserving a streaming R2 upload.
    const reader=request.body.getReader();
    let head=[],got=0;while(got<5){const chunk=await reader.read();if(chunk.done)break;head.push(chunk.value);got+=chunk.value.byteLength;if(got>MAX_PDF)break;}
    const prefix=new Uint8Array(Math.min(got,5));let p=0;
    for(const ch of head){const n=Math.min(ch.byteLength,5-p);prefix.set(ch.slice(0,n),p);p+=n;if(p===5)break;}
    if(new TextDecoder().decode(prefix)!=="%PDF-"){await reader.cancel();return fail("File does not appear to be a PDF");}
    const {writable,readable}=new FixedLengthStream(size);
    const key=`cards/${id}/${crypto.randomUUID()}.pdf`;
    const pump=(async()=>{
      const writer=writable.getWriter();let count=0;
      try{
        for(const chunk of head){count+=chunk.byteLength;if(count>size)throw Error("Upload length mismatch");await writer.write(chunk);}
        for(;;){const r=await reader.read();if(r.done)break;count+=r.value.byteLength;if(count>size)throw Error("Upload length mismatch");await writer.write(r.value);}
        if(count!==size)throw Error("Upload length mismatch");
        await writer.close();
      }catch(e){await writer.abort(e);throw e;}
    })();
    try{
      await Promise.all([pump,env.CARDS_BUCKET.put(key,readable,{httpMetadata:{contentType:"application/pdf"}})]);
      await env.STORE_DB.prepare("UPDATE products SET pdf_key=? WHERE id=?").bind(key,id).run();
      // Preserve older PDF versions: existing paid orders may still reference them.
      // Cleanup requires checking unexpired D1 entitlements first.
    }catch(e){await env.CARDS_BUCKET.delete(key).catch(()=>{});console.error("PDF upload failed",e);return fail("PDF upload failed; check size and retry",500);}
    return json({product:await fetchProduct(env,id)});
  }
  if(action==="cover"&&request.method==="PUT") {
    const type=request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if(!["image/jpeg","image/png","image/webp"].includes(type))return fail("Use JPG, PNG or WebP images");
    const size=Number(request.headers.get("content-length")||request.headers.get("x-file-size"));
    if(!Number.isSafeInteger(size)||size<8||size>MAX_COVER)return fail("Image must be smaller than 6 MB",413);
    const body=await request.arrayBuffer();if(body.byteLength!==size)return fail("Invalid image size");
    const bytes=new Uint8Array(body);
    const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13;
    const webp=String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
    if(!(type==="image/jpeg"&&jpg||type==="image/png"&&png||type==="image/webp"&&webp))return fail("Image format does not match file contents");
    const key=`covers/${id}`;
    await env.CARDS_BUCKET.put(key,body,{httpMetadata:{contentType:type}});
    await env.STORE_DB.prepare("UPDATE products SET image_url=? WHERE id=?").bind(`/media/cover/${id}`,id).run();
    return json({product:await fetchProduct(env,id)});
  }
  return fail("Not found",404);
}
async function publicCover(env,id) {
  if(!env.STORE_DB||!env.CARDS_BUCKET)return fail("Not available",503);
  const record=await env.STORE_DB.prepare("SELECT id,status,image_url FROM products WHERE id=? AND status='published'").bind(id).first();
  if(!record?.image_url)return fail("Not found",404);
  const object=await env.CARDS_BUCKET.get(`covers/${id}`);if(!object)return fail("Not found",404);
  return new Response(object.body,{headers:{"Content-Type":object.httpMetadata?.contentType||"application/octet-stream","Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"}});
}
export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url),path=url.pathname;
    try{
      if(path==="/api/health"&&request.method==="GET") return json({website:"Rail & Rye",status:"online",storage:env.CARDS_BUCKET?"connected":"not connected",database:env.STORE_DB?"bound":"not bound"});
      if(path.startsWith("/api/admin/")||path==="/admin"||path.startsWith("/admin/")) {
        const auth=await verifyAdmin(request,env); if(!auth.ok)return auth.response;
        if(path.startsWith("/api/admin/"))return handleAdminAPI(request,env,path);
        if(request.method!=="GET"&&request.method!=="HEAD")return fail("Method not allowed",405);
        const asset=new URL(url);asset.pathname="/admin/index.html";
        const result=await env.ASSETS.fetch(new Request(asset.toString(),{method:request.method}));
        const headers=new Headers(result.headers);
        headers.set("Cache-Control","no-store");headers.set("X-Frame-Options","DENY");headers.set("X-Content-Type-Options","nosniff");
        headers.set("Referrer-Policy","no-referrer");
        headers.set("Content-Security-Policy","default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
        return new Response(result.body,{status:result.status,headers});
      }
      const image=path.match(/^\/media\/cover\/([0-9a-f-]{36})$/i);
      if(image&&request.method==="GET")return publicCover(env,image[1]);
      if(path==="/api/products"||path==="/api/checkout"||path==="/api/stripe/webhook"||path.startsWith("/api/orders/")||path==="/api/delivery/download"||path==="/api/recovery/request")return handleCommerce(request,env,url,ctx);
      if(path.startsWith("/api/"))return fail("Not found",404);
      return env.ASSETS.fetch(request);
    }catch(e){console.error("Rail & Rye request error",e);return fail("An internal error occurred",500);}
  },
  async scheduled(controller,env,ctx){
    ctx.waitUntil(sendQueuedEmails(env,8));
  }
};

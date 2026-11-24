import {BUNDLE_KEY} from './bundles.js';
import {readCertifiedF4Exotics} from './f4-exotics.js';
import {listProducts,verifyStoreAccessCode} from './commerce.js';
import {hasActiveMembershipSession} from './memberships.js';
import {PRODUCT_TAB_CATEGORIES,readProductTabEdition} from './product-tab-content.js';

const COOKIE='__Host-rr_product_tab';
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKOUT_SESSION=/^cs_(?:test|live)_[A-Za-z0-9_]{10,200}$/;
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{...JSON_HEADERS,...headers}});
const error=(message,status=400)=>json({error:message},status);
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function cookieValue(request){
 const raw=request.headers.get('cookie')||'';
 for(const part of raw.split(';')){
  const i=part.indexOf('=');
  if(i<0||part.slice(0,i).trim()!==COOKIE)continue;
  try{return decodeURIComponent(part.slice(i+1).trim());}catch{return null;}
 }
 return null;
}
function secret(env){return env.RR_DELIVERY_SIGNING_KEY||env.STRIPE_WEBHOOK_SECRET||'';}
async function signature(env,orderId,expires){
 const keySecret=secret(env);if(keySecret.length<16)return null;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(keySecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('rr-product-tab-v1|'+orderId+'|'+expires));
 return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
function dateMillis(value){
 if(!value)return 0;
 const raw=String(value).replace(' ','T'),fixed=/Z$|[+-]\d\d:\d\d$/.test(raw)?raw:raw+'Z';
 const valueMs=Date.parse(fixed);return Number.isFinite(valueMs)?valueMs:0;
}
async function orderScopes(env,orderId){
 if(!env.STORE_DB||!UUID.test(orderId||''))return [];
 const order=await env.STORE_DB.prepare(`SELECT o.id,o.status,o.paid_at,o.access_days,o.pdf_expires_at,o.stripe_payment_intent,
     p.pdf_key AS catalog_pdf_key,p.category,p.race_date,p.track,p.title
   FROM orders o JOIN products p ON p.id=o.product_id
   WHERE o.id=? AND o.status='paid'
     AND datetime(o.paid_at, '+' || o.access_days || ' days')>CURRENT_TIMESTAMP
     AND NOT EXISTS(SELECT 1 FROM payment_revocations r WHERE r.payment_intent=o.stripe_payment_intent)`).bind(orderId).first();
 if(!order)return [];
 const paidAt=dateMillis(order.paid_at),days=Number(order.access_days);
 if(!paidAt||!Number.isFinite(days)||days<1)return [];
 const orderExpiry=paidAt+days*86400*1000,rows=[];
 if(order.catalog_pdf_key===BUNDLE_KEY){
  const result=await env.STORE_DB.prepare(`SELECT bi.product_id AS id,bi.product_title AS title,p.category,p.race_date,p.track,
      COALESCE(bi.pdf_expires_at,p.pdf_expires_at) AS item_expiry
    FROM bundle_order_items bi JOIN products p ON p.id=bi.product_id
    WHERE bi.order_id=? AND COALESCE(bi.pdf_expires_at,p.pdf_expires_at)>CURRENT_TIMESTAMP
    ORDER BY bi.position`).bind(orderId).all();
  rows.push(...(result.results||[]));
 }else rows.push({category:order.category,race_date:order.race_date,track:order.track,title:order.title,
   item_expiry:order.pdf_expires_at||null});
 return rows.map(row=>{
  const expires=Math.min(orderExpiry,dateMillis(row.item_expiry));
  return {category:row.category,race_date:row.race_date,track:row.track||'',title:row.title||'',expires_at:expires};
 }).filter(scope=>PRODUCT_TAB_CATEGORIES.includes(scope.category)&&/^\d{4}-\d{2}-\d{2}$/.test(String(scope.race_date||''))&&scope.expires_at>Date.now());
}
async function accessCookie(request,env){
 const raw=cookieValue(request),match=/^([0-9a-f-]{36})\.(\d{10})\.([a-f0-9]{64})$/i.exec(raw||'');
 if(!match)return {scopes:[],expires_at:0};
 const [,orderId,exp,supplied]=match,expires=Number(exp);
 if(!UUID.test(orderId)||expires<=Math.floor(Date.now()/1000))return {scopes:[],expires_at:0};
 const expected=await signature(env,orderId,exp);
 if(!expected||!equal(expected,supplied.toLowerCase()))return {scopes:[],expires_at:0};
 const scopes=await orderScopes(env,orderId);
 return {scopes,expires_at:Math.max(0,...scopes.map(scope=>scope.expires_at))};
}
async function productCatalog(env){
 const result=await listProducts(env);
 if(!result.ok)throw Error('Product catalog unavailable');
 const body=await result.json();
 if(!Array.isArray(body.products))throw Error('Product catalog unavailable');
 const products=[];
 for(const sku of body.products){
  if(sku.kind==='bundle'&&Array.isArray(sku.included_products))products.push(...sku.included_products.map(item=>({...item,price_cents:sku.price_cents,kind:'bundle-item'})));
  else products.push(sku);
 }
 return {products,checkout_ready:body.checkout_ready,checkout_mode:body.checkout_mode};
}
function hasPurchaseScope(scopes,category,raceDate){
 return scopes.some(scope=>scope.category===category&&scope.race_date===raceDate&&scope.expires_at>Date.now());
}
async function currentAccess(request,env){
 const [purchase,member]=await Promise.all([accessCookie(request,env),hasActiveMembershipSession(request,env)]);
 return {scopes:purchase.scopes,access_expires_at:purchase.expires_at,universal:member};
}
function publicDay(product,access){
 return {category:product.category,race_date:product.race_date,track:product.track||'',title:product.title||'',
  published:true,unlocked:access.universal||hasPurchaseScope(access.scopes,product.category,product.race_date)||Number(product.price_cents)===0};
}
async function activate(request,env){
 if(request.method!=='POST')return error('Method not allowed',405);
 const origin=request.headers.get('origin');
 if(origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return error('Same-origin request required',403);
 if(Number(request.headers.get('content-length')||0)>2000)return error('Request too large',413);
 let body;try{body=await request.json();}catch{return error('Invalid request',400);}
 let orderId=null;
 if(typeof body?.code==='string')orderId=await verifyStoreAccessCode(body.code,env);
 else if(typeof body?.session_id==='string'&&CHECKOUT_SESSION.test(body.session_id)){
  const row=await env.STORE_DB.prepare(`SELECT id FROM orders WHERE stripe_session_id=? AND status='paid'
    AND datetime(paid_at, '+' || access_days || ' days')>CURRENT_TIMESTAMP`).bind(body.session_id).first();
  orderId=row?.id||null;
 }
 if(!orderId)return error('Purchase not confirmed or access link expired. Check the purchase email or request a replacement link.',403);
 const scopes=await orderScopes(env,orderId);
 if(!scopes.length)return error('This purchase has no currently available racing tabs.',410);
 const expires=Math.floor(Math.max(...scopes.map(scope=>scope.expires_at))/1000);
 const exp=String(expires),sig=await signature(env,orderId,exp);
 if(!sig)return error('Tab access is temporarily unavailable.',503);
 const token=orderId+'.'+exp+'.'+sig;
 const maxAge=Math.max(0,expires-Math.floor(Date.now()/1000));
 return json({ok:true,next:'/my-products/'},200,{'Set-Cookie':COOKIE+'='+encodeURIComponent(token)+'; Path=/; Max-Age='+maxAge+'; Secure; HttpOnly; SameSite=Lax'});
}
async function library(request,env){
 const [catalog,access]=await Promise.all([productCatalog(env),currentAccess(request,env)]);
 const days=[],seen=new Set();
 for(const product of catalog.products){
  if(!PRODUCT_TAB_CATEGORIES.includes(product.category)||!product.race_date)continue;
  const day=publicDay(product,access),key=day.category+'|'+day.race_date+'|'+day.track+'|'+day.title;
  if(seen.has(key))continue;seen.add(key);days.push(day);
 }
 days.sort((a,b)=>b.race_date.localeCompare(a.race_date)||PRODUCT_TAB_CATEGORIES.indexOf(a.category)-PRODUCT_TAB_CATEGORIES.indexOf(b.category)||a.track.localeCompare(b.track));
 const available=PRODUCT_TAB_CATEGORIES.map(category=>({
  category,days:[...new Set(days.filter(day=>day.category===category).map(day=>day.race_date))].sort((a,b)=>b.localeCompare(a))
 }));
 return json({catalog:available,days,universal_access:access.universal,access_expires_at:access.access_expires_at||null});
}
async function edition(request,env,url){
 const category=url.searchParams.get('category')||'',raceDate=url.searchParams.get('date')||'';
 if(!PRODUCT_TAB_CATEGORIES.includes(category)||!/^\d{4}-\d{2}-\d{2}$/.test(raceDate))return error('Choose a published category and race date.',400);
 const [catalog,access]=await Promise.all([productCatalog(env),currentAccess(request,env)]);
 const matching=catalog.products.filter(product=>product.category===category&&product.race_date===raceDate);
 if(!matching.length)return error('No published tab exists for that category and racing date.',404);
 const free=matching.some(product=>Number(product.price_cents)===0);
 if(!access.universal&&!free&&!hasPurchaseScope(access.scopes,category,raceDate))return error('Purchase this category for the selected racing date to unlock its tab.',403);
 const content=await readProductTabEdition(env,category,raceDate,matching);
 if(!content)return error('The published tab content is temporarily unavailable.',503);
 return json(content);
}
// Reuse exactly the customer edition entitlement gate for the race-card builder.
async function customerF4(request,env,url){
 const gateURL=new URL(url);gateURL.searchParams.set("category","Race Cards");
 const gated=await edition(request,env,gateURL);
 if(!gated.ok)return gated;
 const data=await gated.json(),track=url.searchParams.get("track"),race=Number(url.searchParams.get("race"));
 const card=data.cards?.find(item=>(item.track===track||item.card?.track_name===track)&&item.card?.races?.some(r=>r.race_number===race));
 if(!card)return error("That race is not in your published Race Cards edition.",404);
 return readCertifiedF4Exotics(env,url);
}
export async function handleProductTabs(request,env,url){
 if(!env.STORE_DB)return error('Product access is temporarily unavailable.',503);
 try{
  if(url.pathname==='/api/product-tabs/activate')return await activate(request,env);
  if(url.pathname==='/api/product-tabs/library'&&request.method==='GET')return await library(request,env);
  if(url.pathname==='/api/product-tabs/edition'&&request.method==='GET')return await edition(request,env,url);
  if(url.pathname==='/api/product-tabs/projections-f4'&&request.method==='GET')return await customerF4(request,env,url);
  return error('Not found',404);
 }catch(error){
  console.error('Product tab request failed',String(error).slice(0,140));
  return error('Product tabs are temporarily unavailable.',503);
 }
}

import {BUNDLE_KEY} from './bundles.js';
import {ensureReleaseSchedule} from './publication-schedule.js';

const API_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const SITE="https://railandryeracing.com";
const SESSION_COOKIE="__Host-rr_member";
const SESSION_SECONDS=30*24*60*60;
const MAGIC_SECONDS=15*60;
const GRACE_SECONDS=3*24*60*60;
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAN_DEFS=[
  {slug:"weekly",title:"Weekly All-Access",interval:"week",label:"Weekly"},
  {slug:"monthly",title:"Monthly All-Access",interval:"month",label:"Monthly"},
  {slug:"yearly",title:"Yearly All-Access",interval:"year",label:"Yearly"}
];
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{...API_HEADERS,...headers}});
const error=(message,status=400)=>json({error:message},status);
const emailOf=value=>String(value||"").trim().toLowerCase();
const validEmail=value=>EMAIL_RE.test(value)&&value.length<=254;
const nowSeconds=()=>Math.floor(Date.now()/1000);
const stripeMode=env=>{
  if(env.RR_PAYMENT_MODE==="live")return env.RR_LIVE_ACTIVATION==="CONFIRM_LIVE_SALES"?"live":"paused";
  if(env.RR_PAYMENT_MODE==="paused")return "paused";
  return "test";
};
const stripeKey=(env,mode)=>mode==="live"?env.STRIPE_LIVE_SECRET_KEY:env.STRIPE_SECRET_KEY;
const keyReady=(env,mode)=>{
  const key=stripeKey(env,mode);
  return typeof key==="string"&&(mode==="live"?/^(?:sk|rk)_live_/.test(key):key.startsWith("sk_test_"));
};
const webhookReady=(env,mode)=>{
  const secret=mode==="live"?env.STRIPE_LIVE_WEBHOOK_SECRET:env.STRIPE_WEBHOOK_SECRET;
  return typeof secret==="string"&&secret.startsWith("whsec_");
};
const modeColumn=(mode,kind)=>kind+"_"+mode;
const planDef=slug=>PLAN_DEFS.find(p=>p.slug===slug)||null;

async function ensureMembershipSchema(env){
  if(!env.STORE_DB)throw Error("Membership database unavailable");
  await env.STORE_DB.batch([
    env.STORE_DB.prepare("CREATE TABLE IF NOT EXISTS membership_plans (slug TEXT PRIMARY KEY,title TEXT NOT NULL,billing_interval TEXT NOT NULL CHECK(billing_interval IN ('week','month','year')),amount_cents_test INTEGER,stripe_product_id_test TEXT,stripe_price_id_test TEXT,amount_cents_live INTEGER,stripe_product_id_live TEXT,stripe_price_id_live TEXT,updated_at INTEGER NOT NULL DEFAULT 0)"),
    env.STORE_DB.prepare("CREATE TABLE IF NOT EXISTS membership_price_history (price_id TEXT PRIMARY KEY,plan_slug TEXT NOT NULL,stripe_mode TEXT NOT NULL CHECK(stripe_mode IN ('test','live')),amount_cents INTEGER NOT NULL,created_at INTEGER NOT NULL)"),
    env.STORE_DB.prepare("CREATE TABLE IF NOT EXISTS memberships (stripe_subscription_id TEXT PRIMARY KEY,stripe_customer_id TEXT NOT NULL,email TEXT NOT NULL,plan_slug TEXT NOT NULL,stripe_mode TEXT NOT NULL CHECK(stripe_mode IN ('test','live')),status TEXT NOT NULL,period_end INTEGER NOT NULL DEFAULT 0,cancel_at_period_end INTEGER NOT NULL DEFAULT 0,synced_at INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)"),
    env.STORE_DB.prepare("CREATE INDEX IF NOT EXISTS idx_memberships_email_mode ON memberships(lower(email),stripe_mode,status,period_end)"),
    env.STORE_DB.prepare("CREATE TABLE IF NOT EXISTS membership_magic_links (token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL)"),
    env.STORE_DB.prepare("CREATE INDEX IF NOT EXISTS idx_membership_magic_email ON membership_magic_links(lower(email),expires_at)"),
    env.STORE_DB.prepare("CREATE TABLE IF NOT EXISTS membership_sessions (token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL)"),
    env.STORE_DB.prepare("CREATE INDEX IF NOT EXISTS idx_membership_sessions_email ON membership_sessions(lower(email),expires_at)"),
    env.STORE_DB.prepare("CREATE TABLE IF NOT EXISTS membership_signin_limits (email TEXT PRIMARY KEY,window_start INTEGER NOT NULL,request_count INTEGER NOT NULL)")
  ]);
  const inserts=PLAN_DEFS.map(p=>env.STORE_DB.prepare("INSERT OR IGNORE INTO membership_plans (slug,title,billing_interval,updated_at) VALUES (?,?,?,?)").bind(p.slug,p.title,p.interval,nowSeconds()));
  await env.STORE_DB.batch(inserts);
}

async function stripeRequest(env,mode,method,endpoint,data,idempotencyKey){
  if(!keyReady(env,mode))throw Error("Stripe is not configured for "+mode);
  const headers={Authorization:"Bearer "+stripeKey(env,mode),"Stripe-Version":"2025-09-30.clover"};
  if(data)headers["Content-Type"]="application/x-www-form-urlencoded";
  if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
  const response=await fetch("https://api.stripe.com/v1/"+endpoint,{method,headers,body:data?data.toString():undefined});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){console.error("Membership Stripe request failed",response.status,body?.error?.code||"unknown");throw Error("Stripe membership operation failed");}
  return body;
}
function priceIdFor(plan,mode){return plan[modeColumn(mode,"stripe_price_id")];}
function amountFor(plan,mode){return plan[modeColumn(mode,"amount_cents")];}
function productIdFor(plan,mode){return plan[modeColumn(mode,"stripe_product_id")];}
function membershipCheckoutReady(env,mode){
  return mode!=="paused"&&keyReady(env,mode)&&webhookReady(env,mode)&&!!env.STORE_DB&&!!env.CARDS_BUCKET&&
    typeof env.RESEND_API_KEY==="string"&&env.RESEND_API_KEY.startsWith("re_");
}
async function readPlans(env){
  await ensureMembershipSchema(env);
  const result=await env.STORE_DB.prepare("SELECT * FROM membership_plans ORDER BY CASE slug WHEN 'weekly' THEN 1 WHEN 'monthly' THEN 2 ELSE 3 END").all();
  const mode=stripeMode(env),ready=mode==="live"&&membershipCheckoutReady(env,mode);
  return {mode,plans:(result.results||[]).map(p=>({
    slug:p.slug,title:p.title,label:planDef(p.slug)?.label||p.title,interval:p.billing_interval,
    amount_cents:mode==="paused"?null:amountFor(p,mode),enabled:ready&&!!priceIdFor(p,mode),
    checkout_ready:ready&&!!priceIdFor(p,mode)
  }))};
}
function getActiveRows(rows,email,env){
  const admin=emailOf(env.ADMIN_EMAIL);
  return (rows||[]).filter(r=>{
    if(r.stripe_mode!=="live"&&!(r.stripe_mode==="test"&&admin&&email===admin))return false;
    const now=nowSeconds(),end=Number(r.period_end)||0;
    return (["active","trialing"].includes(r.status)&&end>now)||(r.status==="past_due"&&end+GRACE_SECONDS>now);
  }).sort((a,b)=>(b.stripe_mode==="live")-(a.stripe_mode==="live")||(Number(b.period_end)||0)-(Number(a.period_end)||0));
}
async function membershipRows(env,email){
  const result=await env.STORE_DB.prepare("SELECT stripe_subscription_id,stripe_customer_id,email,plan_slug,stripe_mode,status,period_end,cancel_at_period_end,synced_at FROM memberships WHERE lower(email)=? ORDER BY period_end DESC").bind(email).all();
  return result.results||[];
}
async function activeMembership(env,email){
  let rows=await membershipRows(env,email);
  const admin=emailOf(env.ADMIN_EMAIL),now=nowSeconds();
  const near=rows.find(r=>(r.stripe_mode==="live"||(r.stripe_mode==="test"&&admin&&email===admin))&&
    ["active","trialing","past_due"].includes(r.status)&&(Number(r.period_end)||0)<=now+1800&&keyReady(env,r.stripe_mode));
  if(near){
    try{
      const sub=await stripeRequest(env,near.stripe_mode,"GET","subscriptions/"+encodeURIComponent(near.stripe_subscription_id));
      const statement=await subscriptionData(env,near.stripe_mode,sub,null);
      if(statement)await env.STORE_DB.batch([statement]);
      rows=await membershipRows(env,email);
    }catch(e){console.warn("Near-expiry membership refresh deferred",String(e).slice(0,90));}
  }
  const active=getActiveRows(rows,email,env);
  return active[0]||null;
}
function maskEmail(email){
  const parts=email.split("@");
  if(parts.length!==2)return "";
  const left=parts[0],shown=left.length<3?left.slice(0,1):left.slice(0,2);
  return shown+"•••@"+parts[1];
}
function randomHex(bytes=32){
  const data=new Uint8Array(bytes);crypto.getRandomValues(data);
  return Array.from(data).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function digest(value){
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function sameOrigin(request){
  const origin=request.headers.get("origin");
  return !!origin&&origin===new URL(request.url).origin&&request.headers.get("sec-fetch-site")!=="cross-site";
}
async function readJson(request,max=3000){
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw Error("Expected JSON");
  if(Number(request.headers.get("content-length")||0)>max)throw Error("Request too large");
  const body=await request.text();if(body.length>max)throw Error("Request too large");
  return JSON.parse(body);
}
function cookieValue(request){
  const cookie=request.headers.get("cookie")||"";
  const match=cookie.match(new RegExp("(?:^|;\\s*)"+SESSION_COOKIE+"=([a-f0-9]{64})(?:;|$)","i"));
  return match?.[1]||null;
}
function cookieHeader(value,maxAge){
  return SESSION_COOKIE+"="+value+"; Path=/; Max-Age="+maxAge+"; Secure; HttpOnly; SameSite=Lax";
}
async function sessionEmail(request,env){
  const raw=cookieValue(request);if(!raw)return null;
  const tokenHash=await digest(raw),now=nowSeconds();
  const session=await env.STORE_DB.prepare("SELECT email FROM membership_sessions WHERE token_hash=? AND expires_at>?").bind(tokenHash,now).first();
  if(!session)return null;
  const email=emailOf(session.email);
  return await activeMembership(env,email)?email:null;
}
async function adminPriceStatus(env){
  await ensureMembershipSchema(env);
  const result=await env.STORE_DB.prepare("SELECT * FROM membership_plans ORDER BY CASE slug WHEN 'weekly' THEN 1 WHEN 'monthly' THEN 2 ELSE 3 END").all();
  return (result.results||[]).map(p=>({
    slug:p.slug,title:p.title,interval:p.billing_interval,
    amount_cents_test:p.amount_cents_test,amount_cents_live:p.amount_cents_live,
    test_ready:!!p.stripe_price_id_test,live_ready:!!p.stripe_price_id_live
  }));
}
async function createOrUpdatePrice(env,mode,plan,amount){
  const priceColumn=modeColumn(mode,"stripe_price_id"),productColumn=modeColumn(mode,"stripe_product_id"),amountColumn=modeColumn(mode,"amount_cents");
  const current=await env.STORE_DB.prepare("SELECT * FROM membership_plans WHERE slug=?").bind(plan.slug).first();
  if(!current)throw Error("Membership plan is missing");
  if(Number(current[amountColumn])===amount&&current[priceColumn])return;
  let productId=current[productColumn];
  if(!productId){
    const product=await stripeRequest(env,mode,"POST","products",new URLSearchParams({
      name:"Rail & Rye All-Access — "+plan.label,
      description:"Recurring access to Rail & Rye digital racing publications."
    }),"rr-member-product-"+mode+"-"+plan.slug);
    if(typeof product.id!=="string"||!product.id.startsWith("prod_"))throw Error("Stripe did not create a membership product");
    productId=product.id;
  }
  const price=await stripeRequest(env,mode,"POST","prices",new URLSearchParams({
    product:productId,currency:"usd",unit_amount:String(amount),
    "recurring[interval]":plan.interval
  }),"rr-member-price-"+mode+"-"+plan.slug+"-"+amount+"-"+Date.now());
  if(typeof price.id!=="string"||!price.id.startsWith("price_")||!price.active||price.currency!=="usd"||
     price.unit_amount!==amount||price.recurring?.interval!==plan.interval)throw Error("Stripe returned an invalid membership price");
  await env.STORE_DB.prepare("INSERT OR IGNORE INTO membership_price_history (price_id,plan_slug,stripe_mode,amount_cents,created_at) VALUES (?,?,?,?,?)")
    .bind(price.id,plan.slug,mode,amount,nowSeconds()).run();
  await env.STORE_DB.prepare("UPDATE membership_plans SET "+productColumn+"=?,"+priceColumn+"=?,"+amountColumn+"=?,updated_at=? WHERE slug=?")
    .bind(productId,price.id,amount,nowSeconds(),plan.slug).run();
  if(current[priceColumn]){
    try{await stripeRequest(env,mode,"POST","prices/"+encodeURIComponent(current[priceColumn]),new URLSearchParams({active:"false"}));}
    catch(e){console.warn("Old membership price could not be archived",plan.slug,mode,String(e).slice(0,90));}
  }
}
async function adminSavePlans(request,env){
  if(!["GET","POST"].includes(request.method))return error("Method not allowed",405);
  if(request.method==="GET")return json({mode:stripeMode(env),plans:await adminPriceStatus(env),stripe_test_ready:keyReady(env,"test"),stripe_live_ready:keyReady(env,"live")});
  if(!sameOrigin(request))return error("Same-origin request required",403);
  let data;try{data=await readJson(request,2000);}catch(e){return error(e.message,400);}
  const amounts={weekly:Number(data.weekly_cents),monthly:Number(data.monthly_cents),yearly:Number(data.yearly_cents)};
  if(Object.values(amounts).some(n=>!Number.isSafeInteger(n)||n<50||n>1000000))return error("Enter a price from $0.50 to $10,000 for each plan.",400);
  await ensureMembershipSchema(env);
  const configuredModes=["test","live"].filter(m=>keyReady(env,m));
  if(!configuredModes.length)return error("Stripe keys are not available to create membership prices.",503);
  const failures=[];
  for(const plan of PLAN_DEFS){
    for(const mode of configuredModes){
      try{await createOrUpdatePrice(env,mode,plan,amounts[plan.slug]);}
      catch(e){failures.push({plan:plan.slug,mode,error:String(e.message||"Price creation failed")});}
    }
  }
  const currentMode=stripeMode(env);
  const plans=await adminPriceStatus(env);
  const activeModeReady=currentMode!=="paused"&&plans.every(p=>p[currentMode+"_ready"]&&p["amount_cents_"+currentMode]===amounts[p.slug]);
  return json({saved:activeModeReady,mode:currentMode,plans,failures},activeModeReady?200:502);
}

function productFields(product){
  const {pdf_key,...rest}=product;
  return rest;
}
async function memberLibrary(env){
  await ensureReleaseSchedule(env);
  const direct=await env.STORE_DB.prepare("SELECT p.id,p.title,p.category,p.race_date,p.track,p.description,datetime(p.first_post_at,'+48 hours') AS pdf_expires_at FROM products p WHERE p.status IN ('published','archived') AND p.pdf_key IS NOT NULL AND p.pdf_key!=? AND p.first_post_at IS NOT NULL AND datetime(p.first_post_at,'+48 hours')>CURRENT_TIMESTAMP AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=p.id) AND NOT EXISTS(SELECT 1 FROM product_release_schedule s WHERE s.product_id=p.id AND s.release_at>CURRENT_TIMESTAMP) ORDER BY COALESCE(p.race_date,'') DESC,p.created_at DESC").bind(BUNDLE_KEY).all();
  const bundled=await env.STORE_DB.prepare("SELECT c.id,c.title,c.category,c.race_date,c.track,c.description,datetime(c.first_post_at,'+48 hours') AS pdf_expires_at FROM products b JOIN bundle_items bi ON bi.bundle_id=b.id JOIN products c ON c.id=bi.product_id LEFT JOIN bundle_only_assets a ON a.product_id=c.id WHERE b.status IN ('published','archived') AND b.pdf_key=? AND c.pdf_key IS NOT NULL AND c.pdf_key!=? AND c.first_post_at IS NOT NULL AND datetime(c.first_post_at,'+48 hours')>CURRENT_TIMESTAMP AND (c.status IN ('published','archived') OR (c.status='draft' AND a.product_id IS NOT NULL)) AND NOT EXISTS(SELECT 1 FROM product_release_schedule s WHERE s.product_id=c.id AND s.release_at>CURRENT_TIMESTAMP) ORDER BY COALESCE(c.race_date,'') DESC,c.created_at DESC").bind(BUNDLE_KEY,BUNDLE_KEY).all();
  const items=new Map();
  for(const item of [...(direct.results||[]),...(bundled.results||[])])items.set(item.id,item);
  return [...items.values()].sort((a,b)=>String(b.race_date||"").localeCompare(String(a.race_date||""))||String(a.title||"").localeCompare(String(b.title||"")));
}
async function memberProduct(env,id){
  await ensureReleaseSchedule(env);
  const direct=await env.STORE_DB.prepare("SELECT p.title,p.pdf_key FROM products p WHERE p.id=? AND p.status IN ('published','archived') AND p.pdf_key IS NOT NULL AND p.pdf_key!=? AND p.first_post_at IS NOT NULL AND datetime(p.first_post_at,'+48 hours')>CURRENT_TIMESTAMP AND NOT EXISTS(SELECT 1 FROM bundle_only_assets a WHERE a.product_id=p.id) AND NOT EXISTS(SELECT 1 FROM product_release_schedule s WHERE s.product_id=p.id AND s.release_at>CURRENT_TIMESTAMP)").bind(id,BUNDLE_KEY).first();
  if(direct)return direct;
  return env.STORE_DB.prepare("SELECT c.title,c.pdf_key FROM products b JOIN bundle_items bi ON bi.bundle_id=b.id JOIN products c ON c.id=bi.product_id LEFT JOIN bundle_only_assets a ON a.product_id=c.id WHERE c.id=? AND b.status IN ('published','archived') AND b.pdf_key=? AND c.pdf_key IS NOT NULL AND c.pdf_key!=? AND c.first_post_at IS NOT NULL AND datetime(c.first_post_at,'+48 hours')>CURRENT_TIMESTAMP AND (c.status IN ('published','archived') OR (c.status='draft' AND a.product_id IS NOT NULL)) AND NOT EXISTS(SELECT 1 FROM product_release_schedule s WHERE s.product_id=c.id AND s.release_at>CURRENT_TIMESTAMP) LIMIT 1").bind(id,BUNDLE_KEY,BUNDLE_KEY).first();
}
function safeFilename(title){
  return String(title||"rail-and-rye").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9 -]/g,"").trim().replace(/\s+/g,"-").slice(0,70)||"rail-and-rye";
}
async function apiPlans(env){
  const data=await readPlans(env);
  return json(data);
}
async function checkout(request,env){
  if(request.method!=="POST")return error("Method not allowed",405);
  if(!sameOrigin(request))return error("Same-origin request required",403);
  const mode=stripeMode(env);
  if(mode!=="live"||!membershipCheckoutReady(env,mode))return error("Live membership checkout is not ready yet.",503);
  let data;try{data=await readJson(request,1000);}catch(e){return error(e.message,400);}
  const plan=planDef(String(data.plan||""));
  if(!plan)return error("Choose a valid membership.",400);
  const email=emailOf(data.email);
  if(!validEmail(email))return error("Enter a valid email address.",400);
  if(data.accepted_terms!==true)return error("Please accept the recurring membership terms before continuing.",400);
  await ensureMembershipSchema(env);
  if(await activeMembership(env,email))return error("This email already has an active membership. Sign in at /membership/account/ to open the library.",409);
  const row=await env.STORE_DB.prepare("SELECT * FROM membership_plans WHERE slug=?").bind(plan.slug).first();
  const priceId=row&&priceIdFor(row,mode),amount=row&&amountFor(row,mode);
  if(!priceId||!Number.isSafeInteger(amount)||amount<50)return error("This membership is not available yet.",503);
  let price;
  try{price=await stripeRequest(env,mode,"GET","prices/"+encodeURIComponent(priceId));}
  catch{return error("Membership checkout is temporarily unavailable.",503);}
  if(!price.active||price.currency!=="usd"||price.unit_amount!==amount||price.recurring?.interval!==plan.interval)return error("Membership price configuration needs attention.",503);
  const priorCustomer=await env.STORE_DB.prepare("SELECT stripe_customer_id FROM memberships WHERE lower(email)=? ORDER BY updated_at DESC LIMIT 1").bind(email).first();
  const fields=new URLSearchParams({
    mode:"subscription",
    "branding_settings[display_name]":"Rail & Rye",
    "payment_method_types[0]":"card",
    allow_promotion_codes:"true",
    "line_items[0][quantity]":"1",
    "line_items[0][price]":priceId,
    "metadata[rr_membership]":"1",
    "metadata[plan_slug]":plan.slug,
    "metadata[terms_accepted]":"yes",
    ...(priorCustomer?.stripe_customer_id?{customer:priorCustomer.stripe_customer_id}:{customer_email:email}),
    "subscription_data[metadata][rr_membership]":"1",
    "subscription_data[metadata][plan_slug]":plan.slug,
    "subscription_data[metadata][terms_accepted]":"yes",
    success_url:SITE+"/membership/success.html?session_id={CHECKOUT_SESSION_ID}",
    cancel_url:SITE+"/membership/"
  });
  try{
    const session=await stripeRequest(env,mode,"POST","checkout/sessions",fields,"rr-member-checkout-"+plan.slug+"-"+crypto.randomUUID());
    if(session.mode!=="subscription"||session.livemode!==(mode==="live")||typeof session.url!=="string"||
       !session.url.startsWith("https://checkout.stripe.com/")||!/^cs_(?:test|live)_/.test(session.id||""))throw Error("Unexpected Stripe checkout response");
    return json({url:session.url});
  }catch(e){
    console.error("Membership checkout failed",String(e).slice(0,120));
    return error("Unable to start membership checkout.",502);
  }
}
function modeFromSession(sessionId){return sessionId.startsWith("cs_live_")?"live":"test";}
function stripeId(value,prefix){
  const id=typeof value==="string"?value:value?.id;
  return typeof id==="string"&&id.startsWith(prefix)?id:null;
}
async function subscriptionData(env,mode,sub,emailHint){
  const subId=stripeId(sub,"sub_");
  const customerId=stripeId(sub.customer,"cus_");
  if(!subId||!customerId)return null;
  const items=sub.items?.data||[];
  const priceIds=items.map(i=>stripeId(i.price,"price_")).filter(Boolean);
  let plan=null;
  if(priceIds.length){
    for(const priceId of priceIds){
      plan=await env.STORE_DB.prepare("SELECT p.* FROM membership_price_history h JOIN membership_plans p ON p.slug=h.plan_slug WHERE h.stripe_mode=? AND h.price_id=?").bind(mode,priceId).first();
      if(plan)break;
    }
  }
  const planMeta=String(sub.metadata?.plan_slug||"");
  if(!plan&&planDef(planMeta)){
    const candidate=await env.STORE_DB.prepare("SELECT * FROM membership_plans WHERE slug=?").bind(planMeta).first();
    if(candidate&&priceIds.includes(priceIdFor(candidate,mode)))plan=candidate;
  }
  if(!plan)return null;
  const previous=await env.STORE_DB.prepare("SELECT email FROM memberships WHERE stripe_subscription_id=?").bind(subId).first();
  let email=emailOf(emailHint||previous?.email);
  if(!validEmail(email)){
    const customer=await stripeRequest(env,mode,"GET","customers/"+encodeURIComponent(customerId));
    email=emailOf(customer.email);
  }
  if(!validEmail(email))throw Error("Stripe customer email is unavailable");
  const itemEnds=items.map(i=>Number(i.current_period_end)).filter(Number.isSafeInteger);
  const periodEnd=itemEnds.length?Math.max(...itemEnds):Number(sub.current_period_end||sub.ended_at||0);
  const now=nowSeconds(),status=String(sub.status||"unknown").slice(0,40);
  return env.STORE_DB.prepare("INSERT INTO memberships (stripe_subscription_id,stripe_customer_id,email,plan_slug,stripe_mode,status,period_end,cancel_at_period_end,synced_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(stripe_subscription_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,email=excluded.email,plan_slug=excluded.plan_slug,stripe_mode=excluded.stripe_mode,status=excluded.status,period_end=excluded.period_end,cancel_at_period_end=excluded.cancel_at_period_end,synced_at=excluded.synced_at,updated_at=excluded.updated_at")
    .bind(subId,customerId,email,plan.slug,mode,status,Number.isSafeInteger(periodEnd)?periodEnd:0,sub.cancel_at_period_end?1:0,now,now,now);
}
async function membershipWebhookStatement(env,event,mode){
  const obj=event.data?.object||{};
  let subId=null,emailHint=null;
  if(event.type==="checkout.session.completed"&&obj.mode==="subscription"&&obj.metadata?.rr_membership==="1"){
    subId=stripeId(obj.subscription,"sub_");
    emailHint=emailOf(obj.customer_details?.email||obj.customer_email);
  }else if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","customer.subscription.paused","customer.subscription.resumed"].includes(event.type)){
    subId=stripeId(obj.id,"sub_");
  }else if(["invoice.paid","invoice.payment_failed","invoice.payment_action_required"].includes(event.type)){
    const parent=obj.parent?.subscription_details?.subscription;
    subId=stripeId(obj.subscription||parent,"sub_");
  }
  if(!subId)return null;
  await ensureMembershipSchema(env);
  const subscription=await stripeRequest(env,mode,"GET","subscriptions/"+encodeURIComponent(subId));
  return subscriptionData(env,mode,subscription,emailHint);
}
async function confirmCheckout(request,env){
  if(request.method!=="POST")return error("Method not allowed",405);
  if(!sameOrigin(request))return error("Same-origin request required",403);
  let data;try{data=await readJson(request,1000);}catch(e){return error(e.message,400);}
  const sessionId=String(data.session_id||"");
  if(!/^cs_(?:test|live)_[A-Za-z0-9_]{10,200}$/.test(sessionId))return error("Invalid checkout session.",400);
  const mode=modeFromSession(sessionId);
  if(!keyReady(env,mode)||!env.STORE_DB)return error("Payment confirmation is unavailable.",503);
  await ensureMembershipSchema(env);
  try{
    const session=await stripeRequest(env,mode,"GET","checkout/sessions/"+encodeURIComponent(sessionId)+"?expand[]=subscription");
    if(session.id!==sessionId||session.mode!=="subscription"||session.metadata?.rr_membership!=="1"||session.livemode!==(mode==="live"))return error("Membership checkout was not found.",404);
    if(session.status!=="complete")return json({confirmed:false,pending:true});
    const sub=typeof session.subscription==="string"?await stripeRequest(env,mode,"GET","subscriptions/"+encodeURIComponent(session.subscription)):session.subscription;
    const statement=await subscriptionData(env,mode,sub,emailOf(session.customer_details?.email||session.customer_email));
    if(statement)await env.STORE_DB.batch([statement]);
    const email=emailOf(session.customer_details?.email||session.customer_email);
    const active=validEmail(email)?await activeMembership(env,email):null;
    return json({confirmed:!!active, pending:!active, email:active?maskEmail(email):null});
  }catch(e){
    console.warn("Membership checkout confirmation delayed",String(e).slice(0,120));
    return json({confirmed:false,pending:true});
  }
}
async function requestMagicLink(request,env){
  if(request.method!=="POST")return error("Method not allowed",405);
  if(!sameOrigin(request))return error("Same-origin request required",403);
  let data;try{data=await readJson(request,1500);}catch(e){return error(e.message,400);}
  const email=emailOf(data.email);
  if(!validEmail(email))return error("Enter a valid email address.",400);
  await ensureMembershipSchema(env);
  const member=await activeMembership(env,email);
  if(!member)return json({sent:true});
  if(member.stripe_mode==="test"&&email!==emailOf(env.ADMIN_EMAIL))return json({sent:true});
  if(!env.RESEND_API_KEY?.startsWith("re_"))return error("Email sign-in is temporarily unavailable.",503);
  const now=nowSeconds();
  const limit=await env.STORE_DB.prepare(
    "INSERT INTO membership_signin_limits (email,window_start,request_count) VALUES (?,?,1) ON CONFLICT(email) DO UPDATE SET request_count=CASE WHEN membership_signin_limits.window_start<=? THEN 1 ELSE membership_signin_limits.request_count+1 END,window_start=CASE WHEN membership_signin_limits.window_start<=? THEN excluded.window_start ELSE membership_signin_limits.window_start END RETURNING request_count"
  ).bind(email,now,now-15*60,now-15*60).first();
  if(Number(limit?.request_count||0)>3)return json({sent:true});
  await env.STORE_DB.prepare("DELETE FROM membership_magic_links WHERE expires_at<=?").bind(now).run();
  await env.STORE_DB.prepare("DELETE FROM membership_signin_limits WHERE window_start<?").bind(now-24*60*60).run();
  const raw=randomHex(),tokenHash=await digest(raw),expires=now+MAGIC_SECONDS;
  await env.STORE_DB.prepare("INSERT INTO membership_magic_links (token_hash,email,expires_at,created_at) VALUES (?,?,?,?)").bind(tokenHash,email,expires,now).run();
  await env.STORE_DB.prepare("DELETE FROM membership_sessions WHERE expires_at<?").bind(nowSeconds()).run();
  const link=SITE+"/membership/account/#token="+raw;
  const text=["Rail & Rye","", "Use this private link to sign in to your all-access membership:",link,"","This link expires in 15 minutes and can only be used once.","If you did not request it, you can ignore this email."].join("\n");
  const html="<!doctype html><html><body style=\"background:#f6f1e6;color:#0a2635;font-family:Arial,sans-serif;padding:24px\"><div style=\"max-width:540px;margin:auto;background:#fffaf0;border:1px solid #caa76d;padding:28px\"><p style=\"font:24px Georgia,serif;letter-spacing:3px\">RAIL &amp; RYE</p><h1 style=\"font:30px Georgia,serif\">Your member sign-in link</h1><p>Use this private link to access your all-access membership library.</p><p><a style=\"display:inline-block;padding:15px 22px;background:#0a2635;color:#fff;text-decoration:none\" href=\""+escapeHtml(link)+"\">SIGN IN TO RAIL &amp; RYE</a></p><p>This link expires in 15 minutes and can only be used once. If you did not request it, you can ignore this email.</p></div></body></html>";
  const result=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"rr-member-login-"+tokenHash.slice(0,40)},body:JSON.stringify({from:"Rail & Rye Racing <orders@railandryeracing.com>",to:[email],subject:"Rail & Rye | Your member sign-in link",html,text})});
  const response=await result.json().catch(()=>({}));
  if(!result.ok||!response.id){
    await env.STORE_DB.prepare("DELETE FROM membership_magic_links WHERE token_hash=?").bind(tokenHash).run();
    console.error("Membership sign-in email failed",result.status,response?.name||"unknown");
    return error("We could not send the sign-in email right now. Please try again.",503);
  }
  return json({sent:true});
}
async function verifyMagicLink(request,env){
  if(request.method!=="POST")return error("Method not allowed",405);
  if(!sameOrigin(request))return error("Same-origin request required",403);
  let data;try{data=await readJson(request,1000);}catch(e){return error(e.message,400);}
  const raw=String(data.token||"");
  if(!/^[a-f0-9]{64}$/i.test(raw))return error("This sign-in link is invalid or expired.",403);
  await ensureMembershipSchema(env);
  const tokenHash=await digest(raw),now=nowSeconds();
  const token=await env.STORE_DB.prepare("DELETE FROM membership_magic_links WHERE token_hash=? AND expires_at>? RETURNING email").bind(tokenHash,now).first();
  const email=emailOf(token?.email);
  if(!validEmail(email)||!(await activeMembership(env,email)))return error("This sign-in link is invalid or expired.",403);
  const sessionRaw=randomHex(),sessionHash=await digest(sessionRaw),expires=now+SESSION_SECONDS;
  await env.STORE_DB.prepare("INSERT INTO membership_sessions (token_hash,email,expires_at,created_at) VALUES (?,?,?,?)").bind(sessionHash,email,expires,now).run();
  return json({ok:true},200,{"Set-Cookie":cookieHeader(sessionRaw,SESSION_SECONDS)});
}
async function memberDetails(request,env){
  const email=await sessionEmail(request,env);
  if(!email)return error("Sign in to access your membership.",401);
  const rows=getActiveRows(await membershipRows(env,email),email,env);
  const subscriptions=rows.map(r=>({
    plan:planDef(r.plan_slug)?.title||"All-Access Membership",
    status:r.status,cancel_at_period_end:!!r.cancel_at_period_end,
    paid_through:new Date(Number(r.period_end)*1000).toISOString()
  }));
  return json({active:true,email,subscriptions,library:await memberLibrary(env)});
}
async function logout(request,env){
  if(request.method!=="POST")return error("Method not allowed",405);
  if(!sameOrigin(request))return error("Same-origin request required",403);
  const raw=cookieValue(request);
  if(raw&&env.STORE_DB){await ensureMembershipSchema(env);await env.STORE_DB.prepare("DELETE FROM membership_sessions WHERE token_hash=?").bind(await digest(raw)).run();}
  return json({ok:true},200,{"Set-Cookie":cookieHeader("",0)});
}
async function cancelAtPeriodEnd(request,env){
  if(request.method!=="POST")return error("Method not allowed",405);
  if(!sameOrigin(request))return error("Same-origin request required",403);
  const email=await sessionEmail(request,env);
  if(!email)return error("Sign in to manage your membership.",401);
  const rows=getActiveRows(await membershipRows(env,email),email,env);
  const selected=rows.find(r=>!r.cancel_at_period_end);
  if(!selected)return json({ok:true,message:"Your membership is already set to end at the close of its paid period."});
  const fields=new URLSearchParams({cancel_at_period_end:"true"});
  try{
    const updated=await stripeRequest(env,selected.stripe_mode,"POST","subscriptions/"+encodeURIComponent(selected.stripe_subscription_id),fields);
    const statement=await subscriptionData(env,selected.stripe_mode,updated,email);
    if(statement)await env.STORE_DB.batch([statement]);
    return json({ok:true,message:"Your membership will remain active through the end of the paid period, then expire."});
  }catch(e){
    console.error("Membership cancellation failed",String(e).slice(0,120));
    return error("We could not update your membership. Please try again.",502);
  }
}
async function billingPortal(request,env){
  if(request.method!=="POST")return error("Method not allowed",405);
  if(!sameOrigin(request))return error("Same-origin request required",403);
  const email=await sessionEmail(request,env);
  if(!email)return error("Sign in to manage your membership.",401);
  const rows=getActiveRows(await membershipRows(env,email),email,env);
  const current=rows.find(r=>r.stripe_mode==="live")||rows[0];
  if(!current)return error("Active membership not found.",404);
  try{
    const portal=await stripeRequest(env,current.stripe_mode,"POST","billing_portal/sessions",new URLSearchParams({
      customer:current.stripe_customer_id,return_url:SITE+"/membership/account/"
    }));
    if(typeof portal.url!=="string"||!portal.url.startsWith("https://billing.stripe.com/"))throw Error("Unexpected billing portal response");
    return json({url:portal.url});
  }catch(e){
    console.warn("Stripe billing portal unavailable",String(e).slice(0,100));
    return error("Billing management is not configured yet. You can still cancel here at the end of your paid period.",503);
  }
}
async function memberDownload(request,env,url){
  if(request.method!=="GET")return error("Method not allowed",405);
  const email=await sessionEmail(request,env);
  if(!email)return error("Sign in to access your membership.",401);
  const id=url.pathname.split("/").pop();
  if(!UUID_RE.test(id||""))return error("Publication not found.",404);
  if(!env.CARDS_BUCKET)return error("Downloads are temporarily unavailable.",503);
  const product=await memberProduct(env,id);
  if(!product)return error("This PDF has left the member library after its 48-hour race-day window. Need a copy? Email support@railandryeracing.com.",410);
  const file=await env.CARDS_BUCKET.get(product.pdf_key);
  if(!file)return error("Publication PDF temporarily unavailable.",503);
  return new Response(file.body,{headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":"attachment; filename=\""+safeFilename(product.title)+".pdf\"",
    "Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer",
    "X-Robots-Tag":"noindex, nofollow"
  }});
}
export async function handleMembershipApi(request,env,url){
  if(!env.STORE_DB)return error("Memberships are temporarily unavailable.",503);
  try{
    const p=url.pathname;
    if(p==="/api/membership/plans"&&request.method==="GET")return await apiPlans(env);
    if(p==="/api/membership/checkout")return await checkout(request,env);
    if(p==="/api/membership/confirm")return await confirmCheckout(request,env);
    if(p==="/api/membership/sign-in")return await requestMagicLink(request,env);
    if(p==="/api/membership/verify")return await verifyMagicLink(request,env);
    if(p==="/api/membership/logout")return await logout(request,env);
    if(p==="/api/membership/me"&&request.method==="GET")return await memberDetails(request,env);
    if(p==="/api/membership/cancel")return await cancelAtPeriodEnd(request,env);
    if(p==="/api/membership/billing-portal")return await billingPortal(request,env);
    if(/^\/api\/membership\/download\/[0-9a-f-]{36}$/i.test(p))return await memberDownload(request,env,url);
    return error("Not found.",404);
  }catch(e){
    console.error("Membership request failed",String(e).slice(0,180));
    return error("Membership service temporarily unavailable.",503);
  }
}
export async function handleAdminMembershipPlans(request,env){
  try{return await adminSavePlans(request,env);}
  catch(e){console.error("Membership plan setup failed",String(e).slice(0,150));return error("Membership plan setup failed. Please try again.",503);}
}
export async function processMembershipStripeEvent(env,event,mode){
  const statement=await membershipWebhookStatement(env,event,mode);
  return statement?[statement]:[];
}
export async function reconcileMemberships(env,limit=25){
  if(!env.STORE_DB)return 0;
  await ensureMembershipSchema(env);
  const cutoff=nowSeconds()-6*60*60;
  const due=await env.STORE_DB.prepare("SELECT stripe_subscription_id,stripe_mode FROM memberships WHERE status IN ('active','trialing','past_due') AND (synced_at<? OR period_end<=?) ORDER BY synced_at ASC LIMIT ?").bind(cutoff,nowSeconds()+24*60*60,limit).all();
  let synced=0;
  for(const row of due.results||[]){
    try{
      const sub=await stripeRequest(env,row.stripe_mode,"GET","subscriptions/"+encodeURIComponent(row.stripe_subscription_id));
      const statement=await subscriptionData(env,row.stripe_mode,sub,null);
      if(statement){await env.STORE_DB.batch([statement]);synced++;}
    }catch(e){console.warn("Membership reconciliation deferred",row.stripe_subscription_id,String(e).slice(0,90));}
  }
  return synced;
}


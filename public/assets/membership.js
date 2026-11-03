
(()=>{
"use strict";
const q=(s,r=document)=>r.querySelector(s),view=document.body.dataset.memberView;
const status=q("#member-status");
const show=(node,text)=>{if(node)node.textContent=text;};
const fetchJson=async(url,options={})=>{
 const res=await fetch(url,{credentials:"same-origin",cache:"no-store",...options});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"Please try again.");
 return data;
};
const post=(url,data)=>fetchJson(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data||{})});
const money=cents=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(cents||0)/100);
const planOrder=["weekly","monthly","yearly"];
function renderPlans(data){
 const grid=q("#plan-grid");
 if(!grid)return;
 grid.replaceChildren();
 const ready=data.mode==="live"&&data.plans.some(p=>p.checkout_ready);
 show(status,data.mode==="test"?"Membership checkout is not accepting public purchases while the site is in test mode.":data.mode==="paused"?"Membership checkout is paused while payment settings are being updated.":ready?"Choose the billing period that works for you. Cancel anytime; access continues through the paid period.":"Membership plans are being prepared. Please check back soon.");
 for(const plan of data.plans.sort((a,b)=>planOrder.indexOf(a.slug)-planOrder.indexOf(b.slug))){
  const card=document.createElement("article");card.className="rr-plan-card";
  const h=document.createElement("h2");h.textContent=plan.label+" All-Access";card.append(h);
  const period=document.createElement("p");period.className="rr-plan-period";period.textContent=plan.slug==="weekly"?"Billed every 7 days":plan.slug==="monthly"?"Billed monthly":"Billed yearly";card.append(period);
  const price=document.createElement("p");price.className="rr-plan-price";price.textContent=plan.amount_cents==null?"Pricing soon":money(plan.amount_cents);card.append(price);
  const button=document.createElement("button");button.type="button";button.className="rr-member-button";button.textContent=plan.checkout_ready?"Join "+plan.label:"Not available yet";button.disabled=!plan.checkout_ready;
  button.addEventListener("click",async()=>{
   const email=q("#join-email"),terms=q("#join-terms");if(!email?.reportValidity())return;if(!terms?.reportValidity())return;
   button.disabled=true;button.textContent="Opening secure checkout…";
   try{const response=await post("/api/membership/checkout",{plan:plan.slug,email:email.value,accepted_terms:terms.checked});location.assign(response.url);}
   catch(e){show(status,e.message);button.disabled=false;button.textContent="Try again";}
  });
  card.append(button);grid.append(card);
 }
}
function signInForm(form){
 if(!form)return;
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  const email=q('input[name="email"]',form)?.value||"";
  const button=q("button",form);if(button){button.disabled=true;button.textContent="Sending…";}
  show(status,"If that email has an active membership, a sign-in link will arrive shortly.");
  try{await post("/api/membership/sign-in",{email});show(status,"If that email has an active membership, a sign-in link will arrive shortly.");}
  catch(e){show(status,e.message);}
  finally{if(button){button.disabled=false;button.textContent="Email me a sign-in link";}}
 });
}
function formatPdfExpiry(value){if(!value)return "";const date=new Date(String(value).replace(" ","T")+"Z");if(Number.isNaN(date.getTime()))return "";date.setTime(date.getTime()-1000);return new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",dateStyle:"medium"}).format(date);}
function renderLibrary(data){
 const sign=q("#sign-in-panel"),account=q("#member-account"),list=q("#member-library");
 if(sign)sign.hidden=true;
 if(account)account.hidden=false;
 show(status,"Signed in as "+data.email+".");
 const subs=q("#member-subscriptions");
 if(subs){
  subs.replaceChildren();
  for(const item of data.subscriptions||[]){
   const p=document.createElement("p");p.className="rr-member-note";
   const end=new Date(item.paid_through);
   p.textContent=item.plan+" · "+(item.cancel_at_period_end?"Access through ":"Renews or remains active through ")+end.toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})+(item.cancel_at_period_end?" · Set to end":"");
   subs.append(p);
  }
 }
 if(list){
  list.replaceChildren();
  if(!(data.library||[]).length){show(list,"No publications are available in the member library yet.");return;}
  for(const item of data.library){
   const row=document.createElement("article");row.className="rr-library-item";
   const info=document.createElement("div");
   const title=document.createElement("h3");title.textContent=item.title;info.append(title);
   const detail=document.createElement("p");detail.textContent=[item.category,item.race_date].filter(Boolean).join(" · ")+(formatPdfExpiry(item.pdf_expires_at)?" · Available through "+formatPdfExpiry(item.pdf_expires_at):"");info.append(detail);
   const button=document.createElement("button");button.type="button";button.className="rr-member-button";button.textContent="Download PDF";
   button.addEventListener("click",()=>location.assign("/api/membership/download/"+encodeURIComponent(item.id)));
   row.append(info,button);list.append(row);
  }
 }
}
async function loadAccount(){
 try{
  const data=await fetchJson("/api/membership/me");
  renderLibrary(data);
  return true;
 }catch{return false;}
}
function initAccount(){
 signInForm(q("#member-sign-in"));
 const params=new URLSearchParams(location.hash.replace(/^#/,"")),token=params.get("token");
 if(token){
  history.replaceState(null,"",location.pathname);
  show(status,"Checking your sign-in link…");
  post("/api/membership/verify",{token}).then(()=>loadAccount()).catch(e=>show(status,e.message));
 }else{
  loadAccount().then(ok=>{if(ok)return;const sign=q("#sign-in-panel");if(sign)sign.hidden=false;const account=q("#member-account");if(account)account.hidden=true;show(status,"Sign in with the email address used for your membership.");});
 }
 q("#member-sign-out")?.addEventListener("click",async()=>{try{await post("/api/membership/logout",{});}catch{}location.reload();});
 q("#member-cancel")?.addEventListener("click",async()=>{
  if(!confirm("Cancel renewal? Your access will remain active through the end of the paid period."))return;
  show(status,"Updating your membership…");
  try{const data=await post("/api/membership/cancel",{});show(status,data.message);await loadAccount();}
  catch(e){show(status,e.message);}
 });
 q("#member-billing")?.addEventListener("click",async()=>{
  show(status,"Opening billing management…");
  try{const data=await post("/api/membership/billing-portal",{});location.assign(data.url);}
  catch(e){show(status,e.message);}
 });
}
async function initSuccess(){
 const sessionId=new URLSearchParams(location.search).get("session_id");
 const form=q("#member-sign-in");
 if(!sessionId){show(status,"Your checkout link is incomplete. If your membership is active, request a sign-in link below.");signInForm(form);return;}
 show(status,"Confirming your membership securely…");
 try{
  const result=await post("/api/membership/confirm",{session_id:sessionId});
  if(result.confirmed)show(status,"Payment confirmed. Enter the email address used at checkout and we’ll send your member sign-in link.");
  else show(status,"Your payment is still processing or could not be confirmed yet. Wait a moment, then enter your checkout email below.");
 }catch(e){show(status,e.message);}
 signInForm(form);
}
if(view==="plans"){
 fetchJson("/api/membership/plans").then(renderPlans).catch(e=>show(status,e.message));
}else if(view==="account")initAccount();
else if(view==="success")initSuccess();
})();

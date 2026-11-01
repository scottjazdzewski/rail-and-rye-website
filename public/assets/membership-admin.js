
(()=>{
"use strict";
const msg=document.querySelector("#message"),status=document.querySelector("#status"),form=document.querySelector("#plan-form"),save=document.querySelector("#save");
const set=(el,v)=>{if(el)el.textContent=v;};
async function request(url,options={}){
 const r=await fetch(url,{credentials:"same-origin",cache:"no-store",...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||"Request failed");
 return data;
}
function dollars(cents){return cents==null?"":(Number(cents)/100).toFixed(2);}
async function load(){
 try{
  const data=await request("/api/admin/membership-plans");
  set(status,"Checkout mode: "+data.mode+". Test Stripe key: "+(data.stripe_test_ready?"ready":"not configured")+" · Live Stripe key: "+(data.stripe_live_ready?"ready":"not configured"));
  for(const plan of data.plans||[]){
   const el=document.querySelector("#"+plan.slug);
   if(el)el.value=dollars(plan.amount_cents_live??plan.amount_cents_test);
  }
  updateRows(data.plans||[]);
 }catch(e){set(status,e.message);}
}
function updateRows(plans){
 const old=document.querySelector("#plan-status");
 if(old)old.remove();
 const box=document.createElement("p");box.id="plan-status";box.className="status";
 box.textContent=(plans||[]).map(p=>p.title+": test "+(p.test_ready?"ready":"not set")+", live "+(p.live_ready?"ready":"not set")).join(" · ");
 status.after(box);
}
form?.addEventListener("submit",async event=>{
 event.preventDefault();save.disabled=true;save.textContent="Saving…";set(msg,"Creating recurring Stripe prices…");
 try{
  const cents=slug=>Math.round(Number(document.querySelector("#"+slug).value)*100);
  const data=await request("/api/admin/membership-plans",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({weekly_cents:cents("weekly"),monthly_cents:cents("monthly"),yearly_cents:cents("yearly")})});
  set(msg,data.saved?(data.mode==="live"?"Rates saved. Live membership checkout is configured.":"Test prices saved. Public membership checkout remains off until live mode is enabled."):"Rates were saved where possible, but the current checkout mode still needs Stripe setup.");
  updateRows(data.plans||[]);
  for(const plan of data.plans||[]){const el=document.querySelector("#"+plan.slug);if(el)el.value=dollars(plan.amount_cents_live??plan.amount_cents_test);}
  if(data.failures?.length)set(status,data.failures.map(x=>x.plan+" ("+x.mode+"): "+x.error).join(" · "));
 }catch(e){set(msg,e.message);}
 finally{save.disabled=false;save.textContent="Save membership rates";}
});
load();
})();

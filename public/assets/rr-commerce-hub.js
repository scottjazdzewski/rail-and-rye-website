(()=>{"use strict";
const cats=["Race Cards","Pick Tickets","Longshot Radar","Target List"],q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],date=q("#rr-hub-date"),notice=q("#rr-hub-notice"),full=q("#rr-hub-full"),price=q("#rr-hub-bundle-price"),query=new URLSearchParams(location.search);
const dollar=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);
const formatDate=d=>new Intl.DateTimeFormat("en-US",{timeZone:"UTC",dateStyle:"long"}).format(new Date(d+"T12:00:00Z"));
const validDate=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+"T12:00:00Z"));
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
let products=[],days=[],universal=false,accessKnown=false,catalogKnown=false,checkoutReady=false,live=false;
const note=s=>{notice.textContent=s};
const bundleItems=p=>p.kind==="bundle"&&Array.isArray(p.included_products)?p.included_products:[];
const covered=(p,cat,d)=>bundleItems(p).some(i=>i.category===cat&&i.race_date===d);
const fullBundle=(p,d)=>p.kind==="bundle"&&bundleItems(p).length>0&&bundleItems(p).every(i=>i.race_date===d)&&cats.every(c=>covered(p,c,d));
const owns=(cat,d)=>accessKnown&&days.some(x=>x.category===cat&&x.race_date===d&&x.unlocked);
const open=(cat,d)=>location.assign("/my-products/?category="+encodeURIComponent(cat)+"&date="+encodeURIComponent(d));
const checkout=async(p,button)=>{if(!p||!checkoutReady||!live)return;button.disabled=true;button.textContent="Opening checkout…";try{const r=await fetch("/api/checkout",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({product_id:p.id})}),x=await r.json();if(!r.ok||typeof x.url!=="string"||!x.url.startsWith("https://checkout.stripe.com/"))throw Error(x.error||"Checkout unavailable.");location.assign(x.url)}catch(e){note(e.message||"Checkout unavailable.");render()}};
function choices(cat,d){return products.filter(p=>p.kind==="single"&&p.category===cat&&p.race_date===d)}
function render(){
 const d=date.value,all=products.filter(p=>fullBundle(p,d)),bundle=all.slice().sort((a,b)=>a.price_cents-b.price_cents)[0];let count=0,owned=0;
 for(const card of qa(".rr-hub-product")){
  const cat=card.dataset.productCategory,available=choices(cat,d),published=available.length>0||products.some(p=>covered(p,cat,d)),unlocked=owns(cat,d),state=card.querySelector(".rr-hub-state"),amount=card.querySelector(".rr-hub-price"),button=card.querySelector("button"),choice=card.querySelector(".rr-hub-choice"),select=choice.querySelector("select"),old=select.value;
  if(published)count++;if(published&&unlocked)owned++;
  select.replaceChildren();for(const item of available){const option=document.createElement("option");option.value=item.id;option.textContent=(item.track&&item.track!=="All"?item.track:item.title)+" · "+(item.price_cents===0?"Free":dollar(item.price_cents));select.append(option)}
  const deep=location.hash.match(/^#edition-([a-f0-9-]{36})$/i)?.[1];if(available.some(p=>p.id===(old||deep)))select.value=old||deep;
  choice.hidden=available.length<2||unlocked;const selected=available.find(p=>p.id===select.value)||available[0];
  amount.textContent=selected&&!unlocked?(selected.price_cents===0?"FREE":dollar(selected.price_cents)):"";
  state.dataset.state=!catalogKnown?"loading":!published?"unavailable":unlocked?"owned":"published";
  state.textContent=!catalogKnown?"Availability unavailable":!published?"Not yet published":unlocked?"Access granted":"Published";
  button.disabled=true;button.onclick=null;
  if(!catalogKnown||!accessKnown){button.textContent="Check access";button.disabled=false;button.onclick=()=>location.reload()}
  else if(!published){button.textContent="Unavailable"}
  else if(unlocked||selected?.price_cents===0){button.disabled=false;button.textContent="Open";button.onclick=()=>open(cat,d)}
  else if(selected&&checkoutReady&&live){button.disabled=false;button.textContent="Purchase Access";button.onclick=()=>checkout(selected,button)}
  else{button.textContent=selected?"Checkout unavailable":"Available with bundle"}
  select.onchange=render;
 }
 q("#rr-hub-count").textContent=catalogKnown?count+" of 4 published":"Unavailable";
 q("#rr-hub-access").textContent=!accessKnown?"Unavailable":universal?"All-Access membership":owned===4?"Full access":owned?owned+" of 4 unlocked":"No access for this date";
 price.textContent=bundle&&owned!==4&&!universal?dollar(bundle.price_cents):"";
 full.disabled=true;full.onclick=null;
 if(accessKnown&&(universal||owned===4)){full.disabled=false;full.textContent="Open My Tabs";full.onclick=()=>location.assign("/my-products/?date="+encodeURIComponent(d))}
 else if(catalogKnown&&accessKnown&&bundle&&checkoutReady&&live){full.disabled=false;full.textContent="Purchase Full Access";full.onclick=()=>checkout(bundle,full)}
 else full.textContent=bundle?"Checkout unavailable":"Full Access not yet available";
}
async function load(path){const r=await fetch(path,{cache:"no-store",credentials:"same-origin"});if(!r.ok)throw Error("Unavailable");return r.json()}
(async()=>{
 const [catalog,access]=await Promise.allSettled([load("/api/products"),load("/api/product-tabs/library")]);
 if(catalog.status==="fulfilled"&&Array.isArray(catalog.value.products)){products=catalog.value.products.filter(p=>p&&typeof p.id==="string"&&Number.isInteger(p.price_cents));catalogKnown=true;checkoutReady=catalog.value.checkout_ready===true;live=catalog.value.checkout_mode==="live"}
 if(access.status==="fulfilled"&&Array.isArray(access.value.days)){days=access.value.days;universal=access.value.universal_access===true;accessKnown=true}
 const dates=new Set([today()]);for(const p of products){if(validDate(p.race_date))dates.add(p.race_date);for(const i of bundleItems(p))if(validDate(i.race_date))dates.add(i.race_date)}for(const i of days)if(validDate(i.race_date))dates.add(i.race_date);
 const match=location.hash.match(/^#edition-([a-f0-9-]{36})$/i)?.[1],deep=products.find(p=>p.id===match),requested=deep?.race_date||query.get("date");
 date.replaceChildren();for(const d of [...dates].filter(validDate).sort().reverse()){const option=document.createElement("option");option.value=d;option.textContent=formatDate(d);date.append(option)}
 date.value=dates.has(requested)?requested:today();if(!date.value)date.selectedIndex=0;date.disabled=false;
 date.onchange=()=>{const p=new URLSearchParams(location.search);p.set("date",date.value);history.replaceState(null,"",location.pathname+"?"+p);render()};
 render();
 if(query.has("cancelled"))note("Checkout was cancelled. No payment was made.");
 else if(!catalogKnown||!accessKnown)note("Availability or access could not be verified. Refresh to try again.");
 else if(!live||!checkoutReady)note("Purchases are temporarily unavailable. Existing customers can still open their tabs.");
 const focusCat=deep?.category||query.get("category");if(cats.includes(focusCat)){const card=qa(".rr-hub-product").find(c=>c.dataset.productCategory===focusCat);if(card&&match){card.scrollIntoView({block:"nearest"});card.querySelector("button").focus({preventScroll:true})}}
})();
})();
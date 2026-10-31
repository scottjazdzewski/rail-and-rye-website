/* Publication hero rail: latest category edition uses the existing public catalog and checkout. */
(()=>{'use strict';
const category=document.body.dataset.publicationCategory;
const latestGrid=document.getElementById('rr-pub-latest');
const latestStatus=document.getElementById('rr-pub-latest-status');
const grid=document.getElementById('rr-pub-products');
const status=document.getElementById('rr-pub-status');
if(!category||!latestGrid||!latestStatus)return;
const txt=(tag,value,cls)=>{const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(value??'');return el};
const price=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(cents)||0)/100);
const freeProduct=p=>p.kind==='single'&&Number(p.price_cents)===0;
const makePurchaseButton=(p,data,onError)=>{
 const free=freeProduct(p),ready=Boolean(data.checkout_ready),live=data.checkout_mode==='live';
 const label=free?'Download free PDF':ready?(live?(p.kind==='bundle'?'Purchase bundle':'Purchase PDF'):'Test purchase'):'Checkout unavailable';
 const buy=txt('button',label,'rr-purchase-buy');
 buy.type='button';buy.disabled=!free&&(!ready||!Number.isFinite(Number(p.price_cents))||Number(p.price_cents)<50);
 buy.addEventListener('click',async()=>{
  if(free){window.location.assign('/api/free-download/'+encodeURIComponent(p.id));return}
  const original=buy.textContent;buy.disabled=true;buy.textContent='Opening secure checkout…';
  try{
   const response=await fetch('/api/checkout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:p.id})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Could not start checkout.');
   if(typeof result.url!=='string'||!/^https:\/\//.test(result.url))throw Error('Checkout URL unavailable.');
   window.location.assign(result.url);
  }catch(error){onError(error);buy.disabled=false;buy.textContent=original}
 });
 return buy
};
const makeGlassCard=(p,data,onError)=>{
 const card=document.createElement('article');card.className='rr-glass-purchase-card';
 const cover=document.createElement('div');cover.className='rr-purchase-brand-mark';
 const logo=document.createElement('img');logo.src='/assets/approved/brand/rail-rye-ivory-logo.png';logo.alt='Rail & Rye official horseshoe emblem';logo.className='rr-purchase-brand-logo';logo.loading='lazy';logo.decoding='async';cover.append(logo);
 const copy=document.createElement('div');copy.className='rr-purchase-copy';
 copy.append(txt('div',[p.category,p.race_date,p.track].filter(Boolean).join(' · ')||'Rail & Rye publication','rr-purchase-meta'));
 copy.append(txt('h3',p.title||category,'rr-purchase-title'));
 copy.append(txt('p',p.description||'Digital racing publication.','rr-purchase-description'));
 copy.append(txt('div',freeProduct(p)?'FREE':price(p.price_cents),'rr-purchase-price'));
 card.append(cover,copy,makePurchaseButton(p,data,onError));
 return card
};
const makeEditionCard=(p,data,onError)=>{
 const card=document.createElement('article');card.className='rr-edition-card';
 const info=document.createElement('div');info.className='rr-edition-info';
 const meta=[p.race_date,p.track].filter(Boolean).join(' · ');
 if(meta)info.append(txt('span',meta,'rr-edition-meta'));
 info.append(txt('h3',p.title||category));
 if(p.description)info.append(txt('p',p.description,'rr-edition-description'));
 const bottom=document.createElement('div');bottom.className='rr-edition-actions';
 bottom.append(txt('strong',freeProduct(p)?'FREE':price(p.price_cents),'rr-edition-price'));
 const buy=makePurchaseButton(p,data,onError);buy.classList.add('rr-edition-buy');
 bottom.append(buy);card.append(info,bottom);return card
};
(async()=>{
 try{
  const response=await fetch('/api/products',{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Products are temporarily unavailable.');
  const products=(Array.isArray(data.products)?data.products:[])
   .filter(p=>p.category===category)
   .sort((a,b)=>String(b.race_date||'').localeCompare(String(a.race_date||'')));
  if(!products.length){
   latestStatus.textContent='No editions are currently published in this collection.';
   if(status)status.textContent='No editions are currently published in this collection.';
   return
  }
  latestStatus.textContent='Latest of '+products.length+(products.length===1?' published edition':' published editions');
  const showError=error=>{latestStatus.textContent=error.message||'Checkout could not be started.';latestStatus.classList.add('rr-status-error')};
  latestGrid.replaceChildren(makeGlassCard(products[0],data,showError));
  if(grid&&status){
   status.textContent=products.length===1?'1 edition available':products.length+' editions available';
   grid.replaceChildren(...products.map(p=>makeEditionCard(p,data,showError)))
  }
 }catch(error){
  latestStatus.textContent='Unable to load the latest edition right now.';
  latestStatus.classList.add('rr-status-error');
  if(status){status.textContent='Unable to load editions right now. You can still browse the Publication Desk.';status.classList.add('rr-status-error')}
 }
})();
})();
/* Publication details: reuses existing Rail & Rye live public product and Stripe checkout APIs. */
(()=>{'use strict';
const category=document.body.dataset.publicationCategory;
const grid=document.getElementById('rr-pub-products');
const status=document.getElementById('rr-pub-status');
if(!category||!grid||!status)return;
const txt=(tag,value,cls)=>{const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(value??'');return el};
const price=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(cents)||0)/100);
(async()=>{
 try{
  const response=await fetch('/api/products',{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Products are temporarily unavailable.');
  const products=(Array.isArray(data.products)?data.products:[]).filter(p=>p.category===category);
  if(!products.length){status.textContent='No editions are currently published in this collection.';return}
  status.textContent=products.length===1?'1 edition available':products.length+' editions available';
  const ready=Boolean(data.checkout_ready),live=data.checkout_mode==='live';
  for(const p of products){
   const card=document.createElement('article');card.className='rr-edition-card';
   const info=document.createElement('div');info.className='rr-edition-info';
   const meta=[p.race_date,p.track].filter(Boolean).join(' · ');
   if(meta)info.append(txt('span',meta,'rr-edition-meta'));
   info.append(txt('h3',p.title));
   if(p.description)info.append(txt('p',p.description,'rr-edition-description'));
   const bottom=document.createElement('div');bottom.className='rr-edition-actions';
   bottom.append(txt('strong',price(p.price_cents),'rr-edition-price'));
   const buy=txt('button',ready?(live?'Purchase PDF':'Test purchase'):'Checkout unavailable','rr-edition-buy');
   buy.type='button';buy.disabled=!ready||!Number.isFinite(p.price_cents)||p.price_cents<50;
   buy.addEventListener('click',async()=>{
    buy.disabled=true;buy.textContent='Opening secure checkout…';
    try{
     const res=await fetch('/api/checkout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:p.id})});
     const result=await res.json();
     if(!res.ok)throw Error(result.error||'Could not start checkout.');
     if(typeof result.url!=='string'||!/^https:\/\//.test(result.url))throw Error('Checkout URL unavailable.');
     window.location.assign(result.url);
    }catch(error){status.textContent=error.message||'Checkout could not be started.';status.classList.add('rr-status-error');buy.disabled=false;buy.textContent=live?'Purchase PDF':'Test purchase'}
   });
   bottom.append(buy);card.append(info,bottom);grid.append(card);
  }
 }catch(error){status.textContent='Unable to load editions right now. You can still browse the Publication Desk.';status.classList.add('rr-status-error')}
})();
})();
(()=>{'use strict';
const products=document.getElementById('rr-racecards-products');
const status=document.getElementById('rr-racecards-status');
if(!products||!status)return;
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(cents)||0)/100);
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x};
(async()=>{
 try{
  const response=await fetch('/api/products',{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Unable to load published Race Cards.');
  const cards=(Array.isArray(data.products)?data.products:[])
   .filter(p=>p.category==='Race Cards')
   .sort((a,b)=>String(b.race_date||'').localeCompare(String(a.race_date||'')));
  if(!cards.length){status.textContent='The next Race Card is being prepared.';products.append(el('div','rr-racecards-empty','No Race Cards are currently published.'));return}
  status.textContent=cards.length===1?'1 Race Card available':cards.length+' Race Cards available';
  const ready=Boolean(data.checkout_ready),live=data.checkout_mode==='live';
  cards.slice(0,4).forEach(p=>{
   const card=el('article','rr-racecards-product');
   const cover=el('div','rr-racecards-product-cover');
   if(p.image_url){const img=document.createElement('img');img.src=p.image_url;img.alt='';img.loading='lazy';img.decoding='async';cover.append(img)}else{cover.append(el('span','', 'R & R'))}
   const copy=el('div','rr-racecards-product-copy');
   copy.append(el('div','rr-racecards-meta',[p.track,p.race_date].filter(Boolean).join(' · ')||'Rail & Rye Race Card'));
   copy.append(el('h3','',p.title||'Race Card'));
   copy.append(el('div','rr-racecards-price',money(p.price_cents)));
   const buy=el('button','rr-racecards-buy',ready?(live?'Purchase':'Test purchase'):'Unavailable');
   buy.type='button';buy.disabled=!ready||!Number.isFinite(Number(p.price_cents))||Number(p.price_cents)<50;
   buy.addEventListener('click',async()=>{
    buy.disabled=true;const old=buy.textContent;buy.textContent='Opening…';
    try{
     const res=await fetch('/api/checkout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:p.id})});
     const result=await res.json();
     if(!res.ok)throw Error(result.error||'Unable to start checkout.');
     if(typeof result.url!=='string'||!/^https:\/\//.test(result.url))throw Error('Checkout URL unavailable.');
     location.assign(result.url);
    }catch(error){status.textContent=error.message||'Checkout could not be started.';buy.disabled=false;buy.textContent=old}
   });
   card.append(cover,copy,buy);products.append(card);
  });
 }catch(error){status.textContent='Unable to load Race Cards right now. The Publication Desk is still available.'}
})();
})();
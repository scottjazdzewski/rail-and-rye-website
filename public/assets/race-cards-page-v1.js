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
   const card=el('article','rr-glass-purchase-card');
   const cover=el('div','rr-purchase-brand-mark');
   const img=document.createElement('img');img.src='/assets/approved/brand/rail-rye-ivory-logo.png';img.alt='Rail & Rye official horseshoe emblem';img.className='rr-purchase-brand-logo';img.loading='lazy';img.decoding='async';cover.append(img);
   const meta=el('div','rr-purchase-meta');
   if(p.track)meta.append(el('span','rr-racecards-meta-track',p.track));
   if(p.track&&p.race_date)meta.append(el('span','rr-racecards-meta-divider','·'));
   if(p.race_date)meta.append(el('span','rr-racecards-meta-date',p.race_date));
   if(!meta.childNodes.length)meta.textContent='Rail & Rye Race Card';
   const copy=el('div','rr-purchase-copy');
   copy.append(el('h3','rr-purchase-title',p.title||'Race Card'));
   copy.append(el('div','rr-purchase-price',money(p.price_cents)));
   const free=Number(p.price_cents)===0;
   const buy=el('button','rr-purchase-buy',free?'Download free PDF':ready?(live?'Purchase':'Test purchase'):'Unavailable');
   buy.type='button';buy.disabled=free?false:(!ready||!Number.isFinite(Number(p.price_cents))||Number(p.price_cents)<50);
   buy.addEventListener('click',async()=>{
    if(free){location.assign('/api/free-download/'+encodeURIComponent(p.id));return;}
    buy.disabled=true;const old=buy.textContent;buy.textContent='Opening…';
    try{
     const res=await fetch('/api/checkout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:p.id})});
     const result=await res.json();
     if(!res.ok)throw Error(result.error||'Unable to start checkout.');
     if(typeof result.url!=='string'||!/^https:\/\//.test(result.url))throw Error('Checkout URL unavailable.');
     location.assign(result.url);
    }catch(error){status.textContent=error.message||'Checkout could not be started.';buy.disabled=false;buy.textContent=old}
   });
   card.append(meta,cover,copy,buy);products.append(card);
  });
 }catch(error){status.textContent='Unable to load Race Cards right now. The Publication Desk is still available.'}
})();
})();
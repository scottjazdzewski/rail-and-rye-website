(()=>{'use strict';
const products=document.getElementById('rr-racecards-products');
const status=document.getElementById('rr-racecards-status');
if(!products||!status)return;
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(cents)||0)/100);
const el=(tag,cls,value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=String(value);return node;};
const raceDateToday=()=>{
 // Use the racing calendar date in Eastern Time, regardless of visitor location.
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const field=key=>parts.find(part=>part.type===key)?.value||'';
 return [field('year'),field('month'),field('day')].join('-');
};
const dateLabel=value=>{
 const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!match)return String(value||'');
 return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'})
  .format(new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),12)));
};
const sortByTrack=(a,b)=>{
 if((a.kind==='bundle')!==(b.kind==='bundle'))return a.kind==='bundle'?1:-1;
 return String(a.track||'').localeCompare(String(b.track||''))||String(a.title||'').localeCompare(String(b.title||''));
};
(async()=>{
 try{
  const response=await fetch('/api/products',{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Unable to load published Race Cards.');
  const today=raceDateToday();
  const catalog=(Array.isArray(data.products)?data.products:[]).filter(p=>Array.isArray(p.categories)?p.categories.includes('Race Cards'):p.category==='Race Cards');
  // Cards with no racing date stay in the full Publication Desk, not "today".
  const dated=catalog.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(String(p.race_date||'')));
  const current=dated.filter(p=>p.race_date===today);
  const nextDate=dated.filter(p=>p.race_date>today).map(p=>p.race_date).sort()[0];
  const upcoming=!current.length&&Boolean(nextDate);
  const displayedDate=upcoming?nextDate:today;
  const available=(upcoming?dated.filter(p=>p.race_date===nextDate):current).sort(sortByTrack);
  const bundles=available.filter(p=>p.kind==='bundle');
  const singles=available.filter(p=>p.kind!=='bundle');
  // Show at most four in the approved rail; reserve a bundle slot when needed.
  const singleSlots=bundles.length?3:4;
  const chosen=[...singles.slice(0,singleSlots),...bundles.slice(0,4-Math.min(singleSlots,singles.length))];
  const pageTitle=document.getElementById('rr-racecards-title');
  const railTitle=document.getElementById('rr-racecards-desk-title');
  const archiveLink=document.querySelector('.rr-racecards-all');
  if(archiveLink)archiveLink.setAttribute('aria-label','Browse all Race Cards, including previous editions, in the Publication Desk');
  if(upcoming){
   if(pageTitle)pageTitle.textContent='Upcoming Race Cards.';
   if(railTitle)railTitle.textContent='Next race date';
  }
  if(!available.length){
   status.textContent='No Race Cards listed for '+dateLabel(today)+'.';
   products.append(el('div','rr-racecards-empty','Previous editions and other published Race Cards are available through the Publication Desk.'));
   return;
  }
  const countText=available.length===1?'1 publication':available.length+' publications';
  status.textContent=(chosen.length<available.length?'Showing '+chosen.length+' of ':'')+countText+' for '+dateLabel(displayedDate)+(upcoming?' · Upcoming':'');
  const ready=Boolean(data.checkout_ready),live=data.checkout_mode==='live';
  for(const p of chosen){
   const card=el('article','rr-glass-purchase-card');
   const cover=el('div','rr-purchase-brand-mark');
   const img=document.createElement('img');
   img.src='/assets/approved/brand/rail-rye-ivory-logo.png';
   img.alt='Rail & Rye official horseshoe emblem';
   img.className='rr-purchase-brand-logo';
   img.loading='lazy';img.decoding='async';cover.append(img);
   const meta=el('div','rr-purchase-meta');
   if(p.track)meta.append(el('span','rr-racecards-meta-track',p.track));
   if(p.track&&p.race_date)meta.append(el('span','rr-racecards-meta-divider','·'));
   if(p.race_date)meta.append(el('span','rr-racecards-meta-date',dateLabel(p.race_date)));
   if(!meta.childNodes.length)meta.textContent='Rail & Rye Race Card';
   const copy=el('div','rr-purchase-copy');
   const bundle=p.kind==='bundle';
   if(bundle){
    const count=Number.isInteger(p.bundle_count)&&p.bundle_count>0?p.bundle_count:(Array.isArray(p.included_titles)?p.included_titles.length:0);
    copy.append(el('span','rr-racecards-product-kind','BUNDLE · '+count+' PDFs'));
   }
   copy.append(el('h3','rr-purchase-title',p.title||'Race Card'));
   if(bundle&&Array.isArray(p.included_titles)&&p.included_titles.length){
    const detail=el('details','rr-racecards-bundle-details');
    detail.append(el('summary','rr-racecards-bundle-summary','Included PDFs · View titles'));
    const list=el('ul','rr-racecards-bundle-list');
    for(const title of p.included_titles){
     if(typeof title==='string'&&title.trim())list.append(el('li','',title.trim()));
    }
    detail.append(list);copy.append(detail);
   }
   const free=!bundle&&Number(p.price_cents)===0;
   copy.append(el('div','rr-purchase-price',free?'FREE':money(p.price_cents)));
   copy.append(el('span','rr-racecards-access',free?'Direct PDF download · No checkout':bundle?'7-day access · 5 downloads per PDF':'7-day access · Up to 5 downloads'));
   if(window.RRShare)copy.append(window.RRShare.button({title:p.title||'Race Card',text:p.description||'Rail & Rye race-day research and analysis.',url:'/store/#edition-'+encodeURIComponent(p.id),compact:true}));
   const buyText=free?'Download free PDF':ready?(live?(bundle?'Purchase bundle':'Purchase PDF'):'Test purchase'):'Unavailable';
   const buy=el('button','rr-purchase-buy',buyText);
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
    }catch(error){status.textContent=error.message||'Checkout could not be started.';buy.disabled=false;buy.textContent=old;}
   });
   card.append(meta,cover,copy,buy);products.append(card);
  }
 }catch(error){status.textContent='Unable to load Race Cards right now. The Publication Desk is still available.';}
})();
})();
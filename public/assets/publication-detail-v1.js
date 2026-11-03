/* Publication hero rail: latest category edition uses the existing public catalog and checkout. */
(()=>{'use strict';
const category=document.body.dataset.publicationCategory;
const latestGrid=document.getElementById('rr-pub-latest');
const latestStatus=document.getElementById('rr-pub-latest-status');
const recentList=document.getElementById('rr-pub-recent');
const grid=document.getElementById('rr-pub-products');
const status=document.getElementById('rr-pub-status');
if(!category||!latestGrid||!latestStatus)return;
const txt=(tag,value,cls)=>{const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(value??'');return el};
const price=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(cents)||0)/100);
const editionDate=value=>{
 const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!match)return '';
 return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})
  .format(new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))))
};
const displayTitle=value=>{
 const title=String(value||category).trim();
 if(!title||title!==title.toLocaleUpperCase('en-US'))return title||category;
 return title.toLocaleLowerCase('en-US').replace(/(^|[\s:([{—–-])([a-z])/g,(_,prefix,letter)=>prefix+letter.toLocaleUpperCase('en-US'))
};
const categoryProducts=p=>p.kind==='bundle'&&Array.isArray(p.included_products)?p.included_products.filter(x=>x.category===category):[];
const effectiveRaceDate=p=>{
 const dates=categoryProducts(p).map(x=>String(x.race_date||'')).filter(Boolean).sort();
 return dates.at(-1)||String(p.race_date||'');
};
const latestMeta=p=>{
 const parts=[],pageCategory=String(category||'').trim(),children=categoryProducts(p);
 const track=String(p.track||[...new Set(children.map(x=>String(x.track||'').trim()).filter(Boolean))].join(', ')||'').trim();
 if(pageCategory)parts.push(pageCategory);
 const date=editionDate(effectiveRaceDate(p));
 if(date)parts.push(date);
 if(track&&!/^(all|any)$/i.test(track)&&track.toLocaleLowerCase('en-US')!==pageCategory.toLocaleLowerCase('en-US'))parts.push(track);
 return parts.join(' · ')
};
const freeProduct=p=>p.kind==='single'&&Number(p.price_cents)===0;
const formatExpiry=value=>{if(!value)return '';const date=new Date(String(value).replace(' ','T')+'Z');if(Number.isNaN(date.getTime()))return '';date.setTime(date.getTime()-1000);return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium'}).format(date);};
const accessNote=p=>p.kind==='bundle'?'Each included PDF is removed at midnight Eastern two calendar days after its racing date.':('Available through '+(formatExpiry(p.pdf_expires_at)||'the day before the two-day racing-date cutoff')+'.');
const editionHref=p=>'/store/?category='+encodeURIComponent(category)+'#edition-'+encodeURIComponent(p.id);
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
 const card=document.createElement('article');card.className='rr-glass-purchase-card rr-publication-latest-card';
 // The whole edition panel opens that exact edition on the Publication Desk.
 // Its separate purchase button remains an explicit checkout action.
 const editionLink=document.createElement('a');editionLink.className='rr-pub-edition-overlay';
 editionLink.href=editionHref(p);editionLink.setAttribute('aria-label','View '+displayTitle(p.title||category)+' in the Publication Desk');
 editionLink.textContent='View edition';
 const cover=document.createElement('div');cover.className='rr-purchase-brand-mark';
 const logo=document.createElement('img');logo.src='/assets/approved/brand/rail-rye-ivory-logo.png';logo.alt='Rail & Rye official horseshoe emblem';logo.className='rr-purchase-brand-logo';logo.loading='lazy';logo.decoding='async';cover.append(logo);
 const copy=document.createElement('div');copy.className='rr-purchase-copy';
 const meta=latestMeta(p);
 if(meta)copy.append(txt('div',meta,'rr-purchase-meta'));
 const isBundle=p.kind==='bundle';
 const includedTitles=Array.isArray(p.included_titles)?p.included_titles.filter(title=>typeof title==='string'&&title.trim()):[];
 if(isBundle){
  const count=Number.isInteger(p.bundle_count)&&p.bundle_count>0?p.bundle_count:includedTitles.length;
  copy.append(txt('span','BUNDLE · '+count+' PDF'+(count===1?'':'s'),'rr-racecards-product-kind'));
 }
 copy.append(txt('h3',displayTitle(p.title||category),'rr-purchase-title'));
 if(isBundle&&includedTitles.length){
  const details=document.createElement('details');details.className='rr-racecards-bundle-details';
  details.append(txt('summary','Included PDFs · View titles','rr-racecards-bundle-summary'));
  const list=document.createElement('ul');list.className='rr-racecards-bundle-list';
  for(const title of includedTitles)list.append(txt('li',title.trim()));
  details.append(list);copy.append(details);
 }
 copy.append(txt('p',p.description||'Digital racing publication.','rr-purchase-description'));
 copy.append(txt('p',accessNote(p),'rr-store-access-terms'));
 copy.append(txt('div',freeProduct(p)?'FREE':price(p.price_cents),'rr-purchase-price'));
 const actions=document.createElement('div');actions.className='rr-purchase-actions';
 actions.append(makePurchaseButton(p,data,onError));
 if(window.RRShare)actions.append(window.RRShare.button({title:displayTitle(p.title||category),text:p.description||'Rail & Rye digital racing publication.',url:'/store/#edition-'+encodeURIComponent(p.id),compact:true}));
 card.append(cover,copy,actions,editionLink);
 return card
};
const renderRecent=products=>{
 if(!recentList)return;
 recentList.replaceChildren();
 const other=products.slice(1,5);
 if(!other.length){recentList.hidden=true;return;}
 recentList.hidden=false;
 recentList.append(txt('div','RECENT EDITIONS','rr-pub-recent-kicker'));
 for(const item of other){
  const row=document.createElement('div');row.className='rr-pub-recent-row';
  const link=document.createElement('a');link.className='rr-pub-recent-link';
  link.href=editionHref(item);
  const label=txt('span',displayTitle(item.title||category),'rr-pub-recent-title');
  const meta=txt('small',latestMeta(item)||'View edition','rr-pub-recent-meta');
  link.append(label,meta);row.append(link);
  if(window.RRShare)row.append(window.RRShare.button({title:displayTitle(item.title||category),text:item.description||'Rail & Rye digital racing publication.',url:'/store/#edition-'+encodeURIComponent(item.id),compact:true,iconOnly:true}));
  recentList.append(row);
 }
};
const makeEditionCard=(p,data,onError)=>{
 const card=document.createElement('article');card.className='rr-edition-card';
 const info=document.createElement('div');info.className='rr-edition-info';
 const meta=[p.race_date,p.track].filter(Boolean).join(' · ');
 if(meta)info.append(txt('span',meta,'rr-edition-meta'));
 info.append(txt('h3',p.title||category));
 if(p.description)info.append(txt('p',p.description,'rr-edition-description'));
 info.append(txt('p',accessNote(p),'rr-store-access-terms'));
 if(window.RRShare)info.append(window.RRShare.button({title:displayTitle(p.title||category),text:p.description||'Rail & Rye digital racing publication.',url:'/store/#edition-'+encodeURIComponent(p.id),compact:true}));
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
   .filter(p=>Array.isArray(p.categories)?p.categories.includes(category):p.category===category)
   .sort((a,b)=>effectiveRaceDate(b).localeCompare(effectiveRaceDate(a)));
  if(!products.length){
   if(recentList){recentList.replaceChildren();recentList.hidden=true;}
   latestStatus.textContent='No editions are currently published in this collection.';
   if(status)status.textContent='No editions are currently published in this collection.';
   return
  }
  latestStatus.textContent=products.length===1?'1 edition available':products.length+' editions available · latest shown';
  const showError=error=>{latestStatus.textContent=error.message||'Checkout could not be started.';latestStatus.classList.add('rr-status-error')};
  latestGrid.replaceChildren(makeGlassCard(products[0],data,showError));
  renderRecent(products);
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
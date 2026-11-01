(()=>{'use strict';
const SVG_NS='http://www.w3.org/2000/svg';
function absoluteUrl(value){
 const url=new URL(value||window.location.href,window.location.origin);
 if(url.origin!==window.location.origin)throw Error('Only Rail & Rye pages can be shared.');
 return url.href;
}
function closeAll(except){
 document.querySelectorAll('.rr-share-control.is-open').forEach(control=>{
  if(control===except)return;
  control.classList.remove('is-open');
  const button=control.querySelector('.rr-share-button');
  const menu=control.querySelector('.rr-share-menu');
  if(button)button.setAttribute('aria-expanded','false');
  if(menu)menu.hidden=true;
 });
}
document.addEventListener('click',event=>{if(!event.target.closest('.rr-share-control'))closeAll();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAll();});
function button(options){
 options=options||{};
 const title=String(options.title||'Rail & Rye Racing').trim();
 const summary=String(options.text||'').trim();
 const url=absoluteUrl(options.url);
 const label=String(options.label||'Share');
 const control=document.createElement('span');
 control.className='rr-share-control'+(options.compact?' rr-share-control--compact':'')+(options.iconOnly?' rr-share-control--icon-only':'');
 control.addEventListener('click',event=>event.stopPropagation());
 const trigger=document.createElement('button');
 trigger.type='button';trigger.className='rr-share-button';
 trigger.setAttribute('aria-label','Share '+title);
 trigger.setAttribute('aria-haspopup','true');trigger.setAttribute('aria-expanded','false');
 trigger.title='Share '+title;
 const icon=document.createElementNS(SVG_NS,'svg');
 icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
 const lines=document.createElementNS(SVG_NS,'path');
 lines.setAttribute('d','M8.5 12.2 15.7 7.8M8.5 11.8l7.2 4.4');lines.setAttribute('fill','none');lines.setAttribute('stroke','currentColor');lines.setAttribute('stroke-width','1.8');lines.setAttribute('stroke-linecap','round');
 const a=document.createElementNS(SVG_NS,'circle');a.setAttribute('cx','6');a.setAttribute('cy','12');a.setAttribute('r','2.6');a.setAttribute('fill','none');a.setAttribute('stroke','currentColor');a.setAttribute('stroke-width','1.8');
 const b=document.createElementNS(SVG_NS,'circle');b.setAttribute('cx','18');b.setAttribute('cy','6');b.setAttribute('r','2.6');b.setAttribute('fill','none');b.setAttribute('stroke','currentColor');b.setAttribute('stroke-width','1.8');
 const c=document.createElementNS(SVG_NS,'circle');c.setAttribute('cx','18');c.setAttribute('cy','18');c.setAttribute('r','2.6');c.setAttribute('fill','none');c.setAttribute('stroke','currentColor');c.setAttribute('stroke-width','1.8');
 icon.append(lines,a,b,c);trigger.append(icon);
 if(!options.iconOnly){const textNode=document.createElement('span');textNode.textContent=label;trigger.append(textNode);}
 const menu=document.createElement('span');menu.className='rr-share-menu';menu.hidden=true;
 menu.setAttribute('role','group');menu.setAttribute('aria-label','Share options for '+title);
 const emailBody=(summary?summary+'\n\n':'')+'View on Rail & Rye Racing:\n'+url;
 const links=[
  ['Email','mailto:?subject='+encodeURIComponent(title+' | Rail & Rye Racing')+'&body='+encodeURIComponent(emailBody),''],
  ['Facebook','https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url),'_blank'],
  ['X','https://twitter.com/intent/tweet?text='+encodeURIComponent(title+' | Rail & Rye Racing')+'&url='+encodeURIComponent(url),'_blank']
 ];
 for(const item of links){
  const link=document.createElement('a');link.className='rr-share-option';link.href=item[1];link.textContent=item[0];
  if(item[2]){link.target=item[2];link.rel='noopener noreferrer';}
  menu.append(link);
 }
 const copy=document.createElement('button');copy.type='button';copy.className='rr-share-option rr-share-copy';copy.textContent='Copy link';
 const status=document.createElement('span');status.className='rr-share-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const help=document.createElement('span');help.className='rr-share-help';help.textContent='Copy the link to share in Instagram or another app.';
 async function copyUrl(){
  try{
   if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(url);
   else{
    const field=document.createElement('textarea');field.value=url;field.setAttribute('readonly','');
    field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();
    let copied=false;try{copied=document.execCommand('copy');}finally{field.remove();}
    if(!copied)throw Error('Clipboard unavailable');
   }
   status.textContent='Link copied.';
  }catch(error){status.textContent='Copy unavailable. Select the page address to share it.';}
 }
 copy.addEventListener('click',event=>{event.stopPropagation();copyUrl();});
 menu.append(copy,status,help);control.append(trigger,menu);
 function showMenu(){
  closeAll(control);control.classList.add('is-open');menu.hidden=false;trigger.setAttribute('aria-expanded','true');
 }
 trigger.addEventListener('click',async event=>{
  event.preventDefault();event.stopPropagation();
  if(typeof navigator.share==='function'){
   try{
    await navigator.share({title:title,text:summary||title,url:url});
    status.textContent='Shared.';
   }catch(error){
    if(error&&error.name==='AbortError')return;
    showMenu();
   }
  }else if(menu.hidden)showMenu();
  else{menu.hidden=true;control.classList.remove('is-open');trigger.setAttribute('aria-expanded','false');}
 });
 return control;
}
window.RRShare={button};
})();
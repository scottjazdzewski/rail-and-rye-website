// Homepage Race-Day Pulse. Public data ONLY from /api/race-day-pulse.
(function(){
  'use strict';
  const shell=document.getElementById('rr-pulse');
  const rail=document.getElementById('rr-pulse-rail');
  const status=document.getElementById('rr-pulse-count');
  const prev=document.getElementById('rr-pulse-prev'),next=document.getElementById('rr-pulse-next');
  if(!shell||!rail||!prev||!next)return;
  let selected=0,events=[],paused=false,revision='',pending=false;
  const $=(tag,className,text)=>{
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!==undefined)el.textContent=text;
    return el;
  };
  function chip(number,scratched=false){
    const el=$('span','rr-pulse-saddle'+(scratched?' rr-pulse-saddle--scratch':''));
    const n=String(number||'').trim().toUpperCase();
    const parsed=/^(\d{1,2})([A-Z]?)$/.exec(n);
    const value=parsed?Number(parsed[1]):0;
    if(value>=1&&value<=20){
      const img=$('img');img.src='/assets/approved/saddlecloths/'+value+'.png';
      img.alt='Saddlecloth '+n;img.width=32;img.height=32;img.loading='lazy';
      el.append(img);
      if(parsed[2])el.append($('span','rr-pulse-suffix',parsed[2]));
    }else{
      el.textContent=n||'—';el.classList.add('rr-pulse-saddle-fallback');
    }
    return el;
  }
  const pulseUrl=item=>'/pulse/'+encodeURIComponent(item.date)+'/'+encodeURIComponent(item.id);
  const textForShare=item=>'Rail & Rye Race-Day Pulse: '+item.track+' Race '+item.race_number+'. '+item.message;
  async function copyLink(item,notice){
    try{await navigator.clipboard.writeText(location.origin+pulseUrl(item));notice.textContent='Link copied';}
    catch{notice.textContent='Copy unavailable; select the link in your browser';}
  }
  function downloadBlob(blob,filename){
    const uri=URL.createObjectURL(blob),link=$('a');link.href=uri;link.download=filename;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(uri),1500);
  }
  function wrap(ctx,text,x,y,maxWidth,lineHeight,maxLines){
    const words=text.split(/\s+/);let line='',count=0;
    for(const word of words){
      const candidate=line?line+' '+word:word;
      if(ctx.measureText(candidate).width>maxWidth&&line){
        ctx.fillText(line,x,y+lineHeight*count++);
        line=word;
        if(count>=maxLines)return;
      }else line=candidate;
    }
    if(line&&count<maxLines)ctx.fillText(line,x,y+lineHeight*count);
  }
  async function saveImage(item,button){
    const label=button.textContent;button.disabled=true;button.textContent='Preparing image…';
    try{
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;
      const c=canvas.getContext('2d');if(!c)throw Error('Canvas unsupported');
      c.fillStyle='#071a2c';c.fillRect(0,0,1200,675);
      c.fillStyle='#c49b59';c.fillRect(64,90,1072,3);
      const logo=new Image();logo.src='/assets/approved/brand/rail-rye-ivory-logo.png';
      try{await logo.decode();c.drawImage(logo,64,21,60,60);}catch{}
      c.fillStyle='#e0b66b';c.font='700 24px Georgia,serif';c.fillText('RAIL & RYE   /   RACE-DAY PULSE',141,60);
      c.fillStyle='#ffffff';c.font='700 39px Georgia,serif';c.fillText(item.track+' · Race '+item.race_number,64,148);
      c.font='700 33px system-ui,sans-serif';c.fillText(item.headline,64,204);
      const badge=chip(item.chip).querySelector('img');
      if(badge){try{await badge.decode();c.drawImage(badge,67,241,104,104);}catch{}}
      c.font='26px system-ui,sans-serif';c.fillStyle='#eef1f4';
      wrap(c,item.message,195,272,925,36,3);
      const scratches=Array.isArray(item.scratches)?item.scratches:[];
      if(scratches.length){
        c.fillStyle='#ddb5b5';c.font='700 18px system-ui,sans-serif';
        c.fillText('SCRATCHED',64,376);
        let sx=187;
        for(const scratch of scratches.slice(0,3)){
          c.fillStyle='#fff';c.fillRect(sx,350,31,31);
          const scratchArt=chip(scratch.program,true).querySelector('img');
          if(scratchArt){
            try{await scratchArt.decode();c.drawImage(scratchArt,sx,350,31,31);}catch{}
          }
          c.fillStyle='#eef1f4';c.font='16px system-ui,sans-serif';
          const printed=String(scratch.horse||'#'+scratch.program).slice(0,17);
          c.fillText(printed,sx+38,372,220);
          sx+=310;
        }
        if(scratches.length>3){
          c.fillStyle='#ddb5b5';c.font='14px system-ui,sans-serif';
          c.fillText('+'+(scratches.length-3)+' additional scratches',900,394);
        }
      }
      c.fillStyle='#15354d';c.fillRect(64,410,1072,119);
      c.fillStyle='#d2ac6e';c.fillRect(64,410,7,119);
      c.fillStyle='#f5f1e9';c.font='700 29px Georgia,serif';
      c.fillText('SEE THE COMPLETE RACE CARD',94,458);
      c.fillStyle='#c7d5e2';c.font='22px system-ui,sans-serif';
      c.fillText('Full-field analysis  ·  Win probabilities  ·  F4 finish projections',94,500);
      c.fillStyle='#c49b59';c.fillRect(64,562,1072,2);
      c.font='23px system-ui,sans-serif';c.fillText('railandryeracing.com',64,606);
      c.fillStyle='#9caec2';c.font='19px system-ui,sans-serif';c.fillText('Model projections · Not guarantees',758,606);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('Image unavailable');
      const file=new File([blob],'rail-rye-'+item.id+'.png',{type:'image/png'});
      if(navigator.share&&navigator.canShare?.({files:[file]})){
        try{await navigator.share({files:[file],title:'Rail & Rye Race-Day Pulse'});return;}
        catch(e){if(e.name==='AbortError')return;}
      }
      downloadBlob(blob,file.name);
    }catch(e){button.textContent='Could not save image';setTimeout(()=>button.textContent=label,1800);}
    finally{button.disabled=false;if(button.textContent==='Preparing image…')button.textContent=label;}
  }
  function shareTools(item){
    const group=$('div','rr-pulse-share-group');
    const share=$('button','rr-pulse-tool','Share');
    share.type='button';share.setAttribute('aria-label','Share '+item.track+' Race '+item.race_number);
    const menu=$('div','rr-pulse-menu');menu.hidden=true;
    const copy=$('button','','Copy link');copy.type='button';
    const post=$('a','','Share to X');post.href='https://x.com/intent/tweet?text='+encodeURIComponent(textForShare(item))+'&url='+encodeURIComponent(location.origin+pulseUrl(item));post.target='_blank';post.rel='noopener noreferrer';
    const image=$('button','','Save image');image.type='button';
    const notice=$('span','rr-pulse-menu-status');notice.setAttribute('role','status');
    copy.addEventListener('click',()=>copyLink(item,notice));
    image.addEventListener('click',()=>saveImage(item,image));
    menu.append(copy,post,image,notice);
    share.addEventListener('click',async()=>{
      if(navigator.share){
        try{await navigator.share({title:item.track+' Race '+item.race_number,text:textForShare(item),url:location.origin+pulseUrl(item)});return;}
        catch(e){if(e.name==='AbortError')return;}
      }
      menu.hidden=!menu.hidden;share.setAttribute('aria-expanded',String(!menu.hidden));
    });
    share.setAttribute('aria-expanded','false');
    group.append(share,menu);
    return group;
  }
  function buildCard(item){
    const article=$('article','rr-pulse-item');
    article.id='rr-pulse-'+item.id;
    article.setAttribute('aria-label',item.track+', Race '+item.race_number);
    const content=$('div','rr-pulse-item-layout');
    content.append(chip(item.chip));
    const body=$('div','rr-pulse-copy');
    body.append($('p','rr-pulse-track',item.track.toUpperCase()+' · RACE '+item.race_number),
      $('h3','rr-pulse-headline',item.headline));
    if(item.horse)body.append($('p','rr-pulse-affected',item.horse+' · #'+item.chip));
    body.append($('p','rr-pulse-message',item.message));
    content.append(body);article.append(content);
    if(Array.isArray(item.scratches)&&item.scratches.length){
      const row=$('div','rr-pulse-scratch-list');
      row.append($('span','rr-pulse-scratch-label','SCRATCHED'));
      for(const scratch of item.scratches){
        const identity=$('span','rr-pulse-scratch-identity');
        identity.append(chip(scratch.program,true),$('span','rr-pulse-scratch-name',scratch.horse||'#'+scratch.program));
        row.append(identity);
      }
      article.append(row);
    }
    const footer=$('div','rr-pulse-item-footer');
    const links=$('div','rr-pulse-links');
    const original=$('a','rr-pulse-story-link','Open insight');original.href=pulseUrl(item);
    const paid=$('a','rr-pulse-paid-link','Full Race Card');paid.href=item.hub_url;
    links.append(original,paid);footer.append(links,shareTools(item));article.append(footer);
    return article;
  }
  function buildCTA(){
    const item=$('div','rr-pulse-item rr-pulse-cta');
    item.append($('p','rr-pulse-track','THE COMPLETE PICTURE'),
      $('h3','rr-pulse-headline','More than a single insight.'),
      $('p','rr-pulse-message','Explore today’s complete race projections, Pick Tickets, Longshot Radar and Target List.'));
    const a=$('a','rr-pulse-cta-link','Explore Intelligence Hub');a.href='/store/';
    item.append(a);return item;
  }
  function scrollToIndex(index,behavior='smooth'){
    if(!rail.children.length)return;
    selected=Math.max(0,Math.min(index,rail.children.length-1));
    const el=rail.children[selected];
    rail.scrollTo({left:el.offsetLeft-rail.offsetLeft,behavior});
    prev.disabled=selected===0;next.disabled=selected===rail.children.length-1;
  }
  prev.addEventListener('click',()=>scrollToIndex(selected-1));
  next.addEventListener('click',()=>scrollToIndex(selected+1));
  shell.addEventListener('mouseenter',()=>paused=true);
  shell.addEventListener('mouseleave',()=>paused=false);
  shell.addEventListener('focusin',()=>paused=true);
  shell.addEventListener('focusout',()=>paused=false);
  shell.addEventListener('touchstart',()=>paused=true,{passive:true});
  shell.addEventListener('touchend',()=>paused=false,{passive:true});
  rail.addEventListener('scroll',()=>{
    let best=0,distance=Infinity;
    [...rail.children].forEach((el,i)=>{const x=Math.abs((el.offsetLeft-rail.offsetLeft)-rail.scrollLeft);if(x<distance){best=i;distance=x;}});
    selected=best;prev.disabled=selected===0;next.disabled=selected===rail.children.length-1;
  },{passive:true});
  async function load(){
    if(pending)return;pending=true;
    try{
      const response=await fetch('/api/race-day-pulse',{cache:'no-store'});
      if(!response.ok)throw Error('Feed unavailable');
      const data=await response.json(),raw=Array.isArray(data.items)?data.items:[];
      const valid=raw.filter(x=>x&&typeof x.id==='string'&&/^[a-z0-9-]+$/.test(x.id)&&
        typeof x.message==='string'&&typeof x.track==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date))
        .slice(0,6);
      if(!valid.length){shell.hidden=true;events=[];revision='';return;}
      const key=JSON.stringify(valid);
      if(key===revision)return;
      revision=key;events=valid;rail.replaceChildren(...valid.map(buildCard),buildCTA());
      status.textContent=valid.length+' verified '+(valid.length===1?'insight':'insights')+' today';
      shell.hidden=false;scrollToIndex(0,'instant');
      const focus=new URL(location.href).searchParams.get('pulse');
      const idx=valid.findIndex(item=>item.id===focus);
      if(idx>=0)scrollToIndex(idx,'instant');
    }catch{if(!events.length)shell.hidden=true;}
    finally{pending=false;}
  }
  load();setInterval(load,60000);
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    setInterval(()=>{if(!shell.hidden&&!paused&&!document.hidden&&rail.children.length>1)scrollToIndex((selected+1)%rail.children.length);},6500);
  }
})();
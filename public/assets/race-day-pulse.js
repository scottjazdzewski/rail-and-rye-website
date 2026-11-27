// Homepage Race-Day Pulse. Public data ONLY from /api/race-day-pulse.
(function(){
  'use strict';
  const shell=document.getElementById('rr-pulse');
  const rail=document.getElementById('rr-pulse-rail');
  const status=document.getElementById('rr-pulse-count');
  // Use the unused right side of the established desktop hero, but never
  // let Pulse add a tall full-width bar or displace the mobile hero.
  const homepageHero=document.querySelector('.heritage-hero');
  const desktopMedia=matchMedia('(min-width:1121px)');
  function placePulse(){
    if(!homepageHero)return;
    if(desktopMedia.matches){if(shell.parentElement!==homepageHero)homepageHero.append(shell);}
    else if(shell.previousElementSibling!==homepageHero)homepageHero.after(shell);
  }
  placePulse();desktopMedia.addEventListener?.('change',placePulse);
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
  const titleCaseWords=value=>String(value||'').replace(/(^|[\s-])([a-z])/gi,(_,separator,letter)=>separator+letter.toUpperCase());
  const ordinal=n=>{const x=Number(n);if(!Number.isInteger(x)||x<1)return 'Race '+String(n);return x+(x%100>=11&&x%100<=13?'th':({1:'st',2:'nd',3:'rd'}[x%10]||'th'));};
  const raceLabel=item=>item.track+' · '+ordinal(item.race_number);
  const pulseUrl=item=>'/pulse/'+encodeURIComponent(item.date)+'/'+encodeURIComponent(item.id);
  const textForShare=item=>'Rail & Rye Race-Day Pulse: '+raceLabel(item)+'. '+item.message;
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
      c.fillStyle='#ffffff';c.font='700 39px Georgia,serif';c.fillText(raceLabel(item),64,148);
      c.font='700 33px system-ui,sans-serif';c.fillText(item.horse||titleCaseWords(item.headline),64,204);
      drawSignalMedallion(c,item,1040,112,82);
      // Live-site chip alpha fix applies to the shared graphic too.
      // Original PNG is drawn on a solid opaque white plate, never over navy.
      c.fillStyle='#fff';c.fillRect(67,241,104,104);
      const badge=chip(item.chip).querySelector('img');
      if(badge){try{await badge.decode();c.drawImage(badge,67,241,104,104);}catch{}}
      c.font='26px system-ui,sans-serif';c.fillStyle='#eef1f4';
      wrap(c,item.message,195,254,925,33,3);
      const scratches=Array.isArray(item.scratches)?item.scratches:[];
      if(scratches.length){
        c.fillStyle='#ddb5b5';c.font='700 18px system-ui,sans-serif';
        c.fillText('SCRATCHED',64,376);
        let sx=187;
        for(const scratch of scratches){
          if(sx+31>1135)break;
          c.fillStyle='#fff';c.fillRect(sx,350,31,31);
          const scratchArt=chip(scratch.program,true).querySelector('img');
          if(scratchArt){try{await scratchArt.decode();c.drawImage(scratchArt,sx,350,31,31);}catch{}}
          const suffix=/^\d{1,2}([A-Z])$/.exec(String(scratch.program||'').toUpperCase());
          if(suffix){
            c.fillStyle='#102d53';c.fillRect(sx+20,369,12,12);
            c.fillStyle='#ffffff';c.font='800 10px system-ui,sans-serif';
            c.fillText(suffix[1],sx+22,379);
          }
          sx+=46;
        }
        const visible=Math.min(scratches.length,Math.floor((1135-187)/46));
        if(scratches.length>visible){
          c.fillStyle='#ddb5b5';c.font='14px system-ui,sans-serif';
          c.fillText('+'+(scratches.length-visible)+' More',1030,394);
        }
      }
      c.fillStyle='#15354d';c.fillRect(64,410,1072,119);
      c.fillStyle='#d2ac6e';c.fillRect(64,410,7,119);
      c.fillStyle='#f5f1e9';c.font='700 29px Georgia,serif';
      c.fillText('SEE THE COMPLETE RACE CARD',94,458);
      c.fillStyle='#c7d5e2';c.font='22px system-ui,sans-serif';
      c.fillText('Full-Field Analysis  ·  Win Probabilities  ·  Full Finishing Order Projections',94,500);
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
  async function saveInstagram(item,button){
    const original=button.textContent;button.disabled=true;
    try{
      const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
      const c=canvas.getContext('2d');if(!c)throw Error('Canvas unsupported');
      const bg=c.createLinearGradient(0,0,1080,1350);bg.addColorStop(0,'#1b3b52');bg.addColorStop(.43,'#10283d');bg.addColorStop(1,'#061725');c.fillStyle=bg;c.fillRect(0,0,1080,1350);
      // Quiet engraved line texture; does not compete with the figures.
      c.save();c.globalAlpha=.07;c.strokeStyle='#d9bc82';c.lineWidth=1;for(let i=-1350;i<1080;i+=26){c.beginPath();c.moveTo(i,0);c.lineTo(i+1350,1350);c.stroke();}c.restore();
      c.strokeStyle='#957748';c.lineWidth=2;c.beginPath();c.roundRect(30,30,1020,1290,28);c.stroke();
      c.fillStyle='#c49b59';c.fillRect(60,155,960,3);c.fillRect(60,1200,960,3);
      const logo=new Image();logo.src='/assets/approved/brand/rail-rye-ivory-logo.png';try{await logo.decode();c.drawImage(logo,62,45,90,90);}catch{}
      c.fillStyle='#e0b66b';c.font='700 35px Georgia';c.fillText('RAIL & RYE RACING',180,82);c.font='26px system-ui';c.fillText('RACE DAY PULSE',180,121);
      c.font='700 30px system-ui';c.fillText(raceLabel(item).toUpperCase(),60,225);
      drawSignalMedallion(c,item,920,185,92);
      const art=chip(item.chip).querySelector('img');c.save();c.beginPath();c.roundRect(60,357,104,104,15);c.clip();c.fillStyle='#fff';c.fillRect(60,357,104,104);if(art){try{await art.decode();c.drawImage(art,60,357,104,104);}catch{}}c.restore();
      c.fillStyle='#fff';c.font='700 52px Georgia';wrap(c,item.horse||item.headline,190,408,820,60,2);
      const m=metricText(item);
      if(m){c.fillStyle='#081b2b';c.beginPath();c.roundRect(50,495,980,225,20);c.fill();c.strokeStyle='#927748';c.stroke();c.fillStyle='#d8be89';c.font='700 27px system-ui';c.fillText(m.label,80,540);c.fillStyle='#b4c0ca';c.font='700 89px system-ui';c.fillText(m.before,60,655);c.fillStyle='#e0b66b';c.fillText('→',435,655);c.fillStyle=m.up?'#73d2a2':'#f2ab9c';c.fillText(m.after,575,655);for(const [px,val,col] of [[80,item.metric.before,'#a6b5c4'],[575,item.metric.after,m.up?'#73d2a2':'#f2ab9c']]){c.fillStyle='#354957';c.beginPath();c.roundRect(px,681,330,8,4);c.fill();if(val>0){c.fillStyle=col;c.beginPath();c.roundRect(px,681,330*val/100,8,4);c.fill();}}}
      c.fillStyle='#f2f2f2';c.font='32px system-ui';wrap(c,item.short_message||item.message,60,755,960,44,4);
      const scratches=Array.isArray(item.scratches)?item.scratches:[];
      if(scratches.length){c.fillStyle='#d8be89';c.font='700 25px system-ui';c.fillText('SCRATCHES',60,980);let px=60;for(const scratch of scratches.slice(0,20)){if(px+42>1020)break;const img=chip(scratch.program,true).querySelector('img');c.fillStyle='#fff';c.fillRect(px,1005,42,42);if(img){try{await img.decode();c.drawImage(img,px,1005,42,42);}catch{}}px+=48;}}
      c.fillStyle='#e0b66b';c.font='700 28px system-ui';c.fillText('railandryeracing.com',60,1250);
      c.fillStyle='#b4c0ca';c.font='24px system-ui';c.fillText(item.id.startsWith('demo-')?'DESIGN PREVIEW · FICTIONAL DATA':'Model projections · Not guarantees',60,1300);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Image unavailable');const file=new File([blob],'rail-rye-instagram-'+item.id+'.png',{type:'image/png'});
      if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Race Day Pulse'});return;}catch(e){if(e.name==='AbortError')return;}}
      downloadBlob(blob,file.name);
    }catch{button.textContent='Could not save image';return;}finally{button.disabled=false;}
    button.textContent=original;
  }
  function shareTools(item){
    const group=$('div','rr-pulse-share-group');
    const share=$('button','rr-pulse-tool','Share');
    share.type='button';share.setAttribute('aria-label','Share '+raceLabel(item));
    const menu=$('div','rr-pulse-menu');menu.hidden=true;
    const copy=$('button','','Copy link');copy.type='button';
    const post=$('a','','Share to X');post.href='https://x.com/intent/tweet?text='+encodeURIComponent(textForShare(item))+'&url='+encodeURIComponent(location.origin+pulseUrl(item));post.target='_blank';post.rel='noopener noreferrer';
    const image=$('button','','Save image');image.type='button';
    const instagram=$('button','','Instagram image (4:5)');instagram.type='button';
    instagram.addEventListener('click',()=>saveInstagram(item,instagram));
    const notice=$('span','rr-pulse-menu-status');notice.setAttribute('role','status');
    copy.addEventListener('click',()=>copyLink(item,notice));
    image.addEventListener('click',()=>saveImage(item,image));
    menu.append(copy,post,image,instagram,notice);
    if(navigator.share){
      const native=$('button','','Share link');native.type='button';
      native.addEventListener('click',async()=>{try{await navigator.share({title:raceLabel(item),text:textForShare(item),url:location.origin+pulseUrl(item)});}catch{}});
      menu.prepend(native);
    }
    share.addEventListener('click',()=>{menu.hidden=!menu.hidden;share.setAttribute('aria-expanded',String(!menu.hidden));});
    share.setAttribute('aria-expanded','false');
    group.append(share,menu);
    return group;
  }
  function signal(item){
    if(item.kind==='NEW_FAVORITE'||item.kind==='FAVORITE_SCRATCHED')return 'NEW FAVORITE';
    if(item.kind==='F4_SHIFT')return 'PROJECTION MOVE';
    if(item.kind==='PACE_ADVANTAGE')return 'PACE ADVANTAGE';
    if(item.kind==='WIN_SHIFT'&&item.metric&&item.metric.after>item.metric.before)return 'WIN PROBABILITY UP';
    if(item.kind==='WIN_SHIFT'&&item.metric&&item.metric.after<item.metric.before)return 'WIN PROBABILITY DOWN';
    return 'SCRATCH IMPACT';
  }
  // Pulse category icons share a restrained, consistent gold line-art system.
  function signalType(item){
    if(item.kind==='NEW_FAVORITE'||item.kind==='FAVORITE_SCRATCHED')return 'crown';
    if(item.kind==='F4_SHIFT')return 'order';
    if(item.kind==='PACE_ADVANTAGE')return 'pace';
    if(item.kind==='WIN_SHIFT')return item.metric?.after<item.metric?.before?'down':'up';
    return 'scratch';
  }
  const signalPaths={
    crown:'M3 6l4 4 5-7 5 7 4-4-2 12H5L3 6z M5 21h14',
    order:'M7 3v17 M3 7l4-4 4 4 M17 21V4 M13 17l4 4 4-4',
    up:'M3 17l6-6 4 4 8-9 M15 6h6v6',
    down:'M3 7l6 6 4-4 8 9 M15 18h6v-6',
    pace:'M13 2L4 14h7l-1 8 10-12h-7l1-8z',
    scratch:'M5 12h14 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18'
  };
  function signalIcon(item){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),p=document.createElementNS(ns,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','rr-pulse-category-icon');
    p.setAttribute('d',signalPaths[signalType(item)]);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.8');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');svg.append(p);return svg;
  }
  function drawSignalMedallion(c,item,x,y,size){
    c.save();c.translate(x,y);c.fillStyle='#10283d';c.strokeStyle='#d5b374';c.lineWidth=2;
    c.beginPath();c.roundRect(0,0,size,size,size*.27);c.fill();c.stroke();
    c.translate(size*.19,size*.19);c.scale(size*.62/24,size*.62/24);
    const type=signalType(item);c.strokeStyle=type==='up'?'#79d4a6':type==='down'?'#f0ad9e':'#e8ca8a';c.lineWidth=1.9;c.lineCap='round';c.lineJoin='round';c.stroke(new Path2D(signalPaths[type]));c.restore();
  }
  function signalBadge(item){const el=$('span','rr-pulse-signal rr-pulse-signal--'+signalType(item));el.setAttribute('role','img');el.setAttribute('aria-label',signal(item));el.title=signal(item);el.append(signalIcon(item));return el;}
  function probabilityColumn(label,value,cls){
    const col=$('span','rr-pulse-prob-col '+cls),bar=$('span','rr-pulse-prob-bar'),fill=$('span','rr-pulse-prob-fill');
    fill.style.width=value+'%';bar.append(fill);
    col.append($('span','rr-pulse-prob-caption',label),$('span','rr-pulse-prob-value',value.toFixed(1)+'%'),bar);return col;
  }
  function metricText(item){
    const m=item.metric;
    if(!m||!Number.isFinite(m.before)||!Number.isFinite(m.after)||m.before<0||m.after<0||m.before>100||m.after>100)return null;
    return {before:m.before.toFixed(1)+'%',after:m.after.toFixed(1)+'%',label:m.label==='SECOND_OR_THIRD'?'2ND OR 3RD PROBABILITY':'WIN PROBABILITY',up:m.after>m.before};
  }
  function buildCard(item){
    const article=$('article','rr-pulse-item');
    article.id='rr-pulse-'+item.id;
    article.setAttribute('aria-label',raceLabel(item));
    const content=$('div','rr-pulse-item-layout');
    content.append(chip(item.chip));
    const body=$('div','rr-pulse-copy');
    const top=$('div','rr-pulse-signal-row');
    top.append($('p','rr-pulse-track',item.track.toUpperCase()+' · '+ordinal(item.race_number).toUpperCase()),signalBadge(item));
    body.append(top);
    const m=metricText(item);
    body.append($('h3','rr-pulse-headline',m&&item.horse?item.horse:titleCaseWords(item.headline)));
    if(m){
      const numbers=$('div','rr-pulse-numbers');
      const diff=item.metric.after-item.metric.before;
      const delta=$('span','rr-pulse-delta '+(m.up?'rr-pulse-up':'rr-pulse-down'));
      delta.append($('span','rr-pulse-prob-value',(diff>0?'+':'')+diff.toFixed(1)),$('span','rr-pulse-prob-caption','PTS'));
      numbers.append($('span','rr-pulse-metric-label',m.label),probabilityColumn('BEFORE',item.metric.before,'rr-pulse-before'),$('span','rr-pulse-arrow-mark','→'),probabilityColumn('REVISED',item.metric.after,m.up?'rr-pulse-up':'rr-pulse-down'),delta);
      body.append(numbers);
    }else if(item.horse)body.append($('p','rr-pulse-affected',item.horse+' · #'+item.chip));
    body.append($('p','rr-pulse-message',item.short_message||item.message));
    content.append(body);article.append(content);
    if(Array.isArray(item.scratches)&&item.scratches.length){
      const row=$('div','rr-pulse-scratch-list');
      row.append($('span','rr-pulse-scratch-label','SCRATCHED'));
      // A complete, readable run of chips; no horse names in this compact
      // scratch line. The analysis above still uses meaningful horse names.
      for(const scratch of item.scratches){
        const identity=$('span','rr-pulse-scratch-identity');
        const icon=chip(scratch.program,true);
        icon.title='Scratched #'+scratch.program;
        identity.append(icon);row.append(identity);
      }
      article.append(row);
    }
    const footer=$('div','rr-pulse-item-footer');
    const links=$('div','rr-pulse-links');
    const original=$('a','rr-pulse-story-link','Open insight');original.href=pulseUrl(item);
    const paid=$('a','rr-pulse-paid-link','Full-Field Analysis');paid.href=item.hub_url;
    links.append(original,paid);footer.append(links,shareTools(item));article.append(footer);
    return article;
  }
  function buildCTA(){
    const item=$('div','rr-pulse-item rr-pulse-cta');
    item.append($('p','rr-pulse-track','THE COMPLETE PICTURE'),
      $('h3','rr-pulse-headline','More Than A Single Insight.'),
      $('p','rr-pulse-message','Full-Field Analysis, Win Probabilities and Full Finishing Order Projections—all in the Intelligence Hub.'));
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
        typeof x.message==='string'&&typeof x.track==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date));
      if(!valid.length){shell.hidden=true;events=[];revision='';return;}
      const key=JSON.stringify(valid);
      if(key===revision)return;
      revision=key;events=valid;rail.replaceChildren(...valid.map(buildCard),buildCTA());
      status.textContent=data.preview?'Design preview':valid.length+' verified '+(valid.length===1?'insight':'insights')+' today';
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
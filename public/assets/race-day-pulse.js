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
  // One repeatable 4:5 social card; no buttons, browser chrome or premium data.
  const shareUrl=item=>new URL(pulseUrl(item),location.origin).href;
  function shareFilename(item){return 'rail-rye-pulse-'+item.date+'-'+item.id+'.png';}
  async function socialImage(item){
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
    const c=canvas.getContext('2d');if(!c)throw Error('Canvas unsupported');
    const bg=c.createLinearGradient(0,0,1080,1350);bg.addColorStop(0,'#1b3b52');bg.addColorStop(.43,'#10283d');bg.addColorStop(1,'#061725');c.fillStyle=bg;c.fillRect(0,0,1080,1350);
    c.strokeStyle='#957748';c.lineWidth=2;c.beginPath();c.roundRect(30,30,1020,1290,28);c.stroke();
    c.fillStyle='#c49b59';c.fillRect(60,155,960,3);c.fillRect(60,1200,960,3);
    const logo=new Image();logo.src='/assets/approved/brand/rail-rye-ivory-logo.png';try{await logo.decode();c.drawImage(logo,62,45,90,90);}catch{}
    c.fillStyle='#e0b66b';c.font='700 35px Georgia';c.fillText('RAIL & RYE RACING',180,82);c.font='26px system-ui';c.fillText('RACE-DAY PULSE',180,121);
    c.font='700 30px system-ui';wrap(c,raceLabel(item).toUpperCase(),60,220,830,38,2);
    drawSignalMedallion(c,item,920,185,92);
    async function drawChip(number,x,y,size){
      const art=chip(number).querySelector('img');
      c.save();c.beginPath();c.roundRect(x,y,size,size,size*.12);c.clip();c.fillStyle='#fff';c.fillRect(x,y,size,size);
      let drawn=false;if(art){try{await art.decode();c.drawImage(art,x,y,size,size);drawn=true;}catch{}}
      if(!drawn){c.fillStyle='#102d53';c.font='700 '+Math.round(size*.44)+'px system-ui';c.fillText(String(number||'—'),x+size*.12,y+size*.65);}
      const suffix=/^\d{1,2}([A-Z])$/.exec(String(number||'').toUpperCase());
      if(suffix&&drawn){c.fillStyle='#102d53';c.fillRect(x+size*.68,y+size*.66,size*.32,size*.34);c.fillStyle='#fff';c.font='700 '+Math.round(size*.24)+'px system-ui';c.fillText(suffix[1],x+size*.72,y+size*.91);}
      c.restore();
    }
    await drawChip(item.chip,60,295,104);
    c.fillStyle='#fff';c.font='700 49px Georgia';wrap(c,item.horse||item.headline,190,333,820,56,2);
    const m=metricText(item);let messageY=455;
    if(m){
      c.fillStyle='#081b2b';c.beginPath();c.roundRect(50,435,980,225,20);c.fill();c.strokeStyle='#927748';c.stroke();
      c.fillStyle='#d8be89';c.font='700 27px system-ui';c.fillText(m.label,80,480);c.font='700 21px system-ui';c.fillText('ORIGINAL',80,520);c.fillText('REVISED',575,520);
      const diff=item.metric.after-item.metric.before, color=diff>0?'#73d2a2':diff<0?'#f2ab9c':'#dfbd79';
      c.font='700 80px system-ui';c.fillStyle='#b4c0ca';c.fillText(m.before,80,600);c.fillStyle='#e0b66b';c.fillText('→',420,600);c.fillStyle=color;c.fillText(m.after,575,600);
      c.font='700 25px system-ui';c.textAlign='right';c.fillText((diff>0?'+':'')+diff.toFixed(1)+' PTS',1000,480);c.textAlign='left';
      for(const [px,val,col] of [[80,item.metric.before,'#a6b5c4'],[575,item.metric.after,color]]){c.fillStyle='#354957';c.beginPath();c.roundRect(px,625,330,10,5);c.fill();if(val>0){c.fillStyle=col;c.beginPath();c.roundRect(px,625,330*val/100,10,5);c.fill();}}
      messageY=712;
    }
    c.fillStyle='#f2f2f2';c.font='30px system-ui';wrap(c,item.short_message||item.message,60,messageY,960,40,3);
    const context=selectedContext(item);let y=messageY+140;
    if(context.length){c.fillStyle='#d8be89';c.font='700 24px system-ui';wrap(c,context.map(([label,value])=>label+'  '+value).join('     ·     '),60,y,960,32,2);y+=70;}
    const pace=paceComparison(item);if(pace){c.fillStyle='#d8be89';c.font='700 24px system-ui';c.fillText(pace.textContent.replace('PACE FIT','PACE FIT: '),60,y);y+=44;}
    const scratches=Array.isArray(item.scratches)?item.scratches:[];
    if(scratches.length){c.fillStyle='#d8be89';c.font='700 24px system-ui';c.fillText('SCRATCHED',60,y);let px=60;for(const scratch of scratches.slice(0,20)){if(px+42>1020)break;await drawChip(scratch.program,px,y+16,42);px+=48;}}
    c.fillStyle='#e0b66b';c.font='700 28px system-ui';c.fillText('railandryeracing.com',60,1250);
    c.fillStyle='#b4c0ca';c.font='24px system-ui';c.fillText(item.id.startsWith('demo-')?'DESIGN PREVIEW · FICTIONAL DATA':'Model projections · Not guarantees',60,1300);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Image unavailable');return blob;
  }
  function shareTools(item){
    const group=$('div','rr-pulse-share-group'),share=$('button','rr-pulse-tool','Share');
    share.type='button';share.setAttribute('aria-label','Share '+raceLabel(item));share.setAttribute('aria-expanded','false');
    const menu=$('div','rr-pulse-menu');menu.hidden=true;
    const social=$('button','','Share to Socials'),download=$('button','','Download Card'),copy=$('button','','Copy Link');
    for(const button of [social,download,copy])button.type='button';
    const notice=$('span','rr-pulse-menu-status');notice.setAttribute('role','status');
    const link=$('a','rr-pulse-share-fallback','Open insight link');link.href=shareUrl(item);link.hidden=true;
    let blob=null,preparing=null;
    function prepare(){
      if(blob)return Promise.resolve(blob);
      if(preparing)return preparing;
      social.disabled=download.disabled=true;notice.textContent='Preparing card…';
      preparing=socialImage(item).then(value=>{blob=value;notice.textContent='';return value;}).catch(()=>{notice.textContent='Image unavailable. Close and reopen Share to retry.';return null;}).finally(()=>{social.disabled=download.disabled=!blob;preparing=null;});
      return preparing;
    }
    async function copyOrReveal(){
      try{await navigator.clipboard.writeText(shareUrl(item));return true;}catch{link.hidden=false;return false;}
    }
    copy.addEventListener('click',async()=>{notice.textContent=await copyOrReveal()?'Link copied.':'Copy the insight link below.';});
    download.addEventListener('click',()=>{if(blob){downloadBlob(blob,shareFilename(item));notice.textContent='Card downloaded.';}});
    social.addEventListener('click',async()=>{
      if(!blob)return;
      const file=new File([blob],shareFilename(item),{type:'image/png'}),url=shareUrl(item);
      const payload={files:[file],url};
      // Prepare on opening the menu so native share runs in the actual click gesture.
      if(navigator.share&&navigator.canShare?.(payload)){
        try{await navigator.share(payload);notice.textContent='Share opened.';return;}
        catch(error){if(error.name==='AbortError')return;}
      }
      const copied=copyOrReveal();downloadBlob(blob,file.name);
      notice.textContent=await copied?'Card downloaded. Link copied — attach the image and paste the link in your post.':'Card downloaded. Copy the insight link below and attach the image to your post.';
    });
    menu.append(social,download,copy,notice,link);
    function close(){menu.hidden=true;share.setAttribute('aria-expanded','false');}
    share.addEventListener('click',()=>{if(!menu.hidden){close();return;}for(const other of document.querySelectorAll('.rr-pulse-menu:not([hidden])')){other.hidden=true;other.parentElement.querySelector('.rr-pulse-tool')?.setAttribute('aria-expanded','false');}menu.hidden=false;share.setAttribute('aria-expanded','true');prepare();});
    group.addEventListener('keydown',e=>{if(e.key==='Escape'){close();share.focus();}});
    group.append(share,menu);return group;
  }
  // Owner-approved four-symbol family. Shared vector geometry for DOM and canvas.
  function signalType(item){
    if(item.kind==='NEW_FAVORITE'||item.kind==='FAVORITE_SCRATCHED')return 'favorite';
    if(item.kind==='F4_SHIFT')return 'rank';
    if(item.kind==='PACE_ADVANTAGE')return 'pace';
    return 'scratch';
  }
  const signalLabels={scratch:'SCRATCH IMPACT',favorite:'NEW PROJECTED FAVORITE',pace:'PACE ADVANTAGE',rank:'RANK MOVEMENT'};
  function signal(item){return signalLabels[signalType(item)];}
  const signalArt={
    scratch:[
      {d:'M7 3H21Q23 3 22.5 5L20 19Q19.6 21 17 21H3Q1 21 1.5 19L4 5Q4.5 3 7 3Z',fill:'#ed8b27',stroke:'#f6f0e5',w:1.2},
      {d:'M8 7L15 17M17 7L10 17',stroke:'#10283d',w:2.7}
    ],
    favorite:[
      {d:'M12 1L13.8 5.4L18.6 5.7L14.9 8.8L16.1 13.3L12 10.7L7.9 13.3L9.1 8.8L5.4 5.7L10.2 5.4Z',fill:'#e6b650'},
      {d:'M5 15H19Q20 15 20.4 16.3L22 21Q22.3 23 20 23H4Q1.7 23 2 21L3.6 16.3Q4 15 5 15Z',fill:'#f6f0e5'},
      {d:'M10 18L12 17V21M10 21H14',stroke:'#10283d',w:1.5}
    ],
    pace:[
      {d:'M2 19A10 10 0 0 1 22 19M5 12L7 14M12 9V12M19 12L17 14',stroke:'#f6f0e5',w:1.6},
      {d:'M11 18L21 8L13.5 19.5Z',fill:'#6fd29e'},
      {d:'M14 19A2 2 0 1 0 10 19A2 2 0 1 0 14 19Z',fill:'#6fd29e'}
    ],
    rank:[
      {d:'M2 6H11M2 12H11M2 18H11',stroke:'#f6f0e5',w:2.2},
      {d:'M17 10V2M14 5L17 2L20 5',stroke:'#6fd29e',w:2},
      {d:'M17 14V22M14 19L17 22L20 19',stroke:'#e6b650',w:2}
    ]
  };
  function signalIcon(item){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','rr-pulse-category-icon');
    for(const part of signalArt[signalType(item)]){const p=document.createElementNS(ns,'path');p.setAttribute('d',part.d);p.setAttribute('fill',part.fill||'none');if(part.stroke){p.setAttribute('stroke',part.stroke);p.setAttribute('stroke-width',part.w);p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');}svg.append(p);}
    return svg;
  }
  function drawSignalMedallion(c,item,x,y,size){
    c.save();c.translate(x,y);c.fillStyle='#10283d';c.strokeStyle='#d5b374';c.lineWidth=1.5;
    c.beginPath();c.roundRect(0,0,size,size,size*.18);c.fill();c.stroke();
    c.translate(size*.15,size*.15);c.scale(size*.70/24,size*.70/24);
    for(const part of signalArt[signalType(item)]){const p=new Path2D(part.d);if(part.fill){c.fillStyle=part.fill;c.fill(p);}if(part.stroke){c.strokeStyle=part.stroke;c.lineWidth=part.w;c.lineCap='round';c.lineJoin='round';c.stroke(p);}}
    c.restore();
  }
  function signalBadge(item){const el=$('span','rr-pulse-signal rr-pulse-signal--'+signalType(item));el.setAttribute('role','img');el.setAttribute('aria-label',signal(item));el.title=signal(item);el.append(signalIcon(item));return el;}
  function probabilityColumn(label,value,cls){
    const col=$('span','rr-pulse-prob-col '+cls),bar=$('span','rr-pulse-prob-bar'),fill=$('span','rr-pulse-prob-fill');
    fill.style.width=value+'%';bar.append(fill);
    col.append($('span','rr-pulse-prob-caption',label),$('span','rr-pulse-prob-value',value.toFixed(1)+'%'),bar);return col;
  }
  function paceComparison(item){
    const m=item.pace_fit;
    if(item.kind!=='PACE_ADVANTAGE'||!m||!['red','gray','green'].includes(m.before)||!['red','gray','green'].includes(m.after))return null;
    const names={red:'Negative',gray:'Neutral',green:'Positive'},el=$('div','rr-pulse-pace-comparison');
    el.append($('span','rr-pulse-pace-label','PACE FIT'),$('span','rr-pulse-fit rr-pulse-fit--'+m.before,names[m.before]),$('span','rr-pulse-arrow-mark','→'),$('span','rr-pulse-fit rr-pulse-fit--'+m.after,names[m.after]));return el;
  }
  function metricText(item){
    const m=item.metric;
    if(!m||!Number.isFinite(m.before)||!Number.isFinite(m.after)||m.before<0||m.after<0||m.before>100||m.after>100)return null;
    return {before:m.before.toFixed(1)+'%',after:m.after.toFixed(1)+'%',label:m.label==='SECOND_OR_THIRD'?'2ND OR 3RD PROBABILITY':'WIN PROBABILITY',up:m.after>m.before};
  }
  function selectedContext(item){
    const info=item.summary, out=[];
    if(Number.isInteger(info?.projected_rank)&&info.projected_rank>0)out.push(['Projected Rank',ordinal(info.projected_rank)]);
    if(Number.isFinite(info?.win_probability)&&info.win_probability>0&&globalThis.RRRaceTitles?.formatFairOdds){
      const odds=globalThis.RRRaceTitles.formatFairOdds({win_probability_exact:info.win_probability});
      if(odds&&odds!=='—')out.push(['Revised Fair Odds',odds]);
    }
    return out;
  }
  function buildCard(item){
    const article=$('article','rr-pulse-item');
    article.id='rr-pulse-'+item.id;
    article.setAttribute('aria-label',raceLabel(item));
    const content=$('div','rr-pulse-item-layout');
    const body=$('div','rr-pulse-copy');
    const top=$('div','rr-pulse-signal-row');
    top.append($('p','rr-pulse-track',item.track.toUpperCase()+' · '+ordinal(item.race_number).toUpperCase()),signalBadge(item));
    const m=metricText(item);
    const horseLine=$('div','rr-pulse-horse-line');horseLine.append(chip(item.chip),$('h3','rr-pulse-headline',m&&item.horse?item.horse:titleCaseWords(item.headline)));const identity=$('div','rr-pulse-identity');identity.append(top.firstChild,horseLine);const header=$('div','rr-pulse-card-header');header.append(identity,top.lastChild);body.append(header);
    if(m){
      const numbers=$('div','rr-pulse-numbers');
      const diff=item.metric.after-item.metric.before;
      const movement=diff>0?'rr-pulse-up':diff<0?'rr-pulse-down':'rr-pulse-flat';
      const delta=$('span','rr-pulse-delta '+movement);
      delta.append($('span','rr-pulse-prob-value',(diff>0?'+':'')+diff.toFixed(1)),$('span','rr-pulse-prob-caption','PTS'));
      numbers.append($('span','rr-pulse-metric-label',m.label),probabilityColumn('ORIGINAL',item.metric.before,'rr-pulse-before'),$('span','rr-pulse-arrow-mark','→'),probabilityColumn('REVISED',item.metric.after,movement),delta);
      body.append(numbers);
      const context=selectedContext(item);if(context.length){const row=$('div','rr-pulse-context');for(const [label,value] of context){const cell=$('span','rr-pulse-context-cell');cell.append($('span','rr-pulse-prob-caption',label),$('strong','rr-pulse-context-value',value));row.append(cell);}body.append(row);}
      const pace=paceComparison(item);if(pace)body.append(pace);
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
    const original=$('a','rr-pulse-story-link','Open Insight');original.href=pulseUrl(item);
    const paid=$('a','rr-pulse-paid-link','Full-Field Analysis');paid.href=item.hub_url;
    links.append(original,paid);footer.append(links,shareTools(item));article.append(footer);
    return article;
  }
  let observedCard=null;const cardObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>fitActiveCard()):null;
  function fitActiveCard(){
    if(shell.hidden||!rail.children[selected])return;
    // A single visible card on mobile and desktop hero. Do not reserve the height of an offscreen long card.
    const card=rail.children[selected];if(observedCard!==card){cardObserver?.disconnect();cardObserver?.observe(card);observedCard=card;}
    if(matchMedia('(max-width:640px), (min-width:1121px)').matches){const height=Math.ceil(card.getBoundingClientRect().height)+12;const value=height+'px';if(rail.style.height!==value)rail.style.height=value;}else rail.style.height='';
  }
  window.addEventListener('resize',fitActiveCard,{passive:true});
  function scrollToIndex(index,behavior='smooth'){
    if(!rail.children.length)return;
    selected=Math.max(0,Math.min(index,rail.children.length-1));
    const el=rail.children[selected];
    rail.scrollTo({left:el.offsetLeft-rail.offsetLeft,behavior});
    prev.disabled=selected===0;next.disabled=selected===rail.children.length-1;fitActiveCard();
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
    selected=best;prev.disabled=selected===0;next.disabled=selected===rail.children.length-1;fitActiveCard();
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
      revision=key;events=valid;rail.replaceChildren(...valid.map(buildCard));
      status.textContent=data.preview?'Design preview':valid.length+' verified '+(valid.length===1?'insight':'insights')+' today';
      shell.hidden=false;scrollToIndex(0,'instant');
      const focus=new URL(location.href).searchParams.get('pulse');
      const idx=valid.findIndex(item=>item.id===focus);
      if(idx>=0)scrollToIndex(idx,'instant');
    }catch{if(!events.length)shell.hidden=true;}
    finally{pending=false;}
  }
  // Reuse the existing sitewide North American tote formatting authority.
  import('/assets/rr-race-titles.js').catch(()=>{}).finally(()=>{load();setInterval(load,60000);});
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    setInterval(()=>{if(!shell.hidden&&!paused&&!document.hidden&&rail.children.length>1)scrollToIndex((selected+1)%rail.children.length);},6500);
  }
})();
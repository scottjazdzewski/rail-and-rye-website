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
  let selected=0,events=[],paused=false,revision='',pending=false,closeShare=null;
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
  // Unified, responsive social master. All exports use actual brand assets and
  // the exact same SVG medallion as the homepage. No fabricated source fields.
  const shareUrl=item=>new URL(pulseUrl(item),location.origin).href;
  function shareFilename(item){return 'rail-rye-pulse-'+item.date+'-'+item.id+'.png';}
  async function loadArt(src){const img=new Image();img.src=src;await img.decode();return img;}
  let logoPromise;
  function transparentLogo(){
    if(!logoPromise)logoPromise=(async()=>{
      const img=await loadArt('/assets/approved/brand/rail-rye-ivory-logo.png');
      const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      const image=ctx.getImageData(0,0,canvas.width,canvas.height),p=image.data;
      // Keep existing transparency; only unmatte the opaque navy-backed ivory asset.
      if(![p[3],p[(canvas.width-1)*4+3],p[(canvas.width*(canvas.height-1))*4+3],p[p.length-1]].some(a=>a<32)){
        for(let i=0;i<p.length;i+=4){const y=.2126*p[i]+.7152*p[i+1]+.0722*p[i+2];const alpha=Math.max(0,Math.min(1,(y-52)/163));p[i]=244;p[i+1]=233;p[i+2]=211;p[i+3]=Math.round(p[i+3]*alpha);}
        ctx.putImageData(image,0,0);
      }
      return canvas;
    })().catch(e=>{logoPromise=null;throw e;});
    return logoPromise;
  }
  async function socialImage(item,format='portrait'){
    const portrait=format!=='landscape',W=portrait?1080:1200,H=portrait?1350:675;
    const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    const c=canvas.getContext('2d');if(!c)throw Error('Canvas unsupported');
    if(document.fonts?.ready)await document.fonts.ready;
    const ivory='#f5ecd9',gold='#e4bf79',muted='#b4c0ca',navy='#10283b';
    const X=portrait?56:38, R=W-X, B=R-X;
    const font=(size,weight=700,family='system-ui,sans-serif')=>{c.font=weight+' '+size+'px '+family;};
    function txt(t,x,y,size,color=ivory,weight=700,maxWidth,align='left',family='system-ui,sans-serif'){
      font(size,weight,family);c.fillStyle=color;c.textAlign=align;if(maxWidth)c.fillText(String(t),x,y,maxWidth);else c.fillText(String(t),x,y);c.textAlign='left';
    }
    function panel(x,y,w,h,r=16,raised=false){
      c.save();if(raised){c.shadowColor='#0006';c.shadowBlur=12;c.shadowOffsetY=5;}
      const g=c.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#19364b');g.addColorStop(1,'#091c2b');
      c.fillStyle=g;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();c.restore();
      c.strokeStyle='#a18455';c.lineWidth=1.5;c.stroke();c.save();c.strokeStyle='#f0d9a32b';c.beginPath();c.roundRect(x+2,y+2,w-4,h-4,r-2);c.stroke();c.restore();
    }
    function line(y){c.fillStyle='#a18455';c.fillRect(X,y,B,1.5);}
    function bar(x,y,w,value,color,h){c.fillStyle='#435566';c.beginPath();c.roundRect(x,y,w,h,h/2);c.fill();if(value>0){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w*value/100,h,Math.min(h/2,w*value/200));c.fill();}}
    async function saddle(n,x,y,size){
      const match=/^(\d{1,2})([A-Z]?)$/.exec(String(n||'').toUpperCase());
      if(!match||Number(match[1])<1||Number(match[1])>20)throw Error('Invalid program chip');
      const img=await loadArt('/assets/approved/saddlecloths/'+Number(match[1])+'.png');
      c.save();c.beginPath();c.roundRect(x,y,size,size,size*.12);c.clip();c.fillStyle='#fff';c.fillRect(x,y,size,size);c.drawImage(img,x,y,size,size);c.restore();
      if(match[2]){c.fillStyle='#102d53';c.fillRect(x+size*.68,y+size*.66,size*.32,size*.34);txt(match[2],x+size*.72,y+size*.91,Math.round(size*.24),'#fff');}
    }
    const bg=c.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#1c384d');bg.addColorStop(.55,'#10283b');bg.addColorStop(1,'#071a2c');c.fillStyle=bg;c.fillRect(0,0,W,H);
    c.strokeStyle='#b18a49';c.lineWidth=2;c.beginPath();c.roundRect(18,18,W-36,H-36,24);c.stroke();
    const logo=await transparentLogo(),logoSize=portrait?110:70,logoY=portrait?40:28;
    const scale=Math.min(logoSize/logo.width,logoSize/logo.height);
    c.drawImage(logo,X+(logoSize-logo.width*scale)/2,logoY+(logoSize-logo.height*scale)/2,logo.width*scale,logo.height*scale);
    txt('RAIL & RYE RACING',X+logoSize+18,portrait?84:54,portrait?39:29,ivory,700,B-logoSize-30,'left','Georgia,serif');
    txt('RACE-DAY PULSE',X+logoSize+18,portrait?125:83,portrait?27:19,gold,750);
    line(portrait?164:105);
    const identityY=portrait?188:118,chipSize=portrait?116:79,badgeSize=portrait?142:100;
    txt(raceLabel(item).toUpperCase(),X,identityY+(portrait?32:24),portrait?30:23,gold,800,B-badgeSize-18);
    await saddle(item.chip,X,identityY+(portrait?50:31),chipSize);
    txt(item.horse||item.headline,X+chipSize+20,identityY+(portrait?121:84),portrait?53:42,ivory,700,B-chipSize-badgeSize-52,'left','Georgia,serif');
    await drawSignalMedallion(c,item,R-badgeSize,identityY+5,badgeSize);
    const m=metricText(item),py=portrait?376:239,ph=portrait?354:192;
    if(!m)throw Error('Certified probability metric required for social export');
    panel(X,py,B,ph,portrait?22:16,true);
    txt(m.label,X+20,py+(portrait?46:31),portrait?31:23,gold,800,B-40);
    const aX=X+(portrait?26:24),bX=X+B*.54,barW=B*(portrait?.40:.39);
    const diff=item.metric.after-item.metric.before,col=diff>0?'#79d4a6':diff<0?'#f0ad9e':gold;
    const captionY=py+(portrait?100:63),numberY=py+(portrait?208:132),barY=py+(portrait?228:143);
    txt('ORIGINAL',aX,captionY,portrait?27:19,muted,750);
    txt('REVISED',bX,captionY,portrait?27:19,gold,750);
    txt(m.before,aX,numberY,portrait?102:67,muted,800,barW);
    txt(m.after,bX,numberY,portrait?102:67,col,800,barW);
    txt('→',X+B*.5,numberY-3,portrait?59:42,gold,700,55,'center');
    bar(aX,barY,barW,item.metric.before,muted,portrait?13:7);
    bar(bX,barY,barW,item.metric.after,col,portrait?13:7);
    txt((diff>0?'+':'')+diff.toFixed(1)+' Percentage Points',W/2,py+ph-(portrait?30:13),portrait?37:23,col,800,B-36,'center');
    const context=selectedContext(item),cy=portrait?754:444,ch=portrait?86:42;
    if(context.length){panel(X,cy,B,ch,12);context.forEach(([k,v],i)=>{const cx=X+B*(i+.5)/context.length;txt(k+'  '+v,cx,cy+(portrait?54:28),portrait?31:20,ivory,700,B/context.length-18,'center');});}
    const takeawayY=portrait?884:512;
    font(portrait?31:22,500);c.fillStyle=ivory;wrap(c,item.short_message||item.message,X,takeawayY,B,portrait?37:26,2);
    const scratches=Array.isArray(item.scratches)?item.scratches:[],sy=portrait?979:565,ss=portrait?61:34;
    if(scratches.length){txt('SCRATCHED',X,sy+(portrait?23:14),portrait?26:18,gold,800);let sx=X+(portrait?192:134);for(const sc of scratches){if(sx+ss>R)break;await saddle(sc.program,sx,sy-(portrait?18:12),ss);sx+=ss+(portrait?10:8);}}
    const ctaY=portrait?1066:607,ctaH=portrait?153:40;
    panel(X,ctaY,B,ctaH,portrait?18:10);
    if(portrait){
      txt('See the Complete Race Analysis',W/2,ctaY+46,36,gold,750,B-40,'center','Georgia,serif');
      txt('Win Probabilities · Finishing Order Projections',W/2,ctaY+81,23,ivory,550,B-40,'center');
      txt('railandryeracing.com',W/2,ctaY+127,30,gold,800,B-40,'center');
    }else{
      txt('See the Complete Race Analysis',X+16,ctaY+27,22,gold,750,B*.55,'left','Georgia,serif');
      txt('railandryeracing.com',R-16,ctaY+27,20,ivory,750,B*.41,'right');
    }
    if(portrait)txt(item.id.startsWith('demo-')?'DESIGN PREVIEW · FICTIONAL DATA':'Model projections · Not guarantees',W/2,1290,22,muted,500,B,'center');
    else txt(item.id.startsWith('demo-')?'FICTIONAL DESIGN PREVIEW':'Model projections · Not guarantees',W/2,663,12,muted,500,B,'center');
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Image unavailable');return blob;
  }
  // The release renderer invokes the identical browser template, not an approximation.
  globalThis.RRPulseRenderImage=async(item,format)=>socialImage(item,format);
  function shareTools(item){
    const group=$('div','rr-pulse-share-group'),share=$('button','rr-pulse-tool','Share');
    share.type='button';share.setAttribute('aria-label','Share '+raceLabel(item));share.setAttribute('aria-expanded','false');
    const menu=$('div','rr-pulse-menu');menu.hidden=true;
    const social=$('button','','Share to X'),download=$('button','','Download Card'),copy=$('button','','Copy Link');
    for(const button of [social,download,copy])button.type='button';
    const notice=$('span','rr-pulse-menu-status');notice.setAttribute('role','status');
    const preview=$('p','rr-pulse-preview-status','Checking social preview…');preview.setAttribute('role','status');
    const link=$('a','rr-pulse-share-fallback',shareUrl(item));link.href=shareUrl(item);link.hidden=true;
    let blob=null,preparing=null,previewReady=false;
    async function checkPreview(){
      social.disabled=true;preview.textContent='Checking social preview…';
      try{const response=await fetch(pulseUrl(item)+'/card-v1.png',{method:'HEAD',cache:'no-store'});previewReady=response.ok&&/^image\/png(?:;|$)/i.test(response.headers.get('content-type')||'');}
      catch{previewReady=false;}
      social.disabled=!previewReady;preview.textContent=previewReady?'Social preview ready.':'Social preview not published yet. Download Card is still available.';
    }
    function prepare(){
      if(blob)return Promise.resolve(blob);
      if(preparing)return preparing;
      download.disabled=true;notice.textContent='Preparing download…';
      preparing=socialImage(item).then(value=>{blob=value;notice.textContent='';return value;}).catch(()=>{notice.textContent='Image unavailable. Close and reopen Share to retry.';return null;}).finally(()=>{download.disabled=!blob;preparing=null;});
      return preparing;
    }
    async function copyOrReveal(){
      try{await navigator.clipboard.writeText(shareUrl(item));return true;}catch{link.hidden=false;return false;}
    }
    copy.addEventListener('click',async()=>{notice.textContent=await copyOrReveal()?'Link copied.':'Copy the insight link below.';});
    download.addEventListener('click',()=>{if(blob){downloadBlob(blob,shareFilename(item));notice.textContent='Card downloaded.';}});
    social.addEventListener('click',()=>{
      if(!previewReady)return;
      const url=shareUrl(item),text=item.short_message||item.message;
      // X Web Intent accepts text and URL, not binary attachments. The per-insight
      // public PNG metadata supplies the large preview when X fetches the URL.
      window.open('https://x.com/intent/tweet?text='+encodeURIComponent(text)+'&url='+encodeURIComponent(url),'_blank','noopener,noreferrer');
      notice.textContent='If X does not show the preview, download the card and attach it manually.';
    });
    menu.append(social,download,copy,preview,notice,link);
    function close(){menu.hidden=true;menu.remove();share.setAttribute('aria-expanded','false');if(closeShare===close)closeShare=null;}
    share.addEventListener('click',()=>{
      if(closeShare===close){close();return;}
      closeShare?.();closeShare=close;document.body.append(menu);
      menu.hidden=false;share.setAttribute('aria-expanded','true');checkPreview();prepare();
    });
    menu.addEventListener('keydown',e=>{if(e.key==='Escape'){close();share.focus();}});
    share.addEventListener('keydown',e=>{if(e.key==='Escape'){close();share.focus();}});
    group.append(share);return group;
  }
  document.addEventListener('pointerdown',e=>{if(closeShare&&!e.target.closest?.('.rr-pulse-menu,.rr-pulse-tool'))closeShare();});
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
  let signalSerial=0;
  function signalIcon(item){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),id='pulse-metal-'+(++signalSerial);
    svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','rr-pulse-category-icon');
    svg.innerHTML='<defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38586c"/><stop offset=".55" stop-color="#173449"/><stop offset="1" stop-color="#0b2033"/></linearGradient></defs><rect x="2" y="2" width="96" height="96" rx="22" fill="url(#'+id+')" stroke="#d0ae6a" stroke-width="2"/><rect x="5" y="5" width="90" height="90" rx="19" fill="none" stroke="#efd39a" stroke-opacity=".23"/>';
    const g=document.createElementNS(ns,'g');g.setAttribute('transform','translate(15 15) scale(2.9166667)');
    for(const part of signalArt[signalType(item)]){const p=document.createElementNS(ns,'path');p.setAttribute('d',part.d);p.setAttribute('fill',part.fill||'none');if(part.stroke){p.setAttribute('stroke',part.stroke);p.setAttribute('stroke-width',part.w);p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');}g.append(p);}svg.append(g);return svg;
  }
  async function drawSignalMedallion(c,item,x,y,size){
    const svg=signalIcon(item);svg.setAttribute('width','100');svg.setAttribute('height','100');
    const uri='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));
    const img=await loadArt(uri);c.drawImage(img,x,y,size,size);
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
    const paid=$('a','rr-pulse-paid-link','Full-Field Analysis');paid.href=typeof item.hub_url==='string'&&item.hub_url.startsWith('/')&&!item.hub_url.startsWith('//')?item.hub_url:'/store/';
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
      if(!valid.length){closeShare?.();shell.hidden=true;events=[];revision='';return;}
      const key=JSON.stringify(valid);
      if(key===revision)return;
      closeShare?.();revision=key;events=valid;rail.replaceChildren(...valid.map(buildCard));
      status.textContent=data.preview?'Design preview':valid.length+' verified '+(valid.length===1?'insight':'insights')+' today';
      shell.hidden=false;scrollToIndex(0,'instant');
      const focus=new URL(location.href).searchParams.get('pulse');
      const idx=valid.findIndex(item=>item.id===focus);
      if(idx>=0)scrollToIndex(idx,'instant');
    }catch{if(!events.length)shell.hidden=true;}
    finally{pending=false;}
  }
  const liveLogo=shell.querySelector('.rr-pulse-logo');if(liveLogo)transparentLogo().then(art=>{liveLogo.src=art.toDataURL('image/png');}).catch(()=>{});
  // Reuse the existing sitewide North American tote formatting authority.
  import('/assets/rr-race-titles.js').catch(()=>{}).finally(()=>{load();setInterval(load,60000);});
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    setInterval(()=>{if(!shell.hidden&&!paused&&!closeShare&&!document.hidden&&rail.children.length>1)scrollToIndex((selected+1)%rail.children.length);},6500);
  }
})();
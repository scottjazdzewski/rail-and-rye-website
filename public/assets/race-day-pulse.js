// Homepage Race-Day Pulse. Public data ONLY from /api/race-day-pulse.
(function(){
  'use strict';
  const shell=document.getElementById('rr-pulse');
  const rail=document.getElementById('rr-pulse-rail');
  const status=document.getElementById('rr-pulse-count');
  const detailMode=!!shell?.dataset.pulseItem;
  // Use the unused right side of the established desktop hero, but never
  // let Pulse add a tall full-width bar or displace the mobile hero.
  const homepageHero=document.querySelector('.heritage-hero');
  const desktopMedia=matchMedia('(min-width:1121px)');
  function placePulse(){
    if(!homepageHero||!shell||detailMode)return;
    if(desktopMedia.matches){if(shell.parentElement!==homepageHero)homepageHero.append(shell);}
    else if(shell.previousElementSibling!==homepageHero)homepageHero.after(shell);
  }
  placePulse();desktopMedia.addEventListener?.('change',placePulse);
  const prev=document.getElementById('rr-pulse-prev'),next=document.getElementById('rr-pulse-next');
  if(!shell||!rail||!prev||!next)return;
  let selected=0,events=[],paused=false,revision='',pending=false,closeShare=null,expanded=null;
  const position=document.createElement('span');position.className='rr-pulse-position';position.setAttribute('aria-live','off');
  if(!detailMode){
    next.before(position);
    for(const [button,d] of [[prev,'M15.5 5L8.5 12L15.5 19'],[next,'M8.5 5L15.5 12L8.5 19']]){
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),arrow=document.createElementNS(ns,'path');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
      arrow.setAttribute('d',d);arrow.setAttribute('fill','none');arrow.setAttribute('stroke','currentColor');arrow.setAttribute('stroke-width','2.4');arrow.setAttribute('stroke-linecap','round');arrow.setAttribute('stroke-linejoin','round');
      svg.append(arrow);button.replaceChildren(svg);
    }
  }
  function updatePosition(){position.textContent=(selected+1)+'/'+rail.children.length;position.setAttribute('aria-label','Insight '+(selected+1)+' of '+rail.children.length);}

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
  const raceHeader=item=>raceLabel(item)+(typeof item.post_time_et==='string'&&item.post_time_et.trim()?' · '+item.post_time_et.trim():'');
  const pulseUrl=item=>'/pulse/'+encodeURIComponent(item.date)+'/'+encodeURIComponent(item.id);
  function downloadBlob(blob,filename){
    const uri=URL.createObjectURL(blob),link=$('a');link.href=uri;link.download=filename;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(uri),1500);
  }
  function wrap(ctx,text,x,y,maxWidth,lineHeight,maxLines){
    const words=String(text).split(/\s+/),lines=[];let line='';
    for(const word of words){const candidate=line?line+' '+word:word;if(line&&ctx.measureText(candidate).width>maxWidth){lines.push(line);line=word;}else line=candidate;}
    if(line)lines.push(line);
    const visible=lines.slice(0,maxLines);
    if(lines.length>maxLines){let last=visible[maxLines-1];while(last&&ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);visible[maxLines-1]=last.trimEnd()+'…';}
    visible.forEach((l,i)=>ctx.fillText(l,x,y+i*lineHeight,maxWidth));
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
    const serif=getComputedStyle(document.documentElement).getPropertyValue('--heritage-serif').trim()||'Georgia,serif';
    if(document.fonts?.load){await document.fonts.load('700 40px '+serif).catch(()=>{});await document.fonts.ready;}
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
    txt('RAIL & RYE RACING',X+logoSize+18,portrait?84:54,portrait?39:29,ivory,700,B-logoSize-30,'left',serif);
    txt('RACE-DAY PULSE',X+logoSize+18,portrait?125:83,portrait?27:19,gold,750);
    line(portrait?164:105);
    const identityY=portrait?188:118,chipSize=portrait?116:79,badgeSize=portrait?142:112;
    txt(raceLabel(item).toUpperCase(),X,identityY+(portrait?32:24),portrait?30:23,gold,800,B-badgeSize-18);
    await saddle(item.chip,X,identityY+(portrait?50:31),chipSize);
    txt(item.horse||item.headline,X+chipSize+20,identityY+(portrait?121:84),portrait?53:42,ivory,700,B-chipSize-badgeSize-52,'left',serif);
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
    const takeawayY=portrait?895:508;
    const concise=()=>{
      if(item.kind==='NEW_FAVORITE')return 'New projected favorite';
      if(item.kind==='FAVORITE_SCRATCHED')return 'New leader after favorite scratched';
      if(item.kind==='F4_SHIFT')return diff>0?'Second-or-third probability rises':diff<0?'Second-or-third probability falls':'Second-or-third outlook changes';
      if(item.kind==='PACE_ADVANTAGE')return item.race_pace?'Projected pace: '+item.race_pace.before+' → '+item.race_pace.after:item.pace_fit?.before===item.pace_fit?.after?'Projected pace changes':'Pace Fit changes';
      return diff>0?'Projected fair odds shorten':diff<0?'Projected fair odds lengthen':'Projection changes';
    };
    if(portrait)txt(concise(),W/2,takeawayY,32,ivory,600,B-24,'center');
    else {font(22,500);c.fillStyle=ivory;wrap(c,item.short_message||item.message,X,takeawayY,B,25,2);}
    if(item.kind==='PACE_ADVANTAGE'&&item.pace_fit&&!item.race_pace){const names={red:'Negative',gray:'Neutral',green:'Positive'};const before=names[item.pace_fit.before],after=names[item.pace_fit.after];if(before&&after)txt('Pace Fit: '+before+' → '+after,X,portrait?943:553,portrait?24:17,gold,700,B);}
    const scratches=Array.isArray(item.scratches)?item.scratches:[],sy=portrait?995:576,ss=portrait?57:29;
    if(scratches.length){txt('SCRATCHED',X,sy+(portrait?23:14),portrait?26:18,gold,800);let sx=X+(portrait?192:134);const step=ss+(portrait?10:8),capacity=Math.floor((R-sx+step-ss)/step),show=scratches.length>capacity?Math.max(0,capacity-1):scratches.length;for(const sc of scratches.slice(0,show)){await saddle(sc.program,sx,sy-(portrait?18:12),ss);sx+=step;}if(scratches.length>show)txt('+'+(scratches.length-show),sx,sy+(portrait?23:14),portrait?22:17,gold,750,R-sx);}
    const ctaY=portrait?1060:603,ctaH=portrait?132:35;
    panel(X,ctaY,B,ctaH,portrait?18:10);
    if(portrait){
      txt('Full Race Analysis',W/2,ctaY+51,43,gold,750,B-40,'center',serif);
      txt('railandryeracing.com',W/2,ctaY+99,30,ivory,700,B-40,'center');
    }else{
      txt('See the Complete Race Analysis',X+16,ctaY+24,22,gold,750,B*.55,'left',serif);
      txt('railandryeracing.com',R-16,ctaY+24,20,ivory,750,B*.41,'right');
    }
    if(portrait)txt(item.id.startsWith('demo-')?'DESIGN PREVIEW · FICTIONAL DATA':'Model projections · Not guarantees',W/2,1244,20,muted,500,B,'center');
    else txt(item.id.startsWith('demo-')?'FICTIONAL DESIGN PREVIEW':'Model projections · Not guarantees',W/2,652,12,muted,500,B,'center');
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
    if(item.kind==='NEW_FAVORITE')return 'favorite';
    if(item.kind==='FAVORITE_SCRATCHED')return 'favorite-scratched';
    if(item.kind==='F4_SHIFT')return 'rank';
    if(item.kind==='PACE_ADVANTAGE')return 'pace';
    return 'scratch';
  }
  const signalLabels={scratch:'PROJECTED FAIR ODDS SHIFT',favorite:'NEW PROJECTED FAVORITE',pace:'PROJECTED PACE CHANGE',rank:'RANK MOVEMENT'};
  function signal(item){return item.kind==='FAVORITE_SCRATCHED'?'PROJECTED FAVORITE SCRATCHED':item.kind==='F4_SHIFT'?'SECOND-OR-THIRD PROBABILITY SHIFT':signalLabels[signalType(item)];}
  const signalArt={
    // Probability movement, not an X or a close/delete affordance.
    scratch:[
      {d:'M3 3V21H22',stroke:'#c5b994',w:1.5},
      {d:'M5.5 16L10 11.5L14 14L21 5.5M16 5.5H21V10.5',stroke:'#e6b650',w:2.5}
    ],
    scratchDown:[
      {d:'M3 3V21H22',stroke:'#c5b994',w:1.5},
      {d:'M5.5 7L10 11.5L14 9L21 18M16 18H21V13',stroke:'#f0ad9e',w:2.5}
    ],
    'favorite-scratched':[
      {d:'M12 2L14.5 7.8L21 8.5L16 12.5L17.5 19L12 15.5L6.5 19L8 12.5L3 8.5L9.5 7.8Z',stroke:'#e6b650',w:1.6},
      {d:'M4 20L20 4',stroke:'#f0ad9e',w:2.6}
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
    const type=signalType(item),art=type==='scratch'&&item.metric?.after<item.metric?.before?'scratchDown':type;
    for(const part of signalArt[art]){const p=document.createElementNS(ns,'path');p.setAttribute('d',part.d);p.setAttribute('fill',part.fill||'none');if(part.stroke){p.setAttribute('stroke',part.stroke);p.setAttribute('stroke-width',part.w);p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');}g.append(p);}svg.append(g);return svg;
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
    if(item.kind==='PACE_ADVANTAGE'&&item.race_pace){const el=$('div','rr-pulse-pace-comparison');el.append($('span','rr-pulse-pace-label','RACE PACE'),$('span','rr-pulse-fit',item.race_pace.before),$('span','rr-pulse-arrow-mark','→'),$('span','rr-pulse-fit',item.race_pace.after));return el;}
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
      if(odds&&odds!=='—'){
        const old=item.metric?.label==='WIN'?globalThis.RRRaceTitles.formatFairOdds({win_probability_exact:item.metric.before}):null;
        out.push(old&&old!=='—'&&old!==odds?['Fair Odds',old+' → '+odds]:['Revised Fair Odds',odds]);
      }
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
    top.append($('p','rr-pulse-track',raceHeader(item).toUpperCase()),signalBadge(item));
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
    // Editorial copy: preserve certified wording and emphasize only the featured identity.
    // Use text nodes, never HTML from a feed.
    const message=String(item.short_message||item.message||'');
    const editorial=$('p','rr-pulse-message');
    const horse=String(item.horse||'').trim(),program=String(item.chip||'').trim();
    const identityText=horse&&program?'#'+program+' '+horse:horse;
    const phrase=identityText&&message.includes(identityText)?identityText:horse&&message.includes(horse)?horse:'';
    if(phrase){
      const at=message.indexOf(phrase);
      const featured=$('strong','rr-pulse-message-horse');
      if(program&&phrase===identityText){
        const mini=$('span','rr-pulse-saddle--inline');mini.append(chip(program));featured.append(mini,document.createTextNode(' '+horse));
      }else featured.textContent=phrase;
      editorial.append(document.createTextNode(message.slice(0,at)),featured,document.createTextNode(message.slice(at+phrase.length)));
    }else editorial.textContent=message;
    body.append(editorial);
    if(!detailMode){const full=$('p','rr-pulse-expanded-message',item.message);full.hidden=true;body.append(full);}
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
    const original=$('a','rr-pulse-story-link',detailMode?'Intelligence Hub':'Open Pulse');original.href=detailMode?'/store/':pulseUrl(item);
    if(!detailMode){original.setAttribute('aria-expanded','false');original.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||!matchMedia('(min-width:641px)').matches)return;e.preventDefault();if(expanded===article)collapseInsight();else expandInsight(article);});}
    const paid=$('a','rr-pulse-paid-link','Full-Field Analysis');paid.href=typeof item.hub_url==='string'&&item.hub_url.startsWith('/')&&!item.hub_url.startsWith('//')?item.hub_url:'/store/';
    links.append(original,paid);footer.append(links,shareTools(item));article.append(footer);
    // Mobile homepage shows the entire essential insight; full actions live on the detail page.
    if(detailMode)return article;
    const compact=$('a','rr-pulse-compact-open','Open Pulse');compact.href=pulseUrl(item);
    const compactActions=$('div','rr-pulse-compact-actions');
    compactActions.append(compact,shareTools(item));
    const scratchesRow=article.querySelector('.rr-pulse-scratch-list');
    if(scratchesRow)scratchesRow.append(compactActions);else {const compactRow=$('div','rr-pulse-compact-row');compactRow.append(compactActions);article.append(compactRow);}
    return article;
  }
  function expandInsight(article){
    if(expanded)collapseInsight();
    selected=[...rail.children].indexOf(article);if(selected<0)return;
    expanded=article;closeShare?.();shell.classList.add('rr-pulse-expanded');article.classList.add('rr-pulse-is-expanded');
    article.querySelector('.rr-pulse-expanded-message').hidden=false;
    const link=article.querySelector('.rr-pulse-story-link');link.textContent='Back to Pulse';link.setAttribute('aria-expanded','true');
    prev.disabled=true;next.disabled=true;rail.scrollTo({left:0,behavior:'instant'});fitActiveCard();link.focus({preventScroll:true});
  }
  function collapseInsight(restoreFocus=true){
    if(!expanded)return;const article=expanded;expanded=null;closeShare?.();
    shell.classList.remove('rr-pulse-expanded');article.classList.remove('rr-pulse-is-expanded');
    article.querySelector('.rr-pulse-expanded-message').hidden=true;
    const link=article.querySelector('.rr-pulse-story-link');link.textContent='Open Pulse';link.setAttribute('aria-expanded','false');
    scrollToIndex([...rail.children].indexOf(article),'instant');if(restoreFocus)link.focus({preventScroll:true});
  }
  shell.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded&&!closeShare){e.preventDefault();collapseInsight();}});
  let observedCard=null;const cardObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>fitActiveCard()):null;
  function fitActiveCard(){
    if(shell.hidden||!rail.children[selected])return;
    // A single visible card on mobile and desktop hero. Do not reserve the height of an offscreen long card.
    const card=rail.children[selected];if(observedCard!==card){cardObserver?.disconnect();cardObserver?.observe(card);observedCard=card;}
    if(matchMedia('(max-width:640px), (min-width:1121px)').matches){const compact=!detailMode&&matchMedia('(max-width:640px)').matches;const height=Math.ceil(card.getBoundingClientRect().height)+(compact?4:12);const value=height+'px';if(rail.style.height!==value)rail.style.height=value;}else rail.style.height='';
  }
  window.addEventListener('resize',()=>{if(expanded&&!matchMedia('(min-width:641px)').matches)collapseInsight(false);fitActiveCard();},{passive:true});
  function scrollToIndex(index,behavior='smooth'){
    if(!rail.children.length||expanded)return;
    selected=Math.max(0,Math.min(index,rail.children.length-1));
    const el=rail.children[selected];
    rail.scrollTo({left:rail.scrollLeft+el.getBoundingClientRect().left-rail.getBoundingClientRect().left,behavior});
    prev.disabled=selected===0;next.disabled=selected===rail.children.length-1;updatePosition();fitActiveCard();
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
    if(expanded)return;
    let best=0,distance=Infinity;
    [...rail.children].forEach((el,i)=>{const x=Math.abs(el.getBoundingClientRect().left-rail.getBoundingClientRect().left);if(x<distance){best=i;distance=x;}});
    selected=best;prev.disabled=selected===0;next.disabled=selected===rail.children.length-1;updatePosition();fitActiveCard();
  },{passive:true});
  async function load(){
    if(pending)return;pending=true;
    try{
      const response=await fetch('/api/race-day-pulse',{cache:'no-store'});
      if(!response.ok)throw Error('Feed unavailable');
      const data=await response.json(),raw=Array.isArray(data.items)?data.items:[];
      const valid=raw.filter(x=>x&&typeof x.id==='string'&&/^[a-z0-9-]+$/.test(x.id)&&
        typeof x.message==='string'&&typeof x.track==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date));
      if(!valid.length){collapseInsight(false);closeShare?.();shell.hidden=true;events=[];revision='';return;}
      const key=JSON.stringify(valid);
      if(key===revision)return;
      const activeId=events[selected]?.id;const wasExpanded=!!expanded;collapseInsight(false);closeShare?.();revision=key;events=valid;rail.replaceChildren(...valid.map(buildCard));
      status.textContent=data.preview?'Design preview':valid.length+' verified '+(valid.length===1?'insight':'insights')+' today';
      shell.hidden=false;scrollToIndex(0,'instant');
      const focus=new URL(location.href).searchParams.get('pulse');
      const idx=valid.findIndex(item=>item.id===focus);
      const retained=valid.findIndex(item=>item.id===activeId);if(retained>=0){scrollToIndex(retained,'instant');if(wasExpanded&&matchMedia('(min-width:641px)').matches)expandInsight(rail.children[retained]);}else if(idx>=0)scrollToIndex(idx,'instant');
    }catch{if(!events.length)shell.hidden=true;}
    finally{pending=false;}
  }
  const liveLogo=shell.querySelector('.rr-pulse-logo');if(liveLogo)transparentLogo().then(art=>{liveLogo.src=art.toDataURL('image/png');}).catch(()=>{});
  // Reuse the existing sitewide North American tote formatting authority.
  import('/assets/rr-race-titles.js').catch(()=>{}).finally(()=>{
    if(detailMode){try{const item=JSON.parse(shell.dataset.pulseItem);rail.replaceChildren(buildCard(item));shell.hidden=false;scrollToIndex(0,'instant');}catch(error){console.warn('Pulse detail unavailable',error.message);}return;}
    load();setInterval(load,60000);
  });
  if(!detailMode&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    setInterval(()=>{if(!matchMedia('(max-width:640px)').matches&&!shell.hidden&&!paused&&!expanded&&!closeShare&&!document.hidden&&rail.children.length>1)scrollToIndex((selected+1)%rail.children.length);},6500);
  }
})();
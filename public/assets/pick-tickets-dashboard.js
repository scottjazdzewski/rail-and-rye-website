/* Rail & Rye Pick Tickets — private review UI, data always fetched from protected API. */
(()=>{"use strict";
 const $=s=>document.querySelector(s);
 const elements={status:$("#rr-pt-status"),app:$("#rr-pt-app"),date:$("#rr-pt-date"),track:$("#rr-pt-track"),filter:$("#rr-pt-filter"),list:$("#rr-pt-list"),updated:$("#rr-pt-updated"),empty:$("#rr-pt-empty"),dialog:$("#rr-pt-dialog"),detail:$("#rr-pt-detail"),title:$("#rr-pt-dialog-title")};
 let cards=[],selected=null;
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
 const money=cents=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
 const label=code=>code==="LEAN"?"Lean Ticket":code==="FULL_COVERAGE"?"Full Coverage":"Best Possible Ticket";
 const statusLabel=code=>code==="PLAY"?"PLAY":code==="PASS"?"PASS":"CONDITIONAL";
 const publicationLabel=code=>code==="scratch_updated"?"SCRATCH UPDATED":"INITIAL · CURRENT";
 const fmtDate=s=>{if(!s)return "";const d=new Date(s+"T12:00:00Z");return Number.isNaN(d.getTime())?s:new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d);};
 function option(select,value,name){const o=el("option","",name);o.value=value;select.append(o);}
 function chip(program){
  const wrap=el("span","rr-pt-chip"),match=/^([0-9]{1,2})([A-Z]?)$/.exec(program);
  const number=match?Number(match[1]):null;
  if(number!==null&&number>=1&&number<=20){
   const img=el("img");img.src="/assets/approved/saddlecloths/"+number+".png";img.alt="";img.width=34;img.height=34;img.decoding="async";wrap.append(img);
   if(match[2])wrap.append(el("span","rr-pt-chip-suffix",match[2]));
  }else wrap.append(el("span","rr-pt-chip-fallback",program));
  wrap.setAttribute("aria-label","Saddlecloth "+program);
  return wrap;
 }
 function ticketBox(ticket){
  const panel=el("section","rr-pt-ticket");
  const head=el("div","rr-pt-ticket-head");
  const titles=el("div","rr-pt-ticket-labels");
  titles.append(el("span","rr-pt-ticket-role",label(ticket.role)),el("h3","",ticket.title));
  head.append(titles);
  const costs=el("span","rr-pt-ticket-cost",money(ticket.total_cents));head.append(costs);panel.append(head);
  const legs=el("div","rr-pt-legs");
  for(const leg of ticket.legs){
   const box=el("div","rr-pt-leg"),title=el("span","rr-pt-leg-title","RACE "+leg.race_number),chips=el("div","rr-pt-leg-chips");
   for(const number of leg.programs)chips.append(chip(number));
   box.append(title,chips);legs.append(box);
  }
  panel.append(legs);
  const footer=el("div","rr-pt-ticket-metrics");
  footer.append(el("span","","COMBINATIONS "+ticket.combinations),el("span","","BASE "+money(ticket.unit_cents)));
  panel.append(footer);
  if(ticket.notes)panel.append(el("p","rr-pt-ticket-notes",ticket.notes));
  return panel;
 }
 function openDetails(sequence,card){
  elements.detail.replaceChildren();
  elements.title.textContent=sequence.name+" · Races "+sequence.start_race+"–"+sequence.end_race;
  const meta=el("div","rr-pt-detail-meta");
  const state=el("span","rr-pt-state",statusLabel(sequence.play_status));state.dataset.status=sequence.play_status;
  meta.append(state,el("span","",card.track+" · "+fmtDate(card.date)),el("span","",publicationLabel(card.status)));
  elements.detail.append(meta);
  if(sequence.hit_rate_display)elements.detail.append(el("p","rr-pt-hit","Model hit rate: "+sequence.hit_rate_display));
  if(sequence.recommendation)elements.detail.append(el("p","rr-pt-reason",sequence.recommendation));
  const grid=el("div","rr-pt-ticket-grid");
  sequence.tickets.forEach(t=>grid.append(ticketBox(t)));
  elements.detail.append(grid);
  const receipt=el("p","rr-pt-receipt","Production receipt: "+card.source_receipt.reference+" · Revision "+card.revision);
  elements.detail.append(receipt);
  if(typeof elements.dialog.showModal==="function")elements.dialog.showModal();
  else elements.dialog.setAttribute("open","");
 }
 function sequenceCard(seq,card){
  const article=el("article","rr-pt-sequence");
  const head=el("div","rr-pt-sequence-head"),copy=el("div","rr-pt-sequence-copy");
  copy.append(el("h2","",seq.name),el("p","","Races "+seq.start_race+"–"+seq.end_race));
  const state=el("span","rr-pt-state",statusLabel(seq.play_status));state.dataset.status=seq.play_status;
  head.append(copy,state);article.append(head);
  if(seq.hit_rate_display){
   const hit=el("div","rr-pt-hit-strip");
   hit.append(el("span","","MODEL HIT RATE"),el("strong","",seq.hit_rate_display));article.append(hit);
  }
  const grid=el("div","rr-pt-ticket-grid");
  for(const ticket of seq.tickets)grid.append(ticketBox(ticket));
  article.append(grid);
  if(seq.recommendation)article.append(el("p","rr-pt-summary",seq.recommendation));
  const detail=el("button","rr-pt-detail-button","Full Sequence Analysis");
  detail.type="button";detail.addEventListener("click",()=>openDetails(seq,card));article.append(detail);
  return article;
 }
 function updateTracks(){
  const date=elements.date.value,old=elements.track.value;
  const tracks=cards.filter(r=>r.card.date===date).map(r=>r.card.track);
  elements.track.replaceChildren();
  for(const track of tracks)option(elements.track,track,track);
  elements.track.value=tracks.includes(old)?old:(tracks[0]||"");
  render();
 }
 function render(){
  selected=cards.find(c=>c.card.date===elements.date.value&&c.card.track===elements.track.value)||null;
  elements.list.replaceChildren();
  elements.empty.hidden=!!selected;elements.app.hidden=!selected;
  if(!selected)return;
  const {card,updated_at}=selected;
  const status=publicationLabel(card.status);
  const updated=updated_at?new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(updated_at))+" ET":"Not yet recorded";
  elements.updated.textContent=status+" · "+card.track+" · "+fmtDate(card.date)+" · Revision "+card.revision+" · Updated "+updated;
  const filter=elements.filter.value;
  const sequences=card.sequences.filter(s=>filter==="ALL"||s.play_status===filter);
  if(!sequences.length)elements.list.append(el("p","rr-pt-no-results","No sequences match this filter."));
  sequences.forEach(s=>elements.list.append(sequenceCard(s,card)));
 }
 async function api(url,init){
  const r=await fetch(url,{credentials:"same-origin",cache:"no-store",...init});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(body.error||(r.status===401?"Administrator sign-in required.":"Request failed."));
  return body;
 }
 async function load(){
  elements.status.hidden=false;elements.status.textContent="Loading private Pick Tickets editions…";
  try{
   const result=await api("/api/admin/pick-tickets");
   cards=result.cards||[];
   const date=elements.date.value;
   elements.date.replaceChildren();
   for(const d of [...new Set(cards.map(r=>r.card.date))])option(elements.date,d,fmtDate(d));
   elements.date.value=cards.some(c=>c.card.date===date)?date:(cards[0]?.card.date||"");
   elements.status.hidden=true;
   updateTracks();
  }catch(e){
   elements.app.hidden=true;elements.empty.hidden=true;elements.status.textContent=e.message;
  }
 }
 elements.date.addEventListener("change",updateTracks);
 elements.track.addEventListener("change",render);
 elements.filter.addEventListener("change",render);
 $("#rr-pt-close").addEventListener("click",()=>elements.dialog.close());
 elements.dialog.addEventListener("click",e=>{if(e.target===elements.dialog)elements.dialog.close();});
 $("#rr-pt-upload").addEventListener("click",async()=>{
  const file=$("#rr-pt-file").files?.[0],button=$("#rr-pt-upload");
  if(!file){elements.status.hidden=false;elements.status.textContent="Choose a certified Pick Tickets JSON export first.";return;}
  if(file.size>3*1024*1024){elements.status.hidden=false;elements.status.textContent="Upload exceeds 3MB.";return;}
  button.disabled=true;elements.status.hidden=false;elements.status.textContent="Validating and storing in private R2…";
  try{
   const content=await file.text();
   const result=await api("/api/admin/pick-tickets",{method:"POST",headers:{"Content-Type":"application/json"},body:content});
   await load();
   elements.status.hidden=false;elements.status.textContent="Private QA saved: "+result.updated.length+" updated, "+result.unchanged+" unchanged. No customer launch.";
  }catch(e){elements.status.hidden=false;elements.status.textContent="Upload rejected: "+e.message;}
  finally{button.disabled=false;}
 });
 load();
})();
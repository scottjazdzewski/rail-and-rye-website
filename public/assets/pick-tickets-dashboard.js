/* Rail & Rye / Pick Tickets — one track, wager type, and selectable sequence at a time.
 * Every real value must originate from the protected source-certified API.
 * Mock selections can be served ONLY by the administrator demo endpoint.
 */
(()=>{"use strict";
 const $=s=>document.querySelector(s);
 const E={
  status:$("#rr-pt-status"),app:$("#rr-pt-app"),date:$("#rr-pt-date"),track:$("#rr-pt-track"),
  source:$("#rr-pt-source"),types:$("#rr-pt-types"),sequences:$("#rr-pt-sequences"),
  updated:$("#rr-pt-updated"),current:$("#rr-pt-current"),mock:$("#rr-pt-mock"),
  empty:$("#rr-pt-empty"),dialog:$("#rr-pt-dialog"),dialogTitle:$("#rr-pt-dialog-title"),
  dialogBody:$("#rr-pt-detail"),upload:$("#rr-pt-upload"),file:$("#rr-pt-file")
 };
 let certified=[],demo=[],entries=[],activeSeq=null,activeTier=0,currentIsDemo=true;
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
 const money=cents=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
 const toDate=v=>{const d=new Date(v+"T12:00:00Z");return Number.isNaN(d.valueOf())?v:new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d)};
 const ticketLabel=role=>({LEAN:"Lean Ticket",FULL_COVERAGE:"Full Coverage",BEST_POSSIBLE:"Best Possible Ticket"}[role]||role);
 const titleKind=n=>({3:"Pick 3",4:"Pick 4",5:"Pick 5",6:"Pick 6"}[n]||"Pick "+n);
 const sequenceKey=s=>s.name+"|"+s.start_race+"|"+s.end_race;
 const numberFrom=seq=>seq.end_race-seq.start_race+1;
 const statusText=s=>({PLAY:"PLAY",PASS:"PASS",CONDITIONAL:"CONDITIONAL"}[s]||s);
 const option=(select,key,label)=>{const o=node("option","",label);o.value=key;select.append(o)};
 const setMessage=(text,visible=true)=>{E.status.hidden=!visible;E.status.textContent=text;};
 const escapeText=String;
 function programChip(p){
  const wrap=node("span","rr-pt-chip"),m=/^([0-9]{1,2})([A-Z]?)$/i.exec(p);
  const number=m?Number(m[1]):0;
  if(number>=1&&number<=20){
   const img=node("img");img.src="/assets/approved/saddlecloths/"+number+".png";
   img.alt="";img.width=36;img.height=36;img.loading="lazy";wrap.append(img);
   if(m[2])wrap.append(node("span","rr-pt-chip-suffix",m[2]));
  }else wrap.append(node("span","rr-pt-chip-fallback",p));
  wrap.setAttribute("role","img");wrap.setAttribute("aria-label","Horse "+p);
  return wrap;
 }
 function state(s){
  const chip=node("span","rr-pt-state",statusText(s));
  chip.dataset.status=s;return chip;
 }
 function ticketRows(ticket){
  const rows=node("div","rr-pt-race-rows");
  for(const leg of ticket.legs){
   const row=node("div","rr-pt-race-row"),name=node("span","rr-pt-row-race","RACE "+leg.race_number),chips=node("div","rr-pt-row-chips");
   for(const p of leg.programs)chips.append(programChip(p));
   row.append(name,chips);rows.append(row);
  }
  return rows;
 }
 function tierPicker(seq,chosen,onChange){
  const buttons=node("div","rr-pt-tier-tabs");buttons.setAttribute("role","group");
  buttons.setAttribute("aria-label","Choose ticket version");
  if(seq.tickets.length===1)return buttons;
  seq.tickets.forEach((ticket,i)=>{
   const b=node("button","rr-pt-tier",ticketLabel(ticket.role));b.type="button";
   b.setAttribute("aria-pressed",String(i===chosen));
   b.addEventListener("click",()=>onChange(i));
   buttons.append(b);
  });
  return buttons;
 }
 function stats(ticket){
  const band=node("div","rr-pt-ticket-stats");
  const items=[
   ["COMBINATIONS",String(ticket.combinations)],
   ["BASE WAGER",money(ticket.unit_cents)],
   ["TOTAL COST",money(ticket.total_cents)]
  ];
  items.forEach(([k,v],i)=>{
   const item=node("div","rr-pt-stat"+(i===2?" rr-pt-total-stat":""));
   item.append(node("span","",k),node("strong","",v));band.append(item);
  });
  return band;
 }
 function renderActive(){
  if(!activeSeq)return;
  E.current.replaceChildren();
  const c=entries.find(x=>x.card.track===E.track.value&&x.card.date===E.date.value)?.card;
  if(!c)return;
  const box=node("section","rr-pt-ticket-screen");
  const head=node("div","rr-pt-ticket-header");
  const left=node("div","rr-pt-ticket-title");
  left.append(node("span","rr-pt-kicker",currentIsDemo?"MOCK TICKET · DISPLAY ONLY":"CERTIFIED SOURCE TICKET"));
  left.append(node("h2","",activeSeq.name+" · Races "+activeSeq.start_race+"–"+activeSeq.end_race));
  const right=state(activeSeq.play_status);
  head.append(left,right);box.append(head);

  const chosen=activeSeq.tickets[activeTier]||activeSeq.tickets[0];
  if(activeSeq.tickets.length>1){
   box.append(tierPicker(activeSeq,activeTier,i=>{activeTier=i;renderActive()}));
  }
  const meta=node("div","rr-pt-wager-meta");
  meta.append(node("span","rr-pt-wager-name",chosen.title));
  const prob=activeSeq.hit_rate_display
   ? "PROJECTED HIT "+activeSeq.hit_rate_display
   : (currentIsDemo?"HIT RATE — NOT MODELED":"HIT RATE — NOT SUPPLIED");
  meta.append(node("span","rr-pt-probability",prob));box.append(meta);
  box.append(ticketRows(chosen),stats(chosen));
  if(activeSeq.play_status==="PASS"){
   box.append(node("p","rr-pt-pass-note",currentIsDemo
    ?"DEMONSTRATION PASS · Best possible mock ticket shown for layout review only."
    :"PASS — not recommended. Source-certified best possible ticket shown for completeness."));
  }
  const actions=node("div","rr-pt-ticket-actions");
  const analysis=node("button","rr-pt-analysis-button","Full Ticket Analysis");
  analysis.type="button";analysis.addEventListener("click",()=>openAnalysis());
  actions.append(analysis);box.append(actions);E.current.append(box);
  const header=E.current.querySelector(".rr-pt-ticket-header");
  if(header)header.setAttribute("tabindex","-1");
 }
 function openAnalysis(){
  if(!activeSeq)return;
  const c=entries.find(x=>x.card.track===E.track.value&&x.card.date===E.date.value)?.card;
  if(!c)return;
  E.dialogBody.replaceChildren();
  E.dialogTitle.textContent=activeSeq.name+" · Races "+activeSeq.start_race+"–"+activeSeq.end_race;
  const info=node("div","rr-pt-dialog-info");
  info.append(state(activeSeq.play_status),node("span","",c.track+" · "+toDate(c.date)));
  E.dialogBody.append(info);
  if(currentIsDemo)E.dialogBody.append(node("p","rr-pt-demo-note","DEMONSTRATION ONLY. These are mock selections, not TRI predictions or approved wagers."));
  if(activeSeq.hit_rate_display)E.dialogBody.append(node("p","rr-pt-analysis-rate","Projected hit rate: "+activeSeq.hit_rate_display));
  if(activeSeq.recommendation)E.dialogBody.append(node("p","rr-pt-analysis-reason",activeSeq.recommendation));
  const stage=node("div","rr-pt-analysis-stage");
  function show(i){
   stage.replaceChildren();
   stage.append(tierPicker(activeSeq,i,show));
   stage.append(node("h3","rr-pt-analysis-tier",activeSeq.tickets[i].title));
   stage.append(ticketRows(activeSeq.tickets[i]),stats(activeSeq.tickets[i]));
   if(activeSeq.tickets[i].notes)stage.append(node("p","rr-pt-analysis-notes",activeSeq.tickets[i].notes));
  }
  show(activeTier);E.dialogBody.append(stage);
  if(!currentIsDemo)E.dialogBody.append(node("p","rr-pt-receipt","Production receipt "+c.source_receipt.reference+" · Revision "+c.revision));
  E.dialog.showModal();
 }
 function availableSequences(){
  const chosen=entries.find(x=>x.card.date===E.date.value&&x.card.track===E.track.value);
  return chosen?.card?.sequences||[];
 }
 function renderTypes(){
  const seq=availableSequences(),prev=Number(E.types.dataset.selected||0);
  const types=[...new Set(seq.map(numberFrom))].sort((a,b)=>a-b);
  E.types.replaceChildren();const selected=types.includes(prev)?prev:(types.includes(3)?3:(types[0]||0));
  E.types.dataset.selected=selected;
  for(const count of types){
   const b=node("button","rr-pt-type",titleKind(count));b.type="button";
   b.setAttribute("aria-pressed",String(count===selected));
   b.setAttribute("aria-label",titleKind(count)+": "+seq.filter(s=>numberFrom(s)===count).length+" available sequences");
   b.addEventListener("click",()=>{
    E.types.dataset.selected=count;renderTypes();
   });
   E.types.append(b);
  }
  renderSequenceTabs(selected);
 }
 function renderSequenceTabs(count){
  const seq=availableSequences().filter(s=>numberFrom(s)===count);
  const prior=activeSeq?sequenceKey(activeSeq):"";
  const selected=seq.find(s=>sequenceKey(s)===prior)||seq[0]||null;
  E.sequences.replaceChildren();
  seq.forEach(s=>{
   const button=node("button","rr-pt-sequence-tab");
   button.type="button";button.setAttribute("aria-pressed",String(s===selected));
   button.setAttribute("aria-label",s.name+" Races "+s.start_race+"–"+s.end_race+" "+statusText(s.play_status));
   button.append(node("span","rr-pt-seq-range","Races "+s.start_race+"–"+s.end_race),state(s.play_status));
   button.addEventListener("click",()=>selectSequence(s));
   E.sequences.append(button);
  });
  activeSeq=selected;activeTier=0;renderActive();
 }
 function selectSequence(s){
  activeSeq=s;activeTier=0;
  [...E.sequences.children].forEach((b,i)=>b.setAttribute("aria-pressed",String(b.getAttribute("aria-label")?.includes("Races "+s.start_race+"–"+s.end_race))));
  renderActive();
 }
 function updateTrack(){
  const date=E.date.value,old=E.track.value;
  const tracks=[...new Set(entries.filter(x=>x.card.date===date).map(x=>x.card.track))].sort();
  E.track.replaceChildren();tracks.forEach(x=>option(E.track,x,x));
  E.track.value=tracks.includes(old)?old:(tracks[0]||"");
  activeSeq=null;E.types.dataset.selected="3";render();
 }
 function render(){
  const entry=entries.find(x=>x.card.date===E.date.value&&x.card.track===E.track.value);
  E.app.hidden=!entry;E.empty.hidden=!!entry;
  if(!entry)return;
  E.mock.hidden=!currentIsDemo;
  E.updated.textContent=(currentIsDemo?"MOCK PREVIEW · NEVER PUBLISHED":
    (entry.card.status==="scratch_updated"?"SCRATCH UPDATED":"INITIAL · CURRENT")+
    " · REVISION "+entry.card.revision)
    +" · "+entry.card.track+" · "+toDate(entry.card.date);
  renderTypes();
 }
 async function call(url,opts){
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...opts});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"The protected publisher request failed.");
  return data;
 }
 async function load(){
  setMessage("Loading private Pick Tickets…");
  try{
   const [real,sample]=await Promise.all([
    call("/api/admin/pick-tickets"),call("/api/admin/pick-tickets?demo=1")
   ]);
   certified=real.cards||[];demo=sample.cards||[];
   E.source.replaceChildren();
   option(E.source,"demo","Mock layout preview");
   if(certified.length)option(E.source,"certified","Certified private editions");
   if(!certified.length||E.source.value!=="certified")E.source.value="demo";
   useData();
   setMessage("",false);
  }catch(e){E.app.hidden=true;E.empty.hidden=true;setMessage(e.message)}
 }
 function useData(){
  currentIsDemo=E.source.value!=="certified";
  entries=currentIsDemo?demo:certified;activeSeq=null;E.types.dataset.selected="3";
  const dates=[...new Set(entries.map(x=>x.card.date))].sort().reverse();
  const old=E.date.value;
  E.date.replaceChildren();dates.forEach(x=>option(E.date,x,toDate(x)));
  E.date.value=dates.includes(old)?old:(dates[0]||"");
  updateTrack();
 }
 E.date.addEventListener("change",updateTrack);
 E.track.addEventListener("change",()=>{activeSeq=null;E.types.dataset.selected="3";render()});
 E.source.addEventListener("change",useData);
 $("#rr-pt-close").addEventListener("click",()=>E.dialog.close());
 E.dialog.addEventListener("click",event=>{if(event.target===E.dialog)E.dialog.close()});
 E.upload.addEventListener("click",async()=>{
  const file=E.file.files?.[0];if(!file){setMessage("Select a certified source JSON first.");return}
  if(file.size>3*1024*1024){setMessage("The JSON exceeds 3MB.");return}
  E.upload.disabled=true;setMessage("Checking original certified ticket data…");
  try{
   const res=await call("/api/admin/pick-tickets",{method:"POST",headers:{"Content-Type":"application/json"},body:await file.text()});
   await load();setMessage("Private source checked: "+res.updated.length+" saved, "+res.unchanged+" unchanged. Not launched.");
  }catch(e){setMessage("Upload rejected: "+e.message)}finally{E.upload.disabled=false}
 });
 load();
})();
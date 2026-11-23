/* Rail & Rye / Pick Tickets — one track, wager type, and selectable sequence at a time.
 * Every real value must originate from the protected source-certified API.
 * Mock selections can be served ONLY by the administrator demo endpoint.
 */
(()=>{"use strict";
 const $=s=>document.querySelector(s);
 const E={
  status:$("#rr-pt-status"),app:$("#rr-pt-app"),date:$("#rr-pt-date"),track:$("#rr-pt-track"),
  types:$("#rr-pt-types"),sequences:$("#rr-pt-sequences"),
  updated:$("#rr-pt-updated"),current:$("#rr-pt-current"),
  empty:$("#rr-pt-empty"),intakePanel:$("#rr-pt-intake"),brandTrack:$("#rr-pt-brand-track"),brandLogo:$("#rr-pt-track-logo"),
  dialog:$("#rr-pt-dialog"),dialogTitle:$("#rr-pt-dialog-title"),
  dialogBody:$("#rr-pt-detail")
 };
 let certified=[],entries=[],intake=null,scratchUpdate=null,activeSeq=null,activeTier=0;
 let activeMode="rail",builderLegs=[],expandedRaceNumbers=new Set();
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
 const TRACK_LOGOS={"Finger Lakes":"finger-lakes","Mahoning Valley":"mahoning-valley","Mountaineer":"mountaineer","Parx Racing":"parx-racing","Zia Park":"zia-park"};
 const hitRate=t=>t?.hit_rate_display?t.hit_rate_display:"—";
 function reviewHitRate(legs){
  if(!activeSeq?.review_probabilities||!Array.isArray(legs)||!legs.length)return "—";
  let hit=1;
  for(const leg of legs){
   const source=activeSeq.review_probabilities[String(leg.race_number)];
   if(!source||!Array.isArray(leg.programs)||!leg.programs.length)return "—";
   let legMass=0;
   for(const p of leg.programs){
    if(!Object.prototype.hasOwnProperty.call(source,p))return "—";
    const n=source[p];if(typeof n!=="number"||!Number.isFinite(n)||n<0||n>100)return "—";
    legMass+=n;
   }
   if(legMass>100.000001)return "—";
   hit*=legMass/100;
  }
  return (hit*100).toFixed(1)+"%";
 }
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
 function stats(ticket,{custom=false,sourceTicket=null}={}){
  const band=node("div","rr-pt-ticket-stats");
  const values=[
   ["PROJECTED HIT",hitRate(ticket),true],
   ["COMBINATIONS",String(ticket.combinations),false],
   ["BASE WAGER",money(ticket.unit_cents),false],
   ["TOTAL COST",money(ticket.total_cents),false]
  ];
  values.forEach(([k,v,primary],i)=>{
   const item=node("div","rr-pt-stat"+(primary?" rr-pt-hit-stat":"")+(i===3?" rr-pt-total-stat":""));
   item.append(node("span","",k),node("strong","",v));
   if(primary&&v==="—")item.append(node("small","rr-pt-pending","Not available"));
   band.append(item);
  });
  return band;
 }
 const selectedTicket=()=>activeSeq?.tickets[activeTier]||activeSeq?.tickets[0]||null;
 function resetBuilder(){
  const ticket=selectedTicket();
  builderLegs=ticket?ticket.legs.map(l=>({race_number:l.race_number,programs:[...l.programs]})):[];
 }
 function scratchedInRace(race){
  if(scratchUpdate?.date!==E.date.value)return [];
  const track=scratchUpdate.tracks?.find(t=>t.name===E.track.value);
  return track?.scratches?.[String(race)]||[];
 }
 function isScratched(race,program){return scratchedInRace(race).includes(program);}
 function disableScratchButton(button,race,program){
  if(!isScratched(race,program))return false;
  button.disabled=true;button.classList.add("rr-pt-scratched");
  button.setAttribute("aria-disabled","true");
  button.setAttribute("aria-label","Race "+race+" horse "+program+" scratched — unavailable");
  button.title="Scratched — unavailable";
  return true;
 }
 function raceChoices(race){
  const verified=activeSeq?.race_fields?.find(x=>x.race_number===race)?.programs;
  const fromTiers=activeSeq?.tickets.flatMap(t=>t.legs.find(l=>l.race_number===race)?.programs||[])||[];
  const values=verified?.length?verified:fromTiers;
  // Keep the historical program chip in the builder, but prevent selection.
  return [...new Set([...values,...scratchedInRace(race)])]
   .sort((a,b)=>Number.parseInt(a,10)-Number.parseInt(b,10)||a.localeCompare(b));
 }
 function builderTotals(){
  const unit=selectedTicket()?.unit_cents||0;
  const combinations=builderLegs.reduce((n,l)=>n*l.programs.length,1);
  if(!Number.isSafeInteger(combinations)||!Number.isSafeInteger(combinations*unit))return null;
  return {combinations,unit_cents:unit,total_cents:unit*combinations,legs:builderLegs};
 }
 function matchingSourceTicket(){
  const selected=builderLegs.map(l=>[...l.programs].sort().join("|")).join("/");
  return activeSeq.tickets.find(t=>t.legs.map(l=>[...l.programs].sort().join("|")).join("/")===selected
   &&t.unit_cents===selectedTicket().unit_cents)||null;
 }
 function builder(){
  const area=node("div","rr-pt-builder");
  const intro=node("div","rr-pt-builder-intro");
  intro.append(node("strong","","Build Your Ticket"),node("p","",
   "Start with Rail & Rye’s selections. Tap a selected horse to remove it, or add runners to any leg. The original recommendation stays unchanged."));
  area.append(intro);
  if(!activeSeq.race_fields?.length)area.append(node("p","rr-pt-builder-limits",
   "Runner choices are limited to published ticket versions until a certified complete field is available."));
  const rows=node("div","rr-pt-builder-rows");
  for(const leg of builderLegs){
   const row=node("section","rr-pt-builder-row");
   const name=node("span","rr-pt-row-race","RACE "+leg.race_number);
   const body=node("div","rr-pt-builder-leg-body");
   const picks=node("div","rr-pt-builder-chips");
   const chosen=leg.programs.map(program=>{
    const button=node("button","rr-pt-runner-button");
    button.type="button";button.setAttribute("aria-pressed","true");
    button.setAttribute("aria-label","Race "+leg.race_number+" horse "+program+" selected");
    button.append(programChip(program));
    disableScratchButton(button,leg.race_number,program);
    button.addEventListener("click",()=>{if(isScratched(leg.race_number,program))return;leg.programs=leg.programs.filter(x=>x!==program);renderActive()});
    return button;
   });
   if(!chosen.length)picks.append(node("span","rr-pt-unselected","No horses selected"));
   else picks.append(...chosen);
   body.append(picks);
   const extra=raceChoices(leg.race_number).filter(p=>!leg.programs.includes(p));
   if(extra.length){
    const trigger=node("button","rr-pt-add-trigger",
     (expandedRaceNumbers.has(leg.race_number)?"- Hide field":"+ Add runners")+" ("+extra.length+")");
    trigger.type="button";trigger.setAttribute("aria-expanded",String(expandedRaceNumbers.has(leg.race_number)));
    trigger.setAttribute("aria-label","Add runners for Race "+leg.race_number);
    trigger.addEventListener("click",()=>{
     if(expandedRaceNumbers.has(leg.race_number))expandedRaceNumbers.delete(leg.race_number);
     else expandedRaceNumbers.add(leg.race_number);
     renderActive();
    });
    body.append(trigger);
    if(expandedRaceNumbers.has(leg.race_number)){
     const field=node("div","rr-pt-field-grid");
     field.setAttribute("aria-label","Other available runners for Race "+leg.race_number);
     extra.forEach(program=>{
      const button=node("button","rr-pt-runner-button");
      button.type="button";button.setAttribute("aria-pressed","false");
      button.setAttribute("aria-label","Race "+leg.race_number+" horse "+program+" not selected");
      button.append(programChip(program));
      disableScratchButton(button,leg.race_number,program);
      button.addEventListener("click",()=>{if(isScratched(leg.race_number,program))return;leg.programs.push(program);renderActive()});
      field.append(button);
     });
     body.append(field);
    }
   }
   row.append(name,body);rows.append(row);
  }
  area.append(rows);
  const computed=builderTotals();
  if(!computed){area.append(node("p","rr-pt-builder-error","Too many combinations to display safely."));return area;}
  const exact=matchingSourceTicket();
  const comparison=node("div","rr-pt-comparison");
  comparison.append(node("h3","","Ticket Comparison"));
  const table=node("table","rr-pt-compare-table");
  const thead=node("thead"),tr=node("tr");
  for(const label of ["METRIC","RAIL & RYE","YOUR TICKET"])tr.append(node("th","",label));
  thead.append(tr);table.append(thead);
  const body=node("tbody"),original=selectedTicket();
  const rowsData=[
   ["PROJECTED HIT",hitRate(original),activeSeq.review_probabilities?reviewHitRate(computed.legs):exact?hitRate(exact):"—"],
   ["COMBINATIONS",String(original.combinations),String(computed.combinations)],
   ["BASE WAGER",money(original.unit_cents),money(computed.unit_cents)],
   ["TOTAL COST",money(original.total_cents),money(computed.total_cents)],
   ["COST CHANGE","—",(computed.total_cents===original.total_cents?"$0.00":(computed.total_cents>original.total_cents?"+":"−")+money(Math.abs(computed.total_cents-original.total_cents)))]
  ];
  rowsData.forEach(cells=>{
   const line=node("tr");
   line.append(node("th","",cells[0]),node("td","",cells[1]),node("td","",cells[2]));
   body.append(line);
  });
  table.append(body);comparison.append(table);area.append(comparison);
  if(!computed.combinations)area.append(node("p","rr-pt-builder-error","Choose at least one runner in every race."));
  area.append(node("p","rr-pt-builder-disclaimer",activeSeq.review_probabilities
   ?"Projected hit chance uses TRI probabilities and assumes independent race outcomes. Confirm the active field and scratches before wagering; this is an estimate, not a guarantee."
   :exact
    ?"This selection matches a source ticket. Its hit probability is displayed only when provided with that exact ticket."
    :"A verified custom hit probability requires the approved TRI multi-race model. Combinations and total cost update immediately."));
  const reset=node("button","rr-pt-reset-button","Reset to Rail & Rye Selections");
  reset.type="button";reset.addEventListener("click",()=>{resetBuilder();expandedRaceNumbers.clear();renderActive()});
  area.append(reset);return area;
 }
 function modeControls(){
  const modes=node("div","rr-pt-mode-tabs");
  modes.setAttribute("role","group");modes.setAttribute("aria-label","Ticket mode");
  [["rail","Rail & Rye Ticket"],["builder","Build My Ticket"]].forEach(([value,name])=>{
   const b=node("button","rr-pt-mode-button",name);
   b.type="button";b.setAttribute("aria-pressed",String(activeMode===value));
   b.addEventListener("click",()=>{activeMode=value;if(value==="builder"&&!builderLegs.length)resetBuilder();renderActive()});
   modes.append(b);
  });
  return modes;
 }
 // Preserve internal receipt metadata while showing clean customer-facing product language.
 function displayTicketName(ticket){
  const raw=String(ticket?.title||"").trim();
  return /\b(interim|focused)\b|model[ -]coverage/i.test(raw)?"Rail & Rye Ticket":(raw||"Rail & Rye Ticket");
 }
 function displayTicketNote(raw){
  if(typeof raw!=="string"||!raw.trim())return "";
  return raw
   .replace(/^interim focused ticket:\s*/i,"Ticket comparison: ")
   .replace(/^focused interim construction\.\s*/i,"Ticket construction. ")
   .replace(/^interim runner selections; updated model probabilities and finishing order pending\.?/i,
    "Selections reflect reported scratches. Hit probability appears only with a matching TRI score.")
   .replace(/\s*No prediction of return; prescratch model review\.?/gi,"")
   .replace(/\binterim\b/gi,"")
   .replace(/\bprescratch model review\b/gi,"")
   .replace(/\s{2,}/g," ").trim();
 }
 function renderActive(){
  if(!activeSeq)return;
  E.current.replaceChildren();
  const card=entries.find(x=>x.card.track===E.track.value&&x.card.date===E.date.value)?.card;
  if(!card)return;
  const box=node("section","rr-pt-ticket-screen");
  const head=node("div","rr-pt-ticket-header"),left=node("div","rr-pt-ticket-title");
  left.append(node("span","rr-pt-kicker","RAIL & RYE PICK TICKETS"));
  left.append(node("h2","",activeSeq.name+" · Races "+activeSeq.start_race+"–"+activeSeq.end_race));
  head.append(left,state(activeSeq.play_status));
  box.append(head,modeControls());
  if(activeMode==="builder")box.append(builder());
  else{
   const chosen=selectedTicket();
   if(activeSeq.tickets.length>1)box.append(tierPicker(activeSeq,activeTier,i=>{
    activeTier=i;resetBuilder();renderActive();
   }));
   const meta=node("div","rr-pt-wager-meta");
   meta.append(node("span","rr-pt-wager-name",displayTicketName(chosen)));
   box.append(meta,ticketRows(chosen),stats(chosen));
   if(activeSeq.play_status==="PASS")box.append(node("p","rr-pt-pass-note",
    "PASS — not recommended. Best available ticket shown for reference."));
   const actions=node("div","rr-pt-ticket-actions");
   const analysis=node("button","rr-pt-analysis-button","Ticket Insights");
   analysis.type="button";analysis.addEventListener("click",openAnalysis);
   actions.append(analysis);box.append(actions);
  }
  E.current.append(box);
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
  // A sequence-wide legacy percentage must never masquerade as a tier-specific hit rate.
  const publicRecommendation=displayTicketNote(activeSeq.recommendation);
  if(publicRecommendation)E.dialogBody.append(node("p","rr-pt-analysis-reason",publicRecommendation));
  const stage=node("div","rr-pt-analysis-stage");
  function show(i){
   stage.replaceChildren();
   stage.append(tierPicker(activeSeq,i,show));
   stage.append(node("h3","rr-pt-analysis-tier",displayTicketName(activeSeq.tickets[i])));
   if(hitRate(activeSeq.tickets[i])!=="—")stage.append(node("p","rr-pt-analysis-rate","Projected hit chance: "+hitRate(activeSeq.tickets[i])));
   stage.append(ticketRows(activeSeq.tickets[i]),stats(activeSeq.tickets[i]));
   const publicNotes=displayTicketNote(activeSeq.tickets[i].notes);
   if(publicNotes)stage.append(node("p","rr-pt-analysis-notes",publicNotes));
  }
  show(activeTier);E.dialogBody.append(stage);
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
   button.type="button";button.dataset.sequenceKey=sequenceKey(s);
   button.setAttribute("aria-pressed",String(s===selected));
   button.setAttribute("aria-label",s.name+" Races "+s.start_race+"–"+s.end_race+" "+statusText(s.play_status));
   button.append(node("span","rr-pt-seq-range","Races "+s.start_race+"–"+s.end_race),state(s.play_status));
   button.addEventListener("click",()=>selectSequence(s));
   E.sequences.append(button);
  });
  activeSeq=selected;activeTier=0;activeMode="rail";expandedRaceNumbers.clear();resetBuilder();renderActive();
 }
 function selectSequence(s){
  activeSeq=s;activeTier=0;activeMode="rail";expandedRaceNumbers.clear();resetBuilder();
  [...E.sequences.children].forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.sequenceKey===sequenceKey(s))));
  renderActive();
 }
 function updateTrack(){
  const date=E.date.value,old=E.track.value;
  const fromCards=entries.filter(x=>x.card.date===date).map(x=>x.card.track);
  const fromIntake=intake?.date===date?intake.tracks.map(x=>x.name):[];
  const tracks=[...new Set([...fromCards,...fromIntake])].sort();
  E.track.replaceChildren();tracks.forEach(x=>option(E.track,x,x));
  E.track.value=tracks.includes(old)?old:(tracks[0]||"");
  activeSeq=null;E.types.dataset.selected="3";render();
 }
 function renderIntake(){
  if(!E.intakePanel)return;
  E.intakePanel.replaceChildren();
  E.intakePanel.append(node("p","rr-pt-intake-warning","Suggested tickets for this date are being updated."));
 }
 function render(){
  const entry=entries.find(x=>x.card.date===E.date.value&&x.card.track===E.track.value);
  E.app.hidden=!entry;E.empty.hidden=!!entry;
  if(E.brandTrack)E.brandTrack.textContent=E.track.value||"Select track";
  if(E.brandLogo){const slug=TRACK_LOGOS[E.track.value];E.brandLogo.hidden=!slug;
   if(slug){E.brandLogo.src="/assets/approved/track-logos/"+slug+".webp";E.brandLogo.alt=E.track.value+" logo";}}
  if(!entry){renderIntake();return;}
  E.updated.textContent=entry.card.track+" · "+toDate(entry.card.date);
  renderTypes();
 }
 async function call(url,opts){
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...opts});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"The protected publisher request failed.");
  return data;
 }
 async function load(){
  setMessage("Loading Pick Tickets…");
  try{
   const real=await call("/api/admin/pick-tickets");
   certified=(real.cards||[]).filter(entry=>entry?.card?.status!=="demo"&&!entry?.card?.is_demo);
   intake=real.intake||null;scratchUpdate=real.scratch_update||null;
    useData();
    setMessage(certified.length?"":"No Pick Tickets available for this date.",!certified.length);
  }catch(e){E.app.hidden=true;E.empty.hidden=true;setMessage(e.message)}
 }
 function useData(){
  entries=certified;activeSeq=null;E.types.dataset.selected="3";
  const dates=[...new Set([...entries.map(x=>x.card.date),...(intake?[intake.date]:[])])].sort().reverse();
  const old=E.date.value;
  E.date.replaceChildren();dates.forEach(x=>option(E.date,x,toDate(x)));
  E.date.value=dates.includes(old)?old:(dates[0]||"");
  updateTrack();
 }
 E.date.addEventListener("change",updateTrack);
 E.track.addEventListener("change",()=>{activeSeq=null;E.types.dataset.selected="3";render()});
 $("#rr-pt-close").addEventListener("click",()=>E.dialog.close());
 E.dialog.addEventListener("click",event=>{if(event.target===E.dialog)E.dialog.close()});
 load();
})();
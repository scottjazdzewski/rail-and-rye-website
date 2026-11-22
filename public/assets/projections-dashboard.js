(()=>{
"use strict";
const q=(selector,root=document)=>root.querySelector(selector);
const status=q("#rr-dash-status"),app=q("#rr-dash-app"),login=q("#rr-dash-login"),empty=q("#rr-dash-empty");
let cards=[],activeCard=null,activeRace=null;
const api=async url=>{
 const response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(data.error||"Unable to load projections."),{status:response.status});
 return data;
};
const setText=(node,value)=>{node.textContent=String(value??"");};
function dateLabel(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return String(value||"");
 const [year,month,day]=value.split("-").map(Number);
 return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"}).format(new Date(year,month-1,day,12));
}
function timeLabel(value){
 if(!value)return "";
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return String(value);
 return new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(date)+" ET";
}
function option(select,value,label){
 const item=document.createElement("option");item.value=value;item.textContent=label;select.append(item);
}
function datesAvailable(){return [...new Set(cards.map(card=>card.race_date))].sort((a,b)=>b.localeCompare(a));}
function renderDates(preferred){
 const select=q("#rr-dash-date");select.replaceChildren();
 for(const date of datesAvailable())option(select,date,dateLabel(date));
 if(preferred&&datesAvailable().includes(preferred))select.value=preferred;
}
function renderTracks(preferred){
 const date=q("#rr-dash-date").value,select=q("#rr-dash-track");select.replaceChildren();
 const tracks=[...new Set(cards.filter(card=>card.race_date===date).map(card=>card.track||card.card.track_name))].sort((a,b)=>a.localeCompare(b));
 for(const track of tracks)option(select,track,track);
 if(preferred&&tracks.includes(preferred))select.value=preferred;
}
function selectedCard(){
 return cards.find(card=>card.race_date===q("#rr-dash-date").value&&(card.track||card.card.track_name)===q("#rr-dash-track").value)||null;
}
function renderRaceNav(card){
 const nav=q("#rr-dash-races");nav.replaceChildren();
 const races=[...card.card.races].sort((a,b)=>a.race_number-b.race_number);
 for(const race of races){
  const button=document.createElement("button");button.type="button";button.className="rr-dash-race-button";
  button.textContent="Race "+race.race_number;button.setAttribute("aria-current",String(race.race_number===activeRace));
  button.addEventListener("click",()=>{activeRace=race.race_number;renderCard();});
  nav.append(button);
 }
 if(!races.some(race=>race.race_number===activeRace))activeRace=races[0]?.race_number||null;
}
function makeMetric(label,value){
 const span=document.createElement("span");span.className="rr-dash-metric-chip";span.textContent=label+": "+String(value);return span;
}
function renderHorseDialog(entry){
 const dialog=q("#rr-dash-horse-dialog"),title=q("#rr-dash-horse-title"),detail=q("#rr-dash-horse-detail");
 setText(title,(entry.program_number?entry.program_number+". ":"")+entry.horse_name);
 detail.replaceChildren();
 const grid=document.createElement("dl");grid.className="rr-dash-detail-grid";
 const fields=[["Program",entry.program_number],["Rank",entry.rank],["Win probability",entry.win_probability==null?null:String(entry.win_probability)+"%"],["Morning line",entry.morning_line]];
 for(const [label,value] of fields){if(value==null||value==="")continue;const item=document.createElement("div");item.className="rr-dash-detail-value";const dt=document.createElement("dt");dt.textContent=label;const dd=document.createElement("dd");dd.textContent=String(value);item.append(dt,dd);grid.append(item);}
 for(const metric of entry.metrics||[]){const item=document.createElement("div");item.className="rr-dash-detail-value";const dt=document.createElement("dt");dt.textContent=metric.label;const dd=document.createElement("dd");dd.textContent=String(metric.value);item.append(dt,dd);grid.append(item);}
 detail.append(grid);
 if(entry.notes){const notes=document.createElement("p");notes.className="rr-dash-detail-notes";notes.textContent=entry.notes;detail.append(notes);}
 dialog.showModal();
}
function renderCard(){
 activeCard=selectedCard();if(!activeCard)return;
 renderRaceNav(activeCard);
 const race=activeCard.card.races.find(item=>item.race_number===activeRace);if(!race)return;
 const panel=q("#rr-dash-race");panel.replaceChildren();
 const title=document.createElement("div");title.className="rr-dash-race-title";
 const copy=document.createElement("div");const heading=document.createElement("h2");heading.textContent=(activeCard.track||activeCard.card.track_name)+" · Race "+race.race_number;copy.append(heading);
 const meta=[dateLabel(activeCard.race_date),race.post_time_et,race.surface,race.distance,race.conditions].filter(Boolean).join(" · ");
 const subtitle=document.createElement("p");subtitle.className="rr-dash-race-subtitle";subtitle.textContent=meta;copy.append(subtitle);
 if(race.summary){const summary=document.createElement("p");summary.className="rr-dash-race-summary";summary.textContent=race.summary;copy.append(summary);}
 title.append(copy);panel.append(title);
 const horses=q("#rr-dash-horses");horses.replaceChildren();
 const entries=[...race.entries].map((entry,index)=>({entry,index})).sort((a,b)=>(a.entry.rank??999)-(b.entry.rank??999)||a.index-b.index).map(row=>row.entry);
 for(const entry of entries){
  const row=document.createElement("article");row.className="rr-dash-horse-row";
  const button=document.createElement("button");button.type="button";button.className="rr-dash-horse-open";button.setAttribute("aria-label","Details for "+entry.horse_name);
  const program=document.createElement("span");program.className="rr-dash-program";program.textContent=entry.program_number;
  const copy=document.createElement("span");copy.className="rr-dash-horse-copy";
  const name=document.createElement("span");name.className="rr-dash-horse-name";name.textContent=entry.horse_name;
  const sub=document.createElement("span");sub.className="rr-dash-horse-sub";sub.textContent=[entry.rank!=null?"Projected rank "+entry.rank:"",entry.morning_line? "Morning line "+entry.morning_line:""].filter(Boolean).join(" · ");
  copy.append(name);if(sub.textContent)copy.append(sub);button.append(program,copy);button.addEventListener("click",()=>renderHorseDialog(entry));row.append(button);
  if(entry.win_probability!=null){const win=document.createElement("span");win.className="rr-dash-win";win.textContent=String(entry.win_probability)+"%";const small=document.createElement("small");small.textContent="Win probability";win.append(small);row.append(win);}
  const metrics=(entry.metrics||[]).slice(0,3);
  if(metrics.length){const preview=document.createElement("div");preview.className="rr-dash-metric-preview";for(const metric of metrics)preview.append(makeMetric(metric.label,metric.value));row.append(preview);}
  horses.append(row);
 }
 const open=q("#rr-dash-open-pdf"),download=q("#rr-dash-download-pdf");
 open.href="/api/membership/view/"+encodeURIComponent(activeCard.product_id);download.href="/api/membership/download/"+encodeURIComponent(activeCard.product_id);
 setText(q("#rr-dash-update"),activeCard.uploaded_at?"Updated "+timeLabel(activeCard.uploaded_at):"");
 for(const button of q("#rr-dash-races").querySelectorAll("button"))button.setAttribute("aria-current",String(button.textContent==="Race "+activeRace));
}
function onFiltersChanged(){
 const oldTrack=q("#rr-dash-track").value;
 renderTracks(oldTrack);activeCard=selectedCard();activeRace=activeCard?.card.races[0]?.race_number||null;
 if(activeCard)renderCard();
}
async function init(){
 try{
  const data=await api("/api/membership/projections");cards=data.cards||[];
  status.hidden=true;
  if(!cards.length){empty.hidden=false;return;}
  app.hidden=false;renderDates();renderTracks();activeCard=selectedCard();activeRace=activeCard?.card.races[0]?.race_number||null;renderCard();
  q("#rr-dash-date").addEventListener("change",onFiltersChanged);q("#rr-dash-track").addEventListener("change",onFiltersChanged);
 }catch(error){
  status.hidden=true;
  if(error.status===401){login.hidden=false;return;}
  setText(status,error.message||"The dashboard could not load. Please try again.");status.hidden=false;
 }
}
q("#rr-dash-horse-close").addEventListener("click",()=>q("#rr-dash-horse-dialog").close());
init();
})();

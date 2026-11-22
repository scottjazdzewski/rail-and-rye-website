(()=>{
"use strict";
const q=(selector,root=document)=>root.querySelector(selector);
const status=q("#rr-dash-status"),app=q("#rr-dash-app"),login=q("#rr-dash-login"),empty=q("#rr-dash-empty");
const previewMode=document.body.dataset.rrPreview==="true";
let cards=[],activeCard=null,activeRace=null;
const DASH_METRIC_BADGES={"SPEED":"speed","FORM":"form","CLASS":"class","PACE FIT":"pace","SURFACE/DISTANCE":"surface"};
const CARD_METRICS=[
 ["SPEED",["speed","speed figure","speed rating"]],
 ["FORM",["form","recent form"]],
 ["CLASS",["class","class rating"]],
 ["PACE FIT",["pace fit","pace","pacefit"]],
 ["SURFACE/DISTANCE",["surface/distance","surface distance","surface fit","distance fit","track fit"]]
];
const api=async url=>{
 const response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(data.error||"Unable to load projections."),{status:response.status});
 return data;
};
const setText=(node,value)=>{if(node)node.textContent=String(value??"");};
function dateLabel(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return String(value||"");
 const [year,month,day]=value.split("-").map(Number);
 return new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(new Date(year,month-1,day,12));
}
function compactDateLabel(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return String(value||"");
 const [year,month,day]=value.split("-").map(Number);
 return new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date(year,month-1,day,12));
}
function option(select,value,label){const item=document.createElement("option");item.value=value;item.textContent=label;select.append(item);}
function datesAvailable(){return [...new Set(cards.map(card=>card.race_date))].sort((a,b)=>b.localeCompare(a));}
function renderDates(preferred){
 const select=q("#rr-dash-date");select.replaceChildren();
 for(const date of datesAvailable())option(select,date,compactDateLabel(date));
 if(preferred&&datesAvailable().includes(preferred))select.value=preferred;
}
function renderTracks(preferred){
 const date=q("#rr-dash-date").value,select=q("#rr-dash-track");select.replaceChildren();
 const tracks=[...new Set(cards.filter(card=>card.race_date===date).map(card=>card.track||card.card.track_name))].sort((a,b)=>a.localeCompare(b));
 for(const track of tracks)option(select,track,track);
 if(preferred&&tracks.includes(preferred))select.value=preferred;
}
function selectedCard(){return cards.find(card=>card.race_date===q("#rr-dash-date").value&&(card.track||card.card.track_name)===q("#rr-dash-track").value)||null;}
function postTimeMinutes(value){
 const text=String(value||"").replace(/\b(?:ET|EST|EDT)\b/gi,"").trim();
 const match=text.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
 if(!match)return Number.MAX_SAFE_INTEGER;
 let hours=Number(match[1]);const minutes=Number(match[2]),meridiem=String(match[3]||"").toUpperCase();
 if(meridiem)hours=(hours%12)+(meridiem==="PM"?12:0);
 return hours*60+minutes;
}
function racesByPostTime(card){
 return [...(card?.card?.races||[])].sort((a,b)=>{
  const timeA=postTimeMinutes(a.post_time_et||a.post_time||a.postTime),timeB=postTimeMinutes(b.post_time_et||b.post_time||b.postTime);
  return timeA-timeB||(Number(a.race_number)||0)-(Number(b.race_number)||0);
 });
}
function renderRaceTimeSelect(card){
 const select=q("#rr-dash-race-time");if(!select)return;
 select.replaceChildren();
 for(const race of racesByPostTime(card)){
  const time=race.post_time_et||race.post_time||race.postTime||"TIME TBA";
  option(select,String(race.race_number),time+" · RACE "+race.race_number);
 }
 if(activeRace!=null)select.value=String(activeRace);
}
function renderRaceNav(card){
 const nav=q("#rr-dash-races");nav.replaceChildren();
 const races=[...card.card.races].sort((a,b)=>a.race_number-b.race_number);
 for(const race of races){
  const button=document.createElement("button");button.type="button";button.className="rr-dash-race-button";button.setAttribute("aria-label","Race "+race.race_number);button.setAttribute("aria-current",String(race.race_number===activeRace));
  const label=document.createElement("span");label.textContent="RACE";const number=document.createElement("strong");number.textContent=race.race_number;button.append(label,number);
  button.addEventListener("click",()=>{activeRace=race.race_number;renderCard();});nav.append(button);
 }
 if(!races.some(race=>race.race_number===activeRace))activeRace=races[0]?.race_number||null;
}
function normalizeLabel(value){return String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function metricValue(entry,aliases){
 const wanted=aliases.map(normalizeLabel),metrics=entry.metrics||[];
 const found=metrics.find(metric=>wanted.includes(normalizeLabel(metric.label)));
 return found==null?"—":String(found.value);
}
function metricState(value){
 const state=String(value||"").trim().toLowerCase();
 return ["gray","grey","green","red"].includes(state)?(state==="grey"?"gray":state):"";
}
function factBadge(kind,value){
 const text=String(value||"").toLowerCase();
 if(kind==="pace"){
  const match=["strong","moderate","weak"].find(token=>text.includes(token));
  return match?"fact_pace_"+match:"";
 }
 if(kind==="surface"){
  if(text.includes("dirt"))return "fact_surface_dirt";
  if(text.includes("turf"))return "fact_surface_turf";
  if(text.includes("synthetic")||text.includes("all weather")||text.includes("all-weather")||text.includes("tapeta")||text.includes("polytrack"))return "fact_surface_synthetic";
 }
 if(kind==="distance")return "fact_distance";
 return "";
}
function fairOdds(entry){return entry.fair_odds||metricValue(entry,["fair odds"]);}
function makeNode(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
function iconNode(name,className,state){
 if(!name)return null;
 const node=makeNode("span",className);node.setAttribute("aria-hidden","true");
 const image=document.createElement("img");image.src="/assets/approved/factor-badges/"+name+(state?"_"+state:"")+".png";image.alt="";image.loading="lazy";image.decoding="async";
 node.append(image);return node;
}
function makeTile(label,value,iconName){
 const tile=makeNode("div","rr-dash-race-tile"),copy=document.createElement("div");
 tile.setAttribute("aria-label",label+": "+(value||"Not listed"));
 copy.append(makeNode("span","",label),makeNode("strong","",value||"Not listed"));
 const icon=iconNode(iconName,"rr-dash-tile-mark");if(icon)tile.append(icon);tile.append(copy);return tile;
}
function makeMetricGroup(entry){
 const group=makeNode("div","rr-dash-metric-group");group.setAttribute("role","group");group.setAttribute("aria-label","Runner ratings");
 for(const [label,aliases] of CARD_METRICS){
  const value=metricValue(entry,aliases),state=metricState(value),cell=makeNode("div","rr-dash-metric-value");
  cell.dataset.label=label;
  if(state){cell.dataset.state=state;cell.title=label+": "+state;cell.setAttribute("aria-label",label+": "+state);cell.append(iconNode(DASH_METRIC_BADGES[label],"rr-dash-metric-indicator",state));}
  else{cell.textContent=value;cell.setAttribute("aria-label",label+": "+value);}
  group.append(cell);
 }
 return group;
}
function showHorse(entry){
 const dialog=q("#rr-dash-horse-dialog"),title=q("#rr-dash-horse-title"),detail=q("#rr-dash-horse-detail");setText(title,(entry.program_number?"#"+entry.program_number+"  ":"")+entry.horse_name);detail.replaceChildren();
 const grid=document.createElement("dl");grid.className="rr-dash-detail-grid";
 const fields=[["Win probability",entry.win_probability==null?null:String(entry.win_probability)+"%"],["Morning line",entry.morning_line],["Fair odds",fairOdds(entry)],["Trainer",entry.trainer],["Jockey",entry.jockey]];
 for(const [label,value] of fields){if(value==null||value==="")continue;const item=makeNode("div","rr-dash-detail-value"),dt=makeNode("dt","",label),dd=makeNode("dd","",value);item.append(dt,dd);grid.append(item);}
 for(const metric of entry.metrics||[]){
  const item=makeNode("div","rr-dash-detail-value"),dt=makeNode("dt","",metric.label),dd=makeNode("dd","");
  const state=metricState(metric.value);
  if(state)dd.append(makeNode("span","rr-dash-state-pill rr-dash-state-"+state,state.toUpperCase()));
  else dd.textContent=metric.value;
  item.append(dt,dd);grid.append(item);
 }
 detail.append(grid);
 if(entry.notes){const notes=makeNode("p","rr-dash-detail-notes",entry.notes);detail.append(notes);}
 dialog.showModal();
}
function cardHeader(card){
 const wrapper=makeNode("div","rr-dash-card-head"),logo=document.createElement("img");logo.className="rr-dash-card-logo";logo.src="/assets/brand/rail_rye_logo_header.png";logo.alt="Rail & Rye";
 const info=document.createElement("div"),track=makeNode("h2","rr-dash-track-title",card.track||card.card.track_name),date=makeNode("p","rr-dash-card-date",dateLabel(card.race_date));info.append(track,date);
 wrapper.append(logo,info);return wrapper;
}
function scratchList(race){
 const scratches=race.scratches||[];if(!scratches.length)return null;
 const strip=makeNode("div","rr-dash-scratch-strip"),list=makeNode("ul","rr-dash-scratch-list");
 strip.append(makeNode("strong","rr-dash-scratch-label","SCRATCHES"));
 for(const scratch of scratches){
  const item=makeNode("li","rr-dash-scratch-item"),program=String(scratch.program_number||"–"),match=program.match(/^(\d{1,2})([A-Za-z]?)$/),number=match?Number(match[1]):NaN;
  if(Number.isInteger(number)&&number>=1&&number<=20){
   const frame=makeNode("span","rr-dash-scratch-chip-wrap"),chip=document.createElement("img");
   chip.className="rr-dash-scratch-chip";chip.src="/assets/approved/saddlecloths/"+number+".png";chip.alt="Scratched runner "+program;chip.loading="lazy";frame.append(chip);
   if(match[2])frame.append(makeNode("span","rr-dash-scratch-suffix",match[2]));
   item.append(frame);
  }else item.append(makeNode("span","rr-dash-scratch-fallback",program));
  if(scratch.horse_name)item.append(makeNode("span","rr-dash-scratch-name",scratch.horse_name));
  list.append(item);
 }
 strip.append(list);return strip;
}
function raceBanner(race){
 const wrapper=makeNode("div","rr-dash-race-banner"),number=makeNode("div","rr-dash-race-number"),copy=makeNode("div","rr-dash-race-copy"),time=makeNode("div","rr-dash-post-time");
 number.append(makeNode("span","","RACE"),makeNode("strong","",race.race_number));
 const condition=String(race.conditions||"Race projections").trim(),purse=String(race.purse||"").trim();
 const title=makeNode("h3","rr-dash-race-condition");
 const shownPurse=purse&&!condition.toLowerCase().includes(purse.toLowerCase())?purse:"";
 title.setAttribute("aria-label",[condition,shownPurse].filter(Boolean).join(" "));
 title.append(makeNode("span","rr-dash-race-condition-name",condition));
 if(shownPurse)title.append(makeNode("span","rr-dash-race-purse",shownPurse));
 copy.append(title);
 const meta=makeNode("div","rr-dash-race-meta"),runnerCount=(race.entries||[]).length;
 meta.append(makeNode("p","rr-dash-race-runners",runnerCount+" RUNNERS"));
 const scratchCount=race.scratch_count==null?(race.scratches?.length||null):race.scratch_count;
 if(scratchCount!=null)meta.append(makeNode("p","rr-dash-race-scratch-count",scratchCount+" SCRATCH"+(scratchCount===1?"":"ES")));
 copy.append(meta);
 time.append(makeNode("span","","POST TIME"),makeNode("strong","",race.post_time_et||race.post_time||race.postTime||"Not listed"));
 wrapper.append(number,copy,time);return wrapper;
}
function renderCard(){
 activeCard=selectedCard();if(!activeCard)return;
 renderRaceNav(activeCard);renderRaceTimeSelect(activeCard);
 const race=activeCard.card.races.find(item=>item.race_number===activeRace);if(!race)return;
 const panel=q("#rr-dash-race");panel.replaceChildren(cardHeader(activeCard),raceBanner(race));
 const scratches=scratchList(race);if(scratches)panel.append(scratches);
 const tiles=makeNode("div","rr-dash-race-tiles");tiles.append(makeTile("Pace",race.pace,factBadge("pace",race.pace)),makeTile("Surface",race.surface,factBadge("surface",race.surface)),makeTile("Distance",race.distance,factBadge("distance",race.distance)));panel.append(tiles);
 if(race.summary)panel.append(makeNode("p","rr-dash-race-summary",race.summary));
 const table=makeNode("div","rr-dash-table");table.setAttribute("role","table");table.setAttribute("aria-label","Race "+race.race_number+" projections");
 const header=makeNode("div","rr-dash-table-heading");header.setAttribute("role","row");
 for(const label of ["#","HORSE"]){const cell=makeNode("span","",label);cell.setAttribute("role","columnheader");header.append(cell);}
 const metricHead=makeNode("div","rr-dash-metric-group");metricHead.setAttribute("role","group");
 for(const [label] of CARD_METRICS){const cell=makeNode("span","",label);cell.setAttribute("role","columnheader");metricHead.append(cell);}
 header.append(metricHead);const marketHead=makeNode("span","","WIN % · FAIR ODDS");marketHead.setAttribute("role","columnheader");header.append(marketHead);table.append(header);
 const list=makeNode("div","rr-dash-runner-list");list.setAttribute("role","rowgroup");
 let entries=[...race.entries].map((entry,index)=>({entry,index}));
 const query=String(q("#rr-dash-search")?.value||"").trim().toLowerCase();
 if(query)entries=entries.filter(({entry})=>String(entry.horse_name||"").toLowerCase().includes(query)||String(entry.program_number||"").toLowerCase().includes(query));
 if(q("#rr-dash-sort")?.value==="win")entries.sort((a,b)=>(Number(b.entry.win_probability)||0)-(Number(a.entry.win_probability)||0)||a.index-b.index);
 else entries.sort((a,b)=>(a.entry.rank??999)-(b.entry.rank??999)||a.index-b.index);
 for(const {entry} of entries){
  const row=makeNode("div","rr-dash-runner-row");row.setAttribute("role","row");
  const program=makeNode("div","rr-dash-program");program.setAttribute("role","cell");
  const programText=String(entry.program_number||"–"),programMatch=programText.match(/^(\d{1,2})([A-Za-z]?)$/),number=programMatch?Number(programMatch[1]):NaN;
  if(Number.isInteger(number)&&number>=1&&number<=20){
   const frame=makeNode("span","rr-dash-program-chip-wrap"),chip=document.createElement("img");
   chip.src="/assets/approved/saddlecloths/"+number+".png";chip.alt="Saddlecloth "+programText;chip.loading="lazy";frame.append(chip);
   if(programMatch[2])frame.append(makeNode("span","rr-dash-program-suffix",programMatch[2]));
   program.append(frame);
  }else program.append(makeNode("span","rr-dash-program-fallback",programText));
  const horseCell=makeNode("div","rr-dash-runner-cell rr-dash-horse-cell");horseCell.setAttribute("role","cell");
  const horseButton=makeNode("button","rr-dash-horse-open");horseButton.type="button";horseButton.setAttribute("aria-label","Open projection details for "+entry.horse_name);
  const horseHeading=makeNode("span","rr-dash-horse-heading");
  horseHeading.append(makeNode("span","rr-dash-horse-name",entry.horse_name));
  if(entry.morning_line)horseHeading.append(makeNode("span","rr-dash-horse-ml","M/L "+entry.morning_line));
  horseButton.append(horseHeading);
  const connections=[entry.trainer||"",entry.jockey||""].filter(Boolean).join(" | ");
  if(connections)horseButton.append(makeNode("span","rr-dash-horse-connections",connections));
  horseButton.addEventListener("click",()=>showHorse(entry));horseCell.append(horseButton);
  const metricGroup=makeMetricGroup(entry);metricGroup.setAttribute("role","cell");
  const odds=fairOdds(entry)||"—",win=makeNode("div","rr-dash-win");win.setAttribute("role","cell");
  win.setAttribute("aria-label",(entry.win_probability==null?"No win probability":String(entry.win_probability)+"% win probability")+"; fair odds "+odds);
  win.append(makeNode("strong","rr-dash-win-percent",entry.win_probability==null?"—":String(entry.win_probability)+"%"));
  win.append(makeNode("small","rr-dash-win-fair","FAIR "+odds));
  row.append(program,horseCell,metricGroup,win);list.append(row);
 }
 if(!entries.length)list.append(makeNode("div","rr-dash-no-data","No runners match that search."));
 table.append(list);q("#rr-dash-horses").replaceChildren(table);
 const open=q("#rr-dash-open-pdf"),download=q("#rr-dash-download-pdf"),hasPdf=!!activeCard.product_id;
 for(const button of [open,download])button.hidden=!hasPdf;
 if(hasPdf&&previewMode){
  for(const button of [open,download]){button.removeAttribute("href");button.setAttribute("aria-disabled","true");}
  setText(open,"PDF opens after launch");setText(download,"PDF download after launch");
 }else if(hasPdf){
  open.href="/api/membership/view/"+encodeURIComponent(activeCard.product_id);download.href="/api/membership/download/"+encodeURIComponent(activeCard.product_id);
  open.removeAttribute("aria-disabled");download.removeAttribute("aria-disabled");
  setText(open,"Open full PDF");setText(download,"Download PDF");
 }
 setText(q("#rr-dash-update"),activeCard.uploaded_at?"Projection updated "+new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(activeCard.uploaded_at))+" ET":previewMode?"Private admin preview":"");
 for(const button of q("#rr-dash-races").querySelectorAll("button"))button.setAttribute("aria-current",String(Number(button.getAttribute("aria-label").replace("Race ",""))===activeRace));
}
function onFiltersChanged(){
 const oldTrack=q("#rr-dash-track").value;renderTracks(oldTrack);activeCard=selectedCard();activeRace=racesByPostTime(activeCard)[0]?.race_number||null;if(activeCard)renderCard();
}
async function init(){
 try{
  if(previewMode){const data=await api("/api/admin/projections-preview");cards=data.cards||[];}
  else {const data=await api("/api/membership/projections");cards=data.cards||[];}
  status.hidden=true;
  if(!cards.length){empty.hidden=false;return;}
  app.hidden=false;renderDates();renderTracks();activeCard=selectedCard();activeRace=racesByPostTime(activeCard)[0]?.race_number||null;renderCard();
  q("#rr-dash-date").addEventListener("change",onFiltersChanged);q("#rr-dash-track").addEventListener("change",onFiltersChanged);
  q("#rr-dash-race-time").addEventListener("change",()=>{activeRace=Number(q("#rr-dash-race-time").value);renderCard();});
  q("#rr-dash-search").addEventListener("input",renderCard);q("#rr-dash-sort").addEventListener("change",renderCard);
 }catch(error){
  status.hidden=true;
  if(error.status===401){login.hidden=false;return;}
  setText(status,error.message||"The dashboard could not load. Please try again.");status.hidden=false;
 }
}
q("#rr-dash-horse-close").addEventListener("click",()=>q("#rr-dash-horse-dialog").close());
init();
})();

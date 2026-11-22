(()=>{
"use strict";
const q=(selector,root=document)=>root.querySelector(selector);
const status=q("#rr-dash-status"),app=q("#rr-dash-app"),login=q("#rr-dash-login"),empty=q("#rr-dash-empty");
const previewMode=document.body.dataset.rrPreview==="true";
let cards=[],activeCard=null,activeRace=null;
const CARD_METRICS=[
 ["SPEED",["speed","speed figure","speed rating"]],
 ["FORM",["form","recent form"]],
 ["CLASS",["class","class rating"]],
 ["PACE FIT",["pace fit","pace","pacefit"]],
 ["SURFACE/DISTANCE",["surface/distance","surface distance","surface fit","distance fit","track fit"]]
];
const previewCard={schema_version:1,race_date:"2026-11-22",track_name:"Belmont Park · Preview",races:[
 {race_number:1,post_time_et:"12:40 PM",surface:"Dirt",distance:"6 1/2 Furlongs",conditions:"Maiden Special Weight",pace:"Moderate",scratch_count:1,summary:"Sample only: a balanced early pace with the strongest projected finish from the first flight.",entries:[
  {program_number:"4",horse_name:"Harbor Signal",rank:1,win_probability:35.9,morning_line:"5-2",fair_odds:"9/5",metrics:[{label:"SPEED",value:"Strong"},{label:"FORM",value:"Steady"},{label:"CLASS",value:"Fits"},{label:"PACE FIT",value:"Moderate"},{label:"SURFACE/DISTANCE",value:"Positive"}],notes:"Fictional sample runner. The live view will show the exact notes and metrics from your finalized export."},
  {program_number:"5",horse_name:"Amber Banner",rank:2,win_probability:23.2,morning_line:"3-1",fair_odds:"7/2",metrics:[{label:"SPEED",value:"Above avg."},{label:"FORM",value:"Improving"},{label:"CLASS",value:"Fits"},{label:"PACE FIT",value:"Positive"},{label:"SURFACE/DISTANCE",value:"Neutral"}],notes:"Fictional sample data."},
  {program_number:"2",horse_name:"Blue Measure",rank:3,win_probability:17.4,morning_line:"5-1",fair_odds:"9/2",metrics:[{label:"SPEED",value:"Competitive"},{label:"FORM",value:"Steady"},{label:"CLASS",value:"Strong"},{label:"PACE FIT",value:"Neutral"},{label:"SURFACE/DISTANCE",value:"Positive"}],notes:"Fictional sample data."},
  {program_number:"3",horse_name:"Quiet Harbor",rank:4,win_probability:14.9,morning_line:"8-1",fair_odds:"6/1",metrics:[{label:"SPEED",value:"Competitive"},{label:"FORM",value:"Mixed"},{label:"CLASS",value:"Fits"},{label:"PACE FIT",value:"Needs help"},{label:"SURFACE/DISTANCE",value:"Positive"}],notes:"Fictional sample data."},
  {program_number:"6",horse_name:"Crown Ledger",rank:5,win_probability:8.6,morning_line:"10-1",fair_odds:"11/1",metrics:[{label:"SPEED",value:"Developing"},{label:"FORM",value:"Improving"},{label:"CLASS",value:"Test"},{label:"PACE FIT",value:"Neutral"},{label:"SURFACE/DISTANCE",value:"Unclear"}],notes:"Fictional sample data."}
 ]},
 {race_number:2,post_time_et:"1:12 PM",surface:"Turf",distance:"1 Mile",conditions:"Allowance Optional Claiming",pace:"Honest",scratch_count:0,summary:"Second sample race to show race switching. These runners and figures are fictional.",entries:[
  {program_number:"1",horse_name:"Rye Field",rank:1,win_probability:29.4,morning_line:"3-1",fair_odds:"5/2",metrics:[{label:"SPEED",value:"Strong"},{label:"FORM",value:"Improving"},{label:"CLASS",value:"Fits"},{label:"PACE FIT",value:"Positive"},{label:"SURFACE/DISTANCE",value:"Strong"}],notes:"Fictional sample data."},
  {program_number:"7",horse_name:"Golden Rail",rank:2,win_probability:24.1,morning_line:"4-1",fair_odds:"3/1",metrics:[{label:"SPEED",value:"Competitive"},{label:"FORM",value:"Steady"},{label:"CLASS",value:"Strong"},{label:"PACE FIT",value:"Neutral"},{label:"SURFACE/DISTANCE",value:"Positive"}],notes:"Fictional sample data."},
  {program_number:"3",horse_name:"Autumn Circuit",rank:3,win_probability:18.7,morning_line:"5-1",fair_odds:"9/2",metrics:[{label:"SPEED",value:"Competitive"},{label:"FORM",value:"Improving"},{label:"CLASS",value:"Fits"},{label:"PACE FIT",value:"Moderate"},{label:"SURFACE/DISTANCE",value:"Positive"}],notes:"Fictional sample data."}
 ]},
 {race_number:3,post_time_et:"1:44 PM",surface:"Dirt",distance:"7 Furlongs",conditions:"Stakes · 3-Year-Olds",pace:"Fast",scratch_count:0,summary:"Race-level overview can sit above the field while each runner opens its own analysis.",entries:[
  {program_number:"8",horse_name:"Copper Current",rank:1,win_probability:31.2,morning_line:"2-1",fair_odds:"2/1",metrics:[{label:"SPEED",value:"Strong"},{label:"FORM",value:"Strong"},{label:"CLASS",value:"Strong"},{label:"PACE FIT",value:"Positive"},{label:"SURFACE/DISTANCE",value:"Positive"}],notes:"Fictional sample data."},
  {program_number:"2",horse_name:"Blue Standard",rank:2,win_probability:25.6,morning_line:"3-1",fair_odds:"3/1",metrics:[{label:"SPEED",value:"Above avg."},{label:"FORM",value:"Steady"},{label:"CLASS",value:"Fits"},{label:"PACE FIT",value:"Needs help"},{label:"SURFACE/DISTANCE",value:"Positive"}],notes:"Fictional sample data."},
  {program_number:"5",horse_name:"Final Crossing",rank:3,win_probability:17.8,morning_line:"5-1",fair_odds:"9/2",metrics:[{label:"SPEED",value:"Competitive"},{label:"FORM",value:"Improving"},{label:"CLASS",value:"Fits"},{label:"PACE FIT",value:"Positive"},{label:"SURFACE/DISTANCE",value:"Neutral"}],notes:"Fictional sample data."}
 ]}
]};
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
function option(select,value,label){const item=document.createElement("option");item.value=value;item.textContent=label;select.append(item);}
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
function selectedCard(){return cards.find(card=>card.race_date===q("#rr-dash-date").value&&(card.track||card.card.track_name)===q("#rr-dash-track").value)||null;}
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
function fairOdds(entry){return entry.fair_odds||metricValue(entry,["fair odds"]);}
function makeNode(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
function makeTile(label,value,mark){
 const tile=makeNode("div","rr-dash-race-tile"),icon=makeNode("span","rr-dash-tile-mark",mark),copy=document.createElement("div");
 copy.append(makeNode("span","",label),makeNode("strong","",value||"Not listed"));tile.append(icon,copy);return tile;
}
function makeMetricGroup(entry){
 const group=makeNode("div","rr-dash-metric-group");group.setAttribute("role","group");group.setAttribute("aria-label","Runner ratings");
 for(const [label,aliases] of CARD_METRICS){
  const cell=makeNode("div","rr-dash-metric-value",metricValue(entry,aliases));cell.dataset.label=label;cell.setAttribute("aria-label",label+": "+cell.textContent);group.append(cell);
 }
 return group;
}
function showHorse(entry){
 const dialog=q("#rr-dash-horse-dialog"),title=q("#rr-dash-horse-title"),detail=q("#rr-dash-horse-detail");
 setText(title,(entry.program_number?"#"+entry.program_number+"  ":"")+entry.horse_name);detail.replaceChildren();
 const grid=document.createElement("dl");grid.className="rr-dash-detail-grid";
 const fields=[["Projected rank",entry.rank],["Win probability",entry.win_probability==null?null:String(entry.win_probability)+"%"],["Fair odds",fairOdds(entry)],["Morning line",entry.morning_line]];
 for(const [label,value] of fields){if(value==null||value==="")continue;const item=makeNode("div","rr-dash-detail-value"),dt=makeNode("dt","",label),dd=makeNode("dd","",value);item.append(dt,dd);grid.append(item);}
 for(const metric of entry.metrics||[]){const item=makeNode("div","rr-dash-detail-value"),dt=makeNode("dt","",metric.label),dd=makeNode("dd","",metric.value);item.append(dt,dd);grid.append(item);}
 detail.append(grid);
 if(entry.notes){const notes=makeNode("p","rr-dash-detail-notes",entry.notes);detail.append(notes);}
 dialog.showModal();
}
function cardHeader(card,race){
 const wrapper=makeNode("div","rr-dash-card-head"),logo=document.createElement("img");logo.className="rr-dash-card-logo";logo.src="/assets/brand/rail_rye_official_horseshoe_logo.png";logo.alt="Rail & Rye";
 const info=document.createElement("div"),track=makeNode("h2","rr-dash-track-title",card.track||card.card.track_name),date=makeNode("p","rr-dash-card-date",dateLabel(card.race_date));info.append(track,date);
 const mark=makeNode("div","rr-dash-track-mark"),badge=document.createElement("img");badge.src="/assets/approved/racing-wire/badges/racetrack.png";badge.alt="";mark.append(badge,makeNode("span","",card.track||card.card.track_name));
 wrapper.append(logo,info,mark);return wrapper;
}
function raceBanner(race){
 const wrapper=makeNode("div","rr-dash-race-banner"),number=makeNode("div","rr-dash-race-number"),copy=document.createElement("div"),time=makeNode("div","rr-dash-post-time");
 number.append(makeNode("span","","RACE"),makeNode("strong","",race.race_number));
 copy.append(makeNode("h3","rr-dash-race-condition",race.conditions||"Race projections"),makeNode("p","rr-dash-race-runners",(race.entries||[]).length+" RUNNERS"));
 if(race.scratch_count!=null)copy.append(makeNode("p","rr-dash-race-scratches",race.scratch_count+" SCRATCH"+(race.scratch_count===1?"":"ES")));
 time.append(makeNode("span","","POST TIME"),makeNode("strong","",race.post_time_et||"—"));
 wrapper.append(number,copy,time);return wrapper;
}
function renderCard(){
 activeCard=selectedCard();if(!activeCard)return;
 renderRaceNav(activeCard);
 const race=activeCard.card.races.find(item=>item.race_number===activeRace);if(!race)return;
 const panel=q("#rr-dash-race");panel.replaceChildren(cardHeader(activeCard,race),raceBanner(race));
 const tiles=makeNode("div","rr-dash-race-tiles");tiles.append(makeTile("Pace",race.pace,"P"),makeTile("Surface",race.surface,"S"),makeTile("Distance",race.distance,"D"));panel.append(tiles);
 if(race.summary)panel.append(makeNode("p","rr-dash-race-summary",race.summary));
 const table=makeNode("div","rr-dash-table");table.setAttribute("role","table");table.setAttribute("aria-label","Race "+race.race_number+" projections");
 const header=makeNode("div","rr-dash-table-heading");header.setAttribute("role","row");
 for(const label of ["#","HORSE"]){const cell=makeNode("span","",label);cell.setAttribute("role","columnheader");header.append(cell);}
 const metricHead=makeNode("div","rr-dash-metric-group");metricHead.setAttribute("role","group");
 for(const [label] of CARD_METRICS){const cell=makeNode("span","",label);cell.setAttribute("role","columnheader");metricHead.append(cell);}
 header.append(metricHead);for(const label of ["WIN %","FAIR ODDS"]){const cell=makeNode("span","",label);cell.setAttribute("role","columnheader");header.append(cell);}table.append(header);
 const list=makeNode("div","rr-dash-runner-list");list.setAttribute("role","rowgroup");
 let entries=[...race.entries].map((entry,index)=>({entry,index}));
 const query=String(q("#rr-dash-search")?.value||"").trim().toLowerCase();
 if(query)entries=entries.filter(({entry})=>String(entry.horse_name||"").toLowerCase().includes(query)||String(entry.program_number||"").toLowerCase().includes(query));
 if(q("#rr-dash-sort")?.value==="win")entries.sort((a,b)=>(Number(b.entry.win_probability)||0)-(Number(a.entry.win_probability)||0)||a.index-b.index);
 else entries.sort((a,b)=>(a.entry.rank??999)-(b.entry.rank??999)||a.index-b.index);
 for(const {entry} of entries){
  const row=makeNode("div","rr-dash-runner-row");row.setAttribute("role","row");
  const program=makeNode("div","rr-dash-program");program.setAttribute("role","cell");
  const number=Number(entry.program_number),chip=document.createElement("img");
  if(Number.isInteger(number)&&number>=1&&number<=20){chip.src="/assets/approved/saddlecloths/"+number+".png";chip.alt="Saddlecloth "+entry.program_number;chip.loading="lazy";program.append(chip);}
  else program.append(makeNode("span","rr-dash-program-fallback",entry.program_number||"–"));
  const horseCell=makeNode("div","rr-dash-runner-cell rr-dash-horse-cell");horseCell.setAttribute("role","cell");
  const horseButton=makeNode("button","rr-dash-horse-open");horseButton.type="button";horseButton.setAttribute("aria-label","Open projection details for "+entry.horse_name);
  horseButton.append(makeNode("span","rr-dash-horse-name",entry.horse_name));
  const sub=[entry.rank!=null?"Rank "+entry.rank:"",entry.morning_line?"M/L "+entry.morning_line:""].filter(Boolean).join(" · ");
  if(sub)horseButton.append(makeNode("span","rr-dash-horse-sub",sub));
  horseButton.addEventListener("click",()=>showHorse(entry));horseCell.append(horseButton);
  const metricGroup=makeMetricGroup(entry);metricGroup.setAttribute("role","cell");
  const win=makeNode("div","rr-dash-win",entry.win_probability==null?"—":String(entry.win_probability)+"%");win.setAttribute("role","cell");win.setAttribute("aria-label","Win probability");
  const odds=makeNode("div","rr-dash-fair",fairOdds(entry)==="—"?"—":fairOdds(entry));odds.setAttribute("role","cell");odds.setAttribute("aria-label","Fair odds");
  row.append(program,horseCell,metricGroup,win,odds);list.append(row);
 }
 if(!entries.length)list.append(makeNode("div","rr-dash-no-data","No runners match that search."));
 table.append(list);q("#rr-dash-horses").replaceChildren(table);
 const open=q("#rr-dash-open-pdf"),download=q("#rr-dash-download-pdf");
 if(previewMode){
  for(const button of [open,download]){button.removeAttribute("href");button.setAttribute("aria-disabled","true");}
  setText(open,"PDF opens after launch");setText(download,"PDF download after launch");
 }else{
  open.href="/api/membership/view/"+encodeURIComponent(activeCard.product_id);download.href="/api/membership/download/"+encodeURIComponent(activeCard.product_id);
  open.removeAttribute("aria-disabled");download.removeAttribute("aria-disabled");
  setText(open,"Open full PDF");setText(download,"Download PDF");
 }
 setText(q("#rr-dash-update"),activeCard.uploaded_at?"Projection updated "+new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(activeCard.uploaded_at))+" ET":previewMode?"Layout preview · sample data":"");
 for(const button of q("#rr-dash-races").querySelectorAll("button"))button.setAttribute("aria-current",String(Number(button.getAttribute("aria-label").replace("Race ",""))===activeRace));
}
function onFiltersChanged(){
 const oldTrack=q("#rr-dash-track").value;renderTracks(oldTrack);activeCard=selectedCard();activeRace=activeCard?.card.races[0]?.race_number||null;if(activeCard)renderCard();
}
async function init(){
 try{
  if(previewMode){cards=[{product_id:"preview",title:"Illustrative sample",track:previewCard.track_name,race_date:previewCard.race_date,uploaded_at:null,card:previewCard}];}
  else {const data=await api("/api/membership/projections");cards=data.cards||[];}
  status.hidden=true;
  if(!cards.length){empty.hidden=false;return;}
  app.hidden=false;renderDates();renderTracks();activeCard=selectedCard();activeRace=activeCard?.card.races[0]?.race_number||null;renderCard();
  q("#rr-dash-date").addEventListener("change",onFiltersChanged);q("#rr-dash-track").addEventListener("change",onFiltersChanged);
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

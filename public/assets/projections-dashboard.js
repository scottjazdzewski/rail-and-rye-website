(()=>{
"use strict";
const q=(selector,root=document)=>root.querySelector(selector);
const status=q("#rr-dash-status"),app=q("#rr-dash-app"),login=q("#rr-dash-login"),empty=q("#rr-dash-empty");
const previewMode=document.body.dataset.rrPreview==="true";
let cards=[],activeCard=null,activeRace=null,viewMode="track",timeline=[];
const CARD_METRICS=[
 ["SPEED",["speed","speed figure","speed rating"],"speed"],
 ["FORM",["form","recent form"],"form"],
 ["CLASS",["class","class rating"],"class"],
 ["PACE FIT",["pace fit","pace","pacefit"],"pace"],
 ["SURFACE/DISTANCE",["surface/distance","surface distance","surface fit","distance fit","track fit"],"surface"]
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
 return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"}).format(new Date(year,month-1,day,12));
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
function timeLabel(race){return race.post_time_et||race.post_time||race.postTime||"TIME TBA";}
// Parse only the explicit purse field; never infer from claiming price or class.
function purseAmount(value){
 const raw=String(value??"").trim();
 const match=raw.match(/^(?:USD\s*)?\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*([KM])?(?:\s*USD)?$/i);
 if(!match)return null;
 const amount=Number(match[1].replace(/,/g,""))*({K:1000,M:1000000}[String(match[2]||"").toUpperCase()]||1);
 return Number.isFinite(amount)&&amount>0?amount:null;
}
function raceTimeline(){
 const date=q("#rr-dash-date").value;
 const minimum=viewMode==="purse"?Number(q("#rr-dash-min-purse")?.value||0):0;
 const stakesOnly=viewMode==="purse"&&!!q("#rr-dash-stakes-only")?.checked;
 return cards.filter(card=>card.race_date===date).flatMap(card=>
  (card.card?.races||[]).map(race=>({card,race,at:postTimeMinutes(timeLabel(race))})))
 .filter(({race})=>viewMode!=="purse"||((minimum===0||(purseAmount(race.purse)??-1)>=minimum)&&(!stakesOnly||globalThis.RRRaceTitles?.describe?.(race)?.stakes===true)))
 .sort((a,b)=>(viewMode==="purse"?((purseAmount(b.race.purse)??-1)-(purseAmount(a.race.purse)??-1)):0)||a.at-b.at||
  (a.card.track||a.card.card.track_name).localeCompare(b.card.track||b.card.card.track_name)||
  a.race.race_number-b.race.race_number);
}
// One visual language for BOTH race tabs and horses. Race numbers show
// the corresponding authentic approved saddlecloth asset, never a simulated
// navy/gold race plaque with competing legacy border/padding styles.
function approvedRaceSaddle(raceNumber){
 const number=Number(raceNumber);
 if(Number.isInteger(number)&&number>=1&&number<=20){
  const img=document.createElement("img");
  img.className="rr-race-saddle-image";
  img.src="/assets/approved/saddlecloths/"+number+".png";
  img.alt="";img.loading="lazy";img.decoding="async";
  return img;
 }
 return makeNode("span","rr-race-saddle-fallback",String(raceNumber));
}
function compactRaceTitle(value){
 const title=String(value||"").trim();
 const match=title.match(/^(Maiden Special Weight|Maiden Optional Claiming|Maiden Claiming|Maiden Allowance|Allowance Optional Claiming|Starter Optional Claiming|Starter Allowance|Starter Handicap|Optional Claiming|Allowance|Claiming|Maiden|Ratings Handicap)\s+\$\s*\d[\d,]*(?:\.\d+)?\s*[KM]?(?:\s*[-–—/]\s*\$?\s*\d[\d,]*(?:\.\d+)?\s*[KM]?)?$/i);
 return match?match[1]:title;
}
function editorialRacePresentation(race){
 const fromHelper=globalThis.RRRaceTitles?.describe?.(race);
 if(fromHelper&&typeof fromHelper.title==="string"&&fromHelper.title.trim()&&
    !/\b(?:S|Stk|Stks)\.$/i.test(fromHelper.title.trim()))return {...fromHelper,title:compactRaceTitle(fromHelper.title)};
 // Defensive display fallback: if the separate shared helper is blocked,
 // its absence must NEVER expose "First Lady S." to customers again.
 const raw=String(race.stakes_name||race.race_name||race.conditions||"Race projections").trim();
 let title=raw
  .replace(/^Hollywood Gaming\s+(?=Mahoning\b)/i,"")
  .replace(/\s*\(\s*(?:presented|sponsored|powered)\s+by\b[^)]*\)/gi,"")
  .replace(/\s*(?:presented|sponsored|powered)\s+by\b.*$/i,"")
  .replace(/\s*\(\s*(?:G(?:rade)?\.?|Gr\.?)\s*[-:]?\s*(?:III|II|I|[123])\s*\)\s*$/i,"").trim();
 // Capture casing BEFORE replacing "S." with "Stakes", otherwise the
 // newly mixed-case suffix prevents uppercase source names from title-casing.
 const originalLetters=title.replace(/[^A-Za-z]/g,"");
 const originallyAllCaps=originalLetters.length>2&&originalLetters===originalLetters.toUpperCase();
 title=title.replace(/\b(?:Stks?|Stk|S)\.?$/i,"Stakes");
 if(/^Stakes?$/i.test(title.trim()))title="Race "+race.race_number;
 if(originallyAllCaps)
  title=title.toLowerCase().replace(/\b[a-z]/g,letter=>letter.toUpperCase());
 const match=raw.match(/\(\s*(?:G(?:rade)?\.?|Gr\.?)\s*[-:]?\s*(III|II|I|[123])\s*\)/i);
 const grade=match?({I:1,II:2,III:3}[match[1].toUpperCase()]||Number(match[1])):null;
 return {title:compactRaceTitle(title)||"Race projections",grade:Number.isInteger(grade)&&grade>=1&&grade<=3?grade:null};
}
function renderRaceNav(card){
 const nav=q("#rr-dash-races");nav.replaceChildren();
 if(viewMode!=="track"||!card)return;
 const races=racesByPostTime(card);
 if(!races.some(race=>race.race_number===activeRace))activeRace=races[0]?.race_number||null;
 for(const race of races){
  const button=document.createElement("button");button.type="button";
  button.className="rr-dash-race-button rr-race-saddle-tab";
  button.dataset.raceNumber=String(race.race_number);
  button.setAttribute("aria-label","Race "+race.race_number+" · "+timeLabel(race)+" · post-time order");
  button.setAttribute("aria-current",String(race.race_number===activeRace));
  button.append(approvedRaceSaddle(race.race_number));
  button.addEventListener("click",()=>{activeRace=race.race_number;renderCard();});nav.append(button);
 }
}
function renderTimeline(){
 const container=q("#rr-dash-global-timeline"),select=q("#rr-dash-all-races");
 if(!container||!select)return;
 const all=viewMode!=="track";
 container.hidden=!all;
 const filters=q("#rr-dash-purse-filters");if(filters)filters.hidden=viewMode!=="purse";
 setText(q("#rr-dash-timeline-label"),viewMode==="purse"?"Matching races · highest purse first":"All races · chronological post times (ET)");
 q("#rr-dash-races").hidden=all;
 if(!all)return;
 timeline=raceTimeline();
 select.replaceChildren();
 for(let i=0;i<timeline.length;i++){
  const item=timeline[i],track=item.card.track||item.card.card.track_name;
  const purse=viewMode==="purse"&&purseAmount(item.race.purse)!==null?" · "+new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(purseAmount(item.race.purse)):"";
  const presentation=viewMode==="purse"?editorialRacePresentation(item.race):null;
  const grade=presentation?.grade?" · G"+presentation.grade:"";
  const name=presentation?.stakes&&!presentation.missingStakesName?" · "+presentation.title:"";
  const label=viewMode==="purse"?(purse?purse.slice(3):"Purse not listed")+" · "+track+" R"+item.race.race_number+grade+name+" · "+timeLabel(item.race):timeLabel(item.race)+" · "+track+" · Race "+item.race.race_number;
  option(select,String(i),label);
 }
 let index=timeline.findIndex(item=>item.card===activeCard&&item.race.race_number===activeRace);
 if(index<0&&timeline.length){index=0;activeCard=timeline[0].card;activeRace=timeline[0].race.race_number;}
 if(index>=0)select.value=String(index);
 else {activeCard=null;activeRace=null;}
 select.disabled=!timeline.length;
 setText(q("#rr-dash-timeline-count"),timeline.length?((index+1)+" of "+timeline.length+" races · "+new Set(timeline.map(x=>x.card.track||x.card.card.track_name)).size+" tracks"):(viewMode==="purse"?"No races match your filters.":"No races found"));
 select.setAttribute("aria-label",viewMode==="purse"?"Choose race by descending purse":"Choose race from all tracks in post-time order");
 q("#rr-dash-previous-race").setAttribute("aria-label",viewMode==="purse"?"Previous race in purse order":"Previous race in post-time order");
 q("#rr-dash-next-race").setAttribute("aria-label",viewMode==="purse"?"Next race in purse order":"Next race in post-time order");
 q("#rr-dash-previous-race").disabled=index<=0;
 q("#rr-dash-next-race").disabled=index>=timeline.length-1;
}
function selectTimeline(index){
 if(!Number.isInteger(index)||index<0||index>=timeline.length)return;
 activeCard=timeline[index].card;activeRace=timeline[index].race.race_number;
 q("#rr-dash-track").value=activeCard.track||activeCard.card.track_name;
 renderCard();
}
function changeViewMode(next){
 viewMode=["all","purse"].includes(next)?next:"track";
 if(viewMode==="purse"){activeCard=null;activeRace=null;}
 const all=viewMode!=="track";
 app.dataset.mode=viewMode;
 q("#rr-dash-mode-track").setAttribute("aria-pressed",String(!all));
 q("#rr-dash-mode-all").setAttribute("aria-pressed",String(viewMode==="all"));
 q("#rr-dash-mode-purse")?.setAttribute("aria-pressed",String(viewMode==="purse"));
 if(!all){
  const track=activeCard?.track||activeCard?.card?.track_name;
  if(track)q("#rr-dash-track").value=track;
  activeCard=selectedCard();
  if(!activeCard?.card?.races?.some(r=>r.race_number===activeRace))
   activeRace=racesByPostTime(activeCard)[0]?.race_number||null;
 }
 renderCard();
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
// All displays use the shared, source-neutral North American tote scale.
function fairOdds(entry){return globalThis.RRRaceTitles.formatFairOdds(entry);}
function tote(value){return globalThis.RRRaceTitles.formatToteOdds(value);}
function makeNode(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
function iconNode(name,className,state){
 if(!name)return null;
 const node=makeNode("span",className);node.setAttribute("aria-hidden","true");
 const image=document.createElement("img");image.src="/assets/approved/factor-badges/"+name+(state?"_"+state:"")+(name==="fact_pace_strong"? "_forest.svg":".png");image.alt="";image.loading="lazy";image.decoding="async";
 node.append(image);return node;
}
// PDF parity: an unavailable race-level pace projection displays the neutral
// Moderate badge. This is presentation only; leave source pace and runner
// Pace Fit ratings unchanged.
function raceFactDisplayValue(label,value){
 const raw=String(value??"").trim();
 if(label==="Pace"&&(/^(?:[-—–]+|n\/?a|none|unknown|unavailable|not available|not listed|no projection|no pace projection|insufficient(?: pace)? (?:data|evidence)|not enough data(?: available)?(?: to make a pace projection(?: for this race)?)?\.?)$/i.test(raw)||!raw))return "Moderate";
 return raw;
}
function makeTile(label,value){
 const tile=makeNode("div","rr-dash-race-tile"),raw=raceFactDisplayValue(label,value);
 const key=raw.toLowerCase().replace(/[^a-z]+/g," ").trim();
 const art=label==="Pace"?({weak:"fact_pace_weak",moderate:"fact_pace_moderate",strong:"fact_pace_strong"}[key]||""):
  label==="Surface"?({dirt:"fact_surface_dirt",turf:"fact_surface_turf",synthetic:"fact_surface_synthetic","all weather":"fact_surface_synthetic"}[key]||""):
  label==="Distance"?"fact_distance":"";
 const shown=(label==="Pace"||label==="Surface")&&raw
  ?raw.toLowerCase().replace(/\b[a-z]/g,letter=>letter.toUpperCase()):raw||"—";
 tile.setAttribute("role","group");
 tile.dataset.fact=label.toLowerCase();
 tile.dataset.value=key;
 tile.setAttribute("aria-label",label+": "+(shown==="—"?"Not listed":shown));
 tile.append(art?iconNode(art,"rr-dash-tile-mark"):makeNode("span","rr-dash-tile-mark rr-dash-tile-mark--empty"));
 tile.append(makeNode("span","rr-dash-tile-label",label),makeNode("strong","rr-dash-tile-value",shown));
 return tile;
}
function makeMetricGroup(entry){
 const group=makeNode("div","rr-dash-metric-group");group.setAttribute("role","group");group.setAttribute("aria-label","Runner ratings");
 for(const [label,aliases,art] of CARD_METRICS){
  const value=metricValue(entry,aliases),state=metricState(value),cell=makeNode("div","rr-dash-metric-value");
  cell.dataset.label=label;cell.dataset.shortLabel=label==="SURFACE/DISTANCE"?"SURF/DIST":label==="PACE FIT"?"PACE":label;
  if(state){
   cell.dataset.state=state;cell.title=label+": "+state;cell.setAttribute("aria-label",label+": "+state);
   const bars=makeNode("span","rr-dash-metric-bars");bars.setAttribute("aria-hidden","true");
   for(let n=0;n<3;n++)bars.append(makeNode("i","rr-dash-metric-bar"));
   cell.append(bars);
  }else{cell.textContent=value;cell.setAttribute("aria-label",label+": "+value);}
  group.append(cell);
 }
 return group;
}
// Horse intelligence presentation: never modify the published TRI inputs.
function profileNumber(value){
 if(value==null||String(value).trim()==="")return null;
 const number=Number(value);
 return Number.isFinite(number)?number:null;
}
function profileProbability(value){
 const number=profileNumber(value);
 return number!=null&&number>=0&&number<=1?number:null;
}
function profileWin(entry){
 const number=profileNumber(entry.win_probability_exact??entry.win_probability);
 return number!=null&&number>=0&&number<=100?number:null;
}
function profilePercent(value){return value==null?"—":value.toFixed(1)+"%";}
function profileMorningLine(entry){
 const odds=tote(entry.morning_line);
 if(/^(?:EVEN|EVENS|EVS)$/i.test(odds))return 50;
 const match=String(odds).match(/^(\d+(?:\.\d+)?)\s*[-/]\s*(\d+(?:\.\d+)?)$/);
 if(!match)return null;
 const a=Number(match[1]),b=Number(match[2]);
 return a>=0&&b>0?100*b/(a+b):null;
}
function profileSection(label){
 const section=makeNode("section","rr-dash-sheet-section");
 section.append(makeNode("h3","",label));return section;
}
function profileBar(label,value,kind=""){
 const row=makeNode("div","rr-profile-bar-row"+(kind?" rr-profile-bar-"+kind:""));
 const track=makeNode("div","rr-profile-bar-track"),fill=makeNode("div","rr-profile-bar-fill");
 track.setAttribute("aria-hidden","true");
 if(value!=null)fill.style.width=Math.max(0,Math.min(100,value))+"%";
 track.append(fill);row.append(makeNode("span","rr-profile-bar-label",label),track,makeNode("strong","rr-profile-bar-number",profilePercent(value)));
 return row;
}
function profileChip(entry){
 const chip=makeNode("span","rr-dash-sheet-chip"),program=String(entry.program_number||"");
 const parsed=program.match(/^(\d{1,2})([A-Za-z]?)$/),number=parsed?Number(parsed[1]):NaN;
 if(Number.isInteger(number)&&number>=1&&number<=20){
  const image=document.createElement("img");image.src="/assets/approved/saddlecloths/"+number+".png";image.alt="Saddlecloth "+program;chip.append(image);
  if(parsed[2])chip.append(makeNode("span","rr-dash-sheet-chip-suffix",parsed[2]));
 }else chip.append(makeNode("strong","",program||"—"));
 return chip;
}
function showHorse(entry){
 const dialog=q("#rr-dash-horse-dialog"),title=q("#rr-dash-horse-title"),detail=q("#rr-dash-horse-detail");
 title.replaceChildren(profileChip(entry),makeNode("span","rr-dash-horse-name",entry.horse_name));
 detail.replaceChildren();
 const mobile=makeNode("div","rr-dash-mobile-analysis rr-profile");
 const race=activeCard?.card?.races?.find(item=>item.race_number===activeRace);
 const win=profileWin(entry),ml=profileMorningLine(entry);
 const summary=makeNode("div","rr-profile-panel rr-profile-summary");
 const connections=[entry.trainer,entry.jockey].filter(Boolean);
 if(connections.length)summary.append(makeNode("p","rr-profile-connections",[entry.trainer&&"Trainer: "+entry.trainer,entry.jockey&&"Jockey: "+entry.jockey].filter(Boolean).join(" · ")));
 if(Number.isInteger(entry.rank)&&entry.rank>0&&race?.entries?.length>=entry.rank)
  summary.append(makeNode("p","rr-profile-rank","Projected finish: "+entry.rank+" of "+race.entries.length));
 const stats=makeNode("div","rr-profile-stats");
 for(const [label,value] of [["WIN PROJECTION",profilePercent(win)],["FAIR ODDS",fairOdds(entry)||"—"],["MORNING LINE",tote(entry.morning_line)||"—"]]){
  const cell=makeNode("div","rr-profile-stat");
  cell.append(makeNode("span","",label),makeNode("strong","",value));stats.append(cell);
 }
 summary.append(stats);
 if(win!=null&&ml!=null){
  const comparison=makeNode("div","rr-profile-comparison");
  comparison.append(profileBar("TRI projection",win,"tri"),profileBar("M/L implied",ml,"market"));
  const delta=win-ml;
  comparison.append(makeNode("p","rr-profile-delta", (delta>0?"+":"")+delta.toFixed(1)+" percentage points vs morning line"));
  comparison.append(makeNode("p","rr-profile-caption","Morning line is an estimate, not live market odds."));
  summary.append(comparison);
 }
 mobile.append(summary);
 const factorNames=["Speed","Current form","Class","Pace compatibility","Surface & distance"];
 const readings=CARD_METRICS.map(([label,aliases],i)=>({label:factorNames[i],value:metricValue(entry,aliases),state:metricState(metricValue(entry,aliases))}));
 const favorable=readings.filter(x=>x.state==="green").map(x=>x.label),unfavorable=readings.filter(x=>x.state==="red").map(x=>x.label),neutral=readings.filter(x=>x.state==="gray").map(x=>x.label);
 if(favorable.length||unfavorable.length||neutral.length){
  const section=profileSection("TRI INTELLIGENCE");
  const panel=makeNode("div","rr-profile-panel rr-profile-insights");
  for(const [label,values,kind] of [["Strengths",favorable,"green"],["Vulnerabilities",unfavorable,"red"],["Neutral factors",neutral,"gray"]]){
   if(!values.length)continue;
   const row=makeNode("p","rr-profile-insight rr-profile-insight-"+kind);
   row.append(makeNode("strong","",label+": "),makeNode("span","",values.join(", ")));panel.append(row);
  }
  if(win!=null&&ml!=null)panel.append(makeNode("p","rr-profile-caption","TRI estimates "+profilePercent(win)+" to win, versus "+profilePercent(ml)+" implied by the morning line."));
  section.append(panel);mobile.append(section);
 }
 if(entry.f4_probabilities){
  const f4=entry.f4_probabilities;
  const exact=[1,2,3,4].map(n=>profileProbability(f4["exact_p"+n]));
  const fifth=profileProbability(f4.exact_p5),sixth=profileProbability(f4.p6_plus),top4=profileProbability(f4.top4);
  const tail=fifth!=null&&sixth!=null?profileProbability(fifth+sixth):top4!=null?1-top4:null;
  const section=profileSection("PROJECTED FINISH DISTRIBUTION");
  const rows=makeNode("div","rr-profile-panel rr-profile-distribution");
  for(const [label,value,kind] of [["1st",exact[0],"win"],["2nd",exact[1],""],["3rd",exact[2],""],["4th",exact[3],""],["5th or later",tail,"tail"]]){
   rows.append(profileBar(label,value==null?null:100*value,kind));
  }
  const totals=makeNode("div","rr-profile-totals");
  for(const n of [2,3,4]){
   const probability=profileProbability(f4["top"+n]),value=probability==null?null:100*probability;
   const cell=makeNode("div","rr-profile-total"),ring=makeNode("div","rr-profile-ring");
   ring.style.background=value==null?"#e8e4db":"conic-gradient(#b58a36 "+value+"%, #e8e4db 0)";
   ring.append(makeNode("strong","",profilePercent(value)));
   cell.append(ring,makeNode("span","","TOP "+n));totals.append(cell);
  }
  rows.append(totals);section.append(rows);mobile.append(section);
 }
 const factors=profileSection("PERFORMANCE PROFILE");
 const factorList=makeNode("div","rr-profile-panel rr-profile-factors");
 for(const {label,value,state} of readings){
  const item=makeNode("div","rr-profile-factor");
  const status=makeNode("span","rr-profile-factor-status rr-dash-sheet-factor-"+(state||"gray"),({green:"Favorable",gray:"Neutral",red:"Unfavorable"}[state]||value));
  if(state){const dot=makeNode("span","rr-profile-dot rr-profile-dot-"+state);dot.setAttribute("aria-hidden","true");item.append(dot);}
  else item.append(makeNode("span","rr-profile-dot rr-profile-dot-unknown"));
  item.append(makeNode("strong","",label),status);factorList.append(item);
 }
 factors.append(factorList);mobile.append(factors);
 if(race){
  const section=profileSection("RACE CONTEXT");
  const facts=makeNode("div","rr-dash-race-tiles rr-dash-sheet-facts");
  facts.setAttribute("role","group");facts.setAttribute("aria-label","Race facts");
  facts.append(makeTile("Pace",race.pace),makeTile("Surface",race.surface),makeTile("Distance",globalThis.RRRaceTitles?.formatDistance?.(race.distance)??race.distance));
  section.append(facts);mobile.append(section);
 }
 if(entry.notes){
  const notes=makeNode("details","rr-profile-panel rr-profile-notes");
  notes.append(makeNode("summary","","Additional analysis"),makeNode("p","rr-dash-sheet-notes",entry.notes));
  mobile.append(notes);
 }
 detail.append(mobile);dialog.scrollTop=0;dialog.showModal();
}
function cardHeader(card){
 const wrapper=makeNode("div","rrp-track-head");
 const name=card.track||card.card.track_name,
  identity=makeNode("div","rrp-track-head__identity"),
  title=makeNode("h2","rrp-track-head__name",name),
  date=makeNode("p","rrp-track-head__date",dateLabel(card.race_date));
 identity.append(title,date);wrapper.append(identity);
 return wrapper;
}
function scratchList(race){
 const scratches=Array.isArray(race.scratches)?race.scratches:[];
 const count=race.scratch_count==null?scratches.length:Number(race.scratch_count)||0;
 // One fixed-height lane whether or not the race has scratches.
 const strip=makeNode("div","rrp-race-head__scratch-bar rr-dash-scratch-strip"),
  list=makeNode("ul","rrp-race-head__scratch-chips rr-dash-scratch-list");
 if(!scratches.length&&!count){
  strip.dataset.empty="true";
  strip.setAttribute("aria-label","No scratches listed");
  strip.append(makeNode("strong","rrp-race-head__scratch-count rr-dash-race-scratch-count","NO SCRATCHES LISTED"));
  return strip;
 }
 strip.setAttribute("aria-label",count+" scratch"+(count===1?"":"es"));
 list.setAttribute("tabindex","0");
 strip.append(makeNode("strong","rrp-race-head__scratch-count rr-dash-race-scratch-count",count+" SCRATCH"+(count===1?"":"ES")));
 strip.append(makeNode("span","rrp-race-head__scratch-rule"));
 for(const scratch of scratches){
  const program=String(scratch.program_number??"").trim(),
   horse=String(scratch.horse_name||"").trim(),
   match=program.match(/^([0-9]{1,2})([A-Za-z]?)$/),
   number=match?Number(match[1]):NaN,
   item=makeNode("li","rrp-race-head__scratch-item rr-dash-scratch-item");
  item.title="#"+program+(horse?" "+horse:"")+" — scratched";
  item.setAttribute("aria-label","Scratched: #"+program+(horse?" "+horse:""));
  if(Number.isInteger(number)&&number>=1&&number<=20){
   const frame=makeNode("span","rrp-race-head__scratch-chip rr-dash-scratch-chip-wrap"),chip=document.createElement("img");
   chip.className="rrp-race-head__scratch-img rr-dash-scratch-chip";
   chip.src="/assets/approved/saddlecloths/"+number+".png";
   chip.alt="";chip.width=29;chip.height=29;chip.loading="lazy";chip.decoding="async";
   frame.append(chip);
   if(match[2])frame.append(makeNode("span","rrp-race-head__scratch-suffix rr-dash-scratch-suffix",match[2]));
   item.append(frame);
  }else item.append(makeNode("span","rrp-race-head__scratch-fallback rr-dash-scratch-fallback",program||"–"));
  list.append(item);
 }
 strip.append(list);return strip;
}
function raceBanner(race){
 const wrapper=makeNode("section","rrp-race-head rr-dash-race-banner"),
  titleRow=makeNode("div","rrp-race-head__title-row"),
  number=makeNode("div","rrp-race-head__number rr-dash-race-number rr-race-saddle-header");
 number.setAttribute("role","img");
 number.setAttribute("aria-label","Race "+race.race_number);
 number.append(approvedRaceSaddle(race.race_number));
 const presentation=editorialRacePresentation(race);
 if(presentation.title.length>28)wrapper.className+=" rr-dash-race-banner--extended-title";
 const title=makeNode("h3","rrp-race-head__condition rr-dash-race-condition");
 title.append(makeNode("span","rrp-race-head__stakes-name rr-dash-stakes-name",presentation.title));
 if(presentation.grade){
  const trophy=makeNode("span","rrp-race-head__trophy rrp-race-head__trophy--g"+presentation.grade+" rr-dash-graded-trophy rr-dash-graded-trophy--g"+presentation.grade);
  trophy.setAttribute("aria-label","Grade "+presentation.grade+" stakes trophy");
  trophy.setAttribute("title","Grade "+presentation.grade+" Stakes");
  const art=makeNode("img","rrp-race-head__trophy-icon rr-dash-trophy-icon");
  art.src="/assets/approved/graded-trophies/graded_trophy_G"+presentation.grade+".png?v=original-verified-2";art.alt="Grade "+presentation.grade;art.decoding="async";
  trophy.append(art);
  title.append(trophy);
 }
 titleRow.append(number,title);
 const details=makeNode("div","rrp-race-head__details rr-dash-race-meta"),
  runnerCount=(race.entries||[]).length,purse=String(race.purse||"").trim();
 details.append(makeNode("p","rrp-race-head__runners rr-dash-race-runners",runnerCount+" RUNNERS"));
 if(purse)details.append(makeNode("p","rrp-race-head__purse rr-dash-race-purse","PURSE "+purse));
 else if(previewMode){
  const missing=makeNode("p","rrp-race-head__purse rr-dash-race-purse","PURSE NOT LISTED");
  missing.dataset.missing="true";details.append(missing);
 }else details.append(makeNode("p","rrp-race-head__purse rr-dash-race-purse",""));
 const time=makeNode("div","rrp-race-head__time rr-dash-post-time");
 time.append(makeNode("span","","POST TIME"),makeNode("strong","",race.post_time_et||race.post_time||race.postTime||"Not listed"));
 details.append(time);
 wrapper.append(titleRow,details);
 wrapper.append(scratchList(race));
 return wrapper;
}
function renderCard(){
 if(viewMode==="track")activeCard=selectedCard();
 renderTimeline();
 if(!activeCard){
  renderRaceNav(null);renderRaceTimeSelect(null);
  q("#rr-dash-track-identity").replaceChildren();q("#rr-dash-race").replaceChildren();q("#rr-dash-horses").replaceChildren();setText(q("#rr-dash-update"),"");return;
 }
 renderRaceNav(activeCard);renderRaceTimeSelect(activeCard);
 const race=activeCard.card.races.find(item=>item.race_number===activeRace);if(!race)return;
 const context=q("#rr-dash-track-identity");context.replaceChildren(cardHeader(activeCard));
 const panel=q("#rr-dash-race");panel.replaceChildren(raceBanner(race));

 const tiles=makeNode("div","rr-dash-race-tiles");
 tiles.setAttribute("role","group");tiles.setAttribute("aria-label","Race facts");
 tiles.append(makeTile("Pace",race.pace),makeTile("Surface",race.surface),makeTile("Distance",globalThis.RRRaceTitles?.formatDistance?.(race.distance)??race.distance));
 panel.append(tiles);
 
 const table=makeNode("div","rr-dash-table");table.setAttribute("role","table");table.setAttribute("aria-label","Race "+race.race_number+" projections");
 const header=makeNode("div","rr-dash-table-heading");header.setAttribute("role","row");
 for(const label of ["#","HORSE"]){const cell=makeNode("span","",label);cell.setAttribute("role","columnheader");header.append(cell);}
 const metricHead=makeNode("div","rr-dash-metric-group");metricHead.setAttribute("role","group");
 for(const [label] of CARD_METRICS){const cell=makeNode("span","",label);cell.setAttribute("role","columnheader");metricHead.append(cell);}
 header.append(metricHead);const marketHead=makeNode("span","","WIN % · FAIR ODDS");marketHead.setAttribute("role","columnheader");header.append(marketHead);table.append(header);
 const list=makeNode("div","rr-dash-runner-list");list.setAttribute("role","rowgroup");
 const entries=[...race.entries].map((entry,index)=>({entry,index}));
 // Rail & Rye's locked projection ordering:
 // 1. The strongest exact TRI win-probability candidate leads.
 // 2. Every other runner follows the source-certified projected finish order.
 //    When no explicit rank was transmitted, preserve the scorer's entry order.
 const exactChance=item=>Number(item.entry.win_probability_exact??item.entry.win_probability);
 const lead=entries.reduce((best,item)=>!best||exactChance(item)>exactChance(best)?item:best,null);
 const sourceRanked=entries.length>1&&entries.every(item=>Number.isInteger(item.entry.rank)&&item.entry.rank>0);
 entries.sort((a,b)=>{
  if(a===lead)return -1;
  if(b===lead)return 1;
  return sourceRanked?(a.entry.rank-b.entry.rank||a.index-b.index):a.index-b.index;
 });
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
  horseHeading.append(makeNode("span","rr-dash-horse-ml","M/L "+(tote(entry.morning_line))));
  horseButton.append(horseHeading);
  const connections=[entry.trainer||"",entry.jockey||""].filter(Boolean).join(" | ");
  if(connections)horseButton.append(makeNode("span","rr-dash-horse-connections",connections));
  horseButton.addEventListener("click",()=>showHorse(entry));horseCell.append(horseButton);
  const metricGroup=makeMetricGroup(entry);metricGroup.setAttribute("role","cell");
  const odds=fairOdds(entry)||"—",win=makeNode("div","rr-dash-win");win.setAttribute("role","cell");
  win.setAttribute("aria-label",(entry.win_probability==null?"No win probability":String(entry.win_probability)+"% win probability")+"; fair odds "+odds);
  win.append(makeNode("strong","rr-dash-win-percent",entry.win_probability==null?"—":String(entry.win_probability)+"%"));
  win.append(makeNode("small","rr-dash-win-fair","FAIR "+odds));
  row.addEventListener("click",event=>{if(event?.target?.closest?.("button"))return;showHorse(entry);});
  row.append(program,horseCell,metricGroup,win);list.append(row);
 }
 if(!entries.length)list.append(makeNode("div","rr-dash-no-data","No runners match that search."));
 table.append(list);
 const heading=makeNode("div","rr-dash-mobile-list-heading");
 heading.append(makeNode("h2","","WIN PROJECTIONS"));
 const builder=makeNode("button","rr-bet-launch","Build Exotic Ticket");
 builder.type="button";
 builder.setAttribute("aria-label","Open Bet Builder for "+(activeCard.track||activeCard.card.track_name)+" Race "+race.race_number);
 const builderOptions={
  race,card:activeCard.card,track:activeCard.track||activeCard.card.track_name,date:activeCard.race_date,preview:previewMode,customer:!!globalThis.RRCustomerReader,
  projection_status:activeCard.card.projection_status,model_receipts:activeCard.card.model_receipts
 };
 builder.addEventListener("click",()=>globalThis.RRBetBuilder?.open?.(builderOptions));
 if(globalThis.RRBetBuilder?.canOpenDailyDouble?.(builderOptions)){
  const actions=makeNode("div","rr-bet-launch-actions");
  const dd=makeNode("button","rr-bet-launch rr-bet-launch-dd","Daily Double");
  dd.type="button";
  dd.setAttribute("aria-label","Open Daily Double Bet Builder for "+builderOptions.track+" Races "+race.race_number+" and "+(Number(race.race_number)+1));
  dd.addEventListener("click",()=>globalThis.RRBetBuilder?.open?.({...builderOptions,initialType:"daily-double"}));
  actions.append(builder,dd);heading.append(actions);
 }else heading.append(builder);
 q("#rr-dash-horses").replaceChildren(heading,table);
 // Digital-first dashboard: no redundant PDF actions or downloads in the race view.
 setText(q("#rr-dash-update"),activeCard.uploaded_at?"Projection updated "+new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(activeCard.uploaded_at))+" ET":"");
 for(const button of q("#rr-dash-races").querySelectorAll("button"))button.setAttribute("aria-current",String(Number(button.dataset.raceNumber)===activeRace));
}
function onFiltersChanged(){
 const oldTrack=q("#rr-dash-track").value;
 renderTracks(oldTrack);
 if(viewMode!=="track"){
  timeline=raceTimeline();
  const selected=viewMode==="purse"?null:timeline.find(item=>item.card===activeCard&&item.race.race_number===activeRace);
  if(!selected){
   activeCard=timeline[0]?.card||null;
   activeRace=timeline[0]?.race?.race_number||null;
  }
 }else{
  activeCard=selectedCard();
  activeRace=racesByPostTime(activeCard)[0]?.race_number||null;
 }
 renderCard();
}
async function init(){
 try{
  if(globalThis.RRCustomerReader){const data=await RRCustomerReader.edition("Race Cards");cards=data.cards||[];}
  else if(previewMode){const data=await api("/api/admin/projections-preview");cards=data.cards||[];}
  else {const data=await api("/api/membership/projections");cards=data.cards||[];}
  status.hidden=true;
  if(!cards.length){empty.hidden=false;return;}
  app.hidden=false;renderDates();renderTracks();
  app.dataset.mode=viewMode;
  activeCard=selectedCard();activeRace=racesByPostTime(activeCard)[0]?.race_number||null;renderCard();
  q("#rr-dash-date").addEventListener("change",onFiltersChanged);
  q("#rr-dash-track").addEventListener("change",()=>{if(viewMode==="track")onFiltersChanged();});
  q("#rr-dash-race-time").addEventListener("change",()=>{activeRace=Number(q("#rr-dash-race-time").value);renderCard();});
  q("#rr-dash-mode-track").addEventListener("click",()=>changeViewMode("track"));
  q("#rr-dash-mode-all").addEventListener("click",()=>changeViewMode("all"));
  q("#rr-dash-mode-purse")?.addEventListener("click",()=>changeViewMode("purse"));
  q("#rr-dash-min-purse")?.addEventListener("change",onFiltersChanged);
  q("#rr-dash-stakes-only")?.addEventListener("change",onFiltersChanged);
  q("#rr-dash-all-races").addEventListener("change",()=>selectTimeline(Number(q("#rr-dash-all-races").value)));
  q("#rr-dash-previous-race").addEventListener("click",()=>selectTimeline(Number(q("#rr-dash-all-races").value)-1));
  q("#rr-dash-next-race").addEventListener("click",()=>selectTimeline(Number(q("#rr-dash-all-races").value)+1));
 }catch(error){
  status.hidden=true;
  if(error.status===401){login.hidden=false;return;}
  setText(status,error.message||"The dashboard could not load. Please try again.");status.hidden=false;
 }
}
q("#rr-dash-horse-close").addEventListener("click",()=>q("#rr-dash-horse-dialog").close());
init();
})();

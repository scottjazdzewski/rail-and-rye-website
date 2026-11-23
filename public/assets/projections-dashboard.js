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
function raceTimeline(){
 const date=q("#rr-dash-date").value;
 return cards.filter(card=>card.race_date===date).flatMap(card=>
  (card.card?.races||[]).map(race=>({card,race,at:postTimeMinutes(timeLabel(race))})))
 .sort((a,b)=>a.at-b.at||
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
function editorialRacePresentation(race){
 const fromHelper=globalThis.RRRaceTitles?.describe?.(race);
 if(fromHelper&&typeof fromHelper.title==="string"&&fromHelper.title.trim()&&
    !/\b(?:S|Stk|Stks)\.$/i.test(fromHelper.title.trim()))return fromHelper;
 // Defensive display fallback: if the separate shared helper is blocked,
 // its absence must NEVER expose "First Lady S." to customers again.
 const raw=String(race.stakes_name||race.race_name||race.conditions||"Race projections").trim();
 let title=raw
  .replace(/\s*\(\s*(?:presented|sponsored|powered)\s+by\b[^)]*\)/gi,"")
  .replace(/\s*(?:presented|sponsored|powered)\s+by\b.*$/i,"")
  .replace(/\s*\(\s*(?:G(?:rade)?\.?|Gr\.?)\s*[-:]?\s*(?:III|II|I|[123])\s*\)\s*$/i,"").trim();
 // Capture casing BEFORE replacing "S." with "Stakes", otherwise the
 // newly mixed-case suffix prevents uppercase source names from title-casing.
 const originalLetters=title.replace(/[^A-Za-z]/g,"");
 const originallyAllCaps=originalLetters.length>2&&originalLetters===originalLetters.toUpperCase();
 title=title.replace(/\b(?:Stks?|Stk|S)\.?$/i,"Stakes");
 if(originallyAllCaps)
  title=title.toLowerCase().replace(/\b[a-z]/g,letter=>letter.toUpperCase());
 const match=raw.match(/\(\s*(?:G(?:rade)?\.?|Gr\.?)\s*[-:]?\s*(III|II|I|[123])\s*\)/i);
 const grade=match?({I:1,II:2,III:3}[match[1].toUpperCase()]||Number(match[1])):null;
 return {title:title||"Race projections",grade:Number.isInteger(grade)&&grade>=1&&grade<=3?grade:null};
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
 const all=viewMode==="all";
 container.hidden=!all;
 q("#rr-dash-races").hidden=all;
 if(!all)return;
 timeline=raceTimeline();
 select.replaceChildren();
 for(let i=0;i<timeline.length;i++){
  const item=timeline[i],track=item.card.track||item.card.card.track_name;
  option(select,String(i),timeLabel(item.race)+" · "+track+" · Race "+item.race.race_number);
 }
 let index=timeline.findIndex(item=>item.card===activeCard&&item.race.race_number===activeRace);
 if(index<0&&timeline.length){index=0;activeCard=timeline[0].card;activeRace=timeline[0].race.race_number;}
 if(index>=0)select.value=String(index);
 setText(q("#rr-dash-timeline-count"),timeline.length?((index+1)+" of "+timeline.length+" races · "+new Set(timeline.map(x=>x.card.track||x.card.card.track_name)).size+" tracks"):"No races found");
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
 viewMode=next==="all"?"all":"track";
 const all=viewMode==="all";
 app.dataset.mode=viewMode;
 q("#rr-dash-mode-track").setAttribute("aria-pressed",String(!all));
 q("#rr-dash-mode-all").setAttribute("aria-pressed",String(all));
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
// Tote-style US fractional odds are DISPLAY ONLY. The frozen TRI model net
// price and unrounded PWIN remain unchanged for all calculations / thresholds.
const SHORT_TOTE_PRICES=[
 [0.05,"1-20"],[0.1,"1-10"],[0.2,"1-5"],[0.25,"1-4"],[0.3,"3-10"],
 [0.4,"2-5"],[0.5,"1-2"],[0.6,"3-5"],[0.7,"7-10"],[0.8,"4-5"],
 [0.9,"9-10"],[1,"1-1"],[1.2,"6-5"],[1.4,"7-5"],[1.5,"3-2"],
 [1.6,"8-5"],[1.8,"9-5"],[2,"2-1"],[2.5,"5-2"],[3,"3-1"],
 [3.5,"7-2"],[4,"4-1"],[4.5,"9-2"]
];
function fairOdds(entry){
 let p=Number(entry.win_probability_exact);
 if(!(Number.isFinite(p)&&p>0&&p<=100))p=Number(entry.win_probability);
 let net=(Number.isFinite(p)&&p>0&&p<=100)?100/p-1:NaN;
 if(!Number.isFinite(net)||net<0){
  const raw=String(entry.fair_odds||"").trim(),match=raw.match(/^(\d+(?:\.\d+)?)\s*[-/]\s*(\d+(?:\.\d+)?)$/);
  if(!match||Number(match[2])<=0)return "—";
  net=Number(match[1])/Number(match[2]);
 }
 if(net<5){
  return SHORT_TOTE_PRICES.reduce((best,candidate)=>
   Math.abs(candidate[0]-net)<Math.abs(best[0]-net)?candidate:best
  )[1];
 }
 return Math.max(5,Math.round(net))+"-1";
}
function makeNode(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
function iconNode(name,className,state){
 if(!name)return null;
 const node=makeNode("span",className);node.setAttribute("aria-hidden","true");
 const image=document.createElement("img");image.src="/assets/approved/factor-badges/"+name+(state?"_"+state:"")+".png";image.alt="";image.loading="lazy";image.decoding="async";
 node.append(image);return node;
}
function makeTile(label,value){
 const tile=makeNode("div","rr-dash-race-tile"),copy=document.createElement("div");
 tile.setAttribute("aria-label",label+": "+(value||"Not listed"));
 copy.append(makeNode("span","",label),makeNode("strong","",value||"Not listed"));
 tile.append(copy);return tile;
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
function showHorse(entry){
 const dialog=q("#rr-dash-horse-dialog"),title=q("#rr-dash-horse-title"),detail=q("#rr-dash-horse-detail");
 setText(title,(entry.program_number?"#"+entry.program_number+"  ":"")+entry.horse_name);
 detail.replaceChildren();
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
 if(entry.notes)detail.append(makeNode("p","rr-dash-detail-notes",entry.notes));
 const mobile=makeNode("div","rr-dash-mobile-analysis");
 const summary=makeNode("div","rr-dash-sheet-summary"),chipFrame=makeNode("div","rr-dash-sheet-chip"),program=String(entry.program_number||"");
 const parsed=program.match(/^(\d{1,2})([A-Za-z]?)$/),chipNumber=parsed?Number(parsed[1]):NaN;
 if(Number.isInteger(chipNumber)&&chipNumber>=1&&chipNumber<=20){
  const image=document.createElement("img");image.src="/assets/approved/saddlecloths/"+chipNumber+".png";image.alt="Saddlecloth "+program;chipFrame.append(image);
  if(parsed[2])chipFrame.append(makeNode("span","rr-dash-sheet-chip-suffix",parsed[2]));
 }else chipFrame.append(makeNode("strong","",program||"—"));
 const market=makeNode("div","rr-dash-sheet-market");
 market.append(makeNode("span","rr-dash-sheet-kicker","WIN PROJECTION"));
 market.append(makeNode("strong","rr-dash-sheet-win",entry.win_probability==null?"—":String(entry.win_probability)+"%"));
 market.append(makeNode("span","rr-dash-sheet-fair","FAIR "+(fairOdds(entry)||"—")));
 const ml=makeNode("div","rr-dash-sheet-ml","M/L "+(entry.morning_line||"—"));
 summary.append(chipFrame,ml,market);mobile.append(summary);
 const connections=[["TRAINER",entry.trainer],["JOCKEY",entry.jockey]].filter(([,value])=>value);
 if(connections.length){
  const section=makeNode("section","rr-dash-sheet-section");
  section.append(makeNode("h3","","CONNECTIONS"));
  const items=makeNode("div","rr-dash-sheet-connections");
  for(const [label,value] of connections){
   const item=makeNode("div","rr-dash-sheet-connection");item.append(makeNode("span","",label),makeNode("strong","",value));items.append(item);
  }
  section.append(items);mobile.append(section);
 }
 const race=activeCard?.card?.races?.find(item=>item.race_number===activeRace);
 if(race){
  const section=makeNode("section","rr-dash-sheet-section");section.append(makeNode("h3","","RACE CONTEXT"));
  const facts=makeNode("div","rr-dash-sheet-facts");
  for(const [label,value] of [["SURFACE",race.surface],["DISTANCE",race.distance],["PACE",race.pace]]){
   if(!value)continue;
   const item=makeNode("div","rr-dash-sheet-fact");item.append(makeNode("span","",label),makeNode("strong","",value));facts.append(item);
  }
  section.append(facts);mobile.append(section);
 }
 if(entry.f4_probabilities){
  const f4=entry.f4_probabilities;
  const section=makeNode("section","rr-dash-sheet-section");section.append(makeNode("h3","","F4 FINISH PROJECTIONS"));
  const rows=makeNode("div","rr-dash-sheet-factor-list");
  for(const [label,key] of [["WIN","exact_p1"],["SECOND","exact_p2"],["THIRD","exact_p3"],["FOURTH","exact_p4"],["FIFTH","exact_p5"],["SIXTH OR LATER","p6_plus"],["TOP 2","top2"],["TOP 3","top3"],["TOP 4","top4"]]){
   const cell=makeNode("div","rr-dash-sheet-factor");
   cell.append(makeNode("strong","",label),makeNode("span","rr-dash-sheet-factor-status",(100*f4[key]).toFixed(1)+"%"));rows.append(cell);
  }
  section.append(rows);mobile.append(section);
 }
 const factors=makeNode("section","rr-dash-sheet-section");factors.append(makeNode("h3","","FIVE-FACTOR READOUT"));
 const factorList=makeNode("div","rr-dash-sheet-factor-list");
 for(const [label,aliases,art] of CARD_METRICS){
  const value=metricValue(entry,aliases),state=metricState(value);
  const item=makeNode("div","rr-dash-sheet-factor");
  const status=makeNode("span","rr-dash-sheet-factor-status "+(state?"rr-dash-sheet-factor-"+state:""),state?state.toUpperCase():value);
  item.append(makeNode("strong","",label),status);factorList.append(item);
 }
 factors.append(factorList);mobile.append(factors);
 if(entry.notes){
  const notes=makeNode("section","rr-dash-sheet-section");
  notes.append(makeNode("h3","","MODEL NOTES"),makeNode("p","rr-dash-sheet-notes",entry.notes));
  mobile.append(notes);
 }
 detail.append(mobile);
 dialog.showModal();
}
function cardHeader(card){
 const wrapper=makeNode("div","rr-dash-card-head rr-dash-card-head--official-track-logo"),
  logo=document.createElement("img");
 logo.className="rr-dash-card-logo";
 logo.src="/assets/brand/rail_rye_logo_header.png";logo.alt="Rail & Rye";
 const name=card.track||card.card.track_name;
 const info=document.createElement("div"),
  track=makeNode("h2","rr-dash-track-title",name),
  date=makeNode("p","rr-dash-card-date",dateLabel(card.race_date));
 info.append(track,date);wrapper.append(logo,info);
 // Restore the real approved racetrack imagery. Render the whole image on an
 // ivory surface with no faux monogram or small framed sponsor advertisement.
 const officialTrackArt={
  "Finger Lakes":"finger-lakes.webp",
  "Mountaineer":"mountaineer.webp",
  "Mahoning Valley":"mahoning-valley.webp",
  "Parx Racing":"parx-racing.webp",
  "Zia Park":"zia-park.webp"
 };
 const filename=officialTrackArt[name];
 if(filename){
  const frame=makeNode("div","rr-dash-approved-track-logo-wrap"),
   image=document.createElement("img");
  image.className="rr-dash-approved-track-logo";
  image.src="/assets/approved/track-logos/"+filename;
  image.alt=name+" track logo";
  image.loading="eager";image.decoding="async";
  frame.append(image);wrapper.append(frame);
 }else wrapper.className="rr-dash-card-head";
 return wrapper;
}
function scratchList(race){
 const scratches=race.scratches||[],scratchCount=Number(race.scratch_count)||0;
 if(!scratches.length&&!scratchCount)return null;
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
 if(!scratches.length&&scratchCount)list.append(makeNode("li","rr-dash-scratch-missing",previewMode?"Scratch names missing from uploaded JSON":"Scratch details unavailable"));
 strip.append(list);return strip;
}
function raceBanner(race){
 const wrapper=makeNode("div","rr-dash-race-banner"),
  number=makeNode("div","rr-dash-race-number rr-race-saddle-header"),
  copy=makeNode("div","rr-dash-race-copy"),time=makeNode("div","rr-dash-post-time");
 number.setAttribute("role","img");
 number.setAttribute("aria-label","Race "+race.race_number);
 number.append(approvedRaceSaddle(race.race_number));
 const presentation=editorialRacePresentation(race);
 if(presentation.title.length>32)wrapper.className+=" rr-dash-race-banner--extended-title";
 const purse=String(race.purse||"").trim();
 const title=makeNode("h3","rr-dash-race-condition");
 title.append(makeNode("span","rr-dash-stakes-name",presentation.title));
 if(presentation.grade){
  const graded=makeNode("span","rr-dash-graded-trophy rr-dash-graded-trophy--g"+presentation.grade);
  graded.setAttribute("aria-label","Grade "+presentation.grade+" stakes trophy");
  graded.setAttribute("title","Grade "+presentation.grade+" Stakes");
  graded.append(makeNode("span","rr-dash-trophy-icon","🏆"),
   makeNode("strong","rr-dash-grade-label","G"+presentation.grade));
  title.append(graded);
 }
 copy.append(title);
 const meta=makeNode("div","rr-dash-race-meta"),runnerCount=(race.entries||[]).length;
 meta.append(makeNode("p","rr-dash-race-runners",runnerCount+" RUNNERS"));
 if(purse)meta.append(makeNode("p","rr-dash-race-purse","PURSE "+purse));
 else if(previewMode){const missing=makeNode("p","rr-dash-race-purse","PURSE MISSING FROM EXPORT");missing.dataset.missing="true";meta.append(missing);}
 const stage=activeCard?.card?.projection_status;
 if(stage==="prescratch")meta.append(makeNode("p","rr-dash-race-scratch-count","INITIAL CARD · CURRENT"));
 const scratchCount=race.scratch_count==null?(race.scratches?.length||null):race.scratch_count;
 if(stage!=="prescratch"&&scratchCount!=null)meta.append(makeNode("p","rr-dash-race-scratch-count",scratchCount+" SCRATCH"+(scratchCount===1?"":"ES")));
 copy.append(meta);
 time.append(makeNode("span","","POST TIME"),makeNode("strong","",race.post_time_et||race.post_time||race.postTime||"Not listed"));
 wrapper.append(number,copy,time);return wrapper;
}
function renderCard(){
 if(viewMode==="track")activeCard=selectedCard();
 if(!activeCard)return;
 renderRaceNav(activeCard);renderRaceTimeSelect(activeCard);renderTimeline();
 const race=activeCard.card.races.find(item=>item.race_number===activeRace);if(!race)return;
 const panel=q("#rr-dash-race");panel.replaceChildren(cardHeader(activeCard),raceBanner(race));
 const scratches=scratchList(race);if(scratches)panel.append(scratches);
 const tiles=makeNode("div","rr-dash-race-tiles");
 if(activeCard.card.projection_status!=="prescratch"||race.pace)tiles.append(makeTile("Pace",race.pace));
 if(race.surface)tiles.append(makeTile("Surface",race.surface));
 if(race.distance)tiles.append(makeTile("Distance",race.distance));
 if(tiles.children.length)panel.append(tiles);
 if(activeCard.card.projection_status==="prescratch"){
  panel.append(makeNode("p","rr-dash-prescratch-note","Initial projections remain current until scratches. Fair odds are exact model net-to-1 values."));
 }
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
  horseHeading.append(makeNode("span","rr-dash-horse-ml","M/L "+(entry.morning_line||"—")));
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
 builder.addEventListener("click",()=>{
  if(globalThis.RRBetBuilder?.open)globalThis.RRBetBuilder.open({
   race,track:activeCard.track||activeCard.card.track_name,date:activeCard.race_date,preview:previewMode
  });
 });
 heading.append(builder);
 q("#rr-dash-horses").replaceChildren(heading,table);
 // Digital-first dashboard: no redundant PDF actions or downloads in the race view.
 setText(q("#rr-dash-update"),activeCard.uploaded_at?"Projection updated "+new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(activeCard.uploaded_at))+" ET":"");
 for(const button of q("#rr-dash-races").querySelectorAll("button"))button.setAttribute("aria-current",String(Number(button.dataset.raceNumber)===activeRace));
}
function onFiltersChanged(){
 const oldTrack=q("#rr-dash-track").value;
 renderTracks(oldTrack);
 if(viewMode==="all"){
  timeline=raceTimeline();
  const selected=timeline.find(item=>item.card===activeCard&&item.race.race_number===activeRace);
  if(!selected){
   activeCard=timeline[0]?.card||null;
   activeRace=timeline[0]?.race?.race_number||null;
  }
 }else{
  activeCard=selectedCard();
  activeRace=racesByPostTime(activeCard)[0]?.race_number||null;
 }
 if(activeCard)renderCard();
}
async function init(){
 try{
  if(previewMode){const data=await api("/api/admin/projections-preview");cards=data.cards||[];}
  else {const data=await api("/api/membership/projections");cards=data.cards||[];}
  status.hidden=true;
  if(!cards.length){empty.hidden=false;return;}
  app.hidden=false;renderDates();renderTracks();
  app.dataset.mode=viewMode;
  activeCard=selectedCard();activeRace=racesByPostTime(activeCard)[0]?.race_number||null;renderCard();
  q("#rr-dash-date").addEventListener("change",onFiltersChanged);
  q("#rr-dash-track").addEventListener("change",()=>{if(viewMode==="track")onFiltersChanged();});
  q("#rr-dash-race-time").addEventListener("change",()=>{activeRace=Number(q("#rr-dash-race-time").value);renderCard();});
  q("#rr-dash-search").addEventListener("input",renderCard);
  q("#rr-dash-mode-track").addEventListener("click",()=>changeViewMode("track"));
  q("#rr-dash-mode-all").addEventListener("click",()=>changeViewMode("all"));
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

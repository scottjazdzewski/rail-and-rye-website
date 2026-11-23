/* Longshot Radar native review UI. No scoring, ranking or real-odds inference. */
(()=>{
"use strict";
const q=selector=>document.querySelector(selector);
const designOnly=document.body?.dataset?.rrDesignOnly==="true"; // Public visual shell: NO admin API and NO paid data.
const state={editions:[],date:"",sort:"post-time",demo:false};
const status=q("#rr-lr-loading"),app=q("#rr-lr-app"),empty=q("#rr-lr-empty"),dialog=q("#rr-lr-dialog");
const make=(tag,cls,content)=>{
 const element=document.createElement(tag);if(cls)element.className=cls;
 if(content!==undefined&&content!==null)element.textContent=String(content);
 return element;
};
const dateLabel=value=>{
 const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!match)return value||"";
 return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"})
 .format(new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))));
};
const timeLabel=value=>{
 const parsed=Date.parse(String(value||""));
 if(!Number.isFinite(parsed))return "";
 return new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(parsed));
};
// Both Radar and Target List use source-declared Eastern post times. Unknown
// or unparsable times remain at the end, in their original editorial order.
function postMinutes(value){
 const raw=String(value||"").trim();
 const twelve=raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s*(?:ET|EDT|EST))?$/i);
 if(twelve){
  const h=Number(twelve[1]),m=Number(twelve[2]);
  if(h<1||h>12||m>59)return Infinity;
  return (h%12+(twelve[3].toUpperCase()==="PM"?12:0))*60+m;
 }
 const twentyfour=raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:ET|EDT|EST))?$/i);
 if(twentyfour)return Number(twentyfour[1])*60+Number(twentyfour[2]);
 return Infinity;
}
function orderByDay(items,mode){
 const ordered=[...items];
 if(mode==="track")return ordered.sort((a,b)=>
  a.track.localeCompare(b.track,"en-US")||a.race_number-b.race_number||
  postMinutes(a.post_time_et)-postMinutes(b.post_time_et));
 return ordered.sort((a,b)=>{
  const first=postMinutes(a.post_time_et),second=postMinutes(b.post_time_et);
  // Avoid Infinity minus Infinity yielding NaN and breaking stable source order.
  if(first!==second)return first<second?-1:1;
  return 0;
 });
}
function programChip(value){
 const chip=make("span","rr-lr-program"),program=String(value||""),match=program.match(/^(\d{1,2})([A-Za-z]?)$/),number=match?Number(match[1]):NaN;
 if(Number.isInteger(number)&&number>=1&&number<=20){
  const img=document.createElement("img");
  img.src="/assets/approved/saddlecloths/"+number+".png";img.alt="Saddlecloth "+program;img.width=38;img.height=38;img.loading="lazy";
  chip.append(img);
  if(match[2])chip.append(make("span","rr-lr-program-suffix",match[2].toUpperCase()));
 }else{
  chip.append(make("strong","rr-lr-program-fallback",program));
 }
 return chip;
}
function currentEdition(){return state.editions.find(item=>item.race_date===state.date)||null;}
function options(select,values,selected){
 select.replaceChildren();
 for(const [value,label] of values){
  const option=make("option","",label);option.value=value;select.append(option);
 }
 select.value=values.some(([value])=>value===selected)?selected:values[0]?.[0]||"";
 return select.value;
}
function renderDates(){
 const dates=state.editions.map(item=>[item.race_date,dateLabel(item.race_date)]);
 state.date=options(q("#rr-lr-date"),dates,state.date);
}
function market(label,value,cls){
 const item=make("div","rr-lr-market "+(cls||""));
 item.append(make("span","",label),make("strong","",value));
 return item;
}
function showDetail(item){
 const title=q("#rr-lr-dialog-title"),body=q("#rr-lr-dialog-detail");
 title.textContent=item.horse_name;
 const summary=make("div","rr-lr-dialog-summary"),id=make("div");
 id.append(make("strong","",item.horse_name));
 id.append(make("small","",item.track+" · Race "+item.race_number+(item.post_time_et?" · "+item.post_time_et:"")));
 if(item.trainer||item.jockey)id.append(make("small","",[item.trainer,item.jockey].filter(Boolean).join(" | ")));
 summary.append(programChip(item.program_number),id);
 const stats=make("div","rr-lr-detail-stats");
 for(const [name,value] of [["ORIGINAL M/L",item.original_morning_line],["TRI WIN",String(item.pwin_display)+"%"],["FAIR ODDS",item.fair_odds_display]]){
  const box=make("div");box.append(make("span","",name),make("strong","",value));stats.append(box);
 }
 body.replaceChildren(summary,stats);
 for(const [label,copy] of [
  ["Why this horse at this price",item.betting_case],
  ["Authenticated racing evidence",item.source_causal_evidence],
  ["Checked counterargument",item.counterargument_checked]
 ]){
  const section=make("section","rr-lr-detail-section");
  section.append(make("h3","",label),make("p","",copy));body.append(section);
 }
 body.append(make("p","rr-lr-source-note",state.demo?"FICTIONAL DATA ONLY. No actual horses, TRI results, odds or wagering selections are included.":"Original Timeform morning line, not live tote odds. Editorial source and release receipts must be checked against the approved production package before customer publication."));
 if(!dialog.open)dialog.showModal();
}
function makeCard(item){
 const card=make("article","rr-lr-card"),racebar=make("div","rr-lr-racebar");
 racebar.append(make("h3","",item.track),make("span","rr-lr-race-number","RACE "+item.race_number));
 if(item.post_time_et)racebar.append(make("span","rr-lr-post",item.post_time_et));
 const top=make("div","rr-lr-top"),identity=make("div","rr-lr-identity");
 identity.append(make("strong","",item.horse_name));
 if(item.trainer||item.jockey){
  identity.append(make("small","",[item.trainer,item.jockey].filter(Boolean).join(" | ")));
 }
 const markets=make("div","rr-lr-markets");
 markets.append(
  market("ML ODDS",item.original_morning_line),
  market("WIN %",String(item.pwin_display)+"%","rr-lr-model"),
  market("FAIR ODDS",item.fair_odds_display)
 );
 top.append(programChip(item.program_number),identity,markets);
 const foot=make("div","rr-lr-card-foot");
 const detail=make("button","","Race details");detail.type="button";
 detail.setAttribute("aria-label","Read Longshot Radar analysis for "+item.horse_name+" at "+item.track+" race "+item.race_number);
 detail.addEventListener("click",()=>showDetail(item));
 foot.append(detail);
 card.append(racebar,top,make("p","rr-lr-case",item.betting_case),foot);
 return card;
}
function renderCandidates(){
 const edition=currentEdition(),target=q("#rr-lr-candidates");
 if(!edition)return;
 q("#rr-lr-date-title").textContent=dateLabel(edition.race_date);
 q("#rr-lr-stage").textContent=state.demo?"PREVIEW · NOT ACTUAL PICKS":(edition.status==="prescratch"?"INITIAL · CURRENT":"SCRATCH-UPDATED");
 q("#rr-lr-updated").textContent=state.demo?"Illustrative figures · not wagering recommendations":"Production "+timeLabel(edition.generated_at)+" · revision "+edition.revision;
 let candidates=[...edition.candidates];
 candidates=orderByDay(candidates,state.sort);
 q("#rr-lr-count").textContent=candidates.length+" shown · "+edition.candidates.length+(state.demo?" illustrated runners":" approved horses")+" · "+(state.sort==="post-time"?"Post-time order":"Track order");
 if(!candidates.length){
  target.replaceChildren(make("div","rr-lr-list-empty","No selections in this approved edition. Longshot Radar does not force a daily pick."));
 }else target.replaceChildren(...candidates.map(makeCard));
}
function refreshView(){
 renderDates();renderCandidates();
 empty.hidden=true;app.hidden=false;
}
async function load(){
 state.demo=false;q("#rr-lr-demo-alert").hidden=true;q("#rr-lr-demo-button").textContent="Preview sample rows";
 const response=await fetch("/api/admin/longshot-radar",{credentials:"same-origin",cache:"no-store"});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||"Unable to load Radar review.");
 state.editions=Array.isArray(result.editions)?result.editions:[];
 if(!state.editions.length){app.hidden=true;empty.hidden=false;return;}
 refreshView();
}
async function initialize(){
 if(designOnly){
  const demo=visualSample();
  state.editions=[demo];state.date=demo.race_date;state.demo=true;
  q("#rr-lr-demo-alert").hidden=false;
  refreshView();status.hidden=true;
  return;
 }
 try{await load();status.hidden=true;}
 catch(e){status.textContent=e.message||"Private review failed to load.";status.hidden=false;app.hidden=true;}
}
function visualSample(){
 // Static fictional fixture is shared by the Access-protected admin review and
 // the deliberately unlisted design-only website preview; never scored or uploaded.
 // It is never sent to the production API or private R2.
 const shared={
  source_causal_evidence:"Illustrative layout text. Verified production evidence will appear here after source verification.",
  counterargument_checked:"Illustrative layout text. Actual counterarguments require independent verification.",
  trainer:"Illustrative Trainer",jockey:"Illustrative Jockey"
 };
 const horse=(track,race,post,number,name,ml,pct,fair)=>({
  ...shared,track,race_number:race,post_time_et:post,program_number:number,
  horse_name:name,original_morning_line:ml,pwin_display:pct,fair_odds_display:fair,
  betting_case:"Illustrative one-sentence analysis for layout review; no actual racing recommendation."
 });
 return {
  schema_version:1,product_type:"longshot_radar",race_date:"2026-11-23",
  status:"prescratch",revision:1,generated_at:"2026-11-23T12:00:00Z",
  candidates:[
   horse("EXAMPLE PARK",5,"3:40 PM ET","11","Example Horse Eleven","8/1",18.2,"9/2"),
   horse("ILLUSTRATION DOWNS",2,"1:15 PM ET","1","Illustration Runner One","10/1",21.4,"7/2"),
   horse("EXAMPLE PARK",8,"6:05 PM ET","20","Example Horse Twenty With Longer Name","12/1",16.8,"5/1")
  ]
 };
}
q("#rr-lr-demo-button")?.addEventListener("click",async()=>{
 if(designOnly)return;
 if(state.demo){await initialize();return;}
 const demo=visualSample();
 state.editions=[demo];state.date=demo.race_date;state.demo=true;
 q("#rr-lr-demo-alert").hidden=false;
 q("#rr-lr-demo-button").textContent="Return to verified data";
 refreshView();status.hidden=true;
});

q("#rr-lr-date").addEventListener("change",event=>{
 state.date=event.target.value;renderCandidates();
});
q("#rr-lr-sort").addEventListener("change",event=>{state.sort=event.target.value;renderCandidates();});
q("#rr-lr-close").addEventListener("click",()=>dialog.close());
q("#rr-lr-upload-form")?.addEventListener("submit",async event=>{
 event.preventDefault();
 const feedback=q("#rr-lr-upload-status"),file=q("#rr-lr-file").files?.[0],button=event.currentTarget.querySelector("button");
 if(!file){feedback.textContent="Choose a production JSON file.";return;}
 if(file.size>512*1024){feedback.textContent="JSON file exceeds the private 512 KB limit.";return;}
 button.disabled=true;feedback.textContent="Checking structured production data…";
 try{
  const raw=await file.text(),input=JSON.parse(raw);
  const response=await fetch("/api/admin/longshot-radar",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||"Unable to save Radar review.");
  feedback.textContent="Private review saved for "+result.race_date+" · revision "+result.revision+". No customer publication occurred.";
  state.date=result.race_date;
  await load();
 }catch(e){feedback.textContent=e.message||"Unable to read the file.";}
 finally{button.disabled=false;}
});
initialize();
})();

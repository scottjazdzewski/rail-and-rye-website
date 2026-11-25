/* Longshot Radar native review UI. No scoring, ranking or real-odds inference. */
(()=>{
"use strict";
const q=selector=>document.querySelector(selector);
const raceBanner=globalThis.RRResearchRaceBanner;
if(!raceBanner?.render)throw Error("Canonical research race banner must load before Radar.");
const raceOrder=globalThis.RRResearchRaceOrder;
if(!raceOrder?.sort)throw Error("Canonical research race ordering must load before Radar.");
const state={editions:[],date:"",sort:"post-time"};
const status=q("#rr-lr-loading"),app=q("#rr-lr-app"),empty=q("#rr-lr-empty");
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
// Both readers use the shared source-declared post-time parser and the
// same track/race-number tie breaks. Unknown times sort after sourced times.
function orderByDay(items,mode){return raceOrder.sort(items,mode);}
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
const tote=value=>globalThis.RRRaceTitles.formatToteOdds(value);
function market(label,value,cls){
 const item=make("div","rr-lr-market "+(cls||""));
 item.append(make("span","",label),make("strong","",value));
 return item;
}
// Both research readers use the SAME canonical sponsor-free presentation
// as Projections. Never infer a grade from purse, class or runner ranking.
function makeCard(item){
 const card=make("article","rr-lr-card");
 const racebar=raceBanner.render(item);
 const top=make("div","rr-lr-top"),identity=make("div","rr-lr-identity");
 identity.append(make("strong","",item.horse_name),make("span","rr-lr-ml-inline","ML "+tote(item.original_morning_line)));
 if(item.trainer||item.jockey){
  identity.append(make("small","",[item.trainer,item.jockey].filter(Boolean).join(" | ")));
 }
 const markets=make("div","rr-lr-markets");
 markets.append(
  market("WIN %",String(item.pwin_display)+"%","rr-lr-model"),
  market("FAIR ODDS",tote(item.fair_odds_display),"rr-lr-fair")
 );
 top.append(programChip(item.program_number),identity,markets);
 // Match the approved printed Radar: one source-approved betting sentence.
 // Supporting research/counterarguments stay in private editorial QA, not on the card.
 const analysis=make("div","rr-lr-inline-analysis");
 analysis.append(make("p","rr-lr-case",item.betting_case));
 card.append(racebar,top,analysis);
 return card;
}
function renderCandidates(){
 const edition=currentEdition(),target=q("#rr-lr-candidates");
 if(!edition)return;

 let candidates=[...edition.candidates];
 candidates=orderByDay(candidates,state.sort);
 q("#rr-lr-count").textContent=candidates.length+" "+(candidates.length===1?"selection":"selections");
  q("#rr-lr-context").textContent=state.sort==="post-time"?"Post-time order":"Track order";
 if(!candidates.length){
  target.replaceChildren(make("div","rr-lr-list-empty","No selections for this date."));
 }else target.replaceChildren(...candidates.map(makeCard));
}
function refreshView(){
 renderDates();renderCandidates();
 empty.hidden=true;app.hidden=false;
}
// Native Radar reader: all actual horses arrive from the protected Cloudflare
// R2 endpoint. No manual JSON uploader, fictional fixture or public paid JSON.
const retry=q("#rr-lr-retry");
// Read real approved editions directly from the protected R2-backed server.
// The legacy published-PDF November 23 edition is retained as history;
// new dates are accepted ONLY from the existing server-validated production
// Radar review store. This UI never scores, qualifies or writes selections.
async function fetchPrivateRadarJSON(url,signal){
 const response=await fetch(url,{
  credentials:"same-origin",cache:"no-store",redirect:"follow",signal,
  headers:{"Accept":"application/json"}
 });
 if(response.redirected||!String(response.headers.get("content-type")||"").toLowerCase().includes("application/json"))
  throw Error("Your private review session may have expired. Sign in again, then retry.");
 if(!response.ok)throw Error("Radar private feed unavailable (HTTP "+response.status+").");
 return response.json();
}
async function loadAvailableEditions(){
 if(globalThis.RRCustomerReader){const data=await RRCustomerReader.edition("Longshot Radar");return [data];}
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 let responses;
 try{
  responses=await Promise.allSettled([
   fetchPrivateRadarJSON("/api/admin/longshot-radar",controller.signal),
   fetchPrivateRadarJSON("/api/admin/longshot-radar-editorial",controller.signal)
  ]);
 }finally{clearTimeout(timeout);}
 const byDate=new Map();
 const modern=responses[0];
 if(modern.status==="fulfilled"){
  const result=modern.value;
  if(result?.review_only!==true||!Array.isArray(result.editions))
   throw Error("The protected scored Radar feed is malformed.");
  for(const row of result.editions){
   if(!row||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.race_date)||
      !["prescratch","scratch_updated"].includes(row.status)||
      !Array.isArray(row.candidates))throw Error("The protected Radar edition failed validation.");
   byDate.set(row.race_date,row);
  }
 }
 const old=responses[1];
 if(old.status==="fulfilled"){
  const result=old.value,edition=result?.edition;
  if(result?.review_only!==true||result?.customer_publish_approved!==false||
     edition?.status!=="published_pdf_reference"||!Array.isArray(edition.candidates))
   throw Error("The protected historical publication failed validation.");
  if(!byDate.has(edition.race_date))byDate.set(edition.race_date,edition);
 }
 if(!byDate.size){
  const failures=responses.filter(x=>x.status==="rejected").map(x=>String(x.reason?.message||"Source unavailable."));
  throw Error(failures[0]||"No approved Radar edition is available in private storage.");
 }
 return [...byDate.values()].sort((a,b)=>b.race_date.localeCompare(a.race_date));
}
async function initialize(){
 status.hidden=false;
 status.textContent="Loading Longshot Radar…";
 if(retry)retry.hidden=true;
 app.hidden=true;
 empty.hidden=true;
 try{
  state.editions=await loadAvailableEditions();
  state.date=state.editions[0].race_date;
  refreshView();
  status.hidden=true;
 }catch(e){
  console.warn("Radar protected feed could not initialize:",e instanceof Error?e.name:"unknown");
  status.textContent=e?.name==="AbortError"?
    "The Radar feed timed out. Check your connection and try again.":
    String(e?.message||"The Radar feed could not be loaded.");
  status.hidden=false;
  if(retry)retry.hidden=false;
  app.hidden=true;
 }
}
retry?.addEventListener("click",initialize);
q("#rr-lr-date").addEventListener("change",event=>{
 state.date=event.target.value;renderCandidates();
});
q("#rr-lr-sort").addEventListener("change",event=>{state.sort=event.target.value;renderCandidates();});
initialize();
})();

/* Longshot Radar native review UI. No scoring, ranking or real-odds inference. */
(()=>{
"use strict";
const q=selector=>document.querySelector(selector);
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
 const analysis=make("div","rr-lr-inline-analysis");
 analysis.append(make("p","rr-lr-case",item.betting_case));
 if(item.source_causal_evidence){
  const evidence=make("div","rr-lr-evidence");
  evidence.append(make("strong","","Evidence"),make("p","",item.source_causal_evidence));
  analysis.append(evidence);
 }
 if(item.counterargument_checked){
  const counter=make("div","rr-lr-evidence");
  counter.append(make("strong","","Counterargument"),make("p","",item.counterargument_checked));
  analysis.append(counter);
 }
 card.append(racebar,top,analysis);
 return card;
}
function renderCandidates(){
 const edition=currentEdition(),target=q("#rr-lr-candidates");
 if(!edition)return;
 q("#rr-lr-date-title").textContent=dateLabel(edition.race_date);
 q("#rr-lr-stage").textContent=edition.status==="published_pdf_reference"?"PUBLISHED CARD":(edition.status==="prescratch"?"INITIAL · CURRENT":"SCRATCH-UPDATED");
 q("#rr-lr-updated").textContent=edition.status==="published_pdf_reference"?"November 23 publication · original morning line, not live tote":"Production "+timeLabel(edition.generated_at)+" · revision "+edition.revision;
 let candidates=[...edition.candidates];
 candidates=orderByDay(candidates,state.sort);
 q("#rr-lr-count").textContent=candidates.length+" horses · "+(state.sort==="post-time"?"Post-time order":"Track order");
 if(!candidates.length){
  target.replaceChildren(make("div","rr-lr-list-empty","No selections in this approved edition. Longshot Radar does not force a daily pick."));
 }else target.replaceChildren(...candidates.map(makeCard));
}
function refreshView(){
 renderDates();renderCandidates();
 empty.hidden=true;app.hidden=false;
}
// Native Radar reader: all actual horses arrive from the protected Cloudflare
// R2 endpoint. No manual JSON uploader, fictional fixture or public paid JSON.
const retry=q("#rr-lr-retry");
async function loadPublishedCard(){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 let response;
 try{
  response=await fetch("/api/admin/longshot-radar-editorial",{credentials:"same-origin",cache:"no-store",redirect:"follow",signal:controller.signal,headers:{"Accept":"application/json"}});
 }finally{clearTimeout(timeout);}
 if(response.redirected||!String(response.headers.get("content-type")||"").toLowerCase().includes("application/json"))
  throw Error("Your private review session may have expired. Sign in again, then retry.");
 if(!response.ok)throw Error("The published Radar feed is unavailable (HTTP "+response.status+"). Please try again.");
 const result=await response.json();
 const edition=result?.edition;
 if(result?.review_only!==true||result?.customer_publish_approved!==false||edition?.status!=="published_pdf_reference"||
    !Array.isArray(edition.candidates)||edition.candidates.length!==10)
  throw Error("The November 23 Radar feed is incomplete. Nothing was substituted or fabricated.");
 return edition;
}
async function initialize(){
 status.hidden=false;
 status.textContent="Loading the November 23 published Radar…";
 if(retry)retry.hidden=true;
 app.hidden=true;
 empty.hidden=true;
 try{
  const edition=await loadPublishedCard();
  state.editions=[edition];
  state.date=edition.race_date;
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

/* Rail & Rye native Target List daily reader.
   Source-supplied data only; track/time controls change presentation, never selection. */
(()=>{
"use strict";
const get=id=>document.getElementById(id);
const state={edition:null,dates:[],uploadedAt:null,lastFocus:null,reviewOnly:false};
const raceBanner=globalThis.RRResearchRaceBanner;
if(!raceBanner?.render)throw Error("Canonical research race banner must load before Target List.");
const raceOrder=globalThis.RRResearchRaceOrder;
if(!raceOrder?.sort)throw Error("Canonical research race ordering must load before Target List.");
const dateSelect=get("rr-target-date"),sortSelect=get("rr-target-sort");
const status=get("rr-target-status"),app=get("rr-target-app"),empty=get("rr-target-empty");
const list=get("rr-target-list"),dialog=get("rr-target-dialog");
const content=get("rr-target-dialog-content"),dialogTitle=get("rr-target-dialog-title");
const node=(tag,cls,text)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==undefined)el.textContent=String(text);
 return el;
};
const set=(id,value)=>{const el=get(id);if(el)el.textContent=value??"";};
const add=(parent,...children)=>{parent.append(...children);return parent;};
const displayDate=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return value||"";
 const [year,month,day]=value.split("-").map(Number);
 return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"}).format(new Date(year,month-1,day,12));
};
const option=(select,value,label)=>{const el=node("option","",label);el.value=value;select.append(el);};
function sortedTargets(edition){
 return raceOrder.sort(edition.targets,sortSelect?.value==="track"?"track":"post-time");
}
function saddle(program){
 const wrapper=node("span","rr-target-saddle");
 const match=/^(\d{1,2})([A-Za-z]?)$/.exec(program);
 const number=match?Number(match[1]):0;
 if(number>=1&&number<=20){
  const img=node("img");img.src="/assets/approved/saddlecloths/"+number+".png";
  img.width=30;img.height=30;img.alt="Saddlecloth "+program;
  wrapper.append(img);
  if(match[2])wrapper.append(node("span","rr-target-suffix",match[2]));
 }else wrapper.append(node("span","rr-target-saddle-text",program));
 return wrapper;
}
// Presentation-only: preserve stored fractional odds while using the approved
// American tote display (9-5, 3-1); no pricing or probability recalculation.
const tote=value=>String(value??"").replace(/^(\d+)\s*\/\s*(\d+)$/,"$1-$2");
function stat(label,value,kind){
 const el=node("div","rr-target-stat rr-target-stat-"+kind);
 add(el,node("span","rr-target-stat-label",label),node("strong","rr-target-stat-value",value));
 return el;
}
function horseRow(role,runner,entry){
 // Horse information itself opens details: no repeated oversized action button.
 const line=node(entry?"button":"div","rr-target-horse-row"+(role==="ATTACK"?" rr-target-attack":""));
 if(entry){
  line.type="button";
  line.setAttribute("aria-label","View "+runner.horse_name+" details for "+entry.track+" Race "+entry.race_number);
  line.addEventListener("click",()=>openAnalysis(entry,line));
 }
 const identity=node("span","rr-target-horse-identity");
 const copy=node("span","rr-target-horse-copy");
 add(copy,node("strong","rr-target-horse-name",runner.horse_name),
  node("span","rr-target-ml-inline","ML "+tote(runner.morning_line)));
 add(identity,saddle(runner.program_number),copy);
 const info=node("span","rr-target-runner-info");
 add(info,node("span","rr-target-horse-role",role),identity);
 const metrics=node("span","rr-target-horse-stats");
 add(metrics,stat("WIN %",String(runner.win_probability)+"%","win"),
   stat("FAIR ODDS",tote(runner.fair_odds),"fair"));
 add(line,info,metrics);
 if(runner.trainer||runner.jockey){
  line.append(node("span","rr-target-horse-connections",[runner.trainer,runner.jockey].filter(Boolean).join(" | ")));
 }
 return line;
}
// Shared production title authority with Projections and Longshot Radar.
// This changes presentation only — never the underlying Target List model.
function raceMeta(entry){
 const title=raceBanner.describe(entry);
 return [entry.distance,entry.surface,title?.title].filter(Boolean).join(" · ");
}
function scratchList(entry){
 if(!entry.scratches?.length)return null;
 const container=node("div","rr-target-scratches");
 container.append(node("strong","","OFFICIAL SCRATCHES"));
 for(const scratch of entry.scratches){
  const item=node("span","rr-target-scratch");
  add(item,saddle(scratch.program_number),node("span","",scratch.horse_name));
  container.append(item);
 }
 return container;
}
function openAnalysis(entry,trigger){
 state.lastFocus=trigger;
 dialogTitle.textContent=entry.track+" · Race "+entry.race_number;
 content.replaceChildren();
 const context=node("p","rr-target-drawer-meta",[entry.post_time_et,raceMeta(entry)].filter(Boolean).join(" · "));
 raceBanner.appendGradeTrophy(context,raceBanner.describe(entry)?.grade);
 add(content,context,horseRow("ML FAVORITE",entry.favorite),horseRow("ATTACK",entry.attack));
 if(entry.also_live)content.append(horseRow("ALSO LIVE",entry.also_live));
 const analysis=node("section","rr-target-drawer-analysis");
 add(analysis,node("h3","","THE RAIL & RYE ANALYSIS"),node("p","",entry.analysis));
 content.append(analysis);
 const scratches=scratchList(entry);
 if(scratches)content.append(scratches);
 if(typeof dialog.showModal==="function")dialog.showModal();
}
function targetCard(entry){
 const card=node("article","rr-target-card");
 card.append(raceBanner.render(entry));
 add(card,horseRow("ML FAVORITE",entry.favorite,entry),horseRow("ATTACK",entry.attack,entry));
 if(entry.also_live)card.append(horseRow("ALSO LIVE",entry.also_live,entry));
 card.append(node("p","rr-target-analysis-text",entry.analysis));
 const scratches=scratchList(entry);
 if(scratches)card.append(scratches);
 return card;
}
function renderTargets(){
 const edition=state.edition;if(!edition)return;
 const ordered=sortedTargets(edition);
 list.replaceChildren(...ordered.map(targetCard));
 set("rr-target-count",ordered.length+" "+(ordered.length===1?"target":"targets"));
 set("rr-target-context",sortSelect?.value==="track"?"Track order":"Post-time order");
 if(!ordered.length)list.append(node("p","rr-target-no-results","No targets for this date."));
}
function setEdition(data,preferredDate){
 state.edition=data.edition||null;state.dates=data.dates||[];state.uploadedAt=data.uploaded_at||null;state.reviewOnly=Boolean(data.review_only);

 const current=state.edition?.race_date||preferredDate||"";
 dateSelect.replaceChildren();
 for(const value of state.dates)option(dateSelect,value,displayDate(value));
 if(current&&!state.dates.includes(current))option(dateSelect,current,displayDate(current));
 if(current)dateSelect.value=current;
 app.hidden=!state.edition;empty.hidden=!!state.edition;
 if(!state.edition){status.textContent="No Target List selections are available.";return;}
 status.textContent="";
 renderTargets();
}
async function load(date){
 status.textContent="Loading Target List…";
 try{
  if(globalThis.RRCustomerReader){const edition=await RRCustomerReader.edition("Target List");setEdition({edition,dates:[edition.race_date]},edition.race_date);return;}
  const suffix=date?"?date="+encodeURIComponent(date):"";
  const reviewRes=await fetch("/api/admin/target-list-review"+suffix,{credentials:"same-origin",cache:"no-store"});
  const review=await reviewRes.json().catch(()=>({}));
  if(reviewRes.ok&&review.edition){
   setEdition({...review,review_only:true},date);
   return;
  }
  if(!reviewRes.ok)throw Error(review.error||"Target List service unavailable.");
  const res=await fetch("/api/admin/target-list"+suffix,{credentials:"same-origin",cache:"no-store"});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||"Unable to load Target List.");
  setEdition(data,date);
 }catch(e){
  app.hidden=true;empty.hidden=false;status.textContent=String(e.message||"Target List unavailable.");
 }
}
dateSelect.addEventListener("change",()=>load(dateSelect.value));
sortSelect.addEventListener("change",renderTargets);
get("rr-target-dialog-close").addEventListener("click",()=>dialog.close());
dialog.addEventListener("close",()=>state.lastFocus?.focus());
load();
})();
/* Rail & Rye native Target List daily reader.
   Source-supplied data only; track/time controls change presentation, never selection. */
(()=>{
"use strict";
const get=id=>document.getElementById(id);
const state={edition:null,dates:[],uploadedAt:null,lastFocus:null,reviewOnly:false};
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
const statusText=edition=>state.reviewOnly?"EDITORIAL REVIEW":edition.status==="initial"?"INITIAL · CURRENT":"SCRATCH UPDATE · CURRENT";
// A missing/invalid post time sorts after sourced times, never guessed from track or race number.
function postMinutes(value){
 const match=/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i.exec(String(value||""));
 if(!match)return Number.POSITIVE_INFINITY;
 const hour=Number(match[1]),minute=Number(match[2]);
 if(hour<1||hour>12||minute>59)return Number.POSITIVE_INFINITY;
 return (hour%12+(match[3].toUpperCase()==="PM"?12:0))*60+minute;
}
const collator=new Intl.Collator("en",{sensitivity:"base",numeric:true});
function sortedTargets(edition){
 const result=[...edition.targets];
 const choice=sortSelect?.value==="track"?"track":"post-time";
 const compareTime=(a,b)=>{
  const t=postMinutes(a.post_time_et)-postMinutes(b.post_time_et);
  // Infinity-Infinity is NaN; source-rank only provides a stable fallback.
  return Number.isNaN(t)?0:t;
 };
 result.sort((a,b)=>{
  const track=collator.compare(a.track,b.track),time=compareTime(a,b);
  if(choice==="track")return track||time||a.race_number-b.race_number||a.rank-b.rank;
  return time||track||a.race_number-b.race_number||a.rank-b.rank;
 });
 return result;
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
 add(metrics,stat("ML",tote(runner.morning_line),"ml"),
  stat("WIN",String(runner.win_probability)+"%","win"),
  stat("FAIR",tote(runner.fair_odds),"fair"));
 add(line,info,metrics);
 if(runner.trainer||runner.jockey){
  line.append(node("span","rr-target-horse-connections",[runner.trainer,runner.jockey].filter(Boolean).join(" | ")));
 }
 return line;
}
function headerColumns(){
 const head=node("div","rr-target-column-head");
 const metrics=node("div","rr-target-column-metrics");
 add(metrics,node("span","","ML"),node("span","","WIN %"),node("span","","FAIR ODDS"));
 add(head,node("span","","RUNNER / SELECTION"),metrics);
 return head;
}
// Shared production title authority with Projections and Longshot Radar.
// This changes presentation only — never the underlying Target List model.
function sourceRaceTitle(entry){
 const raw=entry.stakes_name||entry.race_name||entry.conditions;
 if(typeof raw!=="string"||!raw.trim())return null;
 const official=globalThis.RRRaceTitles?.describe?.(entry);
 if(official?.title)return official;
 // Defensive display fallback: do not infer grade if canonical utility
 // is unavailable; still expand a terminal stakes suffix for readability.
 const allCaps=/[A-Z]/.test(raw)&&!/[a-z]/.test(raw);
 let fallback=raw.replace(/\s*(?:presented|sponsored|powered)\s+by\b.*$/i,"")
  .replace(/\b(?:S|Stk|Stks)\.?$/i,"Stakes").trim();
 if(allCaps)fallback=fallback.toLowerCase().replace(/\b[a-z]/g,x=>x.toUpperCase());
 return {title:fallback,grade:null};
}
function appendGradeTrophy(parent,grade){
 if(!Number.isInteger(grade)||grade<1||grade>3)return;
 const badge=node("span","rr-ed-grade-trophy rr-ed-grade-trophy--g"+grade);
 badge.setAttribute("aria-label","Grade "+grade+" stakes trophy");
 badge.title="Grade "+grade+" Stakes";
 add(badge,node("span","rr-ed-grade-trophy-icon","🏆"),node("strong","rr-ed-grade-trophy-label","G"+grade));
 parent.append(badge);
}
function raceMeta(entry){
 const title=sourceRaceTitle(entry);
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
 appendGradeTrophy(context,sourceRaceTitle(entry)?.grade);
 add(content,context,headerColumns(),horseRow("ML FAVORITE",entry.favorite),horseRow("ATTACK",entry.attack));
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
 const head=node("div","rr-target-racebar");
 const titleRow=node("div","rr-target-racebar-main");
 add(titleRow,node("h3","",entry.track),node("span","rr-target-race-number","RACE "+entry.race_number));
 if(entry.post_time_et)titleRow.append(node("span","rr-target-post",entry.post_time_et));
 head.append(titleRow);
 // Match Longshot Radar: one strong headline, full source conditions immediately
 // below it in the SAME navy banner; no shrinking, clipping, or invented values.
 const meta=raceMeta(entry);
 if(meta){
  const facts=node("p","rr-target-race-facts",meta);
  appendGradeTrophy(facts,sourceRaceTitle(entry)?.grade);
  head.append(facts);
 }
 add(card,head);
 add(card,headerColumns(),horseRow("ML FAVORITE",entry.favorite,entry),horseRow("ATTACK",entry.attack,entry));
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
 if(!ordered.length)list.append(node("p","rr-target-no-results","No qualifying Target List selections were published for this date."));
}
function setEdition(data,preferredDate){
 state.edition=data.edition||null;state.dates=data.dates||[];state.uploadedAt=data.uploaded_at||null;state.reviewOnly=Boolean(data.review_only);

 const current=state.edition?.race_date||preferredDate||"";
 dateSelect.replaceChildren();
 for(const value of state.dates)option(dateSelect,value,displayDate(value));
 if(current&&!state.dates.includes(current))option(dateSelect,current,displayDate(current));
 if(current)dateSelect.value=current;
 app.hidden=!state.edition;empty.hidden=!!state.edition;
 if(!state.edition){status.textContent="No private Target List editions are available.";set("rr-target-freshness","");return;}
 status.textContent="";
 const summary="Rev "+state.edition.revision+(state.reviewOnly?"":" · "+statusText(state.edition));
 set("rr-target-freshness",summary+(state.uploadedAt?" · Updated "+new Date(state.uploadedAt).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):""));
 renderTargets();
}
async function load(date){
 status.textContent="Loading private Target List…";
 try{
  const suffix=date?"?date="+encodeURIComponent(date):"";
  const reviewRes=await fetch("/api/admin/target-list-review"+suffix,{credentials:"same-origin",cache:"no-store"});
  const review=await reviewRes.json().catch(()=>({}));
  if(reviewRes.ok&&review.edition){
   setEdition({...review,review_only:true},date);
   return;
  }
  if(!reviewRes.ok)throw Error(review.error||"Private review service unavailable.");
  const res=await fetch("/api/admin/target-list"+suffix,{credentials:"same-origin",cache:"no-store"});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||"Unable to retrieve the private edition.");
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
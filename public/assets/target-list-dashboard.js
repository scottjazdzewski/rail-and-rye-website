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
 return new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date(year,month-1,day,12));
};
const option=(select,value,label)=>{const el=node("option","",label);el.value=value;select.append(el);};
const statusText=edition=>state.reviewOnly?"REVIEW ONLY · NOT CERTIFIED":edition.status==="initial"?"INITIAL · CURRENT":"SCRATCH UPDATE · CURRENT";
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
function stat(label,value,kind){
 const el=node("div","rr-target-stat rr-target-stat-"+kind);
 add(el,node("span","rr-target-stat-label",label),node("strong","rr-target-stat-value",value));
 return el;
}
function horseRow(role,runner){
 const line=node("div","rr-target-horse-row"+(role==="ATTACK"?" rr-target-attack":""));
 const identity=node("div","rr-target-horse-identity");
 add(identity,saddle(runner.program_number),node("strong","rr-target-horse-name",runner.horse_name));
 const metrics=node("div","rr-target-horse-stats");
 add(metrics,stat("ML ODDS",runner.morning_line,"ml"),
  stat("WIN %",String(runner.win_probability)+"%","win"),
  stat("FAIR ODDS",runner.fair_odds,"fair"));
 add(line,node("span","rr-target-horse-role",role),identity,metrics);
 if(runner.trainer||runner.jockey){
  const names=node("p","rr-target-horse-connections",[runner.trainer,runner.jockey].filter(Boolean).join(" | "));
  line.append(names);
 }
 return line;
}
function headerColumns(){
 const head=node("div","rr-target-column-head");
 const metrics=node("div","rr-target-column-metrics");
 add(metrics,node("span","","ML ODDS"),node("span","","WIN %"),node("span","","FAIR ODDS"));
 add(head,node("span","",""),node("span","","HORSE"),metrics);
 return head;
}
function raceMeta(entry){
 return [entry.distance,entry.surface,entry.conditions].filter(Boolean).join(" · ");
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
 add(head,node("h3","",entry.track),node("span","rr-target-race-number","RACE "+entry.race_number));
 if(entry.post_time_et)head.append(node("span","rr-target-post",entry.post_time_et));
 add(card,head);
 const meta=raceMeta(entry);
 if(meta)card.append(node("p","rr-target-race-facts",meta));
 add(card,headerColumns(),horseRow("ML FAVORITE",entry.favorite),horseRow("ATTACK",entry.attack));
 if(entry.also_live)card.append(horseRow("ALSO LIVE",entry.also_live));
 card.append(node("p","rr-target-analysis-text",entry.analysis));
 const scratches=scratchList(entry);
 if(scratches)card.append(scratches);
 const bottom=node("div","rr-target-card-bottom");
 const button=node("button","rr-target-analyze","Race Details");
 button.type="button";
 button.setAttribute("aria-label","Read race details for "+entry.track+" race "+entry.race_number);
 button.addEventListener("click",()=>openAnalysis(entry,button));
 bottom.append(button);card.append(bottom);
 return card;
}
function renderTargets(){
 const edition=state.edition;if(!edition)return;
 const ordered=sortedTargets(edition);
 list.replaceChildren(...ordered.map(targetCard));
 set("rr-target-count",ordered.length+" "+(ordered.length===1?"target":"targets"));
 set("rr-target-context",displayDate(edition.race_date)+" · "+statusText(edition));
 if(!ordered.length)list.append(node("p","rr-target-no-results","No qualifying Target List selections were published for this date."));
}
function setEdition(data,preferredDate){
 state.edition=data.edition||null;state.dates=data.dates||[];state.uploadedAt=data.uploaded_at||null;state.reviewOnly=Boolean(data.review_only);
 const reviewBanner=get("rr-target-review-banner");
 if(reviewBanner){
  reviewBanner.hidden=!state.reviewOnly;
  if(state.reviewOnly)reviewBanner.textContent=data.demo_example?"SYNTHETIC LAYOUT EXAMPLE · NOT REAL RACE PICKS · PRIVATE REVIEW":"PRIVATE EDITORIAL REVIEW · NOT SCORER-CERTIFIED · NOT CUSTOMER-FACING";
 }
 const current=state.edition?.race_date||preferredDate||"";
 dateSelect.replaceChildren();
 for(const value of state.dates)option(dateSelect,value,displayDate(value));
 if(current&&!state.dates.includes(current))option(dateSelect,current,displayDate(current));
 if(current)dateSelect.value=current;
 app.hidden=!state.edition;empty.hidden=!!state.edition;
 if(!state.edition){status.textContent="No private Target List editions are available.";set("rr-target-freshness","");return;}
 status.textContent="";
 const summary=statusText(state.edition)+" · Revision "+state.edition.revision;
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
  setEdition(!date&&!data.edition?DEMO_EXAMPLE:data,date);
 }catch(e){
  app.hidden=true;empty.hidden=false;status.textContent=String(e.message||"Target List unavailable.");
 }
}
// Synthetic data belongs only to this protected admin UI and has no production significance.
const demoHorse=(program_number,horse_name,win_probability,morning_line,fair_odds)=>({program_number,horse_name,win_probability,morning_line,fair_odds,trainer:"",jockey:""});
const DEMO_EXAMPLE={review_only:true,demo_example:true,dates:["2026-11-23"],edition:{
 schema_version:1,product_type:"target_list",race_date:"2026-11-23",revision:1,status:"initial",targets:[
 {rank:1,track:"Example Downs",race_number:3,post_time_et:"1:35 PM ET",distance:"6F",surface:"Dirt",conditions:"",
  favorite:demoHorse("2","Sample Favorite",12.4,"2/1","7/1"),attack:demoHorse("5","Sample Alternative",31.2,"6/1","5/2"),
  analysis:"EXAMPLE ONLY: This sample explains the spacing of the on-site analysis panel. It is not a real horse, score, selection, or recommendation.",scratches:[]},
 {rank:2,track:"Example Park",race_number:5,post_time_et:"2:20 PM ET",distance:"1M",surface:"Turf",conditions:"",
  favorite:demoHorse("4","Sample Front Runner",16.1,"5/2","5/1"),attack:demoHorse("12","Sample Closer",36.9,"8/1","9/5"),
  analysis:"EXAMPLE ONLY: Every target is a compact, self-contained race panel, not a PDF page. The horse-specific analysis appears without opening another window.",scratches:[]},
 {rank:3,track:"Example Downs",race_number:8,post_time_et:"4:10 PM ET",distance:"7F",surface:"Dirt",conditions:"",
  favorite:demoHorse("7","Sample Morning Line",9.5,"3/1","9/1"),attack:demoHorse("11","Sample Challenger",30.7,"10/1","5/2"),
  analysis:"EXAMPLE ONLY: Change Sort by to see the same selections grouped by track or ordered across all tracks by post time.",scratches:[]}
 ]}};
dateSelect.addEventListener("change",()=>load(dateSelect.value));
get("rr-target-local-file").addEventListener("change",async event=>{
 const el=event?.target||get("rr-target-local-file");
 const file=el.files?.[0];if(!file)return;
 try{
  if(file.size>512*1024)throw Error("The local review file exceeds 512 KB.");
  const raw=JSON.parse(await file.text());
  if(raw.schema_version!==1||raw.product_type!=="target_list"||raw.review_only!==true||
     raw.customer_publish_approved!==false||raw.production_receipt_verified!==false||
     !/^\d{4}-\d{2}-\d{2}$/.test(raw.race_date)||!Array.isArray(raw.targets)||raw.targets.length>100)
    throw Error("Choose a private, noncertified Target List staging review JSON.");
  for(const item of raw.targets){
   if(!item||typeof item.track!=="string"||!Number.isInteger(item.race_number)||typeof item.analysis!=="string"||
      !item.favorite||!item.attack||typeof item.favorite.horse_name!=="string"||typeof item.attack.horse_name!=="string"||
      !Number.isFinite(item.favorite.win_probability)||!Number.isFinite(item.attack.win_probability))
    throw Error("This review is missing required source-backed fields.");
  }
  setEdition({review_only:true,dates:[raw.race_date],edition:raw},raw.race_date);
  status.textContent="Local review loaded in this browser only. The website did not upload or store this file.";
 }catch(error){status.textContent=String(error.message||"Could not open local review.");}
});
sortSelect.addEventListener("change",renderTargets);
get("rr-target-dialog-close").addEventListener("click",()=>dialog.close());
dialog.addEventListener("close",()=>state.lastFocus?.focus());
get("rr-target-upload-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const file=get("rr-target-file").files?.[0];if(!file)return;
 const output=get("rr-target-upload-status");
 output.textContent="Validating private source…";
 try{
  if(file.size>512*1024)throw Error("File exceeds 512 KB private upload limit.");
  const res=await fetch("/api/admin/target-list",{method:"POST",credentials:"same-origin",
   headers:{"Content-Type":"application/json"},body:await file.text()});
  const result=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(result.error||"Upload rejected.");
  output.textContent=(result.unchanged?"Same version already saved.":"Saved for private review.")+
   " "+result.race_date+" · Revision "+result.revision;
  await load(result.race_date);
 }catch(e){output.textContent=String(e.message||"Upload failed.");}
});
load();
})();
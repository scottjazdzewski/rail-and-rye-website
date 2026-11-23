/* Native Target List renderer. Data always comes from the authenticated admin API. */
(()=>{
"use strict";
const get=id=>document.getElementById(id);
const state={edition:null,dates:[],uploadedAt:null,selectedDate:null,lastFocus:null};
const dateSelect=get("rr-target-date"),trackSelect=get("rr-target-track"),search=get("rr-target-search");
const status=get("rr-target-status"),app=get("rr-target-app"),empty=get("rr-target-empty");
const list=get("rr-target-list"),dialog=get("rr-target-dialog");
const content=get("rr-target-dialog-content"),dialogTitle=get("rr-target-dialog-title");
const node=(tag,cls,text)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==undefined)el.textContent=String(text);
 return el;
};
const set=(id,value)=>{const item=get(id);if(item)item.textContent=value??"";};
const add=(parent,...children)=>{parent.append(...children);return parent;};
const displayDate=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return value||"";
 const [year,month,day]=value.split("-").map(Number);
 return new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date(year,month-1,day,12));
};
function option(select,value,label){
 const el=node("option","",label);el.value=value;select.append(el);
}
function statusText(edition){
 return edition.status==="initial"?"INITIAL · CURRENT":"SCRATCH UPDATE · CURRENT";
}
function saddle(program){
 const wrapper=node("span","rr-target-saddle");
 const match=/^(\d{1,2})([A-Za-z]?)$/.exec(program);
 const number=match?Number(match[1]):0;
 if(number>=1&&number<=20){
  const img=node("img");img.src="/assets/approved/saddlecloths/"+number+".png";
  img.width=36;img.height=36;img.alt="Saddlecloth "+program;
  wrapper.append(img);
  if(match[2])wrapper.append(node("span","rr-target-suffix",match[2]));
 }else wrapper.append(node("span","rr-target-saddle-text",program));
 return wrapper;
}
function runnerBlock(role,runner){
 const panel=node("div","rr-target-runner");
 const nameLine=node("div","rr-target-runner-name");
 add(nameLine,saddle(runner.program_number),node("strong","",runner.horse_name));
 const market=node("div","rr-target-markets");
 const win=node("div","rr-target-win");
 add(win,node("strong","rr-target-percent",String(runner.win_probability)+"%"),node("span","rr-target-market-caption","WIN"));
 const fair=node("div","rr-target-fair");
 add(fair,node("strong","",runner.fair_odds),node("span","rr-target-market-caption","FAIR"));
 add(market,win,fair);
 add(panel,node("span","rr-target-role",role),nameLine,node("span","rr-target-ml","M/L "+runner.morning_line),market);
 if(runner.trainer||runner.jockey)panel.append(node("p","rr-target-connections",[runner.trainer,runner.jockey].filter(Boolean).join(" | ")));
 return panel;
}
function row(label,value){
 const el=node("div","rr-target-fact");
 add(el,node("span","",label),node("strong","",value));
 return el;
}
function openAnalysis(entry,trigger){
 state.lastFocus=trigger;
 dialogTitle.textContent=entry.track+" · Race "+entry.race_number+" · Target "+entry.rank;
 content.replaceChildren();
 const info=node("div","rr-target-drawer-context");
 info.append(node("p","rr-target-drawer-meta",
  [entry.post_time_et,entry.surface,entry.distance,entry.conditions].filter(Boolean).join(" · ")));
 if(entry.tier)info.append(node("span","rr-target-tier rr-target-tier-"+entry.tier.toLowerCase(),entry.tier));
 content.append(info);
 const roles=node("div","rr-target-compare");
 roles.append(runnerBlock("VULNERABLE FAVORITE",entry.favorite),runnerBlock("ATTACK",entry.attack));
 content.append(roles);
 if(entry.also_live){
  const section=node("section","rr-target-also");
  add(section,node("h3","","ALSO LIVE"),runnerBlock("ADDITIONAL ALTERNATIVE",entry.also_live));
  content.append(section);
 }
 const analysis=node("section","rr-target-drawer-analysis");
 add(analysis,node("h3","","THE RAIL & RYE ANALYSIS"),node("p","",entry.analysis));
 content.append(analysis);
 if(entry.scratches.length){
  const sec=node("section","rr-target-scratches");
  sec.append(node("h3","","OFFICIAL SCRATCHES"));
  for(const scratch of entry.scratches){
   const el=node("div","rr-target-scratch");
   add(el,saddle(scratch.program_number),node("span","",scratch.horse_name));
   sec.append(el);
  }
  content.append(sec);
 }
 if(typeof dialog.showModal==="function")dialog.showModal();
}
function targetCard(entry){
 const card=node("article","rr-target-card");
 const head=node("div","rr-target-card-top");
 const left=node("div","rr-target-card-label");
 add(left,node("span","rr-target-rank","TARGET "+String(entry.rank).padStart(2,"0")),
  node("h3","",entry.track+" · Race "+entry.race_number));
 const right=node("div","rr-target-card-meta");
 if(entry.tier)right.append(node("span","rr-target-tier rr-target-tier-"+entry.tier.toLowerCase(),entry.tier));
 if(entry.post_time_et)right.append(node("span","rr-target-post",entry.post_time_et));
 add(head,left,right);
 const details=node("p","rr-target-race-facts",
  [entry.surface,entry.distance,entry.conditions].filter(Boolean).join(" · "));
 const compare=node("div","rr-target-compare");
 compare.append(runnerBlock("VULNERABLE FAVORITE",entry.favorite),runnerBlock("ATTACK",entry.attack));
 const bottom=node("div","rr-target-card-bottom");
 const cue=node("p","rr-target-analysis-teaser",entry.analysis);
 const button=node("button","rr-target-analyze","Full Analysis");
 button.type="button";
 button.setAttribute("aria-label","Read full analysis for "+entry.track+" race "+entry.race_number);
 button.addEventListener("click",()=>openAnalysis(entry,button));
 add(bottom,cue,button);
 add(card,head,details,compare,bottom);
 return card;
}
function applyFilters(){
 const edition=state.edition;
 if(!edition)return;
 const track=trackSelect.value;
 const query=search.value.trim().toLowerCase();
 const filtered=edition.targets.filter(entry=>{
  if(track&&entry.track!==track)return false;
  const text=[entry.track,entry.race_number,entry.favorite.horse_name,entry.attack.horse_name,entry.also_live?.horse_name||""].join(" ").toLowerCase();
  return !query||text.includes(query);
 });
 list.replaceChildren(...filtered.map(targetCard));
 set("rr-target-count",filtered.length+" "+(filtered.length===1?"target":"targets"));
 set("rr-target-context",displayDate(edition.race_date)+" · "+statusText(edition));
 if(!filtered.length)list.append(node("p","rr-target-no-results","No qualifying targets match these filters."));
}
function setEdition(data,preferredDate){
 state.edition=data.edition||null;state.dates=data.dates||[];state.uploadedAt=data.uploaded_at||null;
 const current=state.edition?.race_date||preferredDate||"";
 dateSelect.replaceChildren();
 for(const value of state.dates)option(dateSelect,value,displayDate(value));
 if(current&&!state.dates.includes(current))option(dateSelect,current,displayDate(current));
 if(current)dateSelect.value=current;
 const previous=trackSelect.value;const tracks=[...new Set((state.edition?.targets||[]).map(entry=>entry.track))].sort();
 trackSelect.replaceChildren();option(trackSelect,"","All tracks");
 for(const track of tracks)option(trackSelect,track,track);
 if(tracks.includes(previous))trackSelect.value=previous;
 app.hidden=!state.edition;empty.hidden=!!state.edition;
 if(!state.edition){status.textContent="No private Target List editions are available.";set("rr-target-freshness","");return;}
 status.textContent="";
 const summary=statusText(state.edition)+" · Revision "+state.edition.revision;
 set("rr-target-freshness",summary+(state.uploadedAt?" · Loaded "+new Date(state.uploadedAt).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):""));
 applyFilters();
}
async function load(date){
 status.textContent="Loading private Target List…";
 try{
  const url="/api/admin/target-list"+(date?"?date="+encodeURIComponent(date):"");
  const res=await fetch(url,{credentials:"same-origin",cache:"no-store"});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||"Unable to retrieve the private edition.");
  setEdition(data,date);
 }catch(e){
  app.hidden=true;empty.hidden=false;status.textContent=String(e.message||"Target List unavailable.");
 }
}
dateSelect.addEventListener("change",()=>load(dateSelect.value));
trackSelect.addEventListener("change",applyFilters);
search.addEventListener("input",applyFilters);
get("rr-target-dialog-close").addEventListener("click",()=>dialog.close());
dialog.addEventListener("close",()=>state.lastFocus?.focus());
get("rr-target-upload-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const file=get("rr-target-file").files?.[0];
 if(!file)return;
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
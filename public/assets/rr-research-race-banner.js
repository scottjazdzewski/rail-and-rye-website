/* RAIL & RYE — SINGLE RACE HEADER AUTHORITY V1.
   Both Longshot Radar and Target List call this renderer.
   No source editing, model calculations, raw HTML insertion or local fallback. */
(function(root){
"use strict";
const text=value=>String(value??"").replace(/\s+/g," ").trim();
const make=(tag,cls,value)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(value!==undefined&&value!==null)el.textContent=String(value);
 return el;
};
function genericStakes(value){
 const official=root.RRRaceTitles?.genericStakes;
 if(typeof official==="function")return official(value);
 return /^(?:(?:overnight|listed|graded|ungraded|restricted|open|non-graded)\s+)?(?:stake|stakes|stks?\.?|s\.?)\s*(?:\(?\s*(?:g[123]|grade\s*[123])\s*\)?)?$/i.test(text(value));
}
function describe(entry){
 const candidates=[entry?.stakes_name,entry?.race_name,entry?.conditions].map(text).filter(Boolean);
 if(!candidates.length)return null;
 const official=root.RRRaceTitles?.describe?.(entry);
 if(official?.title&&!official.missingStakesName)return official;
 // If the named-race contract is unavailable, use only source text that is
 // not a generic stakes classification. Never turn "STAKES" into a race name.
 const raw=candidates.find(value=>!genericStakes(value));
 if(!raw)return null;
 let title=raw.replace(/\s*(?:presented|sponsored|powered)\s+by\b.*$/i,"")
  .replace(/\s*\(\s*(?:G(?:rade)?\.?|Gr\.?)\s*[-:]?\s*(?:III|II|I|[123])\s*\)\s*$/i,"").trim();
 const caps=/[A-Z]/.test(title)&&!/[a-z]/.test(title);
 title=title.replace(/\b(?:S|Stk|Stks)\.?$/i,"Stakes").trim();
 if(caps)title=title.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase());
 return title?{title,grade:null}:null;
}
function appendGradeTrophy(parent,grade){
 if(!Number.isInteger(grade)||grade<1||grade>3)return;
 const badge=make("span","rr-ed-grade-trophy rr-ed-grade-trophy--g"+grade);
 badge.setAttribute("aria-label","Grade "+grade+" stakes trophy");
 badge.title="Grade "+grade+" Stakes";
 badge.append(make("span","rr-ed-grade-trophy-icon","🏆"),
  make("strong","rr-ed-grade-trophy-label","G"+grade));
 parent.append(badge);
}
function conditionsFact(entry,title){
 let value=text(entry?.conditions);
 if(!value)return "";
 value=value.replace(/\s*(?:presented|sponsored|powered)\s+by\b.*$/i,"").trim();
 const sponsor=text(entry?.sponsor_name||entry?.sponsor);
 if(sponsor){
  const escaped=sponsor.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  value=value.replace(new RegExp("\\s*(?:[-–—,:]\\s*)?"+escaped+"\\s*$","i"),"").trim();
  value=value.replace(new RegExp("^"+escaped+"\\s*(?:[-–—,:]\\s*)?","i"),"").trim();
 }
 const describeTitle=root.RRRaceTitles?.describe;
 if(title?.title&&typeof describeTitle==="function"){
  const found=describeTitle({race_name:"",stakes_name:"",conditions:value,
   stakes_grade:entry.stakes_grade??entry.grade,is_stakes:entry.is_stakes,sponsor_name:sponsor});
  if(found?.title&&found.title.toLocaleLowerCase("en-US")===title.title.toLocaleLowerCase("en-US"))return "";
 }
 return value;
}
function render(entry){
 if(!entry||!text(entry.track)||!Number.isInteger(Number(entry.race_number)))
  throw Error("An original track and race number are required for the race header.");
 const panel=make("div","rr-research-racebar");
 panel.setAttribute("data-rr-race-banner","canonical-v1");
 const row=make("div","rr-research-racebar__main");
 const meta=make("div","rr-research-racebar__identifiers");
 meta.append(make("span","rr-research-racebar__number","RACE "+entry.race_number));
 if(text(entry.post_time_et))meta.append(make("span","rr-research-racebar__post",text(entry.post_time_et)));
 row.append(make("h3","rr-research-racebar__track",text(entry.track)),meta);
 panel.append(row);
 const factsParts=[];
 const addFact=(value,kind)=>{
  const valueText=text(value);
  if(!valueText||genericStakes(valueText))return;
  const key=valueText.toLocaleLowerCase("en-US");
  const existing=factsParts.find(part=>part.text.toLocaleLowerCase("en-US")===key);
  if(existing){if(kind==="title")existing.kind="title";return;}
  factsParts.push({text:valueText,kind});
 };
 const title=describe(entry);
 addFact(entry.distance,"fact");
 addFact(entry.surface,"fact");
 addFact(conditionsFact(entry,title),"fact");
 if(title?.title)addFact(title.title,"title");
 if(factsParts.length){
  const facts=make("p","rr-research-racebar__facts");
  factsParts.forEach((part,index)=>{
   if(index)facts.append(make("span","rr-ed-race-separator"," · "));
   facts.append(make("span",part.kind==="title"?"rr-ed-stakes-title":"",part.text));
   if(part.kind==="title")appendGradeTrophy(facts,title?.grade);
  });
  panel.append(facts);
 }
 return panel;
}
root.RRResearchRaceBanner=Object.freeze({render,describe,appendGradeTrophy,version:"canonical-v1"});
})(globalThis);

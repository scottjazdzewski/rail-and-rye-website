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
function describe(entry){
 const raw=entry?.stakes_name||entry?.race_name||entry?.conditions;
 if(typeof raw!=="string"||!raw.trim())return null;
 const official=root.RRRaceTitles?.describe?.(entry);
 if(official?.title)return official;
 // Text-only fallback if the grade-sensitive title helper is unavailable.
 // Never infer a graded stakes trophy from wording alone.
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
function render(entry){
 if(!entry||!text(entry.track)||!Number.isInteger(Number(entry.race_number)))
  throw Error("An original track and race number are required for the race header.");
 const panel=make("div","rr-research-racebar");
 panel.dataset.rrRaceBanner="canonical-v1";
 const row=make("div","rr-research-racebar__main");
 const meta=make("div","rr-research-racebar__identifiers");
 meta.append(make("span","rr-research-racebar__number","RACE "+entry.race_number));
 if(text(entry.post_time_et))meta.append(make("span","rr-research-racebar__post",text(entry.post_time_et)));
 row.append(make("h3","rr-research-racebar__track",text(entry.track)),meta);
 panel.append(row);
 const parts=[entry.distance,entry.surface].filter(v=>typeof v==="string"&&v.trim()).map(text);
 const title=describe(entry);
 if(parts.length||title){
  const facts=make("p","rr-research-racebar__facts",parts.join(" · "));
  if(title){
   if(parts.length)facts.append(make("span","rr-ed-race-separator"," · "));
   facts.append(make("span","rr-ed-stakes-title",title.title));
   appendGradeTrophy(facts,title.grade);
  }
  panel.append(facts);
 }
 return panel;
}
root.RRResearchRaceBanner=Object.freeze({render,describe,appendGradeTrophy,version:"canonical-v1"});
})(globalThis);

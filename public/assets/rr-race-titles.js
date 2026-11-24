/* Rail & Rye — canonical, sponsor-free stakes display titles.
   Changes display strings only. Never revises race eligibility, grading,
   scoring, purses, time or official model/scratch records. */
(function(root){
 "use strict";
 const clean=value=>String(value??"").replace(/\s+/g," ").trim();
 const gradeToken="(?:G(?:rade)?\\.?|Gr\\.?)(?:\\s*[-:]?\\s*)(?:III|II|I|[123])";
 const gradeDecorated=new RegExp("(?:\\(|\\[)\\s*("+gradeToken+")\\s*(?:\\)|\\])","gi");
 const gradeTrailing=new RegExp("(?:\\s*[-–—,:]?\\s*)("+gradeToken+")\\s*$","i");
 const gradeLeading=new RegExp("^\\s*("+gradeToken+")(?:\\s*[-–—,:]?\\s*)","i");
 function numericGrade(value){
  const text=clean(value).toUpperCase().replace(/[().\[\]]/g,"").replace(/\s+/g,"");
  const match=text.match(/^(?:GRADE|GR|G)?(III|II|I|[123])$/);
  if(!match)return null;
  return ({I:1,II:2,III:3})[match[1]]||Number(match[1]);
 }
 function extractGradeFromTitle(value){
  const text=clean(value);
  const options=[
   ...text.matchAll(new RegExp(gradeDecorated.source,"gi")),
   ...text.matchAll(new RegExp(gradeTrailing.source,"gi")),
   ...text.matchAll(new RegExp(gradeLeading.source,"gi"))
  ];
  const grades=[...new Set(options.map(match=>numericGrade(match[1])).filter(Boolean))];
  return grades.length===1?grades[0]:null;
 }
 function dropGrade(value){
  return clean(value)
   .replace(gradeDecorated," ")
   .replace(gradeLeading,"")
   .replace(gradeTrailing,"")
   .replace(/\s*[-–—,:]\s*$/,"");
 }
 function removeSponsor(value,sponsor){
  let title=clean(value);
  // Source-confirmed venue sponsorship: today's official listing uses
  // "Hollywood Gaming Mahoning Distaff S." Rail & Rye editorial titles omit
  // this sponsor while retaining the named Mahoning Distaff Stakes.
  // Keep this deliberately narrow; never remove unfamiliar named-race words.
  title=title.replace(/^Hollywood Gaming\s+(?=Mahoning\b)/i,"");
  // Remove only explicit sponsorship clauses or a verified sponsor field.
  // Unverified prefixes can be part of official named stakes; don't guess.
  title=title.replace(/\s*\(\s*(?:presented|sponsored|powered)\s+by\b[^)]*\)/gi," ");
  title=title.replace(/\s*(?:[-–—,:]\s*)?(?:presented\s+by|sponsored\s+by|powered\s+by|in\s+(?:association|partnership)\s+with)\b.*$/i,"");
  const name=clean(sponsor);
  if(name){
   const normal=title.toLowerCase(),token=name.toLowerCase();
   // A named sponsor is removed only when clearly separated from the race
   // itself; never drop arbitrary words or race-family names.
   if(normal.startsWith(token+" - ")||normal.startsWith(token+" — ")||
      normal.startsWith(token+" : ")){
    title=title.slice(name.length).replace(/^\s*[-—:]\s*/,"");
   }
   if(title.toLowerCase().endsWith(" - "+token)||
      title.toLowerCase().endsWith(" — "+token))
    title=title.slice(0,-name.length-3);
  }
  return clean(title);
 }
 function expandStakesTitle(value,isStakes){
  let text=clean(value);
  if(!isStakes)return text;
  const originalLetters=text.replace(/[^A-Za-z]/g,"");
  const originallyAllCaps=originalLetters.length>2&&originalLetters===originalLetters.toUpperCase();
  // Only abbreviations used as a racing-name suffix are expanded. This
  // avoids expanding jockey initials or unrelated racing condition codes.
  const suffixes=[
   [/\b(?:Stks?|Stk|Stks\.)\.?$/i,"Stakes"],
   [/\bS\.?$/i,"Stakes"],
   [/\b(?:Hcp|Hdcp|H)\.?$/i,"Handicap"],
   [/\bInv\.?$/i,"Invitational"],
   [/\bMem\.?$/i,"Memorial"]
  ];
  for(const [pattern,replacement] of suffixes){
   if(pattern.test(text)){text=text.replace(pattern,replacement);break;}
  }
  // External cards occasionally provide all-caps race names. Preserve
  // already-cased proper names, but normalize fully uppercase titles.
  if(originallyAllCaps){
   text=text.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase())
    .replace(/\b(Of|And|The|For|At)\b/g,c=>c.toLowerCase());
   text=text.replace(/^(the)\b/,(_,word)=>word[0].toUpperCase()+word.slice(1));
  }
  return text;
 }
 // An official event name must never be reduced to its race classification.
 function genericStakes(value){
  return /^(?:(?:overnight|listed|graded|ungraded|restricted|open|non-graded)\s+)?(?:stake|stakes|stks?\.?|s\.?)\s*(?:\(?\s*(?:g[123]|grade\s*[123])\s*\)?)?$/i.test(clean(value));
 }
 function describe(race){
  const candidates=[race?.stakes_name,race?.race_name,race?.conditions]
   .map(clean).filter(Boolean);
  const raw=candidates.find(value=>!genericStakes(dropGrade(value)))||
   candidates[0]||"Race projections";
  const specificGrade=numericGrade(race?.stakes_grade??race?.grade);
  const printedGrade=extractGradeFromTitle(raw) ?? extractGradeFromTitle(race?.conditions);
  const conflict=specificGrade&&printedGrade&&specificGrade!==printedGrade;
  const grade=conflict?null:(specificGrade||printedGrade);
  const hasStakesSignal=Boolean(grade||race?.is_stakes===true||
   candidates.some(value=>/\bStakes?\b|\bStks?\.?\b|\bS\.$/i.test(value)||
    /\b(?:S|Stk|Stks)\.?\s*\(?\s*(?:G[123]|GI{1,3}|Grade\s+[123])\b/i.test(value))||
   (race?.stakes_name&&clean(race.stakes_name)));
  let title=dropGrade(removeSponsor(raw,race?.sponsor||race?.sponsor_name));
  title=expandStakesTitle(title,hasStakesSignal);
  if(conflict)title=expandStakesTitle(removeSponsor(raw,race?.sponsor||race?.sponsor_name),true);
  const missingStakesName=hasStakesSignal&&genericStakes(dropGrade(title));
  // Legacy fallback never misrepresents an unnamed race as "Stakes".
  // Publication validation rejects missing names; verified dated data repairs
  // previously published metadata without changing TRI/F4 model inputs.
  if(missingStakesName)title=Number.isInteger(Number(race?.race_number))?
   "Race "+race.race_number:"Race";
  return {title:title||"Race projections",grade:isNumber(grade)?grade:null,
   stakes:!!hasStakesSignal,missingStakesName:!!missingStakesName};
 }
 function isNumber(value){return Number.isInteger(value)&&value>=1&&value<=3;}
 root.RRRaceTitles=Object.freeze({describe,numericGrade,genericStakes});
})(globalThis);

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
  const letters=text.replace(/[^A-Za-z]/g,"");
  if(letters.length>2&&letters===letters.toUpperCase()){
   text=text.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase())
    .replace(/\b(Of|And|The|For|At)\b/g,c=>c.toLowerCase());
   text=text.replace(/^(the)\b/,(_,word)=>word[0].toUpperCase()+word.slice(1));
  }
  return text;
 }
 function describe(race){
  const raw=clean(race?.stakes_name||race?.race_name||race?.conditions||"Race projections");
  const hasGradeField=race?.stakes_grade!==undefined||race?.grade!==undefined;
  const specificGrade=numericGrade(race?.stakes_grade??race?.grade);
  const printedGrade=extractGradeFromTitle(raw) ?? extractGradeFromTitle(race?.conditions);
  // A conflict or unrecognized official grade must never be silently
  // transformed into a different trophy.
  const conflict=specificGrade&&printedGrade&&specificGrade!==printedGrade;
  const grade=conflict?null:(specificGrade||printedGrade);
  const hasStakesSignal=Boolean(grade||race?.is_stakes===true||
    /\bStakes?\b|\bStks?\.?\b|\bS\.$/i.test(raw)||
    /\b(?:S|Stk|Stks)\.?\s*\(?\s*(?:G[123]|GI{1,3}|Grade\s+[123])\b/i.test(raw)||
    (race?.stakes_name&&clean(race.stakes_name)));
  let title=dropGrade(removeSponsor(raw,race?.sponsor||race?.sponsor_name));
  title=expandStakesTitle(title,hasStakesSignal);
  // A conflicting grade in the source should never display a fabricated
  // trophy. Preserve the text rather than guessing at its classification.
  if(conflict)title=expandStakesTitle(removeSponsor(raw,race?.sponsor||race?.sponsor_name),true);
  return {title:title||"Race projections",grade:isNumber(grade)?grade:null,stakes:!!hasStakesSignal};
 }
 function isNumber(value){return Number.isInteger(value)&&value>=1&&value<=3;}
 root.RRRaceTitles=Object.freeze({describe,numericGrade});
})(globalThis);

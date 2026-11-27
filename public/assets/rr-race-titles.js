/* Rail & Rye — canonical, sponsor-free stakes display titles.
   Changes display strings only. Never revises race eligibility, grading,
   scoring, purses, time or official model/scratch records. */
(function(root){
 "use strict";
 const clean=value=>String(value??"").replace(/\s+/g," ").trim();
 const gradeToken="(?:G(?:rade)?\\.?|Gr\\.?)(?:\\s*[-:]?\\s*)(?:III|II|I|[123])";
 const gradeDecorated=new RegExp("(?:\\(|\\[)\\s*("+gradeToken+")\\s*(?:\\)|\\])","gi");
 const gradeTrailing=new RegExp("(?:^|[\\s–—,:-]+)("+gradeToken+")\\s*$","i");
 const gradeLeading=new RegExp("^\\s*("+gradeToken+")(?=\\s|[-–—,:]|$)(?:\\s*[-–—,:]?\\s*)","i");
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
   // The explicit sponsor_name field also authorizes stripping a bare
   // sponsor prefix/suffix, but only when a meaningful named event remains.
   // Do not turn "Sponsor Stakes" into the unhelpful generic word "Stakes".
   const lower=title.toLowerCase();
   if(lower.startsWith(token+" ")){
    const remainder=title.slice(name.length).replace(/^[\s:—–-]+/,"").trim();
    if(remainder&&!genericStakes(remainder)&&/[A-Za-z]{3}/.test(remainder))
     title=remainder;
   }else if(lower.endsWith(" "+token)){
    const remainder=title.slice(0,-name.length).trim();
    if(remainder&&!genericStakes(remainder)&&/[A-Za-z]{3}/.test(remainder))
     title=remainder;
   }
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
 // Source-only maiden classifications; never infer from a purse or claiming price.
 function maidenClass(value){
  const raw=clean(value);
  const token=raw.toLowerCase().replace(/[.]/g,"").replace(/[-–—]/g," ").replace(/\s+/g," ");
  const patterns=[
   [/^(?:maiden|mdn|md)\s+(?:optional\s+claiming|opt(?:ional)?\s+clm|oc)\b|^moc\b/,"Maiden Optional Claiming"],
   [/^(?:maiden|mdn|md)\s+(?:special\s+weight|sp(?:ecial)?\s+w(?:t|eight)|spec\s+w(?:t|eight)|sw)\b|^msw\b/,"Maiden Special Weight"],
   [/^(?:maiden|mdn|md)\s+(?:claiming|clm|claim)\b|^(?:mcl|mclm|mdcl)\b/,"Maiden Claiming"],
   [/^(?:maiden|mdn|md)\s+(?:allowance|alw)\b|^malw\b/,"Maiden Allowance"]
  ];
  for(const [pattern,title] of patterns)if(pattern.test(token))return title;
  if(/^(?:maiden|mdn|md)(?:$|\s+\$|\s+\d|\s+(?:race|races)\b)/.test(token))return "unverified";
  return "";
 }
 function maidenPresentation(race){
  // Server-resolved official metadata takes precedence over a lossy source label.
  const verified=maidenClass(race?.display_race_class);
  if(verified&&verified!=="unverified")return {title:verified,grade:null,stakes:false,missingStakesName:false,maiden:true,unverifiedClass:false};
  const values=[race?.race_class,race?.race_type,race?.class_name,race?.conditions,race?.race_name]
   .map(maidenClass).filter(Boolean);
  const known=[...new Set(values.filter(v=>v!=="unverified"))];
  if(known.length===1)return {title:known[0],grade:null,stakes:false,missingStakesName:false,maiden:true,unverifiedClass:false};
  if(values.length)return {title:Number.isInteger(Number(race?.race_number))&&Number(race.race_number)>0?"Race "+race.race_number:"Race",grade:null,stakes:false,missingStakesName:false,maiden:true,unverifiedClass:true};
  return null;
 }
 function describe(race){
  const maiden=maidenPresentation(race);
  if(maiden&&race?.is_stakes!==true&&!clean(race?.stakes_name)&&!numericGrade(race?.stakes_grade??race?.grade))return maiden;
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

 // Editorial distances only: exact furlong arithmetic, never a model input.
 // Standard American notation uses furlongs for sprints and miles for routes.
 function formatDistance(value){
  const raw=clean(value);
  const match=raw.match(/^(?:(about|approx(?:imately)?\.?)\s+)?(\d+(?:\.\d+)?)\s*(?:f|fur(?:longs?)?)\.?$/i);
  if(!match)return raw; // Preserve already-written miles, yards, meters, etc.
  const f=Number(match[2]);
  if(!Number.isFinite(f)||f<=0||f>100)return raw;
  const prefix=match[1]?"About ":"";
  const yards=f*220;
  const near=(a,b)=>Math.abs(a-b)<0.12; // Recover whole-yard distances from rounded decimals.
  if(f<8){
   const half=Math.round(f*2);
   if(near(yards,half*110))return prefix+Math.floor(half/2)+(half%2?" 1/2":"")+" F";
  }else{
   const sixteenths=Math.round(f*2);
   if(near(yards,sixteenths*110)){
    const miles=Math.floor(sixteenths/16),rem=sixteenths%16;
    if(!rem)return prefix+miles+"M";
    const gcd=(a,b)=>b?gcd(b,a%b):a,g=gcd(rem,16);
    return prefix+miles+" "+(rem/g)+"/"+(16/g)+" M";
   }
  }
  const nearest=Math.round(yards);
  const approximate=near(yards,nearest)?"":"About ";
  const unit=f>=8?1760:220;
  const whole=Math.floor(nearest/unit),remainder=nearest%unit;
  return (prefix||approximate)+(whole?whole+(f>=8?"M":"F")+(remainder?" ":""):"")+(remainder?remainder+"Y":"");
 }
 // Rail & Rye display lock: conventional North American tote rungs only.
 // Preserve exact source prices and model probabilities in the data layer.
 const TOTE_SHORT=Object.freeze([[1/9,"1-9"],[1/5,"1-5"],[2/5,"2-5"],[1/2,"1-2"],[3/5,"3-5"],[4/5,"4-5"],[1,"1-1"],[6/5,"6-5"],[7/5,"7-5"],[3/2,"3-2"],[8/5,"8-5"],[9/5,"9-5"],[2,"2-1"],[5/2,"5-2"],[3,"3-1"],[7/2,"7-2"],[4,"4-1"],[9/2,"9-2"],[5,"5-1"]]);
 function formatToteNet(net){
  if(typeof net!=="number"||!Number.isFinite(net)||net<0)return "—";
  if(net>=5)return Math.round(net)+"-1";
  let best=TOTE_SHORT[0];
  for(const candidate of TOTE_SHORT.slice(1)){
   // Nearest conventional rung; exact midpoint goes to the longer price.
   if(Math.abs(candidate[0]-net)<=Math.abs(best[0]-net)+1e-12)best=candidate;
  }
  return best[1];
 }
 function formatToteOdds(value){
  const raw=String(value??"").trim();
  if(/^(?:evens?|even\s+money)$/i.test(raw))return "1-1";
  const m=raw.match(/^(\d+(?:\.\d+)?)\s*[-/:]\s*(\d+(?:\.\d+)?)$/);
  if(m&&Number(m[2])>0)return formatToteNet(Number(m[1])/Number(m[2]));
  // A whole-number tote price has an implied denominator of one.
  if(/^\d+$/.test(raw))return formatToteNet(Number(raw));
  return "—";
 }
 function formatFairOdds(entry){
  const exact=entry?.win_probability_exact,display=entry?.win_probability;
  for(const value of [exact,display]){
   if(value==null||value===""||typeof value==="boolean")continue;
   const p=Number(value);
   if(Number.isFinite(p)&&p>0&&p<=100)return formatToteNet(100/p-1);
  }
  return formatToteOdds(entry?.fair_odds);
 }
 root.RRRaceTitles=Object.freeze({describe,numericGrade,genericStakes,maidenClass,maidenPresentation,formatDistance,formatToteNet,formatToteOdds,formatFairOdds});
})(globalThis);

// Source-verified November 25 metadata recovery; read side only.
// Original 1125 TIMEFORM.zip SHA256:
// 8a1538f5ced6efb2ced53013c1fc4bc01052a209c840091b45af6245460a0b13
// Values are short verbatim wager designations from the race's Wagers line.
const verified1125={
 "charles town":[8,"Daily Double",[1,2,3,4,5,6,7]],
 "churchill downs":[10,"Daily Double",[1,2,3,4,5,6,7,8,9]],
 "delta downs":[8,"Daily Double",[1,2,3,4,5,6,7]],
 "finger lakes":[8,"DAILY DOUBLE",[1,2,3,4,5,6,7]],
 "mahoning valley":[8,"Double",[1,2,3,4,5,6,7]],
 "mountaineer":[8,"Daily Double",[1,3,7]],
 "parx racing":[9,"Daily Double",[1,2,3,4,5,6,7,8]],
 "penn national":[8,"Daily Double",[1,2,3,4,5,6,7]],
 "tampa bay downs":[9,"Daily Double",[1,2,3,4,5,6,7,8]]
};
export function hasTimeformDailyDouble(wagers){
 return typeof wagers==="string"&&
  /\b(?:daily\s+double|double\s+wagers?)\b|(?:^|[/*:])\s*double\b/i.test(wagers)&&
  !/\b(?:2nd|second)\s+half\b/i.test(wagers);
}
export function restoreVerifiedDailyDoubleMetadata(card){
 if(card?.race_date!=="2026-11-25"||!Array.isArray(card.races))return card;
 const key=String(card.track_name||"").trim().toLowerCase();
 const spec=Object.hasOwn(verified1125,key)?verified1125[key]:null;
 if(!spec)return card;
 const [count,label,starts]=spec;
 const numbers=new Set(card.races.map(r=>r.race_number));
 if(card.races.length!==count||numbers.size!==count||Array.from({length:count},(_,i)=>i+1).some(n=>!numbers.has(n)))return card;
 const eligible=new Set(starts);
 const races=card.races.map(r=>{
  if(eligible.has(r.race_number)){
   return hasTimeformDailyDouble(r.timeform_wagers)?r:{...r,timeform_wagers:"Wagers: "+label};
  }
  // A conflicting eligibility label cannot override the verified day's slate.
  return hasTimeformDailyDouble(r.timeform_wagers)?{...r,timeform_wagers:""}:r;
 });
 const byNumber=new Map(races.map(r=>[r.race_number,r]));
 const daily_double_pools=starts.map(first=>({first_race_number:first,second_race_number:first+1,source:"timeform_wagers",wager_text:byNumber.get(first).timeform_wagers}));
 return {...card,races,daily_double_pools};
}

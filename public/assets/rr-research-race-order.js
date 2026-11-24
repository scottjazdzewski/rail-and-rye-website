/* RAIL & RYE — SINGLE RACE ORDER AUTHORITY V1.
   Shared across Longshot Radar and Target List.
   Original post times and race identities remain unchanged. */
(function(root){
"use strict";
const collator=new Intl.Collator("en-US",{sensitivity:"base",numeric:true});
const clean=value=>String(value??"").replace(/\s+/g," ").trim();
function postMinutes(value){
 const raw=clean(value).replace(/\s*(?:ET|EDT|EST)$/i,"").trim();
 const twelve=raw.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
 if(twelve){
  const hour=Number(twelve[1]),minute=Number(twelve[2]);
  if(hour<1||hour>12)return Number.POSITIVE_INFINITY;
  return (hour%12+(twelve[3].toUpperCase()==="PM"?12:0))*60+minute;
 }
 const twentyFour=raw.match(/^(?:[01]?\d|2[0-3]):([0-5]\d)$/);
 if(twentyFour){
  const hour=Number(raw.split(":")[0]);
  return hour*60+Number(twentyFour[1]);
 }
 return Number.POSITIVE_INFINITY;
}
function compareNumber(left,right){
 const a=Number(left),b=Number(right);
 if(!Number.isFinite(a)||!Number.isFinite(b)||a===b)return 0;
 return a<b?-1:1;
}
function compareTime(left,right){
 const a=postMinutes(left),b=postMinutes(right);
 if(a===b)return 0;
 return a<b?-1:1;
}
function compareRace(a,b,mode){
 const track=collator.compare(clean(a?.track),clean(b?.track));
 const race=compareNumber(a?.race_number,b?.race_number);
 const time=compareTime(a?.post_time_et,b?.post_time_et);
 return mode==="track" ? track||race||time : time||track||race;
}
function sort(items,mode){
 return [...(Array.isArray(items)?items:[])].sort((a,b)=>compareRace(a,b,mode));
}
root.RRResearchRaceOrder=Object.freeze({sort,compareRace,postMinutes,version:"canonical-v1"});
})(globalThis);

// Display-only scheduled race times; no scoring or wager construction changes.
// 2026-11-24 fallback transcribed in race order from the six original
// TimeformUS racecards (archive SHA256 7395a45700a3aa4fdf9f3dff05f393f7079adf4deb30cb2413aea7a78d4345c3).
// The PDF headers do not specify a time zone; preserve printed values without
// adding an unverified zone. Current projection post_time_et takes precedence.
const datedSchedule=Object.freeze({
 "2026-11-24":Object.freeze({
  "Delta Downs":["2:15 PM","2:43 PM","3:11 PM","3:39 PM","4:07 PM","4:35 PM","5:03 PM","5:31 PM"],
  "Finger Lakes":["12:10 PM","12:38 PM","1:06 PM","1:34 PM","2:03 PM","2:32 PM","3:01 PM","3:30 PM"],
  "Mahoning Valley":["12:15 PM","12:43 PM","1:11 PM","1:39 PM","2:07 PM","2:35 PM","3:03 PM","3:31 PM"],
  "Mountaineer":["7:00 PM","7:25 PM","7:50 PM","8:15 PM","8:40 PM","9:05 PM","9:30 PM","9:55 PM"],
  "Parx Racing":["12:05 PM","12:32 PM","12:59 PM","1:26 PM","1:53 PM","2:20 PM","2:47 PM","3:14 PM","3:41 PM"],
  "Zia Park":["2:05 PM","2:32 PM","2:59 PM","3:26 PM","3:53 PM","4:20 PM","4:47 PM","5:14 PM","5:41 PM","6:08 PM"]
 })
});
function parseET(raw){
 if(typeof raw!=="string")return null;
 const s=raw.trim();
 const m=/^(0?[1-9]|1[0-2]):([0-5][0-9])\s*([AP]M)(?:\s*(?:ET|EST|EDT))?$/i.exec(s);
 if(m)return Number(m[1])+":"+m[2]+" "+m[3].toUpperCase()+" ET";
 const military=/^([01]?[0-9]|2[0-3]):([0-5][0-9])(?:\s*ET)?$/i.exec(s);
 if(military){const n=Number(military[1]);return (n%12||12)+":"+military[2]+" "+(n<12?"AM":"PM")+" ET";}
 return null;
}
export function pickPostTimes(card,source){
 if(!source||source.race_date!==card.date||source.track_name!==card.track)return {};
 const times={};
 const fallback=source.projection_status==="prescratch"?datedSchedule[card.date]?.[card.track]:null;
 for(const r of source.races||[]){
  if(!Number.isSafeInteger(r.race_number)||r.race_number<1)continue;
  const live=parseET(r.post_time_et);
  const scheduled=fallback?.[r.race_number-1];
  if(live)times[String(r.race_number)]=live;
  else if(scheduled)times[String(r.race_number)]=scheduled;
 }
 return times;
}

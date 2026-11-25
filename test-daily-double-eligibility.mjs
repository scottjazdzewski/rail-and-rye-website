import assert from "node:assert/strict";
import {restoreVerifiedDailyDoubleMetadata,hasTimeformDailyDouble} from "./src/daily-double-eligibility.js";
import {readFileSync} from "node:fs";
let total=0;
for(const [track,count,starts] of [["Charles Town",8,[1,2,3,4,5,6,7]],["Churchill Downs",10,[1,2,3,4,5,6,7,8,9]],["Delta Downs",8,[1,2,3,4,5,6,7]],["Finger Lakes",8,[1,2,3,4,5,6,7]],["Mahoning Valley",8,[1,2,3,4,5,6,7]],["Mountaineer",8,[1,3,7]],["Parx Racing",9,[1,2,3,4,5,6,7,8]],["Penn National",8,[1,2,3,4,5,6,7]],["Tampa Bay Downs",9,[1,2,3,4,5,6,7,8]]]){
 const raw={race_date:"2026-11-25",track_name:track,races:Array.from({length:count},(_,i)=>({race_number:i+1,entries:[]}))};
 const repaired=restoreVerifiedDailyDoubleMetadata(raw);
 assert.deepEqual(repaired.daily_double_pools.map(p=>p.first_race_number),starts,track);
 for(const p of repaired.daily_double_pools)assert.ok(hasTimeformDailyDouble(p.wager_text));
 assert.equal(raw.daily_double_pools,undefined,"Scored source must be unmodified");
 assert.equal(restoreVerifiedDailyDoubleMetadata({...raw,race_date:"2026-11-26"}).daily_double_pools,undefined);
 assert.equal(restoreVerifiedDailyDoubleMetadata({...raw,races:raw.races.slice(1)}).daily_double_pools,undefined);
 total+=starts.length;
}
assert.equal(total,63);
assert.ok(hasTimeformDailyDouble("Wagers: Exacta / Double 50 Cent Pick 3"));
assert.equal(hasTimeformDailyDouble("Wagers: 2nd Half Daily Double"),false);
assert.equal(hasTimeformDailyDouble("Wagers: Exacta / Trifecta"),false);
const api=readFileSync("src/product-tab-content.js","utf8");
assert.match(api,/daily_double_pools:\(card\.daily_double_pools/);
assert.match(api,/timeform_wagers:text\(race\.timeform_wagers/);
console.log("PASS: 63 source-verified Daily Double pools; date/track/full-card scope and customer metadata");

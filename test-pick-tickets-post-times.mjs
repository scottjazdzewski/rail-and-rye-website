import assert from "node:assert/strict";
import {pickPostTimes} from "./src/pick-tickets-post-times.js";
import {PICK_TRACK_COUNTS_1124,PICK_MENU_1124} from "./src/pick-tickets-menu-1124.js";
let total=0;
for(const [track,n] of Object.entries(PICK_TRACK_COUNTS_1124)){
 const card={date:"2026-11-24",track};
 const source={race_date:card.date,track_name:track,projection_status:"prescratch",races:Array.from({length:n},(_,i)=>({race_number:i+1}))};
 const times=pickPostTimes(card,source);
 assert.equal(Object.keys(times).length,n);total+=n;
 assert.ok(PICK_MENU_1124.filter(x=>x.track===track).every(x=>times[x.start_race]));
 source.races[0].post_time_et="1:23 PM";
 assert.equal(pickPostTimes(card,source)["1"],"1:23 PM ET");
 source.races[0].post_time_et="13:24";
 assert.equal(pickPostTimes(card,source)["1"],"1:24 PM ET");
 source.projection_status="scratch_final";
 assert.deepEqual(pickPostTimes(card,source),{"1":"1:24 PM ET"});
 assert.deepEqual(pickPostTimes({...card,date:"2026-11-25"},source),{});
}
assert.equal(total,51);
console.log("PASS 51 scheduled post times, all 50 starting races, current ET priority, no stale scratch-final or date fallback.");

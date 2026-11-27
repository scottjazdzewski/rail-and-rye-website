import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {hasTimeformDailyDouble} from "../src/daily-double-eligibility.js";
const s=fs.readFileSync("public/assets/rr-exotic-bet-builder.js","utf8");
const i=s.indexOf("function hasTimeformDailyDoubleEvidence(pool){"),j=s.indexOf("function dailyDoublePairs(",i);
assert(i>=0&&j>i);
const client=vm.runInNewContext(s.slice(i,j)+";hasTimeformDailyDoubleEvidence");
for(const [w,f,t,expected] of [
 ["Wagers: $1 Exacta / $.10 Superfecta $1 Double (Races 2-3) / $.50 Pick 3",2,3,true],
 ["Wagers: Double ($1) 2 & 3, Pick 3",2,3,true],
 ["Wagers: Rolling Double / Exacta",1,2,true],
 ["Wagers: Late Daily Double",7,8,true],
 ["Wagers: Daily Double(Races 3-4)",3,4,true],
 ["Wagers: $1 Double (Races 2-3)",3,4,false],
 ["Wagers: Double ($1) 2 & 4",2,3,false],
 ["Wagers: 2nd Half Early Daily Double",2,3,false],
 ["Wagers: Exacta / Pick 3",2,3,false]
]){
 assert.equal(hasTimeformDailyDouble(w,f,t),expected,w);
 assert.equal(client({source:"timeform_wagers",wager_text:w,first_race_number:f,second_race_number:t}),expected,w);
}
console.log("RR_EXPLICIT_DOUBLE_READER_TEST_PASS");

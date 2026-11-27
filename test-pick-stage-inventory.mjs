import assert from "node:assert/strict";
import {verifyStagedRaceInventory} from "./src/pick-tickets-staging.js";
const sha="a".repeat(64),field=[["1",.6],["2",.4]],vectors=[["1","Synthetic A",.6,.6],["2","Synthetic B",.4,.4]];
const row={races:4,runners:8,canonical_source:{kind:"APPROVED_PROJECTION_SNAPSHOT_V1"},receipt:{source_pdf_sha256:sha},runner_pwin:{"1":vectors,"2":vectors,"3":vectors,"4":vectors},non_participating_races:[{race_number:1,reason:"NO_SUPPORTED_PICK_N_POOL",source_pdf_sha256:sha,source_page:1,wager_text:"Wagers: Daily Double / Exacta / Trifecta"}]};
const races=new Map([[2,field],[3,field],[4,field]]);
const card={post_times_by_race:{1:"12:00 PM",2:"12:30 PM",3:"1:00 PM",4:"1:30 PM"}};
assert.equal(verifyStagedRaceInventory(row,races,0,card),true);
for(const mutate of [
 x=>delete x.non_participating_races,
 x=>x.non_participating_races[0].race_number=2,
 x=>x.non_participating_races[0].wager_text="Pick 4",
 x=>x.non_participating_races[0].source_pdf_sha256="b".repeat(64),
 x=>x.non_participating_races.push({...x.non_participating_races[0]}),
 x=>x.runner_pwin["1"]=[["1","Synthetic A",.6,.6],["1","Synthetic B",.4,.4]],
 x=>delete x.canonical_source,
 x=>x.runner_pwin["5"]=vectors,
 x=>x.runner_pwin["1"]=[["1","Synthetic A",.6,.5],["2","Synthetic B",.4,.4]]
]){const x=structuredClone(row);mutate(x);assert.throws(()=>verifyStagedRaceInventory(x,races,0,card));}
const no1={races:3,runners:6,canonical_source:{},runner_pwin:{"2":vectors,"3":vectors,"4":vectors}};
assert.equal(verifyStagedRaceInventory(no1,races,0,card),true);
assert.throws(()=>verifyStagedRaceInventory(row,races,0,{post_times_by_race:{2:"12:30 PM",3:"1:00 PM",4:"1:30 PM"}}));
console.log("PASS: complete nonparticipating race audit, nine negative cases, non-R1 start and post-time check");

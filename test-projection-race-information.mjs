import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {enrichRaceInformation,validPurse,requireProductionPurses,requireProductionStakesNames,genericStakesTitle} from "./src/projection-race-information.js";
const sizes=[7,6,7,8,10,9,8,10];
const card={race_date:"2026-11-24",track_name:"Finger Lakes",projection_status:"prescratch",races:sizes.map((n,i)=>({race_number:i+1,purse:"",entries:Array.from({length:n},()=>({pwin:0.1})),conditions:"Claiming $5K"}))};
const enriched=enrichRaceInformation(card);
assert.equal(enriched.races[0].purse,"$13,700");
assert.equal(enriched.races[4].purse,"$32,600");
assert.equal(card.races[0].purse,"");
assert.equal(enriched.races[0].entries,card.races[0].entries);
assert.equal(enriched.races[0].conditions,"Claiming $5K");
const next={...card,race_date:"2026-11-25"};assert.equal(enrichRaceInformation(next),next);
assert.throws(()=>requireProductionPurses(card));
requireProductionPurses(enriched);
assert.equal(validPurse("$5K"),false);
assert.equal(validPurse("$0"),false);
assert.equal(validPurse("$13,700"),true);

// Nov 24 Zia Park: Equibase verified R4-R10 are named stakes, never just STAKES.
// Read-side enrichment must NOT rewrite the frozen TRI/F4/scorer source object.
const officialTitles={
 4:"Zia Park Juvenile Stakes",5:"Zia Park Sprint Stakes",
 6:"Zia Park Distaff Stakes",7:"Zia Park Princess Stakes",
 8:"Zia Park Championship Stakes",9:"Zia Park Oaks",10:"Zia Park Derby"
};
const purses=[67500,67500,67500,100000,100000,100000,100000,100000,300000,350000];
const starters=[10,9,11,8,8,10,10,10,7,10];
const zia={race_date:"2026-11-24",track_name:"Zia Park",projection_status:"prescratch",races:
 purses.map((amount,i)=>({race_number:i+1,purse:"$"+amount.toLocaleString("en-US"),
  conditions:i>=3?"STAKES":"Maiden Special Weight",race_name:"",
  entries:Array.from({length:starters[i]},(_,j)=>({program_number:String(j+1)}))}))};
const fixed=enrichRaceInformation(zia);
assert.equal(zia.races[9].stakes_name,undefined,"Never modify signed scored source in place.");
assert.equal(fixed.races[9].stakes_name,"Zia Park Derby");
assert.equal(fixed.races[8].stakes_name,"Zia Park Oaks");
assert.equal(fixed.races[9].stakes_grade,undefined,"Do not invent a graded-stakes trophy.");
for(const [number,title] of Object.entries(officialTitles)){
 assert.equal(fixed.races[Number(number)-1].stakes_name,title);
 assert.equal(fixed.races[Number(number)-1].is_stakes,true);
}
requireProductionStakesNames(fixed);
assert.throws(()=>requireProductionStakesNames(zia),/full official stakes race name required/);
assert.throws(()=>requireProductionStakesNames({races:[{race_number:9,
 conditions:"Claiming",is_stakes:true}]}),/full official stakes race name required/,
 "A stakes-flagged generic claiming class is not an official event name.");
assert.throws(()=>requireProductionStakesNames({races:[{race_number:10,
 conditions:"STAKES",race_name:"Race 10"}]}),/full official stakes race name required/,
 "Race-number placeholders must not bypass the naming gate.");
assert.equal(genericStakesTitle("STAKES"),true);
assert.equal(genericStakesTitle("Overnight Stakes"),true);
assert.equal(genericStakesTitle("Zia Park Derby"),false);
const scratched={...zia,projection_status:"scratch_final",races:zia.races.map(r=>
 ({...r,entries:r.race_number===10?r.entries.slice(0,8):r.entries}))};
assert.equal(enrichRaceInformation(scratched).races[9].stakes_name,"Zia Park Derby",
 "Officially named race must survive a scratch change.");
const differentCard={...zia,track_name:"Another Park"};
assert.equal(enrichRaceInformation(differentCard),differentCard,
 "Do not invent an event for an unmatched date/track.");
const publisher=readFileSync("src/projections.js","utf8");
assert.equal((publisher.match(/requireProductionStakesNames\(enrichRaceInformation\(card\)\)/g)||[]).length,2,
 "Both single and batch production upload paths must reject generic stakes names.");
for(const path of ["src/longshot-radar.js","src/target-list.js"]){
 const reader=readFileSync(path,"utf8");
 assert.match(reader,/enrichRaceInformation\((?:card|source)\)/,
  "Every research reader must use the same exact source-backed stakes names.");
}
const pick=readFileSync("src/pick-tickets.js","utf8");
assert.match(pick,/stakes_by_race/,"Pick ticket publication carries official named stakes metadata.");
console.log("race information checks passed");

// Every maiden in the official November 24 entry indexes, not just the reported race.
for(const [track,n,nums,label] of [["Delta Downs",8,[2,3],"Maiden Claiming"],["Finger Lakes",8,[4,5],"Maiden Special Weight"],["Mahoning Valley",8,[1,5],"Maiden Special Weight"],["Mountaineer",8,[3,5],"Maiden Special Weight"],["Parx Racing",9,[9],"Maiden Claiming"],["Zia Park",10,[1,2,3],"Maiden Special Weight"]]){
 const original={race_date:"2026-11-24",track_name:track,races:Array.from({length:n},(_,i)=>({race_number:i+1,conditions:nums.includes(i+1)?"Maiden":"Claiming",entries:[],purse:""}))};
 const repaired=enrichRaceInformation(original);
 for(const num of nums)assert.equal(repaired.races[num-1].display_race_class,label,track+" Race "+num);
 assert.ok(original.races.every(r=>!r.display_race_class),"Never mutate scored source");
}

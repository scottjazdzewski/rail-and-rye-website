import assert from "node:assert/strict";
import fs from "node:fs";
import {readProductTabEdition} from "../src/product-tab-content.js";
const root=process.argv[2],date="2026-11-25";
const cards=JSON.parse(fs.readFileSync(root+"/cards.json","utf8"));
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-");
const objects=new Map(cards.map(c=>["projections/dashboard/"+date+"/"+slug(c.track_name)+".json",c]));
const products=cards.map((c,i)=>({id:"qa-"+i,category:"Race Cards",race_date:date,track:c.track_name,title:c.track_name+" Race Card"}));
const env={CARDS_BUCKET:{list:async()=>({objects:[...objects.keys()].map(key=>({key}))}),get:async key=>objects.has(key)?{text:async()=>JSON.stringify(objects.get(key)),customMetadata:{}}:null}};
const edition=await readProductTabEdition(env,"Race Cards",date,products);
assert.equal(edition?.cards?.length,9);
const expected={"Charles Town":[1,2,3,4,5,6,7],"Churchill Downs":[1,2,3,4,5,6,7,8,9],"Delta Downs":[1,2,3,4,5,6,7],"Finger Lakes":[1,2,3,4,5,6,7],"Mahoning Valley":[1,2,3,4,5,6,7],"Mountaineer":[1,3,7],"Parx Racing":[1,2,3,4,5,6,7,8],"Penn National":[1,2,3,4,5,6,7],"Tampa Bay Downs":[1,2,3,4,5,6,7,8]};
let count=0;
for(const item of edition.cards){
 const card=item.card;
 assert.deepEqual(card.daily_double_pools.map(p=>p.first_race_number),expected[card.track_name]);
 for(const p of card.daily_double_pools){
  const first=card.races.find(r=>r.race_number===p.first_race_number),second=card.races.find(r=>r.race_number===p.second_race_number);
  assert.equal(p.source,"timeform_wagers");assert.equal(first.timeform_wagers,p.wager_text);assert.equal(p.second_race_number,p.first_race_number+1);
  for(const race of [first,second]){
   assert.ok(race.entries.length>=2);
   assert.ok(race.entries.every(e=>Number.isFinite(e.win_probability_exact)&&e.win_probability_exact>0));
   assert.ok(Math.abs(race.entries.reduce((a,e)=>a+e.win_probability_exact,0)-100)<1e-6);
   assert.ok(race.entries.every(e=>!race.scratches.some(s=>s.program_number===e.program_number)));
  }
  count++;
 }
 console.log("DD_CUSTOMER_METADATA_PASS "+card.track_name+" starts="+expected[card.track_name].join(","));
}
assert.equal(count,63);
const only=await readProductTabEdition(env,"Race Cards",date,[products.find(p=>p.track==="Mountaineer")]);
assert.equal(only.cards.length,1);assert.equal(only.cards[0].card.track_name,"Mountaineer");
fs.writeFileSync(root+"/edition.json",JSON.stringify(edition),{mode:0o600});
console.log("DD_CUSTOMER_SERIALIZER_PASS tracks=9 pools=63");

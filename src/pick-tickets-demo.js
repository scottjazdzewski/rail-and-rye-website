/* Rail & Rye admin-only display fixtures.
 * Purely fictional runner selections, NOT results from TRI, Timeform or a Pick Tickets model.
 * Never persisted, exported, or served outside the signed Cloudflare Access admin route.
 */
const demonstrationDate="2026-11-23";
const demoTracks=["Finger Lakes","Mahoning Valley","Mountaineer","Parx Racing","Zia Park"];
const defaultSets=[
 [["1","5"],["2","3"],["4","7"]],
 [["3","6"],["1","4"],["2","8"]],
 [["4","9"],["2","5"],["1","7"]]
];
function makeLegs(start,choices){return choices.map((programs,i)=>({race_number:start+i,programs:[...programs]}));}
function makeTicket(role,title,start,choices,unitCents){
 const combinations=choices.reduce((n,leg)=>n*leg.length,1);
 return {role,title,unit_cents:unitCents,combinations,total_cents:unitCents*combinations,
  legs:makeLegs(start,choices),
  notes:"DEMONSTRATION ONLY. Runner numbers and costs are illustrations, not approved plays."};
}
function makeSequence(kind,start,choices,status,variant){
 const raceCount=choices.length;
 const types={3:"Pick 3",4:"Pick 4",5:"Pick 5",6:"Pick 6"};
 const unitCents=kind===6?20:50;
 const lean=makeTicket(status==="PASS"?"BEST_POSSIBLE":"LEAN",status==="PASS"?"Mock best-possible ticket":"Mock standard ticket",start,choices,unitCents);
 const tickets=[lean];
 if(status!=="PASS"){
  const expanded=choices.map((leg,i)=>i===variant%choices.length?
   [...leg,["10","11","12"][variant%3]].filter((v,index,arr)=>arr.indexOf(v)===index):[...leg]);
  tickets.push(makeTicket("FULL_COVERAGE","Mock coverage alternative",start,expanded,unitCents));
 }
 return {name:types[kind],start_race:start,end_race:start+raceCount-1,play_status:status,
  hit_rate_display:"",recommendation:"Mock selections for layout review only. No TRI projected hit rate or wagering recommendation is available.",tickets,
  race_fields:Array.from({length:raceCount},(_,i)=>({race_number:start+i,programs:Array.from({length:12},(_,n)=>String(n+1))}))};
}
export function getPickTicketsPrivateDemo(){
 const cards=demoTracks.map((track,i)=>{
  const sequences=[
   makeSequence(3,1,defaultSets[(i+0)%3],"PLAY",i),
   makeSequence(3,4,defaultSets[(i+1)%3],"CONDITIONAL",i+1),
   makeSequence(3,7,defaultSets[(i+2)%3],"PASS",i+2),
   makeSequence(4,2,[["1","3"],["2","5"],["4","6"],["1","8"]],"CONDITIONAL",i+3),
   makeSequence(4,6,[["3","5"],["1","7"],["2"],["4","8"]],"PLAY",i+4),
   makeSequence(5,1,[["1"],["2","4"],["3","5"],["1","7"],["2","8"]],"CONDITIONAL",i+5)
  ];
  if(i===1)sequences.push(makeSequence(6,5,[["2","7"],["1"],["4","8"],["3"],["5","9"],["6"]],"PASS",i+6));
  return {card:{schema_version:1,product_type:"pick_tickets",date:demonstrationDate,track,revision:0,status:"demo",
   is_demo:true,source_receipt:{reference:"MOCK-DISPLAY-NOT-CERTIFIED",sha256:"0".repeat(64)},sequences},updated_at:null};
 });
 return {cards,demo:true};
}

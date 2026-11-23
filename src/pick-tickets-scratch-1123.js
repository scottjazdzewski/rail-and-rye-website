/* Nov 23, 2026: real official race-day changes from five owner-provided
 * Equibase screenshots. Public-fact scratch program numbers only; no PWIN,
 * paid results, model coefficients, internal receipts, or proprietary scores.
 * This ledger is a dated snapshot, not an ongoing live scratches service.
 */
export const SCRATCH_DATE_1123="2026-11-23";
const frozen={
 "Finger Lakes":{
  code:"FL",snapshot_et:"11:59 AM ET",
  source_sha256:"666fe363c095bf6438093bd387c501488a3d5bed9d3e37753a6fba360bebd5c0",
  scratches:{"1":["2"],"3":["2"],"5":["9"],"7":["1"],"8":["7"]},
  score_input_changes:[{race:7,program:"8",type:"jockey"}]
 },
 "Mahoning Valley":{
  code:"MVR",snapshot_et:"11:30 AM ET",
  source_sha256:"a006de8b2f6736a12cacc5a1fbecda12c8c4e740d2f011c13a818ac63c3b5bbf",
  scratches:{"1":["5"],"2":["3"],"3":["6","7","9"],"10":["5","9"]},
  score_input_changes:[
   {race:4,program:"8",type:"weight"},
   {race:5,program:"3",type:"jockey"},
   {race:5,program:"5",type:"weight"},
   {race:6,program:"8",type:"weight"},
   {race:7,program:"13",type:"weight"},
   {race:8,program:"1",type:"jockey"},
   {race:9,program:"8",type:"jockey"},
   {race:10,program:"10",type:"jockey"}
  ]
 },
 "Mountaineer":{
  code:"MNR",snapshot_et:"11:50 AM ET",
  source_sha256:"36e328d19fe10fdca3719cf1d1120bb0d48ce0558920e60a76f0cc7989bb82b4",
  scratches:{"1":["8"],"2":["7"],"4":["1","4","5","7"],"5":["1","3","5","6","8","12"],"7":["1","2","9"],"8":["5","7","8","11","12","13"]},
  score_input_changes:[]
 },
 "Parx Racing":{
  code:"PRX",snapshot_et:"11:49 AM ET",
  source_sha256:"7fee502868a7713e55c5236aa1e4c4cbbb04ce93a4dbaf678889f2b9aae3a196",
  scratches:{"1":["6"],"3":["6"],"4":["4"],"5":["1","3"],"6":["2"],"7":["6"],"9":["2","5","9","10"]},
  score_input_changes:[
   {race:1,program:"2",type:"jockey"},
   {race:1,program:"2",type:"apprentice"},
   {race:1,program:"2",type:"weight"},
   {race:2,program:"2",type:"jockey"},
   {race:2,program:"2",type:"apprentice"},
   {race:2,program:"2",type:"weight"},
   {race:3,program:"5",type:"jockey"},
   {race:4,program:"2",type:"jockey"},
   {race:5,program:"6",type:"jockey"},
   {race:9,program:"6",type:"jockey"},
   {race:9,program:"6",type:"apprentice"},
   {race:9,program:"6",type:"weight"}
  ]
 },
 "Zia Park":{
  code:"ZIA",snapshot_et:"12:16 PM ET",
  source_sha256:"e34bc8642e1573fdeb1703555d64c2cf6bc18c8b15ca6d96a2507ede58afcde6",
  scratches:{"1":["4"],"2":["3"],"3":["2"],"4":["5"],"6":["4"],"9":["2"]},
  score_input_changes:[]
 }
};
const countScratches=track=>Object.values(track.scratches).reduce((n,arr)=>n+arr.length,0);
const frozenPublic=Object.freeze(frozen);
export function getNov23ScratchLedger(){
 return {
  date:SCRATCH_DATE_1123,scope:"OWNER_PROVIDED_RACE_DAY_CHANGES_SNAPSHOT",
  model_status:"SCRATCH_ONLY_TRI_V4_1_ALL_FIVE_PASS__F4_AND_CHANGED_RIDERS_NOT_VERIFIED",
  input_changes_verified_for_scoring:false,
  tracks:Object.entries(frozenPublic).map(([name,v])=>({
   name,code:v.code,snapshot_et:v.snapshot_et,
   source_sha256:v.source_sha256,
   scratches:v.scratches,
   score_input_changes:v.score_input_changes,
   scratch_count:countScratches(v),
   affected_races:[...new Set([...Object.keys(v.scratches).map(Number),...v.score_input_changes.map(c=>c.race)])].sort((a,b)=>a-b)
  }))
 };
}
export function sourceIsScratchCurrent(card){
 if(card?.date!==SCRATCH_DATE_1123)return true;
 if(card.status!=="scratch_updated"||!card.scratch_verified_at||card.revision<2)return false;
 const track=frozenPublic[card.track];
 if(!track)return true; // Other November 23 tracks are outside these five screenshots.
 // A private scratch-updated edition must cover every official sequence and
 // must not contain a scratched program in ANY shown ticket or eligible field.
 for(const sequence of card.sequences||[]){
  for(const leg of sequence.tickets?.flatMap(t=>t.legs)||[]){
   if((track.scratches[String(leg.race_number)]||[]).some(n=>leg.programs.includes(n)))return false;
  }
  for(const field of sequence.race_fields||[]){
   if((track.scratches[String(field.race_number)]||[]).some(n=>field.programs.includes(n)))return false;
  }
 }
 return true;
}
export function officialScratchSequenceCount(menu){
 const data=getNov23ScratchLedger();
 return data.tracks.map(track=>{
  const impacted=menu.filter(s=>s.track===track.name&&
   track.affected_races.some(n=>s.start_race<=n&&n<=s.end_race));
  return {track:track.name,impacted:impacted.length,scratches:track.scratch_count};
 });
}

/** Keep a usable suggested ticket on screen while waiting for the current-field
 * model release. Never carry scratched runners into the recommendation and never
 * label prescratch probabilities as updated. This is intentionally temporary:
 * a source-verified private scratch_updated R2 record replaces it automatically.
 */
export function restoreInterimSelection(wrapped){
 const card=wrapped?.card;
 if(!card||card.date!==SCRATCH_DATE_1123||!frozenPublic[card.track])return wrapped;
 const official=frozenPublic[card.track],seqs=[];
 for(const sequence of card.sequences||[]){
  const fields=(sequence.race_fields||[]).map(f=>({
   race_number:f.race_number,
   programs:f.programs.filter(p=>!(official.scratches[String(f.race_number)]||[]).includes(p))
  }));
  const byRace=new Map(fields.map(f=>[f.race_number,f.programs]));
  const tiers=[];
  for(const t of sequence.tickets||[]){
   const legs=t.legs.map(leg=>{
    const withdrawn=new Set(official.scratches[String(leg.race_number)]||[]);
    const valid=byRace.get(leg.race_number)||[];
    const kept=leg.programs.filter(p=>!withdrawn.has(p)&&valid.includes(p));
    // A scratched single must be replaced by an ACTUAL starter; only original
    // source ordering can guide this interim choice. No invented win estimates.
    if(!kept.length&&valid.length){
     const priors=sequence.review_probabilities?.[String(leg.race_number)]||{};
     const ranked=[...valid].sort((a,b)=>(priors[b]||0)-(priors[a]||0));
     kept.push(ranked[0]);
    }
    return {race_number:leg.race_number,programs:kept};
   });
   if(legs.some(x=>!x.programs.length))continue;
   const combinations=legs.reduce((n,x)=>n*x.programs.length,1);
   tiers.push({...t,legs,combinations,total_cents:combinations*t.unit_cents,
    hit_rate_display:"",notes:"Interim selections with withdrawn runners removed. Recalculated TRI/F4 projections pending."});
  }
  if(!tiers.length)continue;
  seqs.push({...sequence,race_fields:fields,tickets:tiers,hit_rate_display:"",
   review_probabilities:null,play_status:"CONDITIONAL",
   recommendation:"Interim runner selections; updated model probabilities and finishing order pending."});
 }
 return {...wrapped,review_only:true,card:{...card,sequences:seqs,
  source_type:"INTERIM_SCRATCH_FILTERED_FROM_PRESCRATCH_UNTIL_SOURCE_CERTIFIED_RERUN",
  review_only:true}};
}

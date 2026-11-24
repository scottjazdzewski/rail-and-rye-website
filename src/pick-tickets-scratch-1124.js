// Official owner-provided 11/24 snapshots, first batch only.
// This is a Pick-only verified input handoff, not a replacement of Projections.
export const PICK_SCRATCH_1124_KEY="pick-tickets/interim/2026-11-24/revision-0002.json";
export const PICK_SCRATCH_1124_SHA="74ea0b745220994c41b6f81e705ca72c73441e2082c4b82d59eb83ead0f8a4ac";
export const PICK_SCRATCH_1124_TRACKS=Object.freeze({
 "Parx Racing":{code:"PRX",races:9,before:74,after:71,scratches:{3:["2"],4:["6"],6:["10"]},snapshot_sha:"6a50eb80522f1a1dd4844522ff4be38a3cbd2628d3a08635d947da70f97f629b",official_sha:"83b40052bb8e4048a585f077cf7aeaf4f2c7f398e098573c39f19de71ef581ec"},
 "Mahoning Valley":{code:"MVR",races:8,before:67,after:61,scratches:{1:["1"],3:["1"],6:["4","8"],7:["6"],8:["6"]},snapshot_sha:"87c67fee9d8727abfe1b629997043cdc5fd1591480c1f8c521417026c5a7ca53",official_sha:"f0d784fb2ee41d632caf187751b45a964cf3184b0be16440820b77cc259742df"}
});
const sha=x=>typeof x==="string"&&/^[0-9a-f]{64}$/.test(x);
const programs=r=>(r.scratches||[]).map(p=>String(typeof p==="object"?p.program_number:p).trim().toUpperCase()).sort();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function verifyNov24Scratch(card){
 const cfg=PICK_SCRATCH_1124_TRACKS[card?.track_name];
 if(!cfg||card.race_date!=="2026-11-24"||card.projection_status!=="scratch_final"||
    card.factor_basis!=="verified_scratch_final"||card.scratch_source_sha256!==PICK_SCRATCH_1124_SHA||
    !Array.isArray(card.races)||card.races.length!==cfg.races)return {ok:false};
 const receipts=card.model_receipts||{};
 if(!["tri_sha256","f4_sha256","prescratch_parent_sha256","official_changes_sha256"].every(k=>sha(receipts[k]))||
    receipts.official_changes_sha256!==cfg.official_sha)return {ok:false};
 let active=0,scratched=0;
 for(let i=1;i<=cfg.races;i++){
  const r=card.races.find(x=>x.race_number===i),expected=[...(cfg.scratches[i]||[])].sort();
  if(!r||!Array.isArray(r.entries)||!same(programs(r),expected)||r.scratch_count!==expected.length||
     r.entries.some(x=>expected.includes(String(x.program_number).toUpperCase())))return {ok:false};
  active+=r.entries.length;scratched+=expected.length;
 }
 if(active!==cfg.after||active+scratched!==cfg.before)return {ok:false};
 return {ok:true,source_snapshot_sha256:cfg.snapshot_sha,scratched_count:scratched,additional_scratch_count:0,active_runner_count:active};
}
export async function readNov24ScratchHandoff(env){
 const file=await env.CARDS_BUCKET.get(PICK_SCRATCH_1124_KEY);
 if(!file)return [];
 const raw=await file.text(),digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
 const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
 if(hash!==PICK_SCRATCH_1124_SHA)throw Error("Scratch handoff hash mismatch");
 const src=JSON.parse(raw);
 if(src.schema_version!==1||src.product_type!=="pick_tickets_scratch_source_1124"||
    src.race_date!=="2026-11-24"||src.revision!==2||src.review_only!==true||
    src.customer_publish_approved!==false||src.tracks.length!==2)throw Error("Wrong scratch source");
 return src.tracks.map(t=>{
  const card={race_date:"2026-11-24",track_name:t.track,projection_status:"scratch_final",
   factor_basis:"verified_scratch_final",model_name:"TRI V4.1 / F4 V2",scratch_source_sha256:hash,
   model_receipts:{tri_sha256:t.tri_sha256,f4_sha256:t.f4_sha256,
    prescratch_parent_sha256:t.replayed_parent_sha256,official_changes_sha256:t.official_changes_sha256},
   official_snapshot_utc:t.official_snapshot_utc,non_scratch_changes:t.non_scratch_changes,
   races:t.races.map(r=>({race_number:r.race_number,post_time_et:r.post_time_et,scratch_count:r.scratches.length,
    scratches:r.scratches,entries:r.entries.map(e=>({program_number:e[0],win_probability_exact:e[1]*100,f4_probabilities:{exact_p1:e[2]}}))}))};
  if(!verifyNov24Scratch(card).ok)throw Error("Scratch roster not verified");
  return {card,uploaded_at:file.customMetadata?.uploaded_at||null};
 });
}
// Direct scratch fields that disagree with this snapshot may be newer;
// do not fall back to the independent snapshot for those tracks.
export function agreesWithNov24Scratch(direct,handed){
 if(direct.projection_status!=="scratch_final")return direct.projection_status==="prescratch";
 if(!Array.isArray(direct.races)||direct.races.length!==handed.races.length)return false;
 return handed.races.every(r=>{
  const d=direct.races.find(x=>x.race_number===r.race_number);
  if(!d||!Array.isArray(d.entries))return false;
  return same(programs(d),programs(r))&&same(d.entries.map(e=>String(e.program_number)).sort(),r.entries.map(e=>String(e.program_number)).sort());
 });
}

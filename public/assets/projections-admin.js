(()=>{
"use strict";
const q=selector=>document.querySelector(selector),status=q("#status"),fileInput=q("#json-file"),upload=q("#upload"),preview=q("#preview"),matches=q("#card-matches");
let cards=[],saved=false;
function show(message,type=""){status.textContent=message;status.className=type;}
function validateCard(data,index){
 if(!data||data.schema_version!==1||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(data.race_date||""))||!String(data.track_name||"").trim()||!Array.isArray(data.races)||!data.races.length)throw Error("Track card "+(index+1)+" does not match dashboard JSON schema version 1.");
 let entries=0;
 for(const race of data.races){if(!Array.isArray(race.entries)||!race.entries.length)throw Error("Every race in "+data.track_name+" needs horse entries.");entries+=race.entries.length;}
 return {card:data,entries};
}
async function copyExportPrompt(){
 const example={schema_version:1,race_date:"2026-11-22",track_name:"Laurel Park",races:[{race_number:1,post_time_et:"12:10 PM",surface:"Dirt",distance:"6 furlongs",conditions:"Maiden Special Weight",pace:"Moderate",scratch_count:1,summary:"",entries:[{program_number:"1",horse_name:"Example Runner",rank:1,win_probability:27.5,morning_line:"5-2",fair_odds:"9/5",metrics:[{label:"SPEED",value:"gray"},{label:"FORM",value:"green"},{label:"CLASS",value:"gray"},{label:"PACE FIT",value:"gray"},{label:"SURFACE/DISTANCE",value:"gray"}],notes:""}]}]};
 const prompt="Create one downloadable .json file containing a top-level array with one card object for each finalized track in this conversation. Use the exact schema below for each object. Copy final card values exactly; do not recalculate, round, infer, add, or remove projections. Include every race and every active horse in the same order as the final PDF. Use win_probability in percentage points (27.5 means 27.5%). For each horse, put the printed SPEED, FORM, CLASS, PACE FIT, and SURFACE/DISTANCE marker as the exact value gray, green, or red when shown; keep fair_odds and morning_line separate. Include race pace, scratch_count, conditions, surface, distance, and post_time_et when shown. Never fill missing values with guesses. Return valid JSON only, with no markdown fences.\n\n"+JSON.stringify([example],null,2);
 try{await navigator.clipboard.writeText(prompt);show("GPT export instructions copied. Paste them into the card-production chat after the cards are finalized.","success");}
 catch{show("Clipboard access is unavailable in this browser. The export format is shown below.","error");}
}
q("#copy-prompt").addEventListener("click",copyExportPrompt);
function renderCards(){
 matches.replaceChildren();
 for(const {card,entries} of cards){
  const row=document.createElement("article");row.className="projection-match";
  const title=document.createElement("h2"),meta=document.createElement("p");
  title.textContent=card.track_name;meta.textContent=card.race_date+" · "+card.races.length+" races · "+entries+" runners";
  row.append(title,meta);matches.append(row);
 }
 upload.disabled=!cards.length||saved;
 upload.textContent=saved?"Dashboards loaded":cards.length>1?"Load "+cards.length+" track dashboards":"Load track dashboard";
}
fileInput.addEventListener("change",async()=>{
 saved=false;cards=[];matches.replaceChildren();preview.textContent="";upload.disabled=true;
 const file=fileInput.files?.[0];if(!file)return;
 if(file.size>1024*1024){show("That JSON file exceeds the 1 MB limit.","error");fileInput.value="";return;}
 try{
  const data=JSON.parse(await file.text()),raw=Array.isArray(data)?data:Array.isArray(data?.cards)?data.cards:[data];
  cards=raw.map(validateCard);
  const raceCount=cards.reduce((sum,item)=>sum+item.card.races.length,0),entryCount=cards.reduce((sum,item)=>sum+item.entries,0);
  preview.textContent=cards.length+" tracks · "+raceCount+" races · "+entryCount+" runners · "+file.name;
  renderCards();show("Ready. One click saves every dashboard. PDFs are linked automatically when a matching publication exists; they are not required.","success");
 }catch(error){cards=[];show(error.message||"Choose a valid dashboard JSON file.","error");}
});
upload.addEventListener("click",async()=>{
 if(upload.disabled)return;
 upload.disabled=true;show("Saving all track dashboards…");
 try{
  const response=await fetch("/api/admin/projections/batch",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({cards:cards.map(item=>item.card)})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const savedCount=data.uploaded?.length?" Saved "+data.uploaded.length+" of "+cards.length+"; choose the same JSON file to finish. ":" ";
   throw Error((data.error||"Projection upload failed.")+savedCount);
  }
  saved=true;
  show("Saved "+data.tracks+" dashboards, "+data.races+" races, and "+data.entries+" runners. "+data.linked_pdfs+" matching PDFs linked automatically. The PDF is optional; the on-screen dashboard uses this JSON.","success");
 }catch(error){show(error.message||"Projection upload failed.","error");}
 finally{renderCards();}
});
})();

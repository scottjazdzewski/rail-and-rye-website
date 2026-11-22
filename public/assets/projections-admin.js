(()=>{
"use strict";
const q=s=>document.querySelector(s),status=q("#status"),productSelect=q("#product"),fileInput=q("#json-file"),upload=q("#upload"),preview=q("#preview");
let products=[],parsed=null;
function show(message,type=""){status.textContent=message;status.className=type;}
function validatePreview(data){
 if(!data||data.schema_version!==1||!/^\d{4}-\d{2}-\d{2}$/.test(String(data.race_date||""))||!String(data.track_name||"").trim()||!Array.isArray(data.races)||!data.races.length)throw Error("That file does not match the dashboard JSON format.");
 let entries=0;for(const race of data.races){if(!Array.isArray(race.entries)||!race.entries.length)throw Error("Each race needs horse entries.");entries+=race.entries.length;}
 return {entries,races:data.races.length};
}
async function copyExportPrompt(){
 const example={schema_version:1,race_date:"2026-11-22",track_name:"Laurel Park",races:[{race_number:1,post_time_et:"12:10 PM",surface:"Dirt",distance:"6 furlongs",conditions:"Maiden Special Weight",pace:"Moderate",scratch_count:1,summary:"",entries:[{program_number:"1",horse_name:"Example Runner",rank:1,win_probability:27.5,morning_line:"5-2",fair_odds:"9/5",metrics:[{label:"SPEED",value:"Above average"},{label:"FORM",value:"Steady"},{label:"CLASS",value:"Competitive"},{label:"PACE FIT",value:"Positive"},{label:"SURFACE/DISTANCE",value:"Dirt · 6 furlongs"}],notes:""}]}]};
 const prompt="Create a downloadable .json export for the finalized card in this conversation using the exact schema below. Copy the final card values exactly; do not recalculate, round, infer, add, or remove projections. Include every race and every active horse, in the same order as the final PDF. Use win_probability in percentage points (27.5 means 27.5%). For each horse, put the printed SPEED, FORM, CLASS, PACE FIT, and SURFACE/DISTANCE values in metrics using those exact labels; put FAIR ODDS in fair_odds and keep the printed morning_line in its own field. Include race pace, scratch_count, conditions, surface, distance, and post_time_et when shown. Never fill missing values with guesses. Return one valid JSON file with no markdown fences.\n\n"+JSON.stringify(example,null,2);
 try{await navigator.clipboard.writeText(prompt);show("GPT export instructions copied. Paste them into the card-production chat after the card is finalized.","success");}
 catch{show("Clipboard access is unavailable in this browser. Use the JSON format example below.","error");}
}
q("#copy-prompt").addEventListener("click",copyExportPrompt);
async function loadProducts(){
 try{
  const response=await fetch("/api/admin/products",{credentials:"same-origin",cache:"no-store"});const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"The publication list did not load.");
  products=(data.products||[]).filter(p=>p.category==="Race Cards"&&p.pdf_key&&p.pdf_key!=="__rr_bundle__"&&!p.is_bundle_asset);
  productSelect.replaceChildren();const first=document.createElement("option");first.value="";first.textContent="Choose a Race Cards PDF";productSelect.append(first);
  for(const p of products){const option=document.createElement("option");option.value=p.id;option.textContent=[p.title,p.track,p.race_date,p.status].filter(Boolean).join(" · ");productSelect.append(option);}
  if(!products.length){show("No individual Race Cards publications with PDFs are available yet.");return;}
  show("Choose the matching PDF and your JSON export.");
 }catch(error){show(error.message||"Could not load publications.","error");}
}
fileInput.addEventListener("change",async()=>{
 parsed=null;preview.textContent="";upload.disabled=true;const file=fileInput.files?.[0];if(!file)return;
 if(file.size>1024*1024){show("That JSON file exceeds the 1 MB limit.","error");fileInput.value="";return;}
 try{const raw=await file.text();parsed=JSON.parse(raw);const result=validatePreview(parsed);preview.textContent=parsed.track_name+" · "+parsed.race_date+" · "+result.races+" races · "+result.entries+" horses";show("JSON file is ready to upload.");upload.disabled=!productSelect.value;}
 catch(error){show(error.message||"Choose a valid JSON file.","error");}
});
productSelect.addEventListener("change",()=>{upload.disabled=!(parsed&&productSelect.value);});
upload.addEventListener("click",async()=>{
 if(!parsed||!productSelect.value)return;
 upload.disabled=true;show("Saving projection data…");
 try{
  const response=await fetch("/api/admin/projections",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({product_id:productSelect.value,card:parsed})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"Projection upload failed.");
  show("Loaded "+data.track_name+" · "+data.race_date+" · "+data.races+" races · "+data.entries+" horses. Members will see it with this publication.","success");
 }catch(error){show(error.message||"Projection upload failed.","error");}
 finally{upload.disabled=!(parsed&&productSelect.value);}
});
loadProducts();
})();

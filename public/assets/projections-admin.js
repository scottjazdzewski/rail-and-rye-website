(()=>{
"use strict";
const q=selector=>document.querySelector(selector),status=q("#status"),fileInput=q("#json-file"),upload=q("#upload"),preview=q("#preview"),matches=q("#card-matches");
let products=[],cards=[],mapping=[],saved=false;
function show(message,type=""){status.textContent=message;status.className=type;}
function fold(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function trackAliases(track){
 const name=fold(track),base=name.replace(/\b(park|downs)\b/g,"").trim(),aliases=[name,base];
 const groups=[
  [["belmont"],["belmont","bel"]],
  [["churchill"],["churchill","cd"]],
  [["del mar","delmar"],["del mar","delmar","dmr"]],
  [["gulfstream"],["gulfstream","gp"]],
  [["laurel"],["laurel","lrl"]],
  [["mahoning"],["mahoning","mvr"]],
  [["mountaineer"],["mountaineer","mnr"]],
  [["woodbine"],["woodbine","wo"]]
 ];
 for(const [needles,values] of groups)if(needles.some(needle=>name.includes(needle)))aliases.push(...values);
 return [...new Set(aliases.map(fold).filter(Boolean))];
}
function cardMatchesProduct(card,product){
 if(product.race_date&&product.race_date!==card.race_date)return false;
 const fields=[fold(product.track),fold(product.title)].filter(Boolean),aliases=trackAliases(card.track_name);
 return aliases.some(alias=>fields.some(field=>field===alias||field.includes(alias)||(alias.length<=3&&field.replace(/ /g,"").startsWith(alias))));
}
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
function updateReady(){
 if(saved){upload.disabled=true;upload.textContent="Dashboards loaded";return;}
 const selected=mapping.map(item=>item?.value||"");
 const complete=cards.length>0&&selected.every(Boolean)&&new Set(selected).size===selected.length;
 upload.disabled=!complete;
 upload.textContent=cards.length>1?"Load "+cards.length+" track dashboards":"Load track dashboard";
 if(complete)return;
 if(selected.some((id,index)=>id&&selected.indexOf(id)!==index))show("Each track needs a different Race Cards PDF. Check the highlighted assignments.","error");
 else if(cards.length)show("Match every track to its existing Race Cards PDF to enable the one-click import.");
}
function renderMatches(){
 matches.replaceChildren();mapping=[];
 const eligible=products.filter(product=>product.category==="Race Cards"&&product.pdf_key&&product.pdf_key!=="__rr_bundle__"&&!product.is_bundle_asset);
 cards.forEach(({card,entries},index)=>{
  const exact=eligible.filter(product=>cardMatchesProduct(card,product)),dated=eligible.filter(product=>!product.race_date||product.race_date===card.race_date);
  const choices=exact.length?exact:dated;
  const row=document.createElement("article");row.className="projection-match";
  const copy=document.createElement("div"),title=document.createElement("h2"),meta=document.createElement("p"),hint=document.createElement("p");
  title.textContent=card.track_name;meta.textContent=card.race_date+" · "+card.races.length+" races · "+entries+" runners";
  hint.className="hint";hint.textContent=exact.length===1?"Matched by track and date.":exact.length>1?"More than one publication matches; choose the correct PDF.":choices.length?"Choose the matching PDF for this date.":"No matching individual Race Cards PDF is attached yet.";
  copy.append(title,meta,hint);
  const select=document.createElement("select");select.setAttribute("aria-label","Match "+card.track_name+" to an existing PDF");select.dataset.index=String(index);
  const empty=document.createElement("option");empty.value="";empty.textContent=choices.length?"Choose existing PDF publication":"No matching PDF attached";select.append(empty);
  for(const product of choices){const option=document.createElement("option");option.value=product.id;option.textContent=[product.title,product.track,product.race_date,product.status].filter(Boolean).join(" · ");select.append(option);}
  if(exact.length===1)select.value=exact[0].id;
  select.disabled=!choices.length;select.addEventListener("change",()=>{mapping[index]=select;updateReady();});
  row.append(copy,select);matches.append(row);mapping[index]=select;
 });
 updateReady();
}
async function loadProducts(){
 try{
  const response=await fetch("/api/admin/products",{credentials:"same-origin",cache:"no-store"}),data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"The publication list did not load.");
  products=data.products||[];
  if(cards.length)renderMatches();else show(products.length?"Choose the all-tracks JSON export.":"No individual Race Cards PDFs are available yet.");
 }catch(error){show(error.message||"Could not load publications.","error");}
}
fileInput.addEventListener("change",async()=>{
 saved=false;cards=[];mapping=[];matches.replaceChildren();preview.textContent="";upload.disabled=true;
 const file=fileInput.files?.[0];if(!file)return;
 if(file.size>1024*1024){show("That JSON file exceeds the 1 MB limit.","error");fileInput.value="";return;}
 try{
  const data=JSON.parse(await file.text()),raw=Array.isArray(data)?data:Array.isArray(data?.cards)?data.cards:[data];
  cards=raw.map(validateCard);
  const raceCount=cards.reduce((sum,item)=>sum+item.card.races.length,0),entryCount=cards.reduce((sum,item)=>sum+item.entries,0);
  preview.textContent=cards.length+" tracks · "+raceCount+" races · "+entryCount+" runners · "+file.name;
  renderMatches();
 }catch(error){cards=[];show(error.message||"Choose a valid dashboard JSON file.","error");}
});
upload.addEventListener("click",async()=>{
 if(upload.disabled)return;
 upload.disabled=true;show("Saving projection data for all matched tracks…");
 try{
  const items=cards.map(({card},index)=>({product_id:mapping[index].value,card}));
  const response=await fetch("/api/admin/projections/batch",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({items})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const saved=data.uploaded?.length?" Saved "+data.uploaded.length+" of "+cards.length+"; re-upload this same JSON to finish. ":" ";
   throw Error((data.error||"Projection upload failed.")+saved);
  }
  saved=true;
  show("Saved "+data.tracks+" tracks, "+data.races+" races, and "+data.entries+" runners. Each dashboard is linked to its existing PDF; no PDF was re-uploaded. The member view remains private until launch.","success");
 }catch(error){show(error.message||"Projection upload failed.","error");}
 finally{updateReady();}
});
loadProducts();
})();

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

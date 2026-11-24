/* Customer reader: all data goes through the paid product/date API. */
(()=>{
 if(document.body.dataset.rrCustomer!=="true")return;
 const date=new URLSearchParams(location.search).get("date")||"";
 const edition=async category=>{
  const query=new URLSearchParams({category,date});
  const response=await fetch("/api/product-tabs/edition?"+query,{credentials:"same-origin",cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(response.status===403||response.status===404){
   location.replace("/store/?"+query);
   throw Error("Access for this racing date is unavailable. Returning to the Intelligence Hub.");
  }
  if(!response.ok)throw Error(data.error||"Unable to load this racing edition.");
  if(data.category!==category||data.race_date!==date)throw Error("The racing edition did not match your selection.");
  return data;
 };
 globalThis.RRCustomerReader=Object.freeze({date,edition});
})();
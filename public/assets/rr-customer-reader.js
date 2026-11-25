/* Customer reader: retry temporary transport/server failures without bypassing access. */
(()=>{
 if(document.body.dataset.rrCustomer!=="true")return;
 const date=new URLSearchParams(location.search).get("date")||"";
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const retryable=status=>[408,425,429,500,502,503,504,520,521,522,523,524].includes(status);
 const edition=async category=>{
  const query=new URLSearchParams({category,date});
  const url="/api/product-tabs/edition?"+query;
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
   if(attempt)await delay(attempt===1?400:1000);
   let response,data;
   try{
    response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
    data=await response.json();
   }catch{
    lastError=Error("Unable to load this racing edition. Please refresh to try again.");
    continue;
   }
   if(response.status===403||response.status===404){
    if(typeof data?.error==="string"){
     location.replace("/store/?"+query);
     throw Error("Access for this racing date is unavailable. Returning to the Intelligence Hub.");
    }
    lastError=Error("Unable to load this racing edition. Please refresh to try again.");
    continue;
   }
   if(!response.ok){
    lastError=Error(data?.error||"Unable to load this racing edition.");
    if(retryable(response.status))continue;
    throw lastError;
   }
   if(data?.category!==category||data?.race_date!==date){
    lastError=Error("The racing edition did not match your selection.");
    continue;
   }
   return data;
  }
  throw lastError||Error("Unable to load this racing edition.");
 };
 globalThis.RRCustomerReader=Object.freeze({date,edition});
})();

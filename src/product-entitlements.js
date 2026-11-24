// The purchased SKU is the authorization boundary. Category/date alone is
// never an entitlement to every track. Blank tracks are daily research only.
export const trackKey=value=>String(value||"").normalize("NFC").trim().replace(/\s+/g," ").toLowerCase();
export const dailyResearch=category=>category==="Longshot Radar"||category==="Target List";
export function trackCovered(products,category,track){
 const key=trackKey(track);
 return products.some(p=>p.category===category&&(
  (dailyResearch(category)&&!trackKey(p.track))||
  (key&&trackKey(p.track)===key)
 ));
}
export function isProductUnlocked(product,access,now=Date.now()){
 return access.universal===true||Number(product.price_cents)===0||access.scopes.some(scope=>
  !!product.id&&scope.product_id===product.id&&scope.category===product.category&&
  scope.race_date===product.race_date&&trackKey(scope.track)===trackKey(product.track)&&scope.expires_at>now);
}
export function entitledProducts(products,access){
 return products.filter(product=>isProductUnlocked(product,access));
}

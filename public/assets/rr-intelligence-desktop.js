/* Desktop logo enhancement only. No model data, mobile assets, or reader mutations below 1100px. */
(function(){
 "use strict";
 const viewport=matchMedia("(min-width: 1100px)");
 const host=document.getElementById("rr-dash-track-identity");
 if(!host)return;
 const approved=new Set(["finger-lakes","mahoning-valley","mountaineer","parx-racing","zia-park"]);
 const normalize=text=>String(text||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
 function update(){
  if(!viewport.matches)return;
  const head=host.querySelector(".rrp-track-head");
  const name=head?.querySelector(".rrp-track-head__name")?.textContent;
  const slug=normalize(name);
  if(!head)return;
  if(approved.has(slug))head.dataset.rrDesktopLogo=slug;
  else delete head.dataset.rrDesktopLogo;
 }
 const observer=new MutationObserver(update);
 function sync(){
  observer.disconnect();
  if(viewport.matches){update();observer.observe(host,{childList:true,subtree:true,characterData:true});}
  else for(const element of host.querySelectorAll("[data-rr-desktop-logo]"))delete element.dataset.rrDesktopLogo;
 }
 viewport.addEventListener("change",sync);sync();
})();

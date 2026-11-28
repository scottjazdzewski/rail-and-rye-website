// Isolated design preview. No production bindings, credentials, or engine.
export const demo = [
 {id:"demo-probability-shift",date:"2026-11-26",track:"Demo Racecourse",race_number:9,kind:"WIN_SHIFT",chip:"7",horse:"Example Runner",headline:"Example Runner Moves Up",metric:{label:"WIN",before:24,after:33},summary:{projected_rank:1,win_probability:33},short_message:"Remains the projected favorite after #5 scratched.",message:"After #5 scratched, Example Runner remains the projected favorite.",scratches:[{program:"5",horse:"Demo scratch"}]},
 {id:"demo-new-favorite",date:"2026-11-26",track:"Demo Racecourse",race_number:5,kind:"NEW_FAVORITE",chip:"4",horse:"Example Contender",headline:"New Projected Favorite",metric:{label:"WIN",before:22,after:36},summary:{projected_rank:1,win_probability:36},short_message:"Moves to the top of the projections after two scratches.",message:"Example Contender moves to the top of the revised projections.",scratches:[{program:"2",horse:"Demo scratch"},{program:"8",horse:"Demo scratch"}]},
 {id:"demo-order",date:"2026-11-26",track:"Demo Racecourse",race_number:3,kind:"F4_SHIFT",chip:"2",horse:"Example Challenger",headline:"Projected Finishing Order Changes",metric:{label:"SECOND_OR_THIRD",before:18,after:29},summary:{projected_rank:3,win_probability:19},short_message:"Second-or-third probability increases after #1 scratched.",message:"Example Challenger has a higher projected chance of finishing second or third.",scratches:[{program:"1",horse:"Demo scratch"}]},
 {id:"demo-pace",date:"2026-11-26",track:"Demo Racecourse",race_number:7,kind:"PACE_ADVANTAGE",pace_fit:{before:"gray",after:"green"},chip:"6",horse:"Example Pace Runner",headline:"Pace Advantage",metric:{label:"WIN",before:25,after:39},summary:{projected_rank:1,win_probability:39},short_message:"Pace Fit improves after #3 scratched.",message:"Fictional preview: Pace Fit improves from neutral to positive after a scratch. Not a certified live finding.",scratches:[{program:"3",horse:"Demo scratch"}]}
].map(x=>({...x,hub_url:"/preview-hub"}));
const headers={"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow"};
function html(body,status=200){return new Response('<!doctype html><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><title>Rail & Rye | Design preview</title><style>body{font:16px system-ui;background:#102238;color:#fff;padding:24px;max-width:720px;margin:auto}a{color:#dfbf83}h1{color:#dfbf83}</style><p>DESIGN PREVIEW · FICTIONAL DATA · NOT LIVE</p>'+body,{status,headers:{...headers,"Content-Type":"text/html;charset=utf-8"}})}
export default {async fetch(request,env){
 const url=new URL(request.url),p=url.pathname;
 if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Read-only preview",{status:405,headers});
 if(p==="/robots.txt")return new Response("User-agent: *\nDisallow: /\n",{headers});
 if(p==="/api/race-day-pulse")return Response.json({status:"ok",preview:true,items:demo},{headers});
 if(p==="/api/products")return Response.json({products:[]},{headers});
 if(p==="/preview-hub"||p==="/store/"||p.startsWith("/intelligence/"))return html("<h1>Racing Intelligence Hub</h1><p>Preview only. No purchases, sign-ins or live data.</p><a href='/'>Return to homepage preview</a>");
 const imageMatch=p.match(/^\/pulse\/(\d{4}-\d{2}-\d{2})\/(demo-[a-z0-9-]+)\/card-v1\.png$/);
 if(imageMatch){
   const item=demo.find(x=>x.date===imageMatch[1]&&x.id===imageMatch[2]);
   if(!item)return new Response(null,{status:404,headers});
   const image=await env.ASSETS.fetch(new Request(new URL('/assets/pulse-social/'+item.date+'/'+item.id+'.png',url),request));
   return new Response(request.method==='HEAD'?null:image.body,{status:image.status,headers:{...headers,'Content-Type':'image/png'}});
 }
 if(p.startsWith("/pulse/")){
   const item=demo.find(x=>p==="/pulse/"+x.date+"/"+x.id);
   if(!item)return html("<h1>Not found</h1>",404);
   const canonical=new URL(p,url).href,image=canonical+'/card-v1.png';
   const img=await env.ASSETS.fetch(new Request(new URL('/assets/pulse-social/'+item.date+'/'+item.id+'.png',url),{method:'HEAD'}));
   const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const title=esc(item.track+' · Race '+item.race_number+' | '+item.horse),desc=esc(item.short_message||item.message);
   const meta=img.ok?'<meta property="og:image" content="'+esc(image)+'"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="675"><meta property="og:image:type" content="image/png"><meta name="twitter:image" content="'+esc(image)+'">':'';
   const card='<section id="rr-pulse" class="rr-pulse rr-pulse-detail" hidden data-pulse-item="'+esc(JSON.stringify(item))+'"><div class="rr-pulse-shell"><h2 class="rr-pulse-title">Race-Day Pulse</h2><span id="rr-pulse-count" hidden></span><div hidden><button id="rr-pulse-prev"></button><button id="rr-pulse-next"></button></div><div id="rr-pulse-rail" class="rr-pulse-rail"></div></div></section>';
   return new Response('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><title>'+title+'</title><meta property="og:title" content="'+title+'"><meta property="og:description" content="'+desc+'"><meta property="og:url" content="'+esc(canonical)+'"><meta name="twitter:card" content="'+(img.ok?'summary_large_image':'summary')+'"><meta name="twitter:title" content="'+title+'"><meta name="twitter:description" content="'+desc+'">'+meta+'<link rel="stylesheet" href="/assets/race-day-pulse.css?v=9"></head><body><main class="rr-pulse-share-page"><article class="rr-pulse-story"><p>DESIGN PREVIEW · FICTIONAL DATA · NOT LIVE</p><h1>'+title+'</h1><p>'+desc+'</p>'+card+(img.ok?'<img class="rr-pulse-social-image" src="'+esc(image)+'" alt="'+title+'"><a class="rr-pulse-download" download href="'+esc(image)+'">Download Card</a>':'')+'<a class="rr-pulse-primary" href="/preview-hub">Full-Field Analysis</a><a class="rr-pulse-secondary" href="/">Return to Race-Day Pulse</a></article></main><script src="/assets/race-day-pulse.js?v=9" defer></script></body></html>',{headers:{...headers,"Content-Type":"text/html;charset=utf-8"}});
 }
 if(p==="/"||p==="/index.html"){
 const response=await env.ASSETS.fetch(new Request(new URL("/index.html",url),request));
 if(!response.ok)return response;
 const h=new Headers(response.headers);for(const [k,v] of Object.entries(headers))h.set(k,v);h.delete("content-length");h.delete("etag");
 let body=await response.text();
 body=body.replace(/<head>/i,'<head><meta name="robots" content="noindex,nofollow">').replace(/<body[^>]*>/i,m=>m+'<div role="status" style="background:#e3bd70;color:#102238;text-align:center;padding:8px;font:700 12px system-ui">DESIGN PREVIEW · FICTIONAL DATA · NO LIVE PAYMENTS</div>');
 return new Response(body,{status:response.status,headers:h});
 }
 if(p.startsWith("/assets/")||p==="/favicon.png"||p==="/favicon.ico"){const r=await env.ASSETS.fetch(request);const h=new Headers(r.headers);for(const [k,v] of Object.entries(headers))h.set(k,v);return new Response(r.body,{status:r.status,headers:h});}
 return html("<h1>Preview only</h1><p>This destination is disabled in staging.</p><a href='/'>Return to homepage preview</a>",404);
}};

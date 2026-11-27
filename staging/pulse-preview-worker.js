// Isolated design preview. No production bindings, credentials, or engine.
const demo = [
 {id:"demo-probability-shift",date:"2026-11-26",track:"Demo Racecourse",race_number:9,kind:"WIN_SHIFT",chip:"7",horse:"Example Runner",headline:"Example Runner Moves Up",metric:{label:"WIN",before:24,after:33},short_message:"Remains the projected favorite after #5 scratched.",message:"After #5 scratched, Example Runner remains the projected favorite.",scratches:[{program:"5",horse:"Demo scratch"}]},
 {id:"demo-new-favorite",date:"2026-11-26",track:"Demo Racecourse",race_number:5,kind:"NEW_FAVORITE",chip:"4",horse:"Example Contender",headline:"New Projected Favorite",metric:{label:"WIN",before:22,after:36},short_message:"Moves to the top of the projections after two scratches.",message:"Example Contender moves to the top of the revised projections.",scratches:[{program:"2",horse:"Demo scratch"},{program:"8",horse:"Demo scratch"}]},
 {id:"demo-order",date:"2026-11-26",track:"Demo Racecourse",race_number:3,kind:"F4_SHIFT",chip:"2",horse:"Example Challenger",headline:"Projected Finishing Order Changes",metric:{label:"SECOND_OR_THIRD",before:18,after:29},short_message:"Second-or-third probability increases after #1 scratched.",message:"Example Challenger has a higher projected chance of finishing second or third.",scratches:[{program:"1",horse:"Demo scratch"}]}
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
 if(p.startsWith("/pulse/")){const item=demo.find(x=>p==="/pulse/"+x.date+"/"+x.id);return item?html("<h1>"+item.headline+"</h1><p>"+item.track+" · Race "+item.race_number+"</p><p>"+item.message+"</p><a href='/'>Return to homepage preview</a>"):html("<h1>Not found</h1>",404);}
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

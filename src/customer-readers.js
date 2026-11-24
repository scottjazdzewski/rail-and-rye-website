/* Serve the same approved dashboard shells to paying customers. These shells
   contain no paid data. Every edition fetch is independently authorized by
   product-tabs.js; publisher routes and credentials are never used. */
export const CUSTOMER_READERS=Object.freeze({
 "race-cards":{category:"Race Cards",asset:"/admin/projections-preview.html"},
 "pick-tickets":{category:"Pick Tickets",asset:"/admin/pick-tickets-preview.html"},
 "longshot-radar":{category:"Longshot Radar",asset:"/admin/longshot-radar.html"},
 "target-list":{category:"Target List",asset:"/admin/target-list-preview.html"}
});
const headers={
 "Cache-Control":"private, no-store","Content-Type":"text/html; charset=utf-8",
 "X-Robots-Tag":"noindex, nofollow, noarchive","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"same-origin","X-Frame-Options":"DENY",
 "Content-Security-Policy":"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};
export function customerReaderPath(category,date){
 const slug=Object.keys(CUSTOMER_READERS).find(key=>CUSTOMER_READERS[key].category===category);
 return slug&&/^\d{4}-\d{2}-\d{2}$/.test(String(date||""))?"/intelligence/"+slug+"/?date="+encodeURIComponent(date):null;
}
export async function serveCustomerReader(request,env,url){
 if(!["GET","HEAD"].includes(request.method))return new Response("Method not allowed",{status:405,headers});
 const slug=url.pathname.match(/^\/intelligence\/([a-z-]+)\/?$/)?.[1];
 const config=Object.hasOwn(CUSTOMER_READERS,slug||"")?CUSTOMER_READERS[slug]:null;
 if(!config)return new Response("Not found",{status:404,headers});
 const date=url.searchParams.get("date")||"";
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return Response.redirect(new URL("/store/?category="+encodeURIComponent(config.category),url),302);
 const asset=new URL(config.asset,url);const response=await env.ASSETS.fetch(new Request(asset,{method:"GET"}));
 if(!response.ok)return new Response("Racing Intelligence is temporarily unavailable.",{status:503,headers});
 const source=await response.text();
 if(!/<body\b/.test(source)||!source.includes("rr-intel-header"))return new Response("Racing Intelligence is temporarily unavailable.",{status:503,headers});
 let html=source.replace(/<body\b([^>]*)>/,(_,attrs)=>'<body'+attrs.replace(/\sdata-rr-preview="[^"]*"/g,"")+' data-rr-customer="true">');
 html=html.replace(/href="\/admin\/racing-intelligence-review\/?"/g,'href="/store/?date='+date+'"');
 for(const [key,item] of Object.entries(CUSTOMER_READERS)){
  const path=item.asset.replace(/\.html$/,"");
  html=html.replaceAll('href="'+path+'/"','href="/intelligence/'+key+'/?date='+date+'"');
 }
 html=html.replace(/<a href="\/admin\/">Publisher[’']s Desk<\/a>/g,'<a href="/store/?date='+date+'">Intelligence Hub</a>');
 html=html.replace(/<a([^>]*href="\/intelligence\/race-cards\/[^"]*"[^>]*)>Projections<\/a>/g,"<a$1>Race Cards</a>");
 html=html.replaceAll('href="/membership/account/"','href="/store/?date='+date+'"').replaceAll('Go to member sign in','Return to Intelligence Hub').replaceAll('Open member library','Return to Intelligence Hub');
 html=html.replace(/(src="\/assets\/(?:projections-dashboard|pick-tickets-dashboard|longshot-radar|target-list-dashboard|rr-exotic-bet-builder)\.js)\?[^"]*"/g,'$1?v=customer-direct-3"');
 html=html.replace(/(src="\/assets\/pick-tickets-dashboard\.js)\?[^"]*"/g,'$1?v=customer-pick-pwin-lock-4"');
 html=html.replace("</head>",'<script defer src="/assets/rr-customer-reader.js?v=1"></script></head>');
 // Reader helper must execute before deferred dashboard scripts.
 html=html.replace('<script defer src="/assets/rr-customer-reader.js?v=1"></script></head>',"</head>").replace(/(<script\b[^>]*src="\/assets\/[^"]+"[^>]*>)/,'<script defer src="/assets/rr-customer-reader.js?v=1"></script>$1');
 if(/href="\/admin\//.test(html))return new Response("Racing Intelligence is temporarily unavailable.",{status:503,headers});
 return new Response(request.method==="HEAD"?null:html,{status:200,headers});
}

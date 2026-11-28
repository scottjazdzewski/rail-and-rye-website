// Offline working owner-review HTML using original website source and assets.
// This is a design alternative only, not a production route or deployment.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('public'),out=path.resolve('pulse-html-review');
const feed=JSON.parse(fs.readFileSync(path.join(process.env.PULSE_PRIVATE_REHEARSAL_DIR,'2026-11-27.json'),'utf8'));
assert.equal(feed.status,'ok');assert.ok(feed.items.length);
const first=feed.items.find(i=>/kehoe beach/i.test(i.horse)&&/^\d+$/.test(i.chip)&&i.scratches.every(s=>/^\d+$/.test(s.program)))||feed.items.find(i=>i.kind==='NEW_FAVORITE'&&/^\d+$/.test(i.chip)&&i.scratches.every(s=>/^\d+$/.test(s.program)));
assert.ok(first);
const review={...feed,items:[first,...feed.items.filter(i=>i.id!==first.id)]};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ico':'image/x-icon'};
const assetCache=new Map();
function uri(p){const clean=p.split('?')[0],file=path.join(root,clean);if(!fs.existsSync(file)||!fs.statSync(file).isFile()||!mime[path.extname(file)])return p;if(!assetCache.has(clean))assetCache.set(clean,'data:'+mime[path.extname(file)]+';base64,'+fs.readFileSync(file).toString('base64'));return assetCache.get(clean);}
const cssFiles=['assets/rail-rye-core.css','assets/rail-rye-components.css','assets/rail-rye-pages.css','assets/race-day-pulse.css'];
const css=cssFiles.map(p=>read(p).replace(/url\(\s*(['"]?)(\/[^)'"]+)\1\s*\)/g,(all,q,u)=>'url("'+uri(u)+'")')).join('\n');
const home=read('index.html'),pulse=home.match(/<section id="rr-pulse"[\s\S]*?<\/section>/)[0],header=home.match(/<header class="heritage-header"[\s\S]*?<\/header>/)[0];
const navHeader=header.replace('<nav class="heritage-nav" aria-label="Main navigation">','<nav class="heritage-nav" aria-label="Main navigation"><a class="heritage-nav-pill" href="pulse-dedicated.html">Race-Day Pulse</a>').replace('<nav aria-label="Mobile navigation">','<nav aria-label="Mobile navigation"><a href="pulse-dedicated.html">Race-Day Pulse</a>');
const assetMap={};
for(let i=1;i<=20;i++){const p='/assets/approved/saddlecloths/'+i+'.png';assetMap[p]=uri(p);}
assetMap['/assets/approved/brand/rail-rye-ivory-logo.png']=uri('/assets/approved/brand/rail-rye-ivory-logo.png');
const safe=v=>JSON.stringify(v).replace(/</g,'\\u003c');
const script=read('assets/race-day-pulse.js').replace("img.src='/assets/approved/saddlecloths/'+value+'.png'","img.src=window.reviewAssets['/assets/approved/saddlecloths/'+value+'.png']").replace("img.src=src;await img.decode()","img.src=window.reviewAssets[src]||src;await img.decode()").replace("import('/assets/rr-race-titles.js').catch(()=>{}).finally(","Promise.resolve().finally(").replace("new URL(pulseUrl(item),location.origin).href","'https://railandryeracing.com'+pulseUrl(item)").replace("load();setInterval(load,60000);","load();").replace("if(!detailMode&&!matchMedia('(prefers-reduced-motion: reduce)').matches){","if(false){");
const bootstrap='<script>window.reviewAssets='+safe(assetMap)+';window.reviewFeed='+safe(review)+';window.fetch=async function(url){const u=String(url);if(u.includes("/api/race-day-pulse"))return new Response(JSON.stringify(window.reviewFeed),{headers:{"Content-Type":"application/json"}});if(u.includes("/api/products"))return new Response("{\\"products\\":[]}");return new Response(null,{status:404});};</script>';
const extra=`
body{scrollbar-gutter:auto}
.review-strip{padding:7px 12px;background:#e6c17e;color:#10283b;display:flex;align-items:center;justify-content:space-between;gap:10px;font:700 12px/1.3 system-ui;flex-wrap:wrap}
.review-strip a{text-decoration:underline}.review-strip span{font-weight:500}
.pulse-review-page{background:#071a2c;color:#f5ecd9;min-height:100vh}
.pulse-review-page .heritage-hero{min-height:0!important;height:auto!important;padding:0!important;background-position:center 30%}
.pulse-review-page .heritage-header{position:relative}
.pulse-review-intro{max-width:1240px;margin:auto;padding:25px 22px 14px}
.pulse-review-intro h1{font:600 clamp(36px,5vw,62px)/1.05 var(--heritage-serif);margin:0 0 8px;color:#f5ecd9}
.pulse-review-intro h1 em{color:#e4bf79}.pulse-review-intro p{font-size:14px;line-height:1.5;color:#e9dfcc}
.pulse-review-page .rr-pulse{border:0;background:transparent}
.pulse-review-page .rr-pulse-heading{padding-bottom:8px;border-bottom:1px solid #a18455;margin-bottom:14px}
.pulse-review-page .rr-pulse-nav{display:none}
.pulse-review-page .rr-pulse-rail{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;overflow:visible;height:auto!important;scroll-snap-type:none}
.pulse-review-page .rr-pulse-item{width:100%;max-width:100%;min-width:0;gap:7px;padding:14px}
.pulse-review-page .rr-pulse-item-footer{display:grid}.pulse-review-page .rr-pulse-compact-open,.pulse-review-page .rr-pulse-compact-row{display:none}
.pulse-review-page .rr-pulse-item-footer a,.pulse-review-page .rr-pulse-tool{min-height:44px}
.pulse-review-page .rr-pulse-message{white-space:normal;display:block;line-height:1.4}
.pulse-review-page .rr-pulse-count{display:inline!important}
.review-note{max-width:1240px;margin:20px auto;padding:0 20px 30px;color:#c4cbd0}
@media(max-width:700px){.pulse-review-intro{padding:18px 15px 10px}.pulse-review-page .rr-pulse-shell{padding:7px 12px}.pulse-review-page .rr-pulse-rail{grid-template-columns:minmax(0,1fr);gap:12px}.pulse-review-page .rr-pulse-item{padding:11px;gap:5px}.pulse-review-page .rr-pulse-heading{margin-bottom:9px}}
`;
function strip(other,label){return '<div class="review-strip">PRIVATE HTML REVIEW · November 27 certified data <a href="'+other+'">'+label+' ↗</a></div>';}
function embed(html,mode){let h=html.replace(/<link[^>]+rel="stylesheet"[^>]*>/g,'').replace(/<link[^>]+rel="preload"[^>]*>/g,'').replace(/<script>[\s\S]*?<\/script>/g,'').replace(/<script src="\/assets\/race-day-pulse\.js[^"]*" defer><\/script>/,'');h=h.replace(/(src|href)="(\/[^"]+)"/g,(all,k,p)=>{if(k==='src'||p==='/favicon.png')return k+'="'+uri(p)+'"';if(p==='/')return 'href="pulse-homepage.html"';return 'href="https://railandryeracing.com'+p+'"';});h=h.replace('</head>','<style>'+css+'\n'+extra+'</style></head>');h=h.replace(/(<body[^>]*>)/,'$1'+strip(mode==='home'?'pulse-dedicated.html':'pulse-homepage.html',mode==='home'?'Compare dedicated Pulse screen':'Compare homepage placement'));
 let js=script;if(mode==='dedicated')js=js.replace("if(!homepageHero||!shell||detailMode)return;","return;").replace("if(shell.hidden||!rail.children[selected])return;","return;").replace("else if(shell.previousElementSibling!==homepageHero)homepageHero.after(shell);","").replace("rail.scrollTo({left:rail.scrollLeft+el.getBoundingClientRect().left-rail.getBoundingClientRect().left,behavior});","").replace("    prev.disabled=selected===0;next.disabled=selected===rail.children.length-1;fitActiveCard();","    fitActiveCard();");
 const end='<script>'+read('assets/rr-race-titles.js')+'</script>'+bootstrap+'<script>'+js+'</script><script>document.addEventListener("click",e=>{const a=e.target.closest("a");if(a&&a.getAttribute("href")?.startsWith("/pulse/")){e.preventDefault();location.href="pulse-dedicated.html";}else if(a&&a.getAttribute("href")?.startsWith("/intelligence/")){a.href="https://railandryeracing.com"+a.getAttribute("href");}});</script>';
 return h.replace('</body>',end+'</body>');
}
const dedicated=home.slice(0,home.indexOf('<body'))+'<body class="pulse-review-page"><div class="heritage-hero">'+navHeader+'</div><main><div class="pulse-review-intro"><h1>Race-Day <em>Pulse</em></h1><p>Free race-day intelligence. See how verified scratches change our projections.</p></div>'+pulse+'</main><p class="review-note">Model projections · Not guarantees. Private review; sharing and payments are not enabled.</p></body></html>';
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'pulse-homepage.html'),embed(home.replace(header,navHeader),'home'));fs.writeFileSync(path.join(out,'pulse-dedicated.html'),embed(dedicated,'dedicated'));
console.log('OWNER_HTML_BUILT',review.items.length);

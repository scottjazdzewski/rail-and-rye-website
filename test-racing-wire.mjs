import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {handleRacingWire,parseRacingRss,categorize,refreshRacingWire,parseBlueskyAuthorFeed,subjectKind,socialPreview} from './src/racing-wire.js';
const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE journal_articles (id TEXT PRIMARY KEY,slug TEXT,title TEXT,category TEXT,excerpt TEXT,publish_date TEXT,status TEXT,created_at TEXT);");
db.prepare("INSERT INTO journal_articles VALUES (?,?,?,?,?,?,?,?)").run(
 'one','breeders-cup-briefing','Breeders Cup briefing','Racing','Original analysis of the Saturday championship card.','2026-10-31','published','2026-10-31 12:00:00');
db.prepare("INSERT INTO journal_articles VALUES (?,?,?,?,?,?,?,?)").run(
 'two','private-draft','Unpublished private results','Industry','This must not be visible.','2026-11-01','draft','2026-10-31 13:00:00');
db.prepare("INSERT INTO journal_articles VALUES (?,?,?,?,?,?,?,?)").run(
 'three','horse-update','Horse retires after big stakes','Horses','An archived story must stay hidden.','2026-10-30','archived','2026-10-30 12:00:00');
const STORE_DB={prepare(sql){
 const statement=db.prepare(sql);
 return {all(){return {results:statement.all()}}};
}};
const env={STORE_DB,RR_SOCIAL_FEEDS:'off'};
const root='https://railandryeracing.com/api/racing-wire';
const req=new Request(root);
const reply=await handleRacingWire(req,env);
assert.equal(reply.status,200);
const body=await reply.json();
assert.equal(body.items.length,1);
assert.equal(body.items[0].url,'/journal/breeders-cup-briefing/');
assert.equal(body.items[0].source,'Rail & Rye');
assert.equal(body.items[0].category,'Stakes');
assert.equal(body.source_count,0,'No unlicensed external publisher enabled by default');
assert.ok(!JSON.stringify(body).includes('private-draft'));
assert.ok(!JSON.stringify(body).includes('horse-update'));
assert.equal((await handleRacingWire(new Request(root,{method:'POST'}),env)).status,405);
assert.deepEqual(await refreshRacingWire(env),{checked:0,added:0},
 'No external feed requests are made without explicit publisher authorization');
assert.equal(categorize('Jockey loses mount'),'Jockeys');
assert.equal(categorize('Horse workout reported'),'Race-Day');
assert.equal(categorize('Yearling sale underway'),'Breeding');
const feed={name:'Authorized Publisher',host:'publisher.example'};
const rss='<rss><channel><item><title><![CDATA[Trainer &amp; Jockey updates]]></title>'+
 '<link>https://publisher.example/story/123</link><pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate></item>'+
 '<item><title>Bad URL</title><link>https://attacker.example/phishing</link><pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>';
const items=parseRacingRss(rss,feed);
assert.equal(items.length,1);
assert.equal(items[0].title,'Trainer & Jockey updates');
assert.equal(items[0].link,'https://publisher.example/story/123');
assert.equal(parseRacingRss('<!DOCTYPE rss [<!ENTITY pwn SYSTEM "http://evil/">]>'+rss,feed).length,0);
assert.equal(parseRacingRss('<rss><item><title>Bad</title><link>javascript:alert(1)</link><pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate></item></rss>',feed).length,0);

const source={handle:'paulickreport.bsky.social',name:'Paulick Report',network:'Bluesky'};
const bsPost=(uri,text,labels=[])=>({
  post:{author:{handle:source.handle,labels:[]},uri,labels,
   record:{$type:'app.bsky.feed.post',text,createdAt:'2026-10-31T04:12:00Z'}}
});
const sample={feed:[
 bsPost('at://did:plc:aumf3d42f75rnk3pv6qxbre7/app.bsky.feed.post/3kx123abc','Horse workout at Keeneland this morning'),
 bsPost('at://did:plc:aumf3d42f75rnk3pv6qxbre7/app.bsky.feed.post/3kx456abc','Hidden post',[{val:'!no-unauthenticated'}]),
 {...bsPost('at://did:plc:aumf3d42f75rnk3pv6qxbre7/app.bsky.feed.post/3kx789abc','Spoof'),post:{
   ...bsPost('at://did:plc:aumf3d42f75rnk3pv6qxbre7/app.bsky.feed.post/3kx789abc','Spoof').post,
   author:{handle:'impersonator.bsky.social',labels:[]}}}
]};
const socials=parseBlueskyAuthorFeed(sample,source);
assert.equal(socials.length,1,'Only public posts from matching author are displayed');
assert.equal(socials[0].url,'https://bsky.app/profile/paulickreport.bsky.social/post/3kx123abc');
assert.equal(socials[0].category,'Race-Day');
assert.ok(!JSON.stringify(socials).includes('Hidden post'));
assert.ok(!JSON.stringify(socials).includes('Spoof'));
globalThis.fetch=async url=>{
 assert.ok(String(url).startsWith('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?'));
 return Response.json(sample);
};
env.RR_SOCIAL_FEEDS='on';
const combined=await (await handleRacingWire(req,env)).json();
assert.equal(combined.items.length,2,'Live social posts combine with first-party articles');
assert.equal(combined.source_count,1);
assert.ok(combined.items.some(i=>i.source==='Paulick Report · Bluesky'&&i.original===false));
console.log('PASS verified public Bluesky author feed, source links, no-unauthenticated and impersonation protections.');

assert.equal(subjectKind('A horse retires after a win'),'horse');
assert.equal(subjectKind('Ownership group buys shares'),'owner');
assert.equal(subjectKind('Trainer sends two to the gate'),'trainer');
assert.equal(subjectKind('Jockey makes return'),'jockey');
assert.equal(subjectKind('Scratch in Breeders Cup Classic'),'race');
assert.equal(subjectKind('New York racing update'),'race');
assert.equal(subjectKind('Update','Owners'),'owner');
const longPost='Trainer confirms the colt has arrived at the track. A final workout is planned for the morning and a decision will follow. Further information about the horse will be shared after the next examination.';
const preview=socialPreview(longPost);
assert.ok(preview.title.startsWith('Trainer confirms the colt'));
assert.ok(preview.summary.includes('workout'));
assert.ok(!preview.summary.includes('imagined'));
assert.equal(socialPreview('Short original post').title,'Short original post');
assert.equal(socialPreview('Short original post').summary,'');
const wirePage=readFileSync(new URL('./public/preview/racing-wire-5333548f0ffee31ba519b2470ffb/index.html',import.meta.url),'utf8');
for(const type of ['horse','owner','trainer','jockey','race','stable','racetrack','breeding','sale','regulatory','achievement','industry']){
 assert.ok(wirePage.includes(type+':'), 'Original subject pictogram exists: '+type);
 assert.ok(wirePage.includes("'"+type+"'"), 'Subject filter configured: '+type);
}
assert.ok(wirePage.includes('Source: '),'Source attribution exists');
assert.ok(wirePage.includes('UNLISTED DESIGN PREVIEW'),'Page is clearly labeled as unlisted');
assert.ok(wirePage.includes('not a real report'),'Demonstration content clearly identified');
assert.ok(wirePage.includes('source')&&wirePage.includes('title')&&wirePage.includes('summary'),'News cards support original link and faithful source content');
assert.ok(wirePage.includes("fetch('/api/preview/racing-wire-5333548f0ffee31ba519b2470ffb'"),'Preview fetches only the unlisted API');
assert.ok(wirePage.includes('rail-rye-ivory-logo.png'),'Owner-approved Rail & Rye branding reused');

const journalPage=readFileSync(new URL('./public/journal/index.html',import.meta.url),'utf8');
const journalFooter=journalPage.match(/<footer class="heritage-footer">[\s\S]*?<\/footer>/)?.[0];
const previewFooter=wirePage.match(/<footer class="heritage-footer">[\s\S]*?<\/footer>/)?.[0];
assert.ok(journalFooter,'Canonical Rail & Rye footer exists');
assert.equal(previewFooter,journalFooter,'Preview footer, support/legal links and social icons exactly match canonical Journal');
const journalHeader=journalPage.match(/<header class="heritage-header">[\s\S]*?<\/header>/)?.[0];
const previewHeader=wirePage.match(/<header class="heritage-header">[\s\S]*?<\/header>/)?.[0];
assert.ok(previewHeader && journalHeader,'Preview uses the existing production header component');
assert.ok(previewHeader.includes('heritage-strap') && previewHeader.includes('header-horse.webp'),'Centered production racing strap retained');
assert.ok(previewHeader.includes('heritage-mobile-nav'),'Production mobile navigation retained');
assert.ok(previewHeader.includes('heritage-nav-pill') && previewHeader.includes('The Racing Wire'),'Wire preview pill added to the matching nav');
assert.ok(previewHeader.includes('aria-current="page">The Racing Wire'),'Wire pill is marked current only on preview');
assert.ok(wirePage.includes('/assets/rail-rye-core.css?v=10') &&
 wirePage.includes('/assets/rail-rye-components.css?v=8') &&
 wirePage.includes('/assets/rail-rye-pages.css?v=35'),'Header/footer use actual site stylesheets');
const normalizedHeader=previewHeader
 .replace('<a class="heritage-nav-pill" href="/preview/racing-wire-5333548f0ffee31ba519b2470ffb/" aria-current="page">The Racing Wire</a>','')
 .replace('<a href="/preview/racing-wire-5333548f0ffee31ba519b2470ffb/" aria-current="page">The Racing Wire</a>','')
 .replace('<a class="heritage-nav-pill" href="/journal/">The Journal</a>', '<a class="heritage-nav-pill" href="/journal/" aria-current="page">The Journal</a>')
 .replace('<a href="/journal/">The Journal</a>', '<a href="/journal/" aria-current="page">The Journal</a>');
assert.equal(normalizedHeader,journalHeader,'Header markup exactly matches canonical Journal after removal of preview-only pill');
assert.ok(!wirePage.includes('<header><div class="header-inner">'),'Custom mock header removed');
assert.ok(!wirePage.includes('<footer>THE RACING WIRE'),'Short mock footer removed');

assert.ok(!/<img\b[^>]+src=['"]https?:\/\//i.test(wirePage),'No borrowed publisher images');
const clientJs=wirePage.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(clientJs,'Preview contains interactive JavaScript');
new vm.Script(clientJs[1],{filename:'racing-wire-preview.js'});
// Exercise the actual Worker route with a deliberately bad asset MIME type.
// Prevent regression to iOS downloading the preview as an attachment.
const {default:siteWorker}=await import('./src/index.js');
const livePreviewPath='/preview/racing-wire-5333548f0ffee31ba519b2470ffb/';
const mockAssets={fetch:async input=>{
 assert.equal(new URL(input.url).pathname,livePreviewPath);
 return new Response('<!doctype html><html><body>Rendered preview</body></html>',{
  status:200,headers:{'Content-Type':'application/octet-stream',
  'Content-Disposition':'attachment; filename="racing-wire-preview"'}
 });
}};
const html=await siteWorker.fetch(new Request('https://railandryeracing.com'+livePreviewPath),
  {ASSETS:mockAssets},{});
assert.equal(html.status,200);
assert.match(html.headers.get('content-type'),/text\/html/i);
assert.equal(html.headers.get('content-disposition'),null);
assert.match(html.headers.get('x-robots-tag'),/noindex/i);
assert.match(await html.text(),/Rendered preview/);
assert.equal((await siteWorker.fetch(new Request('https://railandryeracing.com'+livePreviewPath,
 {method:'HEAD'}),{ASSETS:mockAssets},{})).status,200);

const router=readFileSync(new URL('./src/index.js',import.meta.url),'utf8');
assert.ok(router.includes("const previewApi='/api/preview/racing-wire-5333548f0ffee31ba519b2470ffb'"),'Only exact unlisted API path exists');
assert.ok(router.includes("const previewSlug='/preview/racing-wire-5333548f0ffee31ba519b2470ffb/'"),'Only exact unlisted web path exists');
assert.ok(router.includes('X-Robots-Tag'),'Preview responses disable search indexing');
assert.ok(router.includes("headers.set('Content-Type','text/html; charset=utf-8')"),'Preview is served explicitly as HTML, never as a PDF/download');
assert.ok(router.includes("assetUrl.pathname=previewSlug"),'Preview is resolved using its real index.html folder');
assert.ok(!router.includes("preview.pathname='/admin/racing-wire-preview.html'"),'No legacy admin-asset redirect which can break mobile');
assert.ok(router.includes("headers.delete('Content-Disposition')"),'No attachment download header');

assert.ok(router.includes("headers.set('Referrer-Policy','no-referrer')"),'Preview URL not sent as HTTP referrer');
assert.ok(!router.includes("if(path==='/api/admin/racing-wire-preview')"),'No unnecessary admin API alias');
assert.ok(!router.includes('if(path==="/api/racing-wire")'),'No public news endpoint');
const home=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
assert.ok(!home.includes('/racing-wire/'),'No public navigation pill until explicit launch approval');
const wrangler=readFileSync(new URL('./wrangler.jsonc',import.meta.url),'utf8');
assert.ok(wrangler.includes('"/preview/*"'),'Preview URL reaches Worker for exact route handling');
const publisherDesk=readFileSync(new URL('./public/admin/index.html',import.meta.url),'utf8');
assert.ok(publisherDesk.includes('/preview/racing-wire-5333548f0ffee31ba519b2470ffb/'),'Publisher Desk offers owner a working shareable preview link');
assert.ok(!home.includes('racing-wire-5333548f0ffee31ba519b2470ffb'),'No public homepage preview link');
assert.ok(!wirePage.includes('OWNER ACCESS ONLY'),'Viewer sign-in is not required');
assert.equal(subjectKind('A stallion retires to stud','Breeding'),'breeding');
assert.equal(subjectKind('New sales figures','Sales / Auctions'),'sale');
assert.equal(subjectKind('Racing commission announces rule change','Regulatory'),'regulatory');

console.log('PASS Racing Wire: original published-only news, archive/draft secrecy, approved-only RSS source gate, safe publisher links, XML safety, categorization.');

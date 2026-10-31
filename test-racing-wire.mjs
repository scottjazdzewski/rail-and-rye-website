import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {handleRacingWire,parseRacingRss,categorize,refreshRacingWire,testPreviewRssFeeds,groupRacingWireStories,subjectKind,socialPreview} from './src/racing-wire.js';
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

const diagnosticRss='<rss><channel><item><title>Real feed parser test</title>'+
 '<link>https://www.thoroughbreddailynews.com/story/example/</link>'+
 '<pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>';
let diagnosticFetches=0;
const diagnostic=await testPreviewRssFeeds(async url=>{
 diagnosticFetches++;
 assert.ok(String(url)==='https://www.thoroughbreddailynews.com/feed/'||
  String(url)==='https://www.thoroughbreddailynews.com/category/news/feed/');
 return new Response(diagnosticRss,{status:200,headers:{'Content-Type':'application/rss+xml'}});
});
assert.equal(diagnosticFetches,2,'Both real TDN RSS endpoints are exercised by diagnostic mode');
assert.equal(diagnostic.diagnostic_only,true);
assert.equal(diagnostic.results.length,2);
assert.ok(diagnostic.results.every(x=>x.reachable&&x.http_status===200&&x.parsed_count===1));
assert.ok(diagnostic.results.every(x=>x.newest_published_at==='2026-10-30T12:00:00.000Z'));
assert.ok(diagnostic.results.every(x=>!('title' in x)&&!('items' in x)),
 'Diagnostic reports connectivity/counts only and does not republish third-party headlines');


// Only authorized publisher RSS is eligible for automated site-side ingestion.
// Social platforms are addressed through official embeds or original-post links.
assert.deepEqual(body.social_sources,[]);
assert.equal(body.source_count,0);
const date='2026-10-31T12:00:00Z';
const articles=[
 {title:'Forever Young scratched from Breeders Cup Classic',url:'https://publisher1.example/news/1',
  source:'Publisher 1',subject_kind:'race',published_at:date},
 {title:'Breeders Cup Classic: Forever Young scratched',url:'https://publisher2.example/story/2',
  source:'Publisher 2',subject_kind:'race',published_at:'2026-10-31T11:30:00Z'},
 {title:'Forever Young wins Breeders Cup Classic',url:'https://publisher3.example/story/3',
  source:'Publisher 3',subject_kind:'race',published_at:'2026-10-31T11:00:00Z'},
 {title:'Another horse scratched from Breeders Cup Classic',url:'https://publisher4.example/story/4',
  source:'Publisher 4',subject_kind:'race',published_at:'2026-10-31T10:00:00Z'}
];
const grouped=groupRacingWireStories(articles);
assert.equal(grouped.length,3,'Same event deduplicates, different horses/developments do not');
const matched=grouped.find(x=>x.title.includes('scratched from Breeders Cup Classic'));
assert.equal(matched.also_reported_by.length,1);
assert.equal(matched.also_reported_by[0].source,'Publisher 2');
assert.equal(matched.also_reported_by[0].url,'https://publisher2.example/story/2');
assert.equal(groupRacingWireStories(articles.slice(0,1)).length,1);
assert.equal(groupRacingWireStories([
 ...articles.slice(0,1),{...articles[1],published_at:'2026-10-28T09:00:00Z'}
]).length,2,'Old developments remain separately dated for review');
const backend=readFileSync(new URL('./src/racing-wire.js',import.meta.url),'utf8');
assert.ok(!backend.includes('bsky.app')&&!backend.includes('Bluesky')&&!backend.includes('publicSocialItems'),
 'No Blue Sky API or network calls exist in production scorer');
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
assert.ok(!wirePage.includes('bsky.app'),'Preview contains no Blue Sky source links');
assert.ok(wirePage.includes('Also reported by:'),'UI offers linked alternate sources when one event has several reports');
assert.ok(!wirePage.includes('TRENDING TOPICS'),'Trending Topics sidebar removed');
assert.ok(!wirePage.includes('NEWS SOURCE DESK'),'Source directory sidebar removed');
assert.ok(wirePage.includes('UPCOMING STAKES'),'Upcoming Stakes sidebar present');
assert.equal((wirePage.match(/class="rrw-stake-row"/g)||[]).length,4,'Preview shows four verified upcoming stakes');
assert.ok(wirePage.includes('Twilight Derby (GII)')&&wirePage.includes('Forty Niner S. (GIII)'),'Verified graded stakes shown');
assert.ok(wirePage.includes('UNLISTED DESIGN PREVIEW'),'Page is clearly labeled as unlisted');
assert.ok(!wirePage.includes('const samples=[')&&!wirePage.includes('DEMO ONLY')&&!wirePage.includes('not a real report')&&!wirePage.includes('Example:'),
 'All fake/demo stories are permanently removed from the preview code');
assert.ok(!wirePage.includes('showExamples')&&!wirePage.includes('showActual'),
 'Fake/live mode switch is removed; verified items are the only news stream');
assert.ok(wirePage.includes('source')&&wirePage.includes('title')&&wirePage.includes('summary'),'News cards support original link and faithful source content');
assert.ok(wirePage.includes("fetch('/api/preview/racing-wire-5333548f0ffee31ba519b2470ffb'"),'Preview fetches only the unlisted API');
assert.ok(wirePage.includes('rail-rye-ivory-logo.png'),'Owner-approved Rail & Rye branding reused');

assert.ok(wirePage.includes('/assets/approved/saddlecloths/8.png'),'Racing Wire is numbered Page 8');
assert.ok(wirePage.includes('class="rrw-hero-image"')&&wirePage.includes('/assets/approved/racing-wire/hero-race.webp?v=3'),
 'Owner-edited racing artwork is a real versioned hero img element');
assert.ok(!wirePage.includes("url('/assets/approved/racing-wire/hero-race.webp')"),
 'No legacy CSS background competes with the hero image layer');
const heroAsset=readFileSync(new URL('./public/assets/approved/racing-wire/hero-race.webp',import.meta.url));
assert.equal(heroAsset.subarray(0,4).toString(),'RIFF','Hero asset has valid RIFF header');
assert.equal(heroAsset.subarray(8,12).toString(),'WEBP','Hero asset is a real WebP');
assert.ok(heroAsset.length>50000,'Hero asset is not a truncated placeholder');
assert.ok(!wirePage.includes('class="hero-art"'),'Temporary SVG hero artwork removed');
assert.ok(wirePage.includes('rr-page-saddle-kicker')&&wirePage.includes('rr-page-title')&&
 wirePage.includes('rr-page-rule')&&wirePage.includes('rr-page-description'),
 'Page 8 uses the same canonical numbered-page title treatment');
assert.ok(wirePage.includes('The Latest from the Backstretch.'),'Approved Racing Wire title is present');
assert.ok(wirePage.includes('id="testFeeds"')&&wirePage.includes('Test real RSS'),
 'Unlisted preview exposes real-feed diagnostic control');
assert.ok(wirePage.includes('/feed-test'),'RSS diagnostic button calls only the unlisted diagnostic route');
assert.ok(wirePage.includes('.item .emblem{width:88px;height:88px'),
 'News-card badges are enlarged on desktop');
assert.ok(!wirePage.includes('const shapes={')&&!wirePage.includes("el.innerHTML='<svg"),
 'Temporary inline SVG badge system is completely removed');
assert.ok(wirePage.includes("/assets/approved/racing-wire/badges.webp?v=3")&&
 wirePage.includes('.badge-horse{background-position:0 0}')&&
 wirePage.includes('.badge-achievement{background-position:100% 100%}'),
 'Approved proof-set badge sprite is the only badge artwork source');
const badgeAsset=readFileSync(new URL('./public/assets/approved/racing-wire/badges.webp',import.meta.url));
assert.equal(badgeAsset.subarray(0,4).toString(),'RIFF','Badge sprite has valid RIFF header');
assert.equal(badgeAsset.subarray(8,12).toString(),'WEBP','Badge sprite is a real WebP');
assert.ok(badgeAsset.length>20000,'Badge proof sprite is not truncated');
assert.ok(wirePage.includes('.more[hidden]{display:none!important}'),
 'Load-more cannot appear when there are zero verified stories');


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
assert.ok(router.includes("path===previewApi+'/feed-test'")&&router.includes('testPreviewRssFeeds'),'Real-feed test endpoint stays under the unlisted preview namespace');
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

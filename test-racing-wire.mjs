import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PREVIEW_LIVE_FEEDS,handleRacingWire,handlePreviewRacingWire,previewExternalItems,parseRacingRss,categorize,refreshRacingWire,testPreviewRssFeeds,groupRacingWireStories,curateRacingWireStories,scoreRacingWireItem,subjectKind,socialPreview} from './src/racing-wire.js';
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
 '<link>https://publisher.example/story/123</link><category>Breeders Cup</category><pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate></item>'+
 '<item><title>Bad URL</title><link>https://attacker.example/phishing</link><pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>';
const items=parseRacingRss(rss,feed);
assert.equal(items.length,1);
assert.equal(items[0].title,'Trainer & Jockey updates');
assert.equal(items[0].link,'https://publisher.example/story/123');
assert.equal(items[0].section,'Breeders Cup');
assert.equal(items[0].category,'Jockeys');
assert.equal(categorize('Championship update','Breeders Cup'),'Stakes');
assert.equal(parseRacingRss('<!DOCTYPE rss [<!ENTITY pwn SYSTEM "http://evil/">]>'+rss,feed).length,0);
assert.equal(parseRacingRss('<rss><item><title>Bad</title><link>javascript:alert(1)</link><pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate></item></rss>',feed).length,0);

const fixtureTitles=[
 'Champion colt retires to stud after Breeders Cup campaign',
 'Jockey reaches six thousand career victories',
 'Fasig Tipton yearling sells for seven figures at auction',
 'Trainer announces scratch from Saturday stakes race',
 'HISA issues suspension ruling after positive test',
 'Grade 1 winner sidelined by injury and surgery',
 'Filly wins Grade 2 stakes in track-record performance',
 'Yearling by leading sire tops major bloodstock sale',
 'Woodbine stakes runner scratched by veterinarian',
 'Broodmare delivers first foal by champion stallion',
 'National Steeplechase stakes race cancelled after weather change',
 'Trainer records one thousandth career victory',
 'OBS yearling sale posts record average and median',
 'Kentucky Derby winner retired to stud after injury',
 'Arc contender ruled out of Group 1 with illness'
];
assert.equal(PREVIEW_LIVE_FEEDS.length,15,'Expanded preview source roster contains 15 feeds');
const previewFeedFixtures=Object.fromEntries(PREVIEW_LIVE_FEEDS.map((feed,i)=>{
 const host=(feed.link_hosts?.[0]||feed.host);
 return [feed.url,{host,title:fixtureTitles[i],link:'https://www.'+host+'/rr-preview-story-'+(i+1)}];
}));
let diagnosticFetches=0;
const previewFetch=async url=>{
 diagnosticFetches++;
 const fixture=previewFeedFixtures[String(url)];
 assert.ok(fixture,'Only allowlisted preview RSS endpoints are requested: '+url);
 const xml='<rss><channel><item><title>'+fixture.title+'</title><link>'+fixture.link+'</link>'+
  '<pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>';
 return new Response(xml,{status:200,headers:{'Content-Type':'application/rss+xml'}});
};
const diagnostic=await testPreviewRssFeeds(previewFetch);
assert.equal(diagnosticFetches,15,'All expanded preview RSS endpoints are exercised by diagnostic mode');
assert.equal(diagnostic.diagnostic_only,true);
assert.equal(diagnostic.results.length,15);
assert.ok(diagnostic.results.every(x=>x.reachable&&x.http_status===200&&x.parsed_count===1));
assert.ok(diagnostic.results.every(x=>x.newest_published_at==='2026-10-30T12:00:00.000Z'));
assert.ok(diagnostic.results.every(x=>!('title' in x)&&!('items' in x)),
 'Diagnostic reports connectivity/counts only and does not republish third-party headlines');

diagnosticFetches=0;
const previewExternal=await previewExternalItems(previewFetch);
assert.equal(diagnosticFetches,15,'Preview live aggregator checks all fifteen RSS sources');
assert.equal(previewExternal.items.length,15);
assert.equal(previewExternal.sources.filter(x=>x.parsed_count===1).length,15);
assert.ok(previewExternal.items.every(x=>x.preview_external===true&&x.summary===''&&!x.original));

diagnosticFetches=0;
const previewResponse=await handlePreviewRacingWire(new Request('https://railandryeracing.com/api/preview/racing-wire-test'),env,previewFetch);
assert.equal(previewResponse.status,200);
const previewBody=await previewResponse.json();
assert.equal(diagnosticFetches,15);
assert.equal(previewBody.external_test_only,true);
assert.equal(previewBody.source_count,16,'Rail & Rye Journal plus fifteen reachable preview feed sources');
assert.equal(previewBody.external_sources.length,15);
assert.ok(previewBody.external_sources.every(x=>x.parsed_count===1),
 'All fifteen preview feeds parse successfully before editorial filtering');
assert.ok(previewBody.items.length>=10&&previewBody.items.length<16,
 'Editorial relevance/dedupe gate may suppress low-value or overlapping feed items');
assert.ok(previewBody.items.some(x=>x.source==='BloodHorse'),'BloodHorse can reach curated preview');
assert.ok(previewBody.items.some(x=>x.source==='Paulick Report'),'Paulick Report can reach curated preview');
assert.ok(previewBody.items.some(x=>x.source==='Ocala Breeders’ Sales'),'OBS can reach curated preview');
assert.ok(previewBody.items.some(x=>x.source==="America's Best Racing"),'ABR can reach curated preview');
assert.ok(previewBody.items.every(x=>x.editorial_score>=62),'Preview emits only editorially relevant items');
assert.equal((await handlePreviewRacingWire(new Request('https://railandryeracing.com/api/preview/racing-wire-test',{method:'POST'}),env,previewFetch)).status,405);

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

const irrelevantHeadlines=[
 'Breeders Cup Classic 2026: Can Forever Young Win Again? Picks',
 "How to Watch the 2026 Breeders' Cup Schedule, Date, Field Odds, and Expert Analysis",
 "Breeders' Cup TV Schedule Today: Post Times, Favorites and How to Bet",
 "Breeders' Cup Dirt Mile History: Winners, Losers, Betting, Odds"
];
for(const title of irrelevantHeadlines){
 const assessment=scoreRacingWireItem({title,source:'US Racing',published_at:date,category:'Stakes'});
 assert.equal(assessment.reject,true,'Service/betting content is hard rejected: '+title);
}
assert.ok(scoreRacingWireItem({
 title:'Defiantly Rules Out Of Melbourne Cup; Kizlyar Draws In',source:'Thoroughbred Daily News',
 category:'Stakes',published_at:date
}).score>=80,'Material major-race availability news ranks highly');
assert.ok(scoreRacingWireItem({
 title:"Breeders' Cup 2026 Scratches: Magnitude, Splendora Out",source:'US Racing',
 category:'Stakes',published_at:date
}).score>=80,'Major-race scratches rank highly');
assert.ok(scoreRacingWireItem({
 title:'Sun Goddess Completes Group 1 Four-Timer on Breeders Cup Friday for Record-Breaking O’Brien',
 source:'Thoroughbred Daily News',category:'Stakes',published_at:date
}).score>=70,'Major result/achievement remains relevant');
assert.ok(scoreRacingWireItem({
 title:'Attendance Up, Handle Down On Future Stars Friday',source:'Thoroughbred Daily News',
 category:'Industry',published_at:date
}).score<62,'Routine attendance/handle story stays below feed threshold');

const floodTitles=[
 'Horse A scratched from Breeders Cup Classic',
 'Horse B injured before Breeders Cup Turf',
 'Champion Stallion C retires to stud',
 'Fasig Tipton yearling sells for $2 million at auction',
 'Trainer D suspended by racing commission',
 'Breeders Cup Distaff field set with post positions',
 'Jockey F earns 5000th career victory'
];
const sourceFlood=floodTitles.map((title,i)=>({
 title,url:'https://flood.example/'+i,source:'Flood Publisher',
 subject_kind:subjectKind(title),category:categorize(title),
 published_at:new Date(Date.parse(date)-i*60000).toISOString()
}));
assert.equal(curateRacingWireStories(sourceFlood,{threshold:62,maxItems:24,maxPerSource:4}).length,4,
 'Per-source cap prevents one publisher from dominating the wire');

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
assert.ok(!wirePage.includes('UPCOMING STAKES')&&!wirePage.includes('rrw-stake-row'),
 'Upcoming Stakes block is removed from the Racing Wire news page');
assert.ok(wirePage.includes('.workspace{display:block}'),
 'News feed uses the full content width after sidebar removal');
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
assert.ok(wirePage.includes("/assets/approved/racing-wire/badges/'+safe+'.png?v=5"),
 'Approved individual proof badges are the only runtime badge artwork source');
assert.ok(!wirePage.includes('badges.webp')&&!wirePage.includes('.badge-horse{background-position')&&!wirePage.includes('.badge-achievement{background-position'),
 'Old badge sprite and badge-specific sprite-position rules are removed');
for(const badge of ['horse','jockey','trainer','owner','stable','race','racetrack','breeding','sale','industry','regulatory','achievement']){
 const badgeAsset=readFileSync(new URL('./public/assets/approved/racing-wire/badges/'+badge+'.png',import.meta.url));
 assert.equal(badgeAsset.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Approved '+badge+' badge is a real PNG');
 assert.ok(badgeAsset.length>1000,'Approved '+badge+' badge is not truncated');
}
const breedingBadge=readFileSync(new URL('./public/assets/approved/racing-wire/badges/breeding.png',import.meta.url));
assert.ok(breedingBadge.length>10000,'Breeding DNA badge is the full approved artwork, not a tiny placeholder');
assert.ok(wirePage.includes("badges/'+safe+'.png?v=5"),'Badge cache version refreshed for DNA breeding badge');
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

import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {PREVIEW_LIVE_FEEDS,PREVIEW_DIAGNOSTIC_FEEDS,PREVIEW_OFFICIAL_NEWS_PAGES,handleRacingWire,handlePreviewRacingWire,handleAdminRacingWire,previewExternalItems,parseRacingRss,parseOfficialNewsPage,categorize,refreshRacingWire,testPreviewRssFeeds,groupRacingWireStories,curateRacingWireStories,scoreRacingWireItem,subjectKind,socialPreview} from './src/racing-wire.js';
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
 const bound=(args=[])=>({
   bind(...next){return bound(next)},
   all(){return {results:statement.all(...args)}},
   first(){return statement.get(...args)||null},
   run(){statement.run(...args);return {success:true}}
 });
 return bound();
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

const adminFeedFetch=async url=>{
 const feed=PREVIEW_LIVE_FEEDS.find(x=>x.url===url);
 if(!feed)return new Response('',{status:404});
 if(feed.id!=='tdn-all')return new Response('<rss><channel></channel></rss>',{status:200,headers:{'Content-Type':'application/rss+xml'}});
 const xml='<rss><channel><item><title>Breeders Cup Classic contender scratched after health concern</title><link>https://www.thoroughbreddailynews.com/story/editorial-test</link><category>Breeders Cup</category><pubDate>Sat, 31 Oct 2026 16:00:00 GMT</pubDate></item></channel></rss>';
 return new Response(xml,{status:200,headers:{'Content-Type':'application/rss+xml'}});
};
const adminUrl='https://railandryeracing.com/api/admin/racing-wire-editorial';
let adminWire=await handleAdminRacingWire(new Request(adminUrl),env,adminFeedFetch);
assert.equal(adminWire.status,200);
let adminWireBody=await adminWire.json();
const controlled=adminWireBody.items.find(x=>x.url==='https://www.thoroughbreddailynews.com/story/editorial-test');
assert.ok(controlled,'Admin Racing Wire lists current curated stories');
assert.ok(adminWireBody.categories.includes('Sales / Auctions'),'Admin Racing Wire exposes approved category choices');
const patchEditorial=async payload=>handleAdminRacingWire(new Request(adminUrl,{method:'PATCH',headers:{
 'Content-Type':'application/json','Origin':'https://railandryeracing.com','Sec-Fetch-Site':'same-origin'
},body:JSON.stringify(payload)}),env,adminFeedFetch);
adminWire=await patchEditorial({story_url:controlled.url,action:'top'});
adminWireBody=await adminWire.json();
assert.equal(adminWireBody.items.find(x=>x.url===controlled.url).editorial.placement,'top','Owner can pin a Top Story');
adminWire=await patchEditorial({story_url:controlled.url,action:'category',category:'Sales / Auctions'});
adminWireBody=await adminWire.json();
assert.equal(adminWireBody.items.find(x=>x.url===controlled.url).category,'Sales / Auctions','Owner category override is applied');
assert.equal(adminWireBody.items.find(x=>x.url===controlled.url).subject_kind,'sale','Category override also changes topic badge/filter');
adminWire=await patchEditorial({story_url:controlled.url,action:'hide'});
adminWireBody=await adminWire.json();
assert.equal(adminWireBody.items.find(x=>x.url===controlled.url).editorial.hidden,true,'Hidden story remains visible to admin for restoration');
const publicAfterHide=await handlePreviewRacingWire(new Request('https://railandryeracing.com/api/preview/racing-wire-5333548f0ffee31ba519b2470ffb'),env,adminFeedFetch);
assert.ok(!(await publicAfterHide.json()).items.some(x=>x.url===controlled.url),'Hidden story is removed from Page 8 preview');
adminWire=await patchEditorial({story_url:controlled.url,action:'restore'});
adminWireBody=await adminWire.json();
const restored=adminWireBody.items.find(x=>x.url===controlled.url);
assert.equal(restored.editorial.placement,'auto');
assert.equal(restored.editorial.category_override,null);
assert.equal(restored.editorial.hidden,false,'Restore automatic clears all story overrides');
assert.equal((await handleAdminRacingWire(new Request(adminUrl,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'}),env,adminFeedFetch)).status,403,'Editorial writes require same-origin requests');
assert.deepEqual(await refreshRacingWire(env),{checked:0,added:0},
 'No external feed requests are made without explicit publisher authorization');
assert.equal(categorize('Jockey loses mount'),'Jockeys');
assert.equal(categorize('Horse workout reported'),'Race-Day');
assert.equal(categorize('Yearling sale underway'),'Sales / Auctions');
const feed={name:'Authorized Publisher',host:'publisher.example'};
const rss='<rss><channel><item><title><![CDATA[Trainer &amp; Jockey updates]]></title>'+
 '<link>https://publisher.example/story/123</link><category>Breeders Cup</category><media:content url="https://publisher.example/images/story-123.jpg" medium="image"/><pubDate>Sat, 31 Oct 2026 12:00:00 GMT</pubDate></item>'+
 '<item><title>Bad URL</title><link>https://attacker.example/phishing</link><pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>';
const items=parseRacingRss(rss,feed);
assert.equal(items.length,1);
assert.equal(items[0].title,'Trainer & Jockey updates');
assert.equal(items[0].link,'https://publisher.example/story/123');
assert.equal(items[0].section,'Breeders Cup');
assert.equal(items[0].category,'Jockeys');
assert.equal(items[0].image_url,'https://publisher.example/images/story-123.jpg','Publisher-supplied RSS image URL is preserved without copying the image');
const badImage=parseRacingRss('<rss><item><title>Valid story</title><link>https://publisher.example/story/2</link><media:thumbnail url="https://attacker.example/stolen.jpg"/><pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate></item></rss>',feed);
assert.equal(badImage[0].image_url,'','Off-domain feed images are rejected');
const undatedBloodHorse=parseRacingRss('<rss><item><title>BloodHorse current headline</title><link>https://www.bloodhorse.com/horse-racing/articles/1/test</link></item></rss>',{name:'BloodHorse',host:'bloodhorse.com',allow_undated:true});
assert.equal(undatedBloodHorse.length,1,'BloodHorse latest-headline feed can be accepted without fabricating a publisher timestamp');
assert.equal(undatedBloodHorse[0].published_at,null);
assert.equal(undatedBloodHorse[0].undated,true);
assert.equal(categorize('Championship update','Breeders Cup'),'Stakes');
assert.equal(categorize("Ways and Means Blasts Home in Breeders’ Cup Filly and Mare Sprint"),'Stakes');
assert.equal(subjectKind("Ways and Means Blasts Home in Breeders’ Cup Filly and Mare Sprint",categorize("Ways and Means Blasts Home in Breeders’ Cup Filly and Mare Sprint")),'race');
assert.equal(categorize('Champion mare confirmed in foal to leading sire'),'Breeding');
assert.equal(categorize("OBS Grad Further Ado Up in Time in Breeders’ Cup Dirt Mile",'',"Ocala Breeders’ Sales"),'Sales / Auctions');
assert.equal(subjectKind("OBS Grad Further Ado Up in Time in Breeders’ Cup Dirt Mile",
  categorize("OBS Grad Further Ado Up in Time in Breeders’ Cup Dirt Mile",'',"Ocala Breeders’ Sales")),'sale');
assert.equal(categorize("Two-Day Breeders’ Cup Attendance Up, Handle Down Over 2025"),'Industry');
assert.equal(subjectKind("Two-Day Breeders’ Cup Attendance Up, Handle Down Over 2025",
  categorize("Two-Day Breeders’ Cup Attendance Up, Handle Down Over 2025")),'industry');
assert.equal(categorize("Breeders' Cup reports record attendance and wagering handle"),'Industry');
assert.equal(categorize("OBS graduate wins graded stakes",'',"Ocala Breeders’ Sales"),'Sales / Auctions');
assert.equal(categorize("Fasig-Tipton graduate captures Breeders' Cup race",'',"Fasig-Tipton"),'Sales / Auctions');
assert.equal(categorize("Breeders' Cup announces new host venue for 2028"),'Racetrack');
assert.equal(categorize("Champion retires to stud after Breeders' Cup campaign"),'Breeding');
assert.equal(categorize("Classic contender injured before Breeders' Cup"),'Horses');
assert.equal(categorize('Keeneland announces turf course rail setting and track surface update'),'Racetrack');
assert.notEqual(categorize('Champion filly moves to a new trainer'),'Racetrack','Generic movement language must not create a track classification');
assert.equal(subjectKind('Keeneland announces turf course rail setting and track surface update','Racetrack'),'racetrack');
assert.equal(categorize("Sovereignty Rules Breeders’ Cup Classic; Forever Young Denied"),'Stakes');
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
 'BloodHorse reports champion stallion breeding rights update',
 'Paulick Report covers trainer suspension ruling',
 'Daily Racing Form reports Grade 1 stakes winner',
 'NTRA announces Thoroughbred industry initiative',
 'TOBA honors leading Thoroughbred owner at awards',
 'Tattersalls yearling tops major bloodstock sale',
 'National HBPA issues Thoroughbred industry statement',
 'Fair Grounds announces Louisiana Derby stakes schedule',
 'Remington Park reports Thoroughbred stakes result',
 'Laurel Park announces Maryland Thoroughbred racing operations update'
]
assert.ok(!PREVIEW_LIVE_FEEDS.some(feed=>/us racing|usracing/i.test(feed.name+' '+feed.url)),'Wagering-focused US Racing is excluded at the source level');
assert.ok(![...PREVIEW_LIVE_FEEDS,...PREVIEW_DIAGNOSTIC_FEEDS].some(feed=>/past the wire|pastthewire/i.test(feed.name+' '+feed.url)),'Past The Wire is excluded at the source level as a direct competitor');
assert.equal(scoreRacingWireItem({title:'Best bets and wagering tips for Saturday stakes',source:'Editorial Outlet'}).reject,true,'Betting/wagering editorial is rejected even from an otherwise allowed publication');
assert.equal(scoreRacingWireItem({title:'Standardbred champion wins harness stakes',source:'Editorial Outlet'}).reject,true,'Harness/Standardbred coverage is excluded');
assert.equal(scoreRacingWireItem({title:'National Hunt star wins steeplechase feature',source:'Editorial Outlet'}).reject,true,'Steeplechase/National Hunt coverage is excluded');
const previewFeedCount=PREVIEW_LIVE_FEEDS.length;
const diagnosticFeedCount=PREVIEW_DIAGNOSTIC_FEEDS.length;
assert.equal(previewFeedCount,10,'Only approved non-competing RSS sources participate in the live private preview');
assert.equal(diagnosticFeedCount,16,'Health diagnostics retry sixteen approved non-competing Thoroughbred source candidates');
assert.ok(['bloodhorse','tattersalls','fair-grounds','laurel'].every(id=>PREVIEW_LIVE_FEEDS.some(feed=>feed.id===id)),'Live RSS pool includes confirmed newsroom, sales and track sources');
assert.ok(['paulick','drf-headlines','ntra','toba','national-hbpa','remington'].every(id=>PREVIEW_DIAGNOSTIC_FEEDS.some(feed=>feed.id===id&&!PREVIEW_LIVE_FEEDS.some(live=>live.id===id))),'Blocked or empty RSS sources stay in diagnostics without slowing Page 8');
assert.deepEqual(PREVIEW_OFFICIAL_NEWS_PAGES.map(x=>x.id),['hisa','hiwu','breeders-cup','fasig-tipton','keeneland','churchill-downs','santa-anita','del-mar','gulfstream'],'Approved first-party Thoroughbred newsrooms use official-page adapters instead of fake RSS');
assert.ok(PREVIEW_LIVE_FEEDS.filter(feed=>feed.require_racing_context).every(feed=>['fair-grounds','laurel'].includes(feed.id)),'Mixed-use live track feeds require explicit racing context');
const officialFixtureFor=source=>{
 const prefix=source.path_prefix||'/news';
 return '<html><body><a href="'+prefix+'/regulatory-update"><article><div>October 31, 2026</div><h3>Official Thoroughbred regulatory update</h3></article></a></body></html>';
};
assert.equal(parseOfficialNewsPage(officialFixtureFor({path_prefix:'/news'}),{name:'HISA',host:'hisaus.org',url:'https://www.hisaus.org/news',path_prefix:'/news'}).length,1,'Official news-page adapter extracts only dated headline/link metadata');
assert.equal(parseOfficialNewsPage(officialFixtureFor({path_prefix:'/media/news'}),{name:'Keeneland',host:'keeneland.com',url:'https://www.keeneland.com/media/news',path_prefix:'/media/news'}).length,1,'Official news-page adapter supports nested newsroom paths');
const previewFeedFixtures=Object.fromEntries(PREVIEW_DIAGNOSTIC_FEEDS.map((feed,i)=>{
 const host=(feed.link_hosts?.[0]||feed.host);
 return [feed.url,{host,title:fixtureTitles[i],link:'https://www.'+host+'/rr-preview-story-'+(i+1)}];
}));
let diagnosticFetches=0;
const previewFetch=async url=>{
 diagnosticFetches++;
 const official=PREVIEW_OFFICIAL_NEWS_PAGES.find(source=>source.url===String(url));
 if(official)return new Response(officialFixtureFor(official),{status:200,headers:{'Content-Type':'text/html'}});
 const fixture=previewFeedFixtures[String(url)];
 assert.ok(fixture,'Only allowlisted Racing Wire endpoints are requested: '+url);
 const xml='<rss><channel><item><title>'+fixture.title+'</title><link>'+fixture.link+'</link>'+
  '<pubDate>Sat, 31 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>';
 return new Response(xml,{status:200,headers:{'Content-Type':'application/rss+xml'}});
};
const diagnostic=await testPreviewRssFeeds(previewFetch);
assert.equal(diagnosticFetches,diagnosticFeedCount+PREVIEW_OFFICIAL_NEWS_PAGES.length,'Diagnostics exercise every RSS candidate plus every approved official newsroom');
assert.equal(diagnostic.diagnostic_only,true);
assert.equal(diagnostic.results.length,diagnosticFeedCount+PREVIEW_OFFICIAL_NEWS_PAGES.length);
assert.ok(diagnostic.results.every(x=>x.reachable&&x.http_status===200&&x.parsed_count===1));
assert.equal(diagnostic.results.filter(x=>x.source_type==='official-page').length,PREVIEW_OFFICIAL_NEWS_PAGES.length,'Official-page health entries are distinguished from RSS');
assert.ok(diagnostic.results.every(x=>x.newest_published_at==='2026-10-31T12:00:00.000Z'));
assert.ok(diagnostic.results.every(x=>!('title' in x)&&!('items' in x)),
 'Diagnostic reports connectivity/counts only and does not republish third-party headlines');

diagnosticFetches=0;
const previewExternal=await previewExternalItems(previewFetch);
assert.equal(diagnosticFetches,previewFeedCount+PREVIEW_OFFICIAL_NEWS_PAGES.length,'Preview aggregator checks live RSS plus all approved official newsrooms');
assert.equal(previewExternal.items.length,previewFeedCount+PREVIEW_OFFICIAL_NEWS_PAGES.length);
assert.equal(previewExternal.sources.filter(x=>x.parsed_count===1).length,previewFeedCount+PREVIEW_OFFICIAL_NEWS_PAGES.length);
assert.ok(previewExternal.items.every(x=>x.preview_external===true&&x.summary===''&&!x.original));

diagnosticFetches=0;
const previewResponse=await handlePreviewRacingWire(new Request('https://railandryeracing.com/api/preview/racing-wire-test'),env,previewFetch);
assert.equal(previewResponse.status,200);
const previewBody=await previewResponse.json();
assert.equal(diagnosticFetches,previewFeedCount+PREVIEW_OFFICIAL_NEWS_PAGES.length);
assert.equal(previewBody.external_test_only,true);
assert.equal(previewBody.source_count,previewFeedCount+PREVIEW_OFFICIAL_NEWS_PAGES.length+1,'Rail & Rye Journal plus current live RSS and official-page sources');
assert.equal(previewBody.external_sources.length,previewFeedCount+PREVIEW_OFFICIAL_NEWS_PAGES.length);
assert.ok(previewBody.external_sources.every(x=>x.parsed_count===1),
 'All active preview feeds parse successfully before editorial filtering');
assert.ok(previewBody.items.length>=5&&previewBody.items.length<=previewFeedCount+1,
 'Editorial relevance/dedupe gate may suppress low-value or overlapping feed items');
assert.ok(previewBody.items.some(x=>x.source==='Ocala Breeders’ Sales'),'Correct OBS feed can reach curated preview');
assert.ok(previewBody.external_sources.some(x=>x.name==="America's Best Racing"&&x.parsed_count===1),
 'ABR feed health is verified independently of whether a synthetic headline clears editorial curation');
assert.ok(previewBody.external_sources.every(x=>'newest_published_at' in x),'Source diagnostics expose newest accepted item timestamps');
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
}).score<62,'Routine non-major attendance/handle story stays below feed threshold');
assert.ok(scoreRacingWireItem({
 title:"Two-Day Breeders’ Cup Attendance Up, Handle Down Over 2025",source:'Thoroughbred Daily News',
 category:'Industry',published_at:date
}).score>=70,'Breeders Cup attendance/handle metrics qualify as material industry news');

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
const curatedFlood=curateRacingWireStories(sourceFlood,{threshold:62,maxItems:24,maxPerSource:4});
assert.equal(curatedFlood.length,4,'Per-source cap prevents one publisher from dominating the wire');
assert.equal(curatedFlood.find(x=>x.title.includes('scratched'))?.type,'Scratch','Material event labels are specific, not duplicate category labels');
assert.equal(curatedFlood.find(x=>x.title.includes('injured'))?.type,'Health','Health developments receive a useful event label');

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
 assert.ok(wirePage.includes("'"+type+"'"), 'Approved subject filter and badge kind configured: '+type);
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
assert.ok(!wirePage.includes('UNLISTED DESIGN PREVIEW')&&!wirePage.includes('Test real RSS'),'Viewer-facing preview and diagnostic labels are removed');
assert.ok(!wirePage.includes('const samples=[')&&!wirePage.includes('DEMO ONLY')&&!wirePage.includes('not a real report')&&!wirePage.includes('Example:'),
 'All fake/demo stories are permanently removed from the preview code');
assert.ok(!wirePage.includes('showExamples')&&!wirePage.includes('showActual'),
 'Fake/live mode switch is removed; verified items are the only news stream');
assert.ok(wirePage.includes('source')&&wirePage.includes('title')&&wirePage.includes('summary'),'News cards support original link and faithful source content');
assert.ok(wirePage.includes("/api/preview/racing-wire-5333548f0ffee31ba519b2470ffb?refresh="),'Preview fetches only the unlisted API with cache-busting');
assert.ok(wirePage.includes('rail-rye-ivory-logo.png'),'Owner-approved Rail & Rye branding reused');

assert.ok(wirePage.includes('/assets/approved/saddlecloths/8.png'),'Racing Wire is numbered Page 8');
assert.ok(wirePage.includes("background-image:url('/assets/approved/racing-wire/hero-race.webp?v=4')"),
 'Racing Wire hero uses the same background-image rendering mechanism as the Journal');
assert.ok(!wirePage.includes('rrw-hero-media')&&!wirePage.includes('rrw-hero-image'),
 'No separate hero media layer competes with the shared production hero');
const heroAsset=readFileSync(new URL('./public/assets/approved/racing-wire/hero-race.webp',import.meta.url));
assert.equal(heroAsset.subarray(0,4).toString(),'RIFF','Hero asset has valid RIFF header');
assert.equal(heroAsset.subarray(8,12).toString(),'WEBP','Hero asset is a real WebP');
assert.ok(heroAsset.length>50000,'Hero asset is not a truncated placeholder');
assert.ok(!wirePage.includes('class="hero-art"'),'Temporary SVG hero artwork removed');
assert.ok(wirePage.includes('rr-page-saddle-kicker')&&wirePage.includes('rr-page-title')&&
 wirePage.includes('rr-page-rule')&&wirePage.includes('rr-page-description'),
 'Page 8 uses the same canonical numbered-page title treatment');
assert.ok(wirePage.includes('class="heritage-inner-hero rrw-wire-hero"')&&
 wirePage.includes('class="heritage-shell rr-racecards-hero-grid rrw-numbered-hero-grid"')&&
 wirePage.includes('class="rr-racecards-intro rr-page-intro rr-page-intro--grid"'),
 'Racing Wire uses the same numbered-page hero grid, left intro column and title geometry as pages 2–5');
assert.ok(wirePage.includes('/assets/rail-rye-pages.css?v=43'),
 'Racing Wire loads the current numbered-page geometry stylesheet used by Race Cards / Publications');
assert.ok(!wirePage.includes('rr-page-intro--hero'),
 'Old free-positioned hero intro is removed so the saddle chip cannot drift from pages 2–5');
assert.ok(!wirePage.includes('rr-single-screen-hero'),
 'Racing Wire does not use the single-screen flex mode that collapses when a live feed is present');
assert.ok(!wirePage.includes('rrw-hero-media')&&!wirePage.includes('rrw-hero-image')&&!wirePage.includes('rrw-wire-hero:before{z-index'),
 'Racing Wire has no custom media/overlay stacking path');
assert.ok(!wirePage.includes('min-height:var(--rr-shared-photo-hero-height,600px)'),
 'Shared stylesheet, not page-local CSS, owns hero height');
assert.ok(!wirePage.includes('rrw-masthead')&&!wirePage.includes('class="hero"')&&!wirePage.includes('hero-inner')&&!wirePage.includes('rrw-hero-shade'),
 'Old custom masthead, hero frame and competing overlay are completely removed');
assert.ok(wirePage.indexOf('<header class="heritage-header">')>wirePage.indexOf('class="heritage-inner-hero rrw-wire-hero"'),
 'Production header sits inside the hero image frame exactly like the other pages');
assert.ok(wirePage.includes('The Latest from the Backstretch.'),'Approved Racing Wire title is present');
assert.ok(wirePage.includes('<main class="wrap heritage-shell">'),'News body uses the same production shell geometry as the numbered pages');
assert.ok(wirePage.includes('id="allNews"')&&wirePage.includes('aria-pressed="true">All News</button>'),'All News has an explicit filter control');
assert.ok(wirePage.includes('id="leadSection"')&&wirePage.includes('Top Story'),'High-value stories have a lead-story presentation');
assert.ok(wirePage.includes('id="secondarySection"')&&wirePage.includes('More to Know'),'Racing Wire has a secondary visual-story tier beneath the lead story');
assert.ok(wirePage.includes("x.published_at_estimated?'Recent':labelTime(x.published_at)"),'Undated publisher headlines are labeled Recent instead of receiving a fabricated time');
assert.ok(wirePage.includes("x.editorial?.placement==='top'")&&wirePage.includes("x.editorial?.placement==='more'"),'Page 8 honors owner Top Story and More to Know overrides');
assert.ok(wirePage.includes(".slice(0,3)")&&wirePage.includes("secondary-story"),'Secondary tier promotes at most three image-backed stories');
assert.ok(wirePage.includes("storyCard(x,false,false)"),'Stories below the promoted tier return to compact badge cards');
assert.ok(!wirePage.includes('function priorityFor(x)')&&!wirePage.includes('wire-urgent')&&!wirePage.includes('priority-label'),'Urgency experiment is fully removed from the compact wire');
assert.ok(wirePage.includes('function storyVisual(')&&wirePage.includes('x.image_url')&&wirePage.includes("className='story-media'"),'Story cards can render publisher-supplied RSS photography');
assert.ok(wirePage.includes('media.replaceWith(icon(x.subject_kind))'),'Approved category badge remains the fallback when an external image fails');
assert.ok(wirePage.includes("img.referrerPolicy='no-referrer'"),'External feed images do not receive the private preview URL as referrer');
assert.ok(!wirePage.includes('Open the original source for the full update.'),'External stories never repeat generic filler summaries');
assert.ok(!wirePage.includes('const actionMap='),'Generic duplicate category pills are removed');
assert.ok(wirePage.includes('if(x.type){'),'Only meaningful event labels create a story pill');
assert.ok(wirePage.includes('.item .emblem{width:88px;height:88px'),
 'News-card badges are enlarged on desktop');
assert.ok(!wirePage.includes('const shapes={')&&!wirePage.includes("el.innerHTML='<svg"),
 'Temporary inline SVG badge system is completely removed');
assert.ok(wirePage.includes("/assets/approved/racing-wire/badges/'+safe+'.png?v=10"),
 'All twelve badges, including breeding, use the same approved PNG rendering path');
assert.ok(!wirePage.includes('breeding-dna-v2.svg')&&!wirePage.includes("kind==='breeding'"),
 'No custom breeding badge renderer or replacement SVG can override the approved family');
assert.ok(!wirePage.includes('badges.webp')&&!wirePage.includes('.badge-horse{background-position')&&!wirePage.includes('.badge-achievement{background-position'),
 'Old badge sprite and badge-specific sprite-position rules are removed');
const approvedBadgeFiles=['achievement.png','breeding.png','horse.png','industry.png','jockey.png','owner.png','race.png','racetrack.png','regulatory.png','sale.png','stable.png','trainer.png'];
const badgeDirectory=readdirSync(new URL('./public/assets/approved/racing-wire/badges/',import.meta.url)).sort();
assert.deepEqual(badgeDirectory,approvedBadgeFiles,
 'Badge directory contains exactly the 12 approved PNGs and no legacy/sprite/SVG assets');
for(const badge of ['horse','jockey','trainer','owner','stable','race','racetrack','breeding','sale','industry','regulatory','achievement']){
 const badgeAsset=readFileSync(new URL('./public/assets/approved/racing-wire/badges/'+badge+'.png',import.meta.url));
 assert.equal(badgeAsset.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Approved '+badge+' badge is a real PNG');
 assert.ok(badgeAsset.length>8000,'Approved '+badge+' badge is full-resolution artwork from the approved master set');
}
const breedingBadge=readFileSync(new URL('./public/assets/approved/racing-wire/badges/breeding.png',import.meta.url));
assert.equal(breedingBadge.subarray(0,8).toString('hex'),'89504e470d0a1a0a',
 'Canonical breeding badge is a real PNG');
assert.ok(breedingBadge.length>8000,
 'Canonical breeding PNG is full-resolution family artwork');
assert.ok(wirePage.includes('.more[hidden]{display:none!important}'),
 'Load-more cannot appear when there are zero verified stories');
assert.ok(wirePage.includes('setInterval(()=>{if(!document.hidden)loadVerified()},180000)'),
 'Racing Wire auto-refreshes every three minutes while visible');
assert.ok(wirePage.includes("document.addEventListener('visibilitychange'"),
 'Returning to the Racing Wire tab forces a fresh update');
assert.ok(wirePage.includes("?refresh='+Date.now()"),
 'Each refresh uses a cache-busting API request');
assert.ok(wirePage.includes("function dayLabel(iso)")&&wirePage.includes("return 'Today'")&&wirePage.includes("return 'Yesterday'"),
 'Wire groups the chronological feed into scannable day sections');


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
assert.ok(!previewHeader.includes('>The Racing Wire</a>'),'Unlisted preview does not add a public Racing Wire navigation pill');
assert.ok(previewHeader.includes('href="/our-approach/"'),'Our Approach is included in the shared navigation');
assert.equal((previewHeader.match(/class="heritage-nav-pill"/g)||[]).length,5,'Desktop header has the five approved public navigation pills');
assert.ok(wirePage.includes('/assets/rail-rye-core.css?v=') &&
 wirePage.includes('/assets/rail-rye-components.css?v=') &&
 wirePage.includes('/assets/rail-rye-pages.css?v='),'Header/footer use actual versioned site stylesheets');
const normalizedPreviewHeader=previewHeader
 .replace('<a class="heritage-nav-pill" href="/journal/">The Journal</a>', '<a class="heritage-nav-pill" href="/journal/" aria-current="page">The Journal</a>')
 .replace('<a href="/journal/">The Journal</a>', '<a href="/journal/" aria-current="page">The Journal</a>');
assert.equal(normalizedPreviewHeader,journalHeader,'Header markup/layout exactly matches canonical Journal aside from current-page semantics');
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
assert.match(html.headers.get('content-security-policy'),/thoroughbreddailynews\.com/,'Preview CSP permits trusted publisher-supplied feed images');
assert.match(await html.text(),/Rendered preview/);
assert.equal((await siteWorker.fetch(new Request('https://railandryeracing.com'+livePreviewPath,
 {method:'HEAD'}),{ASSETS:mockAssets},{})).status,200);

const router=readFileSync(new URL('./src/index.js',import.meta.url),'utf8');
assert.ok(router.includes("handleAdminRacingWire")&&router.includes("path===\"/api/admin/racing-wire-editorial\""),'Racing Wire editorial API is routed only through the authenticated admin namespace');
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
assert.ok(publisherDesk.includes('id="racing-wire-editor"')&&publisherDesk.includes('Pin Top Story')&&publisherDesk.includes('Promote to More to Know')&&publisherDesk.includes('Restore automatic'),'Publisher Desk exposes Racing Wire editorial controls');
assert.ok(publisherDesk.includes("/api/admin/racing-wire-editorial"),'Publisher Desk uses the authenticated Racing Wire editorial endpoint');
assert.ok(publisherDesk.includes('/preview/racing-wire-5333548f0ffee31ba519b2470ffb/'),'Publisher Desk offers owner a working shareable preview link');
assert.ok(!home.includes('racing-wire-5333548f0ffee31ba519b2470ffb'),'No public homepage preview link');
assert.ok(!wirePage.includes('OWNER ACCESS ONLY'),'Viewer sign-in is not required');
assert.equal(subjectKind('A stallion retires to stud','Breeding'),'breeding');
assert.equal(subjectKind('New sales figures','Sales / Auctions'),'sale');
assert.equal(subjectKind('Racing commission announces rule change','Regulatory'),'regulatory');

console.log('PASS Racing Wire: original published-only news, archive/draft secrecy, approved-only RSS source gate, safe publisher links, XML safety, categorization.');

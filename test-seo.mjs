import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from './src/index.js';
import {handleSitemap,serveJournalDocument} from './src/seo.js';

const read=path=>readFileSync(path,'utf8');
const origin='https://railandryeracing.com';
const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE journal_articles (id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,title TEXT NOT NULL,category TEXT NOT NULL,publish_date TEXT NOT NULL,excerpt TEXT NOT NULL DEFAULT '',body_text TEXT NOT NULL DEFAULT '',cover_key TEXT,cover_type TEXT,status TEXT NOT NULL DEFAULT 'draft',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
const insert=db.prepare("INSERT INTO journal_articles(id,slug,title,category,publish_date,excerpt,body_text,cover_key,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)");
insert.run('11111111-1111-4111-8111-111111111111','a-day-at-the-track-11111111','A Day at the Track','History','2026-10-31','The rail, the turn and a real story from the track.','First paragraph about the race.\n\nSecond paragraph on the horses.', 'journal-covers/1111/test.webp','published','2026-11-01 12:00:00');
insert.run('22222222-2222-4222-8222-222222222222','future-draft-22222222','Private Draft','Personal','2026-11-01','A private draft that is not public.','Draft text.','journal-covers/2222/test.webp','draft','2026-11-01 12:00:00');
insert.run('33333333-3333-4333-8333-333333333333','retired-story-33333333','Retired Story','Personal','2026-10-01','An archived story that is unavailable.','Archived text.',null,'archived','2026-10-02 12:00:00');
const wrap={prepare(sql){let params=[];const st={
 bind(...xs){params=xs;return st;},
 first(){return db.prepare(sql).get(...params);},
 all(){return {results:db.prepare(sql).all(...params)};},
 run(){const r=db.prepare(sql).run(...params);return {meta:{changes:r.changes}};}
};return st;}};
const template=read('public/journal/index.html');
const env={STORE_DB:wrap,ASSETS:{async fetch(){return new Response(template,{headers:{'Content-Type':'text/html; charset=utf-8'}});}}};
const sitemap=await handleSitemap(env,'GET');
assert.equal(sitemap.status,200,'Published index sitemap is available');
assert.match(sitemap.headers.get('Content-Type'),/application\/xml/);
const xml=await sitemap.text();
for(const route of ['/','/race-cards/','/publications/longshot-radar/','/publications/stable-notes/','/publications/target-list/','/store/','/our-approach/','/journal/','/journal/archive/','/policies/privacy.html','/policies/refunds.html','/policies/terms.html']){
 assert.ok(xml.includes('<loc>'+origin+route+'</loc>'),'Public canonical URL absent from sitemap: '+route);
}
assert.ok(xml.includes('<loc>'+origin+'/journal/a-day-at-the-track-11111111/</loc>'),'Published Journal story is discoverable');
assert.ok(xml.includes('<lastmod>2026-11-01</lastmod>'),'Actual article update date is included');
for(const secret of ['future-draft-22222222','retired-story-33333333','/admin/','/api/','/preview/','/store/success.html','/store/access.html','/store/recover.html']){
 assert.ok(!xml.includes(secret),'Private or sensitive page exposed in sitemap: '+secret);
}
assert.equal((await handleSitemap(env,'HEAD')).status,200);
assert.equal((await handleSitemap({},'GET')).status,503,'Unavailable database must not serve a misleading incomplete sitemap');
assert.equal((await handleSitemap(env,'POST')).status,405);
const live=await worker.fetch(new Request(origin+'/sitemap.xml'),env,{});
assert.equal(live.status,200,'Worker handles sitemap.xml before asset fallback');

const storyResponse=await worker.fetch(new Request(origin+'/journal/a-day-at-the-track-11111111/?utm_source=campaign'),env,{});
assert.equal(storyResponse.status,200);
const story=await storyResponse.text();
assert.ok(story.includes('<title>A Day at the Track | The Journal | Rail &amp; Rye Racing</title>'));
assert.ok(story.includes('<meta name="description" content="The rail, the turn and a real story from the track.">'));
assert.ok(story.includes('<link rel="canonical" href="'+origin+'/journal/a-day-at-the-track-11111111/">'));
assert.equal((story.match(/rel="canonical"/g)||[]).length,1,'Only one canonical on a Journal article');
assert.ok(story.includes('<h1 class="rr-journal-article-title">A Day at the Track</h1>'),'Article title is visible to crawlers without JS');
assert.ok(story.includes('First paragraph about the race.')&&story.includes('Second paragraph on the horses.'),'Body copy is crawlable without JS');
assert.ok(story.includes('rr-journal-article-view'),'Article visual route is enabled in server HTML');
assert.ok(story.includes('src="/media/journal/11111111-1111-4111-8111-111111111111"'),'Existing article image kept');
const jsonLD=JSON.parse(story.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);
assert.equal(jsonLD['@type'],'BlogPosting');
assert.equal(jsonLD.headline,'A Day at the Track');
assert.equal(jsonLD.publisher.name,'Rail & Rye Racing');
assert.equal(jsonLD.datePublished,'2026-10-31');

const archived=await worker.fetch(new Request(origin+'/journal/archive/'),env,{});
const archivedHTML=await archived.text();
assert.ok(archivedHTML.includes('<title>The Journal Archive | Rail &amp; Rye Racing</title>'));
assert.ok(archivedHTML.includes('<link rel="canonical" href="'+origin+'/journal/archive/">'));
assert.equal((archivedHTML.match(/rel="canonical"/g)||[]).length,1,'Archive must not duplicate the Journal landing canonical');
assert.equal((await worker.fetch(new Request(origin+'/journal/future-draft-22222222/'),env,{})).status,404,'Draft stories are not served as searchable pages');
assert.equal((await worker.fetch(new Request(origin+'/journal/retired-story-33333333/'),env,{})).status,404,'Archived stories are unavailable to search bots');

const attack={slug:'safe-story',title:'A <script>alert("hi")</script> & Rye',category:'Personal',
 publish_date:'2026-10-31',excerpt:'Quote " and <img src=x onerror=alert(1)>',
 body_text:'Paragraph <script>doBad()</script> & friends',cover_url:null};
const rendered=await serveJournalDocument(new Response(template),{article:attack});
const safe=await rendered.text();
assert.ok(!safe.includes('<script>doBad()</script>')&&!safe.includes('<img src=x onerror=alert(1)>'),'Story copy must be HTML-escaped');
assert.ok(safe.includes('&lt;script&gt;doBad()&lt;/script&gt;'),'Text remains readable without script execution');
assert.equal((safe.match(/rel="canonical"/g)||[]).length,1);
const ld=JSON.parse(safe.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);
assert.equal(ld.headline,attack.title);

const robots=read('public/robots.txt');
assert.ok(robots.includes('Sitemap: '+origin+'/sitemap.xml'));
assert.ok(robots.includes('Disallow: /admin/')&&robots.includes('Disallow: /api/'));
assert.ok(!robots.includes('Disallow: /preview/'),'Private page X-Robots-Tag must remain crawlable for exclusion');
const wrangler=read('wrangler.jsonc');
assert.ok(wrangler.includes('"/sitemap.xml"'),'Route Worker before static asset fallback');
const staticRoutes={
 'public/race-cards/index.html':'/race-cards/',
 'public/publications/longshot-radar/index.html':'/publications/longshot-radar/',
 'public/publications/stable-notes/index.html':'/publications/stable-notes/',
 'public/publications/target-list/index.html':'/publications/target-list/',
 'public/journal/index.html':'/journal/',
 'public/store/index.html':'/store/',
 'public/our-approach/index.html':'/our-approach/'
};
for(const [file,route] of Object.entries(staticRoutes)){
 const html=read(file);
 assert.ok(html.includes('<link rel="canonical" href="'+origin+route+'">'),'Canonical not present: '+file);
}
assert.ok(!read('public/store/index.html').includes('noindex,nofollow'),'The public catalog should be indexable');
for(const privatePage of ['public/store/access.html','public/store/recover.html','public/store/success.html','public/admin/index.html','public/preview/racing-wire-5333548f0ffee31ba519b2470ffb/index.html']){
 assert.ok(read(privatePage).includes('noindex'),'Private or transactional page missing noindex: '+privatePage);
}
assert.ok(read('public/index.html').includes('Rail & Rye Racing | Thoroughbred Racing Intelligence'),'Locked homepage metadata stays intact');
console.log('PASS SEO: public canonical pages, valid publication-only sitemap, robots rules, article SSR, JSON-LD, escape security, private content exclusion, and locked homepage.');

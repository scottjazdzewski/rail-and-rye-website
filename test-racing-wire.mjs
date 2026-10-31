import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleRacingWire,parseRacingRss,categorize,refreshRacingWire} from './src/racing-wire.js';
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
const env={STORE_DB};
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
console.log('PASS Racing Wire: original published-only news, archive/draft secrecy, approved-only RSS source gate, safe publisher links, XML safety, categorization.');

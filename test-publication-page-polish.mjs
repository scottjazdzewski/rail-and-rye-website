import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const catalog=read('public/store/index.html');
const pageJs=read('public/assets/rr-commerce-hub.js');
const css=read('public/assets/rail-rye-pages.css');
const hubCss=read('public/assets/rr-commerce-hub.css');
const journal=read('public/journal/index.html');
const expected=[
 ['public/race-cards/index.html','Race Cards','1'],
 ['public/publications/pick-tickets/index.html','Pick Tickets','2'],
 ['public/publications/longshot-radar/index.html','Longshot Radar','3'],
 ['public/publications/target-list/index.html','Target List','5']
];
for(const [path,category,chip] of expected){
 const page=read(path);
 assert.ok(page.includes('data-product-category="'+category+'"'));
 assert.ok(page.includes('/assets/approved/saddlecloths/'+chip+'.png'),'Preserve approved saddlecloth');
 assert.ok(page.includes('rr-commerce-hub.js?v=3'),'One shared purchase implementation');
 assert.ok(page.includes('rr-commerce-hub.css?v=3'));
 assert.ok(page.includes('rr-racecards-purchase-rail'));
 assert.ok(page.includes('id="rr-hub-date"'));
 assert.ok(!/script src="\/assets\/(?:race-cards-page-v1|publication-detail-v1)\.js/.test(page),'No old PDF purchase renderer');
 assert.ok(!/<a[^>]*href="\/race-cards\/"[^>]*>Race Cards<\/a>/.test(page),'No redundant nav pill');
}
assert.ok(catalog.includes('rr-commerce-hub.js?v=3'));
assert.ok(catalog.includes('rr-commerce-hub.css?v=3'));
assert.ok(pageJs.includes('"/api/products"'));
assert.ok(pageJs.includes('"/api/product-tabs/library"'));
assert.ok(pageJs.includes('"/api/checkout"'));
assert.ok(pageJs.includes('"/my-products/?category="'));
assert.ok(hubCss.includes('linear-gradient(145deg,#0b2637f5,#061d2df5)'));
assert.ok(!read('public/publications/longshot-radar/index.html').includes('morning-line odds'));
assert.ok(journal.includes("if(returnLink){returnLink.href='/journal/';"),
  'Page 9 provides a clear return to the Page 2 Journal');
assert.ok(journal.includes('rr-journal-archive-view'), 'Archive keeps its unique Page 9 route treatment');
assert.ok(css.includes('Page 9 mobile archive: content, not the viewport'),'Mobile archive uses a dedicated footer-flow fix');
assert.ok(css.includes('body.heritage-home.heritage-journal-page.rr-journal-archive-view>.heritage-inner-hero{'),'Mobile archive content-height applies exclusively to Page 9');
assert.ok(css.includes('flex:0 0 auto!important;min-height:max-content;height:auto;'),'The archive grid expands naturally for any story count');
assert.ok(css.includes('body.heritage-home.heritage-journal-page.rr-journal-archive-view>.heritage-footer{'),'Footer is positioned after archive content');
assert.ok(css.includes('position:relative;z-index:1;flex:0 0 auto;'),'Footer no longer sits beneath the growing archive rail');

assert.ok(journal.includes("if(archiveRoute){"), 'Archive counts are conditional, avoiding Page 2 changes');
assert.ok(journal.includes('/assets/approved/saddlecloths/9.png'), 'Keep Page 9 numbered saddlecloth');
assert.ok(/rail-rye-pages\.css\?v=\d+/.test(journal), 'Journal landing, archive and articles load updated shared stylesheet');
assert.ok(css.includes('body.heritage-journal-page.rr-journal-archive-view .rr-journal-archive-pill'),
  'Page 9 archive return link is visible, without changing Page 2');
for(const code of [pageJs,
  journal.split('<script>').slice(-1)[0].split('</script>')[0]])new Function(code);
const home=read('public/index.html');
assert.ok(home.includes('The Science of Racing.'), 'Homepage remains approved');
console.log('PASS Pages 3–5 and 9: individual editions, shared chip/hero, accurate copy, archive navigation, mobile rules, clean JS.');

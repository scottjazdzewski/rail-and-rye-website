import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const catalog=read('public/store/index.html');
const pageJs=read('public/assets/publication-detail-v1.js');
const css=read('public/assets/rail-rye-pages.css');
const journal=read('public/journal/index.html');
const expected=[
 ['longshot-radar','Longshot Radar','3'],
 ['stable-notes','Stable Notes','4'],
 ['target-list','Target List','5']
];
for(const [slug,category,chip] of expected){
 const page=read('public/publications/'+slug+'/index.html');
 assert.ok(page.includes('data-publication-category="'+category+'"'));
 assert.ok(page.includes('/assets/approved/saddlecloths/'+chip+'.png'), 'Preserve approved saddlecloth '+chip);
 assert.ok(page.includes('id="rr-pub-recent"'),category+' needs recent-edition links');
 assert.ok(page.includes('publication-detail-v1.js?v=6'), 'New linked-edition script not cache-stale');
 assert.ok(page.includes('rail-rye-pages.css?v=43'), 'New scoped layout not cache-stale');
 assert.ok(page.includes('class="rr-racecards-purchase-rail"'), 'Keep the approved hero rail');
 assert.ok(page.includes('href="/store/?category='+category.replaceAll(' ','%20')+'"'), 'Keep category browse link');
}
assert.ok(!read('public/publications/longshot-radar/index.html').includes('morning-line odds'),
  'Longshot copy must not incorrectly present morning-line odds as the model input');
assert.ok(pageJs.includes("editionHref=p=>'/store/?category='+encodeURIComponent(category)+'#edition-'+encodeURIComponent(p.id)"),
  'Each edition must point to its product in the Publication Desk');
assert.ok(pageJs.includes('renderRecent(products)'), 'Category hero rail must show recent editions');
assert.ok(pageJs.includes('products.slice(1,5)'), 'Do not repeat the latest product; show a handful only');
assert.ok(pageJs.includes("editionLink.className='rr-pub-edition-overlay'"),
  'Latest glass card must have a clickable surface separate from purchase');
assert.ok(pageJs.includes('makePurchaseButton(p,data,onError)'),
  'Keep existing Stripe/free-PDF purchase behavior');
assert.ok(catalog.includes("card.id='edition-'+p.id"), 'Store must anchor individual product IDs');
assert.ok(catalog.includes("location.hash.match(/^#edition-[0-9a-f-]{36}$/i)"),
  'Store must focus an edition only after asynchronous inventory loads');
assert.ok(css.includes('body.heritage-publication-page .rr-pub-recent-link'), 'Responsive recent edition styles');
assert.ok(css.includes('body.heritage-publication-page .rr-pub-edition-overlay'), 'Card link overlay styles');
assert.ok(journal.includes("if(returnLink){returnLink.href='/journal/';"),
  'Page 9 provides a clear return to the Page 2 Journal');
assert.ok(journal.includes('rr-journal-archive-view'), 'Archive keeps its unique Page 9 route treatment');
assert.ok(journal.includes("if(archiveRoute){"), 'Archive counts are conditional, avoiding Page 2 changes');
assert.ok(journal.includes('/assets/approved/saddlecloths/9.png'), 'Keep Page 9 numbered saddlecloth');
assert.ok(journal.includes('rail-rye-pages.css?v=44'), 'Journal landing, archive and articles load updated shared stylesheet');
assert.ok(css.includes('body.heritage-journal-page.rr-journal-archive-view .rr-journal-archive-pill'),
  'Page 9 archive return link is visible, without changing Page 2');
for(const code of [pageJs,catalog.split('<script>').slice(-1)[0].split('</script>')[0],
  journal.split('<script>').slice(-1)[0].split('</script>')[0]])new Function(code);
const home=read('public/index.html');
assert.ok(home.includes('The Science of Racing.'), 'Homepage remains approved');
console.log('PASS Pages 3–5 and 9: individual editions, shared chip/hero, accurate copy, archive navigation, mobile rules, clean JS.');

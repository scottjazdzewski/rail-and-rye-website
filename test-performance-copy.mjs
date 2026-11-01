import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const home=read('public/index.html');
const pages=[
 ['public/index.html','/assets/approved/home/hero-dust-charged-finish.jpg'],
 ['public/race-cards/index.html','/assets/approved/race-cards/hero.webp'],
 ['public/publications/longshot-radar/index.html','/assets/approved/publications/longshot-hero.jpg'],
 ['public/publications/stable-notes/index.html','/assets/approved/publications/stable-hero.jpg'],
 ['public/publications/target-list/index.html','/assets/approved/publications/target-hero.jpg'],
 ['public/our-approach/index.html','/assets/approved/our-approach/hero-number-2-finish.webp'],
 ['public/store/index.html','/assets/approved/publication-desk/hero.webp']
];
for(const [path,asset] of pages){
  const html=read(path);
  assert.ok(html.includes('<link rel="preconnect" href="https://fonts.googleapis.com">'),path+' missing font provider preconnect');
  assert.ok(html.includes('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'),path+' missing font file preconnect');
  assert.ok(html.includes('<link rel="preload" as="image" href="'+asset+'" fetchpriority="high">'),path+' missing correct approved hero preload');
  assert.ok(existsSync('public'+asset),path+' points to a non-existent hero asset');
}
const journal=read('public/journal/index.html');
assert.ok(journal.includes('<link rel="preconnect" href="https://fonts.googleapis.com">'));
assert.ok(!journal.includes('<link rel="preload" as="image"'),'Shared Journal and archive template must not preload wrong hero art on article routes');
assert.ok(home.includes('Contenders the Market May Overlook'),'Longshot copy should identify candidates, not promise a model win');
assert.ok(home.includes('Horses Worth Following'),'Stable Notes should be about following noteworthy horses');
assert.ok(home.includes('When Favorites Face a Test'),'Target List describes favorite vulnerability');
for(const misleading of ['We’re Beating the Morning Line','Where Odds Meet Opportunity','The Backstretch Knows First']){
 assert.ok(!home.includes(misleading),'Misleading homepage taglines remain: '+misleading);
}
assert.ok(home.includes('<h1>The Science of Racing.<br><em>The Soul of the Sport.</em></h1>'),'Approved homepage hero is untouched');
const headers=read('public/_headers');
assert.ok(headers.includes('/assets/*\n  Cache-Control: public, max-age=86400'),'Public static assets must be cached for repeat visitors');
assert.ok(headers.includes('/favicon.png\n  Cache-Control: public, max-age=86400'),'Favicon should be cached');
assert.ok(!headers.includes('/api/*')&&!headers.includes('/admin/*')&&!headers.includes('/media/*'),'Never cache protected commerce, admin or purchased media');
const store=read('public/store/index.html');
assert.ok(store.includes('id="paymentBanner" role="status" aria-live="polite">Checking checkout availability…'),'Checkout cannot falsely announce testing during load');
assert.ok(!store.includes('<strong>TEST CHECKOUT ONLY.</strong>'),'Remove misleading hard-coded test checkout text');
assert.ok(store.includes("data.checkout_mode==='live'")&&store.includes("data.checkout_mode==='paused'"),'Real checkout mode still comes from the API');
assert.ok(store.includes("Checkout status unavailable. Please refresh or try again later."),'API failures must show a neutral but clear availability warning');
assert.ok(store.includes("data.checkout_ready"),'Do not weaken purchase-button readiness checks');
assert.ok(store.includes("fetch('/api/checkout'"),'Stripe checkout action is untouched');
for(const fragment of store.split('<script>').slice(1)){const js=fragment.split('</script>')[0];new Function(js);}
assert.ok(read('public/preview/racing-wire-5333548f0ffee31ba519b2470ffb/index.html').includes('noindex,nofollow,noarchive'),'Private Page 8 preview must remain private');
console.log('PASS performance and editorial copy: accurate approved product taglines, image priority, fonts, public-asset cache, correct Stripe mode, private routes, and script syntax.');

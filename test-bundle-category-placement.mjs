import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
const catalog=read('public/store/index.html');
const detail=read('public/assets/publication-detail-v1.js');
const race=read('public/assets/race-cards-page-v1.js');
const admin=read('public/admin/index.html');
assert.ok(catalog.includes("JSON.parse(c.dataset.categories||'[]').includes(visibleCategory)"),'Store uses all product categories');
assert.ok(detail.includes('p.categories.includes(category)'),'Three publication categories use all placements');
assert.ok(race.includes("p.categories.includes('Race Cards')"),'Race Cards considers bundle placement');
assert.ok(admin.includes('Appears in:'),'Admin shows each collection containing the bundle');
for(const category of ['longshot-radar','stable-notes','target-list']){
 assert.ok(read('public/publications/'+category+'/index.html').includes('publication-detail-v1.js?v=5'));
}
assert.ok(read('public/race-cards/index.html').includes('race-cards-page-v1.js?v=7'));
console.log('PASS category placement: four publication pages, store filter, bundle admin, cache refresh.');

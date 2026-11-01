import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const s=readFileSync('public/admin/index.html','utf8');
const css=s.split('<style>')[1]?.split('</style>')[0]||'';
assert.ok(css.includes('@media(min-width:901px)'), 'Desktop compact rules are defined');
assert.ok(css.includes('@media(min-width:1280px)'), 'Wide desktop keeps bundle editor and private library side by side');
assert.ok(css.includes('.rr-bundle-area{display:grid;grid-template-columns:'),
  'Bundle workspace must use real grid layout on wide desktop');
assert.ok(css.includes('.rr-private-library{grid-column:1;grid-row:3'),
  'Private PDF library should occupy the left column');
assert.ok(css.includes('.rr-bundle-editor{grid-column:2;grid-row:3'),
  'Bundle creation and selections should occupy the right column');
assert.ok(css.includes('#productList{max-height:520px;overflow-y:auto'),
  'Inventory must not lengthen the entire Publisher page');
assert.ok(css.includes('#assetInventory{max-height:240px;overflow-y:auto'),
  'Private PDF inventory should be contained on desktop');
assert.ok(css.includes('.article-body-input{min-height:265px}'),
  'Journal editing area should be tighter on desktop');
for(const section of ['Product editor','Publication inventory','Automatic product bundles','Bundle-only PDF library','Journal article editor']){
 assert.ok(s.includes(section),'Required functional section is missing: '+section);
}
for(const id of ['draftBtn','publishBtn','scheduleBtn','cancelScheduleBtn','bundleDraft','bundlePublish','bundleSchedule','bundleCancelSchedule','assetSave','assetPurge','articleDraft','articlePublish']){
 assert.ok(s.includes('id="'+id+'"'),'Required publishing button missing: '+id);
}
for(const [index,chunk] of s.split('<script>').slice(1).entries()){
 const script=chunk.split('</script>')[0];
 assert.ok(script,'Empty inline script '+index);
 new Function(script);
}
console.log('PASS compact Publisher desktop: wide-layout side by side, capped inventories, smaller form spacing, retained controls and valid JS.');

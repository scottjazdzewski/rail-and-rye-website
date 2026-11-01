import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const page=read('public/journal/index.html');
const css=read('public/assets/rail-rye-pages.css');
const api=read('src/journal.js');
const share=read('public/assets/share-v1.js');
const code=page.split('<script>').slice(1).map(chunk=>chunk.split('</script>')[0]).join('\n');
new Function(code);
assert.ok(page.includes('rail-rye-pages.css?v=50'),'New Journal stylesheet must bypass browser caches');
assert.ok(code.includes("byline.textContent='RAIL & RYE JOURNAL · '+readingMinutes(item.body_text)+' MIN READ'"),
 'Use a credited publication and data-derived reading time, not a fabricated author');
assert.ok(code.includes("Math.max(1,Math.ceil((String(bodyText||'').trim().match(/\\S+/g)||[]).length/220))"),
 'Reading time is calculated from original text at 220 words/minute');
assert.ok(page.includes('/assets/share-v1.js?v=2'),'Journal loads the shared publication share control');
assert.ok(code.includes("window.RRShare.button({title:item.title")&&code.includes("label:'Share story'"),'Article offers the shared Rail & Rye share control');
assert.ok(share.includes("status.setAttribute('aria-live','polite')"),'Shared copy outcome is announced accessibly');
assert.ok(share.includes("await navigator.clipboard.writeText(url)"),'Shared copy action requires actual clipboard success');
assert.ok(share.includes("status.textContent='Link copied.'"),'Shared copy success feedback present');
assert.ok(share.includes("status.textContent='Copy unavailable. Select the page address to share it.'"),'Shared copy failure does not claim success');
assert.ok(share.includes("['Email'")&&share.includes("['Facebook'")&&share.includes("['X'"),'Shared control offers email and social sharing');
assert.ok(share.includes("const url=absoluteUrl(options.url)")&&share.includes("if(url.origin!==window.location.origin)"),'Shared control canonicalizes Rail & Rye URLs without external tracker destinations');
assert.ok(code.includes("const related=document.createElement('section')"),'Related area is created by the article template');
assert.ok(code.includes("related.hidden=true"),'Recommendations are hidden pending confirmed published results');
assert.ok(code.includes("if(slugMatch&&activeArticle)renderRelated(articles,activeArticle)"),'Related recommendations only on story routes');
assert.ok(code.includes("article.slug!==current.slug"),'Never recommend the current story');
assert.ok(code.includes('slice(0,2)'),'Never show more than two related stories');
assert.ok(code.includes('section.hidden=true;return;'),'Hide unrelated filler if no alternative stories');
assert.ok(code.includes("img.src=story.cover_url"),'Use published cover thumbnails');
assert.ok(code.includes("mark.textContent='RAIL & RYE'"),'Use brand fallback where story image is unavailable');
assert.ok(code.includes('cards.append(card)'),'Cards linked to their own articles');
assert.ok(api.includes("WHERE status='published'"),'Public story list contains only published articles');
assert.ok(css.includes('rr-journal-article-copy{\n width:min(100%,740px);font-size:17px;line-height:1.82'),
 'Long-form desktop reading column must be 740px and 17px text');
assert.ok(css.includes('rr-journal-related-grid{\n display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'),
 'Use two editorial recommendations on desktop');
assert.ok(css.includes('grid-template-columns:minmax(0,1fr);gap:11px'),
 'Use stacked recommendations for phones');
assert.ok(css.includes('rr-journal-article-view .rr-journal-related'),
 'All new editorial design is scoped to story routes');
assert.ok(code.includes('image.src=item.cover_url;image.alt=item.title'),
 'Keep existing full-size article image');
assert.ok(code.includes("if(archiveRoute){"),'Archive remains a separate route');
console.log('PASS Journal editorial experience: reading width, byline/time, canonical share, published related stories, thumbnails, mobile layout, original cover.');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const page=read('public/journal/index.html');
const css=read('public/assets/rail-rye-pages.css');
const api=read('src/journal.js');
const code=page.split('<script>').slice(1).map(chunk=>chunk.split('</script>')[0]).join('\n');
new Function(code);
assert.ok(page.includes('rail-rye-pages.css?v=47'),'New Journal stylesheet must bypass browser caches');
assert.ok(code.includes("byline.textContent='RAIL & RYE JOURNAL · '+readingMinutes(item.body_text)+' MIN READ'"),
 'Use a credited publication and data-derived reading time, not a fabricated author');
assert.ok(code.includes("Math.max(1,Math.ceil((String(bodyText||'').trim().match(/\\S+/g)||[]).length/220))"),
 'Reading time is calculated from original text at 220 words/minute');
assert.ok(code.includes("shareBtn.textContent='Copy article link'"),'Article offers a share link');
assert.ok(code.includes("shareStatus.setAttribute('aria-live','polite')"),'Copy outcome is announced accessibly');
assert.ok(code.includes('await navigator.clipboard.writeText(articleUrl)'),'Clipboard copy requires actual success');
assert.ok(code.includes("shareStatus.textContent='Link copied'"),'Copy success feedback present');
assert.ok(code.includes("shareStatus.textContent='Copy unavailable — use the address bar'"),'Copy failure does not claim success');
assert.ok(code.includes("new URL(articleHref(item),window.location.origin).href"),'Share canonical URL without tracker query parameters');
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

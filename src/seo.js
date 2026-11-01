// SEO endpoints and search-visible Journal HTML. No CSS or page layout changes.
const ORIGIN = 'https://railandryeracing.com';
const INDEXABLE = ['/', '/race-cards/', '/publications/longshot-radar/',
  '/publications/stable-notes/', '/publications/target-list/', '/store/',
  '/our-approach/', '/journal/', '/journal/archive/',
  '/policies/privacy.html', '/policies/terms.html', '/policies/refunds.html'];
const htmlEscape = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const slugValid = slug => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug));
const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
const dateValue = row => {
  const newer=String(row.updated_at||'').slice(0,10);
  return dateValid(newer)&&newer>=String(row.publish_date||'')?newer:String(row.publish_date||'');
};
const responseText=(body,status,contentType)=>new Response(body,{status,headers:{
  'Content-Type':contentType,'X-Content-Type-Options':'nosniff',
  'Cache-Control':status===200?'public, max-age=300':'no-store'
}});
const canonical=path=>ORIGIN+path;

export async function handleSitemap(env,method='GET'){
  if(method!=='GET'&&method!=='HEAD')return responseText('Method not allowed',405,'text/plain; charset=utf-8');
  if(!env.STORE_DB)return responseText('Sitemap temporarily unavailable',503,'text/plain; charset=utf-8');
  try{
    const records=await env.STORE_DB.prepare("SELECT slug,publish_date,updated_at FROM journal_articles WHERE status='published' ORDER BY publish_date DESC,created_at DESC LIMIT 5000").all();
    const seen=new Set();
    const entries=INDEXABLE.map(path=>({url:canonical(path)}));
    for(const article of records.results||[]){
      if(!slugValid(article.slug)||seen.has(article.slug))continue;
      seen.add(article.slug);
      const lastmod=dateValue(article);
      entries.push({url:canonical('/journal/'+article.slug+'/'),lastmod:dateValid(lastmod)?lastmod:null});
    }
    const xml='<?xml version="1.0" encoding="UTF-8"?>\n'
      +'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      +entries.map(x=>'  <url><loc>'+htmlEscape(x.url)+'</loc>'
        +(x.lastmod?'<lastmod>'+htmlEscape(x.lastmod)+'</lastmod>':'')+'</url>').join('\n')
      +'\n</urlset>';
    return responseText(method==='HEAD'?null:xml,200,'application/xml; charset=utf-8');
  }catch(error){
    console.error('Journal sitemap listing failed',error);
    return responseText('Sitemap temporarily unavailable',503,'text/plain; charset=utf-8');
  }
}
function updateHead(html,title,description,path,article){
  html=html.replace(/<title>[^<]*<\/title>/,'<title>'+htmlEscape(title)+'</title>');
  html=html.replace(/<meta name="description" content="[^"]*">/,
    '<meta name="description" content="'+htmlEscape(description)+'">');
  const link='<link rel="canonical" href="'+htmlEscape(canonical(path))+'">';
  let structured='';
  let social='';
  if(article){
    const articleTitle=article.title+' | The Journal | Rail & Rye Racing';
    const articleDescription=article.excerpt||article.title;
    const articleUrl=canonical(path);
    const imagePath=article.cover_url?.startsWith('/media/journal/')
      ? article.cover_url : '/assets/approved/journal/hero.webp';
    const imageUrl=canonical(imagePath);
    const meta=(attribute,name,value)=>'<meta '+attribute+'="'+name+'" content="'+htmlEscape(value)+'">';
    social=[
      meta('property','og:type','article'),
      meta('property','og:site_name','Rail & Rye Racing'),
      meta('property','og:title',articleTitle),
      meta('property','og:description',articleDescription),
      meta('property','og:url',articleUrl),
      meta('property','og:image',imageUrl),
      meta('property','og:image:alt',article.title),
      meta('property','article:published_time',article.publish_date),
      meta('name','twitter:card','summary_large_image'),
      meta('name','twitter:title',articleTitle),
      meta('name','twitter:description',articleDescription),
      meta('name','twitter:image',imageUrl),
      meta('name','twitter:image:alt',article.title)
    ].join('');
    const obj={
      '@context':'https://schema.org','@type':'BlogPosting',
      headline:article.title,description:article.excerpt,
      mainEntityOfPage:articleUrl,datePublished:article.publish_date,
      author:{'@type':'Organization',name:'Rail & Rye Racing',url:ORIGIN},
      publisher:{'@type':'Organization',name:'Rail & Rye Racing',url:ORIGIN},
      image:imageUrl
    };
    structured='<script type="application/ld+json">'
      +JSON.stringify(obj).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')
      +'</script>';
  }
  // Archive and story routes replace the Journal landing canonical, never duplicate it.
  html=html.replace(/<link rel="canonical" href="[^"]*">/,'');
  return html.replace('</head>',link+social+structured+'</head>');
}
function bodyParagraphs(body){
  return String(body||'').split(/\n[ \t]*\n+/).map(p=>p.trim()).filter(Boolean)
    .map(p=>'<p>'+htmlEscape(p)+'</p>').join('');
}
function renderArticleMarkup(item){
  const date=htmlEscape(item.publish_date);
  const mins=Math.max(1,Math.ceil((String(item.body_text||'').trim().match(/\S+/g)||[]).length/220));
  const cover=item.cover_url?.startsWith('/media/journal/')?
    '<img class="rr-journal-article-image" src="'+htmlEscape(item.cover_url)+'" alt="'+htmlEscape(item.title)+'" loading="eager">':'';
  return '<article id="journalStory" class="rr-journal-detail" aria-live="polite">'
   +'<a class="rr-journal-back" href="/journal/archive/">← All stories</a>'
   +'<div class="rr-journal-story-meta"><span class="rr-journal-chip">'+date+'</span><span class="rr-journal-chip">'+htmlEscape(item.category)+'</span></div>'
   +'<div class="rr-journal-article-byline">RAIL &amp; RYE JOURNAL · '+mins+' MIN READ</div>'
   +'<h1 class="rr-journal-article-title">'+htmlEscape(item.title)+'</h1>'
   +'<p class="rr-journal-article-excerpt">'+htmlEscape(item.excerpt)+'</p>'
   +cover
   +'<div class="rr-journal-article-copy">'+bodyParagraphs(item.body_text)+'</div>'
   +'<nav class="rr-journal-article-return"><a href="/journal/archive/">← Return to all Journal stories</a></nav>'
   +'</article>';
}
function prerenderArticle(html,article){
  html=html.replace('rr-single-screen-hero"><div class="heritage-inner-hero"',
    'rr-single-screen-hero rr-journal-content-view rr-journal-article-view"><div class="heritage-inner-hero"');
  html=html.replace('<section id="journalArchive" aria-labelledby="journal-archive-title">',
    '<section id="journalArchive" aria-labelledby="journal-archive-title" hidden>');
  return html.replace('<article id="journalStory" class="rr-journal-detail" hidden aria-live="polite"></article>',renderArticleMarkup(article));
}
export async function serveJournalDocument(assetResponse,{article=null,archive=false}={}){
  if(!assetResponse.ok)return assetResponse;
  let html=await assetResponse.text();
  if(article){
    if(!slugValid(article.slug))return responseText('Story not found',404,'text/plain; charset=utf-8');
    const pathname='/journal/'+article.slug+'/';
    html=updateHead(html,article.title+' | The Journal | Rail & Rye Racing',article.excerpt||article.title,pathname,article);
    html=prerenderArticle(html,article);
  }else if(archive){
    html=updateHead(html,'The Journal Archive | Rail & Rye Racing',
      'Browse published Rail & Rye Journal stories, racing history and essays, newest first.','/journal/archive/');
  }
  const headers=new Headers(assetResponse.headers);
  headers.set('Content-Type','text/html; charset=utf-8');
  headers.set('Cache-Control','public, max-age=300');
  headers.set('X-Content-Type-Options','nosniff');
  return new Response(html,{status:assetResponse.status,headers});
}

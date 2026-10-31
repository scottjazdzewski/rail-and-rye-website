/* Rail & Rye Racing Wire: original editorial first, publisher-authorized feeds only.
 * A public RSS URL is not a republication license. Outside feeds remain OFF
 * until website/commercial syndication permission has been documented.
 * Never copy article bodies, publisher images or feed descriptions.
 */
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const FEEDS=Object.freeze([
  // Add only after express permission to republish headlines on commercial sites:
  // {id:'publisher',name:'Publisher',url:'https://example.org/feed/',
  //  host:'example.org',authorized:true}
]);
const MAX_FEED_BYTES=350000;
function decode(s){
  return String(s||'').replace(/^<!\[CDATA\[|\]\]>$/g,'')
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const x=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return x>0&&x<=0x10ffff?String.fromCodePoint(x):'';})
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[n.toLowerCase()]))
    .replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
}
function field(xml,tag){
  const m=new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i').exec(xml);
  return decode(m?.[1]||'');
}
function safeUrl(candidate,host){
  try{const u=new URL(candidate);if(u.protocol!=='https:'||u.username||u.password)return null;
    const h=u.hostname.toLowerCase();if(h!==host&&h!=='www.'+host)return null;
    u.hash='';return u.toString().slice(0,1900);}catch{return null;}
}
export function categorize(title,category=''){
  const s=(title+' '+category).toLowerCase();
  if(/jockey|rider|apprentice|irad ortiz|prat\b/.test(s))return 'Jockeys';
  if(/trainer|barn|stable|assistant trainer/.test(s))return 'Trainers';
  if(/scratch|entry|entries|post position|racing secretary|stewards|workout|track condition|race day/.test(s))return 'Race-Day';
  if(/breeding|stallion|sire|foal|stud fee|yearling|mare|auction|sale|keeneland november|fasig.tipton/.test(s))return 'Breeding';
  if(/stakes|derby|breeders.? cup|grade [i123]|\bg[123]\b|classic|preakness|belmont stakes/.test(s))return 'Stakes';
  if(/retire|horse|filly|colt|gelding|champion|injur/.test(s))return 'Horses';
  return 'Industry';
}
export function parseRacingRss(xml,feed){
  if(typeof xml!=='string'||xml.length>MAX_FEED_BYTES||/<!DOCTYPE|<!ENTITY/i.test(xml))return [];
  const chunks=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
  const results=[];
  for(const item of chunks.slice(0,35)){
    const title=field(item,'title').slice(0,240);
    const link=safeUrl(field(item,'link'),feed.host);
    const published=field(item,'pubDate')||field(item,'published')||field(item,'updated');
    const dt=new Date(published);
    if(!title||!link||!Number.isFinite(+dt)||dt.getTime()>Date.now()+3600000)continue;
    results.push({source:feed.name,title,link,published_at:dt.toISOString(),category:categorize(title)});
  }
  return results;
}
export async function refreshRacingWire(env){
  if(!env.STORE_DB||!FEEDS.some(f=>f.authorized))return {checked:0,added:0};
  let added=0,checked=0;
  for(const feed of FEEDS){
    if(!feed.authorized||!feed.id||!feed.host||!feed.url)continue;
    const exact=safeUrl(feed.url,feed.host);if(!exact||exact!==feed.url)continue;
    checked++;
    try{
      const response=await fetch(exact,{headers:{'Accept':'application/rss+xml,application/xml,text/xml',
        'User-Agent':'RailAndRyeRacingWire/1.0 (+https://railandryeracing.com/racing-wire/)'},
        signal:AbortSignal.timeout(9000)});
      if(!response.ok)continue;
      const len=Number(response.headers.get('content-length')||0);
      if(len>MAX_FEED_BYTES)continue;
      const xml=await response.text();if(xml.length>MAX_FEED_BYTES)continue;
      for(const item of parseRacingRss(xml,feed)){
        const r=await env.STORE_DB.prepare(
          'INSERT OR IGNORE INTO racing_wire_items(source,category,title,article_url,published_at) VALUES (?,?,?,?,?)'
        ).bind(item.source,item.category,item.title,item.link,item.published_at).run();
        added+=r.meta?.changes||0;
      }
    }catch(e){console.warn('Racing Wire feed temporarily unavailable',feed.id,String(e).slice(0,80));}
  }
  await env.STORE_DB.prepare("DELETE FROM racing_wire_items WHERE published_at<datetime('now','-45 days')").run();
  return {checked,added};
}
export async function handleRacingWire(request,env){
  if(request.method!=='GET')return reply({error:'Method not allowed'},405);
  if(!env.STORE_DB)return reply({error:'Racing Wire is temporarily unavailable'},503);
  let originals=[];
  try{
    const r=await env.STORE_DB.prepare(
      "SELECT title,slug,category,excerpt,publish_date FROM journal_articles WHERE status='published' ORDER BY publish_date DESC,created_at DESC LIMIT 120"
    ).all();
    originals=(r.results||[]).map(a=>({
      title:a.title.slice(0,240),url:'/journal/'+a.slug+'/',
      source:'Rail & Rye',category:categorize(a.title,a.category),
      published_at:a.publish_date+'T12:00:00Z',summary:a.excerpt.slice(0,260),original:true
    }));
  }catch(e){console.warn('Racing Wire journal unavailable',String(e).slice(0,90));}
  let syndicated=[];
  try{
    const r=await env.STORE_DB.prepare(
      'SELECT source,category,title,article_url,published_at FROM racing_wire_items ORDER BY published_at DESC LIMIT 200'
    ).all();
    const allowed=new Set(FEEDS.filter(f=>f.authorized).map(f=>f.name));
    syndicated=(r.results||[]).filter(a=>allowed.has(a.source)).map(a=>({
      title:a.title,url:a.article_url,source:a.source,category:a.category,
      published_at:a.published_at,original:false,summary:''
    }));
  }catch(e){console.warn('Racing Wire syndicated cache unavailable',String(e).slice(0,90));}
  const items=[...originals,...syndicated].filter(x=>Number.isFinite(Date.parse(x.published_at)))
    .sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at)).slice(0,150);
  return reply({items,source_count:FEEDS.filter(f=>f.authorized).length,
    headline_only:true,generated_at:new Date().toISOString()});
}

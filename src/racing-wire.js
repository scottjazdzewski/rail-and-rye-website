/* Rail & Rye Racing Wire: original editorial first, publisher-authorized feeds only.
 * A public RSS URL is not a republication license. Outside feeds remain OFF
 * until website/commercial syndication permission has been documented.
 * Never copy article bodies, publisher images or feed descriptions into Rail & Rye storage.
 * The private preview may render a publisher-supplied RSS image by its original HTTPS URL.
 */
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const FEEDS=Object.freeze([
  // Add only after express permission to republish headlines on commercial sites:
  // {id:'publisher',name:'Publisher',url:'https://example.org/feed/',
  //  host:'example.org',authorized:true}
]);
const MAX_FEED_BYTES=350000;
const MAX_OFFICIAL_PAGE_BYTES=650000;
const MAX_JSON_BYTES=250000;
const PREVIEW_MAX_ITEM_AGE_MS=48*3600000;
const EDITORIAL_CATEGORIES=Object.freeze(['Horses','Jockeys','Trainers','Owners','Stable','Stakes','Race-Day','Racetrack','Breeding','Sales / Auctions','Regulatory','Achievement','Industry']);
let editorialSchemaPromise=null;
async function ensureEditorialSchema(env){
  if(!env.STORE_DB)throw Error('Racing Wire database binding missing');
  if(!editorialSchemaPromise){
    editorialSchemaPromise=(async()=>{
      await env.STORE_DB.prepare("CREATE TABLE IF NOT EXISTS racing_wire_editorial (story_url TEXT PRIMARY KEY, hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)), placement TEXT NOT NULL DEFAULT 'auto' CHECK(placement IN ('auto','top','more')), category_override TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
      await env.STORE_DB.prepare("CREATE INDEX IF NOT EXISTS racing_wire_editorial_placement ON racing_wire_editorial(placement,updated_at DESC)").run();
    })().catch(error=>{editorialSchemaPromise=null;throw error;});
  }
  await editorialSchemaPromise;
}
const BROWSER_FEED_UA='Mozilla/5.0 (compatible; RailAndRyeRacingWire/1.0; +https://railandryeracing.com)';
export const PREVIEW_LIVE_FEEDS=Object.freeze([
  {id:'tdn-all',name:'Thoroughbred Daily News',url:'https://www.thoroughbreddailynews.com/feed/',host:'thoroughbreddailynews.com'},
  {id:'abr',name:"America's Best Racing",url:'https://www.americasbestracing.net/rss',host:'americasbestracing.net'},
  {id:'hrn',name:'Horse Racing Nation',url:'https://www.horseracingnation.com/rss/newsfeed.aspx',host:'horseracingnation.com'},
  {id:'racing-biz',name:'The Racing Biz',url:'https://www.theracingbiz.com/feed',host:'theracingbiz.com'},
  {id:'woodbine',name:'Woodbine',url:'https://woodbine.com/feed',host:'woodbine.com'},
  {id:'obs',name:'Ocala Breeders’ Sales',url:'https://obssales.com/feed/',host:'obssales.com'},
  {id:'bloodhorse',name:'BloodHorse',url:'https://www.bloodhorse.com/horse-racing/feeds/news/all-news',host:'bloodhorse.com',allow_undated:true},
  {id:'tattersalls',name:'Tattersalls',url:'https://www.tattersalls.com/feed/',host:'tattersalls.com'},
  {id:'fair-grounds',name:'Fair Grounds',url:'https://www.fairgroundsracecourse.com/feed/',host:'fairgroundsracecourse.com',require_racing_context:true},
  {id:'laurel',name:'Laurel Park',url:'https://www.laurelpark.com/feed/',host:'laurelpark.com',require_racing_context:true},
  {id:'churchill-downs',name:'Churchill Downs',url:'https://www.churchilldowns.com/horses/news/feed/',host:'churchilldowns.com',require_racing_context:true}
]);
const PREVIEW_RETRY_FEEDS=Object.freeze([
  {id:'ntra',name:'NTRA',url:'https://www.ntra.com/feed/',host:'ntra.com',candidate:true},
  {id:'national-hbpa',name:'National HBPA',url:'https://nationalhbpa.com/feed/',host:'nationalhbpa.com',candidate:true}
]);
export const PREVIEW_DIAGNOSTIC_FEEDS=Object.freeze([...PREVIEW_LIVE_FEEDS,...PREVIEW_RETRY_FEEDS]);
export const PREVIEW_LIVE_OFFICIAL_NEWS_PAGES=Object.freeze([
  {id:'hisa',name:'HISA',url:'https://www.hisaus.org/news',host:'hisaus.org',category:'Regulatory'},
  {id:'hiwu',name:'HIWU',url:'https://www.hiwu.org/news',host:'hiwu.org',category:'Regulatory'},
  {id:'keeneland',name:'Keeneland',url:'https://www.keeneland.com/media/news',host:'keeneland.com',path_prefix:'/media/news'},
  {id:'drf',name:'Daily Racing Form',url:'https://www.drf.com/news/all-news',host:'drf.com',path_prefix:'/news'},
  {id:'santa-anita',name:'Santa Anita',url:'https://www.santaanita.com/news/',host:'santaanita.com',path_prefix:'/news',adapter:'one-st'},
  {id:'del-mar',name:'Del Mar',url:'https://www.dmtc.com/media/news',host:'dmtc.com',path_prefix:'/media/news'},
  {id:'gulfstream',name:'Gulfstream Park',url:'https://www.gulfstreampark.com/news/',host:'gulfstreampark.com',path_prefix:'/news',adapter:'one-st'},
  {id:'remington',name:'Remington Park',url:'https://www.remingtonpark.com/press-releases/',host:'remingtonpark.com',path_prefix:'/press',require_racing_context:true},
  {id:'breeders-cup',name:"Breeders' Cup",url:'https://www.breederscup.com/news',host:'breederscup.com',path_prefix:'/news',adapter:'breeders-cup'},
  {id:'fasig-tipton',name:'Fasig-Tipton',url:'https://www.fasigtipton.com/archive/2026',host:'fasigtipton.com',category:'Sales / Auctions',adapter:'fasig'}
]);
const PREVIEW_RETRY_OFFICIAL_NEWS_PAGES=Object.freeze([
  {id:'paulick',name:'Paulick Report',url:'https://paulickreport.com/news',host:'paulickreport.com',path_prefix:'/news'}
]);
export const PREVIEW_OFFICIAL_NEWS_PAGES=Object.freeze([...PREVIEW_LIVE_OFFICIAL_NEWS_PAGES,...PREVIEW_RETRY_OFFICIAL_NEWS_PAGES]);
export const PREVIEW_LIVE_JSON_SOURCES=Object.freeze([
  {id:'toba',name:'TOBA',url:'https://toba.org/wp-json/wp/v2/posts?per_page=20&_fields=link,date,title,categories',host:'toba.org',category:'Industry'}
]);
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
function safeUrl(candidate,hosts){
  try{
    const u=new URL(candidate);if(u.protocol!=='https:'||u.username||u.password)return null;
    const allowed=(Array.isArray(hosts)?hosts:[hosts]).filter(Boolean).map(x=>String(x).toLowerCase());
    const h=u.hostname.toLowerCase();
    if(!allowed.some(host=>h===host||h==='www.'+host))return null;
    u.hash='';return u.toString().slice(0,1900);
  }catch{return null;}
}
function safeMediaUrl(candidate,feed){
  try{
    const u=new URL(decode(candidate));if(u.protocol!=='https:'||u.username||u.password)return null;
    const allowed=[feed?.host,...(Array.isArray(feed?.image_hosts)?feed.image_hosts:[])]
      .filter(Boolean).map(x=>String(x).toLowerCase().replace(/^www\./,''));
    const h=u.hostname.toLowerCase().replace(/^www\./,'');
    if(!allowed.some(host=>h===host||h.endsWith('.'+host)))return null;
    u.hash='';return u.toString().slice(0,1900);
  }catch{return null;}
}
function tagAttr(xml,tag,attr){
  const pattern="<"+tag+"\\b[^>]*\\b"+attr+"\\s*=\\s*[\"']([^\"']+)[\"'][^>]*>";
  const m=new RegExp(pattern,'i').exec(xml);
  return m?.[1]||'';
}
function feedImage(item,feed){
  const direct=[tagAttr(item,'media:content','url'),tagAttr(item,'media:thumbnail','url')];
  const enclosure=/<enclosure\b[^>]*>/i.exec(item)?.[0]||'';
  if(/\btype\s*=\s*["']image\//i.test(enclosure))direct.push(tagAttr(enclosure,'enclosure','url'));
  const body=/<(?:content:encoded|description)(?:\s[^>]*)?>([\s\S]*?)<\/(?:content:encoded|description)>/i.exec(item)?.[1]||'';
  direct.push(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(body)?.[1]||'');
  for(const candidate of direct){const safe=safeMediaUrl(candidate,feed);if(safe)return safe;}
  return '';
}
function previewHeadlineRelevant(title,section=''){
  const text=(String(title||'')+' '+String(section||'')).toLowerCase();
  if(/\b(best bets?|picks?|selections?|odds|free bets?|betting guide|wagering tips?|promo code|bonus offer|merch|merchandise|tickets? on sale|photo gallery|quiz|past performances?|free pps?|race of the day)\b/.test(text))return false;
  if(/\b(?:pick\s*[3-9]|rainbow\s*6|jackpot pool|mandatory payouts?|carryovers?|wager menu|bet minimums?|handicapping(?: analysis| picks| plays| tips)?|account wagering)\b/.test(text))return false;
  if(/\b(listen now|podcast episode|watch live|where to watch|tv schedule)\b/.test(text))return false;
  if(/\b(casino|slot(?:s| machine)?|video poker|free slot play|gaming promotion|jackpot)\b/.test(text))return false;
  if(/\b(harness|standardbred|steeplechase|steeplechaser|jump racing|national hunt|trotting|trotter|trotters|pacing|pacer|pacers|hambletonian)\b/.test(text))return false;
  if(/\b(meadowlands|yonkers raceway|woodbine mohawk|mohawk park)\b/.test(text))return false;
  return true;
}
function hasRacingContext(title,section=''){
  const text=(String(title||'')+' '+String(section||'')).toLowerCase();
  return /\b(thoroughbred|race|racing|racetrack|stakes|derby|oaks|jockey|trainer|horse|filly|colt|gelding|mare|stallion|yearling|foal|purse|meet|breeders.? cup|claiming|maiden|allowance|graded|grade [123i]|\bg[123]\b)\b/.test(text);
}

const NEWS_DATE_RE=/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4}\b/i;
const NEWS_NUMERIC_DATE_RE=/\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/20\d{2}\b/;
const OFFICIAL_NAV_TITLES=new Set(['news','press room','press releases','stable notes','stakes quotes','daily recaps','media guide','features','latest news','wagering','community impact','stakes advance','stakes recap','view more','read more']);
function regexEscape(value){return String(value||'').replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');}
function newsPathPrefix(source){
  const raw=String(source?.path_prefix||'/news').trim();
  return ('/'+raw.replace(/^\/+|\/+$/g,'')).replace(/\/{2,}/g,'/');
}
function absoluteNewsUrl(source,slug){
  try{
    const u=new URL(newsPathPrefix(source)+'/'+slug.replace(/^\/+/,''),source.url);
    return safeUrl(u.toString(),source.host);
  }catch{return null;}
}
function decodeHtmlText(value){
  return decode(String(value||'').replace(/<[^>]+>/g,' '));
}
function structuredMetaNearSlug(html,slug){
  const needles=['"slug":"'+slug+'"','\\"slug\\":\\"'+slug+'\\"'];
  for(const needle of needles){
    const pos=html.indexOf(needle);
    if(pos<0)continue;
    const before=html.slice(Math.max(0,pos-12000),pos+needle.length);
    const after=html.slice(pos,Math.min(html.length,pos+2200));
    const dateMatches=[...before.matchAll(/(?:\\?"(?:date|publishedAt|datePublished)\\?":\\?"([^"\\]+)\\?")/g)];
    const date=dateMatches.at(-1)?.[1]||'';
    const title=(/(?:\\?"title\\?":\\?"([^"\\]+)\\?")/.exec(after)||[])[1]||'';
    return {date,title:decode(title)};
  }
  return {date:'',title:''};
}
export function parseOfficialNewsPage(html,source){
  if(typeof html!=='string'||html.length>MAX_OFFICIAL_PAGE_BYTES)return [];
  const items=[],seen=new Set(),prefix=newsPathPrefix(source);
  const anchor=/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  for(const match of html.matchAll(anchor)){
    const rawHref=decode(match[2]).trim();
    let resolved;
    try{resolved=new URL(rawHref,source.url);}catch{continue;}
    const safe=safeUrl(resolved.toString(),source.host);
    if(!safe)continue;
    const pathname=resolved.pathname.replace(/\/{2,}/g,'/');
    if(pathname!==prefix&&!pathname.startsWith(prefix+'/'))continue;
    const slug=pathname.slice(prefix.length).replace(/^\/+|\/+$/g,'');
    if(!slug||seen.has(safe))continue;
    const body=match[4],attrs=(match[1]||'')+' '+(match[3]||'');
    const heading=/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(body)?.[1]||'';
    const titleAttr=/\btitle\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]||'';
    const aria=/\baria-label\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]||'';
    const rawAlt=/<img\b[^>]*\balt\s*=\s*["']([^"']+)["']/i.exec(body)?.[1]||'';
    const imageAlt=/^(?:featured image|article photo thumbnail|horses? running(?: on turf)?|image)$/i.test(decode(rawAlt))?'':rawAlt;
    const anchorText=decodeHtmlText(body);
    const meta=structuredMetaNearSlug(html,slug);
    const anchorStart=match.index||0;
    const nearby=decodeHtmlText(html.slice(Math.max(0,anchorStart-1700),Math.min(html.length,anchorStart+match[0].length+1700)));
    let title=decodeHtmlText(heading)||decode(titleAttr)||decode(aria)||meta.title||decode(imageAlt)||anchorText;
    title=title.replace(/^read (?:the )?(?:article|story)\s*/i,'')
      .replace(/^continue reading\s*[“"'‘]?/i,'').replace(/[”"'’]+$/,'').trim();
    const generic=title.toLowerCase().replace(/[.:]+$/,'').trim();
    if(!title||title.length<12||OFFICIAL_NAV_TITLES.has(generic))continue;
    let dateText=meta.date||nearby.match(NEWS_DATE_RE)?.[0]||nearby.match(NEWS_NUMERIC_DATE_RE)?.[0]||'';
    if(!dateText)continue;
    dateText=dateText.replace(/(\d{1,2})(?:st|nd|rd|th)(,\s+\d{4})/i,'$1$2');
    const dt=/^\d{4}-\d{2}-\d{2}/.test(dateText)?new Date(dateText):
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateText)?new Date(dateText+' 12:00:00 UTC'):
      new Date(dateText+' 12:00:00 UTC');
    if(!Number.isFinite(+dt))continue;
    seen.add(safe);
    const category=source.category||categorize(title,'',source.name);
    items.push({title:title.slice(0,240),url:safe,source:source.name,category,section:category,
      subject_kind:subjectKind(title,category),published_at:dt.toISOString(),published_date_only:true,
      summary:'',image_url:'',original:false,preview_external:true});
  }
  return items;
}
function parseNewsDateText(value){
  let dateText=String(value||'').trim().replace(/(\d{1,2})(?:st|nd|rd|th)(,\s+\d{4})/i,'$1$2');
  const dt=/^\d{4}-\d{2}-\d{2}/.test(dateText)?new Date(dateText):
    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateText)?new Date(dateText+' 12:00:00 UTC'):
    new Date(dateText+' 12:00:00 UTC');
  return Number.isFinite(+dt)?dt:null;
}
export function parseOneStNewsPage(html,source){
  if(typeof html!=='string'||html.length>MAX_OFFICIAL_PAGE_BYTES)return [];
  const items=[],seen=new Set(),cards=html.match(/<article\b[^>]*class=["'][^"']*tile-inner[^"']*["'][^>]*>[\s\S]*?<\/article>/gi)||[];
  for(const card of cards.slice(0,60)){
    const heading=/<h2\b[^>]*class=["'][^"']*post-title[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i.exec(card);
    const image=/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<img\b[^>]*alt=["']([^"']+)["']/i.exec(card);
    const rawHref=heading?.[1]||image?.[1]||'',title=decodeHtmlText(heading?.[2]||image?.[2]||'').slice(0,240);
    let resolved;try{resolved=new URL(rawHref,source.url);}catch{continue;}
    const url=safeUrl(resolved.toString(),source.host);if(!url||seen.has(url)||title.length<12)continue;
    const plain=decodeHtmlText(card),dateText=plain.match(NEWS_NUMERIC_DATE_RE)?.[0]||plain.match(NEWS_DATE_RE)?.[0]||'';
    const dt=parseNewsDateText(dateText);if(!dt)continue;
    seen.add(url);
    const category=source.category||categorize(title,'',source.name);
    items.push({title,url,source:source.name,category,section:category,subject_kind:subjectKind(title,category),
      published_at:dt.toISOString(),published_date_only:true,summary:'',image_url:'',original:false,preview_external:true});
  }
  return items;
}
function decodeJsonLiteral(value){
  try{return JSON.parse('"'+String(value||'').replace(/"/g,'\\"')+'"');}catch{return decode(String(value||''));}
}
export function parseBreedersCupNewsPage(html,source){
  if(typeof html!=='string'||html.length>MAX_OFFICIAL_PAGE_BYTES)return [];
  const items=[],seen=new Set();
  const rx=/"title":"((?:\\.|[^"\\])+)","url":"(\/news\/[^"]+)"[\s\S]{0,1200}?"publishDate":"([^"]+)"/g;
  for(const match of html.matchAll(rx)){
    const title=decodeJsonLiteral(match[1]).replace(/\\u0026/g,'&').slice(0,240);
    const url=safeUrl(new URL(match[2],source.url).toString(),source.host),dt=new Date(match[3]);
    if(!title||!url||!Number.isFinite(+dt)||seen.has(url))continue;
    seen.add(url);
    const category=categorize(title,'',source.name);
    items.push({title,url,source:source.name,category,section:category,subject_kind:subjectKind(title,category),
      published_at:dt.toISOString(),published_date_only:false,summary:'',image_url:'',original:false,preview_external:true});
  }
  return items;
}
export function parseFasigNewsArchive(html,source){
  if(typeof html!=='string'||html.length>MAX_OFFICIAL_PAGE_BYTES)return [];
  const items=[],seen=new Set(),anchor=/<a\b([^>]*?)href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const match of html.matchAll(anchor)){
    let resolved;try{resolved=new URL(decode(match[2]),source.url);}catch{continue;}
    const safe=safeUrl(resolved.toString(),source.host);if(!safe||seen.has(safe))continue;
    if(!/^\/20\d{2}\/[^/]+\/\d{4}\/?$/i.test(resolved.pathname))continue;
    const title=decodeHtmlText(match[3]).replace(/^more\.?$/i,'').trim();
    if(title.length<12)continue;
    const i=match.index||0,nearby=decodeHtmlText(html.slice(Math.max(0,i-500),Math.min(html.length,i+match[0].length+900)));
    let dateText=nearby.match(NEWS_DATE_RE)?.[0]||nearby.match(NEWS_NUMERIC_DATE_RE)?.[0]||'';
    if(!dateText)continue;
    dateText=dateText.replace(/(\d{1,2})(?:st|nd|rd|th)(,\s+\d{4})/i,'$1$2');
    const dt=new Date(dateText+' 12:00:00 UTC');if(!Number.isFinite(+dt))continue;
    seen.add(safe);
    items.push({title:title.slice(0,240),url:safe,source:source.name,category:'Sales / Auctions',section:'Sales / Auctions',
      subject_kind:'sale',published_at:dt.toISOString(),published_date_only:true,
      summary:'',image_url:'',original:false,preview_external:true});
  }
  return items;
}
export function parseOfficialJsonItems(payload,source){
  if(!Array.isArray(payload))return [];
  const items=[];
  for(const row of payload.slice(0,50)){
    const title=decode(row?.title?.rendered??row?.title??'').slice(0,240);
    const url=safeUrl(String(row?.link||''),source.host);
    const dt=new Date(row?.date_gmt||row?.date||'');
    if(!title||!url||!Number.isFinite(+dt)||dt.getTime()>Date.now()+3600000)continue;
    const category=source.category||categorize(title,'',source.name);
    items.push({title,url,source:source.name,category,section:category,
      subject_kind:subjectKind(title,category),published_at:dt.toISOString(),published_date_only:false,
      summary:'',image_url:'',original:false,preview_external:true});
  }
  return items;
}
async function fetchOfficialJsonSource(source,fetchFn=fetch){
  const started=Date.now();
  try{
    const response=await fetchFn(source.url,{headers:{Accept:'application/json,*/*;q=0.1','User-Agent':BROWSER_FEED_UA},
      cache:'no-store',signal:AbortSignal.timeout(9000)});
    const len=Number(response.headers.get('content-length')||0);
    if(!response.ok||len>MAX_JSON_BYTES)return {source,items:[],all_items:[],status:response.status,elapsed_ms:Date.now()-started};
    const raw=await response.text();if(raw.length>MAX_JSON_BYTES)throw Error('Official JSON feed exceeded preview safety limit');
    const all=parseOfficialJsonItems(JSON.parse(raw),source),now=Date.now();
    const items=all.filter(item=>previewHeadlineRelevant(item.title,item.section))
      .filter(item=>!source.require_racing_context||hasRacingContext(item.title,item.section))
      .filter(item=>now-Date.parse(item.published_at)<=PREVIEW_MAX_ITEM_AGE_MS).slice(0,12);
    return {source,items,all_items:all,status:response.status,
      newest_published_at:all.map(x=>x.published_at).sort().at(-1)||null,elapsed_ms:Date.now()-started};
  }catch(e){
    return {source,items:[],all_items:[],status:null,elapsed_ms:Date.now()-started,error:String(e?.message||e).slice(0,120)};
  }
}
async function fetchOfficialNewsPage(source,fetchFn=fetch){
  const started=Date.now();
  try{
    const response=await fetchFn(source.url,{headers:{Accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
      'User-Agent':BROWSER_FEED_UA},cache:'no-store',signal:AbortSignal.timeout(9000)});
    const len=Number(response.headers.get('content-length')||0);
    if(!response.ok||len>MAX_OFFICIAL_PAGE_BYTES)return {source,items:[],all_items:[],status:response.status,elapsed_ms:Date.now()-started};
    const html=await response.text();
    if(html.length>MAX_OFFICIAL_PAGE_BYTES)throw Error('Official news page exceeded preview safety limit');
    const all=source.adapter==='fasig'?parseFasigNewsArchive(html,source):
      source.adapter==='one-st'?parseOneStNewsPage(html,source):
      source.adapter==='breeders-cup'?parseBreedersCupNewsPage(html,source):
      parseOfficialNewsPage(html,source);
    const now=Date.now();
    const items=all
      .filter(item=>previewHeadlineRelevant(item.title,item.section))
      .filter(item=>!source.require_racing_context||hasRacingContext(item.title,item.section))
      .filter(item=>now-Date.parse(item.published_at)<=PREVIEW_MAX_ITEM_AGE_MS)
      .slice(0,12);
    return {source,items,all_items:all,status:response.status,
      newest_published_at:all.map(x=>x.published_at).sort().at(-1)||null,elapsed_ms:Date.now()-started};
  }catch(e){
    return {source,items:[],all_items:[],status:null,elapsed_ms:Date.now()-started,error:String(e?.message||e).slice(0,120)};
  }
}

export function categorize(title,category='',source=''){
  const s=(String(title||'')+' '+String(category||'')).toLowerCase();
  const publisher=String(source||'').toLowerCase();

  // Source identity is decisive only when the publisher itself has a narrow
  // editorial function. This keeps an OBS racing graduate story in the
  // Sales/Auctions desk instead of mislabeling it as a race result.
  if(/ocala breeders.? sales|\bobs\b|fasig.?tipton|keeneland sales|tattersalls|goffs/.test(publisher))
    return 'Sales / Auctions';
  if(/\bhisa\b|\bhiwu\b|racing commission|horse racing integrity/.test(publisher))
    return 'Regulatory';

  // High-confidence editorial desks come before race-name words such as
  // "Breeders' Cup", "Classic", "Filly" or "Mare".
  if(/\b(hisa|hiwu|racing commission|regulatory|rule change|ruling|suspension|suspended|ban|banned|fine|fined|positive test|medication violation|licensing|appeal|stewards? decision)\b/.test(s))
    return 'Regulatory';
  if(/\b(hall of fame|milestone|career (?:win|victory)|record[- ]breaking|record setter|award(?:ed)?|honou?r(?:ed)?|\d{3,4}(?:st|nd|rd|th) (?:win|victory))\b/.test(s))
    return 'Achievement';

  // Business / audience metrics are Industry even when the event name itself
  // contains a stakes term. Example: Breeders' Cup attendance and handle.
  if(/\b(attendance|handle|wagering handle|all-sources handle|turnover|revenue|viewership|television ratings|tv ratings|economic impact|business results|market share|crowd|fan count|media rights|broadcast rights|purse increase|purses increase)\b/.test(s))
    return 'Industry';

  // Facility, venue and meet-operation stories are Racetrack.
  if(/\b(racetrack|racecourse|track surface|turf course|dirt course|track renovation|track management|racing dates|meet dates|meet opens|meet closes|rail setting|course configuration|host track|host site|host venue|venue change|race moved to|meet moves to|meet returns to|racing returns to)\b/.test(s))
    return 'Racetrack';

  // Sales language is stronger than race/event language.
  if(/\b(auction|sale|sales|sold for|hammer price|consign(?:ed|ment)|yearling sale|weanling sale|bloodstock|catalog(?:ue)?|average price|median price|topper|sale topper)\b/.test(s))
    return 'Sales / Auctions';

  // Explicit breeding lifecycle language is stronger than a race name. This
  // correctly labels "retired to stud" while avoiding generic "mare" alone.
  if(/\b(retired? to stud|retires? to stud|stud fee|stallion|broodmare|in foal|foal(?:ed|ing)?|sire|dam|breeding rights|cover(?:ed|ing))\b/.test(s))
    return 'Breeding';

  if(/\b(jockey|rider|apprentice|irad ortiz|prat)\b/.test(s))return 'Jockeys';
  if(/\b(trainer|assistant trainer)\b/.test(s))return 'Trainers';
  if(/\b(owner|owners|ownership|syndicate|partnership)\b/.test(s))return 'Owners';
  if(/\b(stable|barn)\b/.test(s))return 'Stable';

  // Immediate race-day operations remain race coverage.
  if(/\b(scratch|scratched|entry|entries|post position|racing secretary|workout|race day|drawn|post draw)\b/.test(s))
    return 'Race-Day';

  // Horse-specific health / retirement stories should not become Stakes merely
  // because the affected horse was headed to a major event.
  if(/\b(injur(?:y|ed)|illness|surgery|colic|euthani[sz]ed|dies?|death|retir(?:e|ed|ement))\b/.test(s))
    return 'Horses';

  // Race/event language wins before generic horse descriptors such as filly,
  // colt or mare. "Breeders' Cup Filly & Mare Sprint" is a race story.
  if(/stakes|derby|breeders.? cup|grade [i123]|\bg[123]\b|classic|preakness|belmont stakes|distaff|juvenile|sprint|turf mile|turf sprint|race result|wins? the/.test(s))
    return 'Stakes';

  if(/\b(breeding|pedigree|mating|stud book)\b/.test(s))return 'Breeding';
  if(/\b(horse|filly|colt|gelding|mare|champion)\b/.test(s))return 'Horses';
  return 'Industry';
}
// The five editorial subjects used by DFO-style pictogram cards.
// Classifications are labels, not claims about a horse's actual race status.
export function subjectKind(text,section=''){
  const category=String(section||'').toLowerCase();
  if(/^(stable|stables|barn)$/.test(category))return 'stable';
  if(/^(racetrack|track|tracks)$/.test(category))return 'racetrack';
  if(/^(breeding|breeder|breeders)$/.test(category))return 'breeding';
  if(/^(sale|sales|sales \/ auctions|auction|auctions)$/.test(category))return 'sale';
  if(/^(regulatory|rules|rulings)$/.test(category))return 'regulatory';
  if(/^(achievement|achievements|milestones)$/.test(category))return 'achievement';
  if(/^(industry|industry news)$/.test(category))return 'industry';
  if(/^(owner|owners|ownership)$/.test(category))return 'owner';
  if(/^(jockey|jockeys)$/.test(category))return 'jockey';
  if(/^(trainer|trainers)$/.test(category))return 'trainer';
  if(/^(horse|horses|breeding)$/.test(category))return 'horse';
  if(/^(race|race-day|stakes)$/.test(category))return 'race';
  const words=String(text||'').toLowerCase();
  if(/\b(auction|yearling sale|bloodstock sale|sold for|consignment|hammer price)\b/.test(words))return 'sale';
  if(/\b(breeding|pedigree|stallion|stud fee|foal|sire|dam)\b/.test(words))return 'breeding';
  if(/\b(racing commission|licensing|suspension|ruling|regulatory)\b/.test(words))return 'regulatory';
  if(/\b(milestone|hall of fame|career record|award|achievement)\b/.test(words))return 'achievement';
  if(/\b(racetrack|racecourse|track surface|track management)\b/.test(words))return 'racetrack';
  if(/\b(barn|stable|training center)\b/.test(words))return 'stable';
  if(/\b(owner|owners|ownership|syndicate|partnership)\b/.test(words))return 'owner';
  if(/\b(jockey|jockeys|rider|riders|mount|apprentice)\b/.test(words))return 'jockey';
  if(/\b(trainer|trainers|conditioning|conditioner|barn)\b/.test(words))return 'trainer';
  if(/\b(scratch|scratched|entries|entry|stakes|derby|classic|race|races|racecourse|racetrack|race-day|post position|purse|breeders.? cup)\b/.test(words))return 'race';
  if(/\b(horse|horses|colt|filly|gelding|mare|stallion|yearling|foal|sire|retire|retirement|pedigree)\b/.test(words))return 'horse';
  return 'race'; // Generic racing updates receive a neutral checkered-flag icon.
}
// Social posts already contain the reporter's words. Create a short, faithful
// preview by splitting actual text — never fabricate a report or an allegation.
export function socialPreview(raw){
  const text=String(raw||'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();
  if(!text)return {title:'',summary:''};
  if(text.length<=145)return {title:text,summary:''};
  let breakAt=0;
  const sentence=/[.!?](?=\s|$)/.exec(text.slice(0,130));
  if(sentence&&sentence.index>35)breakAt=sentence.index+1;
  if(!breakAt){breakAt=text.lastIndexOf(' ',120);if(breakAt<55)breakAt=120;}
  const title=text.slice(0,breakAt).trim()+(breakAt<text.length&&text[breakAt-1]!=='.'?'…':'');
  const remaining=text.slice(breakAt).trim();
  const summary=remaining.length>270?remaining.slice(0,267).trimEnd()+'…':remaining;
  return {title,summary};
}
export function parseRacingRss(xml,feed){
  if(typeof xml!=='string'||xml.length>MAX_FEED_BYTES||/<!DOCTYPE|<!ENTITY/i.test(xml))return [];
  const chunks=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
  const results=[];
  for(const item of chunks.slice(0,35)){
    const title=field(item,'title').slice(0,240);
    const link=safeUrl(field(item,'link'),feed.link_hosts||feed.host);
    const section=field(item,'category').slice(0,120);
    const published=field(item,'pubDate')||field(item,'published')||field(item,'updated');
    const dt=new Date(published),hasDate=Number.isFinite(+dt);
    if(!title||!link||(!hasDate&&!feed.allow_undated)||(hasDate&&dt.getTime()>Date.now()+3600000))continue;
    results.push({source:feed.name,title,link,published_at:hasDate?dt.toISOString():null,
      undated:!hasDate,section,category:categorize(title,section,feed.name),image_url:feedImage(item,feed)});
  }
  return results;
}
async function fetchPreviewFeed(feed,fetchFn=fetch){
  const started=Date.now();
  try{
    const response=await fetchFn(feed.url,{headers:{
      Accept:'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.1',
      'Cache-Control':'no-cache',
      Pragma:'no-cache',
      'User-Agent':feed.user_agent||'RailAndRyeRacingWire-Preview/1.0 (+https://railandryeracing.com)'
    },cache:'no-store',signal:AbortSignal.timeout(8000)});
    const len=Number(response.headers.get('content-length')||0);
    if(!response.ok||len>MAX_FEED_BYTES)return {feed,items:[],status:response.status,elapsed_ms:Date.now()-started};
    const xml=await response.text();
    if(xml.length>MAX_FEED_BYTES)return {feed,items:[],status:response.status,elapsed_ms:Date.now()-started};
    const now=Date.now();
    const fetchedAt=new Date(now).toISOString();
    const parsed=parseRacingRss(xml,feed)
      .filter(item=>previewHeadlineRelevant(item.title,item.section))
      .filter(item=>!feed.require_racing_context||hasRacingContext(item.title,item.section))
      .filter(item=>item.undated||now-Date.parse(item.published_at)<=PREVIEW_MAX_ITEM_AGE_MS)
      .slice(0,12)
      .map(item=>({
        title:item.title,url:item.link,source:item.source,
        category:item.category,section:item.section||'',
        subject_kind:subjectKind(item.title,item.category),
        published_at:item.published_at||fetchedAt,published_at_estimated:Boolean(item.undated),
        summary:'',image_url:item.image_url||'',
        original:false,preview_external:true
      }));
    return {feed,items:parsed,status:response.status,
      newest_published_at:parsed.map(x=>x.published_at).sort().at(-1)||null,
      elapsed_ms:Date.now()-started};
  }catch(e){
    return {feed,items:[],status:null,elapsed_ms:Date.now()-started,error:String(e?.message||e).slice(0,120)};
  }
}
export async function previewExternalItems(fetchFn=fetch){
  const [rssSettled,pageSettled,jsonSettled]=await Promise.all([
    Promise.all(PREVIEW_LIVE_FEEDS.map(feed=>fetchPreviewFeed(feed,fetchFn))),
    Promise.all(PREVIEW_LIVE_OFFICIAL_NEWS_PAGES.map(source=>fetchOfficialNewsPage(source,fetchFn))),
    Promise.all(PREVIEW_LIVE_JSON_SOURCES.map(source=>fetchOfficialJsonSource(source,fetchFn)))
  ]);
  return {
    items:[...rssSettled.flatMap(x=>x.items),...pageSettled.flatMap(x=>x.items),...jsonSettled.flatMap(x=>x.items)].slice(0,160),
    sources:[
      ...rssSettled.map(x=>({id:x.feed.id,name:x.feed.name,url:x.feed.url,http_status:x.status,
        parsed_count:x.items.length,newest_published_at:x.newest_published_at||null,
        elapsed_ms:x.elapsed_ms,error:x.error||null,candidate:Boolean(x.feed.candidate),
        require_racing_context:Boolean(x.feed.require_racing_context),source_type:'rss'})),
      ...pageSettled.map(x=>({id:x.source.id,name:x.source.name,url:x.source.url,http_status:x.status,
        parsed_count:x.items.length,available_count:x.all_items.length,newest_published_at:x.newest_published_at||null,
        elapsed_ms:x.elapsed_ms,error:x.error||null,candidate:false,require_racing_context:Boolean(x.source.require_racing_context),source_type:'official-page'})),
      ...jsonSettled.map(x=>({id:x.source.id,name:x.source.name,url:x.source.url,http_status:x.status,
        parsed_count:x.items.length,available_count:x.all_items.length,newest_published_at:x.newest_published_at||null,
        elapsed_ms:x.elapsed_ms,error:x.error||null,candidate:false,require_racing_context:Boolean(x.source.require_racing_context),source_type:'official-json'}))
    ]
  };
}

export async function testPreviewRssFeeds(fetchFn=fetch){
  const tested_at=new Date().toISOString(),results=[];
  for(const feed of PREVIEW_DIAGNOSTIC_FEEDS){
    const started=Date.now();
    try{
      const response=await fetchFn(feed.url,{headers:{
        Accept:'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.1',
        'User-Agent':feed.user_agent||'RailAndRyeRacingWire-Preview/1.0 (+https://railandryeracing.com)'
      },signal:AbortSignal.timeout(9000)});
      const type=String(response.headers.get('content-type')||'').slice(0,120);
      const len=Number(response.headers.get('content-length')||0);
      if(!response.ok){
        results.push({id:feed.id,source:feed.name,url:feed.url,reachable:false,http_status:response.status,
          content_type:type,parsed_count:0,newest_published_at:null,elapsed_ms:Date.now()-started,
          note:'Feed responded but could not be read by the preview worker.'});
        continue;
      }
      if(len>MAX_FEED_BYTES){
        results.push({id:feed.id,source:feed.name,url:feed.url,reachable:true,http_status:response.status,
          content_type:type,parsed_count:0,newest_published_at:null,elapsed_ms:Date.now()-started,
          note:'Feed exceeded the preview safety limit.'});
        continue;
      }
      const xml=await response.text();
      if(xml.length>MAX_FEED_BYTES)throw Error('Feed exceeded preview safety limit');
      const parsed=parseRacingRss(xml,feed);
      const newest=parsed.map(x=>x.published_at).filter(Boolean).sort().at(-1)||null;
      results.push({id:feed.id,source:feed.name,url:feed.url,reachable:true,http_status:response.status,
        content_type:type,bytes:xml.length,parsed_count:parsed.length,newest_published_at:newest,
        elapsed_ms:Date.now()-started,note:'Diagnostic only — headlines are not republished.'});
    }catch(e){
      results.push({id:feed.id,source:feed.name,url:feed.url,reachable:false,http_status:null,
        content_type:'',parsed_count:0,newest_published_at:null,elapsed_ms:Date.now()-started,
        note:'Network or parser error: '+String(e?.message||e).slice(0,120)});
    }
  }
  for(const source of PREVIEW_OFFICIAL_NEWS_PAGES){
    const result=await fetchOfficialNewsPage(source,fetchFn);
    results.push({id:source.id,source:source.name,url:source.url,reachable:result.status===200,
      http_status:result.status,content_type:'text/html',parsed_count:result.all_items.length,
      newest_published_at:result.newest_published_at||null,elapsed_ms:result.elapsed_ms,
      source_type:'official-page',note:result.error?'Official news page error: '+result.error:'Official first-party news listing; headline/date/link metadata only.'});
  }
  for(const source of PREVIEW_LIVE_JSON_SOURCES){
    const result=await fetchOfficialJsonSource(source,fetchFn);
    results.push({id:source.id,source:source.name,url:source.url,reachable:result.status===200,
      http_status:result.status,content_type:'application/json',parsed_count:result.all_items.length,
      newest_published_at:result.newest_published_at||null,elapsed_ms:result.elapsed_ms,
      source_type:'official-json',note:result.error?'Official JSON error: '+result.error:'Official first-party JSON metadata; headline/date/link only.'});
  }
  return {tested_at,diagnostic_only:true,permission_status:'RSS and official first-party news/JSON endpoints are being technically tested only; third-party headline reuse remains disabled pending permission.',results};
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

/* Editorial deduplication: preserve distinct developments for the same horse.
 * Merge only strongly overlapping accounts of the SAME development within
 * 48 hours; preserve every original publisher link in also_reported_by.
 * Editorially assigned event_key can later identify reworded reports exactly.
 */
const FILLER_WORDS=new Set(['the','a','an','at','in','on','by','to','of','from','for','with','after',
 'before','is','are','was','were','and','or','as','will','has','have','now','says','reports',
 'new','latest','today','update','news','horse','horse-racing','racing']);
function storyTokens(title){
 return [...new Set(String(title||'').toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/breeders['’]?\s+cup/g,'breederscup')
  .replace(/\b(scratched|scratches)\b/g,'scratch')
  .replace(/\b(won|wins|winning)\b/g,'win')
  .replace(/\b(entered|entries)\b/g,'entry')
  .replace(/\b(worked|workouts)\b/g,'workout')
  .replace(/[^a-z0-9]+/g,' ').split(' ')
  .filter(w=>w.length>2&&!FILLER_WORDS.has(w)))];
}
function eventType(title){
 const t=String(title||'').toLowerCase();
 if(/\b(scratch|scratched|scratches)\b/.test(t))return 'scratch';
 if(/\b(injury|injured|illness|surgery|colic)\b/.test(t))return 'health';
 if(/\b(workout|worked|breeze|breezed)\b/.test(t))return 'workout';
 if(/\b(sale|auction|sold|consigned|purchased)\b/.test(t))return 'sale';
 if(/\b(entry|entered|entries|draw|post position)\b/.test(t))return 'entry';
 if(/\b(retire|retired|retirement)\b/.test(t))return 'retirement';
 if(/\b(win|won|victory|triumph|result)\b/.test(t))return 'result';
 if(/\b(ruling|suspended|suspension|regulatory)\b/.test(t))return 'regulatory';
 return 'other';
}
function canGroup(a,b){
 if(a.event_key&&b.event_key&&a.event_key===b.event_key)return true;
 if(a.url===b.url)return true;
 if(Math.abs(Date.parse(a.published_at)-Date.parse(b.published_at))>48*3600000)return false;
 if(eventType(a.title)!==eventType(b.title))return false;
 if(a.subject_kind!==b.subject_kind)return false;
 const at=storyTokens(a.title),bt=storyTokens(b.title);
 const setB=new Set(bt),common=at.filter(x=>setB.has(x)).length;
 const ratio=common/Math.max(at.length,bt.length,1);
 return common>=3&&ratio>=.78;
}
export function groupRacingWireStories(stories){
 const ordered=[...stories].filter(x=>Number.isFinite(Date.parse(x.published_at)))
  .sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at));
 const groups=[];
 for(const candidate of ordered){
  const existing=groups.find(g=>canGroup(g,candidate));
  if(existing){
   existing.also_reported_by ||= [];
   if(existing.url!==candidate.url&&!existing.also_reported_by.some(x=>x.url===candidate.url))
    existing.also_reported_by.push({source:candidate.source,url:candidate.url});
  }else groups.push({...candidate,also_reported_by:[]});
 }
 return groups;
}
const HARD_REJECT_PATTERNS=[
 /\bhow to (?:watch|bet|wager|stream)\b/i,
 /\b(?:tv|television|streaming|broadcast) schedule\b/i,
 /\bwhere to watch\b/i,
 /\b(?:picks?|predictions?|best bets?|betting picks?|expert analysis|handicapping|wagering guide|betting guide)\b/i,
 /\b(?:betting odds?|odds and|favorites? and how to bet|how to bet)\b/i,
 /\b(?:promo code|bonus bets?|sportsbook|racebook|off[- ]?track betting|otb|advance deposit wagering|\badw\b|parlay|rebates?)\b/i,
 /\b(?:handicapper|handicapping plays?|wagering tips?|betting strategy|how to wager|how to bet)\b/i,
 /\b(?:harness|standardbred|steeplechase|steeplechaser|jump racing|national hunt|trotting|trotter|trotters|pacing|pacer|pacers|hambletonian|meadowlands|yonkers raceway|woodbine mohawk|mohawk park)\b/i,
 /\bhistory:\s*(?:winners?|losers?|betting|odds)/i
];
const MAJOR_EVENT_RE=/\b(breeders.? cup|kentucky derby|preakness|belmont stakes|travers|pegasus world cup|dubai world cup|melbourne cup|prix de l.?arc de triomphe|japan cup|cox plate|eclipse stakes|royal ascot|kentucky oaks)\b/i;
const GRADED_RE=/\b(group|grade)\s*[123i]+\b|\bG[123]\b/i;
const MATERIAL_RE=/\b(scratch(?:ed|es)?|withdrawn?|ruled out|injur(?:y|ed)|illness|surgery|colic|retir(?:e|ed|ement)|suspend(?:ed|sion)?|ruling|disqualif(?:ied|ication)|ban(?:ned)?|cancel(?:led|ed)|postpon(?:ed|ement)|stewards?|positive test|appeal)\b/i;
const RESULT_RE=/\b(wins?|won|victory|triumph|scores?|takes?|captures?|proves best|remains perfect|completes .*timer)\b/i;
const SALES_RE=/\b(sale|auction|sold for|brings? \$|hammer price|consign(?:ed|ment)|yearling|weanling)\b/i;
const BREEDING_RE=/\b(stallion|stud fee|retired to stud|breeding|sire|dam|foal|foaled|broodmare|cover(?:ed|ing))\b/i;
const INDUSTRY_RE=/\b(HISA|HIWU|racing commission|commissioners?|rule change|policy|legislation|licensing|integrity|medication rule)\b/i;
const MILESTONE_RE=/\b(milestone|hall of fame|career win|career victori(?:es|y)|record[- ]breaking|record setter|\d{3,4}(?:st|nd|rd|th) win|four-timer|five-timer|six-timer|thousand career victories)\b/i;
const INDUSTRY_METRICS_RE=/\b(attendance|handle|wagering handle|turnover|revenue|viewership|television ratings|tv ratings|economic impact|market share|crowd)\b/i;
const LOW_VALUE_RE=/\b(preview|opinion|podcast|photo gallery|look back|what to know|guide to)\b/i;

function displayType(title){
 switch(eventType(title)){
  case 'scratch': return 'Scratch';
  case 'health': return 'Health';
  case 'workout': return 'Workout';
  case 'sale': return 'Sale';
  case 'entry': return 'Entry';
  case 'retirement': return 'Retirement';
  case 'result': return 'Result';
  case 'regulatory': return 'Ruling';
  default: return '';
 }
}
export function scoreRacingWireItem(item){
 const title=String(item?.title||'').trim();
 const context=(title+' '+String(item?.section||'')+' '+String(item?.category||'')).trim();
 if(!title)return {score:0,reject:true,reason:'empty'};
 if(HARD_REJECT_PATTERNS.some(rx=>rx.test(context)))
   return {score:0,reject:true,reason:'betting-or-service-content'};
 let score=item?.original?74:42;
 if(MATERIAL_RE.test(context))score+=34;
 if(MAJOR_EVENT_RE.test(context))score+=22;
 if(GRADED_RE.test(context)||/\bstakes\b/i.test(context))score+=12;
 if(INDUSTRY_RE.test(context))score+=24;
 if(SALES_RE.test(context))score+=18;
 if(BREEDING_RE.test(context))score+=18;
 if(MILESTONE_RE.test(context))score+=24;
 if(INDUSTRY_METRICS_RE.test(context))score+=MAJOR_EVENT_RE.test(context)?14:6;
 if(RESULT_RE.test(context))score+=(MAJOR_EVENT_RE.test(context)||GRADED_RE.test(context)||/\bstakes\b/i.test(context))?10:-10;
 if(/\b(entry|entries|draw|post position|field set|nominations?)\b/i.test(context))score+=MAJOR_EVENT_RE.test(context)?14:3;
 if(LOW_VALUE_RE.test(context))score-=18;
 if(/\b(odds?|betting|wager(?:ing)?|picks?)\b/i.test(context))score-=24;
 if(item?.source==='Thoroughbred Daily News')score+=4;
 const corroboration=Math.min(10,4*(item?.also_reported_by?.length||0));
 score+=corroboration;
 return {score:Math.max(0,Math.min(100,score)),reject:false,reason:'scored'};
}

export function curateRacingWireStories(stories,{threshold=62,maxItems=24,maxPerSource=4}={}){
 const grouped=groupRacingWireStories(stories);
 const accepted=[];
 const sourceCounts=new Map();
 for(const item of grouped){
   const assessment=scoreRacingWireItem(item);
   if(assessment.reject||assessment.score<threshold)continue;
   const source=String(item.source||'Unknown');
   const used=sourceCounts.get(source)||0;
   if(!item.original&&used>=maxPerSource)continue;
   sourceCounts.set(source,used+1);
   accepted.push({...item,type:item.type||displayType(item.title),editorial_score:assessment.score});
   if(accepted.length>=maxItems)break;
 }
 return accepted;
}
async function loadPreviewWire(env,fetchFn=fetch){
  let originals=[];
  if(env.STORE_DB)try{
    const r=await env.STORE_DB.prepare(
      "SELECT title,slug,category,excerpt,publish_date FROM journal_articles WHERE status='published' ORDER BY publish_date DESC,created_at DESC LIMIT 120"
    ).all();
    originals=(r.results||[]).map(a=>({
      title:a.title.slice(0,240),url:'/journal/'+a.slug+'/',
      source:'Rail & Rye',category:categorize(a.title,a.category),
      subject_kind:subjectKind(a.title,a.category),
      published_at:a.publish_date+'T12:00:00Z',summary:a.excerpt.slice(0,260),original:true
    }));
  }catch(e){console.warn('Racing Wire preview journal unavailable',String(e).slice(0,90));}
  const external=await previewExternalItems(fetchFn);
  const items=curateRacingWireStories([...originals,...external.items],{threshold:62,maxItems:24,maxPerSource:4});
  return {items,external,originals};
}
async function editorialRows(env){
  if(!env.STORE_DB)return [];
  await ensureEditorialSchema(env);
  const result=await env.STORE_DB.prepare("SELECT story_url,hidden,placement,category_override,updated_at FROM racing_wire_editorial ORDER BY updated_at DESC").all();
  return result.results||[];
}
function applyEditorialControls(items,rows,{includeHidden=false}={}){
  const controls=new Map(rows.map(row=>[row.story_url,row]));
  const adjusted=[];
  for(const item of items){
    const control=controls.get(item.url);
    const category=control?.category_override&&EDITORIAL_CATEGORIES.includes(control.category_override)?control.category_override:item.category;
    const next={...item,category,subject_kind:subjectKind(item.title,category),
      editorial:{hidden:Boolean(control?.hidden),placement:control?.placement||'auto',category_override:control?.category_override||null}};
    if(!next.editorial.hidden||includeHidden)adjusted.push(next);
  }
  adjusted.sort((a,b)=>{
    const ap=a.editorial?.placement==='top'?3:a.editorial?.placement==='more'?2:1;
    const bp=b.editorial?.placement==='top'?3:b.editorial?.placement==='more'?2:1;
    return bp-ap||Date.parse(b.published_at)-Date.parse(a.published_at);
  });
  return adjusted;
}
function sameOrigin(request){
  const origin=request.headers.get('origin');
  return !!origin&&origin===new URL(request.url).origin&&request.headers.get('sec-fetch-site')!=='cross-site';
}
async function readEditorialPayload(request){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error('Expected JSON');
  const text=await request.text();if(text.length>5000)throw Error('Request too large');
  const data=JSON.parse(text);
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid editorial control');
  const story_url=String(data.story_url||'').trim();
  const action=String(data.action||'').trim();
  if(!(story_url.startsWith('/journal/')||/^https:\/\/[a-z0-9.-]+\//i.test(story_url))||story_url.length>1900)throw Error('Invalid story URL');
  if(!['top','more','hide','category','restore'].includes(action))throw Error('Invalid editorial action');
  const category=data.category==null?null:String(data.category).trim();
  if(action==='category'&&!EDITORIAL_CATEGORIES.includes(category))throw Error('Invalid category');
  return {story_url,action,category};
}
export async function handleAdminRacingWire(request,env,fetchFn=fetch){
  if(!env.STORE_DB)return reply({error:'Racing Wire database binding missing'},503);
  if(!['GET','PATCH'].includes(request.method))return reply({error:'Method not allowed'},405);
  if(request.method!=='GET'&&!sameOrigin(request))return reply({error:'Same-origin request required'},403);
  try{await ensureEditorialSchema(env);}catch(error){console.error('Racing Wire editorial schema failed',error);return reply({error:'Racing Wire editorial controls are temporarily unavailable'},503);}
  if(request.method==='GET'){
    const [{items},rows]=await Promise.all([loadPreviewWire(env,fetchFn),editorialRows(env)]);
    return reply({items:applyEditorialControls(items,rows,{includeHidden:true}),categories:EDITORIAL_CATEGORIES});
  }
  let data;try{data=await readEditorialPayload(request);}catch(error){return reply({error:error.message},422);}
  const now=new Date().toISOString();
  if(data.action==='restore'){
    await env.STORE_DB.prepare("DELETE FROM racing_wire_editorial WHERE story_url=?").bind(data.story_url).run();
  }else{
    const current=await env.STORE_DB.prepare("SELECT story_url,hidden,placement,category_override FROM racing_wire_editorial WHERE story_url=?").bind(data.story_url).first();
    let hidden=Number(current?.hidden||0),placement=current?.placement||'auto',category=current?.category_override||null;
    if(data.action==='hide')hidden=1;
    if(data.action==='top'){
      await env.STORE_DB.prepare("UPDATE racing_wire_editorial SET placement='auto',updated_at=? WHERE placement='top' AND story_url<>?").bind(now,data.story_url).run();
      hidden=0;placement='top';
    }
    if(data.action==='more'){hidden=0;placement=placement==='more'?'auto':'more';}
    if(data.action==='category')category=data.category;
    await env.STORE_DB.prepare("INSERT INTO racing_wire_editorial (story_url,hidden,placement,category_override,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(story_url) DO UPDATE SET hidden=excluded.hidden,placement=excluded.placement,category_override=excluded.category_override,updated_at=excluded.updated_at")
      .bind(data.story_url,hidden,placement,category,now).run();
  }
  const [{items},rows]=await Promise.all([loadPreviewWire(env,fetchFn),editorialRows(env)]);
  return reply({items:applyEditorialControls(items,rows,{includeHidden:true}),categories:EDITORIAL_CATEGORIES});
}
export async function handlePreviewRacingWire(request,env,fetchFn=fetch){
  if(request.method!=='GET')return reply({error:'Method not allowed'},405);
  const loaded=await loadPreviewWire(env,fetchFn);
  let items=loaded.items;
  if(env.STORE_DB)try{items=applyEditorialControls(items,await editorialRows(env));}
  catch(e){console.warn('Racing Wire editorial controls unavailable',String(e).slice(0,90));}
  return reply({
    items,
    source_count:loaded.external.sources.filter(x=>x.parsed_count>0).length+(loaded.originals.length?1:0),
    external_test_only:true,
    external_sources:loaded.external.sources,
    social_sources:[],
    social_policy:'Preview RSS only for technical testing; X/Meta not connected yet',
    headline_only:true,
    generated_at:new Date().toISOString()
  });
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
      subject_kind:subjectKind(a.title,a.category),
      published_at:a.publish_date+'T12:00:00Z',summary:a.excerpt.slice(0,260),original:true
    }));
  }catch(e){console.warn('Racing Wire journal unavailable',String(e).slice(0,90));}
  let syndicated=[];
  if(FEEDS.some(f=>f.authorized))try{
    const r=await env.STORE_DB.prepare(
      'SELECT source,category,title,article_url,published_at FROM racing_wire_items ORDER BY published_at DESC LIMIT 200'
    ).all();
    const allowed=new Set(FEEDS.filter(f=>f.authorized).map(f=>f.name));
    syndicated=(r.results||[]).filter(a=>allowed.has(a.source)).map(a=>({
      title:a.title,url:a.article_url,source:a.source,category:a.category,
      subject_kind:subjectKind(a.title,a.category),
      published_at:a.published_at,original:false,summary:''
    }));
  }catch(e){console.warn('Racing Wire syndicated cache unavailable',String(e).slice(0,90));}
  const items=curateRacingWireStories([...originals,...syndicated],{threshold:62,maxItems:24,maxPerSource:4});
  return reply({items,source_count:FEEDS.filter(f=>f.authorized).length,
    social_sources:[],social_policy:'Publisher-authorized RSS; X official embeds; Facebook/Instagram verified official links or embeds',
    headline_only:true,generated_at:new Date().toISOString()});
}

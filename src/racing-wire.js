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
  const items=groupRacingWireStories([...originals,...syndicated]).slice(0,150);
  return reply({items,source_count:FEEDS.filter(f=>f.authorized).length,
    social_sources:[],social_policy:'Publisher-authorized RSS; X official embeds; Facebook/Instagram verified official links or embeds',
    headline_only:true,generated_at:new Date().toISOString()});
}

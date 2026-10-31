import {PREVIEW_LIVE_FEEDS,parseRacingRss,scoreRacingWireItem,subjectKind} from '../src/racing-wire.js';

const now=Date.now();
for(const feed of PREVIEW_LIVE_FEEDS){
  const started=Date.now();
  try{
    const response=await fetch(feed.url,{headers:{
      Accept:'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.1',
      'User-Agent':'RailAndRyeRacingWire-Diagnostic/1.0 (+https://railandryeracing.com)'
    },cache:'no-store',signal:AbortSignal.timeout(12000)});
    const text=await response.text();
    const items=parseRacingRss(text,feed);
    const newest=items.map(x=>x.published_at).sort().at(-1)||null;
    const ageHours=newest?((now-Date.parse(newest))/3600000):null;
    console.log(JSON.stringify({
      id:feed.id,name:feed.name,url:feed.url,status:response.status,
      contentType:response.headers.get('content-type'),bytes:text.length,
      parsed:items.length,newest,ageHours:ageHours===null?null:Number(ageHours.toFixed(2)),
      top:items.slice(0,5).map(item=>{
        const probe={title:item.title,section:item.section,category:item.category,source:item.source,
          subject_kind:subjectKind(item.title,item.category),published_at:item.published_at,original:false};
        const score=scoreRacingWireItem(probe);
        return {title:item.title,published_at:item.published_at,category:item.category,score:score.score,reject:score.reject,reason:score.reason};
      }),
      elapsedMs:Date.now()-started
    }));
  }catch(error){
    console.log(JSON.stringify({id:feed.id,name:feed.name,url:feed.url,error:String(error?.message||error),elapsedMs:Date.now()-started}));
  }
}

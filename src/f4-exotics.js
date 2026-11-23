// Protected frozen-F4 exotic source. Private R2 objects only. Nothing is
// published in public assets, and no tote data or wager placement is used.
const HEADERS={"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow"};
const ok=data=>new Response(JSON.stringify(data),{headers:HEADERS});
const fail=(message,status)=>new Response(JSON.stringify({error:message}),{status,headers:HEADERS});
const MODEL="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET";
const HEX=/^[0-9a-f]{64}$/i;
const isRecord=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const slug=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
function selection(url){
 const date=url.searchParams.get("date"),track=url.searchParams.get("track"),
       race=Number(url.searchParams.get("race"));
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(String(date||""))||
    !track||track.length>100||!slug(track)||
    !Number.isInteger(race)||race<1||race>20)return null;
 return {date,track,race,slug:slug(track)};
}
const relative=(a,b)=>Math.abs(a-b)<=1e-8;
function validate(base,source,proof,expected){
 if(!isRecord(base)||!Array.isArray(base.races)||
    base.race_date!==expected.date||base.track_name!==expected.track||
    base.projection_status!=="prescratch"||!isRecord(source)||source.schema_version!==2||
    source.model_id!==MODEL||source.date!==expected.date||
    source.track_name!==expected.track||source.scratch_state!=="PRESCRATCH"||
    !HEX.test(source.f4_receipt_sha256||"")||
    !HEX.test(source.prefix_file_sha256||"")||
    !HEX.test(source.source_sha256||"")||!HEX.test(source.badge_sha256||""))
    return null;
 if(proof.source_sha256!==source.source_sha256||
    proof.badge_sha256!==source.badge_sha256)return null;
 const race=base.races.find(r=>r.race_number===expected.race),
       model=source.races?.find(r=>r.race_number===expected.race);
 if(!race||!model||!Array.isArray(race.entries)||!Array.isArray(model.programs))return null;
 const n=race.entries.length,programs=model.programs.map(String);
 if(n<3||n>30||programs.length!==n||new Set(programs).size!==n||
    !Array.isArray(model.pwin)||!Array.isArray(model.p2_weights)||
    !Array.isArray(model.p3_weights)||model.pwin.length!==n||
    model.p2_weights.length!==n||model.p3_weights.length!==n)return null;
 if(Array.isArray(race.scratches)&&race.scratches.length>0)return null;
 const runners=new Map(race.entries.map(e=>[String(e.program_number),e]));
 if(runners.size!==n||programs.some(p=>!runners.has(p)))return null;
 const p1=new Map(),w2=new Map(),w3=new Map();
 for(let i=0;i<n;i++){
  const program=programs[i],runner=runners.get(program);
  const first=model.pwin[i],second=model.p2_weights[i],third=model.p3_weights[i];
  if(typeof first!=="number"||!Number.isFinite(first)||first<=0||first>=1||
     typeof second!=="number"||!Number.isFinite(second)||second<=0||
     typeof third!=="number"||!Number.isFinite(third)||third<=0||
     !runner?.f4_probabilities||
     !relative(runner.win_probability_exact/100,first)||
     !relative(runner.f4_probabilities.exact_p1,first))return null;
  p1.set(program,first);w2.set(program,second);w3.set(program,third);
 }
 if(Math.abs([...p1.values()].reduce((a,b)=>a+b,0)-1)>1e-8)return null;
 const p2=Object.fromEntries(programs.map(p=>[p,0]));
 const p3=Object.fromEntries(programs.map(p=>[p,0]));
 const sum2=[...w2.values()].reduce((a,b)=>a+b,0);
 const sum3=[...w3.values()].reduce((a,b)=>a+b,0);
 let total2=0,total3=0;
 for(const a of programs){
  const first=p1.get(a),den2=sum2-w2.get(a);
  if(den2<=0)return null;
  for(const b of programs){
   if(a===b)continue;
   const two=first*w2.get(b)/den2;total2+=two;p2[b]+=two;
   const den3=sum3-w3.get(a)-w3.get(b);
   if(den3<=0)return null;
   for(const c of programs){
    if(c===a||c===b)continue;
    const three=two*w3.get(c)/den3;total3+=three;p3[c]+=three;
   }
  }
 }
 if(!relative(total2,1)||!relative(total3,1)||
    programs.some(p=>!relative(p2[p],runners.get(p).f4_probabilities.exact_p2)||
                     !relative(p3[p],runners.get(p).f4_probabilities.exact_p3)))return null;
 return {schema_version:2,model_id:MODEL,status:"verified",
  receipt_sha256:source.f4_receipt_sha256,
  prefix_sha256:source.prefix_file_sha256,
  source_sha256:source.source_sha256,scratch_state:"PRESCRATCH",
  date:expected.date,track:expected.track,race_number:expected.race,
  programs,pwin:model.pwin,p2_weights:model.p2_weights,p3_weights:model.p3_weights};
}
export async function readCertifiedF4Exotics(env,url){
 const expected=selection(url);
 if(!expected)return fail("Invalid race selection.",400);
 if(!env.CARDS_BUCKET)return fail("Private model storage is unavailable.",503);
 const dashboardKey="projections/dashboard/"+expected.date+"/"+expected.slug+".json";
 const exoticKey="projections/f4-ordered/"+expected.date+"/"+expected.slug+".json";
 try{
  const [cardObj,f4Obj]=await Promise.all([
   env.CARDS_BUCKET.get(dashboardKey),
   env.CARDS_BUCKET.get(exoticKey)
  ]);
  if(!cardObj)return fail("Current race projections are unavailable.",404);
  if(!f4Obj)return fail("Certified F4 ordered probabilities are not yet published.",404);
  const [base,source]=await Promise.all([cardObj.json(),f4Obj.json()]);
  const metadata=cardObj.customMetadata||{};
  const payload=validate(base,source,metadata,expected);
  if(!payload)return fail("Certified F4 results do not match the current race.",409);
  return ok({f4:payload});
 }catch(error){
  console.warn("Verified F4 exotic read held",String(error).slice(0,90));
  return fail("Certified F4 results are temporarily unavailable.",503);
 }
}

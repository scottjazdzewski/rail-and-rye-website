"""Stage verified output only; the proprietary engine never enters the site."""
import base64,hashlib,json,os,re,zlib,subprocess,math
from datetime import datetime,timezone
from pathlib import Path
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
import boto3
from botocore.exceptions import ClientError
P=Path("private-ingest/20261128")
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(o):return json.dumps(o,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def check(ok,msg):
 if not ok:raise ValueError(msg)
def get(s3,key):
 try:return s3.get_object(Bucket=BUCKET,Key=key)
 except ClientError as e:
  if e.response.get("Error",{}).get("Code") in ("404","NoSuchKey","NotFound"):return None
  raise
def data(obj):return obj["Body"].read() if obj else None
def put(s3,key,raw,meta):
 s3.put_object(Bucket=BUCKET,Key=key,Body=raw,ContentType="application/json",CacheControl="private,no-store",Metadata=meta,IfNoneMatch="*")
 check(data(get(s3,key))==raw,"R2 readback failed "+key)
def validate(c,f,pending,t,m):
 name=t["name"];date=m["date"]
 check(c["schema_version"]==1 and c["track_name"]==name and c["race_date"]==date and c["projection_status"]=="prescratch" and c["factor_basis"]=="verified_prescratch","Card identity")
 check(f["schema_version"]==2 and f["track_name"]==name and f["date"]==date and f["scratch_state"]=="PRESCRATCH" and f["model_id"]=="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET","F4 identity")
 check(f["source_sha256"]==m["source_sha256"] and f["f4_receipt_sha256"]==c["model_receipts"]["f4_sha256"],"F4 receipt identity")
 check(all(re.fullmatch("[a-f0-9]{64}",h) for h in (f["source_sha256"],f["badge_sha256"],f["prefix_file_sha256"],c["model_receipts"]["tri_sha256"],c["model_receipts"]["f4_sha256"])),"Receipt absent")
 check(len(c["races"])==len(f["races"])==t["races"] and {r["race_number"] for r in c["races"]}==set(t["race_numbers"]),"Race coverage")
 check(sum(len(r["entries"]) for r in c["races"])==t["runners"],"Runner coverage")
 actual=[]
 for r in c["races"]:
  check(r["scratches"]==[] and r["scratch_count"] is None and re.fullmatch(r"\$[1-9][0-9,]*",r["purse"]),"Race facts")
  es=r["entries"];n=len(es)
  check(n>=3 and len({e["program_number"] for e in es})==n,"Roster")
  check([e["rank"] for e in es]==list(range(1,n+1)) and es[0]["win_probability_exact"]==max(e["win_probability_exact"] for e in es),"Display order")
  check(abs(sum(e["win_probability_exact"] for e in es)-100)<1e-6,"PWIN mass")
  for e in es:
   p=e["f4_probabilities"];check(abs(p["exact_p1"]*100-e["win_probability_exact"])<1e-6 and abs(sum(p[k] for k in ("exact_p1","exact_p2","exact_p3","exact_p4","exact_p5","p6_plus"))-1)<1e-8,"F4 mass")
   check(e["horse_name"] and e["trainer"] and e["jockey"],"Missing connection disposition")
   if e["jockey"]=="Not assigned":actual.append((r["race_number"],e["program_number"],e["horse_name"]))
   check(len(e["metrics"])==5 and {x["label"] for x in e["metrics"]}=={"Speed","Form","Class","Pace Fit","Surface / Distance"} and all(x["value"] in ("green","gray","red") for x in e["metrics"]),"Factor evidence")
 check(set(actual)=={(x["race"],x["program"],x["horse"]) for x in pending},"Unassigned jockey evidence mismatch")
 check(not actual or (name=="Laurel Park" and actual==[(8,"9","N. Y. Finest")] and pending[0]["official_url"]=="https://tvg.equibase.com/static/entry/LRL112826USA8-EQB.html"),"Unexpected missing active identity")
 check({x["first_race_number"] for x in c["daily_double_pools"]}==set(t["dd_starts"]),"Exact DD inventory")
 by={r["race_number"]:r for r in c["races"]}
 for pool in c["daily_double_pools"]:
  first=pool["first_race_number"];check(pool["second_race_number"]==first+1 and first+1 in by and pool["source"]=="timeform_wagers" and pool["wager_text"]==by[first]["timeform_wagers"],"DD source text")
 # Exercise the site's exact prescratch F4 read gate, with private in-memory objects.
 js="""import {readCertifiedF4Exotics} from './src/f4-exotics.js';import {readMemberProjectionCards} from './src/projections.js';import {hasTimeformDailyDouble} from './src/daily-double-eligibility.js';import {requireProductionPurses,requireProductionStakesNames} from './src/projection-race-information.js';let s='';for await(const c of process.stdin)s+=c;const {card,model}=JSON.parse(s);requireProductionPurses(card);requireProductionStakesNames(card);const nums=new Set(card.races.map(r=>r.race_number));const actual=card.races.filter(r=>nums.has(r.race_number+1)&&hasTimeformDailyDouble(r.timeform_wagers,r.race_number,r.race_number+1)).map(r=>r.race_number);if(JSON.stringify(actual)!==JSON.stringify(card.daily_double_pools.map(p=>p.first_race_number)))throw Error('DD reader parity');const env={CARDS_BUCKET:{get:async key=>key.includes('/dashboard/')?{json:async()=>card,customMetadata:{source_sha256:model.source_sha256,badge_sha256:model.badge_sha256}}:{json:async()=>model}}};for(const r of card.races){const u=new URL('https://example.invalid/');u.searchParams.set('date',card.race_date);u.searchParams.set('track',card.track_name);u.searchParams.set('race',r.race_number);const v=await readCertifiedF4Exotics(env,u);if(!v.ok)throw Error('F4 gate failed race '+r.race_number);}const key='projections/dashboard/'+card.race_date+'/check.json';const memberEnv={CARDS_BUCKET:{list:async()=>({objects:[{key}]}),get:async k=>k===key?{text:async()=>JSON.stringify(card),customMetadata:{}}:null}};const cards=await readMemberProjectionCards(memberEnv,[{id:'qa',category:'Race Cards',race_date:card.race_date,track:card.track_name}]);if(cards.length!==1||cards[0].card.races.length!==card.races.length||cards[0].card.races.some((r,i)=>r.post_time_et!==card.races[i].post_time_et||r.entries.length!==card.races[i].entries.length))throw Error('Customer reader rejected stage');"""
 subprocess.run(["node","--input-type=module","-e",js],input=compact({"card":c,"model":f}),check=True)
def main():
 check(os.environ["GITHUB_REPOSITORY"]==REPO,"Wrong repository")
 m=json.loads((P/"manifest.json").read_text());check(m["date"]=="2026-11-28" and m["release_at"]=="2026-11-28T08:00:00Z" and len(m["tracks"])==12,"Wrong release")
 check(datetime.now(timezone.utc)<datetime.fromisoformat(m["release_at"].replace("Z","+00:00")),"Release no longer future; refuse staged write")
 s3=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
 now=datetime.now(timezone.utc).isoformat();prepared=[];tracks=[];conditional_count=0;pool_count=0
 for t in m["tracks"]:
  slug=t["slug"];check(re.fullmatch("[a-z-]+",slug),"Bad slug")
  encoded=(P/(slug+".enc")).read_bytes();check(sha(encoded)==t["cipher_sha256"],"Cipher hash mismatch "+slug)
  dec=zlib.decompressobj();raw=dec.decompress(SealedBox(private_key()).decrypt(base64.b64decode(encoded,validate=True)),200001)
  check(dec.eof and not dec.unused_data and len(raw)<=200000 and sha(raw)==t["raw_sha256"],"Certified payload hash mismatch "+slug)
  d=json.loads(raw);c,f,pending=d["card"],d["model"],d["pending"];validate(c,f,pending,t,m)
  conditional=d["conditional_roster"];conditional_count+=len(conditional);pool_count+=len(c["daily_double_pools"])
  check(all(re.fullmatch("[a-f0-9]{64}",d[k]) for k in ("original_pdf_sha256","scoring_pdf_sha256")),"Source identity missing")
  active={(r["race_number"],e["program_number"]) for r in c["races"] for e in r["entries"]}
  excluded={(x["race"],x["program"]) for x in conditional}
  check(len(excluded)==len(conditional) and not active&excluded and all(x["status"] in ("SCRATCHED","NOT_DRAWN") and x["horse"] for x in conditional),"Conditional identity")
  cb,fb=compact(c),compact(f);ck="projections/dashboard/"+m["date"]+"/"+slug+".json";fk="projections/f4-ordered/"+m["date"]+"/"+slug+".json"
  meta={"uploaded_at":now,"source_sha256":f["source_sha256"],"badge_sha256":f["badge_sha256"],"f4_receipt_sha256":f["f4_receipt_sha256"],"stage":"PRESCRATCH","customer_publish_approved":"true","release_at":m["release_at"],"release_sha256":t["raw_sha256"]}
  rk="projections/qa/"+m["date"]+"/conditional-roster/"+slug+".json"
  roster=compact({"race_date":m["date"],"track":t["name"],"original_pdf_sha256":d["original_pdf_sha256"],"scoring_pdf_sha256":d["scoring_pdf_sha256"],"conditional_roster":conditional,"pending_jockeys":pending})
  for key,b in ((ck,cb),(fk,fb),(rk,roster)):
   old=get(s3,key);prior=data(old)
   check(prior is None or prior==b,"Different existing edition: "+key)
   prepared.append((key,b,meta,prior))
  tracks.append({"name":t["name"],"slug":slug,"races":t["races"],"runners":t["runners"],"dashboard_sha256":sha(cb),"ordered_sha256":sha(fb),"unassigned_jockey_count":len(pending)})
  print("PRESTAGE_PASS "+t["name"],flush=True)
 check(sum(t["races"] for t in tracks)==113 and sum(t["runners"] for t in tracks)==981 and conditional_count==39 and pool_count==95,"Wrong slate totals")
 for key,b,meta,prior in prepared:check(data(get(s3,key))==prior,"Concurrent edition changed")
 for key,b,meta,prior in prepared:
  if prior is None:put(s3,key,b,meta)
  else:
   obj=get(s3,key);check(obj["Metadata"].get("customer_publish_approved")=="true" and obj["Metadata"].get("release_at")==m["release_at"],"Existing edition lacks staging metadata")
  print("PRIVATE_STAGE_READBACK_PASS "+key,flush=True)
 receipt={"schema_version":1,"status":"VERIFIED_STAGED","scope":"VERIFIED_COMPLETE_SLATE","race_date":m["date"],"release_at":m["release_at"],"source_sha256":m["source_sha256"],"tracks":tracks}
 key="projections/qa/"+m["date"]+"/staged-release.json";b=compact(receipt);prior=data(get(s3,key));check(prior is None or prior==b,"Existing staging receipt differs")
 if prior is None:put(s3,key,b,{"customer_publish_approved":"true","release_at":m["release_at"]})
 print("RR_1128_STAGED_PRIVATE_READBACK_PASS tracks=12 races=113 runners=981 pools=95 release_at="+m["release_at"],flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("RR_1128_STAGE_HOLD "+type(e).__name__+": "+str(e)[:220])

"""Stage verified output only; the proprietary engine never enters the site."""
import base64,hashlib,json,os,re,zlib,subprocess,math
from datetime import datetime,timezone
from pathlib import Path
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
import boto3
from botocore.exceptions import ClientError
P=Path("private-ingest/20261127-prestage-fg")
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
 s3.put_object(Bucket=BUCKET,Key=key,Body=raw,ContentType="application/json",CacheControl="private,no-store",Metadata=meta)
 check(data(get(s3,key))==raw,"R2 readback failed "+key)
def validate(c,f,pending,t,m):
 name=t["name"];date=m["date"]
 check(c["schema_version"]==1 and c["track_name"]==name and c["race_date"]==date and c["projection_status"]=="prescratch" and c["factor_basis"]=="verified_prescratch","Card identity")
 check(f["schema_version"]==2 and f["track_name"]==name and f["date"]==date and f["scratch_state"]=="PRESCRATCH" and f["model_id"]=="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET","F4 identity")
 check(f["source_sha256"]==m["source_sha256"] and f["f4_receipt_sha256"]==c["model_receipts"]["f4_sha256"],"F4 receipt identity")
 check(all(re.fullmatch("[a-f0-9]{64}",h) for h in (f["source_sha256"],f["badge_sha256"],f["prefix_file_sha256"],c["model_receipts"]["tri_sha256"],c["model_receipts"]["f4_sha256"])),"Receipt absent")
 check(len(c["races"])==len(f["races"])==t["races"] and {r["race_number"] for r in c["races"]}==set(range(1,t["races"]+1)),"Race coverage")
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
 check(not actual,"Unexpected missing active identity")
 check(len(c["daily_double_pools"])==t["races"]-1,"Timeform DD count")
 for pool in c["daily_double_pools"]:
  first=pool["first_race_number"];check(pool["second_race_number"]==first+1 and pool["source"]=="timeform_wagers" and pool["wager_text"]==c["races"][first-1]["timeform_wagers"] and re.search(r"\b(?:daily|rolling|late)\s+double\b",pool["wager_text"],re.I),"Daily Double evidence")
 check({p["first_race_number"] for p in c["daily_double_pools"]}==set(range(1,t["races"])),"DD start coverage")
 # Exercise the site's exact prescratch F4 read gate, with private in-memory objects.
 js="""import {readCertifiedF4Exotics} from './src/f4-exotics.js';import {requireProductionPurses,requireProductionStakesNames} from './src/projection-race-information.js';let s='';for await(const c of process.stdin)s+=c;const {card,model}=JSON.parse(s);requireProductionPurses(card);requireProductionStakesNames(card);const env={CARDS_BUCKET:{get:async key=>key.includes('/dashboard/')?{json:async()=>card,customMetadata:{source_sha256:model.source_sha256,badge_sha256:model.badge_sha256}}:{json:async()=>model}}};for(const r of card.races){const u=new URL('https://example.invalid/');u.searchParams.set('date',card.race_date);u.searchParams.set('track',card.track_name);u.searchParams.set('race',r.race_number);const v=await readCertifiedF4Exotics(env,u);if(!v.ok)throw Error('F4 gate failed race '+r.race_number);}"""
 subprocess.run(["node","--input-type=module","-e",js],input=compact({"card":c,"model":f}),capture_output=True,check=True)
def main():
 check(os.environ["GITHUB_REPOSITORY"]==REPO,"Wrong repository")
 m=json.loads((P/"manifest.json").read_text());check(m["date"]=="2026-11-27" and m["release_at"]=="2026-11-27T08:00:00Z" and len(m["tracks"])==1 and m["tracks"][0]["slug"]=="fair-grounds","Wrong release")
 check(datetime.now(timezone.utc)<datetime.fromisoformat(m["release_at"].replace("Z","+00:00")),"Release no longer future; refuse staged write")
 s3=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
 now=datetime.now(timezone.utc).isoformat();prepared=[];tracks=[]
 for t in m["tracks"]:
  slug=t["slug"];check(re.fullmatch("[a-z-]+",slug),"Bad slug")
  encoded=(P/(slug+".enc")).read_bytes();check(sha(encoded)==t["cipher_sha256"],"Cipher hash mismatch "+slug)
  dec=zlib.decompressobj();raw=dec.decompress(SealedBox(private_key()).decrypt(base64.b64decode(encoded,validate=True)),200001)
  check(dec.eof and not dec.unused_data and len(raw)<=200000 and sha(raw)==t["raw_sha256"],"Certified payload hash mismatch "+slug)
  d=json.loads(raw);c,f,pending=d["card"],d["model"],d["pending"];validate(c,f,pending,t,m)
  cb,fb=compact(c),compact(f);ck="projections/dashboard/"+m["date"]+"/"+slug+".json";fk="projections/f4-ordered/"+m["date"]+"/"+slug+".json"
  meta={"uploaded_at":now,"source_sha256":f["source_sha256"],"badge_sha256":f["badge_sha256"],"f4_receipt_sha256":f["f4_receipt_sha256"],"stage":"PRESCRATCH","customer_publish_approved":"true","release_at":m["release_at"],"release_sha256":t["raw_sha256"]}
  for key,b in ((ck,cb),(fk,fb)):
   old=get(s3,key);prior=data(old)
   check(prior is None or prior==b,"Different existing edition: "+key)
   prepared.append((key,b,meta,prior))
  tracks.append({"name":t["name"],"slug":slug,"races":t["races"],"runners":t["runners"],"dashboard_sha256":sha(cb),"ordered_sha256":sha(fb),"unassigned_jockey_count":len(pending)})
  print("PRESTAGE_PASS "+t["name"],flush=True)
 check(sum(t["races"] for t in tracks)==8 and sum(t["runners"] for t in tracks)==60,"Wrong slate totals")
 for key,b,meta,prior in prepared:check(data(get(s3,key))==prior,"Concurrent edition changed")
 for key,b,meta,prior in prepared:
  if prior is None:put(s3,key,b,meta)
  else:
   obj=get(s3,key);check(obj["Metadata"].get("customer_publish_approved")=="true" and obj["Metadata"].get("release_at")==m["release_at"],"Existing edition lacks staging metadata")
  print("PRIVATE_STAGE_READBACK_PASS "+key,flush=True)
 receipt={"schema_version":1,"status":"VERIFIED_TRACK_PRESTAGED","race_date":m["date"],"release_at":m["release_at"],"source_sha256":m["source_sha256"],"tracks":tracks}
 key="projections/qa/"+m["date"]+"/prestage-fair-grounds.json";b=compact(receipt);prior=data(get(s3,key));check(prior is None or prior==b,"Existing staging receipt differs")
 if prior is None:put(s3,key,b,{"customer_publish_approved":"true","release_at":m["release_at"]})
 print("RR_1127_PRESTAGED_PRIVATE_READBACK_PASS tracks=1 races=8 runners=60 release_at="+m["release_at"],flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("RR_1127_PRESTAGE_HOLD "+type(e).__name__+": "+str(e)[:220])

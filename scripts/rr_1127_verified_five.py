"""Stage verified output only; the proprietary engine never enters the site."""
import base64,hashlib,json,os,re,zlib,subprocess,math
from datetime import datetime,timezone
from pathlib import Path
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
import boto3
from botocore.exceptions import ClientError
P=Path("private-ingest/20261127-verified-five")
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
 check(len(c["races"])==len(f["races"])==t["races"] and {r["race_number"] for r in c["races"]}==set(t.get("race_numbers",range(1,t["races"]+1))),"Race coverage")
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
 check(len(c["daily_double_pools"])==len(t["dd_starts"]),"Timeform DD count")
 for pool in c["daily_double_pools"]:
  first=pool["first_race_number"];check(pool["second_race_number"]==first+1 and pool["source"]=="timeform_wagers" and pool["wager_text"]==next(r["timeform_wagers"] for r in c["races"] if r["race_number"]==first) and (re.search(r"\b(?:daily|rolling|late)\s+double\b",pool["wager_text"],re.I) or re.search(r"\bDouble\s*\(Races\s+"+str(first)+r"-"+str(first+1)+r"\)",pool["wager_text"],re.I)),"Daily Double evidence")
 check({p["first_race_number"] for p in c["daily_double_pools"]}==set(t["dd_starts"]),"DD start coverage")
 # Exercise the site's exact prescratch F4 read gate, with private in-memory objects.
 js="""import {readCertifiedF4Exotics} from './src/f4-exotics.js';import {requireProductionPurses,requireProductionStakesNames} from './src/projection-race-information.js';let s='';for await(const c of process.stdin)s+=c;const {card,model}=JSON.parse(s);requireProductionPurses(card);requireProductionStakesNames(card);const env={CARDS_BUCKET:{get:async key=>key.includes('/dashboard/')?{json:async()=>card,customMetadata:{source_sha256:model.source_sha256,badge_sha256:model.badge_sha256}}:{json:async()=>model}}};for(const r of card.races){const u=new URL('https://example.invalid/');u.searchParams.set('date',card.race_date);u.searchParams.set('track',card.track_name);u.searchParams.set('race',r.race_number);const v=await readCertifiedF4Exotics(env,u);if(!v.ok)throw Error('F4 gate failed race '+r.race_number);}"""
 subprocess.run(["node","--input-type=module","-e",js],input=compact({"card":c,"model":f}),capture_output=True,check=True)

def main():
 check(os.environ["GITHUB_REPOSITORY"]==REPO,"Wrong repository")
 m=json.loads((P/"manifest.json").read_text())
 check(m["date"]=="2026-11-27" and m["release_at"]=="2026-11-27T08:00:00Z" and len(m["tracks"])==5,"Wrong release")
 check(datetime.now(timezone.utc)<datetime.fromisoformat(m["release_at"].replace("Z","+00:00")),"Release no longer future")
 s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
 prepared=[];tracks=[];now=datetime.now(timezone.utc).isoformat();prefix="projections/qa/"+m["date"]+"/"
 for t in m["tracks"]:
  slug=t["slug"];ck="projections/dashboard/"+m["date"]+"/"+slug+".json";fk="projections/f4-ordered/"+m["date"]+"/"+slug+".json"
  if t.get("existing"):
   rc=get(s,prefix+"prestage-"+slug+".json");check(rc is not None,"Missing prior staging receipt "+slug)
   receipt=json.loads(data(rc));check(receipt["status"]=="VERIFIED_TRACK_PRESTAGED" and receipt["source_sha256"]==m["source_sha256"] and receipt["release_at"]==m["release_at"] and len(receipt["tracks"])==1,"Prior stage receipt")
   rr=receipt["tracks"][0];check(rr["slug"]==slug and rr["name"]==t["name"] and rr["races"]==t["races"] and rr["runners"]==t["runners"],"Prior track scope")
   co,fo=get(s,ck),get(s,fk);check(co and fo,"Missing existing staged pair")
   cb,fb=data(co),data(fo)
   check(sha(cb)==rr["dashboard_sha256"] and sha(fb)==rr["ordered_sha256"] and all(o["Metadata"].get("customer_publish_approved")=="true" and o["Metadata"].get("release_at")==m["release_at"] for o in (co,fo)),"Prior readback mismatch "+slug)
   c,f=json.loads(cb),json.loads(fb);validate(c,f,[],t,m)
  else:
   encoded=(P/(slug+".enc")).read_bytes();check(sha(encoded)==t["cipher_sha256"],"Cipher hash mismatch "+slug)
   dec=zlib.decompressobj();raw=dec.decompress(SealedBox(private_key()).decrypt(base64.b64decode(encoded,validate=True)),200001)
   check(dec.eof and not dec.unused_data and len(raw)<=200000 and sha(raw)==t["raw_sha256"],"Certified payload hash")
   d=json.loads(raw);c,f=d["card"],d["model"];validate(c,f,d["pending"],t,m);cb,fb=compact(c),compact(f)
   meta={"uploaded_at":now,"source_sha256":f["source_sha256"],"badge_sha256":f["badge_sha256"],"f4_receipt_sha256":f["f4_receipt_sha256"],"stage":"PRESCRATCH","customer_publish_approved":"true","release_at":m["release_at"],"release_sha256":t["raw_sha256"]}
   for key,b in ((ck,cb),(fk,fb)):
    old=get(s,key);prior=data(old);check(prior is None or prior==b,"Different existing edition "+key)
    if old:check(old["Metadata"].get("release_at")==m["release_at"] and old["Metadata"].get("customer_publish_approved")=="true","Existing authorization mismatch")
    prepared.append((key,b,meta,prior))
  tracks.append({"slug":slug,"name":t["name"],"races":t["races"],"runners":t["runners"],"dashboard_sha256":sha(cb),"ordered_sha256":sha(fb),"unassigned_jockey_count":0})
  print("NOV27_TRACK_PREFLIGHT_PASS",t["name"],t["races"],t["runners"],flush=True)
 check(sum(t["races"] for t in tracks)==39 and sum(t["runners"] for t in tracks)==301,"Partial scope totals")
 for key,b,meta,prior in prepared:check(data(get(s,key))==prior,"Concurrent stage changed")
 for key,b,meta,prior in prepared:
  if prior is None:put(s,key,b,meta)
  print("NOV27_PRIVATE_STAGE_READBACK_PASS",key,flush=True)
 for t in tracks:
  for stem,field in (("dashboard","dashboard_sha256"),("f4-ordered","ordered_sha256")):
   o=get(s,"projections/"+stem+"/"+m["date"]+"/"+t["slug"]+".json")
   check(o is not None and sha(data(o))==t[field] and o["Metadata"].get("customer_publish_approved")=="true" and o["Metadata"].get("release_at")==m["release_at"],"Final paired readback")
  if t["slug"] in {"woodbine","remington-park"}:
   part={"schema_version":1,"status":"VERIFIED_TRACK_PRESTAGED","race_date":m["date"],"release_at":m["release_at"],"source_sha256":m["source_sha256"],"tracks":[t]}
   key=prefix+"prestage-"+t["slug"]+".json";old=data(get(s,key));b=compact(part);check(old is None or old==b,"Prior track receipt differs")
   if old is None:put(s,key,b,{"customer_publish_approved":"true","release_at":m["release_at"]})
 # User has authorized staging verified cards. Explicitly label the incomplete scope.
 # Do not replace a competing manifest or pretend the entire 15-track slate is ready.
 final={"schema_version":1,"status":"VERIFIED_STAGED","scope":"VERIFIED_PARTIAL_SLATE","intended_track_count":15,"race_date":m["date"],"release_at":m["release_at"],"source_sha256":m["source_sha256"],"tracks":tracks,"omitted_tracks":m["omitted_tracks"]}
 key=prefix+"staged-release.json";b=compact(final);old=data(get(s,key));check(old is None or old==b,"Existing release manifest differs; preserve existing release")
 if old is None:put(s,key,b,{"customer_publish_approved":"true","release_at":m["release_at"]})
 print("NOV27_PARTIAL_RELEASE_STAGED_READBACK_PASS tracks=5 races=39 runners=301 intended_tracks=15 release_at="+m["release_at"],flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("NOV27_STAGE_HOLD "+type(e).__name__+": "+str(e)[:260])

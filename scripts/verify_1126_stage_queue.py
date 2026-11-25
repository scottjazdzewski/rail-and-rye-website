import os,json,hashlib,time,urllib.request
from datetime import datetime,timezone
from botocore.exceptions import ClientError
import boto3
from pick_private_score_bridge import BUCKET
date="2026-11-26";due="2026-11-26T08:00:00Z"
s=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
def get(key):
 o=s.get_object(Bucket=BUCKET,Key=key);return o["Body"].read(),o.get("Metadata",{})
def require(ok,msg):
 if not ok:raise RuntimeError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
base="projections/qa/"+date+"/"
raw,meta=get(base+"staged-release.json");m=json.loads(raw)
require(m["status"]=="VERIFIED_STAGED" and m["release_at"]==due and meta.get("customer_publish_approved")=="true","Stage manifest invalid")
require(len(m["tracks"])==6 and sum(t["races"] for t in m["tracks"])==56 and sum(t["runners"] for t in m["tracks"])==482,"Stage totals differ")
pools=0
for t in m["tracks"]:
 c,cm=get("projections/dashboard/"+date+"/"+t["slug"]+".json");f,fm=get("projections/f4-ordered/"+date+"/"+t["slug"]+".json")
 require(sha(c)==t["dashboard_sha256"] and sha(f)==t["ordered_sha256"] and cm.get("release_at")==due and fm.get("release_at")==due,"Wrong stored object "+t["slug"])
 card=json.loads(c);require(card["race_date"]==date and card["track_name"]==t["name"],"Wrong edition")
 pools+=len(card["daily_double_pools"])
 print("NOV26_TRACK_QA_PASS",t["name"],t["races"],t["runners"],flush=True)
require(pools==50,"Daily Double count")
require(datetime.now(timezone.utc)<datetime.fromisoformat(due.replace("Z","+00:00")),"Not pre-release")
req=urllib.request.Request("https://railandryeracing.com/api/products?qa=nov26-stage",headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
with urllib.request.urlopen(req,timeout=25) as response:products=json.load(response)["products"]
rows=products+[item for p in products for item in p.get("included_products",[])]
today={p.get("track") for p in rows if p.get("category")=="Race Cards" and p.get("race_date")=="2026-11-25" and p.get("track")}
require(len(today)>=9,"Current edition coverage")
require(not any(p.get("race_date")==date for p in rows),"Premature future products visible")
print("PUBLIC_CUTOFF_PASS current_tracks="+str(len(today)),flush=True)
for i in range(12):
 try:
  q=json.loads(get(base+"staged-catalog-receipt.json")[0])
  require(q["race_date"]==date and q["release_at"]==due and q["source_sha256"]==m["source_sha256"] and {t["track"] for t in q["tracks"]}=={t["name"] for t in m["tracks"]} and len(q["tracks"])==6 and all(t["release_at"]=="2026-11-26 08:00:00" and t["id"] for t in q["tracks"]),"Catalog receipt mismatch")
  print("NOV26_CATALOG_QUEUE_PASS tracks=6 release_at="+due+" registered_at="+q["registered_at"],flush=True);break
 except ClientError as e:
  if e.response.get("Error",{}).get("Code") not in ("404","NoSuchKey","NotFound"):raise
  print("Catalog receipt not present",i,flush=True)
  time.sleep(5)
else:raise RuntimeError("Catalog registration receipt not yet confirmed")
print("NOV26_FINAL_STAGE_QUEUE_QA_PASS tracks=6 races=56 runners=482 pools=50",flush=True)

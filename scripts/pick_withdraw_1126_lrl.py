"""Date-scoped withdrawal of Laurel Park Pick Tickets after official weather cancellation."""
import boto3, hashlib, json, os, subprocess, urllib.request, urllib.error
from datetime import datetime,timezone
from pathlib import Path
from botocore.exceptions import ClientError
DATE="2026-11-26"
TRACK="Laurel Park"
CANCELED=list(range(2,10))
BUCKET="rail-and-rye-private-cards"
ROOT=f"pick-tickets/staging/{DATE}/"
PARENT="93c7c84ab1f40496d5101f6f1b7f3a7129b21c6bb26d7944011e73c67d24af05"
KEY=f"racing-intelligence/product-tabs/pick-tickets/{DATE}/laurel-park.json"
AUDIT=f"pick-tickets/scratch-revisions/{DATE}/laurel-park/"
SOURCE="https://tvg.equibase.com/static/latechanges/html/latechangesLRL-USA.html"
def sha(b):return hashlib.sha256(b).hexdigest()
def req(b,m):
 if not b:raise RuntimeError(m)
def compact(v):return json.dumps(v,separators=(",",":"),sort_keys=True).encode()
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(k):
 o=s.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o
def immutable(k,b,m):
 try:
  old,_=get(k);req(old==b,"Archive collision")
 except ClientError as e:
  if e.response.get("Error",{}).get("Code") not in ("NoSuchKey","404","NotFound"):raise
  s.put_object(Bucket=BUCKET,Key=k,Body=b,ContentType="application/json",CacheControl="private,no-store",Metadata=m,IfNoneMatch="*")
 req(get(k)[0]==b,"Archive readback mismatch")
req(os.environ["GITHUB_REPOSITORY"]=="scottjazdzewski/rail-and-rye-website","Wrong repository")
raw,p=get(ROOT+"revision-0001.json");req(sha(raw)==PARENT and p["Metadata"].get("sha256")==PARENT,"Stage parent mismatch")
stage=json.loads(raw);row=next(r for r in stage["tracks"] if r["card"]["track"]==TRACK)
prep=json.loads(get(ROOT+"prepared-0001.json")[0]);q=next(t for t in prep["tracks"] if t["track"]==TRACK)
req(prep["sha256"]==PARENT and prep["date"]==DATE and q["sequence_count"]==13 and q["product_id"],"Prepared catalog registration mismatch")
old,obj=get(KEY);card=json.loads(old);m=obj["Metadata"]
req(card["date"]==DATE and card["track"]==TRACK and card["revision"]==1 and card["status"]=="initial_current" and m.get("content_sha256")==sha(old),"Unexpected customer revision")
req(len(card["sequences"])==13 and all(set(range(t["start_race"],t["end_race"]+1))&set(CANCELED) for t in card["sequences"]),"A live sequence would be affected")
Path("/tmp/rr-lrl-withdraw.json").write_text(json.dumps({"parent":row["card"],"current":card,"key":KEY,"metadata":m,"productId":q["product_id"]}))
subprocess.run(["node","scripts/verify_lrl_withdraw_1126.mjs"],check=True)
if m.get("customer_publish_approved")=="true":
 immutable(AUDIT+"weather-parent-"+sha(old)+".json",old,{"sha256":sha(old),"original_revision":"1"})
 audit=compact({"date":DATE,"track":TRACK,"source":SOURCE,"official_snapshot":"2026-11-26T17:08:00Z","reason":"WEATHER_CANCELLATION","canceled_races":CANCELED,"withdrawn_sequences":13,"original_metadata":m,"customer_sha256":sha(old),"catalog_product_id":q["product_id"]})
 immutable(AUDIT+"weather-withdrawal-"+sha(audit)+".json",audit,{"sha256":sha(audit)})
 cur,co=get(KEY);req(cur==old and co["Metadata"]==m,"Concurrent source update")
 m=dict(m);m.update(customer_publish_approved="false",withdrawal_reason="weather_cancellation",canceled_races="2,3,4,5,6,7,8,9",withdrawn_at=datetime.now(timezone.utc).isoformat())
 s.put_object(Bucket=BUCKET,Key=KEY,Body=old,ContentType="application/json",CacheControl="private,no-store",Metadata=m,IfMatch=obj["ETag"])
else:
 req(m.get("customer_publish_approved")=="false" and m.get("withdrawal_reason")=="weather_cancellation" and m.get("canceled_races")=="2,3,4,5,6,7,8,9","Unexpected prior hold")
new,n=get(KEY)
req(new==old and n["Metadata"].get("customer_publish_approved")=="false" and n["Metadata"].get("withdrawal_reason")=="weather_cancellation","Withdrawal readback failed")
Path("/tmp/rr-lrl-withdraw.json").write_text(json.dumps({"parent":row["card"],"current":card,"key":KEY,"metadata":n["Metadata"],"productId":q["product_id"]}))
subprocess.run(["node","scripts/verify_lrl_withdraw_1126.mjs","--withdrawn"],check=True)
print("NOV26_LRL_PICK_WITHDRAW_READBACK_PASS",json.dumps({"date":DATE,"track":TRACK,"canceled_races":CANCELED,"withdrawn_sequences":13,"prior_customer_sha256":sha(old),"withdrawn_at":n["Metadata"]["withdrawn_at"]}),flush=True)
try:
 requrl=urllib.request.Request("https://railandryeracing.com/api/products?qa=laurel-cancellation",headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
 with urllib.request.urlopen(requrl,timeout=25) as response:products=json.load(response)["products"]
 rows=products+[x for p in products for x in p.get("included_products",[])]
 tracks={p.get("track") for p in rows if p.get("category")=="Pick Tickets" and p.get("race_date")==DATE and p.get("track")}
 req(TRACK not in tracks and len(tracks)==5,"Public catalog withdrawal not confirmed")
 print("NOV26_LRL_PUBLIC_CATALOG_WITHDRAWAL_PASS",sorted(tracks),flush=True)
except (TimeoutError,urllib.error.URLError) as e:
 print("NOV26_LRL_PUBLIC_CATALOG_UNVERIFIED",type(e).__name__,flush=True)

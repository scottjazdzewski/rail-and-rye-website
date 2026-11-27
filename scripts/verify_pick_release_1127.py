"""Read-only current-date Pick Tickets release verification; no private selections logged."""
import boto3,hashlib,json,os,time,urllib.request,urllib.error
from botocore.exceptions import ClientError
DATE="2026-11-27"
BUCKET="rail-and-rye-private-cards"
EXPECTED="561bbbb058f15a0d674c59a24d565fcbb75bbf908ef08be165a158e34b55e3ed"
TRACKS={"Belmont Park":15,"Churchill Downs":19,"Charles Town":11,"Delta Downs":11,"Del Mar":13,"Fair Grounds":11,"Gulfstream Park":12,"Laurel Park":13,"Oaklawn Park":15,"Parx Racing":12,"Remington Park":8,"Tampa Bay":11,"Turf Paradise":8,"Woodbine":9,"Zia Park":5}
def require(ok,msg):
 if not ok:raise ValueError(msg)
def sha(raw):return hashlib.sha256(raw).hexdigest()
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(k):
 try:
  o=s.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o.get("Metadata",{})
 except ClientError as e:
  if e.response["Error"]["Code"] in ("404","NoSuchKey","NotFound"):return None,{}
  raise
stage,meta=get("pick-tickets/staging/"+DATE+"/revision-0001.json")
require(stage and sha(stage)==EXPECTED and meta.get("sha256")==EXPECTED,"Stage hash mismatch")
b=json.loads(stage);require(b["date"]==DATE and len(b["tracks"])==15,"Stage identity mismatch")
import re
for name,count in TRACKS.items():
 slug=re.sub("[^a-z0-9]+","-",name.lower()).strip("-")
 raw,m=get("racing-intelligence/product-tabs/pick-tickets/"+DATE+"/"+slug+".json")
 require(raw and m.get("customer_publish_approved")=="true" and sha(raw)==m.get("content_sha256"),"Customer checksum failed "+name)
 c=json.loads(raw);require(c["track"]==name and c["date"]==DATE and c["revision"]==1 and c["status"]=="initial_current" and len(c["sequences"])==count,"Customer identity failed "+name)
print("NOV27_FINAL_R2_PASS 15 tracks 173 sequences",flush=True)
for attempt in range(5):
 prepared,_=get("pick-tickets/staging/"+DATE+"/prepared-0001.json")
 if prepared:
  p=json.loads(prepared)
  require(p["sha256"]==EXPECTED and p["date"]==DATE and {t["track"]:t["sequence_count"] for t in p["tracks"]}==TRACKS,"Prepared catalog receipt mismatch")
  print("NOV27_PREPARED_RECEIPT_PASS 15 tracks",flush=True)
 try:
  req=urllib.request.Request("https://railandryeracing.com/api/products?qa=pick1127-final",headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
  with urllib.request.urlopen(req,timeout=20) as response:products=json.load(response)["products"]
  rows=products+[x for p in products for x in p.get("included_products",[])]
  actual={p.get("track") for p in rows if p.get("category")=="Pick Tickets" and p.get("race_date")==DATE and p.get("track")}
  print("NOV27_PUBLIC_PICK_CATALOG",len(actual),"tracks; missing:",sorted(set(TRACKS)-actual),flush=True)
  if actual==set(TRACKS):
   print("NOV27_PUBLIC_CATALOG_PASS 15 tracks 173 verified sequences",flush=True);break
 except (urllib.error.URLError,TimeoutError) as e:print("NOV27_PUBLIC_HTTP_UNAVAILABLE",type(e).__name__,flush=True)
 if attempt<4:time.sleep(10)
else:raise RuntimeError("R2 passed; public catalog not yet confirmed")

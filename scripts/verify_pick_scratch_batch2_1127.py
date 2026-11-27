"""Read-only Nov27 verification after revision 2; no protected content printed."""
import boto3,hashlib,json,os,re,urllib.request,urllib.error,time,subprocess
from pathlib import Path
from botocore.exceptions import ClientError
D="2026-11-27";B="rail-and-rye-private-cards";P=f"racing-intelligence/product-tabs/pick-tickets/{D}/"
TRACKS={"Belmont Park":15,"Churchill Downs":19,"Charles Town":11,"Delta Downs":11,"Del Mar":13,"Fair Grounds":11,"Gulfstream Park":12,"Laurel Park":13,"Oaklawn Park":15,"Parx Racing":12,"Remington Park":8,"Tampa Bay":11,"Turf Paradise":8,"Woodbine":9,"Zia Park":5}
UPDATES={"Parx Racing":[2,"6c048a72546bb0c336a6a42a4ef7d37549d3921e149b8c755abfb9aa2fab2e14"],"Laurel Park":[2,"f31a0fa097022de60bb2bac624b20fe5e1da6a99d3e62c76f0350145634e0f2c"],"Charles Town":[2,"f4c6a6b64f88a7840fa7ee6126edff1bda95abcbda97f3f1c52b20ec37fe894e"],"Fair Grounds":[2,"9d587378eff8936c312bf957f951af2b9cceaea07acf18bfcd109871dbece19a"],"Tampa Bay":[3,"da88f613ebaa6441156b79b0057f76b975baaf7318546e2c206e5f94ea23686e"],"Woodbine":[2,"8cbcb671495607362f67058fa2e5a3b20f18ae6b80516a8a0257742440dc47ed"]}
def need(ok,m):
 if not ok:raise ValueError(m)
def sha(b):return hashlib.sha256(b).hexdigest()
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(k):
 try:
  o=s.get_object(Bucket=B,Key=k);return o["Body"].read(),o["Metadata"]
 except ClientError as e:
  if e.response["Error"]["Code"] in ("404","NoSuchKey","NotFound"):return None,{}
  raise
snap={}
for n,c in TRACKS.items():
 k=P+re.sub("[^a-z0-9]+","-",n.lower()).strip("-")+".json";raw,m=get(k)
 need(raw and m.get("customer_publish_approved")=="true" and m.get("publication_mode")=="owner-approved-gpt" and m.get("content_sha256")==sha(raw),"Customer checksum "+n)
 q=json.loads(raw);need(q["date"]==D and q["track"]==n and len(q["sequences"])==c,"Customer identity "+n)
 if n in UPDATES:need(q["revision"]==UPDATES[n][0] and q["status"]=="scratch_updated" and sha(raw)==UPDATES[n][1],"Updated revision mismatch "+n)
 snap[k]={"text":raw.decode(),"metadata":m}
Path("/tmp/rr-pick-1127-current-reader.json").write_text(json.dumps(snap))
subprocess.run(["node","scripts/verify_pick_reader_1127.mjs"],check=True)
p,_=get(f"pick-tickets/staging/{D}/prepared-0001.json")
if p:
 m=json.loads(p);need(m["date"]==D and m["sha256"]=="561bbbb058f15a0d674c59a24d565fcbb75bbf908ef08be165a158e34b55e3ed" and {t["track"]:t["sequence_count"] for t in m["tracks"]}==TRACKS,"Prepared receipt mismatch")
 print("PICK_1127_PREPARED_CATALOG_RECEIPT_PASS",len(m["tracks"]),flush=True)
else:print("PICK_1127_PREPARED_CATALOG_RECEIPT_ABSENT",flush=True)
for i in range(3):
 try:
  req=urllib.request.Request("https://railandryeracing.com/api/products?qa=pick1127-batch2-"+str(i),headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
  with urllib.request.urlopen(req,timeout=25) as res:d=json.load(res)
  products=d["products"];rows=products+[r for x in products for r in x.get("included_products",[])]
  names={r.get("track") for r in rows if r.get("category")=="Pick Tickets" and r.get("race_date")==D and r.get("track")}
  print("PICK_1127_PUBLIC_CATALOG",len(names),"missing",sorted(set(TRACKS)-names),"total_listings",len(products),flush=True)
  if names==set(TRACKS):
   print("PICK_1127_PUBLIC_CATALOG_PASS",15,"tracks",173,"tickets",flush=True);break
 except (TimeoutError,urllib.error.URLError,ValueError,KeyError) as e:print("PICK_1127_PUBLIC_CATALOG_UNVERIFIED",type(e).__name__,flush=True)
 if i<2:time.sleep(5)
else:raise RuntimeError("Customer objects and repository reader passed; public catalog remains unverified")

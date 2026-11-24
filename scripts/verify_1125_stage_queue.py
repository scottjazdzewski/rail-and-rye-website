import boto3,os,json,hashlib,urllib.request
from pathlib import Path
from datetime import datetime,timezone
from botocore.exceptions import ClientError
date="2026-11-25";due="2026-11-25T08:00:00Z";bucket="rail-and-rye-private-cards"
s=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
def get(key):
 o=s.get_object(Bucket=bucket,Key=key);return o["Body"].read(),o.get("Metadata",{})
def require(ok,msg):
 if not ok:raise RuntimeError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
raw,meta=get("projections/qa/"+date+"/staged-release.json");m=json.loads(raw)
require(m["status"]=="VERIFIED_STAGED" and m["release_at"]==due and meta.get("customer_publish_approved")=="true","Stage manifest invalid")
require(len(m["tracks"])==9 and sum(t["races"] for t in m["tracks"])==76 and sum(t["runners"] for t in m["tracks"])==626,"Stage totals differ")
proof=json.loads(Path("docs/qa/20261125-role-reconciliation.json").read_text())
require(proof["source_sha256"]==m["source_sha256"] and proof["release_at"]==due and proof["role_audit_rows"]==1252,"Role QA source mismatch")
receipts={name:(tri,f4) for name,tri,f4 in proof["track_receipts"]}
pending=[]
for t in m["tracks"]:
 c,cm=get("projections/dashboard/"+date+"/"+t["slug"]+".json");f,fm=get("projections/f4-ordered/"+date+"/"+t["slug"]+".json")
 require(sha(c)==t["dashboard_sha256"] and sha(f)==t["ordered_sha256"] and cm.get("release_at")==due and fm.get("release_at")==due,"Wrong stored object or release metadata "+t["slug"])
 card=json.loads(c);require(card["race_date"]==date and card["track_name"]==t["name"] and card["projection_status"]=="prescratch","Wrong edition")
 require(all(abs(sum(e["win_probability_exact"] for e in r["entries"])-100)<1e-6 and all(len(e["metrics"])==5 for e in r["entries"]) for r in card["races"]),"Invalid probability/factors")
 require((card["model_receipts"]["tri_sha256"],card["model_receipts"]["f4_sha256"])==receipts[t["name"]],"Archived model receipt differs "+t["name"])
 for race in card["races"]:
  for entry in race["entries"]:
   require(entry["trainer"] and "Earnings Top Fig" not in entry["trainer"] and entry["jockey"],"Unresolved displayed connection")
   if entry["jockey"]=="Not assigned":pending.append((t["name"],race["race_number"],entry["program_number"],entry["horse_name"]))
 print("STAGED_TRACK_QA_PASS",t["name"],t["races"],t["runners"],flush=True)
require(set(pending)=={("Parx Racing",x["race"],x["program"],x["horse"]) for x in proof["verified_unassigned"]},"Unassigned scope differs")
print("SOURCE_ROLE_RECONCILIATION_PASS roles=1252 verified_unassigned=4",flush=True)
print("STAGED_18_OBJECTS_AND_MANIFEST_PASS",flush=True)
try:
 q,_=get("projections/qa/"+date+"/staged-catalog-receipt.json");q=json.loads(q)
 require(q["race_date"]==date and q["release_at"]==due and q["source_sha256"]==m["source_sha256"] and {t["track"] for t in q["tracks"]}=={t["name"] for t in m["tracks"]} and len(q["tracks"])==9 and all(t["release_at"]=="2026-11-25 08:00:00" and t["id"] for t in q["tracks"]),"Catalog receipt mismatch")
 print("CATALOG_QUEUE_PASS 9 tracks release_at="+due+" registered_at="+q["registered_at"],flush=True)
 queued=True
except ClientError as e:
 if e.response.get("Error",{}).get("Code") not in ("404","NoSuchKey","NotFound"):raise
 queued=False;print("CATALOG_QUEUE_RECEIPT_MISSING",flush=True)
req=urllib.request.Request("https://railandryeracing.com/api/products?qa=nov25-stage",headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
with urllib.request.urlopen(req,timeout=30) as response:
 products=json.load(response)["products"]
rows=products+[item for p in products for item in p.get("included_products",[])]
require(datetime.now(timezone.utc)<datetime.fromisoformat(due.replace("Z","+00:00")),"Not a pre-release check")
today={p.get("track") for p in rows if p.get("category")=="Race Cards" and p.get("race_date")=="2026-11-24" and p.get("track")}
tomorrow=[p for p in rows if p.get("race_date")==date]
print("LIVE_CURRENT_RACE_CARD_TRACKS",len(today),sorted(today),flush=True)
require(len(today)>=6,"Today's public catalog coverage below six tracks")
require(not tomorrow,"Premature future products visible")
print("PUBLIC_CUTOFF_PASS current edition visible; future edition hidden",flush=True)
require(queued,"Catalog queue receipt not yet confirmed")
# Data are unchanged: write a distinct signoff receipt, not a new edition or
# a replacement of today's files. Only after all checks pass.
receipt={"status":"VERIFIED_STAGED_ROLE_RECONCILED","race_date":date,"release_at":due,"source_sha256":m["source_sha256"],"stage_manifest_sha256":sha(raw),"role_proof_sha256":sha(Path("docs/qa/20261125-role-reconciliation.json").read_bytes()),"tracks":9,"races":76,"runners":626,"verified_unassigned":4}
key="projections/qa/"+date+"/final-reconciliation-receipt.json"
body=json.dumps(receipt,sort_keys=True,separators=(",",":")).encode()
s.put_object(Bucket=bucket,Key=key,Body=body,ContentType="application/json",CacheControl="private,no-store",Metadata={"release_at":due,"customer_publish_approved":"true"})
require(get(key)[0]==body,"Final reconciliation receipt readback failed")
print("FINAL_RECONCILIATION_RECEIPT_PUSH_PASS",flush=True)
print("NOV25_FINAL_STAGE_QUEUE_QA_PASS",flush=True)

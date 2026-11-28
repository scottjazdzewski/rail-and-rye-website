"""Read-only stage inventory for tomorrow; no public or private storage writes."""
import os,json,hashlib,datetime
import boto3
from botocore.exceptions import ClientError
from pulse_prescratch_archive import validate_original
DAY="2026-11-28"
BUCKET="rail-and-rye-private-cards"
s=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
def get(key):
    try:return s.get_object(Bucket=BUCKET,Key=key)
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404","NoSuchKey","NotFound"):return None
        raise
def sha(b):return hashlib.sha256(b).hexdigest()
prefix=f"projections/dashboard/{DAY}/"
keys=[x["Key"] for p in s.get_paginator("list_objects_v2").paginate(Bucket=BUCKET,Prefix=prefix) for x in p.get("Contents",[]) if x["Key"].endswith(".json")]
r=get(f"projections/qa/{DAY}/staged-release.json")
if not r:
    print("PULSE_TOMORROW_STAGE",json.dumps({"date":DAY,"dashboard_objects":len(keys),"status":"NO_VERIFIED_SLATE_RECEIPT"}))
    raise SystemExit(0)
m=json.loads(r["Body"].read())
assert m["race_date"]==DAY and m["status"]=="VERIFIED_STAGED"
assert m["release_at"]=="2026-11-28T08:00:00Z"
complete=m.get("scope")=="VERIFIED_COMPLETE_SLATE" and len(m["tracks"])==m.get("intended_track_count")
verified=preserved=0
for t in m["tracks"]:
    slug=t["slug"];o=get(prefix+slug+".json");f=get(f"projections/f4-ordered/{DAY}/{slug}.json")
    if not o or not f:continue
    c,model=o["Body"].read(),f["Body"].read()
    if sha(c)!=t["dashboard_sha256"] or sha(model)!=t["ordered_sha256"]:continue
    if o["Metadata"].get("release_at")!=m["release_at"] or f["Metadata"].get("release_at")!=m["release_at"]:continue
    validate_original(c,DAY,t["name"])
    verified+=1
    prior=get(f"race-day-pulse/prescratch/{DAY}/{slug}.json")
    if prior and prior["Body"].read()==c:preserved+=1
print("PULSE_TOMORROW_STAGE",json.dumps({"date":DAY,"dashboard_objects":len(keys),"receipt_tracks":len(m["tracks"]),"verified_tracks":verified,"preserved_tracks":preserved,"complete":complete,"status":"READY" if complete and verified==preserved==len(m["tracks"]) else "NOT_READY"}))

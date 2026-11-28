"""Preserve tomorrow's already-certified originals, without changing customer products."""
import os,json,datetime
import boto3
from pulse_prescratch_archive import preserve,validate_original,digest
DAY="2026-11-28"
BUCKET="rail-and-rye-private-cards"
DUE="2026-11-28T08:00:00Z"
s=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
def get(key):return s.get_object(Bucket=BUCKET,Key=key)
receipt=get(f"projections/qa/{DAY}/staged-release.json")
m=json.loads(receipt["Body"].read())
assert m["race_date"]==DAY and m["status"]=="VERIFIED_STAGED" and m["scope"]=="VERIFIED_COMPLETE_SLATE" and m["release_at"]==DUE
assert receipt["Metadata"].get("customer_publish_approved")=="true"
assert len(m["tracks"])==12 and len({t["slug"] for t in m["tracks"]})==12
assert sum(t["races"] for t in m["tracks"])==113 and sum(t["runners"] for t in m["tracks"])==981
prepared=[]
for t in m["tracks"]:
    slug=t["slug"];o=get(f"projections/dashboard/{DAY}/{slug}.json");f=get(f"projections/f4-ordered/{DAY}/{slug}.json")
    raw,model=o["Body"].read(),f["Body"].read()
    assert digest(raw)==t["dashboard_sha256"] and digest(model)==t["ordered_sha256"]
    assert all(x["Metadata"].get("release_at")==DUE and x["Metadata"].get("customer_publish_approved")=="true" and x["Metadata"].get("source_sha256")==m["source_sha256"] for x in (o,f))
    c=validate_original(raw,DAY,t["name"]);v=json.loads(model)
    assert v["source_sha256"]==m["source_sha256"] and v["f4_receipt_sha256"]==c["model_receipts"]["f4_sha256"] and v["scratch_state"]=="PRESCRATCH"
    assert len(c["races"])==t["races"] and sum(len(r["entries"]) for r in c["races"])==t["runners"]
    prepared.append((t,raw))
created=0
for t,raw in prepared:
    created+=int(preserve(s,BUCKET,t["slug"],DAY,t["name"],raw,t["dashboard_sha256"]))
    print("PULSE_1128_ORIGINAL_VERIFIED",t["slug"],flush=True)
print("PULSE_1128_BASELINES_PASS tracks=12 races=113 runners=981 created="+str(created)+" existing="+str(12-created),flush=True)

#!/usr/bin/env python3
"""ONE-TIME, PRIVATE, SOURCE-VERIFIED Pulse research snapshot.

Never touches live race cards, stage, public feeds, scores, prices, or site.
Only copies existing authoritative PRESCRATCH dashboard bytes into a new
private research prefix when destination does not exist. No overrides.
No horse/runner names, scores, hashes, or R2 keys are logged.
"""
import datetime as dt
import hashlib
import json
import os
import re
from zoneinfo import ZoneInfo

BUCKET = "rail-and-rye-private-cards"
DAY = os.environ.get("PULSE_SHADOW_TARGET_DATE", "")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HEX = re.compile(r"^[a-fA-F0-9]{64}$")
MAX_OBJECT = 1_100_000

def require(ok, reason):
    if not ok:raise RuntimeError(reason)

def list_candidates(client, prefix):
    result = client.list_objects_v2(Bucket=BUCKET, Prefix=prefix, MaxKeys=100)
    require(not result.get("IsTruncated"), "Incomplete source track listing; no writes")
    keys = [x["Key"] for x in result.get("Contents", [])
            if x["Key"].startswith(prefix) and re.fullmatch(
                r"[a-z0-9-]+\.json", x["Key"][len(prefix):])]
    require(bool(keys), "No original race cards found; no writes")
    return sorted(keys)

def head_or_none(client,key):
    from botocore.exceptions import ClientError
    try:return client.head_object(Bucket=BUCKET,Key=key)
    except ClientError as e:
        if e.response.get("Error",{}).get("Code") in ("404","NoSuchKey","NotFound"):return None
        raise

def validate_card(payload,metadata):
    card=json.loads(payload)
    require(card.get("schema_version")==1 and card.get("race_date")==DAY
            and card.get("projection_status")=="prescratch", "Source is not today's certified prescratch card")
    receipts=card.get("model_receipts") or {}
    require(all(HEX.fullmatch(str(receipts.get(k,""))) for k in ("tri_sha256","f4_sha256")),
            "Prescratch card lacks verified TRI/F4 receipts")
    require(str(metadata.get("stage","")).upper() in ("PRESCRATCH","PRESCRATCH_FINAL")
            or metadata.get("customer_publish_approved")=="true",
            "Source has no accepted prescratch publication metadata")
    require(isinstance(card.get("races"),list) and card["races"], "Missing source races")
    for race in card["races"]:
        values=[float(e["win_probability_exact"]) for e in race["entries"]]
        require(len(values)>=2 and all(0<=p<=100 for p in values) and abs(sum(values)-100)<0.001,
                "Race has invalid full-field original PWIN")
    return card

def main():
    require(DATE.fullmatch(DAY or "") is not None,"Bad one-time research date")
    current=dt.datetime.now(ZoneInfo("America/New_York"))
    require(current.date().isoformat()==DAY,"Capture day expired; do not backfill from later files")
    require(current.hour<9,"Capture after 9AM prohibited; avoid possible scratch-final source races")
    import boto3
    s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+
                   ".r2.cloudflarestorage.com",region_name="auto",
                   aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],
                   aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
    origin=f"projections/dashboard/{DAY}/"
    dest=f"race-day-pulse/prescratch/{DAY}/"
    source_keys=list_candidates(s,origin)
    staged=[]
    existing=0
    # Entire-source preflight before the FIRST private archive write.
    for key in source_keys:
        target=dest+key[len(origin):]
        source=s.get_object(Bucket=BUCKET,Key=key)
        body=source["Body"].read(MAX_OBJECT+1)
        require(0<len(body)<=MAX_OBJECT,"Unexpected dashboard source size")
        original_sha=hashlib.sha256(body).hexdigest()
        validate_card(body,source.get("Metadata") or {})
        prior=head_or_none(s,target)
        if prior:
            # Existing snapshots are preserved; never replace one.
            saved=s.get_object(Bucket=BUCKET,Key=target)["Body"].read(MAX_OBJECT+1)
            require(hashlib.sha256(saved).hexdigest()==original_sha,
                    "Existing immutable baseline differs from source; no writes")
            existing+=1
            continue
        staged.append((key,target,body,original_sha))
    captured=0
    for key,target,body,digest in staged:
        # Recheck source/target immediately before each copy. No record from a
        # changed or scratch-final original can be used as a prescratch baseline.
        latest=s.get_object(Bucket=BUCKET,Key=key)
        current_bytes=latest["Body"].read(MAX_OBJECT+1)
        require(hashlib.sha256(current_bytes).hexdigest()==digest,
                "Concurrent source update; stop without fabricating baseline")
        require(head_or_none(s,target) is None,"Concurrent baseline; no overwrite")
        s.put_object(Bucket=BUCKET,Key=target,Body=body,
                     ContentType="application/json; charset=utf-8",
                     CacheControl="private,no-store",
                     Metadata={"stage":"PRESCRATCH_PULSE_BASE",
                               "original_source_sha256":digest,
                               "captured_at":dt.datetime.now(dt.timezone.utc).isoformat()})
        readback=s.get_object(Bucket=BUCKET,Key=target)["Body"].read(MAX_OBJECT+1)
        require(hashlib.sha256(readback).hexdigest()==digest,
                "Private baseline readback mismatch")
        captured+=1
    print("PULSE_PRIVATE_SHADOW_CAPTURE date={} source_tracks={} copied={} already_identical={} status=PRIVATE_ONLY_VERIFIED"
          .format(DAY,len(source_keys),captured,existing))
if __name__=="__main__":
    main()

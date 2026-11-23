#!/usr/bin/env python3
"""Secure, one-way handoff of an existing Rail & Rye PDF's Radar horse rows.
Only sealed ciphertext is posted to GitHub. Actual proprietary selections go
straight into private R2 and are never committed to the public website repo.
This reproduces the approved printed card; it does NOT certify exact TRI PWIN.
"""
import base64
import hashlib
import json
import os
import re
import sys
import zlib
from datetime import datetime, timezone
from pathlib import Path
from nacl.public import PrivateKey, SealedBox

PREFIX="RR_RADAR_REVIEW_ENCRYPTED_V1"
# Existing Rail & Rye editorial transfer key. Only the public half was shared.
KEY_CONTEXT=b"RAIL-RYE-R2-TARGET-EDITORIAL-REVIEW-ECIES-v1\0"
R2_PREFIX="racing-intelligence/longshot-radar-pdf-review/"
OWNER="scottjazdzewski"
PR=173
MAX_BYTES=512*1024
PDF_SHA256="99fc4df3807b2713afc2043ebacf2360b93943ad0ecfdc25bce9378fa67edb1d"
ZIP_SHA256="5d4f1bdeefc07ef85445a0168cea064867c10a3342dbefbded510e96a97e89e1"

def key_from_private_secret():
    secret=os.environ.get("TRI_R2_SECRET_ACCESS_KEY","")
    if len(secret)<20:
        raise RuntimeError("R2 secret unavailable; private intake held.")
    return PrivateKey(hashlib.sha256(KEY_CONTEXT+secret.encode()).digest())

def valid_text(value,maxlen=360):
    return isinstance(value,str) and bool(value.strip()) and len(value)<=maxlen

def validate(payload):
    if not isinstance(payload,dict) or payload.get("schema_version")!=1 or payload.get("product_type")!="longshot_radar":
        raise ValueError("Not a Radar review payload.")
    if payload.get("race_date")!="2026-11-23" or payload.get("revision")!=1 or payload.get("status")!="published_pdf_reference":
        raise ValueError("Wrong source date/revision/state.")
    if payload.get("review_only") is not True or payload.get("customer_publish_approved") is not False:
        raise ValueError("Customer launch must remain disabled.")
    src=payload.get("source") or {}
    if src.get("editorial_pdf_sha256")!=PDF_SHA256 or src.get("timeform_zip_sha256")!=ZIP_SHA256:
        raise ValueError("Original published PDF and Timeform source hashes required.")
    if src.get("production_receipt_verified") is not False:
        raise ValueError("Do not claim independently certified exact TRI scores.")
    horses=payload.get("candidates")
    if not isinstance(horses,list) or len(horses)!=10:
        raise ValueError("The supplied November 23 card contains ten horses.")
    used=set()
    for index,horse in enumerate(horses,1):
        if not isinstance(horse,dict) or horse.get("editorial_order")!=index:
            raise ValueError("Must preserve the actual published editorial order.")
        for field in ("track","program_number","horse_name","original_morning_line","post_time_et","fair_odds_display","betting_case"):
            if not valid_text(horse.get(field)):
                raise ValueError("Published source field is missing.")
        if not isinstance(horse.get("race_number"),int) or not 1<=horse["race_number"]<=30:
            raise ValueError("Invalid published race identity.")
        if not re.fullmatch(r"\d{1,2}[A-Za-z]?",horse["program_number"]) or not 1<=int(re.match(r"\d+",horse["program_number"]).group())<=20:
            raise ValueError("Invalid published program number.")
        chance=horse.get("pwin_display")
        if not isinstance(chance,(float,int)) or isinstance(chance,bool) or not 0<=chance<=100:
            raise ValueError("Invalid printed win percentage.")
        ident=(horse["track"].casefold(),horse["race_number"],horse["program_number"])
        if ident in used:
            raise ValueError("Duplicate published horse.")
        used.add(ident)
        if not re.fullmatch(r"\d+/\d+",horse["original_morning_line"]) or not re.fullmatch(r"\d+/\d+",horse["fair_odds_display"]):
            raise ValueError("Original printed odds format required.")
    return payload

def upload():
    import boto3
    from botocore.exceptions import ClientError
    event=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    issue=event.get("issue") or {}
    comment=event.get("comment") or {}
    if event.get("repository",{}).get("full_name")!="scottjazdzewski/rail-and-rye-website":
        raise PermissionError("Wrong repository.")
    if issue.get("number")!=PR or comment.get("user",{}).get("login")!=OWNER:
        raise PermissionError("Unauthorized private intake request.")
    body=comment.get("body","")
    if not body.startswith(PREFIX+"\n"):
        raise ValueError("Wrong sealed intake prefix.")
    encoded=body[len(PREFIX)+1:].strip()
    if not re.fullmatch(r"[A-Za-z0-9+/=]+",encoded) or len(encoded)>MAX_BYTES*2:
        raise ValueError("Invalid sealed intake encoding.")
    plain=zlib.decompress(SealedBox(key_from_private_secret()).decrypt(base64.b64decode(encoded,validate=True)))
    if not plain or len(plain)>MAX_BYTES:
        raise ValueError("Decrypted intake exceeds limit.")
    card=validate(json.loads(plain))
    sha=hashlib.sha256(plain).hexdigest()
    account=os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()
    access=os.environ["TRI_R2_ACCESS_KEY_ID"].strip()
    secret=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip()
    if not re.fullmatch(r"[0-9a-f]{32}",account) or not access or not secret:
        raise RuntimeError("R2 credentials missing.")
    s3=boto3.client("s3",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        region_name="auto",aws_access_key_id=access,aws_secret_access_key=secret)
    bucket="rail-and-rye-private-cards"
    dest=R2_PREFIX+"2026-11-23/revision-0001.json"

    # Cross-check when available. Never turn PDF's rounded display percentage
    # into a fake full-precision TRI receipt.
    checked=0; matched=0
    objects=s3.list_objects_v2(Bucket=bucket,Prefix="projections/dashboard/2026-11-23/")
    lookup={}
    for obj in objects.get("Contents",[]):
        key=obj["Key"]
        if not key.endswith(".json"):continue
        try:
            raw=s3.get_object(Bucket=bucket,Key=key)["Body"].read()
            track=json.loads(raw)
            for race in track.get("races",[]):
                for horse in race.get("entries",[]):
                    k=(str(track.get("track_name","")).casefold().strip(),
                       int(race.get("race_number",0)),
                       str(horse.get("program_number","")).upper().strip(),
                       str(horse.get("horse_name","")).casefold().strip())
                    lookup[k]=horse
        except (ValueError,TypeError,KeyError):
            continue
    for row in card["candidates"]:
        k=(row["track"].casefold().strip(),row["race_number"],row["program_number"].upper(),row["horse_name"].casefold().strip())
        match=lookup.get(k)
        if match:
            checked+=1
            displayed=match.get("win_probability")
            if isinstance(displayed,(int,float)) and abs(displayed-row["pwin_display"])<0.051:
                matched+=1
    # Even 10/10 display matches do NOT authenticate unrounded source receipts.
    print(f"Source check: {checked}/10 horse identities and {matched}/10 printed percentages match existing private TRI; receipt remains unverified.")
    try:
        old=s3.get_object(Bucket=bucket,Key=dest)["Body"].read()
        if old!=plain:
            raise RuntimeError("Private published-card revision exists and differs; never silently overwrite.")
        print("Private Radar PDF review is already present and byte-identical.")
        return
    except ClientError as e:
        if e.response.get("Error",{}).get("Code") not in ("NoSuchKey","404","NotFound"):
            raise
    s3.put_object(Bucket=bucket,Key=dest,Body=plain,
        ContentType="application/json; charset=utf-8",CacheControl="private, no-store",
        Metadata={"sha256":sha,"review_only":"true","source_pdf_sha256":PDF_SHA256,
                  "uploaded_at":datetime.now(timezone.utc).isoformat()})
    stored=s3.get_object(Bucket=bucket,Key=dest)["Body"].read()
    if hashlib.sha256(stored).hexdigest()!=sha:
        raise RuntimeError("Private R2 SHA-256 readback mismatch.")
    print(f"SUCCESS: private Radar published PDF review stored and read back, 10 source horses, SHA256={sha}; customer launch remains disabled.")

if __name__=="__main__":
    try:upload()
    except Exception as exc:
        print("RADAR_PRIVATE_INTAKE_HOLD:",type(exc).__name__,str(exc)[:160],file=sys.stderr)
        sys.exit(1)

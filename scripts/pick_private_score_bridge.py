#!/usr/bin/env python3
"""Owner-authorized sealed review-score transfer to private Cloudflare R2.

No proprietary PWIN is committed to public GitHub files. Only an encrypted
compressed payload is posted by the repo owner as an issue comment on PR #183.
This carries *prescratch review* data only, never a final scorer receipt.
"""
import base64
import hashlib
import json
import os
import re
import sys
import zlib
from datetime import datetime,timezone
from pathlib import Path

from nacl.public import PrivateKey, SealedBox

PREFIX="RR_PICK_PRIVATE_SCORES_V1"
CONTEXT=b"RAIL-RYE-R2-PICK-INTERIM-REVIEW-ECIES-v1\0"
REPO="scottjazdzewski/rail-and-rye-website"
OWNER="scottjazdzewski"
ISSUE=183
BUCKET="rail-and-rye-private-cards"
R2_KEY="pick-tickets/interim/2026-11-23/revision-0001.json"
MAX_PLAIN=120000
TRACK_COUNTS={"Finger Lakes":(8,60),"Mahoning Valley":(10,92),
              "Mountaineer":(8,77),"Parx Racing":(9,65),"Zia Park":(10,73)}

def private_key():
    secret=os.environ.get("TRI_R2_SECRET_ACCESS_KEY","")
    if len(secret)<20:raise RuntimeError("Missing existing R2 cryptographic secret.")
    return PrivateKey(hashlib.sha256(CONTEXT+secret.encode("utf-8")).digest())

def public_key():
    key=base64.b64encode(bytes(private_key().public_key)).decode("ascii")
    print("PICK_PRIVATE_REVIEW_PUBLIC_KEY="+key)
    Path("pick-private-review-public-key.txt").write_text(key+"\n")
    
def validate(payload):
    if not isinstance(payload,dict) or payload.get("schema_version")!=1 or payload.get("product_type")!="pick_tickets_interim_pwin":
        raise ValueError("Wrong encrypted Pick Tickets review schema.")
    if payload.get("race_date")!="2026-11-23" or payload.get("revision")!=1:
        raise ValueError("Wrong source date or revision.")
    if payload.get("review_only") is not True or payload.get("customer_publish_approved") is not False or payload.get("source_status")!="PRESCRATCH_SCORES_PASSED__SCRATCHES_AND_BADGES_NOT_CERTIFIED":
        raise ValueError("No final/customer-certified scores permitted in private review lane.")
    source=payload.get("source") or {}
    if source.get("file_name")!="TRI_1123_PRESCRATCH_45_RACE_FULL_FIELD_REVIEW.json":
        raise ValueError("Unexpected original PWIN source identity.")
    tracks=payload.get("tracks")
    if not isinstance(tracks,list) or len(tracks)!=5:raise ValueError("Five real tracks required.")
    found=set();total=0
    for track in tracks:
        if not isinstance(track,dict) or track.get("track") not in TRACK_COUNTS:
            raise ValueError("Unknown track.")
        name=track["track"]
        if name in found:raise ValueError("Duplicate track.")
        found.add(name)
        races=track.get("races")
        expected_n,expected_runners=TRACK_COUNTS[name]
        if not isinstance(races,list) or len(races)!=expected_n:
            raise ValueError("Wrong race count.")
        used=set();runners=0
        for race in races:
            if not isinstance(race,dict):raise ValueError("Invalid race.")
            n=race.get("race_number")
            if type(n)!=int or not 1<=n<=expected_n or n in used:raise ValueError("Invalid/duplicate race.")
            used.add(n)
            entries=race.get("entries")
            if not isinstance(entries,list) or not 2<=len(entries)<=30:raise ValueError("Invalid field.")
            horses=set();mass=0
            for e in entries:
                if not isinstance(e,list) or len(e)!=3:raise ValueError("Exact source runner triplet required.")
                program,pwin,f4=e
                if not isinstance(program,str) or not re.fullmatch(r"\d{1,2}[A-Z]?",program) or program in horses:
                    raise ValueError("Invalid/duplicate program.")
                horses.add(program)
                for x in [pwin,f4]:
                    if isinstance(x,bool) or not isinstance(x,(int,float)) or not 0<=x<=100:
                        raise ValueError("Invalid probability.")
                if abs(pwin-100*f4)>1e-6:raise ValueError("PWIN/F4 source identity mismatch.")
                mass+=pwin
            if abs(mass-100)>1e-6:raise ValueError("PWIN race does not sum to 100%.")
            runners+=len(entries)
        if runners!=expected_runners:raise ValueError("Wrong runner count.")
        total+=runners
    if found!=set(TRACK_COUNTS) or total!=367:
        raise ValueError("Wrong track identities or 367-runner count.")
    return payload

def ingest():
    import boto3
    from botocore.exceptions import ClientError
    event=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    comment=event.get("comment") or {}
    if event.get("repository",{}).get("full_name")!=REPO or event.get("issue",{}).get("number")!=ISSUE or comment.get("user",{}).get("login")!=OWNER:
        raise PermissionError("Unauthorized private score transfer.")
    body=comment.get("body","")
    if not body.startswith(PREFIX+"\n"):raise ValueError("Wrong sealed score prefix.")
    encoded=body[len(PREFIX)+1:].strip()
    if not re.fullmatch(r"[A-Za-z0-9+/=]+",encoded) or len(encoded)>80000:
        raise ValueError("Invalid sealed score ciphertext.")
    sealed=base64.b64decode(encoded,validate=True)
    compressed=SealedBox(private_key()).decrypt(sealed)
    decompressor=zlib.decompressobj()
    raw=decompressor.decompress(compressed,MAX_PLAIN+1)
    if not decompressor.eof or decompressor.unused_data or len(raw)>MAX_PLAIN:
        raise ValueError("Decompressed source exceeded strict bounds.")
    data=validate(json.loads(raw))
    checksum=hashlib.sha256(raw).hexdigest()
    account=os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()
    access=os.environ["TRI_R2_ACCESS_KEY_ID"].strip()
    secret=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip()
    if not re.fullmatch(r"[0-9a-f]{32}",account) or not access or not secret:
        raise RuntimeError("R2 credentials missing.")
    s3=boto3.client("s3",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                    region_name="auto",aws_access_key_id=access,aws_secret_access_key=secret)
    try:
        prior=s3.get_object(Bucket=BUCKET,Key=R2_KEY)["Body"].read()
        if prior!=raw:raise RuntimeError("Existing private source review revision differs. No silent overwrite.")
        print("Private Pick Tickets prescratch PWIN review already present and byte-identical.")
        return
    except ClientError as e:
        if e.response.get("Error",{}).get("Code") not in ("NoSuchKey","404","NotFound"):raise
    s3.put_object(Bucket=BUCKET,Key=R2_KEY,Body=raw,ContentType="application/json; charset=utf-8",
                  CacheControl="private, no-store",Metadata={
                  "sha256":checksum,"review_only":"true","uploaded_at":datetime.now(timezone.utc).isoformat()})
    confirm=s3.get_object(Bucket=BUCKET,Key=R2_KEY)["Body"].read()
    if hashlib.sha256(confirm).hexdigest()!=checksum:raise RuntimeError("Private R2 readback failed.")
    print(f"SUCCESS: 367 real prescratch PWIN/F4 runner triplets across 45 races stored in private R2; SHA256={checksum}; review only.")

if __name__=="__main__":
    try:
        if len(sys.argv)>1 and sys.argv[1]=="public-key":public_key()
        elif len(sys.argv)>1 and sys.argv[1]=="ingest":ingest()
        else:raise ValueError("Use public-key or ingest.")
    except Exception as exc:
        print("PICK_PRIVATE_SCORE_TRANSFER_ERROR:",type(exc).__name__,str(exc)[:140],file=sys.stderr)
        sys.exit(1)

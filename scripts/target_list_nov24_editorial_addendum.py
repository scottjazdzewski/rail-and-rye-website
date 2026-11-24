#!/usr/bin/env python3
"""One-off 2026-11-24 private Target List addendum.

Merge a separately reviewed 7-race source with the previously published six
without changing ANY published favorite, attack, fair price, or original prose.
Only a sealed payload comes through the public GH issue-comment transport.
Everything remains private / non-customer-facing / prescratch.
"""
import base64
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from nacl.public import SealedBox
from target_list_private_review_bridge import private_key, validate_review

PREFIX = "RR_TARGET_1124_EDITORIAL_ADDENDUM_V1"
BUCKET = "rail-and-rye-private-cards"
DIR = "racing-intelligence/target-list-review/2026-11-24/"
ORIGINAL = DIR + "revision-0001.json"
SECOND = DIR + "revision-0002.json"
SOURCE_SHA = "7395a45700a3aa4fdf9f3dff05f393f7079adf4deb30cb2413aea7a78d4345c3"
PRIOR_EDITORIAL_SHA = "7636865e6f4fd950bbbb80a5a9c37711acc440533486bd501e0dcc92168adeb0"
ADDENDUM_EDITORIAL_SHA = "e6a8c96174ca562f2d592554c5362302f795837982341eeed7aa6e6980e7f612"
AUDIT_SHA = "e4ec222f6ac01fe2132c98c4715c584b262bfcdb8c4b253def88d85f5ef4a042"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def load_cipher():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    comment = event.get("comment") or {}
    issue = event.get("issue") or {}
    repo = event.get("repository") or {}
    require(repo.get("full_name") == "scottjazdzewski/rail-and-rye-website", "Repository authorization failed")
    require(issue.get("number") == 161 and comment.get("user", {}).get("login") == "scottjazdzewski", "Source authorization failed")
    body = comment.get("body", "")
    require(isinstance(body, str) and body.startswith(PREFIX + "\n"), "Wrong sealed editorial-update marker")
    encrypted = body[len(PREFIX)+1:].strip()
    require(re.fullmatch(r"[a-zA-Z0-9+/=]+", encrypted) is not None and len(encrypted) < 200000, "Invalid encrypted source")
    plain = SealedBox(private_key()).decrypt(base64.b64decode(encrypted, validate=True))
    require(len(plain) < 512 * 1024, "Editorial review exceeds size limit")
    incoming = validate_review(json.loads(plain))
    require(incoming["race_date"] == "2026-11-24" and incoming["revision"] == 1 and incoming["status"] == "initial", "Incoming edition mismatch")
    require(len(incoming["targets"]) == 7, "Expected exactly seven fresh source-reviewed candidates")
    src = incoming["source"]
    require(src.get("timeforms_zip_sha256") == SOURCE_SHA and src.get("editorial_sha256") == ADDENDUM_EDITORIAL_SHA and src.get("private_scorer_audit_sha256") == AUDIT_SHA, "Source/editorial/audit checksum mismatch")
    return incoming


def client():
    account = os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]
    require(re.fullmatch(r"[a-f0-9]{32}", account) is not None, "Cloudflare account ID invalid")
    return boto3.client("s3",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",region_name="auto",
        aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])


def racekey(item):
    return (item["track"].casefold(),item["race_number"])


def get_checked(s3,key):
    result=s3.get_object(Bucket=BUCKET,Key=key)
    raw=result["Body"].read()
    require(hashlib.sha256(raw).hexdigest() == (result.get("Metadata") or {}).get("sha256"), "Prior revision checksum invalid")
    return json.loads(raw)


def merge(existing, incoming):
    validate_review(existing)
    require(existing["race_date"] == "2026-11-24" and existing["status"] == "initial" and existing["revision"] == 1, "Original date/revision invalid")
    require(len(existing["targets"]) == 6 and existing["source"].get("timeforms_zip_sha256")==SOURCE_SHA and existing["source"].get("editorial_sha256")==PRIOR_EDITORIAL_SHA, "Unexpected original published card")
    old={racekey(t):t for t in existing["targets"]}
    new={racekey(t):t for t in incoming["targets"]}
    require(len(old)==6 and len(new)==7 and set(old)<set(new), "Incoming must preserve all six previously published races")
    differences=[]
    for key in old:
        for role in ("favorite","attack"):
            for field in ("program_number","horse_name","morning_line","win_probability","fair_odds"):
                if old[key][role].get(field)!=new[key][role].get(field):
                    differences.append((new[key]["rank"],role,field))
    require(differences == [(2,"favorite","fair_odds")], "Unexpected change to a published horse or probability")
    added_keys=set(new)-set(old)
    require(len(added_keys)==1, "Exactly one new qualifying race required")
    only=new[next(iter(added_keys))].copy()
    require(only.get("analysis") and len(only["analysis"])>125, "New selection lacks source-backed explanation")
    require(only["attack"]["win_probability"]-only["favorite"]["win_probability"]>=10, "New selection under 10pp display floor")
    prior_targets=sorted(existing["targets"],key=lambda t:t["rank"])
    require(sorted(t["rank"] for t in prior_targets)==list(range(1,7)), "Original ordering invalid")
    only["rank"]=7
    merged_targets=[*prior_targets,only]
    source=dict(existing["source"])
    source["initial_editorial_sha256"]=PRIOR_EDITORIAL_SHA
    source["addendum_editorial_sha256"]=ADDENDUM_EDITORIAL_SHA
    source["private_scorer_audit_sha256"]=AUDIT_SHA
    source["card_state"]="PRESCRATCH"
    source["editorial_checksum_basis"]="sha256 of newline-joined race IDs plus approved analyses in display order"
    editorial="\n".join(f"{t['track']}|{t['race_number']}|{t['analysis']}" for t in merged_targets)
    source["editorial_sha256"]=hashlib.sha256(editorial.encode()).hexdigest()
    combined={**existing,"revision":2,"status":"editorial_update","source":source,"targets":merged_targets}
    validate_review(combined)
    require(combined["review_only"] is True and combined["customer_publish_approved"] is False and combined["production_receipt_verified"] is False,"Customer publishing lock violated")
    return combined


def run():
    incoming=load_cipher()
    s3=client()
    original=get_checked(s3,ORIGINAL)
    card=merge(original,incoming)
    raw=json.dumps(card,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
    digest=hashlib.sha256(raw).hexdigest()
    try:
        current=s3.get_object(Bucket=BUCKET,Key=SECOND)
    except ClientError as e:
        require(e.response.get("Error",{}).get("Code") in ("NoSuchKey","404","NotFound"),"Cannot inspect existing revision 2")
    else:
        require(current["Body"].read()==raw,"An existing revision 2 cannot be replaced")
        print("PRIVATE_NOV24_TARGET_UPDATE_ALREADY_IDENTICAL: 7 selections, revision 2, preserved original 6")
        return
    s3.put_object(Bucket=BUCKET,Key=SECOND,Body=raw,ContentType="application/json; charset=utf-8",CacheControl="private, no-store",
      Metadata={"sha256":digest,"uploaded_at":datetime.now(timezone.utc).isoformat(),"review_only":"true", "editorial_sha256":card["source"]["editorial_sha256"]})
    check=get_checked(s3,SECOND)
    require(check==card,"Private R2 addendum readback failed")
    Path("/tmp/target-list-private-nov24-revision2.json").write_bytes(raw)
    print("PRIVATE_NOV24_TARGET_UPDATE_PASS: revision=2, targets=7, existing_unchanged=6, added=1, no scratches claimed, admin-only, readback_sha256="+digest)

if __name__ == "__main__":
    run()
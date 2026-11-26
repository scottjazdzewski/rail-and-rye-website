#!/usr/bin/env python3
"""Read-only reconciliation of USER-SUPPLIED Churchill scratches versus original TRI card.

This is NOT an official scratch feed and DOES NOT invoke TRI, edit R2, or publish.
It verifies the user's source transcription against immutable prescratch runner
identities and classifies surface transfers for future certified private replays.
Outputs only aggregate/race counts, never private probabilities or full fields.
"""
import argparse
import json
import os
from pathlib import Path
from collections import defaultdict,Counter
import re
import unicodedata

SOURCE=Path("research/pulse/2026-11-26-churchill-user-supplied.json")
BUCKET="rail-and-rye-private-cards"
DAY="2026-11-26"
BASE=f"race-day-pulse/prescratch/{DAY}/churchill-downs.json"
DASH=f"projections/dashboard/{DAY}/churchill-downs.json"

def require(condition,message):
    if not condition:raise RuntimeError(message)
def clean(value):
    return " ".join("".join(ch for ch in unicodedata.normalize("NFKD",str(value or "").casefold())
                      if not unicodedata.combining(ch)).split())
def program(value):
    return str(value).strip().upper()
def verify_fixture():
    data=json.loads(SOURCE.read_text(encoding="utf-8"))
    require(data.get("schema_version")==1 and data.get("race_date")==DAY,"Research fixture identity/date invalid")
    require(data.get("track")=="Churchill Downs" and data.get("track_code")=="CD","Research track mismatch")
    require(data.get("source_type")=="USER_SUPPLIED_LATE_CHANGES_TABLE","Fixture cannot claim official feed")
    require(data.get("source_is_automatically_polled") is False,"Do not mislabel feed authorization")
    scratches=data.get("scratches")
    require(isinstance(scratches,list) and len(scratches)==24,"User source scratch count mismatch")
    unique=set()
    grouped=defaultdict(list)
    for change in scratches:
        key=(change["race_number"],program(change["program_number"]))
        require(key not in unique,"Duplicate scratch program in race")
        unique.add(key)
        require(clean(change.get("horse_name")) and clean(change.get("reason")),"Incomplete supplied scratch")
        require(re.fullmatch(r"\d{2}:\d{2}",change["posted_et"]) is not None,"Bad ET time")
        grouped[change["race_number"]].append(change)
    require(sum(x["reason"]=="Off-Turf" for x in scratches)==13,"Off-turf count mismatch")
    require(sum(x["reason"]=="Also-Eligible" for x in scratches)==2,"AE count mismatch")
    require(sum(x["posted_et"]=="10:18" for x in scratches)==1,"Optical 10:18 separate revision missing")
    require(any(x["race_number"]==10 and program(x["program_number"])=="6" and
                clean(x["horse_name"])=="optical" and x["posted_et"]=="10:18" for x in scratches),
            "Incremental Optical time/person identity missing")
    other=data.get("other_changes")
    require(isinstance(other,list) and len(other)==6,"Other race changes count mismatch")
    require(sorted(x["race_number"] for x in other if x["type"]=="TURF_TO_DIRT")==[5,12],
            "Race 5/12 surface changes must be retained")
    require(sorted(x["race_number"] for x in other if x["type"]=="TEMP_RAIL_24_FT")==[5,9,12],
            "Temp rail entry-time notes mismatched")
    require(any(x["race_number"]==6 and x["type"]=="FIRST_START_SINCE_GELDING"
                and program(x["program_number"])=="5" and clean(x["horse_name"])=="chrome" for x in other),
            "Race 6 gelding notice missing")
    print("CHURCHILL_USER_SOURCE_FIXTURE_PASS date={} scratches={} off_turf={} listed_ae={} changes={} last_change=10:18_ET".format(
        DAY,len(scratches),13,2,len(other)))
    return data,grouped

def audit(original,data,grouped,source):
    require(original.get("schema_version")==1 and original.get("race_date")==DAY and
            original.get("track_name")=="Churchill Downs" and
            original.get("projection_status")=="prescratch",
            "Private preserved original not a certified Churchill prescratch card")
    receipts=original.get("model_receipts") or {}
    require(all(re.fullmatch("[0-9a-fA-F]{64}",str(receipts.get(k,""))) for k in ("tri_sha256","f4_sha256")),
            "Original score receipt invalid")
    races=original.get("races")
    require(isinstance(races,list) and len(races)>=12,"Prescratch card lacks complete races 1–12")
    byrace={int(x["race_number"]):x for x in races}
    require(all(i in byrace for i in range(1,13)),"Original missing Churchill races 1–12")
    counts=Counter()
    for n in sorted(grouped):
        race=byrace[n]
        entries=race.get("entries",[])
        runners={program(x.get("program_number")):x for x in entries}
        require(len(runners)==len(entries),"Duplicate original active program number in race {}".format(n))
        active=missing_ae=other_absent=names_wrong=0
        for x in grouped[n]:
            key=program(x["program_number"])
            old=runners.get(key)
            if old is None:
                if x["reason"]=="Also-Eligible":missing_ae+=1
                else:other_absent+=1
            elif clean(old.get("horse_name"))!=clean(x["horse_name"]):
                names_wrong+=1
            else:
                active+=1
        surface=str(race.get("surface") or "")
        transfer=n in (5,12)
        print("CHURCHILL_ORIGINAL_RACE race={} source_field={} supplied_scratches={} active_name_matched={} listed_ae_not_in_original={} missing_other={} wrong_name={} original_surface={} surface_transfer_qa={}".format(
            n,len(entries),len(grouped[n]),active,missing_ae,other_absent,names_wrong,
            re.sub(r'[^a-zA-Z0-9_-]','',surface)[:28] or "UNKNOWN",
            "REQUIRES_CERTIFIED_TURF_TO_DIRT_REPLAY" if transfer else "NO_COURSE_TRANSFER_REPORTED"))
        counts.update({"matches":active,"listed_ae_not_in_original":missing_ae,"missing_other":other_absent,"name_mismatches":names_wrong})
    r10=byrace[10]
    print("CHURCHILL_INCREMENTAL_TEST race=10 initial_reported=09:00 later_reported=10:18 verification=SEPARATE_REVISION_REQUIRED")
    print("CHURCHILL_SURFACE_TEST races=5,12 policy=HOLD_SCRATCH_ONLY_NARRATIVE require_turf_to_dirt_recalculation=true")
    print("CHURCHILL_GELDING_TEST race=6 program=5 reason=FIRST_START_SINCE_GELDING policy=ANNOTATION_ONLY_NO_AUTOMATIC_SCORER_CHANGE")
    print("CHURCHILL_ORIGINAL_AUDIT_SUMMARY matched={} listed_ae_excluded={} missing_non_ae={} name_mismatches={} source={} writes=0".format(
        counts["matches"],counts["listed_ae_not_in_original"],counts["missing_other"],
        counts["name_mismatches"],source))
    return counts

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--fixture-only",action="store_true")
    args=parser.parse_args()
    data,grouped=verify_fixture()
    if args.fixture_only:return
    import boto3
    client=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
    source=BASE
    try:
        out=client.get_object(Bucket=BUCKET,Key=source)
    except Exception as e:
        raise RuntimeError("Private prescratch archive unavailable (no fallback to current scratch-final): "+type(e).__name__)
    original=json.loads(out["Body"].read(1_100_000))
    totals=audit(original,data,grouped,"PRIVATE_IMMUTABLE_PRESCRATCH")
    if totals["missing_other"] or totals["name_mismatches"]:
        print("CHURCHILL_AUDIT_STATUS=REVIEW_REQUIRED no_publishing=true")
    else:
        print("CHURCHILL_AUDIT_STATUS=ORIGINAL_IDENTITY_MATCHED pending_certified_scratch_final=true no_publishing=true")

if __name__=="__main__":
    main()

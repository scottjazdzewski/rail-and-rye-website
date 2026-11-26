#!/usr/bin/env python3
"""Read-only QA of Timeform-derived schedule fields in private R2.

Purpose: prove the Pulse 9AM-to-last-post clock parses authentic publication
output before activating any authorized, external scratch polling source.
This script NEVER accesses Equibase, writes R2, runs TRI, prints horse data,
or republishes licensed information. Only counts/last ET post are reported.
"""
import datetime as dt
import json
import os
import re
from collections import Counter

BUCKET = "rail-and-rye-private-cards"
DATES = [d for d in os.getenv("PULSE_CALIBRATION_DATES","2026-11-24,2026-11-25,2026-11-26").split(",")
         if re.fullmatch(r"\d{4}-\d{2}-\d{2}",d)]
assert 1 <= len(DATES) <= 12
POST_AMPM = re.compile(r"^(\d{1,2}):(\d{2})\s*(AM|PM)$")
POST_24 = re.compile(r"^(\d{1,2}):(\d{2})$")
KEY_RE = re.compile(r"^[a-z0-9-]+\.json$")

def parse_post(value):
    if not isinstance(value,str):return None
    value = re.sub(r"\s+(?:EST|EDT|ET)$","",value.strip().upper())
    m = POST_AMPM.fullmatch(value)
    if m:
        h,mn=int(m[1]),int(m[2])
        if h<1 or h>12 or mn>59:return None
        h=(h%12)+(12 if m[3]=="PM" else 0)
    else:
        m=POST_24.fullmatch(value)
        if not m:return None
        h,mn=int(m[1]),int(m[2])
        if h>23 or mn>59:return None
    return h*60+mn+(1440 if h<3 else 0)

def iter_objects(client,prefix):
    token=None
    while True:
        kwargs={"Bucket":BUCKET,"Prefix":prefix,"MaxKeys":100}
        if token:kwargs["ContinuationToken"]=token
        result=client.list_objects_v2(**kwargs)
        for obj in result.get("Contents",[]):
            key=obj.get("Key","")
            if key.startswith(prefix) and KEY_RE.fullmatch(key[len(prefix):]):
                yield key
        token=result.get("NextContinuationToken")
        if not token:break

def audit_day(client,date):
    prefix=f"projections/dashboard/{date}/"
    counts=Counter()
    last=None
    for key in iter_objects(client,prefix):
        counts["tracks"]+=1
        try:
            response=client.get_object(Bucket=BUCKET,Key=key)
            card=json.loads(response["Body"].read(1_100_000))
            if card.get("race_date")!=date or not isinstance(card.get("races"),list):
                counts["invalid_track"]+=1
                continue
            for race in card["races"]:
                counts["races"]+=1
                if race.get("cancelled") or race.get("status")=="cancelled":
                    counts["cancelled"]+=1
                    continue
                post=parse_post(race.get("post_time_et"))
                if post is None:
                    counts["invalid_post"]+=1
                elif post < 9*60:
                    counts["before_9am"]+=1
                else:
                    counts["parsed_post"]+=1
                    last=max(last or 0,post)
        except Exception:
            counts["invalid_track"]+=1
    last_str=(f"{last//60%24:02d}:{last%60:02d}"+(" ET NEXT DAY" if last>=1440 else " ET")) if last else "NONE"
    print(f"PULSE_SOURCE_SCHEDULE date={date} tracks={counts['tracks']} races={counts['races']}"
          f" parsed_post={counts['parsed_post']} invalid_post={counts['invalid_post']}"
          f" cancelled={counts['cancelled']} invalid_track={counts['invalid_track']}"
          f" last_post={last_str}")
    return counts,last

def main():
    try:
        import boto3
        c=boto3.client("s3",region_name="auto",
            endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
    except Exception:
        print("PULSE_SOURCE_SCHEDULE status=NOT_RUN unavailable_credentials_or_boto3")
        return
    days=0
    for date in DATES:
        try:
            counts,last=audit_day(c,date)
            if counts["tracks"] and last is not None and not counts["invalid_track"] and not counts["invalid_post"]:
                days+=1
        except Exception as e:
            print(f"PULSE_SOURCE_SCHEDULE date={date} status=UNAVAILABLE reason={type(e).__name__}")
    print(f"PULSE_SOURCE_SCHEDULE days_with_complete_parse={days}/{len(DATES)} status=READ_ONLY")
if __name__=="__main__":
    main()

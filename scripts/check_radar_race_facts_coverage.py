#!/usr/bin/env python3
"""Read-only coverage audit for original Nov 23 Radar race facts.
Prints aggregate counts only, never horse identities, prices, cards or JSON.
"""
import json
import os
import re
import unicodedata
import boto3

DATE="2026-11-23"
BUCKET="rail-and-rye-private-cards"
RADAR_KEY="racing-intelligence/longshot-radar-pdf-review/2026-11-23/revision-0001.json"
PREFIX=f"projections/dashboard/{DATE}/"

def track_name(text):
    s=unicodedata.normalize("NFD",str(text or "").lower())
    s="".join(c for c in s if unicodedata.category(c)!="Mn")
    return re.sub(r"[^a-z0-9]+"," ",s).strip()

def horse_name(text):
    s=unicodedata.normalize("NFD",str(text or "").lower())
    s="".join(c for c in s if unicodedata.category(c)!="Mn")
    return " ".join(s.split())

def main():
    s3=boto3.client("s3",
      endpoint_url=f"https://{os.environ['TRI_CLOUDFLARE_ACCOUNT_ID']}.r2.cloudflarestorage.com",
      aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],
      aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"],
      region_name="auto")
    published=json.loads(s3.get_object(Bucket=BUCKET,Key=RADAR_KEY)["Body"].read())
    assert published.get("race_date")==DATE
    assert published.get("status")=="published_pdf_reference"
    candidates=published.get("candidates") or []
    assert len(candidates)==10,"Published Radar expected 10 original source rows"
    facts={}
    conflicts=set()
    paginator=s3.get_paginator("list_objects_v2")
    files=0
    for response in paginator.paginate(Bucket=BUCKET,Prefix=PREFIX):
        for item in response.get("Contents",[]):
            key=item["Key"]
            if not key.endswith(".json"):continue
            source=json.loads(s3.get_object(Bucket=BUCKET,Key=key)["Body"].read())
            if source.get("race_date")!=DATE or source.get("schema_version")!=1:continue
            track=track_name(source.get("track_name"))
            if not track:continue
            files+=1
            for race in source.get("races",[]):
                number=race.get("race_number")
                if not isinstance(number,int) or not isinstance(race.get("entries"),list):continue
                identity=(track,number)
                if identity in conflicts:continue
                if identity in facts:
                    conflicts.add(identity)
                    facts.pop(identity,None)
                    continue
                info={k:v.strip() for k,v in
                  ((k,race.get(k)) for k in ("distance","surface","conditions"))
                  if isinstance(v,str) and v.strip()}
                horses={(str(x.get("program_number","")).strip().upper(),horse_name(x.get("horse_name")))
                  for x in race["entries"] if isinstance(x,dict)}
                if info and horses:facts[identity]=(info,horses)
    counts={"matched_source_runners":0,"distance":0,"surface":0,"conditions":0,"all_three":0}
    for candidate in candidates:
        key=(track_name(candidate.get("track")),candidate.get("race_number"))
        v=facts.get(key)
        runner=(str(candidate.get("program_number","")).strip().upper(),horse_name(candidate.get("horse_name")))
        if not v or runner not in v[1]:continue
        counts["matched_source_runners"]+=1
        data=v[0]
        for field in ("distance","surface","conditions"):
            if field in data:counts[field]+=1
        if all(field in data for field in ("distance","surface","conditions")):
            counts["all_three"]+=1
    print("READ-ONLY RACE FACT COVERAGE: "+json.dumps({
        "published_rows":len(candidates),"frozen_source_track_files":files,**counts
    },sort_keys=True))
    assert counts["matched_source_runners"]==10,"Original published runners do not all match private source"
    assert counts["conditions"]>0,"No source race conditions are available"
    print("PASS: real published horse identities match original private source; no racing data modified.")

if __name__=="__main__":
    main()

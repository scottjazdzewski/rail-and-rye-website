#!/usr/bin/env python3
"""Read-only private R2 audit of November 24 Radar's actual race-header coverage.
Logs ONLY aggregate counts (no horse names, odds, source cards or user data).
Does not mutate private source, TRI, F4 or Radar editions.
"""
import json
import os
import re
import unicodedata
import boto3

DATE="2026-11-24"
BUCKET="rail-and-rye-private-cards"
RADAR=f"intelligence/longshot-radar/review/{DATE}.json"
PREFIX=f"projections/dashboard/{DATE}/"

def norm(value):
    s=unicodedata.normalize("NFD",str(value or "").casefold())
    s="".join(c for c in s if unicodedata.category(c)!="Mn")
    return re.sub(r"[^a-z0-9]+"," ",s).strip()
def horse(value):
    s=unicodedata.normalize("NFD",str(value or "").casefold())
    return " ".join(c for c in s if unicodedata.category(c)!="Mn").split()
def horse_key(value):
    return " ".join(horse(value))

def main():
    s3=boto3.client("s3",
        endpoint_url=f"https://{os.environ['TRI_CLOUDFLARE_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        region_name="auto",
        aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
    def read(key):
        return json.loads(s3.get_object(Bucket=BUCKET,Key=key)["Body"].read())
    edition=read(RADAR)
    if edition.get("race_date")!=DATE or not isinstance(edition.get("candidates"),list):
        raise RuntimeError("Private date/source mismatch")
    rows=edition["candidates"]
    facts,ambiguous={},set()
    listed=s3.list_objects_v2(Bucket=BUCKET,Prefix=PREFIX,MaxKeys=1000)
    if listed.get("IsTruncated"):
        raise RuntimeError("Private projections listing is incomplete")
    source_files=0
    for obj in listed.get("Contents",[]):
        key=obj["Key"]
        if not key.endswith(".json"):continue
        card=read(key)
        if card.get("race_date")!=DATE or card.get("schema_version")!=1 or not isinstance(card.get("races"),list):
            continue
        source_files+=1
        track=norm(card.get("track_name"))
        for race in card["races"]:
            number=race.get("race_number")
            if not track or type(number)!=int or not isinstance(race.get("entries"),list):continue
            ident=(track,number)
            if ident in ambiguous:continue
            if ident in facts:
                facts.pop(ident,None)
                ambiguous.add(ident)
                continue
            fields={k:race[k].strip() for k in ("distance","surface","conditions","race_name","stakes_name","stakes_grade")
               if isinstance(race.get(k),str) and race[k].strip()}
            runners={(str(r.get("program_number","")).strip().upper(),horse_key(r.get("horse_name")))
                for r in race["entries"] if isinstance(r,dict)}
            if fields and runners:facts[ident]=(fields,runners)
    count={"selected":len(rows),"source_files":source_files,"runner_matches":0,"distance":0,"surface":0,
           "conditions":0,"named_stakes_or_race":0,"full_second_line":0}
    for candidate in rows:
        ident=(norm(candidate.get("track")),candidate.get("race_number"))
        record=facts.get(ident)
        row=(str(candidate.get("program_number","")).strip().upper(),horse_key(candidate.get("horse_name")))
        if not record or row not in record[1]:continue
        count["runner_matches"]+=1
        fields=record[0]
        for field in ("distance","surface","conditions"):
            if fields.get(field):count[field]+=1
        if fields.get("stakes_name") or fields.get("race_name"):count["named_stakes_or_race"]+=1
        if any(fields.get(k) for k in ("distance","surface","conditions","race_name","stakes_name")):
            count["full_second_line"]+=1
    print("RADAR_NOV24_SOURCE_RACE_HEADER_COVERAGE="+json.dumps(count,sort_keys=True))
    if count["runner_matches"]!=len(rows):
        raise RuntimeError("An approved Radar candidate is missing exact frozen-source race/horse identity")
    if len(rows) and count["full_second_line"]==0:
        raise RuntimeError("No source-backed header fields are available; cannot claim banner parity")
    print("PASS: Current Radar race facts are present in signed private projection sources; no data altered.")

if __name__=="__main__":
    main()

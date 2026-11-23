#!/usr/bin/env python3
"""November 24 Radar: read-only check of existing trusted R2 scoring delivery.

Never exports horses, model values, original source PDFs or private R2 credentials.
This is a readiness probe, not a model scorer, editorial approval or publication.
"""
import json
import math
import os
import re
import sys

import boto3
from botocore.exceptions import ClientError

DATE="2026-11-24"
EXPECTED={
 "delta downs":8,
 "finger lakes":8,
 "mountaineer":8,
 "mahoning valley":8,
 "parx racing":9,
 "zia park":10,
}
PRIVATE_BUCKET="rail-and-rye-private-cards"
PREFIX="projections/dashboard/"+DATE+"/"
RADAR_REVIEW="intelligence/longshot-radar/review/"+DATE+".json"

def normalize(v):
 return re.sub(r"[^a-z0-9]+"," ",str(v or "").lower()).strip()

def get_client():
 values=[os.getenv(k,"") for k in
   ("TRI_CLOUDFLARE_ACCOUNT_ID","TRI_R2_ACCESS_KEY_ID","TRI_R2_SECRET_ACCESS_KEY")]
 if not all(values):
  raise RuntimeError("R2_READ_CREDENTIALS_NOT_CONFIGURED")
 return boto3.client("s3",endpoint_url=f"https://{values[0]}.r2.cloudflarestorage.com",
   aws_access_key_id=values[1],aws_secret_access_key=values[2],region_name="auto")

def main():
 client=get_client()
 cards={}
 invalid=0
 listed=client.list_objects_v2(Bucket=PRIVATE_BUCKET,Prefix=PREFIX,MaxKeys=1000)
 if listed.get("IsTruncated"):
  raise RuntimeError("PROJECTION_SOURCE_LIST_INCOMPLETE")
 for object_ in listed.get("Contents",[]):
  key=object_.get("Key","")
  if not key.startswith(PREFIX) or not key.endswith(".json"):continue
  try:
   card=json.loads(client.get_object(Bucket=PRIVATE_BUCKET,Key=key)["Body"].read())
   if (card.get("schema_version")!=1 or card.get("race_date")!=DATE or
       card.get("projection_status")!="prescratch"):
    invalid+=1
    continue
   name=normalize(card.get("track_name"))
   if name not in EXPECTED or name in cards:
    invalid+=1
    continue
   races=card.get("races")
   if not isinstance(races,list) or len(races)!=EXPECTED[name]:
    invalid+=1
    continue
   bad=False
   for race in races:
    entries=race.get("entries") if isinstance(race,dict) else None
    if not isinstance(entries,list) or not entries:
     bad=True;break
    prob=0
    for x in entries:
     if (not isinstance(x,dict) or not isinstance(x.get("win_probability_exact"),(int,float)) or
         not math.isfinite(x["win_probability_exact"])):
      bad=True;break
     exact=x["win_probability_exact"]
     f4=x.get("f4_probabilities") or {}
     p1=f4.get("exact_p1")
     if (not isinstance(p1,(float,int)) or not math.isfinite(p1) or
         abs(p1*100-exact)>1e-6):
      bad=True;break
     prob+=exact
    if bad or abs(prob-100)>1e-6:
     bad=True;break
   if bad:
    invalid+=1
    continue
   cards[name]={"races":len(races),"runners":sum(len(x["entries"]) for x in races)}
  except (ValueError,TypeError,KeyError):
   invalid+=1
 if invalid:
  print("HOLD: at least one date-matching projection file failed source/field integrity checks (count="+str(invalid)+")")
 try:
  client.head_object(Bucket=PRIVATE_BUCKET,Key=RADAR_REVIEW)
  radar_review_present=True
 except ClientError as e:
  if e.response.get("Error",{}).get("Code") not in ("NoSuchKey","404","NotFound"):
   raise
  radar_review_present=False
 counts={k:v for k,v in cards.items()}
 summary={"date":DATE,"expected_tracks":len(EXPECTED),
   "expected_races":sum(EXPECTED.values()),"matching_scored_tracks":len(cards),
   "matching_scored_races":sum(v["races"] for v in cards.values()),
   "matching_scored_runners":sum(v["runners"] for v in cards.values()),
   "malformed_source_objects":invalid,
   "radar_review_present":radar_review_present,
   "missing_tracks":sorted(set(EXPECTED)-set(cards))}
 print("PRIVATE SOURCE READINESS: "+json.dumps(summary,sort_keys=True))
 if invalid or len(cards)<len(EXPECTED):
  print("HOLD: November 24 exact-date frozen TRI/F4 fields not complete in private R2.")
  return 2
 if not radar_review_present:
  print("HOLD: scored field structure exists, but no Radar edition/editorial release is in private R2.")
  print("Never generate a Radar pick from source presence alone.")
  return 2
 print("SOURCE PRESENT, EDITORIAL R2 OBJECT PRESENT — independent signed receipts/editorial QA still required.")
 return 0

if __name__=="__main__":
 try:sys.exit(main())
 except Exception as ex:
  print("READINESS_CHECK_FAILED: "+type(ex).__name__+": "+str(ex)[:90],file=sys.stderr)
  sys.exit(3)

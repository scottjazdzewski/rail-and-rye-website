#!/usr/bin/env python3
"""Read-only verification of Nov 24's real private Radar edition and 6-track TRI source.

No proprietary horse names, prices, analysis, runner rows, or receipts are printed.
Does not update source data, publish a second edition, or enable customer access.
"""
import json
import math
import os
import re
from collections import Counter
import boto3

DATE="2026-11-24"
BUCKET="rail-and-rye-private-cards"
REVIEW=f"intelligence/longshot-radar/review/{DATE}.json"
COVERAGE=f"intelligence/longshot-radar/coverage/{DATE}.json"
PREFIX=f"projections/dashboard/{DATE}/"
TRACKS={
 "delta downs":(8,65,1),
 "finger lakes":(8,65,0),
 "mahoning valley":(8,67,2),
 "mountaineer":(8,66,3),
 "parx racing":(9,74,0),
 "zia park":(10,93,4),
}
def check(condition,msg):
 if not condition:raise RuntimeError(msg)
def norm(text):
 return re.sub(r"[^a-z0-9]+"," ",str(text or "").casefold()).strip()

def main():
 values=[os.environ.get(x,"").strip() for x in ("TRI_CLOUDFLARE_ACCOUNT_ID","TRI_R2_ACCESS_KEY_ID","TRI_R2_SECRET_ACCESS_KEY")]
 check(all(values),"Private source credentials unavailable")
 s3=boto3.client("s3",endpoint_url=f"https://{values[0]}.r2.cloudflarestorage.com",
  region_name="auto",aws_access_key_id=values[1],aws_secret_access_key=values[2])

 def read(key):
  return json.loads(s3.get_object(Bucket=BUCKET,Key=key)["Body"].read())

 edition=read(REVIEW)
 check(edition.get("schema_version")==1 and edition.get("product_type")=="longshot_radar" and
       edition.get("race_date")==DATE and edition.get("status")=="prescratch" and edition.get("revision")==1,
       "Private Radar edition identity or status differs from approved release")
 candidates=edition.get("candidates")
 check(isinstance(candidates,list) and len(candidates)==10,"Private Radar must contain all 10 approved selections")
 check((edition.get("receipts") or {}).get("release_status")=="PASS","Private Radar does not carry approved receipt")

 coverage=read(COVERAGE)
 check(coverage.get("race_date")==DATE and coverage.get("review_only") is True and
       coverage.get("customer_publish_approved") is False,"Private-only six-track coverage gate failed")
 check(coverage.get("numeric_qualifiers")==12 and coverage.get("editorially_held")==2 and
       coverage.get("approved_candidates")==10,"Numeric/held/editorial total mismatch")
 counts=coverage.get("tracks") or {}
 check(set(counts)==set(TRACKS),"Missing track in private Radar coverage")
 for track,(race_count,_,selected) in TRACKS.items():
  check(counts[track]=={"scored_races":race_count,"selected":selected},
        "Stored track coverage does not match reviewed source")

 listed=s3.list_objects_v2(Bucket=BUCKET,Prefix=PREFIX,MaxKeys=1000)
 check(not listed.get("IsTruncated"),"Private TRI card source listing incomplete")
 src={}
 races=0
 runners=0
 for obj in listed.get("Contents",[]):
  if not obj["Key"].endswith(".json"):continue
  card=read(obj["Key"])
  check(card.get("schema_version")==1 and card.get("race_date")==DATE and
        card.get("projection_status")=="prescratch","Private TRI source version changed")
  track=norm(card.get("track_name"))
  check(track in TRACKS and track not in src,"Unexpected or duplicate private TRI track")
  rs=card.get("races")
  check(isinstance(rs,list) and len(rs)==TRACKS[track][0],"Frozen TRI race count changed")
  lookup={}
  n=0
  for race in rs:
   entries=race.get("entries")
   check(isinstance(entries,list) and bool(entries),"Missing TRI full-field race")
   p=0.0
   for runner in entries:
    exact=runner.get("win_probability_exact")
    f4=(runner.get("f4_probabilities") or {}).get("exact_p1")
    check(type(exact) in (int,float) and math.isfinite(exact) and
          type(f4) in (int,float) and abs(100*f4-exact)<1e-6,
          "Full-field TRI/F4 mismatch")
    p+=exact
    horse=(race["race_number"],str(runner["program_number"]).strip().upper(),norm(runner["horse_name"]))
    check(horse not in lookup,"Duplicate TRI horse identity")
    lookup[horse]=runner
   check(abs(p-100)<1e-6,"Full field exact probabilities do not sum to 100")
   n+=len(entries)
  check(n==TRACKS[track][1],"Private TRI track runner count changed")
  src[track]=lookup
  races+=len(rs);runners+=n
 check(set(src)==set(TRACKS) and races==51 and runners==430,"All six TRI fields must remain complete")

 counter=Counter()
 unique=set()
 for selection in candidates:
  track=norm(selection.get("track"))
  identity=(selection.get("race_number"),str(selection.get("program_number","")).strip().upper(),norm(selection.get("horse_name")))
  check(track in src and identity in src[track] and (track,identity) not in unique,
        "Published selection does not match frozen source horse identity")
  unique.add((track,identity))
  original=src[track][identity]
  exact=original["win_probability_exact"]/100
  check(type(selection.get("pwin_exact")) in (int,float) and
        abs(selection["pwin_exact"]-exact)<1e-10 and
        abs(selection.get("pwin_display",-999)-original["win_probability"])<1e-9,
        "Published PWIN differs from source")
  ml=selection.get("original_morning_line")
  def price(v):
   m=re.fullmatch(r"(\d+)\s*[-/]\s*(\d+)",str(v or ""))
   return None if not m or int(m[2])==0 else int(m[1])/int(m[2])
  a=price(ml);b=price(original.get("morning_line"))
  check(a is not None and b is not None and abs(a-b)<1e-10 and a>=6 and
        exact>=1/7-1e-12 and exact*(1+a)-1>=.5-1e-12,
        "Published source ML or value gate changed")
  check(all(isinstance(selection.get(k),str) and selection[k].strip()
     for k in ("betting_case","source_causal_evidence","counterargument_checked")),
     "Published review analysis is incomplete")
  counter[track]+=1
 check(all(counter[track]==TRACKS[track][2] for track in TRACKS),
       "Published horse totals do not match 6-track coverage")
 print("PASS: November 24 private Radar readback: 10/10 selections, 6/6 tracks audited, 51 races, 430 full-field runners, 12 numeric qualifiers, 2 editorial holds.")
 print("PASS: exact frozen TRI PWIN, original Timeform ML, F4, analysis and six-track coverage verified; customer access remains disabled.")

if __name__=="__main__":main()

#!/usr/bin/env python3
"""Read-only Nov 24 TRI/Longshot availability gate; emits ONLY aggregate counts.
Source files remain in private R2; no score generation, data edit, or leak.
"""
import boto3,os,json,hashlib
DATE="2026-11-24"
BUCKET="rail-and-rye-private-cards"
PREFIX=f"projections/dashboard/{DATE}/"
EXPECTED={"Parx Racing","Zia Park","Delta Downs","Finger Lakes","Mahoning Valley","Mountaineer"}
def main():
 s3=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
 objects=[]
 paginator=s3.get_paginator("list_objects_v2")
 for pg in paginator.paginate(Bucket=BUCKET,Prefix=PREFIX):
  objects += [z["Key"] for z in pg.get("Contents",[]) if z["Key"].endswith(".json")]
 counts={"source_date":DATE,"card_files":len(objects),"valid_track_cards":0,"races":0,"runners":0,"all_races_full_field_exact":True,"candidate_numeric_eligible":0,"missing_tracks":[],"present_tracks":[],"unreadable":0,"prescratch":0,"scratch_final":0}
 tracks=set()
 for key in objects:
  try:
   src=json.loads(s3.get_object(Bucket=BUCKET,Key=key)["Body"].read())
   if src.get("race_date")!=DATE or src.get("schema_version")!=1 or not isinstance(src.get("races"),list):raise ValueError("invalid card")
   track=src.get("track_name")
   if not isinstance(track,str) or not track.strip():raise ValueError("no track")
   tracks.add(track);counts["valid_track_cards"]+=1
   if src.get("projection_status")=="prescratch":counts["prescratch"]+=1
   if src.get("projection_status")=="scratch_final":counts["scratch_final"]+=1
   for race in src["races"]:
    runners=race.get("entries")
    if not isinstance(runners,list) or not runners:counts["all_races_full_field_exact"]=False;continue
    counts["races"]+=1;counts["runners"]+=len(runners)
    exact=[r.get("win_probability_exact") for r in runners]
    if any(not isinstance(v,(int,float)) or isinstance(v,bool) or v<0 or v>100 for v in exact) or abs(sum(v for v in exact if isinstance(v,(float,int)))-100)>1e-6:
     counts["all_races_full_field_exact"]=False
     continue
    for r in runners:
     ml=str(r.get("morning_line","")).replace("-","/")
     try:
      num,den=map(int,ml.split("/"))
      p=float(r["win_probability_exact"])/100
      if den>0 and num/den>=6 and p>=1/7 and p*(1+num/den)-1>=.50:counts["candidate_numeric_eligible"]+=1
     except (ValueError,KeyError,TypeError,ZeroDivisionError):pass
  except (ValueError,TypeError,KeyError,Exception) as exc:
   counts["unreadable"]+=1
 counts["present_tracks"]=sorted(tracks)
 counts["missing_tracks"]=sorted(EXPECTED-tracks)
 for prefix,label in [
  (f"racing-intelligence/longshot-radar-pdf-review/{DATE}/","published_pdf_reference_files"),
  (f"intelligence/longshot-radar/review/{DATE}.json","certified_radar_review_files")]:
  if prefix.endswith(".json"):
   try:s3.head_object(Bucket=BUCKET,Key=prefix);counts[label]=1
   except Exception:counts[label]=0
  else:
   pg=s3.list_objects_v2(Bucket=BUCKET,Prefix=prefix,MaxKeys=5)
   counts[label]=len(pg.get("Contents",[]))
 print("READ_ONLY_1124_SOURCE_STATUS="+json.dumps(counts,sort_keys=True))
 complete=counts["valid_track_cards"]==6 and not counts["missing_tracks"] and counts["all_races_full_field_exact"] and counts["races"]>=6
 print("VERDICT="+("SCORED_SOURCE_AVAILABLE_FOR_RADAR_REVIEW" if complete else "HOLD_MISSING_VERIFIED_FULL_FIELD_TRI_SOURCE"))
if __name__=="__main__": main()

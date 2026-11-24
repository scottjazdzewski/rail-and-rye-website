#!/usr/bin/env python3
"""Export only source-numeric November 24 Radar candidates as sealed ciphertext.

The public repository and CI logs never receive horse names, PWIN, model output
or race conditions in plaintext. This is NOT Radar editorial certification.
"""
import base64,hashlib,json,math,os,re
from decimal import Decimal
from pathlib import Path
import boto3
from nacl.public import PublicKey,SealedBox
DATE="2026-11-24"
BUCKET="rail-and-rye-private-cards"
PREFIX=f"projections/dashboard/{DATE}/"
PUBKEY="0glaEtV+6w8zLhBOkELW1oPXAFdINn2o7DJtoj6LZHA="
EXPECTED={"delta downs":(8,65),"finger lakes":(8,65),"mahoning valley":(8,67),
          "mountaineer":(8,66),"parx racing":(9,74),"zia park":(10,93)}
def norm(value):return re.sub(r"[^a-z0-9]+"," ",str(value or "").lower()).strip()
def require(ok,reason):
 if not ok:raise RuntimeError(reason)
def main():
 creds=[os.getenv(k,"") for k in ("TRI_CLOUDFLARE_ACCOUNT_ID","TRI_R2_ACCESS_KEY_ID","TRI_R2_SECRET_ACCESS_KEY")]
 require(all(creds),"R2 credentials missing")
 s3=boto3.client("s3",endpoint_url=f"https://{creds[0]}.r2.cloudflarestorage.com",
                 region_name="auto",aws_access_key_id=creds[1],aws_secret_access_key=creds[2])
 listed=s3.list_objects_v2(Bucket=BUCKET,Prefix=PREFIX,MaxKeys=1000)
 require(not listed.get("IsTruncated"),"Incomplete source listing")
 tracks={}; candidates=[];race_total=0;runner_total=0;source_hashes={}
 for item in listed.get("Contents",[]):
  key=item["Key"]
  if not key.endswith(".json"):continue
  raw=s3.get_object(Bucket=BUCKET,Key=key)["Body"].read()
  source=json.loads(raw)
  require(source.get("schema_version")==1 and source.get("race_date")==DATE and
          source.get("projection_status")=="prescratch","Invalid source state")
  name=str(source.get("track_name","")); n=norm(name)
  require(n in EXPECTED and n not in tracks,"Duplicate/unexpected track")
  races=source.get("races")
  require(isinstance(races,list) and len(races)==EXPECTED[n][0],"Track race count mismatch")
  count=0
  for race in races:
   entries=race.get("entries")
   require(isinstance(entries,list) and bool(entries),"Missing whole race field")
   exact=[r.get("win_probability_exact") for r in entries]
   require(all(type(p) in (int,float) and math.isfinite(p) and 0<=p<=100 for p in exact) and
       abs(math.fsum(exact)-100)<1e-6,"TRI full-field PWIN mass invalid")
   seen=set()
   for runner,pwin in zip(entries,exact):
    num=str(runner.get("program_number","")).strip().upper()
    horse=str(runner.get("horse_name","")).strip()
    require(num and horse and (num,horse) not in seen,"Duplicate/incomplete horse")
    seen.add((num,horse))
    f4=runner.get("f4_probabilities") or {}
    require(type(f4.get("exact_p1")) in (float,int) and
            abs(f4["exact_p1"]*100-pwin)<1e-6,"F4 does not match exact PWIN")
    ml=str(runner.get("morning_line","")).strip()
    m=re.fullmatch(r"(\d+)\s*[-/]\s*(\d+)",ml)
    if not m:continue
    a,b=map(int,m.groups())
    if b==0:continue
    net=Decimal(a)/Decimal(b);prob=Decimal(str(pwin))/100
    if net<6 or prob<Decimal(1)/7 or prob*(1+net)-1<Decimal("0.50"):continue
    display=runner.get("win_probability")
    require(type(display) in (int,float) and abs(display-pwin)<.051,"PWIN display mismatch")
    candidates.append({
      "track":name,"track_code":source.get("track_code"),"race_number":race["race_number"],
      "post_time_et":race.get("post_time_et",""),"distance":race.get("distance",""),
      "surface":race.get("surface",""),"conditions":race.get("conditions",""),
      "purse":race.get("purse",""),"program_number":num,"horse_name":horse,
      "original_morning_line":ml,"pwin_exact":pwin/100,"pwin_display":display,
      "fair_odds_exact":runner.get("fair_odds_net_to_1_exact"),
      "trainer":runner.get("trainer",""),"jockey":runner.get("jockey",""),
      "numeric_edge":round(float(prob*(1+net)-1),6),
      "verified_race_field_count":len(entries),
      "source_sha256":hashlib.sha256(raw).hexdigest()})
   race_total+=1;count+=len(entries)
  require(count==EXPECTED[n][1],"Track runner count mismatch")
  tracks[n]=len(races);runner_total+=count;source_hashes[n]=hashlib.sha256(raw).hexdigest()
 require(set(tracks)==set(EXPECTED) and race_total==51 and runner_total==430,
         "Not all 6 source-certified tracks present")
 candidates.sort(key=lambda r:(r["track"],int(r["race_number"]),int(re.match(r"\d+",r["program_number"]).group())))
 payload={"date":DATE,"state":"NUMERIC_ONLY_DO_NOT_PUBLISH","source_type":"private_original_scored_TRI_F4",
          "track_count":len(tracks),"race_count":race_total,"runner_count":runner_total,
          "source_hashes":source_hashes,"candidates":candidates}
 raw=json.dumps(payload,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode()
 require(len(raw)<300000,"Candidate export too large")
 key=PublicKey(base64.b64decode(PUBKEY))
 crypt=SealedBox(key).encrypt(raw)
 Path("radar_1124_numeric_only.sealed").write_bytes(crypt)
 # Never log candidates or identities.
 print(f"RADAR_1124_NUMERIC_SHORTLIST_SEALED tracks={len(tracks)} races={race_total} runners={runner_total} eligible={len(candidates)}")
 print("SECURITY: encrypted source candidate shortlist, not editorial selections.")
if __name__=="__main__":main()

#!/usr/bin/env python3
"""Authenticated sealed owner editorial transfer to private Longshot Radar R2.

No customer launch. Never accepts unsourced PWIN, edited Timeform ML, a
non-complete six-track TRI/F4 field, invented betting cases, or missing QA.
Only ciphertext passes through GitHub issue comments; no raw paid results
are committed to the public repository or logged.
"""
import base64,datetime,hashlib,json,math,os,re,subprocess,sys,zlib
from decimal import Decimal,ROUND_CEILING
from nacl.public import PrivateKey,SealedBox
import boto3
from botocore.exceptions import ClientError

PREFIX="RR_RADAR_1124_PRIVATE_APPROVED_V1"
KEY_CONTEXT=b"RAIL-RYE-R2-TARGET-EDITORIAL-REVIEW-ECIES-v1\0"
OWNER="scottjazdzewski"
ISSUE=229
REPO="scottjazdzewski/rail-and-rye-website"
DATE="2026-11-24"
BUCKET="rail-and-rye-private-cards"
KEY=f"intelligence/longshot-radar/review/{DATE}.json"
COVERAGE=f"intelligence/longshot-radar/coverage/{DATE}.json"
SRC_PREFIX=f"projections/dashboard/{DATE}/"
TIMEFORM_SHA="7395a45700a3aa4fdf9f3dff05f393f7079adf4deb30cb2413aea7a78d4345c3"
MODEL_SHA="de289a89bcb5d4759cd8255819149557640faee5787fc642e5e3d0725c346025"
TRACKS={"delta downs":(8,65),"finger lakes":(8,65),"mahoning valley":(8,67),
        "mountaineer":(8,66),"parx racing":(9,74),"zia park":(10,93)}
def require(ok,reason):
 if not ok:raise ValueError(reason)
def normalize(text):return re.sub(r"[^a-z0-9]+"," ",str(text or "").lower()).strip()
def fair(net):
 n=Decimal(str(net))
 if n>=5:return str(int(n.to_integral_value(rounding=ROUND_CEILING)))+"/1"
 halves=int((n*2).to_integral_value(rounding=ROUND_CEILING))
 return (str(halves//2)+"/1") if halves%2==0 else (str(halves)+"/2")
def read_sealed():
 event=json.load(open(os.environ["GITHUB_EVENT_PATH"],encoding="utf-8"))
 require(event.get("repository",{}).get("full_name")==REPO,"Wrong repository")
 comment=event.get("comment") or {};issue=event.get("issue") or {}
 require(comment.get("user",{}).get("login")==OWNER and issue.get("number")==ISSUE,
         "Owner/issue identity mismatch")
 body=comment.get("body","")
 require(body.startswith(PREFIX+"\n"),"Wrong sealed message prefix")
 encoded=body[len(PREFIX)+1:].strip()
 require(bool(re.fullmatch(r"[A-Za-z0-9+/=]+",encoded)) and len(encoded)<500000,
         "Malformed sealed intake")
 secret=os.getenv("TRI_R2_SECRET_ACCESS_KEY","")
 require(len(secret)>20,"Private R2 secret unavailable")
 key=PrivateKey(hashlib.sha256(KEY_CONTEXT+secret.encode()).digest())
 blob=SealedBox(key).decrypt(base64.b64decode(encoded,validate=True))
 decompressed=zlib.decompress(blob)
 require(0<len(decompressed)<500000,"Oversize editorial packet")
 return json.loads(decompressed)
def normalize_edition(obj):
 node=StringNode='''import {validateLongshotEdition} from "./src/longshot-radar.js";
let raw="";for await (const x of process.stdin)raw+=x;
const clean=validateLongshotEdition(JSON.parse(raw));
process.stdout.write(JSON.stringify(clean));'''
 proc=subprocess.run(["node","--input-type=module","-e",node],
   input=json.dumps(obj,ensure_ascii=False),text=True,capture_output=True)
 require(proc.returncode==0,"Shared Radar server validation rejected editorial edition")
 return json.loads(proc.stdout)
def source_cardinality(s3):
 listed=s3.list_objects_v2(Bucket=BUCKET,Prefix=SRC_PREFIX,MaxKeys=1000)
 require(not listed.get("IsTruncated"),"Incomplete frozen race-card listing")
 sources={};lookups={};qualifying={};source_hashes={};total_races=total_runners=0
 for item in listed.get("Contents",[]):
  key=item["Key"]
  if not key.endswith(".json"):continue
  raw=s3.get_object(Bucket=BUCKET,Key=key)["Body"].read()
  doc=json.loads(raw)
  require(doc.get("schema_version")==1 and doc.get("race_date")==DATE and
          doc.get("projection_status")=="prescratch","Uncertified/wrong-date TRI projection")
  name=str(doc.get("track_name",""));normal=normalize(name)
  require(normal in TRACKS and normal not in sources,"Unrecognized or duplicate source track")
  races=doc.get("races")
  require(isinstance(races,list) and len(races)==TRACKS[normal][0],"Race total does not match Timeform")
  seen_races=set();track_runners=0
  for race in races:
   n=race.get("race_number")
   require(type(n) is int and n not in seen_races,"Duplicate/noninteger race")
   seen_races.add(n);entries=race.get("entries")
   require(isinstance(entries,list) and entries,"Missing whole-field runners")
   mass=0;seen_entries=set()
   for horse in entries:
    p=horse.get("win_probability_exact")
    f4=(horse.get("f4_probabilities") or {}).get("exact_p1")
    require(type(p) in (int,float) and math.isfinite(p) and 0<=p<=100 and
            type(f4) in (float,int) and abs(f4*100-p)<1e-6,"Exact PWIN or F4 mismatch")
    mass+=p
    identity=(normal,n,str(horse.get("program_number","")).strip().upper(),
              normalize(horse.get("horse_name")))
    require(identity[2] and identity[3] and identity not in seen_entries,"Duplicate source horse")
    seen_entries.add(identity)
    lookups[identity]=horse
    line=str(horse.get("morning_line","")).strip()
    match=re.fullmatch(r"(\d+)\s*[-/]\s*(\d+)",line)
    if match and int(match[2])>0:
     net=Decimal(int(match[1]))/Decimal(int(match[2]))
     prob=Decimal(str(p))/100
     if net>=6 and prob>=Decimal(1)/7 and prob*(1+net)-1>=Decimal("0.50"):
      qualifying[identity]=horse
   require(abs(mass-100)<1e-6,"Race probabilities do not sum to 100%")
   track_runners+=len(entries)
  require(track_runners==TRACKS[normal][1],"Full track runner total mismatch")
  sources[normal]=doc;total_races+=len(races);total_runners+=track_runners
  source_hashes[normal]=hashlib.sha256(raw).hexdigest()
 require(set(sources)==set(TRACKS) and total_races==51 and total_runners==430,
         "All six original TRI/F4 track cards are required")
 return sources,lookups,qualifying,source_hashes
def check(packet,sources,lookup,qualifying,source_hashes):
 require(isinstance(packet,dict) and packet.get("release_authority")==
         "PRIVATE_PRESCRATCH_EDITORIAL_REVIEW_ONLY" and
         packet.get("customer_publish_approved") is False,"No customer release approval")
 edition=normalize_edition(packet.get("edition"))
 require(edition["race_date"]==DATE and edition["status"]=="prescratch" and
         edition["revision"]==1 and edition["receipts"]["release_status"]=="PASS",
         "Wrong race date/revision/source state")
 src=packet.get("source") or {};qa=packet.get("qa") or {}
 require(src.get("original_zip_sha256")==TIMEFORM_SHA and
         src.get("original_model_sha256")==MODEL_SHA and
         src.get("verified_track_source_sha256")==source_hashes and
         src.get("expected_scored_tracks")==6 and src.get("expected_scored_races")==51 and
         src.get("expected_scored_runners")==430,"Timeform/score provenance mismatch")
 require(edition["receipts"]["source_sha256"]==TIMEFORM_SHA and
         edition["receipts"]["model_sha256"]==MODEL_SHA,"Model/Timeform source receipt mismatch")
 digest=hashlib.sha256(json.dumps(qa,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
 require(edition["receipts"]["editorial_qa_sha256"]==digest,"Editorial QA seal mismatch")
 published=set()
 for c in edition["candidates"]:
  identity=(normalize(c["track"]),c["race_number"],str(c["program_number"]).upper(),normalize(c["horse_name"]))
  require(identity in qualifying and identity not in published,"Selection not independently numerically qualified")
  published.add(identity)
  runner=lookup[identity]
  require(abs(runner["win_probability_exact"]/100-c["pwin_exact"])<1e-12 and
    abs(runner["win_probability"]-c["pwin_display"])<1e-9,
    "Frozen TRI win probability mismatch")
  m=re.fullmatch(r"(\d+)[-/](\d+)",str(runner.get("morning_line","")))
  require(bool(m) and int(m[2])>0,"Frozen source ML invalid")
  require(int(m[1])/int(m[2])==int(c["original_morning_line"].split("/")[0])/int(c["original_morning_line"].split("/")[1]),
          "Original source morning line was altered")
  require(c["fair_odds_display"]==fair(runner.get("fair_odds_net_to_1_exact")),
          "Fair odds is not the conservative source-format conversion")
  original_t=str(runner.get("trainer",""));original_j=str(runner.get("jockey",""))
  require(c.get("trainer")==original_t and c.get("jockey")==original_j,
          "Trainer or jockey evidence differs from source")
  require(len(c["betting_case"])<=360 and len(c["source_causal_evidence"])<=1000 and
          len(c["counterargument_checked"])<=600,"Unsupported editorial length")
  require(c["horse_name"] in qa.get("source_reviews",{}),"Missing independently written horse-level QA")
  require(list(qa["source_reviews"][c["horse_name"]])==
          [c["betting_case"],c["source_causal_evidence"],c["counterargument_checked"]],
          "QA narrative mismatched published horse")
  source_race=next(r for r in sources[identity[0]]["races"] if r["race_number"]==c["race_number"])
  require(c.get("post_time_et","").replace(" ET","")==source_race.get("post_time_et",""),
          "Published post time differs from source")
 holds=qa.get("held") or {}
 held={(k[0],k[1],k[2],k[3]) for k in qualifying if
       lookup[k].get("horse_name") in holds}
 require(held.isdisjoint(published) and len(held)==len(holds) and
         published|held==set(qualifying),"Every numerical qualifier must be published or explicitly held")
 require(qa.get("numeric_qualifiers")==len(qualifying) and
         qa.get("editorial_published")==len(published),"Editorial counts invalid")
 coverage={name:{"scored_races":TRACKS[name][0],"selected":sum(1 for x in published if x[0]==name)}
           for name in TRACKS}
 return edition,coverage,len(qualifying),len(held)
def main():
 packet=read_sealed()
 creds=[os.getenv(k,"").strip() for k in
    ("TRI_CLOUDFLARE_ACCOUNT_ID","TRI_R2_ACCESS_KEY_ID","TRI_R2_SECRET_ACCESS_KEY")]
 require(all(creds),"Private R2 credentials missing")
 s3=boto3.client("s3",endpoint_url=f"https://{creds[0]}.r2.cloudflarestorage.com",
  aws_access_key_id=creds[1],aws_secret_access_key=creds[2],region_name="auto")
 sources,lookup,eligible,sha=source_cardinality(s3)
 edition,coverage,qualified,held=check(packet,sources,lookup,eligible,sha)
 output=json.dumps(edition,ensure_ascii=False,allow_nan=False,separators=(",",":")).encode()
 try:
  old=s3.get_object(Bucket=BUCKET,Key=KEY)["Body"].read()
  require(old==output,"An existing daily Radar edition differs. Refusing silent overwrite.")
 except ClientError as ex:
  if ex.response.get("Error",{}).get("Code") not in ("NoSuchKey","404","NotFound"):raise
  s3.put_object(Bucket=BUCKET,Key=KEY,Body=output,
    ContentType="application/json; charset=utf-8",CacheControl="private, no-store",
    Metadata={"review_only":"true","original_timeform_sha256":TIMEFORM_SHA,
              "editorial_qa_sha256":edition["receipts"]["editorial_qa_sha256"]})
 read=s3.get_object(Bucket=BUCKET,Key=KEY)["Body"].read()
 require(read==output,"Private edition readback mismatch")
 coverage_doc={"race_date":DATE,"review_only":True,"customer_publish_approved":False,
               "tracks":coverage,"numeric_qualifiers":qualified,
               "editorially_held":held,"approved_candidates":len(edition["candidates"])}
 cover_raw=json.dumps(coverage_doc,sort_keys=True,separators=(",",":")).encode()
 s3.put_object(Bucket=BUCKET,Key=COVERAGE,Body=cover_raw,
    ContentType="application/json; charset=utf-8",CacheControl="private, no-store",
    Metadata={"review_only":"true"})
 require(s3.get_object(Bucket=BUCKET,Key=COVERAGE)["Body"].read()==cover_raw,
         "Six-track coverage metadata readback mismatch")
 # Counts only; no horse names/percentages/ML in Actions output.
 print("RADAR_1124_PRIVATE_READBACK_PASS tracks=6 races=51 runners=430 numeric_qualified="+
   str(qualified)+" editorial_selected="+str(len(edition["candidates"]))+" editorial_held="+str(held))
 print("RADAR_1124_BY_TRACK_COUNTS="+json.dumps(coverage,sort_keys=True))
 print("CUSTOMER_LAUNCH_DISABLED; ALL_PRIVATE_SOURCE/EDITORIAL_CHECKS_PASSED")
if __name__=="__main__":
 try:main()
 except Exception as ex:
  print("RADAR_1124_PUBLICATION_HOLD: "+type(ex).__name__+" "+str(ex)[:180],file=sys.stderr)
  sys.exit(1)

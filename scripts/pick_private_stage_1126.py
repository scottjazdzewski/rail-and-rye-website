#!/usr/bin/env python3
"""Owner-authorized dated staging. No changes to current editions."""
import base64,hashlib,json,os,re,zlib,subprocess,math
from pathlib import Path
from datetime import datetime,timezone
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO,OWNER,ISSUE
import boto3
from botocore.exceptions import ClientError
DATE="2026-11-26";RELEASE="2026-11-26T08:00:00Z";PREFIX="RR_PICK_STAGE_1126_V1"
EXPECTED="943f86f261cd8f4341d1c281f012b47428b3595586f5c83e276eacb14e2b3636"
KEY="pick-tickets/staging/"+DATE+"/revision-0001.json"
COUNTS={"Churchill Downs":(12,112,19),"Del Mar":(8,58,11),"Fair Grounds":(10,95,14),"Gulfstream Park":(9,74,12),"Laurel Park":(9,77,13),"Woodbine":(8,66,9)}
EXCLUSIONS={"Churchill Downs":{"8":["13","14","15","16"]},"Laurel Park":{"6":["13","14"]}}
def check(x,m):
 if not x:raise ValueError(m)
def sha(b):return hashlib.sha256(b).hexdigest()
def slug(s):return re.sub("[^a-z0-9]+","-",s.lower()).strip("-")
def main():
 ev=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text());c=ev.get("comment",{})
 check(ev.get("repository",{}).get("full_name")==REPO and ev.get("issue",{}).get("number")==ISSUE and c.get("user",{}).get("login")==OWNER,"Unauthorized")
 body=c.get("body","");check(body.startswith(PREFIX+"\n"),"Wrong prefix")
 enc=body[len(PREFIX)+1:].strip();check(len(enc)<65000 and re.fullmatch(r"[A-Za-z0-9+/=]+",enc),"Invalid ciphertext")
 z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),500001)
 check(z.eof and not z.unused_data and len(raw)<=500000 and sha(raw)==EXPECTED,"Stage payload checksum mismatch")
 d=json.loads(raw);check(d["date"]==DATE and d["release_at"]==RELEASE and d["source_archive_sha256"]=="20a001e4bbf88afb2701d6408e2cbfae63abb508cf18661d484e74d7f8ab0fc7" and d["prescratch"] is True,"Source/date")
 check(len(d["tracks"])==6 and {r["card"]["track"] for r in d["tracks"]}==set(COUNTS),"Track inventory")
 check(datetime.now(timezone.utc)<datetime.fromisoformat(RELEASE.replace("Z","+00:00")),"Release window closed")
 s3=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 def get(k):
  o=s3.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o.get("Metadata",{})
 manifest=json.loads(get("projections/qa/"+DATE+"/staged-release.json")[0]);check(manifest["source_sha256"]==d["source_archive_sha256"] and manifest["release_at"]==RELEASE,"Projection source mismatch")
 for row in d["tracks"]:
  card=row["card"];track=card["track"];n,starters,seqs=COUNTS[track]
  check((row["races"],row["runners"],len(card["sequences"]))==(n,starters,seqs),"Wrong stage counts")
  check(row["conditional_exclusions"]==EXCLUSIONS.get(track,{}),"Conditional exclusion mismatch")
  fields=row["runner_pwin"];check(len(fields)==n and sum(map(len,fields.values()))==starters,"Runner inventory")
  p=next(t for t in manifest["tracks"] if t["name"]==track)
  b,m=get("projections/dashboard/"+DATE+"/"+slug(track)+".json");check(sha(b)==p["dashboard_sha256"] and m.get("release_at")==RELEASE,"Approved Race Card mismatch")
  projected=json.loads(b);by={str(r["race_number"]):{str(e["program_number"]):e for e in r["entries"]} for r in projected["races"]}
  delta=0;maxdiff=0.
  for race,rows in fields.items():
   check(set(by[race])=={x[0] for x in rows},"Projection roster differs: "+track+" race "+race)
   check(abs(sum(x[2] for x in rows)-1)<1e-10 and all(0<=x[2]<=1 and abs(x[2]-x[3])<1e-12 for x in rows),"TRI/F4 mass")
   grouped={x[0]:x[2]*100 for x in rows}
   for group in row.get("coupled_interests",{}).get(race,[]):
    check(group["program"]=="1" and {x["program"] for x in group["members"]}=={"1","1A"} and track=="Laurel Park" and race=="7","Unexpected coupling")
    for member in group["members"]:check(abs(grouped[member["program"]]-100*member["pwin"])<1e-9,"Coupled runner proof mismatch")
    grouped["1"]+=grouped.pop("1A")
   for x in rows:
    e=by[race][x[0]];diff=abs(e["win_probability_exact"]-100*x[2]);delta+=diff>1e-7;maxdiff=max(maxdiff,diff)
   for seq in card["sequences"]:
    if race in seq["review_probabilities"]:
     q=seq["review_probabilities"][race];check(set(q)==set(grouped) and all(abs(q[k]-grouped[k])<1e-9 for k in q),"Ticket field differs from receipt-linked scores")
  print("PICK_TRACK_SOURCE_QA",track,"runners",starters,"sequences",seqs,"cross_product_pwin_differences",delta,"max_diff_pp",round(maxdiff,8))
  check(delta==0,"Cross-product PWIN disagreement: "+track)
 Path("/tmp/rr-pick-stage-1126.json").write_bytes(raw)
 js="""import fs from 'node:fs';import {validateStagedPickBatch} from './src/pick-tickets-staging.js';const b=JSON.parse(fs.readFileSync('/tmp/rr-pick-stage-1126.json','utf8'));const c=validateStagedPickBatch(b);if(c.length!==6||c.reduce((n,x)=>n+x.sequences.length,0)!==78)throw Error('Wrong slate');console.log('PASS actual locked JS constructor, all 78 SQR classifications, full PWIN and coupled-interest evidence');"""
 subprocess.run(["node","--input-type=module","-e",js],check=True)
 check(datetime.now(timezone.utc)<datetime.fromisoformat(RELEASE.replace("Z","+00:00")),"Release window closed")
 try:
  prior,_=get(KEY);check(prior==raw,"Different existing stage; no overwrite")
 except ClientError as e:
  if e.response.get("Error",{}).get("Code") not in ("NoSuchKey","404","NotFound"):raise
  s3.put_object(Bucket=BUCKET,Key=KEY,Body=raw,ContentType="application/json",CacheControl="private, no-store",Metadata={"sha256":EXPECTED,"stage_only":"true","release_at":RELEASE,"uploaded_at":datetime.now(timezone.utc).isoformat()},IfNoneMatch="*")
 b,m=get(KEY);check(b==raw and m["sha256"]==EXPECTED and m["stage_only"]=="true","Stage readback mismatch")
 print("PICK_1126_STAGED_READBACK_PASS tracks=6 races=56 runners=482 interests=481 sequences=78 release_at="+RELEASE)
if __name__=="__main__":main()

#!/usr/bin/env python3
"""Encrypted owner-authorized November 25 staging only. Never writes live editions."""
import base64,hashlib,json,os,re,zlib
from pathlib import Path
from datetime import datetime,timezone
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO,OWNER,ISSUE
import boto3
from botocore.exceptions import ClientError
PREFIX="RR_PICK_STAGE_1125_V1"
KEY="pick-tickets/staging/2026-11-25/revision-0001.json"
EXPECTED="b130d7fbafab9819b62390df38deaae4c647bd92792fa68ef7d1b69386965180"
COUNTS={"Churchill Downs":(10,97,15),"Charles Town":(8,68,11),"Delta Downs":(8,67,10),"Finger Lakes":(8,61,7),"Mahoning Valley":(8,64,10),"Mountaineer":(8,66,5),"Parx Racing":(9,72,12),"Penn National":(8,61,9),"Tampa Bay Downs":(9,74,13)}
def require(x,msg):
 if not x:raise ValueError(msg)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
 ev=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text());c=ev.get("comment",{})
 require(ev.get("repository",{}).get("full_name")==REPO and ev.get("issue",{}).get("number")==ISSUE and c.get("user",{}).get("login")==OWNER,"Unauthorized")
 body=c.get("body","");require(body.startswith(PREFIX+"\n"),"Wrong prefix")
 b64=body[len(PREFIX)+1:].strip();require(re.fullmatch(r"[A-Za-z0-9+/=]+",b64) and len(b64)<65000,"Invalid ciphertext")
 dec=SealedBox(private_key()).decrypt(base64.b64decode(b64,validate=True));z=zlib.decompressobj();raw=z.decompress(dec,400001)
 require(z.eof and not z.unused_data and len(raw)<=400000 and sha(raw)==EXPECTED,"Stage payload checksum mismatch")
 d=json.loads(raw);require(d["date"]=="2026-11-25" and d["release_at"]=="2026-11-25T08:00:00Z" and d["prescratch"] is True,"Wrong date or release")
 require(len(d["tracks"])==9 and {r["card"]["track"] for r in d["tracks"]}==set(COUNTS),"Track inventory mismatch")
 for row in d["tracks"]:
  c=row["card"];p=row["proof"];r=row["receipt"];n,starters,seqs=COUNTS[c["track"]]
  require((row["races"],row["runners"],len(c["sequences"]))==(n,starters,seqs),"Wrong stage counts")
  require(p["permanent_policy_id"]=="TRI_TJ_NEUTRAL_MEAN_V4_ALWAYS_ON" and p["all_roles_complete"] and p["exact_consumed_model_matrix_verified"] and p["trainer_jockey_roles_proven"]==2*starters and r["unresolved_fields"]==0,"Connection proof incomplete")
  require(r["tri_status"]=="PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME" and r["f4_status"]=="PASS" and r["f4_p1_equals_tri"] and r["scratch_state"]=="PRESCRATCH","Scorer proof incomplete")
 Path("/tmp/rr-pick-stage-1125.json").write_bytes(raw)
 # Revalidate with the actual locked JS constructor before R2 staging.
 import subprocess
 subprocess.run(["node","scripts/validate_pick_stage.mjs","/tmp/rr-pick-stage-1125.json"],check=True)
 account=os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()
 s3=boto3.client("s3",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 try:
  prior=s3.get_object(Bucket=BUCKET,Key=KEY)["Body"].read();require(prior==raw,"Existing staged edition differs; no overwrite")
 except ClientError as e:
  if e.response.get("Error",{}).get("Code") not in ("NoSuchKey","404","NotFound"):raise
  s3.put_object(Bucket=BUCKET,Key=KEY,Body=raw,ContentType="application/json",CacheControl="private, no-store",Metadata={"sha256":EXPECTED,"stage_only":"true","release_at":"2026-11-25T08:00:00Z","uploaded_at":datetime.now(timezone.utc).isoformat()})
 confirm=s3.get_object(Bucket=BUCKET,Key=KEY);require(confirm["Body"].read()==raw and confirm["Metadata"]["stage_only"]=="true","Stage readback mismatch")
 print("PASS STAGED: November 25, 9 tracks, 76 races, 630 runners, 1260 role proofs, 92 sequences, release 08:00 UTC; November 24 untouched.")
 Path("/tmp/rr-pick-stage-1125.json").unlink(missing_ok=True)
if __name__=="__main__":main()

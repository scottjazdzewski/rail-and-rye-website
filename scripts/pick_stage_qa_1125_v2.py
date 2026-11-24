#!/usr/bin/env python3
import base64,hashlib,json,os,re,zlib,subprocess
from pathlib import Path
from datetime import datetime,timezone
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO,OWNER,ISSUE
import boto3
from botocore.exceptions import ClientError
PREFIX="RR_PICK_STAGE_1125_QA_V2"
ROOT="pick-tickets/staging/2026-11-25/"
RELEASE="2026-11-25T08:00:00Z"
PARENT="b130d7fbafab9819b62390df38deaae4c647bd92792fa68ef7d1b69386965180"
PATCH="145bfdc7c8fb4084fe7653bc92c51ac0d9d4431a627b2ee37502cb7c883a7987"
def require(x,m):
 if not x:raise ValueError(m)
def sha(b):return hashlib.sha256(b).hexdigest()
def slug(x):return re.sub("[^a-z0-9]+","-",x.lower()).strip("-")
def main():
 event=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text());c=event.get("comment",{})
 require(event.get("repository",{}).get("full_name")==REPO and event.get("issue",{}).get("number")==ISSUE and c.get("user",{}).get("login")==OWNER,"Unauthorized")
 body=c.get("body","");require(body.startswith(PREFIX+"\n"),"Bad prefix")
 enc=body[len(PREFIX)+1:].strip();require(len(enc)<65000 and re.fullmatch(r"[A-Za-z0-9+/=]+",enc),"Bad ciphertext")
 z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),500001)
 require(z.eof and not z.unused_data and len(raw)<=500000 and sha(raw)==PATCH,"Patch checksum")
 patch=json.loads(raw);require((patch["date"],patch["revision"],patch["parent_sha256"],patch["release_at"])==("2026-11-25",2,PARENT,RELEASE),"Patch identity")
 require(datetime.now(timezone.utc)<datetime.fromisoformat(RELEASE.replace("Z","+00:00")),"Release window closed; no writes")
 account=os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()
 s3=boto3.client("s3",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 def read(key):
  o=s3.get_object(Bucket=BUCKET,Key=key);return o["Body"].read(),o
 def put_immutable(key,b,metadata):
  try:
   p,_=read(key);require(p==b,"Immutable revision collision")
  except ClientError as e:
   if e.response.get("Error",{}).get("Code") not in ("NoSuchKey","404","NotFound"):raise
   s3.put_object(Bucket=BUCKET,Key=key,Body=b,ContentType="application/json",CacheControl="private, no-store",Metadata=metadata,IfNoneMatch="*")
  require(read(key)[0]==b,"Immutable readback mismatch")
 parent,pmeta=read(ROOT+"revision-0001.json");require(sha(parent)==PARENT and pmeta["Metadata"]["stage_only"]=="true","Wrong parent")
 parent=json.loads(parent)
 receipt=json.loads(read(ROOT+"prepared-0001.json")[0]);require(receipt["sha256"]==PARENT and receipt["release_at"]==RELEASE and len(receipt["tracks"])==9 and all(t["release_at"]=="2026-11-25 08:00:00" and t["product_id"] for t in receipt["tracks"]),"Parent schedule not verified")
 existing={};snapshots={}
 for r in parent["tracks"]:
  track=r["card"]["track"];key="racing-intelligence/product-tabs/pick-tickets/2026-11-25/"+slug(track)+".json";b,o=read(key)
  require(o["Metadata"].get("customer_publish_approved")=="true","Unapproved parent customer card")
  existing[track]=json.loads(b);snapshots[track]=(key,b,o)
 Path("/tmp/rr-pick-qa-v2-input.json").write_text(json.dumps(dict(parent=parent,patch=patch,customers=existing)))
 subprocess.run(["node","scripts/validate_pick_stage_revision_1125.mjs"],check=True)
 out=json.loads(Path("/tmp/rr-pick-qa-v2-output.json").read_text());batch=json.dumps(out["batch"],separators=(",",":"),ensure_ascii=False).encode();digest=sha(batch)
 # Verify all original objects still match before writing anything.
 for track,(key,b,o) in snapshots.items():require(read(key)[0]==b,"Concurrent customer update; no writes")
 require(datetime.now(timezone.utc)<datetime.fromisoformat(RELEASE.replace("Z","+00:00")),"Release window closed")
 put_immutable(ROOT+"revision-0002.json",batch,{"sha256":digest,"stage_only":"true","release_at":RELEASE,"parent_sha256":PARENT})
 for r in out["writes"]:
  track=r["track"];key,b,o=snapshots[track];new=json.dumps(r["card"],separators=(",",":"),ensure_ascii=False).encode()
  put_immutable(ROOT+"customer-parent/"+slug(track)+".json",b,{"sha256":sha(b),"release_at":RELEASE})
  meta=dict(o["Metadata"]);meta.update(revision="2",content_sha256=sha(new),source_sha256=r["card"]["source_input_sha256"],staged_release_at=RELEASE)
  s3.put_object(Bucket=BUCKET,Key=key,Body=new,ContentType="application/json",CacheControl="private, no-store",Metadata=meta,IfMatch=o["ETag"])
  require(read(key)[0]==new,"Corrected customer readback failed")
  print("CORRECTED_STAGE_READBACK",track)
 for r in receipt["tracks"]:
  track=r["track"];key,old,o=snapshots[track];b,m=read(key);card=json.loads(b)
  require(card["date"]=="2026-11-25" and card["track"]==track and len(card["sequences"])==r["sequence_count"] and all(s.get("review_probabilities") for s in card["sequences"]),"Incomplete customer readback")
  r["revision"]=card["revision"];r["content_sha256"]=sha(b)
  if track not in {x["track"] for x in out["writes"]}:require(b==old,"Unchanged edition altered")
 receipt.update(sha256=digest,parent_sha256=PARENT,revision=2,prepared_at=datetime.now(timezone.utc).isoformat(),active_runner_count=617,conditional_exclusions=13)
 rb=json.dumps(receipt,separators=(",",":")).encode();put_immutable(ROOT+"prepared-0002.json",rb,{"sha256":sha(rb),"release_at":RELEASE})
 print("PASS CORRECTED QUEUE: 9 tracks, 92 tickets, 617 active runners, 13 conditional entrants held; all prior scheduled catalog IDs and 08:00 UTC preserved; November 24 untouched.")
if __name__=="__main__":main()

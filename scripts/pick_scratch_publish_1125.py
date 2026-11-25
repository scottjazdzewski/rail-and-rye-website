#!/usr/bin/env python3
import base64,hashlib,json,os,re,zlib,subprocess
from datetime import datetime,timezone
from pathlib import Path
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO,OWNER,ISSUE
import boto3
from botocore.exceptions import ClientError
ROOT="pick-tickets/staging/2026-11-25/"
CUSTOMER="racing-intelligence/product-tabs/pick-tickets/2026-11-25/"
PREFIX="RR_PICK_SCRATCH_1125_R1"
PARENT="b130d7fbafab9819b62390df38deaae4c647bd92792fa68ef7d1b69386965180"
SPECS={"Penn National":("3cb2e8ebbd047b9770940721fd49efbcb9174b32b3589cf6e86ea55440fce6b1","2026-11-25T18:19:00Z"),"Churchill Downs":("640185058d4ae6d0abe77ee582c68bb102b73b665adf3202643b75fa1b174ba8","2026-11-25T16:43:00Z"),"Finger Lakes":("f082a81b042fbf167cad9cb3eac113ab6abb1ca45ca6762ef5b7a821c70ccceb","2026-11-25T16:01:00Z"),"Mahoning Valley":("a9d1455b5a99c3a17181077df6dad6959dfc4a7d121fe2d2ddfe3891186bfb89","2026-11-25T15:09:00Z"),"Parx Racing":("92f52c198fe4968701062718935d2b0a9a9e788e999e5617fb44a99a0169ab25","2026-11-25T15:17:00Z"),"Tampa Bay Downs":("9231c73d7717c1a3b7b2a6b44261364df8384006db80b97a2befb24c9e06404f","2026-11-25T15:41:00Z"),"Charles Town":("7bb01eaffeec700b085a07c568d80a89a1fb681fb619d92945198ef11033fcb3","2026-11-25T15:51:00Z")}
def req(x,m):
 if not x:raise ValueError(m)
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def slug(s):return re.sub("[^a-z0-9]+","-",s.lower()).strip("-")
def main():
 ev=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text());c=ev.get("comment",{})
 req(ev.get("repository",{}).get("full_name")==REPO and ev.get("issue",{}).get("number")==ISSUE and c.get("user",{}).get("login")==OWNER,"Unauthorized")
 body=c.get("body","");req(body.startswith(PREFIX+"\n"),"Wrong transfer prefix")
 enc=body[len(PREFIX)+1:].strip();req(len(enc)<65000 and re.fullmatch(r"[A-Za-z0-9+/=]+",enc),"Invalid sealed payload")
 z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),500001)
 req(z.eof and not z.unused_data and len(raw)<=500000,"Payload exceeds bound")
 batch=json.loads(raw);req(batch["date"]=="2026-11-25" and batch["revision"]==1,"Wrong batch date/revision")
 tracks=[r["track"] for r in batch["tracks"]];req(1<=len(tracks)<=5 and len(set(tracks))==len(tracks) and set(tracks)<=set(SPECS),"Unexpected tracks")
 for row in batch["tracks"]:req((row["snapshot_sha256"],row["snapshot_at"])==SPECS[row["track"]],"Official snapshot mismatch")
 s3=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 def get(k,optional=False):
  try:
   o=s3.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o
  except ClientError as e:
   if optional and e.response.get("Error",{}).get("Code") in ("NoSuchKey","404","NotFound"):return None,None
   raise
 def imm(k,b,meta):
  p,_=get(k,True)
  if p is not None:req(p==b,"Immutable archive collision")
  else:s3.put_object(Bucket=BUCKET,Key=k,Body=b,ContentType="application/json",CacheControl="private,no-store",Metadata=meta,IfNoneMatch="*")
  req(get(k)[0]==b,"Archive readback failed")
 original,meta=get(ROOT+"revision-0001.json");req(sha(original)==PARENT,"Original staged source mismatch")
 corrected,_=get(ROOT+"revision-0002.json",True)
 if corrected:
  q,_=get(ROOT+"prepared-0002.json");req(json.loads(q)["sha256"]==sha(corrected),"Corrected stage not verified")
 current={};snap={}
 for track in tracks:
  key=CUSTOMER+slug(track)+".json";b,o=get(key);req(o["Metadata"].get("customer_publish_approved")=="true","Unapproved customer parent");current[track]=json.loads(b);snap[track]=(key,b,o)
 Path("/tmp/rr-pick-scratch-1125-input.json").write_bytes(compact({"parent":json.loads(original),"corrected":json.loads(corrected) if corrected else None,"customers":current,"batch":batch}))
 subprocess.run(["node","scripts/validate_pick_scratch_1125.mjs"],check=True)
 out=json.loads(Path("/tmp/rr-pick-scratch-1125-output.json").read_text())
 audit="pick-tickets/scratch-revisions/2026-11-25/"
 published=[]
 for item in out["results"]:
  track=item["track"];key,b,o=snap[track];new=compact(item["card"])
  req(get(key)[0]==b,"Concurrent update; not overwritten")
  source=next(x for x in batch["tracks"] if x["track"]==track)
  rev=str(item["card"]["revision"])
  imm(audit+slug(track)+"/r"+rev+"-source-"+sha(compact(source))[:16]+".json",compact(source),{"sha256":sha(compact(source))})
  imm(audit+slug(track)+"/parent-"+sha(b)+".json",b,{"sha256":sha(b)})
  m=dict(o["Metadata"]);m.update(revision=rev,content_sha256=sha(new),source_sha256=item["card"]["source_input_sha256"],publication_mode="owner-approved-gpt",customer_publish_approved="true",published_at=datetime.now(timezone.utc).isoformat())
  s3.put_object(Bucket=BUCKET,Key=key,Body=new,ContentType="application/json",CacheControl="private,no-store",Metadata=m,IfMatch=o["ETag"])
  got,gm=get(key);req(got==new and gm["Metadata"]["content_sha256"]==sha(new),"Customer readback mismatch")
  item["summary"]["sha256"]=sha(new);published.append(item["summary"]);print("PICK_SCRATCH_CUSTOMER_READBACK",json.dumps(item["summary"]),flush=True)
 receipt=compact({"date":batch["date"],"published":published,"holds":out["holds"],"batch_sha256":sha(raw)})
 imm(audit+"batch-"+sha(raw)[:20]+".json",receipt,{"sha256":sha(receipt)})
 print("PICK_SCRATCH_FINAL",receipt.decode())
 if out["holds"] or len(published)!=len(tracks):raise SystemExit(2)
if __name__=="__main__":main()

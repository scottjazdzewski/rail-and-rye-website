#!/usr/bin/env python3
"""Owner-authorized, sealed, Zia Park Nov 24 Pick source revision.
Private Pick staging only; never modifies other products or customer release.
A replayed prescratch parent must agree with the immutable original published
prescratch probability vector before accepting the actual scratch-final rerun.
"""
import base64,hashlib,json,math,os,re,zlib
from pathlib import Path
from datetime import datetime,timezone
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO,OWNER,ISSUE
import boto3
from botocore.exceptions import ClientError
PREFIX="RR_PICK_PRIVATE_SCRATCH_1124_ZIA_V1"
KEY="pick-tickets/interim/2026-11-24/revision-0005.json"
BASE_KEY="pick-tickets/interim/2026-11-24/revision-0001.json"
EXPECTED="b43f4eaa67d51017367987bda2298083e6d8c794ebfdef06ac7774c88474abe0"
BASE_HASH="4130a2873d2369956ccbdd82dd7097ef700fb5b58e93722ec37927ba81e18399"
ARCHIVE="7395a45700a3aa4fdf9f3dff05f393f7079adf4deb30cb2413aea7a78d4345c3"
CONFIG={
 "Zia Park":("ZIA",10,93,85,{1:["2"],4:["7"],5:["1","2","5"],8:["8"],10:["2","8"]},"1c381718275ee7256732f701a22a071c519d7b0563ac562b8907b08220e2fcfc","2026-11-24T17:54:00Z")
}
def require(x,msg):
 if not x:raise ValueError(msg)
def sha(x):return hashlib.sha256(x).hexdigest()
def vectors(rows,n):
 out={}
 for e in rows:
  require(isinstance(e,list) and len(e)==n,"Invalid runner row")
  p=e[0];require(isinstance(p,str) and re.fullmatch(r"[0-9]{1,2}[A-Z]?",p) and p not in out,"Invalid program")
  require(all(type(x) in (int,float) and math.isfinite(x) and 0<=x<=1 for x in e[1:]),"Invalid probability")
  if n==3:require(abs(e[1]-e[2])<=1e-12,"TRI/F4 P1 disagreement")
  out[p]=e[1]
 require(len(out)>=2 and abs(sum(out.values())-1)<=1e-9,"Incomplete race mass")
 return out
def validate(raw,base_raw):
 require(sha(raw)==EXPECTED and sha(base_raw)==BASE_HASH,"Unexpected immutable source SHA")
 d=json.loads(raw);base=json.loads(base_raw)
 require((d.get("schema_version"),d.get("product_type"),d.get("race_date"),d.get("revision"),d.get("review_only"),d.get("customer_publish_approved"),d.get("source_archive_sha256"))==(1,"pick_tickets_scratch_source_1124_zia","2026-11-24",5,True,False,ARCHIVE),"Incorrect source envelope")
 require(len(d["tracks"])==1 and {x["track"] for x in d["tracks"]}==set(CONFIG),"Wrong tracks")
 for t in d["tracks"]:
  code,n,pre_count,post_count,scr,shot,stamp=CONFIG[t["track"]]
  require(t["code"]==code and t["official_screenshot_sha256"]==shot and t["official_snapshot_utc"]==stamp,"Wrong official source")
  require(all(re.fullmatch("[0-9a-f]{64}",t.get(k,"")) for k in ["tri_sha256","f4_sha256","official_changes_sha256","replayed_parent_sha256","pre_tri_sha256","f4_ordered_prefixes_sha256","source_pdf_sha256"]),"Missing receipt")
  old=next(x for x in base["tracks"] if x["track"]==t["track"])
  require(t["tri_sha256"]!=old["tri_sha256"] and t["f4_sha256"]!=old["f4_sha256"] and t["tri_sha256"]!=t["pre_tri_sha256"] and t["f4_sha256"]!=t["replayed_parent_sha256"],"Stale receipt")
  old_races={r["race_number"]:r for r in old["races"]}
  require(len(t["races"])==n and {r["race_number"] for r in t["races"]}==set(range(1,n+1)),"Incomplete track")
  before=after=0
  for r in t["races"]:
   i=r["race_number"];a=vectors(r["pre_entries"],2);b=vectors(r["entries"],3)
   # Original envelope uses percent plus independent F4 probability.
   prior={e[0]:e[1]/100 for e in old_races[i]["entries"]}
   require(set(a)==set(prior) and all(abs(a[p]-prior[p])<=1e-10 for p in a),"Replayed parent differs from published prescratch source")
   expected=scr.get(i,[])
   require(r["scratches"]==expected and set(b)==set(a)-set(expected),"Official active field mismatch")
   if not expected:require(all(abs(b[p]-prior[p])<=1e-10 for p in b),"Unchanged race probability changed")
   require(re.fullmatch(r"(?:[1-9]|1[0-2]):[0-5][0-9] [AP]M",r["post_time_et"]),"Invalid post time")
   before+=len(a);after+=len(b)
  require((before,after)==(pre_count,post_count),"Wrong runner totals")
  changes=t["non_scratch_changes"]
  require(not changes,"Unexpected non-scratch changes")
  require(t["official_changes_sha256"]=="63574f3499efeda3be119635bb9952d8472d9246902003b436650ac1e62b73a7","Official changes digest differs")
 return d
def main():
 ev=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text());c=ev.get("comment",{})
 require(ev.get("repository",{}).get("full_name")==REPO and ev.get("issue",{}).get("number")==ISSUE and c.get("user",{}).get("login")==OWNER,"Unauthorized")
 body=c.get("body","");require(body.startswith(PREFIX+"\n"),"Wrong prefix")
 b64=body[len(PREFIX)+1:].strip();require(re.fullmatch(r"[A-Za-z0-9+/=]+",b64) and len(b64)<80000,"Invalid ciphertext")
 dec=SealedBox(private_key()).decrypt(base64.b64decode(b64,validate=True))
 z=zlib.decompressobj();raw=z.decompress(dec,120001);require(z.eof and not z.unused_data and len(raw)<=120000,"Invalid payload")
 account=os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()
 s3=boto3.client("s3",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 base_raw=s3.get_object(Bucket=BUCKET,Key=BASE_KEY)["Body"].read()
 validate(raw,base_raw)
 try:
  prior=s3.get_object(Bucket=BUCKET,Key=KEY)["Body"].read();require(prior==raw,"Existing revision differs; no overwrite")
 except ClientError as e:
  if e.response.get("Error",{}).get("Code") not in ("NoSuchKey","404","NotFound"):raise
  s3.put_object(Bucket=BUCKET,Key=KEY,Body=raw,ContentType="application/json",CacheControl="private, no-store",Metadata={"sha256":EXPECTED,"review_only":"true","uploaded_at":datetime.now(timezone.utc).isoformat()})
 confirm=s3.get_object(Bucket=BUCKET,Key=KEY)["Body"].read();require(confirm==raw,"R2 readback differs");validate(confirm,base_raw)
 print("PASS: private 11/24 Zia Park scratch scores; replayed parent matches original, 10 races, 85 runners, 8 scratches. No paid values logged.")
if __name__=="__main__":main()

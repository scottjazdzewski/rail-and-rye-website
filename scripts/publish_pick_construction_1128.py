import base64,zlib,json,hashlib,os,re,subprocess
from datetime import datetime
from zoneinfo import ZoneInfo
from collections import defaultdict
import boto3
from botocore.exceptions import ClientError
from nacl.public import SealedBox
from pick_private_score_bridge import private_key
D="2026-11-28";B="rail-and-rye-private-cards";S="5fa5be231f630ebeee4eb7c92ebd036aa600c0d85ba4b6e1f61aac2668f3116d"
def sha(x):return hashlib.sha256(x).hexdigest()
def need(x,m):
 if not x:raise ValueError(m)
raw=zlib.decompress(SealedBox(private_key()).decrypt(base64.b64decode("2vi4uw2GkbhPmt7EqkXnlum+eVbEyeP3Hw1AZWvvSF/83zdmijIC7FYIsdN4CXPUgua0kTPpA7oaWuZbf9NZa4Zdxl3wcMLCcBz+rnjdM+jpDY10puPhTY/v2yrUl+KaF1oKTkDKC2DD9VRcoaoLjFf1Pm71k9+aVKv4I5fTwGPbwXiwgmW0veQWrVUkzBXvrCOfbdzCA2Qr2/mEv/cQQoWRPVFYeEbPCSCOpYRb9qTMSlIBDt0kSQWmasj7GRAA0ntWpRf4zG+jy0Wo/tGFIRp42cquNvM8/bnmsrsDTK9P2/BH64sRYdGi+X+Fy1OenV/Nd870HCrNiGjfu2tQS5+U3Xghi/QXj8uCoSXIqd2sMtlYBDUv2TDFeIJL4s335v9aXRm0i4dp4y+S0/xZJnTYq0xHKXOmK7CQj4jfm0s+E/rPK9iN2CqypMC+pgor4Uk7watRP8c6g4RVcf/Kk2ZQtQA4vS36XlMtRm5hkMBWzsyr0RJSKbXcN3tQOvk85t8tifDBpJnv+4DwhzVGDQavzWmLeU7g7VjIVRLk5Gobw5UaI75rIwAKpzV/+vIK+gDJ+DG/PkBK6L7CMmoTSWrM4crRo5njDp+aupMmHN652KfVyRN/vfDgij5Vkoe71Aswm3ud68RZKtKYEHxLE1xGAxBU7gcZNxBj4bOIwhXBiPu5q0HIxTYeWgmaPSx9ruX4yfG4P19azTIzVAsQgutDIeFGfPQemvFOip8ll+mVY9oRbgmvAtDf+z5hWbPh8ntwrAyjavv5g3W3NdPIG1Ws4gV69TFT+ISkrjgolsby/JXSRmURNw/mOflW3ub0Q2hnm7zrvY7IE9pkT04XLkI+3hsuvvLEuePSdx6ZfqnyldpRuDeqGhdz/cnTA+aqwzhxMlZz7qOa6K6H7rCdLZlbfNOW7EQXXvTYTfNvzNTBQWyTh0rjaztYANBnFyK0q9lz4kUdOAaaJ9acYqvEk4Lp5UHK7AfKlyVmim0hyJmVzs7FXPa1c0fOj8g+OI2e8+bArFrJY8GIxtUrFXna+A13+f4cL44uFN0s2KLybpVA9bHJFBwoDRaHJcEVaOXMoQZkbhR/U0Nb9FOFYRjN6GOgkWt26727PIumevFKK0sTOm8xraTmTw8/88vZ01AFZCqpVbcEyNzVMmFd3mL6LVJqDEyRPqwMPMTH7iJmBnwTUiv3wy044nDVU+eCkFztBU6Xv0A3BIyhw+pgjdvj4v0br7AtBJVDcEVjvMUuhfrB3habtJGaZXzOqIgzSL+vrFq8Bs0PYw==")))
need(sha(raw)=="eeab366724037745e04f7e3837300b5fcd380ba6d3f48fcfb6ef970b9f85cfa7","Sealed patch checksum")
p=json.loads(raw);need(p["date"]==D and p["stage"]==S and len(p["rows"])==23,"Owner patch identity")
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(k):
 try:
  o=s.get_object(Bucket=B,Key=k);return o["Body"].read(),o.get("Metadata",{}),o["ETag"]
 except ClientError as e:
  if e.response["Error"]["Code"] in ("404","NoSuchKey","NotFound"):return None,{},None
  raise
def put_immutable(k,b,m):
 old,om,_=get(k)
 if old is None:s.put_object(Bucket=B,Key=k,Body=b,Metadata=m,ContentType="application/json",CacheControl="private,no-store",IfNoneMatch="*")
 else:need(old==b and all(om.get(a)==v for a,v in m.items()),"Immutable receipt conflict")
 now,nm,_=get(k);need(now==b and all(nm.get(a)==v for a,v in m.items()),"Immutable readback")
stage,sm,_=get("pick-tickets/staging/"+D+"/revision-0001.json");need(stage and sha(stage)==S and sm.get("sha256")==S,"Stage changed")
batch=json.loads(stage);tracks={r["card"]["track"]:r for r in batch["tracks"]}
g=defaultdict(list)
for r in p["rows"]:g[r[0]].append(r)
def time_ok(card,rs):
 now=datetime.now(ZoneInfo("America/New_York"))
 if now.date().isoformat()!=D:return False
 for r in rs:
  t=card["post_times_by_race"][str(r[2])].strip().upper().removesuffix(" ET")
  parsed=None
  for fmt in ("%I:%M %p","%H:%M"):
   try:parsed=datetime.strptime(t,fmt).time();break
   except ValueError:pass
  if parsed is None or (datetime.combine(now.date(),parsed,now.tzinfo)-now).total_seconds()<300:return False
 return True
published=0;held=0
for name,rs in g.items():
 try:
  # Early official Del Mar notices were already reported; never apply an initial-only patch there.
  need(name!="Del Mar","Reported changes require scratch-final rerun")
  row=tracks[name];card=row["card"];slug=re.sub("[^a-z0-9]+","-",name.lower()).strip("-")
  canonical=row["canonical_source"]
  ck=canonical["key"];current,cm,_=get(ck)
  need(current and sha(current)==canonical["sha256"] and json.loads(current)["projection_status"]=="prescratch","Current canonical field changed")
  fk="projections/qa/"+D+"/final-fields/"+slug+".json";field,_,_=get(fk)
  need(field is None,"Official field notice or final receipt exists; use scratch-final rerun")
  k="racing-intelligence/product-tabs/pick-tickets/"+D+"/"+slug+".json"
  prior,pm,etag=get(k);need(prior and pm.get("customer_publish_approved")=="true" and sha(prior)==pm.get("content_sha256"),"Customer checksum")
  need(pm.get("initial_stage_sha256")==S and json.loads(prior)["revision"]==1,"Current edition not initial revision 1")
  need(time_ok(card,rs),"Sequence started or close to first post")
  d=dict(stageCard=card,prior=prior.decode(),rows=rs,stageHash=S,release=batch["release_at"],slug=slug)
  run=subprocess.run(["node","scripts/build_pick_construction_1128.mjs"],input=json.dumps(d),text=True,capture_output=True)
  need(run.returncode==0,"Construction validator rejected: "+run.stderr.splitlines()[0][:140] if run.stderr else "Construction validation failed")
  result=json.loads(run.stdout);customer=result["customer"].encode();approval=result["approval"].encode();md=result["meta"]
  ak="pick-tickets/construction-revisions/"+D+"/"+slug+"/approved-0002.json"
  put_immutable(ak,approval,{"customer_publish_approved":"true","sha256":sha(approval)})
  archive="pick-tickets/customer-revisions/"+D+"/"+slug+"/r00001-"+sha(prior)[:16]+".json"
  put_immutable(archive,prior,pm)
  latest,_,latesttag=get(k);again,_,_=get(ck);notice,_,_=get(fk)
  need(latest==prior and latesttag==etag and again==current and notice is None and time_ok(card,rs),"Concurrent update or cutoff")
  s.put_object(Bucket=B,Key=k,Body=customer,Metadata=md,ContentType="application/json",CacheControl="private,no-store",IfMatch=etag)
  saved,meta,_=get(k);need(saved==customer and all(meta.get(a)==v for a,v in md.items()),"Customer revision readback")
  published+=len(rs);print("PICK_CONSTRUCTION_1128_PUBLISHED",name,len(rs),flush=True)
 except Exception as e:
  held+=len(rs);print("PICK_CONSTRUCTION_1128_HOLD",name,len(rs),type(e).__name__,str(e)[:180],flush=True)
print("PICK_CONSTRUCTION_1128_TOTAL",published,"held",held,flush=True)
need(published>0,"No revisions published")

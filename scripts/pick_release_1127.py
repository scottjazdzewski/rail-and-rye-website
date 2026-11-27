"""Owner-authorized November 27 independent initial Pick Tickets release.
Exact sealed candidate; existing approved revisions are immutable. No secrets or paid content logged.
"""
import base64,hashlib,json,os,re,zlib,subprocess
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
import boto3
from botocore.exceptions import ClientError
DATE="2026-11-27"
RELEASE="2026-11-27T08:00:00Z"
SOURCE="c4f7b36d1b72f03ee8bcff3b022cd4740d4dbf0f190e218bc89cf9bf18504e06"
EXPECTED="ab92cf86d3ee153f62507b2aaf1e9882645e38a2b0035d3630c50623c79a684a"
CIPHER="4dae6a615783247c06e797e7128aeda7ccda48e19ea8cb6c8b4767aac4823c43"
PUB="jjxUgQwkjBuzNDPAGiSs1Rnp3vqC6/1V7kBtJJDELDk="
COUNTS={"Belmont Park":(10,97,15),"Churchill Downs":(12,106,19),"Charles Town":(8,69,11),"Delta Downs":(9,74,11),"Del Mar":(9,73,13),"Fair Grounds":(8,60,11),"Gulfstream Park":(9,70,12),"Laurel Park":(9,81,13),"Oaklawn Park":(10,101,15),"Parx Racing":(9,72,12),"Remington Park":(8,66,8),"Tampa Bay":(8,57,11),"Turf Paradise":(7,45,8),"Woodbine":(8,61,9),"Zia Park":(10,83,5)}
STAGE="pick-tickets/staging/"+DATE+"/revision-0001.json"
CUSTOMER="racing-intelligence/product-tabs/pick-tickets/"+DATE+"/"
def check(x,m):
 if not x:raise ValueError(m)
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def slug(x):return re.sub("[^a-z0-9]+","-",x.lower()).strip("-")
def main():
 now=datetime.now(timezone.utc);et=now.astimezone(ZoneInfo("America/New_York"))
 check(os.environ.get("GITHUB_REPOSITORY")==REPO and os.environ.get("GITHUB_REF")=="refs/heads/main","Unauthorized repository or branch")
 check(et.date().isoformat()==DATE and 3<=et.hour<11,"Only authorized current date pre-race catch-up release")
 check(base64.b64encode(bytes(private_key().public_key)).decode()==PUB,"Authorized public key changed")
 parts=sorted(Path("private-ingest/pick-20261127").glob("part-*.enc"));check(len(parts)==9,"Cipher part count")
 enc=b"".join(p.read_bytes().strip() for p in parts)
 check(len(enc)==69196 and sha(enc)==CIPHER,"Cipher digest mismatch")
 z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),500001)
 check(z.eof and not z.unused_data and len(raw)<=500000 and sha(raw)==EXPECTED,"Candidate digest mismatch")
 d=json.loads(raw)
 check(d["date"]==DATE and d["release_at"]==RELEASE and d["source_archive_sha256"]==SOURCE and d["revision"]==1 and d["prescratch"] is True,"Source/date mismatch")
 check(len(d["tracks"])==15 and {r["card"]["track"] for r in d["tracks"]}==set(COUNTS),"Track inventory mismatch")
 check(d["release_audit"]["mode"]=="OWNER_AUTHORIZED_INDEPENDENT_RELEASE" and d["release_audit"]["market_decision"]=="V34_EXACT_FALLBACK_INCOMPLETE_MARKET_RECEIPT","Independent release or market fallback mismatch")
 for row in d["tracks"]:
  c=row["card"];r=row["receipt"];name=c["track"]
  check((row["races"],row["runners"],len(c["sequences"]))==COUNTS[name],"Wrong track counts")
  check(c["revision"]==1 and c["status"]=="initial_current" and c["date"]==DATE and c["publication_mode"]=="owner-approved-gpt" and "market_assistance" not in row,"Wrong customer identity")
  check(set(row.get("non_participating_races",[])[0])=={"race_number","reason","source_pdf_sha256","source_page","wager_text"} if name=="Zia Park" else not row.get("non_participating_races"),"Nonparticipating audit")
  check(not row.get("canonical_source"),"Independent release must use original verified scorer receipt")
  check(all(re.fullmatch("[a-f0-9]{64}",r[k]) for k in ["source_pdf_sha256","pwin_sha256","tri_sha256","f4_sha256","features_sha256","f4_runner_sha256"]),"Receipt digest invalid")
  row["independent_source"]={"kind":"SOURCE_VERIFIED_FROZEN_TRI_F4_V1","source_archive_sha256":SOURCE,**{k:r[k] for k in ["source_pdf_sha256","pwin_sha256","tri_sha256","f4_sha256"]}}
  if name=="Zia Park":
   a=row["non_participating_races"];check(len(a)==1 and a[0]["race_number"]==1 and a[0]["source_page"]==1 and a[0]["source_pdf_sha256"]=="b0cf5187101773346dcdc89d69c02e7479b065e0d7d7a057bbc63c961610b9c9","Zia R1 source mismatch")
  if name in {"Charles Town","Delta Downs","Parx Racing"}:check(min(q["tickets"][0]["total_cents"] for q in c["sequences"])>=800,"Reference ticket below corroborated safe total")
 d["release_audit"]["sealed_candidate_sha256"]=EXPECTED
 stage=compact(d);digest=sha(stage)
 Path("/tmp/rr-pick-1127-stage.json").write_bytes(stage)
 subprocess.run(["node","scripts/validate_pick_release_1127.mjs"],check=True)
 cards=json.loads(Path("/tmp/rr-pick-1127-customer.json").read_bytes())
 check(len(cards)==15 and sum(len(c["sequences"]) for c in cards)==173,"Validated customer counts")
 s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 def get(k):
  try:
   o=s.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o.get("Metadata",{})
  except ClientError as e:
   if e.response["Error"]["Code"] in ("404","NoSuchKey","NotFound"):return None,{}
   raise
 def immutable(k,b,m):
  old,md=get(k)
  if old is None:
   try:s.put_object(Bucket=BUCKET,Key=k,Body=b,ContentType="application/json",CacheControl="private,no-store",Metadata=m,IfNoneMatch="*")
   except ClientError as e:
    if e.response["Error"]["Code"] not in ("412","PreconditionFailed"):raise
  got,gm=get(k);check(got==b and all(gm.get(k)==v for k,v in m.items() if k not in ("published_at","uploaded_at")),"Immutable write/readback conflict")
 old,om=get(STAGE);check(old is None or old==stage,"Different existing stage; no overwrite")
 prepared,_=get("pick-tickets/staging/"+DATE+"/prepared-0001.json")
 if prepared:check(json.loads(prepared)["sha256"]==digest,"Different existing prepared receipt")
 outputs=[]
 # Node emitted exact JSON.stringify of every normalized card separately, so use
 # the actual customer serializer rather than Python reserialization.
 exact=json.loads(Path("/tmp/rr-pick-1127-customer-exact.json").read_bytes())
 for c in cards:
  name=c["track"];k=CUSTOMER+slug(name)+".json";body=exact[name].encode()
  prior,pm=get(k)
  check(prior is None or (prior==body and pm.get("customer_publish_approved")=="true"),"Conflicting existing customer edition: "+name)
  outputs.append((k,body,c))
 # All checks precede the first write. Current-date only, immutable initial edition.
 immutable(STAGE,stage,{"sha256":digest,"stage_only":"true","release_at":RELEASE,"uploaded_at":now.isoformat()})
 for k,body,c in outputs:
  immutable(k,body,{"customer_publish_approved":"true","publication_mode":"owner-approved-gpt","revision":"1","source_sha256":c["source_input_sha256"],"content_sha256":sha(body),"staged_release_at":RELEASE})
  print("NOV27_PICK_CUSTOMER_READBACK_PASS",c["track"],len(c["sequences"]),flush=True)
 print("NOV27_PICK_RELEASE_READBACK_PASS",json.dumps({"date":DATE,"tracks":15,"races":134,"runners":1115,"sequences":173,"stage_sha256":digest,"published_at":datetime.now(timezone.utc).isoformat(),"catalog_verified":False}),flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("NOV27_PICK_RELEASE_HOLD "+type(e).__name__+": "+str(e)[:180])

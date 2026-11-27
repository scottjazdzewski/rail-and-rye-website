"""November 27 Pick Tickets revision 2, from already certified canonical scratch-final receipts."""
import boto3,os,json,hashlib,re,subprocess,urllib.request,urllib.error,base64,zlib
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
from botocore.exceptions import ClientError
D="2026-11-27"
SRC="c4f7b36d1b72f03ee8bcff3b022cd4740d4dbf0f190e218bc89cf9bf18504e06"
PARENT="561bbbb058f15a0d674c59a24d565fcbb75bbf908ef08be165a158e34b55e3ed"
ROOT=f"pick-tickets/staging/{D}/"
CUSTOM=f"racing-intelligence/product-tabs/pick-tickets/{D}/"
CONF=[["gulfstream-park","Gulfstream Park","Gulfstream Park",9,55,15,12,"scratch03-gp","d9a1db3d055b603eeb733db60388135e9d5a9b0324b72e1249f111eeafa24130","45ff3801ab0cead5f388e38a15357fe922d70ab15132e62ab415bfb6794d674f","2026-11-27T05:00:00+00:00"],["belmont-park","Belmont Park","Belmont Park",10,88,12,15,"scratch04-bel","c9d7f5e621287579a219656d61390f301e3d5619ce5262c22654e2e07237806f","fa005bbab6578372f4134126807c35d596453cff2acc113de4c8ced3719f789c","2026-11-27T05:00:00+00:00"]]
SCR={"gulfstream-park":{1:["5","8"],2:["4"],3:["5","7"],4:["6"],5:["3","5"],6:["6","7"],7:["2","4","5","6","8"]},"belmont-park":{4:["7"],5:["3","7","11","13","14"],6:["13"],7:["9"],8:["5"],9:["10"],10:["8","10"]}}
DRAW={"gulfstream-park":{},"belmont-park":{}}
RIDERS={"gulfstream-park":{2:{"7":"Y. Torres"},4:{"2":"M. Meneses"},9:{"7":"M. Husbands"}},"belmont-park":{5:{"5":"Not assigned"}}}
def need(ok,msg):
 if not ok:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def slug(x):return re.sub("[^a-z0-9]+","-",x.lower()).strip("-")
need(os.environ["GITHUB_REPOSITORY"]==REPO and os.environ["GITHUB_REF"]=="refs/heads/main","Unauthorized repository/branch")
need(datetime.now(timezone.utc).astimezone(ZoneInfo("America/New_York")).date().isoformat()==D,"Date closed")
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(k):
 o=s.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o
def immutable(k,b,m):
 try:
  old,o=get(k);need(old==b,"Archive collision")
 except ClientError as e:
  if e.response["Error"]["Code"] not in ("404","NoSuchKey","NotFound"):raise
  s.put_object(Bucket=BUCKET,Key=k,Body=b,ContentType="application/json",CacheControl="private,no-store",Metadata=m,IfNoneMatch="*")
 need(get(k)[0]==b,"Archive readback")
raw,so=get(ROOT+"revision-0001.json")
need(sha(raw)==PARENT and so["Metadata"].get("sha256")==PARENT,"Immutable parent mismatch")
stage=json.loads(raw)
need(stage["date"]==D and stage["source_archive_sha256"]==SRC and stage["revision"]==1 and len(stage["tracks"])==15,"Stage identity")
Path("/tmp/rr-pick-1127-stage.json").write_bytes(raw)
subprocess.run(["node","scripts/validate_pick_release_1127.mjs"],check=True)
original=json.loads(Path("/tmp/rr-pick-1127-customer-exact.json").read_bytes())
ready=[];holds=[]
for sl,name,oldname,nr,ns,nsc,nq,batch,packet,pdf,stamp in CONF:
 try:
  row=next(r for r in stage["tracks"] if r["card"]["track"]==oldname)
  need(row["receipt"]["source_pdf_sha256"]==pdf,"Original PDF digest mismatch")
  key=CUSTOM+slug(oldname)+".json";old,om=get(key);prior=json.loads(old)
  need(om["Metadata"].get("customer_publish_approved")=="true" and om["Metadata"].get("content_sha256")==sha(old) and prior["date"]==D and prior["track"]==oldname and len(prior["sequences"])==nq,"Customer parent identity")
  need(prior["revision"] in (1,2),"Unexpected newer revision")
  if prior["revision"]==1:need(old==original[oldname].encode() and prior["status"]=="initial_current","Customer parent differs from original validated stage")
  pb,po=get(f"projections/dashboard/{D}/{sl}.json");fb,fo=get(f"projections/f4-ordered/{D}/{sl}.json");p=json.loads(pb);f=json.loads(fb)
  qb,_=get(f"projections/qa/{D}/{batch}-release.json");qa=json.loads(qb)
  q=next(x for x in qa["tracks"] if x["track"]==name)
  need(qa["date"]==D and qa["status"]=="VERIFIED_SCRATCH_FINAL" and qa["batch"]==batch and q["dashboard_sha256"]==sha(pb) and q["ordered_sha256"]==sha(fb) and q["runners"]==ns and q["scratches"]==nsc,"Canonical receipt mismatch")
  need(p["race_date"]==f["date"]==D and p["track_name"]==f["track_name"]==name and p["projection_status"]=="scratch_final" and f["scratch_state"]=="SCRATCH_FINAL" and f["source_sha256"]==SRC and p["scratch_release_sha256"]==f["scratch_release_sha256"]==packet and p["model_receipts"]==f["dashboard_receipts"] and f["f4_receipt_sha256"]==p["model_receipts"]["f4_sha256"],"Canonical score identity")
  need(all(re.fullmatch("[a-f0-9]{64}",v) for v in p["model_receipts"].values()) and datetime.fromisoformat(p["official_snapshot_utc"].replace("Z","+00:00"))>=datetime.fromisoformat(stamp),"Source hashes/timestamp")
  # Reopen the exact already-validated encrypted upstream source. No models or
  # private runner data are transferred out of the private job.
  folder=Path(f"private-ingest/20261127-{batch}");m=json.loads((folder/"manifest.json").read_bytes())
  t=next(x for x in m["tracks"] if x[0]==sl);enc=(folder/(sl+".enc")).read_bytes()
  need(t[6]==packet and sha(enc)==t[7],"Original sealed source digest")
  z=zlib.decompressobj();plain=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),400001)
  need(z.eof and not z.unused_data and len(plain)<=400000 and sha(plain)==packet,"Original source checksum")
  d=json.loads(plain)
  need(d["source_pdf_sha256"]==pdf and d["source_sha256"]==SRC and d["date"]==D and d["track"]==name and d["lineage"]==p["model_receipts"] and d["snapshot_sha256"]==p["scratch_source_sha256"],"Original scoring lineage")
  rs={r["race_number"]:r for r in p["races"]};source_rs={r["race_number"]:r for r in d["races"]}
  need(set(rs)==set(source_rs)==set(range(1,nr+1)) and sum(len(r["entries"]) for r in rs.values())==ns,"Full race inventory")
  for n,r in rs.items():
   a={str(e["program_number"]):e for e in r["entries"]};b={str(e["program_number"]):e for e in source_rs[n]["entries"]}
   need(len(a)==len(r["entries"]) and set(a)==set(b) and abs(sum(e["win_probability_exact"] for e in a.values())-100)<1e-6,"Field inventory")
   need(all(e["horse_name"]==b[k]["horse_name"] and e["jockey"]==b[k]["jockey"] and e["trainer"]==b[k]["trainer"] and abs(e["win_probability_exact"]-b[k]["win_probability_exact"])<1e-8 and abs(e["win_probability_exact"]/100-e["f4_probabilities"]["exact_p1"])<1e-12 for k,e in a.items()),"Source runner/score mismatch")
   need({str(e["program_number"]) for e in r["scratches"]}==set(SCR[sl].get(n,[])) and not (set(a)&set(SCR[sl].get(n,[]))),"Official scratch mismatch")
   need(all(k in a and a[k]["horse_name"]==h for k,h in DRAW[sl].get(n,{}).items()),"Official draw-in mismatch")
   need(r.get("track_condition")==("Fast" if sl=="gulfstream-park" else "Sloppy"),"Condition mismatch")
   if (sl=="gulfstream-park" and n in (1,5,7,9)) or (sl=="belmont-park" and n in (5,6,8,9)):need(r["surface"]=="Synthetic","Surface mismatch")
   need(all(a[k]["jockey"]==v for k,v in RIDERS[sl].get(n,{}).items()),"Replacement rider mismatch")
   for k,v in ({2:{"7":120},4:{"2":124}} if sl=="gulfstream-park" else {}).get(n,{}).items():need(a[k]["weight_carried_lbs"]==v,"Weight mismatch")
  audit={"date":D,"track":oldname,"canonical_track":name,"source_archive_sha256":SRC,"source_pdf_sha256":pdf,"canonical_dashboard_sha256":sha(pb),"canonical_f4_sha256":sha(fb),"canonical_release_sha256":sha(qb),"sealed_scoring_sha256":packet,"canonical_receipts":p["model_receipts"],"initial_stage_sha256":PARENT,"market_decision":"V34_EXACT_FALLBACK_CHANGED_SURFACE_CONDITION_OR_CONNECTION_SOURCE_NOT_CERTIFIED","official_snapshot_utc":p["official_snapshot_utc"],"runners":ns,"scratches":nsc,"sequences":nq}
  infile=Path("/tmp/rr-pick-1127-scratch-input.json");infile.write_bytes(compact({"row":row,"projection":p,"model":f,"audit":audit,"scratches":SCR[sl]}))
  subprocess.run(["node","scripts/build_pick_scratch_1127.mjs"],check=True)
  body=Path("/tmp/rr-pick-1127-scratch-output.json").read_bytes();c=json.loads(body)
  need(c["revision"]==2 and c["track"]==oldname and len(c["sequences"])==nq,"Output identity")
  if prior["revision"]==2:need(old==body,"Different revision 2 already exists")
  ready.append((key,old,om,body,audit,pb,fb,sl))
 except Exception as e:
  holds.append(oldname);print("PICK_MISSED_1127_HOLD",oldname,type(e).__name__,str(e)[:150],flush=True)
for key,old,om,body,audit,pb,fb,sl in ready:
 name=audit["track"];ar=f"pick-tickets/scratch-revisions/{D}/{slug(name)}/"
 need(get(key)[0]==old and get(f"projections/dashboard/{D}/{sl}.json")[0]==pb and get(f"projections/f4-ordered/{D}/{sl}.json")[0]==fb,"Concurrent source change "+name)
 if json.loads(old)["revision"]==1:
  immutable(ar+"r1-customer-"+sha(old)+".json",old,om["Metadata"])
  a=compact({**audit,"prior_customer_sha256":sha(old),"revised_customer_sha256":sha(body)})
  immutable(ar+"r2-source-"+sha(a)+".json",a,{"sha256":sha(a)})
  s.put_object(Bucket=BUCKET,Key=key,Body=body,ContentType="application/json",CacheControl="private,no-store",Metadata={**om["Metadata"],"revision":"2","content_sha256":sha(body),"source_sha256":audit["canonical_dashboard_sha256"],"receipt_sha256":audit["canonical_receipts"]["f4_sha256"],"customer_publish_approved":"true"},IfMatch=om["ETag"])
 rb,rm=get(key);need(rb==body and rm["Metadata"].get("content_sha256")==sha(body) and rm["Metadata"].get("customer_publish_approved")=="true","Customer readback "+name)
 print("PICK_MISSED_1127_READBACK_PASS",name,audit["runners"],audit["scratches"],audit["sequences"],sha(body),flush=True)
print("PICK_MISSED_1127_SUMMARY",len(ready),sum(x[4]["sequences"] for x in ready),"holds",holds,flush=True)
try:
 req=urllib.request.Request("https://railandryeracing.com/api/products?qa=pick1127-missed",headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
 with urllib.request.urlopen(req,timeout=20) as r:products=json.load(r)["products"]
 rows=products+[q for p in products for q in p.get("included_products",[])]
 names={p.get("track") for p in rows if p.get("category")=="Pick Tickets" and p.get("race_date")==D and p.get("track")}
 print("PICK_1127_PUBLIC_CATALOG",len(names),"tracks",flush=True)
except Exception as e:print("PICK_1127_PUBLIC_CATALOG_UNVERIFIED",type(e).__name__,flush=True)
if holds:raise RuntimeError("One or more track holds")
subprocess.run(["python","scripts/audit_all_pick_scratch_1127.py"],check=True)

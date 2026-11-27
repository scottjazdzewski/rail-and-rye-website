"""Run date-scoped owner-approved protected-frontier review, archive, and guarded publication."""
import json,os,re,hashlib,boto3,subprocess,urllib.request,copy
from pathlib import Path
from datetime import datetime,timezone,timedelta
from zoneinfo import ZoneInfo
from botocore.exceptions import ClientError
D="2026-11-27";B="rail-and-rye-private-cards";P=f"racing-intelligence/product-tabs/pick-tickets/{D}/"
TRACKS={"Belmont Park":15,"Churchill Downs":19,"Charles Town":11,"Delta Downs":11,"Del Mar":13,"Fair Grounds":11,"Gulfstream Park":12,"Laurel Park":13,"Oaklawn Park":15,"Parx Racing":12,"Remington Park":8,"Tampa Bay":11,"Turf Paradise":8,"Woodbine":9,"Zia Park":5}
SRC="c4f7b36d1b72f03ee8bcff3b022cd4740d4dbf0f190e218bc89cf9bf18504e06"
def sha(x):return hashlib.sha256(x).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def slug(x):return re.sub("[^a-z0-9]+","-",x.lower()).strip("-")
def need(x,m):
 if not x:raise ValueError(m)
def now():return datetime.now(timezone.utc)
need(os.environ["GITHUB_REPOSITORY"]=="scottjazdzewski/rail-and-rye-website" and os.environ["GITHUB_REF"]=="refs/heads/main","Unauthorized branch")
need(now().astimezone(ZoneInfo("America/New_York")).date().isoformat()==D,"Race date closed")
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(k):
 o=s.get_object(Bucket=B,Key=k);return o["Body"].read(),o
def immutable(k,b,m):
 try:
  old,_=get(k);need(old==b,"Archive collision")
 except ClientError as e:
  if e.response["Error"]["Code"] not in ("NoSuchKey","404","NotFound"):raise
  s.put_object(Bucket=B,Key=k,Body=b,ContentType="application/json",CacheControl="private,no-store",Metadata=m,IfNoneMatch="*")
 need(get(k)[0]==b,"Archive readback")
stage,st=get(f"pick-tickets/staging/{D}/revision-0001.json")
need(sha(stage)=="561bbbb058f15a0d674c59a24d565fcbb75bbf908ef08be165a158e34b55e3ed","Original source mismatch")
original={r["card"]["track"]:r for r in json.loads(stage)["tracks"]}
# Bind all scratch-final objects to existing certified publication receipts.
receipts=set()
for pg in s.get_paginator("list_objects_v2").paginate(Bucket=B,Prefix=f"projections/qa/{D}/scratch"):
 for o in pg.get("Contents",[]):
  if not o["Key"].endswith("-release.json"):continue
  b,_=get(o["Key"]);v=json.loads(b)
  if v.get("date")==D and v.get("status") in ("VERIFIED_SCRATCH_FINAL","PARTIAL_VERIFIED_SCRATCH_FINAL"):
   receipts.update((t.get("dashboard_sha256"),t.get("ordered_sha256")) for t in v.get("tracks",[]))
def post(v,explicit_et=False):
 if not isinstance(v,str):return None
 m=re.fullmatch(r"(\d{1,2}):(\d{2})\s*([AP]M)(?:\s*(ET|EST|EDT))?",v.strip(),re.I)
 if m and (m[4] or explicit_et):
  h=int(m[1]);mi=int(m[2])
  if 1<=h<=12 and 0<=mi<60:return datetime.fromisoformat(D).replace(hour=h%12+(12 if m[3].upper()=="PM" else 0),minute=mi,tzinfo=ZoneInfo("America/New_York")).astimezone(timezone.utc)
 m=re.fullmatch(r"(\d{1,2}):(\d{2})(?:\s*ET)?",v.strip(),re.I)
 if m and explicit_et and 0<=int(m[1])<24 and 0<=int(m[2])<60:return datetime.fromisoformat(D).replace(hour=int(m[1]),minute=int(m[2]),tzinfo=ZoneInfo("America/New_York")).astimezone(timezone.utc)
 return None
sources={};cards=[]
for name,nq in TRACKS.items():
 sl="tampa-bay-downs" if name=="Tampa Bay" else slug(name)
 key=P+slug(name)+".json";raw,m=get(key);c=json.loads(raw);meta=m["Metadata"]
 need(meta.get("customer_publish_approved")=="true" and meta.get("content_sha256")==sha(raw) and c["date"]==D and c["track"]==name and len(c["sequences"])==nq,"Customer identity "+name)
 pk=f"projections/dashboard/{D}/{sl}.json";fk=f"projections/f4-ordered/{D}/{sl}.json";pb,_=get(pk);fb,_=get(fk);p=json.loads(pb);f=json.loads(fb)
 need(p["race_date"]==f["date"]==D and f["source_sha256"]==SRC and f["f4_receipt_sha256"]==p["model_receipts"]["f4_sha256"],"Canonical source "+name)
 if p["projection_status"]=="scratch_final":need((sha(pb),sha(fb)) in receipts and c["status"]=="scratch_updated","Scratch release not current "+name)
 else:need(p["projection_status"]=="prescratch" and c["status"]=="initial_current","Unreconciled source "+name)
 fields={};scr={};posts={}
 for r in p["races"]:
  k=str(r["race_number"]);v={str(e["program_number"]):e["win_probability_exact"] for e in r["entries"]};scr[k]={str(e["program_number"]) for e in r.get("scratches",[])}
  need(not set(v)&scr[k] and abs(sum(v.values())-100)<1e-6,"Canonical field invalid")
  for g in original[name].get("coupled_interests",{}).get(k,[]):
   members=[m["program"] for m in g["members"] if m["program"] in v]
   if members:
    total=sum(v[x] for x in members)
    for x in members:del v[x]
    v[g["program"]]=total;scr[k].discard(g["program"])
  fields[k]=v
  # Use explicit Eastern source time; choose earlier of two verified times.
  a=post(r.get("post_time_et"),True);b=post(c.get("post_times_by_race",{}).get(k))
  if a:posts[k]=min(a,b).isoformat() if b else a.isoformat()
 for q in c["sequences"]:
  need(len(q["tickets"])==1,"One-ticket lock")
  for leg in q["race_fields"]:
   k=str(leg["race_number"]);v=q["review_probabilities"][k]
   need(set(v)==set(leg["programs"])==set(fields[k]) and all(abs(x-fields[k][j])<1e-7 for j,x in v.items()),"Exact source mismatch "+name)
  for t in q["tickets"]:
   for l in t["legs"]:
    k=str(l["race_number"]);need(set(l["programs"]).issubset(fields[k]) and not set(l["programs"])&scr[k],"Scratch still selected "+name)
 sources[key]=(raw,m,pk,pb,fk,fb)
 cards.append({"key":key,"card":c,"posts":posts})
# Five-minute guard before scheduled first leg; recheck immediately before every write.
cutoff=now()+timedelta(minutes=5)
inp={"cutoff":cutoff.isoformat(),"cards":cards}
Path("/tmp/pick-protection-input.json").write_bytes(compact(inp))
subprocess.run(["node","scripts/review_pick_protection_1127.mjs"],check=True)
out=json.loads(Path("/tmp/pick-protection-output.json").read_bytes())
need(out["totals"]["reviewed"]==173,"Review count")
# Preserve full source-bound review and alternatives privately, regardless of release count.
report={"date":D,"cutoff_utc":cutoff.isoformat(),"source_customer_hashes":{k:sha(v[0]) for k,v in sources.items()},"canonical_hashes":{k:[sha(v[3]),sha(v[5])] for k,v in sources.items()},"review":out}
rb=compact(report);root=f"pick-tickets/construction-reviews/{D}/single-protection/"
immutable(root+"review-"+sha(rb)+".json",rb,{"sha256":sha(rb)})
pub=[];expired=[];holds=[]
for proposed in out["cards"]:
 key=proposed["key"];raw,m,pk,pb,fk,fb=sources[key];before=json.loads(raw);after=proposed["card"];name=before["track"]
 try:
  need(get(key)[0]==raw and get(pk)[0]==pb and get(fk)[0]==fb,"Concurrent source change")
  changed=set(proposed["changed"]);need(after["revision"]==before["revision"]+1 and {k:v for k,v in after.items() if k not in ("revision","sequences")}=={k:v for k,v in before.items() if k not in ("revision","sequences")},"Unrelated edit")
  row=next(x for x in cards if x["key"]==key)
  # Expiring sequences are reverted byte-for-byte, never rewritten.
  for i in list(changed):
   old=before["sequences"][i];p=row["posts"].get(str(old["start_race"]))
   if not p or datetime.fromisoformat(p)<=now()+timedelta(minutes=5):after["sequences"][i]=old;changed.remove(i);expired.append((name,old["name"],old["start_race"]));continue
  if not changed:continue
  for i,(a,b) in enumerate(zip(before["sequences"],after["sequences"])):
   if i not in changed:need(a==b,"Unchanged sequence modified");continue
   need(a["race_fields"]==b["race_fields"] and a["review_probabilities"]==b["review_probabilities"] and a["tickets"][0]["unit_cents"]==b["tickets"][0]["unit_cents"] and a["tickets"][0]["total_cents"]==b["tickets"][0]["total_cents"],"Field/denomination/cost changed")
   def hit(q):return __import__("math").prod(sum(q["review_probabilities"][str(l["race_number"])][k] for k in l["programs"])/100 for l in q["tickets"][0]["legs"])
   need(hit(b)+1e-12>=hit(a),"Hit probability reduced")
   need(__import__("math").prod(len(l["programs"]) for l in b["tickets"][0]["legs"])==b["tickets"][0]["combinations"],"Combination mismatch")
  body=compact(after);prefix=root+slug(name)+"/"
  immutable(prefix+f"r{before['revision']}-customer-"+sha(raw)+".json",raw,m["Metadata"])
  receipt=compact({"review_sha256":sha(rb),"prior":sha(raw),"new":sha(body),"changed":sorted(changed),"published_at":now().isoformat()})
  immutable(prefix+f"r{after['revision']}-receipt-"+sha(receipt)+".json",receipt,{"sha256":sha(receipt)})
  need(get(key)[0]==raw and get(pk)[0]==pb and get(fk)[0]==fb,"Concurrent update before write")
  need(all(datetime.fromisoformat(row["posts"][str(before["sequences"][i]["start_race"])])>now()+timedelta(minutes=5) for i in changed),"First leg cutoff reached")
  s.put_object(Bucket=B,Key=key,Body=body,ContentType="application/json",CacheControl="private,no-store",Metadata={**m["Metadata"],"revision":str(after["revision"]),"content_sha256":sha(body),"construction_review_sha256":sha(rb)},IfMatch=m["ETag"])
  check,cm=get(key);need(check==body and cm["Metadata"].get("content_sha256")==sha(body),"Customer readback")
  pub.extend((name,i) for i in changed)
  print("PROTECTION_READBACK_PASS",name,len(changed),after["revision"],flush=True)
 except Exception as e:holds.append((name,str(e)[:120]));print("PROTECTION_HOLD",name,str(e)[:120],flush=True)
snap={}
for key,(raw,m,pk,pb,fk,fb) in sources.items():
 new,nm=get(key);need(nm["Metadata"].get("content_sha256")==sha(new),"Readback checksum")
 need(get(pk)[0]==pb and get(fk)[0]==fb,"Canonical changed during final audit")
 old=json.loads(raw);c=json.loads(new);allowed={i for name,i in pub if name==old["track"]}
 need(all(a==b for i,(a,b) in enumerate(zip(old["sequences"],c["sequences"])) if i not in allowed),"Unapproved customer sequence changed")
 snap[key]={"text":new.decode(),"metadata":nm["Metadata"]}
Path("/tmp/rr-pick-1127-current-reader.json").write_bytes(compact(snap))
subprocess.run(["node","scripts/verify_pick_reader_1127.mjs"],check=True)
req=urllib.request.Request("https://railandryeracing.com/api/products?qa=pick-protection-1127",headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
with urllib.request.urlopen(req,timeout=35) as res:products=json.load(res)["products"]
rows=products+[r for p in products for r in p.get("included_products",[])]
names={r.get("track") for r in rows if r.get("category")=="Pick Tickets" and r.get("race_date")==D and r.get("track")}
need(names==set(TRACKS),"Live catalog mismatch")
print("PROTECTION_FINAL",json.dumps({"published":len(pub),"expired":expired,"holds":holds,"review_sha256":sha(rb),"catalog_tracks":len(names),"tickets":173,"cutoff":cutoff.isoformat()}),flush=True)
need(not holds,"Publication holds")

"""Full current customer field and official scratch audit; no runner scores emitted."""
import json,os,re,hashlib,boto3,subprocess,urllib.request
from pathlib import Path
D="2026-11-27";B="rail-and-rye-private-cards";P=f"racing-intelligence/product-tabs/pick-tickets/{D}/"
TRACKS={"Belmont Park":15,"Churchill Downs":19,"Charles Town":11,"Delta Downs":11,"Del Mar":13,"Fair Grounds":11,"Gulfstream Park":12,"Laurel Park":13,"Oaklawn Park":15,"Parx Racing":12,"Remington Park":8,"Tampa Bay":11,"Turf Paradise":8,"Woodbine":9,"Zia Park":5}
# Latest source batches, including prior submissions omitted from ticket releases.
BATCH={"Parx Racing":"scratch01-prx-tam","Laurel Park":"scratch02-lrl","Gulfstream Park":"scratch03-gp","Belmont Park":"scratch04-bel","Woodbine":"scratch05-wo","Charles Town":"scratch06-ct-fg","Fair Grounds":"scratch06-ct-fg","Tampa Bay":"scratch07-tam","Churchill Downs":"scratch08-cd","Oaklawn Park":"scratch09-op","Zia Park":"scratch10-zia"}
def sha(x):return hashlib.sha256(x).hexdigest()
def slug(x):return re.sub("[^a-z0-9]+","-",x.lower()).strip("-")
def need(x,m):
 if not x:raise ValueError(m)
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(k):
 o=s.get_object(Bucket=B,Key=k);return o["Body"].read(),o["Metadata"]
stage,_=get(f"pick-tickets/staging/{D}/revision-0001.json")
need(sha(stage)=="561bbbb058f15a0d674c59a24d565fcbb75bbf908ef08be165a158e34b55e3ed","Original stage mismatch")
original={r["card"]["track"]:r for r in json.loads(stage)["tracks"]}
snap={};holds=[]
for name,nq in TRACKS.items():
 try:
  sl="tampa-bay-downs" if name=="Tampa Bay" else slug(name)
  key=P+slug(name)+".json";raw,m=get(key);c=json.loads(raw)
  need(m.get("customer_publish_approved")=="true" and m.get("content_sha256")==sha(raw) and c["date"]==D and c["track"]==name and len(c["sequences"])==nq,"Customer identity")
  pb,_=get(f"projections/dashboard/{D}/{sl}.json");fb,_=get(f"projections/f4-ordered/{D}/{sl}.json")
  p=json.loads(pb);f=json.loads(fb)
  need(p["race_date"]==f["date"]==D and f["source_sha256"]=="c4f7b36d1b72f03ee8bcff3b022cd4740d4dbf0f190e218bc89cf9bf18504e06" and f["f4_receipt_sha256"]==p["model_receipts"]["f4_sha256"],"Projection identity")
  if name in BATCH:
   qb,_=get(f"projections/qa/{D}/{BATCH[name]}-release.json");q=json.loads(qb)
   need(q["date"]==D and q["status"] in ("VERIFIED_SCRATCH_FINAL","PARTIAL_VERIFIED_SCRATCH_FINAL") and any(t["dashboard_sha256"]==sha(pb) and t["ordered_sha256"]==sha(fb) for t in q["tracks"]),"Latest supplied scratch receipt mismatch")
   need(c["revision"]>=2 and c["status"]=="scratch_updated" and p["projection_status"]=="scratch_final","Scratch revision missing")
  else:
   need(p["projection_status"]=="prescratch","Unreconciled additional upstream scratch batch")
  fields={};scr={}
  for r in p["races"]:
   k=str(r["race_number"]);v={str(e["program_number"]):e["win_probability_exact"] for e in r["entries"]};scr[k]={str(e["program_number"]) for e in r.get("scratches",[])}
   need(not set(v)&scr[k],"Canonical scratch still active")
   for g in original[name].get("coupled_interests",{}).get(k,[]):
    members=[m["program"] for m in g["members"] if m["program"] in v]
    if members:
     total=sum(v[x] for x in members)
     for x in members:del v[x]
     v[g["program"]]=total
     # A coupled betting interest survives if an active member remains.
     scr[k].discard(g["program"])
   fields[k]=v
  maxdiff=0;legs=0
  for seq in c["sequences"]:
   for leg in seq["race_fields"]:
    k=str(leg["race_number"]);v=seq["review_probabilities"][k]
    need(set(v)==set(leg["programs"])==set(fields[k]),"Field mismatch R"+k)
    maxdiff=max(maxdiff,max(abs(x-fields[k][j]) for j,x in v.items()))
    need(not set(leg["programs"])&scr[k],"Scratch in field R"+k)
    legs+=1
   for t in seq["tickets"]:
    for leg in t["legs"]:
     k=str(leg["race_number"]);need(set(leg["programs"]).issubset(fields[k]) and not set(leg["programs"])&scr[k],"Scratch in ticket R"+k)
  need(maxdiff<1e-7,"PWIN mismatch "+str(maxdiff))
  if name=="Gulfstream Park":need("7" not in fields["3"] and "5" not in fields["3"],"Gulfstream R3 scratches missing")
  snap[key]={"text":raw.decode(),"metadata":m}
  print("PICK_FULL_AUDIT_PASS",name,"revision",c["revision"],"sequences",nq,"legs",legs,"max_pp",maxdiff,flush=True)
 except Exception as e:
  holds.append(name);print("PICK_FULL_AUDIT_HOLD",name,type(e).__name__,str(e)[:160],flush=True)
print("PICK_FULL_AUDIT_SUMMARY",len(snap),"of 15 tracks",holds,flush=True)
need(not holds,"Full slate scratch audit holds")
Path("/tmp/rr-pick-1127-current-reader.json").write_text(json.dumps(snap))
subprocess.run(["node","scripts/verify_pick_reader_1127.mjs"],check=True)
req=urllib.request.Request("https://railandryeracing.com/api/products?qa=pick-full-scratch-audit-1127",headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
with urllib.request.urlopen(req,timeout=30) as res:products=json.load(res)["products"]
rows=products+[q for p in products for q in p.get("included_products",[])]
names={p.get("track") for p in rows if p.get("category")=="Pick Tickets" and p.get("race_date")==D and p.get("track")}
need(names==set(TRACKS),"Public catalog mismatch")
print("PICK_FULL_AUDIT_PUBLIC_PASS",15,173,flush=True)

"""Read-only Nov27 verification after revision 2; no protected content printed."""
import boto3,hashlib,json,os,re,urllib.request,urllib.error,time,subprocess
from pathlib import Path
from botocore.exceptions import ClientError
D="2026-11-27";B="rail-and-rye-private-cards";P=f"racing-intelligence/product-tabs/pick-tickets/{D}/"
TRACKS={"Belmont Park":15,"Churchill Downs":19,"Charles Town":11,"Delta Downs":11,"Del Mar":13,"Fair Grounds":11,"Gulfstream Park":12,"Laurel Park":13,"Oaklawn Park":15,"Parx Racing":12,"Remington Park":8,"Tampa Bay":11,"Turf Paradise":8,"Woodbine":9,"Zia Park":5}
UPDATES={"Zia Park":[2,"3dcca8b74a8fd641683c0523b24edb8b0aa5e908984e4d4f6079686350be7d82"],"Oaklawn Park":[2,"6f16fd86731919fc27db78665f3962b734e5bd8cdca7997c6043447aaa08a9bb"],"Churchill Downs":[2,"d0e663244387b1cc0ebe9b87f91da30525c7f8f193dc477fab072cfffeb41cd0"],"Parx Racing":[2,"6c048a72546bb0c336a6a42a4ef7d37549d3921e149b8c755abfb9aa2fab2e14"],"Laurel Park":[2,"f31a0fa097022de60bb2bac624b20fe5e1da6a99d3e62c76f0350145634e0f2c"],"Charles Town":[2,"f4c6a6b64f88a7840fa7ee6126edff1bda95abcbda97f3f1c52b20ec37fe894e"],"Fair Grounds":[2,"9d587378eff8936c312bf957f951af2b9cceaea07acf18bfcd109871dbece19a"],"Tampa Bay":[3,"da88f613ebaa6441156b79b0057f76b975baaf7318546e2c206e5f94ea23686e"],"Woodbine":[2,"8cbcb671495607362f67058fa2e5a3b20f18ae6b80516a8a0257742440dc47ed"]}
def need(ok,m):
 if not ok:raise ValueError(m)
def sha(b):return hashlib.sha256(b).hexdigest()
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(k):
 try:
  o=s.get_object(Bucket=B,Key=k);return o["Body"].read(),o["Metadata"]
 except ClientError as e:
  if e.response["Error"]["Code"] in ("404","NoSuchKey","NotFound"):return None,{}
  raise
snap={}
for n,c in TRACKS.items():
 k=P+re.sub("[^a-z0-9]+","-",n.lower()).strip("-")+".json";raw,m=get(k)
 need(raw and m.get("customer_publish_approved")=="true" and m.get("publication_mode")=="owner-approved-gpt" and m.get("content_sha256")==sha(raw),"Customer checksum "+n)
 q=json.loads(raw);need(q["date"]==D and q["track"]==n and len(q["sequences"])==c,"Customer identity "+n)
 if n in UPDATES:need(q["revision"]==UPDATES[n][0] and q["status"]=="scratch_updated" and sha(raw)==UPDATES[n][1],"Updated revision mismatch "+n)
 snap[k]={"text":raw.decode(),"metadata":m}
# Match the current exact certified scratch-final Race Cards source.
pb,pm=get(f"projections/dashboard/{D}/churchill-downs.json");fb,fm=get(f"projections/f4-ordered/{D}/churchill-downs.json");qb,_=get(f"projections/qa/{D}/scratch08-cd-release.json")
p=json.loads(pb);f=json.loads(fb);q=json.loads(qb)
need(q["date"]==D and q["status"]=="VERIFIED_SCRATCH_FINAL" and any(t["dashboard_sha256"]==sha(pb) and t["ordered_sha256"]==sha(fb) and t["runners"]==89 and t["scratches"]==17 for t in q["tracks"]),"Canonical release receipt")
need(p["projection_status"]=="scratch_final" and f["scratch_state"]=="SCRATCH_FINAL" and f["f4_receipt_sha256"]==p["model_receipts"]["f4_sha256"],"Canonical scoring lineage")
c=json.loads(snap[P+"churchill-downs.json"]["text"])
fields={str(r["race_number"]):{str(e["program_number"]):e["win_probability_exact"] for e in r["entries"]} for r in p["races"]}
need(len(fields)==12 and sum(map(len,fields.values()))==89,"Canonical field size")
maxdiff=0
for seq in c["sequences"]:
 for leg in seq["race_fields"]:
  k=str(leg["race_number"]);a=seq["review_probabilities"][k];need(set(a)==set(fields[k])==set(leg["programs"]),"Canonical roster parity")
  maxdiff=max(maxdiff,max(abs(v-fields[k][j]) for j,v in a.items()))
need(maxdiff<1e-7,"Canonical PWIN parity difference "+str(maxdiff))
print("PICK_CD_CANONICAL_PARITY_PASS",89,17,"max_pp",maxdiff,flush=True)
# Check independently published Oaklawn against the current Race Cards if available.
opb,_=get(f"projections/dashboard/{D}/oaklawn-park.json")
ofb,_=get(f"projections/f4-ordered/{D}/oaklawn-park.json")
op=json.loads(opb);of=json.loads(ofb)
oc=json.loads(snap[P+"oaklawn-park.json"]["text"])
if op["projection_status"]=="scratch_final":
 need(of["scratch_state"]=="SCRATCH_FINAL" and of["f4_receipt_sha256"]==op["model_receipts"]["f4_sha256"],"Oaklawn canonical receipt mismatch")
 expected={str(r["race_number"]):{str(e["program_number"]):e["win_probability_exact"] for e in r["entries"]} for r in op["races"]}
 need(len(expected)==10 and sum(map(len,expected.values()))==95,"Oaklawn canonical roster")
 delta=0
 for seq in oc["sequences"]:
  for leg in seq["race_fields"]:
   k=str(leg["race_number"]);a=seq["review_probabilities"][k]
   need(set(a)==set(expected[k])==set(leg["programs"]),"Oaklawn canonical runner parity")
   delta=max(delta,max(abs(v-expected[k][j]) for j,v in a.items()))
 need(delta<1e-7,"Oaklawn canonical probability mismatch "+str(delta))
 print("PICK_OP_CANONICAL_PARITY_PASS",95,"max_pp",delta,flush=True)
else:
 print("PICK_OP_CANONICAL_PARITY_PENDING",op["projection_status"],flush=True)
# Compare Zia only if a matching scratch-final source exists.
zb,_=get(f"projections/dashboard/{D}/zia-park.json")
zf,_=get(f"projections/f4-ordered/{D}/zia-park.json")
zp=json.loads(zb);zm=json.loads(zf);zc=json.loads(snap[P+"zia-park.json"]["text"])
if zp["projection_status"]=="scratch_final":
 need(zm["scratch_state"]=="SCRATCH_FINAL" and zm["f4_receipt_sha256"]==zp["model_receipts"]["f4_sha256"],"Zia canonical receipt mismatch")
 fields={str(r["race_number"]):{str(e["program_number"]):e["win_probability_exact"] for e in r["entries"]} for r in zp["races"]}
 need(len(fields)==10 and sum(map(len,fields.values()))==79,"Zia canonical roster")
 delta=0
 for seq in zc["sequences"]:
  for leg in seq["race_fields"]:
   k=str(leg["race_number"]);a=seq["review_probabilities"][k]
   need(set(a)==set(fields[k])==set(leg["programs"]),"Zia canonical runner parity")
   delta=max(delta,max(abs(v-fields[k][j]) for j,v in a.items()))
 need(delta<1e-7,"Zia canonical probability mismatch "+str(delta))
 print("PICK_ZIA_CANONICAL_PARITY_PASS",79,"max_pp",delta,flush=True)
else:
 print("PICK_ZIA_CANONICAL_PARITY_PENDING",zp["projection_status"],flush=True)
Path("/tmp/rr-pick-1127-current-reader.json").write_text(json.dumps(snap))
subprocess.run(["node","scripts/verify_pick_reader_1127.mjs"],check=True)
p,_=get(f"pick-tickets/staging/{D}/prepared-0001.json")
if p:
 m=json.loads(p);need(m["date"]==D and m["sha256"]=="561bbbb058f15a0d674c59a24d565fcbb75bbf908ef08be165a158e34b55e3ed" and {t["track"]:t["sequence_count"] for t in m["tracks"]}==TRACKS,"Prepared receipt mismatch")
 print("PICK_1127_PREPARED_CATALOG_RECEIPT_PASS",len(m["tracks"]),flush=True)
else:print("PICK_1127_PREPARED_CATALOG_RECEIPT_ABSENT",flush=True)
for i in range(3):
 try:
  req=urllib.request.Request("https://railandryeracing.com/api/products?qa=pick1127-zia-r2-"+str(i),headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
  with urllib.request.urlopen(req,timeout=25) as res:d=json.load(res)
  products=d["products"];rows=products+[r for x in products for r in x.get("included_products",[])]
  names={r.get("track") for r in rows if r.get("category")=="Pick Tickets" and r.get("race_date")==D and r.get("track")}
  print("PICK_1127_PUBLIC_CATALOG",len(names),"missing",sorted(set(TRACKS)-names),"total_listings",len(products),flush=True)
  if names==set(TRACKS):
   print("PICK_1127_PUBLIC_CATALOG_PASS",15,"tracks",173,"tickets",flush=True);break
 except (TimeoutError,urllib.error.URLError,ValueError,KeyError) as e:print("PICK_1127_PUBLIC_CATALOG_UNVERIFIED",type(e).__name__,flush=True)
 if i<2:time.sleep(5)
else:raise RuntimeError("Customer objects and repository reader passed; public catalog remains unverified")

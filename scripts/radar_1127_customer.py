"""Owner-authorized current-day customer promotion of exact-field verified Radar edition."""
import os,json,hashlib,boto3,subprocess,urllib.request,urllib.error,time
from datetime import datetime,timezone
from botocore.exceptions import ClientError
D="2026-11-27";DUE=D+"T08:00:00Z";BUCKET="rail-and-rye-private-cards"
SRC="c4f7b36d1b72f03ee8bcff3b022cd4740d4dbf0f190e218bc89cf9bf18504e06"
P="intelligence/longshot-radar/staging/"+D+"/"
def need(ok,msg):
 if not ok:raise RuntimeError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
need(os.environ["GITHUB_REPOSITORY"]=="scottjazdzewski/rail-and-rye-website","Wrong repo")
need(datetime.fromisoformat(DUE.replace("Z","+00:00"))<=datetime.now(timezone.utc)<datetime.fromisoformat("2026-11-28T08:00:00+00:00"),"Outside authorized live date")
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(k):
 try:
  o=s.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o.get("Metadata",{})
 except ClientError as e:
  if e.response["Error"]["Code"] in ("404","NoSuchKey","NotFound"):return None,{}
  raise
raw,m=get(P+"revision-0001.json")
need(raw and m.get("sha256")==sha(raw) and m.get("release_at")==DUE and m.get("source_sha256")==SRC and m.get("stage_only")=="true","Final stage invalid")
ed=json.loads(raw);q,qm=get(P+"qa-0001.json")
need(q and sha(q)==ed["receipts"]["editorial_qa_sha256"]==qm.get("sha256") and ed["race_date"]==D and ed["revision"]==1 and ed["status"]=="prescratch" and len(ed["candidates"])==10,"Final evidence invalid")
proof=json.loads(q)
need(proof["tracks"]==15 and proof["races"]==134 and proof["runners"]==1115 and proof["qualifiers"]==27 and proof["selected"]==10 and len(proof["held_selections"])==2 and proof["exact_reviewed_field_hashes_pass"] is True,"Reconciliation receipt invalid")
mb,mm=get("projections/qa/"+D+"/staged-release.json");need(mb and sha(mb)==proof["projection_manifest_sha256"],"Projection manifest changed")
man=json.loads(mb);need(man["status"]=="VERIFIED_STAGED" and man["scope"]=="VERIFIED_COMPLETE_SLATE" and man["source_sha256"]==SRC and len(man["tracks"])==15,"Canonical manifest invalid")
cards={}
for t in man["tracks"]:
 k="projections/dashboard/"+D+"/"+t["slug"]+".json";cb,cm=get(k)
 need(cb and sha(cb)==t["dashboard_sha256"] and cm.get("source_sha256")==SRC and cm.get("customer_publish_approved")=="true","Canonical dashboard changed")
 cards[k]=cb.decode()
# Exercise real deployed module's candidate validator, exact whole-field source gate,
# customer writer and protected reader against the identical verified R2 bytes.
js="""import {validateLongshotEdition,verifyRadarAgainstStoredTri,publishGPTLongshotRadarTab,readLongshotRadarEdition} from './src/longshot-radar.js';import {webcrypto} from 'node:crypto';globalThis.crypto??=webcrypto;let s='';for await(const c of process.stdin)s+=c;const {raw,cards,date}=JSON.parse(s);const prefix='intelligence/longshot-radar/review/',dest='racing-intelligence/product-tabs/longshot-radar/'+date+'.json';const mem=new Map(Object.entries(cards).map(([k,v])=>[k,{text:async()=>v,json:async()=>JSON.parse(v),customMetadata:{}}]));mem.set(prefix+date+'.json',{text:async()=>raw,customMetadata:{review_only:'true'}});const env={CARDS_BUCKET:{get:async k=>mem.get(k)||null,list:async({prefix})=>({objects:[...mem.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false}),put:async(k,v,o)=>mem.set(k,{text:async()=>v,json:async()=>JSON.parse(v),customMetadata:o.customMetadata,raw:v})}};const ed=validateLongshotEdition(JSON.parse(raw));await verifyRadarAgainstStoredTri(ed,env);const p=await publishGPTLongshotRadarTab(env,date);const read=await readLongshotRadarEdition(env,date);if(p.candidates!==10||read?.candidates?.length!==10)throw Error('Reader mismatch');const out=mem.get(dest);process.stdout.write(JSON.stringify({raw:out.raw,meta:out.customMetadata}));"""
v=subprocess.run(["node","--input-type=module","-e",js],input=json.dumps({"raw":raw.decode(),"cards":cards,"date":D}).encode(),capture_output=True)
need(v.returncode==0,"Real website validator/reader rejected release")
a=json.loads(v.stdout);need(a["raw"].encode()==raw and a["meta"]["content_sha256"]==sha(raw),"Website serialization changed")
# This is the owner-authorized current edition only; refuse differing prior content.
def put(k,b,meta,approval):
 prior,pm=get(k)
 if prior:need(prior==b and pm.get(approval)=="true","Conflicting previously approved customer/review edition")
 else:s.put_object(Bucket=BUCKET,Key=k,Body=b,ContentType="application/json; charset=utf-8",CacheControl="private,no-store",Metadata=meta,IfNoneMatch="*")
 chk,cm=get(k);need(chk==b and cm.get(approval)=="true","Publication readback mismatch")
put("intelligence/longshot-radar/review/"+D+".json",raw,{"review_only":"true","revision":"1","source_sha256":SRC,"staged_release_at":DUE,"content_sha256":sha(raw)},"review_only")
put("racing-intelligence/product-tabs/longshot-radar/"+D+".json",raw,a["meta"],"customer_publish_approved")
print("RADAR_1127_CUSTOMER_R2_RELEASE_PASS candidates=10 held=2 sha="+sha(raw),flush=True)
for i in range(36):
 try:
  req=urllib.request.Request("https://railandryeracing.com/api/products?qa=radar1127-"+str(i),headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
  with urllib.request.urlopen(req,timeout=12) as response:products=json.load(response)["products"]
  rows=products+[x for p in products for x in p.get("included_products",[])]
  live=[x for x in rows if x.get("category")=="Longshot Radar" and x.get("race_date")==D and x.get("id")]
  if live:
   print("RADAR_1127_CUSTOMER_CATALOG_LIVE candidates=10 product_id="+str(live[0]["id"]),flush=True);break
 except (urllib.error.URLError,TimeoutError):pass
 if i<35:time.sleep(5)
else:raise RuntimeError("Customer object verified; public listing not confirmed")

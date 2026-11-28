"""Read-only release verification. No private data printed or modified."""
import json,os,hashlib,time,urllib.request,re,subprocess
import boto3
from botocore.exceptions import ClientError
D="2026-11-28"; B="rail-and-rye-private-cards"; S="5fa5be231f630ebeee4eb7c92ebd036aa600c0d85ba4b6e1f61aac2668f3116d"
P="pick-tickets/staging/"+D+"/"
def sha(x): return hashlib.sha256(x).hexdigest()
def need(v,m):
 if not v: raise RuntimeError(m)
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(k):
 try:
  o=s.get_object(Bucket=B,Key=k); return o["Body"].read(),o.get("Metadata",{})
 except ClientError as e:
  if e.response["Error"]["Code"] in ("NoSuchKey","404","NotFound"): return None,{}
  raise
stage,sm=get(P+"revision-0001.json")
need(stage and sha(stage)==S and sm.get("sha256")==S,"Verified stage mismatch")
batch=json.loads(stage); expected={r["card"]["track"]:len(r["card"]["sequences"]) for r in batch["tracks"]}
need(len(expected)==12 and sum(expected.values())==158,"Stage inventory")
js="""import fs from 'node:fs';import {validateStagedPickBatch} from './src/pick-tickets-staging.js';import {readPublishedPickTicketCards} from './src/pick-tickets.js';const d=JSON.parse(fs.readFileSync(0,'utf8'));const a=validateStagedPickBatch(JSON.parse(d.stage));let map=new Map(Object.entries(d.objects));let env={CARDS_BUCKET:{get:async k=>{const v=map.get(k);return v?{customMetadata:v.meta,text:async()=>v.body}:null},list:async({prefix})=>({objects:[...map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))})}};const actual=await readPublishedPickTicketCards(env,'2026-11-28');if(a.length!==12||actual.length!==12||actual.reduce((n,c)=>n+c.sequences.length,0)!==158)throw Error('Actual customer reader did not accept entire initial slate');for(const c of actual){const t=a.find(t=>t.track===c.track);if(!t||JSON.stringify(t.sequences)!==JSON.stringify(c.sequences))throw Error('Initial selections changed')}console.log('PICK_1128_ACTUAL_READER_PASS 12 tracks 158 sequences');"""
for i in range(60):
 marker,_=get(P+"prepared-0001.json")
 objects={P+"revision-0001.json":{"body":stage.decode(),"meta":sm}}
 seen=set(); total=0
 for name,n in expected.items():
  slug=re.sub("[^a-z0-9]+","-",name.lower()).strip("-")
  k="racing-intelligence/product-tabs/pick-tickets/"+D+"/"+slug+".json"
  raw,m=get(k)
  if raw:
   need(m.get("customer_publish_approved")=="true" and sha(raw)==m.get("content_sha256"),"Customer object checksum "+slug)
   c=json.loads(raw)
   if c["status"]!="initial_current": raise RuntimeError("Newer scratch revision detected; never overwrite")
   need(c["date"]==D and c["track"]==name and c["revision"]==1 and len(c["sequences"])==n and m.get("initial_stage_sha256")==S,"Initial stage binding "+slug)
   objects[k]={"body":raw.decode(),"meta":m};seen.add(name);total+=n
 live=set();version=None
 try:
  req=urllib.request.Request("https://railandryeracing.com/api/products?qa=pick-initial-1128-"+str(i),headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
  with urllib.request.urlopen(req,timeout=10) as r: data=json.load(r)
  version=data.get("pick_scratch_gate_version")
  rows=data["products"]+[x for p in data["products"] for x in p.get("included_products",[])]
  live={p.get("track") for p in rows if p.get("category")=="Pick Tickets" and p.get("race_date")==D and p.get("track")}
 except Exception as e: print("PUBLIC_PROBE_RETRY",type(e).__name__,flush=True)
 print("PICK_1128_RELEASE_STATUS",len(seen),total,"prepared",bool(marker),"live",len(live),"version",version,flush=True)
 if len(seen)==12 and marker and live==set(expected) and version=="2026-11-28-initial-then-scratch-v2":
  q=json.loads(marker);need(q["date"]==D and q["sha256"]==S and {t["track"]:t["sequence_count"] for t in q["tracks"]}==expected,"Prepared catalog receipt mismatch")
  run=subprocess.run(["node","--input-type=module","-e",js],input=json.dumps({"stage":stage.decode(),"objects":objects}),text=True,capture_output=True)
  need(run.returncode==0,"Actual customer reader rejected stage-bound initial")
  print(run.stdout.strip(),flush=True)
  print("PICK_1128_LIVE_INITIAL_RELEASE_PASS tracks=12 sequences=158 scratch_gate_retained=true",flush=True);break
 time.sleep(8)
else:raise RuntimeError("Live release has not yet returned complete receipt")

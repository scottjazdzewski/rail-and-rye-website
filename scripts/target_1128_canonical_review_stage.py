import base64,hashlib,json,os,re,math,subprocess,zlib
from pathlib import Path
from datetime import datetime,timezone
from nacl.public import SealedBox
from target_list_private_review_bridge import private_key
import boto3
from botocore.exceptions import ClientError
D="2026-11-28";DUE=D+"T08:00:00Z";B="rail-and-rye-private-cards"
SRC="d8d4fed7fe0c4dc7ed90687e8c5d11a5419c057c4717f5e064bb61a25e217780"
MAN="d719927d604a9f6eb9a9644b29121ed11fc02bb35ffba25f602c5939adfb4cd8"
P="intelligence/target-list/staging/"+D+"/"
TOTE=[(1,5),(2,5),(1,2),(3,5),(4,5),(1,1),(6,5),(7,5),(3,2),(8,5),(9,5),(2,1),(5,2),(3,1),(7,2),(4,1),(9,2),(5,1),(6,1),(7,1),(8,1),(9,1),(10,1),(12,1),(15,1),(20,1),(25,1),(30,1),(40,1),(50,1),(60,1),(80,1),(100,1)]
def need(x,m):
 if not x:raise ValueError(m)
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def norm(x):return re.sub(r"[^a-z0-9]+"," ",str(x).lower()).strip()
def ml(v):
 m=re.fullmatch(r"(\d+)\s*[-/]\s*(\d+)",str(v));need(m and int(m[2])>0,"ML");return int(m[1])/int(m[2])
def runner(x):
 p=x["win_probability_exact"];a,b=min(TOTE,key=lambda q:abs(q[0]/q[1]-(100/p-1)))
 return {**{k:x[k] for k in ("program_number","horse_name","trainer","jockey","morning_line")},"win_probability":math.floor(p*10+.5)/10,"fair_odds":f"{a}/{b}"}
def main():
 need(os.environ["GITHUB_REPOSITORY"]=="scottjazdzewski/rail-and-rye-website","Wrong repo")
 need(datetime.now(timezone.utc)<datetime.fromisoformat(DUE.replace("Z","+00:00")),"Cutoff elapsed")
 enc=Path("private-ingest/20261128/target.enc").read_bytes()
 need(sha(enc)=="44fee19f5818bb0ad1298209782ba720d272bfe74957780cf1c1f29a59a274fc","Cipher hash")
 raw=zlib.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)))
 need(sha(raw)=="02f1427b1d337c7baf8845026ea8f1b444ac864b5613a7614ffd5beada2440ce","Editorial packet hash")
 p=json.loads(raw)
 need(p["date"]==D and p["release_at"]==DUE and p["source_sha256"]==SRC and p["manifest_sha256"]==MAN and p["counts"][:5]==[12,113,1020,981,39],"Identity")
 s=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 def get(k):
  try:
   v=s.get_object(Bucket=B,Key=k);return v["Body"].read(),v.get("Metadata",{})
  except ClientError as e:
   if e.response.get("Error",{}).get("Code") in ("404","NoSuchKey","NotFound"):return None,{}
   raise
 def put(k,b,extra):
  m={"stage_only":"true","sha256":sha(b),"release_at":DUE,"source_sha256":SRC,"customer_publish_approved":"false",**extra}
  old,om=get(k);need(old is None or (old==b and om.get("sha256")==sha(b)),"Conflicting immutable review")
  if old is None:s.put_object(Bucket=B,Key=k,Body=b,ContentType="application/json",CacheControl="private,no-store",Metadata=m,IfNoneMatch="*")
  v,vm=get(k);need(v==b and vm.get("sha256")==sha(b),"Private readback")
 mb,mm=get("projections/qa/"+D+"/staged-release.json");need(mb and sha(mb)==MAN,"Canonical manifest changed")
 m=json.loads(mb);need(m["source_sha256"]==SRC and m["release_at"]==DUE and len(m["tracks"])==12,"Canonical manifest")
 fields={};numeric={};proof=[];nr=n=0
 for t in m["tracks"]:
  cb,cm=get("projections/dashboard/"+D+"/"+t["slug"]+".json");fb,fm=get("projections/f4-ordered/"+D+"/"+t["slug"]+".json")
  need(cb and fb and sha(cb)==t["dashboard_sha256"] and sha(fb)==t["ordered_sha256"],"Canonical field hash")
  need(cm.get("source_sha256")==SRC and cm.get("release_at")==DUE,"Canonical metadata")
  c=json.loads(cb);f=json.loads(fb)
  need(c["race_date"]==D and c["projection_status"]=="prescratch" and c["track_name"]==t["name"] and f["f4_receipt_sha256"]==c["model_receipts"]["f4_sha256"],"Canonical receipt identity")
  need(len(c["races"])==t["races"] and sum(len(r["entries"]) for r in c["races"])==t["runners"],"Track counts")
  proof.append({"track":t["name"],"races":t["races"],"active_runners":t["runners"],"model_receipts":c["model_receipts"],"dashboard_sha256":sha(cb),"f4_sha256":sha(fb)})
  for r in c["races"]:
   k=(norm(t["name"]),r["race_number"]);es=r["entries"];nr+=1;n+=len(es)
   need(k not in fields and len({x["program_number"] for x in es})==len(es) and abs(sum(x["win_probability_exact"] for x in es)-100)<1e-6,"Whole field")
   need(all(abs(x["win_probability_exact"]/100-x["f4_probabilities"]["exact_p1"])<1e-8 and x["jockey"] and x["trainer"] for x in es),"P1 or roles")
   fields[k]=r
   ordered=sorted(es,key=lambda x:ml(x["morning_line"]));fav=ordered[0];fp=fav["win_probability_exact"];fl=ml(fav["morning_line"])
   if ml(ordered[1]["morning_line"])==fl:continue
   choices=[x for x in es if x["win_probability_exact"]-fp>=10 and ml(x["morning_line"])>fl and ml(x["morning_line"])>100/x["win_probability_exact"]-1 and x["jockey"]!="Not assigned" and fav["jockey"]!="Not assigned"]
   if choices:numeric[k]=(fav,choices)
 need((nr,n)==(113,981),"Whole source totals")
 decisions={(norm(x["track"]),x["race_number"]):x for x in p["editorial_decisions"]}
 need(len(decisions)==len(p["editorial_decisions"]) and set(decisions)==set(numeric),"Numeric/editorial coverage")
 selected={(norm(x["track"]),x["race_number"]):x for x in p["targets"]}
 need(len(selected)==len(p["targets"]) and set(selected)<=(set(numeric)),"Selection coverage")
 out=[];full=[]
 for rank,t in enumerate(p["targets"],1):
  k=(norm(t["track"]),t["race_number"]);r=fields[k];fav,choices=numeric[k]
  a=next((x for x in choices if str(x["program_number"])==str(t["attack_program"])),None)
  need(a and str(fav["program_number"])==str(t["favorite_program"]) and t["rank"]==rank,"Selected pair")
  prose=t["analysis"];need(22<=len(prose.split())<=100 and fav["horse_name"].casefold() in prose.casefold() and a["horse_name"].casefold() in prose.casefold(),"Two-sided copy")
  out.append(dict(rank=rank,track=t["track"],race_number=t["race_number"],post_time_et="",surface=r.get("surface",""),distance=r.get("distance",""),conditions=r.get("conditions",""),analysis=prose,favorite=runner(fav),attack=runner(a),scratches=[]))
  full.append(dict(track=t["track"],race=t["race_number"],field_count=len(r["entries"]),runners=[{k:x[k] for k in ("program_number","horse_name","trainer","jockey","morning_line","win_probability_exact")} for x in r["entries"]]))
 need(len(out)==p["counts"][6] and len(numeric)==p["counts"][5],"Count mismatch")
 ed=dict(schema_version=1,product_type="target_list",race_date=D,revision=1,status="initial",publication_mode="owner-approved-gpt",source={"editorial_sha256":p["editorial_sha256"]},targets=out)
 js="""import {storeGPTReleasedTargetList,readTargetListEdition} from './src/target-list.js';import {webcrypto} from 'node:crypto';globalThis.crypto??=webcrypto;let s='';for await(const c of process.stdin)s+=c;const e=JSON.parse(s),m=new Map(),env={CARDS_BUCKET:{list:async()=>({objects:[],truncated:false}),get:async k=>m.get(k)||null,put:async(k,raw,opt)=>m.set(k,{customMetadata:opt.customMetadata,text:async()=>raw})}};let r=await storeGPTReleasedTargetList(env,e);if(r.targets!==e.targets.length||(await readTargetListEdition(env,e.race_date)).targets.length!==e.targets.length)throw Error('reader');"""
 q=subprocess.run(["node","--input-type=module","-e",js],input=compact(ed),capture_output=True)
 need(q.returncode==0,"Customer schema/reader failed")
 review=dict(race_date=D,release_at=DUE,source_zip_sha256=SRC,source_manifest_sha256=MAN,source_track_count=12,source_race_count=113,source_listed_runners=1020,source_active_runners=981,source_conditional_exclusions=39,editorial_sha256=p["editorial_sha256"],canonical_receipts=proof,selected_race_full_fields=full,targets=out,customer_edition=ed,editorial_decisions=p["editorial_decisions"],release_status="HOLD_RAW_V4_RECEIPT_PROVENANCE")
 body=compact(review);put(P+"canonical-review-0001.json",body,{"editorial_sha256":p["editorial_sha256"]})
 qa=compact(dict(status="PRIVATE_CANONICAL_REVIEW_READBACK_PASS",stage_sha256=sha(body),tracks=12,races=113,listed=1020,active=981,excluded=39,numeric=len(numeric),approved=len(out),release_at=DUE,queue_status="HOLD_RAW_V4_RECEIPT_PROVENANCE"))
 put(P+"canonical-review-qa-0001.json",qa,{})
 print("TARGET_1128_PRIVATE_CANONICAL_REVIEW_PASS tracks=12 races=113 active=981 numeric="+str(len(numeric))+" approved="+str(len(out))+" stage_sha256="+sha(body),flush=True)
 print("TARGET_1128_QUEUE_HOLD actual V4 role-matrix receipts unavailable; no fabricated proof or customer publication",flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("TARGET_1128_REVIEW_HOLD "+type(e).__name__+": "+str(e)[:150])

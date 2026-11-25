import base64,hashlib,json,os,re,zlib,subprocess
from pathlib import Path
from datetime import datetime,timezone
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
import boto3
P=Path("private-ingest/20261125-scratch04")
DATE="2026-11-25"
SCR={"mountaineer":{2:["5"],3:["5","6"],4:["1","7"],5:["2","4","11"],6:["3"],7:["1"],8:["5","6","11"]}}
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(o):return json.dumps(o,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def require(ok,msg):
 if not ok:raise ValueError(msg)
def read(s,key):
 o=s.get_object(Bucket=BUCKET,Key=key);return o["Body"].read(),o.get("Metadata",{})
def roster(r):return {str(e["program_number"]):e for e in r["entries"]}
def same(a,b,tol=1e-8):return abs(float(a)-float(b))<=tol
def compare_model(a,b):
 ap=list(map(str,a["programs"]));bp=list(map(str,b["programs"]))
 if set(ap)!=set(bp):return False
 for col in ("pwin","p2_weights","p3_weights"):
  x=dict(zip(ap,a[col]));y=dict(zip(bp,b[col]));k=bp[0]
  if col!="pwin":
   if x[k]<=0 or y[k]<=0:return False
   if not all(same(x[p]/x[k],y[p]/y[k],1e-7) for p in bp):return False
  elif not all(same(x[p],y[p],1e-10) for p in bp):return False
 return True
def tote(v):
 odds=[(1,20),(1,10),(1,5),(2,5),(1,2),(3,5),(4,5),(9,10),(1,1),(6,5),(7,5),(8,5),(9,5),(2,1),(5,2),(3,1),(7,2),(4,1),(9,2),(5,1),(6,1),(7,1),(8,1),(9,1),(10,1),(12,1),(15,1),(20,1),(25,1),(30,1),(40,1),(50,1),(60,1),(80,1),(99,1)]
 a,b=min(odds,key=lambda p:abs(p[0]/p[1]-v));return f"{a}-{b}"
def main():
 require(os.environ["GITHUB_REPOSITORY"]==REPO,"Wrong repo")
 m=json.loads((P/"manifest.json").read_text());require(m["date"]==DATE and {t[0] for t in m["tracks"]}==set(SCR) and len(m["tracks"])==1,"Wrong slate")
 s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
 pending=[];receipt=[]
 for slug,name,before,runners,ns,rawhash,cipherhash in m["tracks"]:
  enc=(P/(slug+".enc")).read_bytes();require(sha(enc)==cipherhash,"Cipher hash")
  z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),400001)
  require(z.eof and not z.unused_data and len(raw)<=400000 and sha(raw)==rawhash,"Payload hash")
  d=json.loads(raw);line=d["lineage"]
  require(d["date"]==DATE and d["track"]==name and all(re.fullmatch("[0-9a-f]{64}",v) for v in list(line.values())+[d["parent_replay_tri_sha256"],d["source_sha256"],d["badge_sha256"],d["prefix_sha256"],d["source_pdf_sha256"]]),"Payload identity")
  ck=f"projections/dashboard/{DATE}/{slug}.json";fk=f"projections/f4-ordered/{DATE}/{slug}.json"
  ob,om=read(s,ck);ofb,ofm=read(s,fk);old=json.loads(ob);oldf=json.loads(ofb)
  require(old["race_date"]==DATE and old["track_name"]==name and oldf["date"]==DATE and oldf["track_name"]==name,"Stored identity")
  if old["projection_status"]=="scratch_final":
   require(old.get("scratch_release_sha256")==rawhash and oldf.get("scratch_release_sha256")==rawhash,"Different live scratch edition: "+name)
   receipt.append({"track":name,"dashboard_sha256":sha(ob),"ordered_sha256":sha(ofb),"runners":runners,"scratches":ns});continue
  require(old["projection_status"]=="prescratch" and oldf["scratch_state"]=="PRESCRATCH" and oldf["f4_receipt_sha256"]==old["model_receipts"]["f4_sha256"] and oldf["source_sha256"]==d["source_sha256"],"Stored parent identity")
  a={r["race_number"]:r for r in old["races"]};b={r["race_number"]:r for r in d["races"]};pre={r["race_number"]:r for r in d["parent_races"]};pm={r["race_number"]:r for r in d["parent_model"]};omodel={r["race_number"]:r for r in oldf["races"]}
  require(set(a)==set(b)==set(pre)==set(pm)==set(omodel)==set(range(1,9)) and sum(len(r["entries"]) for r in a.values())==before and sum(len(r["entries"]) for r in b.values())==runners and sum(len(r["scratches"]) for r in b.values())==ns,"Roster coverage")
  merged={**old,"projection_status":"scratch_final","factor_basis":"verified_scratch_final","model_receipts":line,"scratch_source_sha256":d["snapshot_sha256"],"official_snapshot_utc":d["asof"],"scratch_release_sha256":rawhash,"parent_replay_proof":{"stored_parent_receipts":old["model_receipts"],"replay_tri_sha256":d["parent_replay_tri_sha256"],"replay_f4_sha256":line["prescratch_parent_sha256"]},"non_scratch_changes":[]}
  merged["races"]=[]
  for n in sorted(a):
   ar=roster(a[n]);br=roster(b[n]);prior={e["program"]:e for e in pre[n]["entries"]};remove=set(SCR[slug].get(n,[]))
   require(set(ar)==set(prior) and all(e["horse_name"]==prior[p]["horse"] and same(e["win_probability_exact"],100*prior[p]["pwin"]) for p,e in ar.items()),"Original live TRI replay mismatch "+name+f" R{n}")
   require(compare_model(omodel[n],pm[n]) and all(all(same(e["f4_probabilities"][k],v) for k,v in prior[p]["f4"].items()) for p,e in ar.items()),"Original live F4 replay mismatch "+name+f" R{n}")
   require(set(br)==set(ar)-remove and {str(e["program_number"]) for e in b[n]["scratches"]}==remove and b[n]["scratch_count"]==len(remove),"Scratch mismatch")
   require(all(e["horse_name"]==ar[p]["horse_name"] and e["trainer"]==ar[p]["trainer"] and e["jockey"]==ar[p]["jockey"] for p,e in br.items()),"Identity or role changed")
   require(all(e["horse_name"]==ar[str(e["program_number"])]["horse_name"] for e in b[n]["scratches"]),"Scratched identity")
   require(abs(sum(e["win_probability_exact"] for e in br.values())-100)<1e-6,"PWIN mass")
   require([e["rank"] for e in b[n]["entries"]]==list(range(1,len(br)+1)) and b[n]["entries"][0]["win_probability_exact"]==max(e["win_probability_exact"] for e in br.values()),"Order")
   for e in br.values():
    require(len(e["metrics"])==5 and {x["label"] for x in e["metrics"]}=={"Speed","Form","Class","Pace Fit","Surface / Distance"} and all(x["value"] in ("green","gray","red") for x in e["metrics"]),"Factor ratings")
    require(abs(sum(e["f4_probabilities"][k] for k in ("exact_p1","exact_p2","exact_p3","exact_p4","exact_p5","p6_plus"))-1)<1e-8,"F4 mass")
   if not remove:require(all(same(ar[p]["win_probability_exact"],e["win_probability_exact"]) for p,e in br.items()),"Unexpected change")
   rr={**a[n],**b[n]};rr["entries"]=[{**ar[str(e["program_number"])],**e,"fair_odds":tote(e["fair_odds_net_to_1_exact"])} for e in b[n]["entries"]];merged["races"].append(rr)
  f={**oldf,"scratch_state":"SCRATCH_FINAL","f4_receipt_sha256":line["f4_sha256"],"prefix_file_sha256":d["prefix_sha256"],"badge_sha256":d["badge_sha256"],"dashboard_receipts":line,"races":d["models"],"scratch_release_sha256":rawhash}
  js="import {verifyCertifiedScratchFinalTrack} from './src/f4-exotics.js';import {requireProductionPurses,requireProductionStakesNames} from './src/projection-race-information.js';let s='';for await(const c of process.stdin)s+=c;const {card,model}=JSON.parse(s);requireProductionPurses(card);requireProductionStakesNames(card);if(!verifyCertifiedScratchFinalTrack(card,model))process.exit(1);"
  require(subprocess.run(["node","--input-type=module","-e",js],input=compact({"card":merged,"model":f}),capture_output=True).returncode==0,"Website F4 or metadata gate "+name)
  cb,fb=compact(merged),compact(f);meta={"uploaded_at":datetime.now(timezone.utc).isoformat(),"stage":"SCRATCH_FINAL","source_sha256":d["source_sha256"],"badge_sha256":d["badge_sha256"],"f4_receipt_sha256":line["f4_sha256"],"release_sha256":rawhash}
  pending.extend([(fk,ofb,fb,{**ofm,**meta}),(ck,ob,cb,{**om,**meta})]);receipt.append({"track":name,"dashboard_sha256":sha(cb),"ordered_sha256":sha(fb),"runners":runners,"scratches":ns})
  print("SCRATCH_PREFLIGHT_PASS",name,runners,ns,flush=True)
 for key,old,raw,meta in pending:require(read(s,key)[0]==old,"Concurrent change "+key)
 for key,old,raw,meta in pending:
  s.put_object(Bucket=BUCKET,Key=key,Body=raw,ContentType="application/json",CacheControl="private,no-store",Metadata=meta)
  require(read(s,key)[0]==raw,"Readback mismatch "+key);print("SCRATCH_READBACK_PASS",key,flush=True)
 for t in m["tracks"]:
  slug,name=t[:2];rr=next(x for x in receipt if x["track"]==name)
  require(sha(read(s,f"projections/dashboard/{DATE}/{slug}.json")[0])==rr["dashboard_sha256"] and sha(read(s,f"projections/f4-ordered/{DATE}/{slug}.json")[0])==rr["ordered_sha256"],"Final readback")
 body=compact({"date":DATE,"status":"VERIFIED_SCRATCH_FINAL","batch":"scratch04","tracks":receipt,"runners":53,"scratches":13});key=f"projections/qa/{DATE}/scratch04-release.json"
 s.put_object(Bucket=BUCKET,Key=key,Body=body,ContentType="application/json",CacheControl="private,no-store");require(read(s,key)[0]==body,"Receipt")
 print("RR_1125_SCRATCH04_PUBLISH_PASS tracks=1 races=8 active=53 scratches=13",flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("RR_1125_SCRATCH04_HOLD "+type(e).__name__+": "+str(e)[:240])

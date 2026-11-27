"""Publish only encrypted, privately scored and certified November 26 racecard changes."""
import base64,hashlib,json,os,re,zlib,subprocess,math
from pathlib import Path
from datetime import datetime,timezone
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
import boto3
P=Path("private-ingest/20261127-scratch07-tam")
DATE="2026-11-27"
SOURCE="c4f7b36d1b72f03ee8bcff3b022cd4740d4dbf0f190e218bc89cf9bf18504e06"
SCR={"tampa-bay-downs":{4:["3"],5:["6"],6:["5","7","9"],8:["2","5","8","10"]}}
AE={"tampa-bay-downs":{4:{"3":"Ditched"},5:{"6":"Zeus's Echo"},6:{"7":"Alrasikh"},8:{"2":"Big Louie","5":"Roscoe Pine","10":"Jetaros"}}}
DRAW={"tampa-bay-downs":{}}
CHANGE={"tampa-bay-downs":{1:{"gelding_notice_programs":["4"]},4:{"surface":"Dirt"},6:{"surface":"Dirt"},8:{"surface":"Dirt"}}}
COND={"tampa-bay-downs":"Fast"}
PDF={"tampa-bay-downs":"f56bd00e957889db30f65e71f1fca4bba393f675e0ef46e37b88d223cb1fdf22"}
PRIOR="e05745316f99d6407b1e8df1f3ef6ca4d56283a144b759943710370c1ffa87a2"
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
   if min(x.values())<=0 or min(y.values())<=0:return False
   if col=="p3_weights" and len(bp)==3:continue
   if not all(same(x[p]/x[k],y[p]/y[k],1e-7) for p in bp):return False
  elif not all(same(x[p],y[p],1e-10) for p in bp):return False
 return True
def compare_probs(a,b):
 return all(k in b and same(v,b[k]) for k,v in a.items() if k in ("exact_p1","exact_p2","exact_p3","exact_p4","exact_p5","p6_plus","top2","top3","top4","top5"))
def preflight(s,t,m):
 slug,name,nr,before,runners,ns,rawhash,cipherhash=t
 enc=(P/(slug+".enc")).read_bytes();require(sha(enc)==cipherhash,"Cipher hash")
 z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),400001)
 require(z.eof and not z.unused_data and len(raw)<=400000 and sha(raw)==rawhash,"Payload hash")
 d=json.loads(raw);line=d["lineage"]
 require(d["date"]==DATE and d["track"]==name and d["source_sha256"]==SOURCE and all(re.fullmatch("[0-9a-f]{64}",v) for v in list(line.values())+[d["parent_replay_tri_sha256"],d["source_sha256"],d["badge_sha256"],d["prefix_sha256"],d["source_pdf_sha256"]]),"Payload identity")
 require(sha(compact(d["snapshot"]))==d["snapshot_sha256"]==line["official_changes_sha256"],"Official snapshot hash")
 require(d["source_pdf_sha256"]==PDF[slug] and re.fullmatch("[0-9a-f]{64}",d["snapshot"]["screenshot_sha256"]),"Original source and screenshot lineage")
 ck=f"projections/dashboard/{DATE}/{slug}.json";fk=f"projections/f4-ordered/{DATE}/{slug}.json"
 ob,om=read(s,ck);ofb,ofm=read(s,fk);old=json.loads(ob);oldf=json.loads(ofb)
 require(old["race_date"]==DATE and old["track_name"]==name and oldf["date"]==DATE and oldf["track_name"]==name,"Stored identity")
 if old["projection_status"]=="scratch_final" and old.get("scratch_release_sha256")==rawhash:
  require(old.get("scratch_release_sha256")==rawhash and oldf.get("scratch_release_sha256")==rawhash,"Different live scratch edition: "+name)
  return [],{"track":name,"dashboard_sha256":sha(ob),"ordered_sha256":sha(ofb),"runners":runners,"scratches":ns}
 require(old["projection_status"]=="scratch_final" and oldf["scratch_state"]=="SCRATCH_FINAL" and old.get("scratch_release_sha256")==PRIOR and oldf.get("scratch_release_sha256")==PRIOR and oldf["f4_receipt_sha256"]==old["model_receipts"]["f4_sha256"] and oldf["source_sha256"]==SOURCE,"Stored parent identity")
 a={r["race_number"]:r for r in old["races"]};require({(n,str(e["program_number"]),e["horse_name"]) for n,r in a.items() for e in r["scratches"]}=={(n,p,h) for n,rows in AE[slug].items() for p,h in rows.items()},"Prior scratches mismatch");b={r["race_number"]:r for r in d["races"]};pre={r["race_number"]:r for r in d["parent_races"]};pm={r["race_number"]:r for r in d["parent_model"]};omodel={r["race_number"]:r for r in oldf["races"]};fm={r["race_number"]:r for r in d["models"]}
 require(set(a)==set(b)==set(pre)==set(pm)==set(omodel)==set(fm)==set(range(1,nr+1)) and sum(len(r["entries"]) for r in a.values())==before and sum(len(r["entries"]) for r in b.values())==runners and sum(len(r["scratches"]) for r in b.values())==ns,"Roster coverage")
 merged={**old,"projection_status":"scratch_final","factor_basis":"verified_scratch_final","model_receipts":line,"scratch_source_sha256":d["snapshot_sha256"],"official_snapshot_utc":d["asof"],"scratch_release_sha256":rawhash,"parent_replay_proof":{"stored_parent_receipts":old["model_receipts"],"replay_tri_sha256":d["parent_replay_tri_sha256"],"replay_f4_sha256":line["prescratch_parent_sha256"]},"non_scratch_changes":d["snapshot"]["non_scratch_changes"],"official_drawins":d["snapshot"]["confirmed_drawins"],"track_conditions":d["snapshot"]["track_conditions"]}
 merged["races"]=[];final_models=[]
 for n in sorted(a):
  ar=roster(a[n]);br=roster(b[n]);prior={e["program"]:e for e in pre[n]["entries"]};remove=set(SCR[slug].get(n,[]));extra=AE[slug].get(n,{});draw=DRAW[slug].get(n,{})
  require(set(ar)==set(prior),"Original live roster replay mismatch "+name+f" R{n}: stored {sorted(ar)} replay {sorted(prior)}")
  require(all(e["horse_name"]==prior[p]["horse"] and same(e["win_probability_exact"],100*prior[p]["pwin"]) for p,e in ar.items()),"Original live TRI replay mismatch "+name+f" R{n}")
  require(compare_model(omodel[n],pm[n]) and all(compare_probs(e["f4_probabilities"],prior[p]["f4"]) for p,e in ar.items()),"Original live F4 replay mismatch "+name+f" R{n}")
  require(set(extra).issubset(remove) and not (set(extra)&set(ar)) and not (set(draw)&set(ar)) and set(br)==(set(ar)-remove)|set(draw) and {str(e["program_number"]) for e in b[n]["scratches"]}==remove and b[n]["scratch_count"]==len(remove),"Scratch/draw-in mismatch "+name+f" R{n}")
  require(all(e["horse_name"]==ar[p]["horse_name"] and e["trainer"]==ar[p]["trainer"] and e["jockey"]==ar[p]["jockey"] for p,e in br.items() if p in ar),"Identity or role changed "+name+f" R{n}")
  require(all(br[p]["horse_name"]==h and br[p].get("morning_line") and br[p]["trainer"] and br[p]["jockey"] for p,h in draw.items()),"Draw-in identity")
  require(all(e["horse_name"]==(extra[str(e["program_number"])] if str(e["program_number"]) in extra else ar[str(e["program_number"])]["horse_name"]) for e in b[n]["scratches"]),"Scratched identity")
  require(abs(sum(e["win_probability_exact"] for e in br.values())-100)<1e-6,"PWIN mass")
  require([e["rank"] for e in b[n]["entries"]]==list(range(1,len(br)+1)) and b[n]["entries"][0]["win_probability_exact"]==max(e["win_probability_exact"] for e in br.values()),"Order")
  for e in br.values():
   require(e["trainer"] and e["jockey"] and len(e["metrics"])==5 and {x["label"] for x in e["metrics"]}=={"Speed","Form","Class","Pace Fit","Surface / Distance"} and all(x["value"] in ("green","gray","red") for x in e["metrics"]),"Factor ratings")
   require(abs(sum(e["f4_probabilities"][k] for k in ("exact_p1","exact_p2","exact_p3","exact_p4","exact_p5","p6_plus"))-1)<1e-8,"F4 mass")
   require(same(e["fair_odds_net_to_1_exact"],100/e["win_probability_exact"]-1),"Fair odds")
  for k,v in CHANGE[slug].get(n,{}).items():require(b[n].get(k)==v,"Non-scratch change mismatch")
  require(b[n].get("track_condition")==COND[slug],"Condition metadata")
  require(all(e.get("reason")==("Stewards" if n==5 else "Off-Turf") for e in b[n]["scratches"]),"Scratch reason")
  for p,w in CHANGE[slug].get(n,{}).get("weight_changes",{}).items():require(br[p].get("weight_carried_lbs")==w,"Weight correction")
  changed=bool(remove or draw)
  if not changed:
   require(all(same(ar[p]["win_probability_exact"],e["win_probability_exact"]) and compare_probs(ar[p]["f4_probabilities"],e["f4_probabilities"]) for p,e in br.items()) and compare_model(omodel[n],fm[n]),"Unexpected score change "+name+f" R{n}")
   rr={**a[n],**CHANGE[slug].get(n,{}),"track_condition":b[n]["track_condition"],"scratch_count":0,"scratches":[]};final_models.append(omodel[n])
   weights=CHANGE[slug].get(n,{}).get("weight_changes",{})
   if weights:rr["entries"]=[{**e,**({"weight_carried_lbs":weights[str(e["program_number"])]} if str(e["program_number"]) in weights else {})} for e in a[n]["entries"]]
  else:
   rr={**a[n],**b[n]};rr["entries"]=[{**ar.get(str(e["program_number"]),{}),**e} for e in b[n]["entries"]];final_models.append(fm[n])
  merged["races"].append(rr)
 f={**oldf,"scratch_state":"SCRATCH_FINAL","f4_receipt_sha256":line["f4_sha256"],"prefix_file_sha256":d["prefix_sha256"],"badge_sha256":d["badge_sha256"],"dashboard_receipts":line,"races":final_models,"scratch_release_sha256":rawhash}
 js="import {verifyCertifiedScratchFinalTrack} from './src/f4-exotics.js';import {requireProductionPurses,requireProductionStakesNames} from './src/projection-race-information.js';let s='';for await(const c of process.stdin)s+=c;const {card,model}=JSON.parse(s);requireProductionPurses(card);requireProductionStakesNames(card);if(!verifyCertifiedScratchFinalTrack(card,model))process.exit(1);"
 require(subprocess.run(["node","--input-type=module","-e",js],input=compact({"card":merged,"model":f}),capture_output=True).returncode==0,"Website F4 or metadata gate "+name)
 cb,fb=compact(merged),compact(f);meta={"uploaded_at":datetime.now(timezone.utc).isoformat(),"stage":"SCRATCH_FINAL","source_sha256":SOURCE,"badge_sha256":d["badge_sha256"],"f4_receipt_sha256":line["f4_sha256"],"release_sha256":rawhash}
 print("SCRATCH_PREFLIGHT_PASS",name,runners,ns,flush=True)
 return [(fk,ofb,fb,{**ofm,**meta}),(ck,ob,cb,{**om,**meta})],{"track":name,"dashboard_sha256":sha(cb),"ordered_sha256":sha(fb),"runners":runners,"scratches":ns}
def main():
 require(os.environ["GITHUB_REPOSITORY"]==REPO,"Wrong repo")
 m=json.loads((P/"manifest.json").read_text());require(m["date"]==DATE and {t[0] for t in m["tracks"]}==set(SCR) and len(m["tracks"])==1,"Wrong slate")
 require(base64.b64encode(bytes(private_key().public_key)).decode()==m["public_key"],"Current public key mismatch")
 s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
 ready=[];holds=[]
 for t in m["tracks"]:
  try:ready.append((t,*preflight(s,t,m)))
  except Exception as e:
   msg=type(e).__name__+": "+str(e)[:260];holds.append({"track":t[1],"reason":msg});print("SCRATCH_PREFLIGHT_HOLD",t[1],msg,flush=True)
 receipt=[]
 for t,pending,rr in ready:
  for key,old,raw,meta in pending:require(read(s,key)[0]==old,"Concurrent change "+key)
  for key,old,raw,meta in pending:
   s.put_object(Bucket=BUCKET,Key=key,Body=raw,ContentType="application/json",CacheControl="private,no-store",Metadata=meta)
   require(read(s,key)[0]==raw,"Readback mismatch "+key);print("SCRATCH_READBACK_PASS",key,flush=True)
  slug=t[0]
  require(sha(read(s,f"projections/dashboard/{DATE}/{slug}.json")[0])==rr["dashboard_sha256"] and sha(read(s,f"projections/f4-ordered/{DATE}/{slug}.json")[0])==rr["ordered_sha256"],"Final readback")
  receipt.append(rr)
 if receipt:
  body=compact({"date":DATE,"status":"VERIFIED_SCRATCH_FINAL" if not holds else "PARTIAL_VERIFIED_SCRATCH_FINAL","batch":"scratch07-tam","tracks":receipt,"holds":holds,"runners":sum(r["runners"] for r in receipt),"scratches":sum(r["scratches"] for r in receipt)})
  key=f"projections/qa/{DATE}/scratch07-tam-release.json";s.put_object(Bucket=BUCKET,Key=key,Body=body,ContentType="application/json",CacheControl="private,no-store");require(read(s,key)[0]==body,"Receipt")
  print("RR_1127_SCRATCH07_TAM_PUBLISH_READBACK",len(receipt),"tracks",sum(r["runners"] for r in receipt),"runners",sum(r["scratches"] for r in receipt),"scratches",flush=True)
 if holds:raise ValueError("One or more track preflight holds; no held track written")
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("RR_1127_SCRATCH07_TAM_HOLD "+type(e).__name__+": "+str(e)[:240])

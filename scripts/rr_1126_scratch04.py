"""November 26 cumulative scratch revision 04. Encrypted certified outputs only."""
import base64,hashlib,json,os,re,zlib,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
import boto3
DATE="2026-11-26"
SOURCE="20a001e4bbf88afb2701d6408e2cbfae63abb508cf18661d484e74d7f8ab0fc7"
NEW={"gulfstream-park":{4:{"1":"Garuda","3":"Fire On the Wire"}},"churchill-downs":{10:{"7":"Waymark"}}}
RIDERS={"gulfstream-park":{},"churchill-downs":{6:{"10":"Y. Correa"},8:{"6":"F. Prat","8":"D. Cannon"},9:{"6":"L. Saez"},11:{"7":"W. Rodriguez","8":"L. Saez"}}}
RESTRICT={"gulfstream-park":{},"churchill-downs":{1:["Odd or Even","Super High Five"],4:["Super High Five"],5:["Odd or Even"],12:["Show","Trifecta","Superfecta","Odd or Even"]}}
CONDITION={"gulfstream-park":{"dirt":"Fast","turf":"Off Turf","synthetic":"Fast"},"churchill-downs":{"dirt":"Sloppy","turf":"Good"}}
CHANGED={"gulfstream-park":{4},"churchill-downs":set(range(4,13))}
PRIOR={"gulfstream-park":"5f430bd531a9ccd4c593668d6ea81ae108c87998646f56850c58f67c75482d16","churchill-downs":"9460d775f322713eed99843ddc27b3850f4439e66df4dee72d4c846348585128"}
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

def main():
 require(os.environ["GITHUB_REPOSITORY"]==REPO,"Wrong repo")
 slug=sys.argv[1];require(slug in NEW,"Wrong track")
 P=Path("private-ingest/20261126-scratch04")/slug
 m=json.loads((P/"manifest.json").read_text());require(m["date"]==DATE and len(m["tracks"])==1,"Wrong slate")
 t=m["tracks"][0];sl,name,nr,before,runners,ns,rawhash,cipherhash=t
 require(sl==slug and base64.b64encode(bytes(private_key().public_key)).decode()==m["public_key"],"Identity/key")
 enc=(P/(slug+".enc")).read_bytes();require(sha(enc)==cipherhash,"Cipher hash")
 z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),400001)
 require(z.eof and not z.unused_data and len(raw)<=400000 and sha(raw)==rawhash,"Payload hash")
 d=json.loads(raw);line=d["lineage"];snap=d["snapshot"]
 require(d["date"]==DATE and d["track"]==name and d["source_sha256"]==SOURCE and d["prior_release_sha256"]==PRIOR[slug] and all(re.fullmatch("[0-9a-f]{64}",v) for v in list(line.values())+[d["parent_replay_tri_sha256"],d["prior_replay_f4_sha256"],d["source_sha256"],d["badge_sha256"],d["prefix_sha256"],d["source_pdf_sha256"],d["effective_pdf_sha256"],d["replacement_receipt_sha256"],snap["screenshot_sha256"]]),"Payload identity")
 require(sha(compact(snap))==d["snapshot_sha256"]==line["official_changes_sha256"],"Official snapshot hash")
 require(snap["track_conditions"]==CONDITION[slug] and {int(k):v for k,v in snap["official_wager_restrictions"].items()}==RESTRICT[slug] and set(d["changed_races"])==CHANGED[slug],"Condition / wager / change scope")
 require((d["source_pdf_sha256"]!=d["effective_pdf_sha256"])==bool(RIDERS[slug]),"Effective PDF scope")
 s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
 ck=f"projections/dashboard/{DATE}/{slug}.json";fk=f"projections/f4-ordered/{DATE}/{slug}.json"
 ob,om=read(s,ck);ofb,ofm=read(s,fk);old=json.loads(ob);oldf=json.loads(ofb)
 require(old["race_date"]==DATE and old["track_name"]==name and oldf["date"]==DATE and oldf["track_name"]==name and old["projection_status"]=="scratch_final" and oldf["scratch_state"]=="SCRATCH_FINAL" and oldf["source_sha256"]==SOURCE and oldf["dashboard_receipts"]==old["model_receipts"] and oldf["f4_receipt_sha256"]==old["model_receipts"]["f4_sha256"],"Stored identity/lineage")
 if old.get("scratch_release_sha256")==rawhash:
  require(oldf.get("scratch_release_sha256")==rawhash,"Partial revision")
  print("SCRATCH04_ALREADY_LIVE",name,flush=True);return
 require(old.get("scratch_release_sha256")==oldf.get("scratch_release_sha256")==PRIOR[slug],"Unexpected current edition; refuse overwrite")
 a={r["race_number"]:r for r in old["races"]};b={r["race_number"]:r for r in d["races"]};pre={r["race_number"]:r for r in d["parent_races"]};pm={r["race_number"]:r for r in d["parent_model"]};omodel={r["race_number"]:r for r in oldf["races"]};fm={r["race_number"]:r for r in d["models"]}
 require(set(a)==set(b)==set(pre)==set(pm)==set(omodel)==set(fm)==set(range(1,nr+1)) and sum(len(r["entries"]) for r in a.values())==before and sum(len(r["entries"]) for r in b.values())==runners and sum(len(r["scratches"]) for r in b.values())==ns,"Roster coverage")
 merged={**old,"model_receipts":line,"scratch_source_sha256":d["snapshot_sha256"],"official_snapshot_utc":d["asof"],"scratch_release_sha256":rawhash,"prior_scratch_release_sha256":PRIOR[slug],"prior_scratch_receipts":old["model_receipts"],"prior_replay_proof":{"tri_sha256":d["parent_replay_tri_sha256"],"f4_sha256":d["prior_replay_f4_sha256"],"prescratch_parent_sha256":line["prescratch_parent_sha256"]},"track_conditions":snap["track_conditions"],"official_change_snapshot":snap,"effective_pdf_sha256":d["effective_pdf_sha256"],"replacement_receipt_sha256":d["replacement_receipt_sha256"]}
 merged["races"]=[];models=[]
 for n in sorted(a):
  ar=roster(a[n]);br=roster(b[n]);prior={e["program"]:e for e in pre[n]["entries"]};new=NEW[slug].get(n,{});riders=RIDERS[slug].get(n,{})
  require(set(ar)==set(prior) and all(e["horse_name"]==prior[p]["horse"] and same(e["win_probability_exact"],100*prior[p]["pwin"]) for p,e in ar.items()),"Prior live TRI replay mismatch "+name+f" R{n}")
  require(compare_model(omodel[n],pm[n]) and all(compare_probs(e["f4_probabilities"],prior[p]["f4"]) for p,e in ar.items()),"Prior live F4 replay mismatch "+name+f" R{n}")
  oldscr={str(e["program_number"]):e["horse_name"] for e in a[n]["scratches"]};newscr={str(e["program_number"]):e["horse_name"] for e in b[n]["scratches"]}
  require(set(br)==set(ar)-set(new) and all(ar[p]["horse_name"]==h for p,h in new.items()) and newscr=={**oldscr,**new} and len(newscr)==b[n]["scratch_count"]==len(b[n]["scratches"]),"Cumulative scratch mismatch "+name+f" R{n}")
  require(all(e["horse_name"]==ar[p]["horse_name"] and e["trainer"]==ar[p]["trainer"] and e["jockey"]==riders.get(p,ar[p]["jockey"]) for p,e in br.items()),"Identity or replacement role mismatch "+name+f" R{n}")
  require(all(p in br and ar[p]["jockey"]!=v and br[p]["jockey"]==v for p,v in riders.items()),"Replacement rider identity")
  require(b[n].get("jockey_changes",{})==riders and b[n].get("official_wager_restrictions",[])==RESTRICT[slug].get(n,[]),"Change metadata")
  if slug=="churchill-downs" and n>=4:require(b[n].get("track_condition")==("Good" if n==9 else "Sloppy"),"Condition mismatch")
  if slug=="gulfstream-park":require(b[n].get("track_condition")=="Fast","Condition mismatch")
  require(abs(sum(e["win_probability_exact"] for e in br.values())-100)<1e-6 and [e["rank"] for e in b[n]["entries"]]==list(range(1,len(br)+1)) and b[n]["entries"][0]["win_probability_exact"]==max(e["win_probability_exact"] for e in br.values()),"PWIN mass or order")
  for e in br.values():
   require(e["trainer"] and e["jockey"] and len(e["metrics"])==5 and {x["label"] for x in e["metrics"]}=={"Speed","Form","Class","Pace Fit","Surface / Distance"} and all(x["value"] in ("green","gray","red") for x in e["metrics"]),"Factor ratings")
   require(abs(sum(e["f4_probabilities"][k] for k in ("exact_p1","exact_p2","exact_p3","exact_p4","exact_p5","p6_plus"))-1)<1e-8 and same(e["fair_odds_net_to_1_exact"],100/e["win_probability_exact"]-1),"F4 mass / fair odds")
  if n not in CHANGED[slug]:
   require(all(same(ar[p]["win_probability_exact"],e["win_probability_exact"]) and compare_probs(ar[p]["f4_probabilities"],e["f4_probabilities"]) for p,e in br.items()) and compare_model(omodel[n],fm[n]),"Unexpected score change "+name+f" R{n}")
   rr={**a[n],**{k:v for k,v in b[n].items() if k in ("scratch_count","scratches","track_condition","official_wager_restrictions")}};models.append(omodel[n])
  else:
   rr={**a[n],**b[n]};rr["entries"]=[{**ar[str(e["program_number"])],**e} for e in b[n]["entries"]];models.append(fm[n])
  merged["races"].append(rr)
 f={**oldf,"f4_receipt_sha256":line["f4_sha256"],"prefix_file_sha256":d["prefix_sha256"],"badge_sha256":d["badge_sha256"],"dashboard_receipts":line,"races":models,"scratch_release_sha256":rawhash,"prior_scratch_release_sha256":PRIOR[slug]}
 js="import {verifyCertifiedScratchFinalTrack} from './src/f4-exotics.js';import {requireProductionPurses,requireProductionStakesNames} from './src/projection-race-information.js';let s='';for await(const c of process.stdin)s+=c;const {card,model}=JSON.parse(s);requireProductionPurses(card);requireProductionStakesNames(card);if(!verifyCertifiedScratchFinalTrack(card,model))process.exit(1);"
 require(subprocess.run(["node","--input-type=module","-e",js],input=compact({"card":merged,"model":f}),capture_output=True).returncode==0,"Website F4 or metadata gate "+name)
 cb,fb=compact(merged),compact(f);meta={"uploaded_at":datetime.now(timezone.utc).isoformat(),"stage":"SCRATCH_FINAL","source_sha256":SOURCE,"badge_sha256":d["badge_sha256"],"f4_receipt_sha256":line["f4_sha256"],"release_sha256":rawhash}
 print("SCRATCH04_PREFLIGHT_PASS",name,runners,ns,flush=True)
 pending=[(fk,ofb,fb,{**ofm,**meta}),(ck,ob,cb,{**om,**meta})]
 for key,oldraw,raw,metadata in pending:require(read(s,key)[0]==oldraw,"Concurrent change "+key)
 for key,oldraw,raw,metadata in pending:
  s.put_object(Bucket=BUCKET,Key=key,Body=raw,ContentType="application/json",CacheControl="private,no-store",Metadata=metadata)
  require(read(s,key)[0]==raw,"Readback mismatch "+key);print("SCRATCH04_READBACK_PASS",key,flush=True)
 require(read(s,ck)[0]==cb and read(s,fk)[0]==fb,"Final paired readback")
 body=compact({"date":DATE,"status":"VERIFIED_SCRATCH_FINAL","batch":"scratch04","track":name,"runners":runners,"cumulative_scratches":ns,"new_scratches":sum(len(v) for v in NEW[slug].values()),"replacement_riders":sum(len(v) for v in RIDERS[slug].values()),"dashboard_sha256":sha(cb),"ordered_sha256":sha(fb),"prior_release_sha256":PRIOR[slug]})
 key=f"projections/qa/{DATE}/scratch04-{slug}-release.json";s.put_object(Bucket=BUCKET,Key=key,Body=body,ContentType="application/json",CacheControl="private,no-store");require(read(s,key)[0]==body,"Receipt")
 print("RR_1126_SCRATCH04_PUBLISH_READBACK",name,runners,ns,flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("RR_1126_SCRATCH04_HOLD "+type(e).__name__+": "+str(e)[:260])

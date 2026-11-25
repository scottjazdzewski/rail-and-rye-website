import base64,hashlib,json,os,re,zlib,subprocess
from pathlib import Path
from datetime import datetime,timezone
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
import boto3
P=Path("private-ingest/20261125-scratch01")
DATE="2026-11-25"
SCR={"finger-lakes":{1:["7"],2:["2"],4:["3"],7:["6"]},"mahoning-valley":{1:["5"],2:["5"],3:["9"],5:["1"],6:["1","7","8"],7:["4"],8:["6"]},"parx-racing":{1:["3"],2:["4","6"],3:["3"],4:["4"],5:["4"],6:["2","9","10"],8:["3"]},"tampa-bay-downs":{2:["6"],4:["2","4"],5:["2","4"],6:["2","6"],7:["3","5","8","10"],8:["8"],9:["8","9"]},"charles-town":{3:["8"],5:["1"],6:["2","3"],7:["4"]}}
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(o):return json.dumps(o,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def require(ok,msg):
 if not ok:raise ValueError(msg)
def read(s,key):
 o=s.get_object(Bucket=BUCKET,Key=key);return o["Body"].read(),o.get("Metadata",{})
def roster(r):return {str(e["program_number"]):e for e in r["entries"]}
def main():
 require(os.environ["GITHUB_REPOSITORY"]==REPO,"Wrong repo")
 m=json.loads((P/"manifest.json").read_text());require(m["date"]==DATE and {t[0] for t in m["tracks"]}==set(SCR) and len(m["tracks"])==5,"Wrong slate")
 s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
 pending=[];receipt=[]
 for slug,name,nr,before,runners,ns,rawhash,cipherhash in m["tracks"]:
  enc=(P/(slug+".enc")).read_bytes();require(sha(enc)==cipherhash,"Cipher hash")
  z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),250001)
  require(z.eof and not z.unused_data and len(raw)<=250000 and sha(raw)==rawhash,"Payload hash")
  d=json.loads(raw);c,f=d["card"],d["model"];line=c["model_receipts"]
  require(c["race_date"]==f["date"]==DATE and c["track_name"]==f["track_name"]==name and c["projection_status"]=="scratch_final" and c["factor_basis"]=="verified_scratch_final" and f["scratch_state"]=="SCRATCH_FINAL","Identity")
  require(line==f["dashboard_receipts"] and line["f4_sha256"]==f["f4_receipt_sha256"] and line["prescratch_parent_sha256"]==d["parent_receipts"]["f4_sha256"] and all(re.fullmatch("[0-9a-f]{64}",v) for v in line.values()),"Lineage")
  ck=f"projections/dashboard/{DATE}/{slug}.json";fk=f"projections/f4-ordered/{DATE}/{slug}.json"
  ob,om=read(s,ck);ofb,ofm=read(s,fk);old=json.loads(ob);oldf=json.loads(ofb)
  require(old["race_date"]==DATE and old["track_name"]==name,"Stored identity")
  if old["projection_status"]=="scratch_final":
   require(old.get("scratch_release_sha256")==rawhash and oldf.get("scratch_release_sha256")==rawhash,"Newer scratch edition: "+name)
   receipt.append({"track":name,"dashboard_sha256":sha(ob),"ordered_sha256":sha(ofb),"runners":runners,"scratches":ns});continue
  require(old["projection_status"]=="prescratch" and old["model_receipts"]==d["parent_receipts"] and oldf["f4_receipt_sha256"]==d["parent_receipts"]["f4_sha256"],"Parent receipt mismatch "+name)
  prior={r["race_number"]:{str(e[0]):(e[1],e[2]) for e in r["entries"]} for r in d["parent_races"]};a={r["race_number"]:r for r in old["races"]};b={r["race_number"]:r for r in c["races"]}
  require(set(a)==set(b)==set(prior)==set(range(1,nr+1)) and len(f["races"])==nr and sum(len(x["entries"]) for x in a.values())==before and sum(len(x["entries"]) for x in b.values())==runners and sum(len(x["scratches"]) for x in b.values())==ns,"Field coverage")
  merged={**old,**{k:v for k,v in c.items() if k not in ("races","daily_double_pools")}};merged["races"]=[]
  for n in sorted(a):
   ar=roster(a[n]);br=roster(b[n]);remove=set(SCR[slug].get(n,[]))
   require(set(ar)==set(prior[n]) and all(e["horse_name"]==prior[n][p][0] and abs(e["win_probability_exact"]-prior[n][p][1])<=1e-8 for p,e in ar.items()),"Parent field mismatch "+name+f" R{n}")
   require(set(br)==set(ar)-remove and {str(e["program_number"]) for e in b[n]["scratches"]}==remove and b[n]["scratch_count"]==len(remove),"Scratch mismatch")
   require(all(e["horse_name"]==ar[p]["horse_name"] for p,e in br.items()) and all(e["horse_name"]==ar[str(e["program_number"])]["horse_name"] for e in b[n]["scratches"]),"Horse mismatch")
   require(abs(sum(e["win_probability_exact"] for e in br.values())-100)<1e-6,"PWIN sum")
   require([e["rank"] for e in b[n]["entries"]]==list(range(1,len(br)+1)) and b[n]["entries"][0]["win_probability_exact"]==max(e["win_probability_exact"] for e in br.values()),"Order")
   for e in br.values():
    require(e["trainer"] and e["jockey"] and len(e["metrics"])==5 and {x["label"] for x in e["metrics"]}=={"Speed","Form","Class","Pace Fit","Surface / Distance"} and all(x["value"] in ("green","gray","red") for x in e["metrics"]),"Factor or role")
    require(abs(sum(e["f4_probabilities"][k] for k in ("exact_p1","exact_p2","exact_p3","exact_p4","exact_p5","p6_plus"))-1)<1e-8,"F4 mass")
   if n not in d["changed_races"]:require(all(abs(ar[p]["win_probability_exact"]-e["win_probability_exact"])<=1e-8 for p,e in br.items()),"Unexpected score change")
   rr={**a[n],**{k:b[n][k] for k in ("entries","pace","scratch_count","scratches","surface","distance","track_condition") if k in b[n]}}
   rr["entries"]=[{**ar[str(e["program_number"])],**e} for e in b[n]["entries"]];merged["races"].append(rr)
  if slug=="tampa-bay-downs":require(all(merged["races"][n-1]["surface"]=="Dirt" and merged["races"][n-1]["distance"]=="1 M 40 Y" for n in (5,7,9)),"Off turf")
  if slug=="charles-town":require(roster(merged["races"][6])["10"]["jockey"]=="S. Diaz, Jr." and any(ch.get("rating")==65 and ch.get("program")=="10" for ch in c["non_scratch_changes"]),"Jockey change")
  merged["scratch_release_sha256"]=rawhash;f["scratch_release_sha256"]=rawhash
  js="import {verifyCertifiedScratchFinalTrack} from './src/f4-exotics.js';import {requireProductionPurses,requireProductionStakesNames} from './src/projection-race-information.js';let s='';for await(const c of process.stdin)s+=c;const {card,model}=JSON.parse(s);requireProductionPurses(card);requireProductionStakesNames(card);if(!verifyCertifiedScratchFinalTrack(card,model))process.exit(1);"
  require(subprocess.run(["node","--input-type=module","-e",js],input=compact({"card":merged,"model":f}),capture_output=True).returncode==0,"Website F4 or metadata gate "+name)
  cb,fb=compact(merged),compact(f);meta={"uploaded_at":datetime.now(timezone.utc).isoformat(),"stage":"SCRATCH_FINAL","source_sha256":f["source_sha256"],"badge_sha256":f["badge_sha256"],"f4_receipt_sha256":line["f4_sha256"],"release_sha256":rawhash}
  pending.extend([(fk,ofb,fb,{**ofm,**meta}),(ck,ob,cb,{**om,**meta})]);receipt.append({"track":name,"dashboard_sha256":sha(cb),"ordered_sha256":sha(fb),"runners":runners,"scratches":ns})
  print("SCRATCH_PREFLIGHT_PASS",name,runners,ns,flush=True)
 for key,old,raw,meta in pending:require(read(s,key)[0]==old,"Concurrent change "+key)
 for key,old,raw,meta in pending:
  s.put_object(Bucket=BUCKET,Key=key,Body=raw,ContentType="application/json",CacheControl="private,no-store",Metadata=meta)
  require(read(s,key)[0]==raw,"Readback mismatch "+key);print("SCRATCH_READBACK_PASS",key,flush=True)
 for t in m["tracks"]:
  slug,name=t[:2];rr=next(x for x in receipt if x["track"]==name)
  require(sha(read(s,f"projections/dashboard/{DATE}/{slug}.json")[0])==rr["dashboard_sha256"] and sha(read(s,f"projections/f4-ordered/{DATE}/{slug}.json")[0])==rr["ordered_sha256"],"Final readback")
 body=compact({"date":DATE,"status":"VERIFIED_SCRATCH_FINAL","batch":"scratch01","tracks":receipt,"runners":297,"scratches":42});key=f"projections/qa/{DATE}/scratch01-release.json"
 s.put_object(Bucket=BUCKET,Key=key,Body=body,ContentType="application/json",CacheControl="private,no-store");require(read(s,key)[0]==body,"Receipt")
 print("RR_1125_SCRATCH01_PUBLISH_PASS tracks=5 races=42 active=297 scratches=42",flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("RR_1125_SCRATCH01_HOLD "+type(e).__name__+": "+str(e)[:200])

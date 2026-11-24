"""Owner-authorized output-only November 24 race-card scratch transfer.
No TRI or F4 model, input matrix, history, or badge evaluator runs here.
Reconstruct exact already-scored positional output from certified coefficients.
"""
import base64,hashlib,json,math,os,re,sys,zlib,itertools,subprocess
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO,OWNER,ISSUE
import boto3
PREFIX="RR_RACECARD_SCRATCH_1124_V1"
DATE="2026-11-24"
EXPECTED="190b69804b0735275d61728ece20b8a798b8c47f3aa53e89bea042b3a929a94f"
PICK_SHA="74ea0b745220994c41b6f81e705ca72c73441e2082c4b82d59eb83ead0f8a4ac"
SOURCE="7395a45700a3aa4fdf9f3dff05f393f7079adf4deb30cb2413aea7a78d4345c3"
MODEL="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET"
EVAL="TBS_FACTOR_BADGE_EVALUATOR_V1_2_6_FIT_CLASS_FORM_GUARDS"
FACTORS=["Speed","Form","Class","Pace Fit","Surface / Distance"]
COLORS={"g":"green","n":"gray","r":"red"}
CONFIG={"Parx Racing":(9,74,71,{3:["2"],4:["6"],6:["10"]},"6a50eb80522f1a1dd4844522ff4be38a3cbd2628d3a08635d947da70f97f629b"),
"Mahoning Valley":(8,67,61,{1:["1"],3:["1"],6:["4","8"],7:["6"],8:["6"]},"87c67fee9d8727abfe1b629997043cdc5fd1591480c1f8c521417026c5a7ca53")}
FIELDS=["exact_p1","exact_p2","exact_p3","exact_p4","exact_p5","p6_plus"]
def require(ok,message):
 if not ok:raise ValueError(message)
def sha(x):return hashlib.sha256(x).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def fingerprint(races):
 lines=[]
 for r in sorted(races,key=lambda r:r["race_number"]):
  for e in sorted(r["entries"],key=lambda e:str(e["program_number"])):
   f=e["f4_probabilities"]
   lines.append("|".join([str(r["race_number"]),str(e["program_number"])]+[format(float(f[k]),".8f") for k in FIELDS]))
 return sha(("\n".join(lines)+"\n").encode())
def read(cli,key):
 o=cli.get_object(Bucket=BUCKET,Key=key);return o["Body"].read(),o.get("Metadata",{})
def validhash(x):return isinstance(x,str) and bool(re.fullmatch("[0-9a-f]{64}",x))
def pubkey():
 print("RR_RACECARD_PUBLIC_KEY="+base64.b64encode(bytes(private_key().public_key)).decode())
def main():
 ev=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text());c=ev.get("comment",{})
 require(ev.get("repository",{}).get("full_name")==REPO and ev.get("issue",{}).get("number")==ISSUE and c.get("user",{}).get("login")==OWNER,"Unauthorized source")
 body=c.get("body","");require(body.startswith(PREFIX+"\n"),"Wrong transfer")
 cipher=base64.b64decode(body[len(PREFIX)+1:].strip(),validate=True);require(len(cipher)<20000,"Oversized transfer")
 z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(cipher),50001);require(z.eof and not z.unused_data and len(raw)<=50000 and sha(raw)==EXPECTED,"Wrong certified delta hash")
 d=json.loads(raw);require(d["date"]==DATE and d["source_sha256"]==SOURCE and d["badge_evaluator"]==EVAL and d["badge_evaluator_sha256"]=="26d720690875a06cef9cf0bb3db4a699e7ca56aa5ed1ca4997717f3c2bfeadac","Incorrect source authority")
 require(len(d["tracks"])==2 and {t["name"] for t in d["tracks"]}==set(CONFIG),"Wrong track scope")
 account=os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()
 cli=boto3.client("s3",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
 p,_=read(cli,"pick-tickets/interim/2026-11-24/revision-0002.json");require(sha(p)==PICK_SHA,"Private certified scratch parent absent")
 pick=json.loads(p);pending=[]
 for t in d["tracks"]:
  name=t["name"];nr,before,after,scr,shot=CONFIG[name];slug=re.sub("[^a-z0-9]+","-",name.lower()).strip("-")
  ck=f"projections/dashboard/{DATE}/{slug}.json";fk=f"projections/f4-ordered/{DATE}/{slug}.json"
  oldraw,meta=read(cli,ck);fraw,fmeta=read(cli,fk);card=json.loads(oldraw);model=json.loads(fraw)
  require(card["race_date"]==DATE and card["track_name"]==name and model["track_name"]==name and model["date"]==DATE,"Wrong stored edition")
  if card["projection_status"]=="scratch_final":
   require(card.get("scratch_release_sha256")==EXPECTED and model.get("scratch_release_sha256")==EXPECTED,"Newer or different scratch edition; do not overwrite")
   require(fingerprint(card["races"])==t["marginal_sha"],"Existing readback mismatch")
   print("ALREADY_VERIFIED "+name);continue
  require(card["projection_status"]=="prescratch" and model["scratch_state"]=="PRESCRATCH" and card["factor_basis"]=="verified_prescratch","Unknown prior edition")
  require(model["f4_receipt_sha256"]==card["model_receipts"]["f4_sha256"] and model["source_sha256"]==meta.get("source_sha256") and model["badge_sha256"]==meta.get("badge_sha256"),"Prescratch receipt mismatch")
  require(len(card["races"])==nr and sum(len(r["entries"]) for r in card["races"])==before,"Prescratch coverage mismatch")
  pt=next(x for x in pick["tracks"] if x["track"]==name)
  require(pt["official_screenshot_sha256"]==shot==t["snapshot_sha"] and pt["official_changes_sha256"]==t["official"] and pt["official_snapshot_utc"]==t["asof"],"Official snapshot mismatch")
  require(all(validhash(t[k]) for k in ("tri","f4","replayed_parent","official","prefix","badge_sha","marginal_sha")),"Local receipt missing")
  require(t["tri"]!=card["model_receipts"]["tri_sha256"] and t["f4"]!=card["model_receipts"]["f4_sha256"],"Stale scores")
  # Preserve the currently approved displayed race facts before changing stage.
  enriched=subprocess.run(["node","--input-type=module","-e","import {enrichRaceInformation,requireProductionPurses,requireProductionStakesNames} from './src/projection-race-information.js'; let s='';for await(const c of process.stdin)s+=c;const card=enrichRaceInformation(JSON.parse(s));requireProductionPurses(card);requireProductionStakesNames(card);process.stdout.write(JSON.stringify(card));"],input=compact(card),capture_output=True,check=True)
  card=json.loads(enriched.stdout)
  delta={r["n"]:r for r in t["races"]};require(set(delta)==set(scr),"Missing affected race")
  mm={r["race_number"]:r for r in model["races"]};pr={r["race_number"]:r for r in pt["races"]}
  for r in card["races"]:
   i=r["race_number"]; orig={str(e["program_number"]):e for e in r["entries"]};prior={e[0]:e[1] for e in pr[i]["pre_entries"]};new={e[0]:e[1] for e in pr[i]["entries"]}
   require(set(orig)==set(prior) and all(abs(orig[p]["win_probability_exact"]/100-prior[p])<=1e-10 for p in orig),"Replayed parent differs from race cards")
   require(set(new)==set(orig)-set(scr.get(i,[])) and pr[i]["scratches"]==scr.get(i,[]),"Scratch roster mismatch")
   r["scratch_count"]=len(scr.get(i,[]));r["scratches"]=[]
   if i not in delta:
    require(all(abs(new[p]-prior[p])<=1e-10 for p in new),"Unaffected score changed")
    continue
   dr=delta[i];require(set(dr["scr"])==set(scr[i]),"Wrong scratch detail")
   for p in scr[i]:
    require(orig[p]["horse_name"].casefold()==dr["scr"][p].casefold(),"Scratch horse identity mismatch")
    r["scratches"].append({"program_number":p,"horse_name":orig[p]["horse_name"]})
   rows=dr["rows"];programs=[e[0] for e in rows];require(set(programs)==set(new) and len(programs)==len(new),"Wrong rescored roster")
   pwin={e[0]:float(e[4]) for e in rows};w2={e[0]:float(e[1]) for e in rows};w3={e[0]:float(e[2]) for e in rows}
   require(all(abs(pwin[p]-new[p])<=1e-10 for p in programs) and abs(sum(pwin.values())-1)<1e-9 and all(math.isfinite(x) and x>0 for x in [*w2.values(),*w3.values(),*pwin.values()]),"Scorer output disagreement")
   require(pwin[programs[0]]==max(pwin.values()),"Highest PWIN must be first")
   # Expand immutable F4 output coefficients, not the predictive model.
   marg=defaultdict(float);levels=[((p,),pwin[p]) for p in programs]
   for k in range(2,min(5,len(programs))+1):
    w=w2 if k==2 else w3;nxt=[]
    for seq,prob in levels:
     rem=[p for p in programs if p not in seq];den=sum(w[p] for p in rem)
     for p in rem:
      q=prob*w[p]/den;marg[p,k]+=q;nxt.append((seq+(p,),q))
    levels=nxt
   newentries=[]
   for rank,e in enumerate(rows,1):
    p=e[0];entry=orig[p];v=[pwin[p]]+[marg[p,k] for k in range(2,6)];tail=max(0,1-sum(v));f=dict(zip(FIELDS,v+[tail]))
    f.update({f"top{k}":sum(v[:k]) for k in (2,3,4)})
    require(len(e[3])==5 and set(e[3])<=set(COLORS),"Incomplete factor output")
    fair=1/pwin[p]-1
    entry.update(rank=rank,win_probability=round(pwin[p]*100,1),win_probability_exact=pwin[p]*100,fair_odds_net_to_1_exact=fair,fair_odds=f"{fair:.2f}/1",f4_probabilities=f,metrics=[{"label":factor,"value":COLORS[col]} for factor,col in zip(FACTORS,e[3])])
    newentries.append(entry)
   r["entries"]=newentries;r["pace"]=dr["pace"]
   require(fingerprint([r])==dr["marginal_sha"],"Certified F4 output fingerprint differs")
   mm[i]={"race_number":i,"programs":programs,"pwin":[pwin[p] for p in programs],"p2_weights":[w2[p] for p in programs],"p3_weights":[w3[p] for p in programs]}
  require(sum(len(r["entries"]) for r in card["races"])==after and fingerprint(card["races"])==t["marginal_sha"],"Full-field F4 output fingerprint mismatch")
  lineage={"tri_sha256":t["tri"],"f4_sha256":t["f4"],"prescratch_parent_sha256":t["replayed_parent"],"official_changes_sha256":t["official"]}
  card.update(projection_status="scratch_final",factor_basis="verified_scratch_final",model_receipts=lineage,scratch_source_sha256=PICK_SHA,scratch_release_sha256=EXPECTED,official_snapshot_utc=t["asof"],non_scratch_changes=pt["non_scratch_changes"])
  model.update(scratch_state="SCRATCH_FINAL",f4_receipt_sha256=t["f4"],prefix_file_sha256=t["prefix"],dashboard_receipts=lineage,races=[mm[i] for i in sorted(mm)],scratch_release_sha256=EXPECTED)
  # Invoke existing website's full scratch-final ordered-F4 gate before writes.
  validation=subprocess.run(["node","--input-type=module","-e","import {verifyCertifiedScratchFinalTrack} from './src/f4-exotics.js';let s='';for await(const c of process.stdin)s+=c;const x=JSON.parse(s);if(!verifyCertifiedScratchFinalTrack(x.card,x.model))process.exit(1);"],input=compact({"card":card,"model":model}),capture_output=True,check=True)
  pending.append((name,ck,fk,oldraw,fraw,card,model,t))
 # All affected tracks pass before the first live object write.
 now=datetime.now(timezone.utc).isoformat()
 for name,ck,fk,oldraw,fraw,card,model,t in pending:
  require(read(cli,ck)[0]==oldraw and read(cli,fk)[0]==fraw,"Concurrent newer release; abort")
 for name,ck,fk,oldraw,fraw,card,model,t in pending:
  common={"uploaded_at":now,"stage":"SCRATCH_FINAL","source_sha256":SOURCE,"badge_sha256":t["badge_sha"],"release_sha256":EXPECTED,"f4_receipt_sha256":t["f4"]}
  for key,data in [(fk,model),(ck,card)]:
   blob=compact(data);cli.put_object(Bucket=BUCKET,Key=key,Body=blob,ContentType="application/json",CacheControl="private,no-store",Metadata=common)
   require(read(cli,key)[0]==blob,"R2 readback mismatch")
  print("RACE_CARDS_SCRATCH_FINAL_R2_READBACK_PASS "+name,flush=True)
 print("RR_1124_RACE_CARD_SCRATCH_PASS 2 tracks / 17 races / 132 runners / 9 scratches; original other tracks untouched",flush=True)
if __name__=="__main__":
 try:
  if len(sys.argv)>1 and sys.argv[1]=="public-key":pubkey()
  else:main()
 except Exception as e:
  # Do not log paid payloads, traceback locals or credentials.
  print("RR_RACE_CARD_SCRATCH_HOLD "+type(e).__name__+": "+str(e)[:200],file=sys.stderr);sys.exit(1)

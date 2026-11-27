"""Nov27 Radar: preserve sealed provisional review privately, promote only after full projection parity."""
import base64,hashlib,json,os,re,zlib,subprocess,math
from datetime import datetime,timezone
from pathlib import Path
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
import boto3
from botocore.exceptions import ClientError
D="2026-11-27"; DUE="2026-11-27T08:00:00Z"
SRC="c4f7b36d1b72f03ee8bcff3b022cd4740d4dbf0f190e218bc89cf9bf18504e06"
MODEL="de289a89bcb5d4759cd8255819149557640faee5787fc642e5e3d0725c346025"
PACKET="bd2e242936ac84d7a4dfde5205fd59cd19456a9a106448294323e7abb44e5fed"
CIPHER="7c8c6c89984c24707f8bd67306472beca76b956b72f09d11be7ee0dfc6793fc0"
PREFIX="intelligence/longshot-radar/staging/"+D+"/"
def need(v,m):
 if not v:raise ValueError(m)
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def norm(x):return re.sub(r"[^a-z0-9]+"," ",str(x).lower()).strip()
def track(x):
 n=norm(x)
 return "belmont park" if n in ("belmont at aqueduct","belmont park","belmont","aqueduct") else n
def ident(t,r,p,h):return (track(t),int(r),str(p).upper(),norm(h))
def ml(x):
 m=re.fullmatch(r"(\d+)\s*[-/]\s*(\d+)",str(x));return int(m[1])/int(m[2]) if m and int(m[2]) else None
TOTE=[(1,5),(2,5),(1,2),(3,5),(4,5),(1,1),(6,5),(7,5),(3,2),(8,5),(9,5),(2,1),(5,2),(3,1),(7,2),(4,1),(9,2),(5,1)]
def fair(p):
 net=1/p-1
 if net>=5:return str(math.ceil(net))+"/1"
 a,b=next((a,b) for a,b in TOTE if a/b>=net-1e-12);return f"{a}/{b}"
def main():
 need(os.environ["GITHUB_REPOSITORY"]==REPO,"Wrong repository")
 now=datetime.now(timezone.utc)
 if not (datetime.fromisoformat(DUE.replace("Z","+00:00"))<=now<datetime.fromisoformat("2026-11-28T08:00:00+00:00")):
  print("RADAR_1127_RELEASE_WINDOW_CLOSED no writes",flush=True);return
 enc=Path("private-ingest/20261127/radar-prestage.enc").read_bytes()
 need(sha(enc)==CIPHER,"Cipher checksum mismatch")
 dec=zlib.decompressobj();raw=dec.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),200001)
 need(dec.eof and not dec.unused_data and len(raw)<=200000 and sha(raw)==PACKET,"Packet checksum mismatch")
 p=json.loads(raw)
 need(p["date"]==D and p["due"]==DUE and p["source"]==SRC and p["model"]==MODEL and p["counts"]==[15,134,1156,2312,28,12],"Source identity")
 need(len(p["receipts"])==15 and sum(r[1] for r in p["receipts"])==134 and sum(r[2] for r in p["receipts"])==1156 and sum(r[3] for r in p["receipts"])==2312 and all(re.fullmatch("[a-f0-9]{64}",r[4]) for r in p["receipts"]),"Scoring receipts")
 q={ident(*d[:4]):d for d in p["decisions"]}
 cs=[dict(zip(p["keys"],row)) for row in p["candidates"]]
 selected={ident(c["track"],c["race_number"],c["program_number"],c["horse_name"]):c for c in cs}
 need(len(q)==28 and len(selected)==12 and set(selected)=={k for k,d in q.items() if d[6]=="PASS"},"Editorial decisions")
 s=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 def get(k):
  try:
   o=s.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o.get("Metadata",{})
  except ClientError as e:
   if e.response.get("Error",{}).get("Code") in ("404","NoSuchKey","NotFound"):return None,{}
   raise
 def put(k,b,meta):
  prev,pm=get(k)
  need(prev is None or (prev==b and pm.get("sha256")==sha(b) and pm.get("release_at")==DUE),"Conflicting private stage")
  if prev is None:s.put_object(Bucket=BUCKET,Key=k,Body=b,ContentType="application/json",CacheControl="private,no-store",Metadata=meta,IfNoneMatch="*")
  rb,rm=get(k);need(rb==b and rm.get("sha256")==sha(b) and rm.get("release_at")==DUE,"R2 readback")
 # Separate key explicitly not a customer edition. Cannot be read by production stage loader.
 draft=compact({"status":"HOLD_PENDING_SHARED_PROJECTIONS","customer_publish_approved":False,"source_packet":p})
 put(PREFIX+"preliminary-qa-0001.json",draft,{"stage_only":"true","customer_publish_approved":"false","sha256":sha(draft),"release_at":DUE,"source_sha256":SRC})
 print("RADAR_1127_PRIVATE_PRESTAGE_PASS tracks=15 races=134 listed=1156 preliminary_candidates=12 sha="+sha(draft),flush=True)
 mb,mm=get("projections/qa/"+D+"/staged-release.json")
 need(mb is not None,"Missing complete projection manifest")
 m=json.loads(mb)
 need(m["source_sha256"]==SRC and m["release_at"]==DUE and len(m["tracks"])==15,"Complete manifest identity mismatch")
 need(len({t["slug"] for t in m["tracks"]})==15,"Duplicate track")
 fields={};eligible={};n=nr=0
 for t in m["tracks"]:
  cb,cm=get("projections/dashboard/"+D+"/"+t["slug"]+".json")
  fb,fm=get("projections/f4-ordered/"+D+"/"+t["slug"]+".json")
  need(cb and fb and sha(cb)==t["dashboard_sha256"] and sha(fb)==t["ordered_sha256"],"Dashboard/F4 checksum mismatch")
  need(cm.get("source_sha256")==SRC and cm.get("release_at")==DUE and fm.get("source_sha256")==SRC and fm.get("release_at")==DUE,"Source metadata mismatch")
  card=json.loads(cb);f=json.loads(fb)
  need(card["race_date"]==D and card["projection_status"]=="prescratch" and card["track_name"]==t["name"] and f["date"]==D and f["source_sha256"]==SRC and f["f4_receipt_sha256"]==card["model_receipts"]["f4_sha256"],"Projection/F4 identity mismatch")
  need(len(card["races"])==t["races"] and sum(len(r["entries"]) for r in card["races"])==t["runners"],"Roster count mismatch")
  for r in card["races"]:
   nr+=1;fk=track(t["name"])+"|"+str(r["race_number"]);need(fk not in fields,"Duplicate field");fields[fk]=r["entries"]
   need(abs(sum(x["win_probability_exact"] for x in r["entries"])-100)<1e-6,"PWIN mass")
   seen=set()
   for x in r["entries"]:
    n+=1;pwin=x["win_probability_exact"]/100;line=ml(x["morning_line"]);k=ident(t["name"],r["race_number"],x["program_number"],x["horse_name"])
    need(str(x["program_number"]) not in seen and abs(pwin-x["f4_probabilities"]["exact_p1"])<1e-8 and x["trainer"] and x["jockey"],"Source runner/F4 proof")
    seen.add(str(x["program_number"]))
    if line is not None and line>=6 and pwin>=1/7 and pwin*(1+line)-1>=.5:eligible[k]=(x,t["name"],r)
 need(nr==134 and n==sum(t["runners"] for t in m["tracks"]),"Full slate incomplete")
 mismatches=[]
 if set(q)!=set(eligible):mismatches.append("numeric qualifier inventory")
 for fk,(identity_hash,pwin_hash) in p["fields"].items():
  rs=sorted(fields.get(fk,[]),key=lambda e:str(e["program_number"]))
  rows=[[str(x["program_number"]),norm(x["horse_name"]),norm(x["trainer"]),norm(x["jockey"]),str(x["morning_line"]).replace("-","/")] for x in rs]
  ph=sha(compact([[str(x["program_number"]),format(x["win_probability_exact"]/100,".12f")] for x in rs]))
  if sha(compact(rows))!=identity_hash or ph!=pwin_hash:mismatches.append(fk)
 # Fail closed by field, not by the entire daily product. All retained
 # editorial selections must have the original exact full-field hashes and
 # still satisfy all numeric conditions on the canonical certified site slate.
 changed=set(mismatches)-{"numeric qualifier inventory"}
 changed.update(k[0]+"|"+str(k[1]) for k in set(q)^set(eligible))
 retained={k:c for k,c in selected.items() if k in eligible and k[0]+"|"+str(k[1]) not in changed and k[0]+"|"+str(k[1]) in p["fields"]}
 held=[{"identity":list(k),"reason":"FIELD_REQUIRES_FRESH_EDITORIAL_REVIEW"} for k in selected if k not in retained]
 new_qualifiers=[list(k) for k in set(eligible)-set(q)]
 need(nr==134 and n==1115 and len(eligible)==27,"Unexpected current canonical slate")
 need(len(retained)>0,"No exact full-field approved selections")
 print("RADAR_1127_RECONCILIATION_PASS tracks=15 races="+str(nr)+" active="+str(n)+" numeric="+str(len(eligible))+" retained="+str(len(retained))+" held="+str(len(held))+" changed_fields="+str(len(changed))+" new_qualifiers_held="+str(len(new_qualifiers)),flush=True)
 selected=retained
 cs=list(retained.values())
 for k,c in selected.items():
  x,name,r=eligible[k];v=x["win_probability_exact"]/100
  need(ml(c["original_morning_line"])==ml(x["morning_line"]) and norm(c["trainer"])==norm(x["trainer"]) and norm(c["jockey"])==norm(x["jockey"]),"Selected source mismatch")
  c.update(track=name,pwin_exact=v,pwin_display=x["win_probability"],fair_odds_display=fair(v))
 proof=compact({"source_packet_sha256":PACKET,"editorial_qa_sha256":p["qa"],"projection_manifest_sha256":sha(mb),"tracks":15,"races":nr,"runners":n,"qualifiers":len(eligible),"selected":len(selected),"exact_reviewed_field_hashes_pass":True,"held_selections":held,"changed_fields":sorted(changed),"new_qualifiers_held":new_qualifiers,"publication_basis":"exact_matching_fields_only"})
 edition={"schema_version":1,"product_type":"longshot_radar","race_date":D,"revision":1,"status":"prescratch","generated_at":now.isoformat().replace("+00:00","Z"),"receipts":{"release_status":"PASS","model_sha256":MODEL,"source_sha256":SRC,"editorial_qa_sha256":sha(proof)},"candidates":cs}
 node="import {validateLongshotEdition} from './src/longshot-radar.js';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(JSON.stringify(validateLongshotEdition(JSON.parse(s))));"
 proc=subprocess.run(["node","--input-type=module","-e",node],input=compact(edition),capture_output=True)
 need(proc.returncode==0,"Website validator rejected edition")
 # Do not overwrite an independently finalized edition or change a live date.
 old,om=get(PREFIX+"revision-0001.json")
 if old:
  need(om.get("sha256")==sha(old) and om.get("release_at")==DUE and json.loads(old)["receipts"]["editorial_qa_sha256"]==sha(proof),"Existing stage conflict")
  print("RADAR_1127_FINAL_STAGE_ALREADY_VERIFIED",flush=True);return
 need(datetime.fromisoformat(DUE.replace("Z","+00:00"))<=datetime.now(timezone.utc)<datetime.fromisoformat("2026-11-28T08:00:00+00:00"),"Release window closed")
 put(PREFIX+"qa-0001.json",proof,{"stage_only":"true","sha256":sha(proof),"release_at":DUE,"source_sha256":SRC})
 put(PREFIX+"revision-0001.json",proc.stdout,{"stage_only":"true","sha256":sha(proc.stdout),"release_at":DUE,"source_sha256":SRC})
 print("RADAR_1127_FINAL_STAGE_READBACK_PASS candidates="+str(len(cs))+" release="+DUE,flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("RADAR_1127_STAGE_HOLD "+type(e).__name__+": "+str(e)[:160])

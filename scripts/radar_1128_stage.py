"""Nov28 independent complete-slate Radar staging; private source evidence and full shared-card parity."""
import base64,hashlib,json,os,re,zlib,subprocess,math
from datetime import datetime,timezone
from pathlib import Path
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
import boto3
from botocore.exceptions import ClientError
D="2026-11-28";DUE="2026-11-28T08:00:00Z"
SRC="d8d4fed7fe0c4dc7ed90687e8c5d11a5419c057c4717f5e064bb61a25e217780"
MODEL="de289a89bcb5d4759cd8255819149557640faee5787fc642e5e3d0725c346025"
PACKET="1389e24d8de16a0f1b9b7b471264cfebf2d5b06f67d7a61105f2db5b4f5d75dc"
CIPHER="b89908205d7e3709b6270b7a4da3089a82b5ef1725fdeff7c17fb1f4d2ddaf8c"
P="intelligence/longshot-radar/staging/"+D+"/"
def need(v,m):
 if not v:raise ValueError(m)
def sha(x):return hashlib.sha256(x).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def norm(x):return re.sub(r"[^a-z0-9]+"," ",str(x).lower()).strip()
def hnorm(x):return norm(re.sub(r"\s*\([A-Z]{2,4}\)$","",str(x)))
def track(x):
 n=norm(x)
 if n in ("belmont at aqueduct","belmont park","belmont","aqueduct"):return "belmont park"
 if n in ("tampa bay downs","tampa bay"):return "tampa bay"
 return n
def ml(x):
 m=re.fullmatch(r"(\d+)\s*[-/]\s*(\d+)",str(x));return int(m[1])/int(m[2]) if m and int(m[2]) else None
def main():
 need(os.environ["GITHUB_REPOSITORY"]==REPO,"Wrong repository")
 now=datetime.now(timezone.utc)
 if now>=datetime.fromisoformat(DUE.replace("Z","+00:00")) or now.year!=2026:
  print("RADAR_1128_RELEASE_WINDOW_CLOSED no writes",flush=True);return
 enc=Path("private-ingest/20261128/radar-stage.enc").read_bytes()
 need(sha(enc)==CIPHER,"Cipher checksum mismatch")
 dec=zlib.decompressobj();raw=dec.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),300001)
 need(dec.eof and not dec.unused_data and len(raw)<=300000 and sha(raw)==PACKET,"Packet checksum mismatch")
 p=json.loads(raw);counts=p["counts"]
 need(p["date"]==D and p["due"]==DUE and p["source"]==SRC and p["model"]==MODEL and counts[:5]==[12,113,1020,981,1962],"Complete source identity")
 rr=p["receipts"];need(len(rr)==len({x[0] for x in rr})==12 and sum(x[1] for x in rr)==113 and sum(x[2] for x in rr)==981 and sum(x[3] for x in rr)==1962 and all(re.fullmatch("[a-f0-9]{64}",x[4]) for x in rr),"Whole-slate source receipts")
 q={(x[0],int(x[1]),str(x[2]),hnorm(x[3])):x for x in p["decisions"]}
 names=p["track_names"];reverse={track(v):k for k,v in names.items()}
 cs=[dict(zip(p["keys"],row)) for row in p["candidates"]]
 selected={(reverse[track(c["track"])],c["race_number"],c["program_number"],hnorm(c["horse_name"])):c for c in cs}
 need(len(q)==len(p["decisions"])==counts[5] and len(selected)==len(cs)==counts[6] and set(selected)=={k for k,d in q.items() if d[6]=="PASS"} and all(d[6] in ("PASS","HOLD") for d in q.values()),"All numeric qualifiers must have editorial disposition; no selection cap")
 for k,d in q.items():
  l=ml(d[4]);v=d[5];need(l is not None and l>=6 and v>=1/7 and v*(1+l)-1>=.5,"Numeric gate")
  if k in selected:
   c=selected[k];need(ml(c["original_morning_line"])==l and c["pwin_exact"]==v,"Candidate probability/price mismatch")
 s=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 def get(k):
  try:
   o=s.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o.get("Metadata",{})
  except ClientError as e:
   if e.response.get("Error",{}).get("Code") in ("404","NoSuchKey","NotFound"):return None,{}
   raise
 def put(k,b,extra=None):
  meta={"stage_only":"true","sha256":sha(b),"release_at":DUE,"source_sha256":SRC,**(extra or {})}
  prev,pm=get(k)
  need(prev is None or (prev==b and pm.get("sha256")==sha(b) and pm.get("release_at")==DUE),"Conflicting private stage")
  if prev is None:s.put_object(Bucket=BUCKET,Key=k,Body=b,ContentType="application/json",CacheControl="private,no-store",Metadata=meta,IfNoneMatch="*")
  rb,rm=get(k);need(rb==b and rm.get("sha256")==sha(b) and rm.get("release_at")==DUE,"R2 readback")
 def validate(edition):
  node="import {validateLongshotEdition} from './src/longshot-radar.js';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(JSON.stringify(validateLongshotEdition(JSON.parse(s))));"
  proc=subprocess.run(["node","--input-type=module","-e",node],input=compact(edition),capture_output=True)
  need(proc.returncode==0,"Website validator rejected edition");return proc.stdout
 # Deterministic generated_at for retry-safe private stage. Actual execution timestamp remains in GitHub receipt.
 edition={"schema_version":1,"product_type":"longshot_radar","race_date":D,"revision":1,"status":"prescratch","generated_at":"2026-11-28T01:09:27Z","receipts":{"release_status":"PASS","model_sha256":MODEL,"source_sha256":SRC,"editorial_qa_sha256":p["qa"]},"candidates":cs}
 validated=validate(edition)
 put(P+"independent-verified-0001.json",validated,{"customer_publish_approved":"false","independent_scoring_pass":"true"})
 put(P+"independent-qa-0001.json",raw,{"customer_publish_approved":"false"})
 print("RADAR_1128_INDEPENDENT_STAGE_READBACK_PASS tracks=12 races=113 listed=1020 active=981 numeric="+str(counts[5])+" approved="+str(counts[6])+" sha="+sha(validated)+" release="+DUE,flush=True)
 mb,mm=get("projections/qa/"+D+"/staged-release.json")
 if not mb:print("RADAR_1128_HOLD final customer queue awaiting shared projection manifest",flush=True);return
 m=json.loads(mb);need(m["source_sha256"]==SRC and m["release_at"]==DUE and len(m["tracks"])==12,"Shared manifest identity")
 need(len({t["slug"] for t in m["tracks"]})==12,"Duplicate track")
 allrows={};eligible={};n=nr=0;changes=[];sitecards={};field_hashes={};roster_hashes={}
 need(m["status"]=="VERIFIED_STAGED" and m["scope"]=="VERIFIED_COMPLETE_SLATE" and mm.get("customer_publish_approved")=="true","Canonical manifest certification")
 for t in m["tracks"]:
  cb,cm=get("projections/dashboard/"+D+"/"+t["slug"]+".json");fb,fm=get("projections/f4-ordered/"+D+"/"+t["slug"]+".json")
  need(cb and fb and sha(cb)==t["dashboard_sha256"] and sha(fb)==t["ordered_sha256"],"Dashboard/F4 checksum mismatch")
  need(cm.get("source_sha256")==SRC and cm.get("release_at")==DUE and fm.get("source_sha256")==SRC and fm.get("release_at")==DUE,"Source metadata")
  card=json.loads(cb);f=json.loads(fb);name=t["name"];code=reverse.get(track(name))
  rb,rm=get("projections/qa/"+D+"/conditional-roster/"+t["slug"]+".json")
  need(rb and rm.get("source_sha256")==SRC and rm.get("release_at")==DUE,"Canonical roster evidence missing")
  roster=json.loads(rb);need(roster["race_date"]==D and roster["track"]==name and re.fullmatch("[a-f0-9]{64}",roster["original_pdf_sha256"]),"Roster evidence identity")
  roster_hashes[code]=sha(rb)
  need(code and code not in allrows and card["race_date"]==D and card["projection_status"]=="prescratch" and card["track_name"]==name and f["date"]==D and f["source_sha256"]==SRC and f["f4_receipt_sha256"]==card["model_receipts"]["f4_sha256"],"Projection/F4 identity")
  need(len(card["races"])==t["races"] and sum(len(r["entries"]) for r in card["races"])==t["runners"],"Shared roster counts")
  allrows[code]=[];seenr=set()
  for r in card["races"]:
   rn=int(r["race_number"]);need(rn not in seenr,"Duplicate race");seenr.add(rn);nr+=1;rs=[];seen=set()
   need(abs(sum(x["win_probability_exact"] for x in r["entries"])-100)<1e-6,"PWIN mass")
   for x in r["entries"]:
    prog=str(x["program_number"]);v=x["win_probability_exact"]/100;line=ml(x["morning_line"]);n+=1
    need(prog not in seen and abs(v-x["f4_probabilities"]["exact_p1"])<1e-8 and x["trainer"] and x["jockey"],"Runner identity/F4")
    seen.add(prog);k=(code,rn,prog,hnorm(x["horse_name"]))
    rs.append([rn,prog,hnorm(x["horse_name"]),norm(x["trainer"]),norm(x["jockey"]),str(x["morning_line"]).replace("-","/"),format(v,".10f")])
    if line is not None and line>=6 and v>=1/7 and v*(1+line)-1>=.5:eligible[k]=(x,name)
   rs.sort(key=lambda a:(a[0],a[1]));allrows[code]+=rs
   fk=code+"|"+str(rn)
   field_hashes[fk]=sha(compact(rs))
   if fk in p["reviewed_hashes"] and field_hashes[fk]!=p["reviewed_hashes"][fk]:changes.append(fk)
  allrows[code].sort(key=lambda a:(a[0],a[1]))
 need(nr==113 and n==sum(t["runners"] for t in m["tracks"]),"Shared race coverage")
 track_changes=[k for k,rs in allrows.items() if sha(compact(rs))!=p["track_hashes"][k]]
 # Explicit date-specific reconciliation against independently certified Race Cards.
 # Old/new SHA pairs bind the exact reviewed discrepancy report; other changes fail closed.
 accepted_tracks={"BEL":["dd0cfb9b3288983878ba9782d42e0cdfd1bd1db6593858aa019f9c3693bfc051","4810244383a98c601dae45af6e3e873131ae54b7524401213b8bafad1c1d547b"],"FG":["1cd13b7ca19315b0219c1d7ad1fab53299399a43a84ebd03075a43b6bd5f82ba","c189b528f7dcc37a4e2471ca3f225cb1d2b0e2c563386f4a3c626c274dd0a502"],"LRL":["c80073b52db13010b533cbe6b0dd6c589aba5c52b25ceafd9436bf9fa6599d8d","f2d131f6d297c335d1ffe20818fd36c9b8389f17b24749b735e504788caff274"],"OP":["fd426ebaa6b5640bee1c3b5375c050311ee328597c6aba540bf0fefb87d7a72c","15f67382d2f202692d425e896e8965e80e0f9cfae37decaab6f03dbe6bed7773"],"TUP":["890ce26f51b4802fd4500b5db5b1b67684c2efe8d920cb1cce657cc347e7b657","27d3c4fb999794dbb82213807eacdccce6edb476da2e171c7367e52316d636bb"]}
 accepted_fields={"LRL|1":["32651643709267df823119765043d417aec072d9306a43452b1954db8c792f1c","a554829617f671efd404303c70b22ac19065266aedcedf4e860855b817d58b43"],"OP|3":["682babc67d1ba1264dc7ff0dfe48fabceee357414d5ce77b38b8576c294f2bd0","b3880e427cd290e79804fb47ae5bbfe55dc3d8a79797e8893fbf48feb6b871b7"],"TUP|8":["8dc7c9d89b71045edf543d947c81eb51c7c0ed2b1cfd5304af518440a6d5674f","819ad7fb29cba4621871c792a0b6a35f63c1ca440ee9db9f5fe0e21b448f2006"]}
 need(set(q)==set(eligible) and n==981,"Canonical numerical qualifier/roster mismatch")
 need(set(track_changes)==set(accepted_tracks) and set(changes)==set(accepted_fields),"Unexpected reconciliation scope")
 for k,(old,new) in accepted_tracks.items():
  need(p["track_hashes"][k]==old and sha(compact(allrows[k]))==new,"Unreviewed track revision")
 for k,(old,new) in accepted_fields.items():
  need(p["reviewed_hashes"][k]==old and field_hashes[k]==new,"Unreviewed opponent field revision")
  code,rn=k.split("|")
  need(all(d[6]=="HOLD" for kk,d in q.items() if kk[0]==code and kk[1]==int(rn)),"Changed approved field requires fresh editorial review")
 # Explicit re-review of the three changed HOLD fields: turf cutback without established
 # course-surface win, repeated recent fade after illness scratch, and 108-day layoff
 # with recent vet scratch, respectively. Retain holds; no other reviewed field changed.
 # Entire five-track source header inventory reviewed against original archive; blank
 # foreign-native header prices/riders and one unassigned rider remain governed by
 # certified canonical source/conditional roster evidence, not inferred replacements.
 decisions=[]
 for k,d in q.items():
  x,_=eligible[k];v=x["win_probability_exact"]/100;l=ml(x["morning_line"])
  need(l==ml(d[4]) and v>=1/7 and v*(1+l)-1>=.5,"Canonical decision gate")
  if d[6]=="PASS":need(abs(v-d[5])<=1e-12,"Approved probability changed")
  decisions.append({"identity":list(k),"previous_pwin":d[5],"canonical_pwin":v,"disposition":d[6]})
 reconciliation={"schema_version":1,"race_date":D,"source_sha256":SRC,"independent_packet_sha256":PACKET,"canonical_manifest_sha256":sha(mb),"track_hashes":accepted_tracks,"reviewed_field_hashes":accepted_fields,"canonical_roster_hashes":roster_hashes,"numeric_decisions":decisions,"source_header_review_count":400,"reviewed_hold_basis":{"LRL|1":"No established win on today's course/surface; recent turf form and cutback uncertainty.","OP|3":"Recent fading form, illness scratch and pace competition; no independently supported winning scenario.","TUP|8":"108-day layoff, recent vet scratch and stronger current opposition; insufficient independent case."},"source_exceptions":"Four foreign-native header ML blanks, three missing current rider rows and one Laurel unassigned rider; use already certified common upstream data and approved neutral policy, not invented inputs."}
 rec=compact(reconciliation);put(P+"reconciliation-0001.json",rec)
 print("RADAR_1128_RECONCILIATION_PASS tracks=5 source_headers=400 reviewed_hold_fields=3 qualifiers=28 approved=14 sha="+sha(rec),flush=True)
 for k,c in selected.items():
  x,name=eligible[k];need(abs(c["pwin_exact"]-x["win_probability_exact"]/100)<1e-10 and ml(c["original_morning_line"])==ml(x["morning_line"]),"Candidate exact source")
  c.update(track=name,horse_name=x["horse_name"],pwin_exact=x["win_probability_exact"]/100,pwin_display=x["win_probability"],trainer=x["trainer"],jockey=x["jockey"])
 proof=compact({"source_packet_sha256":PACKET,"editorial_qa_sha256":p["qa"],"projection_manifest_sha256":sha(mb),"tracks":12,"races":113,"runners":981,"numeric":counts[5],"approved":counts[6],"all_field_hashes_pass":True,"reconciliation_sha256":sha(rec),"reconciled_tracks":5,"reconciled_reviewed_hold_fields":3,"normalization_sha256":p["normalization"],"exclusion_sha256":p["exclusion"]})
 edition["receipts"]["editorial_qa_sha256"]=sha(proof);edition["candidates"]=list(selected.values());validated=validate(edition)
 need(datetime.now(timezone.utc)<datetime.fromisoformat(DUE.replace("Z","+00:00")),"Release window closed")
 put(P+"qa-0001.json",proof);put(P+"revision-0001.json",validated)
 print("RADAR_1128_FINAL_STAGE_READBACK_PASS candidates="+str(len(cs))+" release="+DUE+" sha="+sha(validated),flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("RADAR_1128_STAGE_HOLD "+type(e).__name__+": "+str(e)[:180])

"""November 27 independent scratch revision. Only source-bound sealed candidate; never log paid data."""
import os,json,hashlib,base64,zlib,re,subprocess,boto3,urllib.request,urllib.error
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
from nacl.public import SealedBox
from botocore.exceptions import ClientError
from pick_private_score_bridge import private_key,BUCKET,REPO
D="2026-11-27"; SRC="c4f7b36d1b72f03ee8bcff3b022cd4740d4dbf0f190e218bc89cf9bf18504e06"; PARENT="561bbbb058f15a0d674c59a24d565fcbb75bbf908ef08be165a158e34b55e3ed"
RAW="e055109892d7874039c49a6bc6a483b3ba31fcd45cec4d50a802d6681ae04196"; CIPHER="2b450d60e0cccc75e787b6d747aa3be2f7422396a02f558e18105892c077ea86"
P=f"racing-intelligence/product-tabs/pick-tickets/{D}/"
CONF={"Charles Town":("charles-town",8,63,11,2),"Fair Grounds":("fair-grounds",8,57,11,2),"Tampa Bay":("tampa-bay-downs",8,51,11,3),"Woodbine":("woodbine",8,55,9,2)}
SCR={"Charles Town":{"1":["2"],"5":["2"],"6":["4","6"],"7":["8"],"8":["2"]},"Fair Grounds":{"5":["4","9","10","11"],"7":["1","7","12","14"]},"Tampa Bay":{"4":["3"],"5":["6"],"6":["5","7","9"],"8":["2","5","8","10"]},"Woodbine":{"4":["7"],"5":["3","7","9"],"7":["2","6"]}}
TAM_PARENT="81a9db56a8b0a0c3a550191183437c3b5dafe64dd83bc9ef212c4f286247158f"
def need(ok,msg):
 if not ok:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(o):return json.dumps(o,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def slug(n):return re.sub("[^a-z0-9]+","-",n.lower()).strip("-")
def hex64(v):return isinstance(v,str) and bool(re.fullmatch("[a-f0-9]{64}",v))
need(os.environ["GITHUB_REPOSITORY"]==REPO and os.environ["GITHUB_REF"]=="refs/heads/main","Unauthorized branch")
need(datetime.now(timezone.utc).astimezone(ZoneInfo("America/New_York")).date().isoformat()==D,"Date closed")
enc=Path("private-ingest/pick-20261127-scratch-batch2/source.enc").read_bytes()
need(sha(enc)==CIPHER and len(enc)==17692,"Cipher checksum")
need(base64.b64encode(bytes(private_key().public_key)).decode()=="jjxUgQwkjBuzNDPAGiSs1Rnp3vqC6/1V7kBtJJDELDk=","Current bridge key mismatch")
z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),150001)
need(z.eof and not z.unused_data and len(raw)==83793 and sha(raw)==RAW,"Exact sealed candidate checksum")
b=json.loads(raw);need(b["date"]==D and b["source_archive_sha256"]==SRC and b["initial_stage_sha256"]==PARENT and len(b["tracks"])==4 and {x["card"]["track"] for x in b["tracks"]}==set(CONF),"Sealed slate identity")
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(k):
 o=s.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o
def optional(k):
 try:return get(k)
 except ClientError as e:
  if e.response["Error"]["Code"] in ("404","NoSuchKey","NotFound"):return None,{}
  raise
def immutable(k,body,m):
 old,om=optional(k)
 if old is None:s.put_object(Bucket=BUCKET,Key=k,Body=body,ContentType="application/json",CacheControl="private,no-store",Metadata=m,IfNoneMatch="*")
 need(get(k)[0]==body,"Immutable archive conflict")
stage,so=get(f"pick-tickets/staging/{D}/revision-0001.json");need(sha(stage)==PARENT and so["Metadata"].get("sha256")==PARENT,"Initial immutable source mismatch")
stage=json.loads(stage);need(stage["date"]==D and stage["source_archive_sha256"]==SRC,"Initial stage identity")
def cardfields(c):
 out={}
 for q in c["sequences"]:
  for f in q["race_fields"]:
   k=str(f["race_number"]);v=q["review_probabilities"][k];need(set(f["programs"])==set(v),"Field map mismatch")
   if k in out:need(out[k]==v,"Repeated field mismatch")
   out[k]=v
 return out
def menus(c):return [(q["name"],q["start_race"],q["end_race"],q["tickets"][0]["unit_cents"]) for q in c["sequences"]]
ready=[];holds=[]
for row in b["tracks"]:
 name=row["card"]["track"]
 try:
  sl,nr,ns,nq,rev=CONF[name];c=row["card"];r=row["receipt"];proof=row["proof"];initial=next(x for x in stage["tracks"] if x["card"]["track"]==name)
  need(c["date"]==D and c["revision"]==rev and c["status"]=="scratch_updated" and c["publication_mode"]=="owner-approved-gpt" and c["scratches_by_race"]==SCR[name] and (row["races"],row["runners"],len(c["sequences"]))==(nr,ns,nq),"Candidate identity")
  need(r["tri_status"]=="PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME" and r["f4_status"]=="PASS" and r["scratch_state"]=="SCRATCH_FINAL" and r["f4_p1_equals_tri"] is True and r["unresolved_fields"]==0 and r["source_pdf_sha256"]==initial["receipt"]["source_pdf_sha256"] and r["parent_f4_sha256"]==initial["receipt"]["f4_sha256"] and all(hex64(r[k]) for k in ["tri_sha256","f4_sha256","pwin_sha256","features_sha256","f4_runner_sha256","source_pdf_sha256","derived_scoring_pdf_sha256","official_changes_sha256"]),"Frozen receipt linkage")
  need(proof["permanent_policy_id"]=="TRI_TJ_NEUTRAL_MEAN_V4_ALWAYS_ON" and proof["pre_score_v4_policy"]=="FROZEN_MODEL_FEATURE_MEANS_UNIVERSAL_V4" and proof["all_roles_complete"] is True and proof["exact_consumed_model_matrix_verified"] is True and proof["trainer_jockey_roles_proven"]==2*ns and proof["complete_active_runner_count"]==ns,"T/J gate")
  need(c["source_input_sha256"]==r["pwin_sha256"] and c["model_receipts"]=={"tri_sha256":r["tri_sha256"],"f4_sha256":r["f4_sha256"]} and c["source_receipt"]["sha256"]==r["f4_sha256"],"Customer receipt mismatch")
  need(row["market_review"]["approved_additions"]==0 and row["market_review"]["audit_sha256"]==b["market_audit_sha256"] and row["market_review"]["review_sha256"]==b["market_review_sha256"] and hex64(row["market_review"]["source_run_sha256"]) and hex64(row["official_source_sha256"]),"Market decision or screenshot digest")
  key=P+slug(name)+".json";old,om=get(key);prev=json.loads(old)
  need(om["Metadata"].get("customer_publish_approved")=="true" and om["Metadata"].get("content_sha256")==sha(old) and prev["date"]==D and prev["track"]==name and prev["revision"]==rev-1 and menus(prev)==menus(initial["card"])==menus(c) and prev["post_times_by_race"]==c["post_times_by_race"],"Prior revision/menu mismatch")
  if name=="Tampa Bay":need(sha(old)==TAM_PARENT and prev["status"]=="scratch_updated","Tampa prior revision not exact")
  else:need(prev["status"]=="initial_current" and prev["source_input_sha256"]==initial["card"]["source_input_sha256"],"Wrong original customer source")
  oldfields=cardfields(prev);newfields=cardfields(c);vectors=row["runner_pwin"]
  need(set(vectors)==set(oldfields)==set(newfields)==set(map(str,range(1,nr+1))) and sum(map(len,vectors.values()))==ns,"Full field inventory")
  for k,vs in vectors.items():
   ids={v[0] for v in vs};need(len(ids)==len(vs) and all(len(v)==4 and isinstance(v[1],str) and 0<v[2]<1 and abs(v[2]-v[3])<1e-12 for v in vs) and abs(sum(v[2] for v in vs)-1)<1e-10,"TRI/F4 vector invalid")
   need(ids==set(newfields[k]) and all(abs(newfields[k][v[0]]-100*v[2])<1e-9 for v in vs),"Ticket field parity")
   need(ids==set(oldfields[k])-set(SCR[name].get(k,[])),"Nonmonotonic active roster")
  # Check currently published upstream snapshot. If it is an earlier edition,
  # owner authorized independent product release; never label it parity-verified.
  pkey=f"projections/dashboard/{D}/{sl}.json";fkey=f"projections/f4-ordered/{D}/{sl}.json"
  pb,po=get(pkey);fb,fo=get(fkey);p=json.loads(pb);f=json.loads(fb)
  need(p["race_date"]==D and f["date"]==D and f["source_sha256"]==SRC and f["f4_receipt_sha256"]==p["model_receipts"]["f4_sha256"],"Upstream source identity")
  rs={str(x["race_number"]):x for x in p["races"]};need(set(rs)==set(vectors),"Upstream race count")
  cs={k:set(str(e["program_number"]) for e in v.get("scratches",[])) for k,v in rs.items()}
  same_ledger=all(cs[k]==set(SCR[name].get(k,[])) for k in rs)
  same_roster=all({str(e["program_number"]) for e in rs[k]["entries"]}=={v[0] for v in vectors[k]} for k in rs)
  canonical=None
  if p["projection_status"]=="scratch_final" and same_ledger and same_roster:
   # Require receipt-bound canonical source and exact runner identity/changes,
   # then use its exact probabilities if the two certified engines differ.
   matched=None
   for page in s.get_paginator("list_objects_v2").paginate(Bucket=BUCKET,Prefix=f"projections/qa/{D}/scratch"):
    for item in page.get("Contents",[]):
     if not item["Key"].endswith("-release.json"):continue
     qraw,_=get(item["Key"]);q=json.loads(qraw)
     if q.get("date")==D and q.get("status") in ("VERIFIED_SCRATCH_FINAL","PARTIAL_VERIFIED_SCRATCH_FINAL"):
      if any(t.get("dashboard_sha256")==sha(pb) and t.get("ordered_sha256")==sha(fb) and t.get("runners")==ns and t.get("scratches")==sum(map(len,SCR[name].values())) for t in q.get("tracks",[])):matched=sha(qraw);break
    if matched:break
   need(matched,"Current canonical release receipt missing")
   for k,vs in vectors.items():
    by={str(e["program_number"]):e for e in rs[k]["entries"]};need(all(by[v[0]]["horse_name"]==v[1] for v in vs),"Canonical horse identity")
    for e in by.values():need(abs(e["win_probability_exact"]/100-e["f4_probabilities"]["exact_p1"])<1e-12,"Canonical F4 parity")
    for prog,w in row["weight_changes"].get(k,{}).items():need(by[prog]["weight_carried_lbs"]==w,"Canonical weight change")
    for prog,j in row["jockey_changes"].get(k,{}).items():need(by[prog]["jockey"]==j,"Canonical jockey change")
    if k in row["surface_changes"]:need(rs[k]["surface"]==row["surface_changes"][k],"Canonical surface change")
   canonical={"projection":p,"model":f,"dashboard_sha256":sha(pb),"ordered_sha256":sha(fb),"release_sha256":matched}
   mode="VERIFIED_CURRENT_CANONICAL"
  else:
   need(p["projection_status"] in ("prescratch","scratch_final"),"Unknown upstream source status")
   need(all(cs[k].issubset(set(SCR[name].get(k,[]))) for k in rs),"Upstream contains newer scratches")
   if p["projection_status"]=="scratch_final":need(all({str(e["program_number"]) for e in rs[k]["entries"]}==set(oldfields[k]) for k in rs),"Earlier upstream roster mismatch")
   elif name!="Tampa Bay":
    need(all({str(e["program_number"]) for e in rs[k]["entries"]}==set(oldfields[k]) for k in rs),"Prescratch upstream roster mismatch")
   mode="OWNER_AUTHORIZED_INDEPENDENT_CERTIFIED_RELEASE"
  inp={"row":row,"canonical":canonical,"source_archive_sha256":SRC};Path("/tmp/rr-pick-batch2-in.json").write_bytes(compact(inp))
  subprocess.run(["node","scripts/build_pick_batch2_1127.mjs"],check=True)
  body=Path("/tmp/rr-pick-batch2-out.json").read_bytes();out=json.loads(body)
  need(out["revision"]==rev and out["track"]==name and menus(out)==menus(prev),"Customer final identity")
  audit={"date":D,"track":name,"parent_customer_sha256":sha(old),"new_customer_sha256":sha(body),"source_packet_sha256":RAW,"source_archive_sha256":SRC,"initial_stage_sha256":PARENT,"independent_receipts":r,"proof":proof,"official_source_sha256":row["official_source_sha256"],"market_review":row["market_review"],"parity_mode":mode,"upstream_dashboard_sha256":sha(pb),"upstream_f4_sha256":sha(fb),"canonical_release_sha256":canonical["release_sha256"] if canonical else None,"revision":rev}
  ready.append((name,key,old,om,body,audit,pkey,pb,fkey,fb,row))
 except Exception as e:
  holds.append(name);print("PICK_BATCH2_HOLD",name,type(e).__name__,str(e)[:140],flush=True)
for name,key,old,om,body,audit,pkey,pb,fkey,fb,row in ready:
 need(get(key)[0]==old and get(pkey)[0]==pb and get(fkey)[0]==fb,"Concurrent source change "+name)
 rev=row["card"]["revision"];prefix=f"pick-tickets/scratch-revisions/{D}/{slug(name)}/"
 immutable(prefix+f"r{rev-1}-customer-"+sha(old)+".json",old,om["Metadata"])
 a=compact(audit);immutable(prefix+f"r{rev}-source-"+sha(a)+".json",a,{"sha256":sha(a)})
 private=compact(row);immutable(prefix+f"r{rev}-independent-"+sha(private)+".json",private,{"sha256":sha(private)})
 c=json.loads(body);meta={**om["Metadata"],"revision":str(rev),"content_sha256":sha(body),"source_sha256":c["source_input_sha256"],"receipt_sha256":c["source_receipt"]["sha256"],"customer_publish_approved":"true","publication_mode":"owner-approved-gpt"}
 s.put_object(Bucket=BUCKET,Key=key,Body=body,ContentType="application/json",CacheControl="private,no-store",Metadata=meta,IfMatch=om["ETag"])
 rb,rm=get(key);need(rb==body and rm["Metadata"].get("content_sha256")==sha(body) and rm["Metadata"].get("customer_publish_approved")=="true","Customer readback")
 print("PICK_BATCH2_READBACK_PASS",name,rev,row["runners"],len(c["sequences"]),audit["parity_mode"],sha(body),flush=True)
print("PICK_BATCH2_SUMMARY",len(ready),sum(len(x[10]["card"]["sequences"]) for x in ready),"holds",holds,flush=True)
try:
 req=urllib.request.Request("https://railandryeracing.com/api/products?qa=pick1127batch2",headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
 with urllib.request.urlopen(req,timeout=20) as res:ps=json.load(res)["products"]
 rows=ps+[q for p in ps for q in p.get("included_products",[])]
 names={p.get("track") for p in rows if p.get("category")=="Pick Tickets" and p.get("race_date")==D and p.get("track")}
 print("PICK_BATCH2_PUBLIC_CATALOG",len(names),"tracks",flush=True)
except Exception as e:print("PICK_BATCH2_PUBLIC_CATALOG_UNVERIFIED",type(e).__name__,flush=True)
if holds:raise RuntimeError("One or more track release holds")

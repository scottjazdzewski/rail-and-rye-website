#!/usr/bin/env python3
"""November 28 authorized production baseline: private staging only.
R23 research and protected forecasts never enter this script or public repository.
All paid inputs are read privately from the already-certified common R2 source.
"""
import base64, hashlib, io, json, math, os, re, subprocess, unicodedata, zipfile
from pathlib import Path
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError
D="2026-11-28"; DUE=D+"T08:00:00Z"; BUCKET="rail-and-rye-private-cards"
SOURCE="d8d4fed7fe0c4dc7ed90687e8c5d11a5419c057c4717f5e064bb61a25e217780"
MAN="d719927d604a9f6eb9a9644b29121ed11fc02bb35ffba25f602c5939adfb4cd8"
CONTROL="57dab176c300c0169c8dae84e3ab8621238e1002f1962cafc864f0ebffc16ae4"
PROOF="5b18c7ecfae0526a8560ad2ca6d172f0eee55cbcfed5d8477ece9c04daecffbc"
FROZEN="bd8c38de63a4c6d055f654347e7eaabe9c7fdbedfd3ea75885b20b46a163158b"
PREFIX="pick-tickets/staging/"+D+"/"
def need(x,m):
 if not x: raise ValueError(m)
def sha(x): return hashlib.sha256(x).hexdigest()
def compact(x): return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def norm(x): return re.sub(r"[^a-z0-9]+"," ","".join(c for c in unicodedata.normalize("NFKD",str(x)).lower() if not unicodedata.combining(c))).strip()
def hnorm(x): return norm(re.sub(r"\s*\([A-Z]{2,4}\)$","",str(x)))
def main():
 need(os.environ.get("GITHUB_REPOSITORY")=="scottjazdzewski/rail-and-rye-website","wrong repository")
 need(datetime.now(timezone.utc)<datetime.fromisoformat(DUE.replace("Z","+00:00")),"stage cutoff passed")
 zraw=base64.b64decode(Path("private-ingest/20261128/pick-stage-control.zip.b64").read_text().strip(),validate=True)
 need(sha(zraw)==CONTROL,"control archive changed")
 with zipfile.ZipFile(io.BytesIO(zraw)) as z:
  need(z.namelist()==["pick_1128_private_stage_control.json"] and z.testzip() is None,"control archive invalid")
  ctrl=json.loads(z.read(z.namelist()[0]))
 need(ctrl["date"]==D and ctrl["release_at"]==DUE and ctrl["source_archive_sha256"]==SOURCE and ctrl["manifest_sha256"]==MAN and ctrl["source_counts"]==[12,113,1020,981,1962,39] and ctrl["expected_sequences"]==158 and ctrl["v35_review"]["accepted"]==0,"control binding")
 s=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 def get(k,optional=False):
  try:
   v=s.get_object(Bucket=BUCKET,Key=k);return v["Body"].read(),v.get("Metadata",{})
  except ClientError as e:
   if optional and e.response.get("Error",{}).get("Code") in ("404","NoSuchKey","NotFound"):return None,{}
   raise
 def put(k,b,extra=None):
  md={"stage_only":"true","customer_publish_approved":"false","sha256":sha(b),"release_at":DUE,"source_sha256":SOURCE,**(extra or {})}
  old,om=get(k,True)
  need(old is None or (old==b and all(om.get(a)==v for a,v in md.items())),"immutable private stage conflict")
  if old is None: s.put_object(Bucket=BUCKET,Key=k,Body=b,ContentType="application/json",CacheControl="private,no-store",Metadata=md,IfNoneMatch="*")
  rd,rm=get(k);need(rd==b and all(rm.get(a)==v for a,v in md.items()),"private stage readback")
 mb,_=get("projections/qa/"+D+"/staged-release.json");need(sha(mb)==MAN,"canonical manifest SHA")
 m=json.loads(mb);need(m["race_date"]==D and m["release_at"]==DUE and m["source_sha256"]==SOURCE and m["status"]=="VERIFIED_STAGED" and m["scope"]=="VERIFIED_COMPLETE_SLATE","canonical manifest identity")
 pb,_=get("intelligence/target-list/staging/"+D+"/source-v41-receipts-0001.json")
 need(sha(pb)==PROOF,"authenticated shared V4.1 raw proof changed")
 p=json.loads(pb);need(p["date"]==D and p["source_sha256"]==SOURCE and p["manifest_sha256"]==MAN and p["counts"]==[12,113,1020,981,1962,39,18],"shared proof binding")
 mt={t["slug"]:t for t in m["tracks"]}; pt={t["slug"]:t for t in p["receipts"]};ct={t["slug"]:t for t in ctrl["tracks"]}
 need(len(mt)==len(pt)==len(ct)==12 and mt.keys()==pt.keys()==ct.keys(),"whole-slate track inventory")
 rows=[];expected={}; counts=[0,0,0,0,0,0];customer_before={}
 for slug,c in ct.items():
  t=mt[slug];pr=pt[slug];name=c["track"];rr=c["receipt"];proof=c["proof"]
  raw=pr["receipt_raw"].encode();need(sha(raw)==pr["receipt_sha256"]==rr["tri_sha256"],"shared local TRI receipt mismatch")
  rec=json.loads(raw); role=rec["permanent_tj_v4_role_proof"]
  need(rec["status"]=="PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME" and rec["frozen_runtime_archive_sha256"]==FROZEN and rec["official_input_gate"] is True and rec["permanent_v4_both_roles_before_pwin"] is True and rec["permanent_tj_v4_policy_id"]=="TRI_TJ_NEUTRAL_MEAN_V4_ALWAYS_ON" and role==proof and not rec["rating_resolution_gate"]["unresolved_fields"] and rr["pwin_sha256"]==rec["scored_pwin_output_sha256"],"shared role/matrix proof")
  need(rr["f4_status"]=="PASS" and rr["scratch_state"]=="PRESCRATCH" and rr["unresolved_fields"]==0 and rr["f4_p1_equals_tri"] is True and all(re.fullmatch("[a-f0-9]{64}",rr[k]) for k in ["f4_sha256","pwin_sha256","tri_sha256","source_pdf_sha256","features_sha256","f4_runner_sha256"]),"local independent TRI/F4 receipt binding")
  need(t["name"]==pr["track"]==name and t["races"]==pr["races"]==c["races"]==rec["races"] and t["runners"]==pr["runners"]==c["runners"]==rec["starters"] and proof["trainer_jockey_roles_proven"]==2*c["runners"] and proof["complete_active_runner_count"]==c["runners"] and pr["original_pdf_sha256"]==c["original_pdf_sha256"],"exact track source/role counts")
  cb,cm=get("projections/dashboard/"+D+"/"+slug+".json");fb,_=get("projections/f4-ordered/"+D+"/"+slug+".json")
  need(sha(cb)==t["dashboard_sha256"] and sha(fb)==t["ordered_sha256"] and cm.get("source_sha256")==SOURCE and cm.get("release_at")==DUE and cm.get("customer_publish_approved")=="true","canonical dashboard/F4 source hash/approval")
  d=json.loads(cb);f=json.loads(fb); mr=d["model_receipts"]
  need(d["race_date"]==D and d["track_name"]==name and d["projection_status"]=="prescratch" and f["f4_receipt_sha256"]==mr["f4_sha256"],"canonical TRI/F4 identity")
  rb,_=get("projections/qa/"+D+"/conditional-roster/"+slug+".json");ro=json.loads(rb)
  need(ro["original_pdf_sha256"]==c["original_pdf_sha256"] and pr["listed"]==c["listed"]==c["runners"]+len(ro["conditional_roster"]),"conditional source coverage")
  exclusions={}
  for x in ro["conditional_roster"]: exclusions.setdefault(str(x["race"]),[]).append(str(x["program"]))
  fields={}; runner_pwin={}; score_rows=[]
  for race in d["races"]:
   n=race["race_number"]; es=race["entries"]
   need(str(n) not in fields and len(es)>0 and len({str(e["program_number"]) for e in es})==len(es),"duplicate race/runner")
   field={}; rv=[]
   for e in es:
    prog=str(e["program_number"]); prob=e["win_probability_exact"]/100; f4=e["f4_probabilities"]["exact_p1"]
    need(math.isfinite(prob) and 0<=prob<=1 and abs(prob-f4)<1e-12,"canonical exact PWIN/F4 disagreement")
    field[prog]=e["win_probability_exact"];rv.append([prog,e["horse_name"],prob,f4])
    score_rows.append([n,prog,hnorm(e["horse_name"]),norm(e["trainer"]),norm(e["jockey"]),str(e["morning_line"]).replace("-","/"),format(prob,".10f")])
   need(abs(sum(field.values())-100)<1e-7 and not (set(field)&set(exclusions.get(str(n),[]))),"canonical mass or excluded runner")
   fields[str(n)]=field;runner_pwin[str(n)]=rv
  score_rows.sort(key=lambda x:(x[0],x[1]))
  need(len(score_rows)==c["runners"] and len(fields)==c["races"] and sha(compact(score_rows))==pr["local_track_score_hash"]==c["local_track_score_hash"] and pr["max_canonical_delta_pp"]<1e-9,"independent shared source/identity parity")
  seq=[];seen=set()
  for nm,start,end,unit in c["menu"]:
   need((nm,start,end,unit) not in seen and end-start+1 in (3,4,5,6) and isinstance(unit,int) and unit>0 and all(str(n) in fields for n in range(start,end+1)),"wager menu invalid")
   seen.add((nm,start,end,unit));raceids=list(range(start,end+1))
   seq.append(dict(name=nm,start_race=start,end_race=end,play_status="PASS",hit_rate_display="0.0%",tickets=[dict(role="BEST_POSSIBLE",title="Rail & Rye Ticket",unit_cents=unit,combinations=1,total_cents=unit,hit_rate_display="0.0%",legs=[],notes="")],race_fields=[dict(race_number=n,programs=list(fields[str(n)])) for n in raceids],review_probabilities={str(n):fields[str(n)] for n in raceids}))
  need(set(str(f["race_number"]) for z in seq for f in z["race_fields"])==set(fields) and set(c["times"])==set(fields),"complete race and post inventory")
  canonical=dict(kind="APPROVED_PROJECTION_SNAPSHOT_V1",key="projections/dashboard/"+D+"/"+slug+".json",sha256=sha(cb),tri_sha256=mr["tri_sha256"],f4_sha256=mr["f4_sha256"],source_archive_sha256=SOURCE)
  card=dict(schema_version=1,product_type="pick_tickets",date=D,track=name,revision=1,status="initial_current",publication_mode="owner-approved-gpt",source_input_sha256=canonical["sha256"],formula_version="V3.4-TRI-ONLY-LENGTH-SENSITIVE-TRIAL-A",post_times_by_race=c["times"],model_receipts={k:mr[k] for k in ("tri_sha256","f4_sha256")},source_receipt={"reference":"NOV28-CANONICAL-PRESCRATCH","sha256":mr["f4_sha256"]},sequences=seq)
  rows.append(dict(races=c["races"],runners=c["runners"],proof=proof,receipt=rr,card=card,runner_pwin=runner_pwin,conditional_exclusions=exclusions,canonical_source=canonical))
  expected[name]=c["expected_ticket_sha256"]
  counts=[counts[0]+1,counts[1]+c["races"],counts[2]+c["listed"],counts[3]+c["runners"],counts[4]+proof["trainer_jockey_roles_proven"],counts[5]+len(ro["conditional_roster"])]
  k="racing-intelligence/product-tabs/pick-tickets/"+D+"/"+slug+".json"; old,_=get(k,True);customer_before[k]=None if old is None else sha(old)
 need(counts==ctrl["source_counts"] and sum(len(r["card"]["sequences"]) for r in rows)==158,"whole-slate inventory")
 batch=dict(schema_version=1,product_type="pick_tickets_scheduled_stage",prescratch=True,revision=1,date=D,release_at=DUE,source_archive_sha256=SOURCE,tracks=rows)
 tmp=Path("/tmp/rr-pick-1128-stage.json"); tmp.write_bytes(compact({"batch":batch,"expected":expected}))
 js="""import fs from 'node:fs';import {createHash,webcrypto} from 'node:crypto';import {chooseV34} from './src/pick-tickets-v34.js';import {sequenceQuality} from './src/pick-tickets-sqr.js';import {validateStagedPickBatch,prepareScheduledPickStages} from './src/pick-tickets-staging.js';import {requiresFinalPickField} from './src/pick-final-field-gate.js';globalThis.crypto??=webcrypto;const need=(v,m)=>{if(!v)throw Error(m)},sha=x=>createHash('sha256').update(x).digest('hex');const {batch,expected}=JSON.parse(fs.readFileSync('/tmp/rr-pick-1128-stage.json'));for(const row of batch.tracks){const c=row.card;for(const s of c.sequences){const legs=s.race_fields.map(f=>({race_number:f.race_number,entries:f.programs.map(program_number=>({program_number,pwin:s.review_probabilities[String(f.race_number)][program_number]/100}))}));const t=s.tickets[0],x=chooseV34(legs,t.unit_cents),q=sequenceQuality(legs,x);s.play_status=q.classification;t.legs=x.picks.map((programs,i)=>({race_number:legs[i].race_number,programs}));t.combinations=x.combinations;t.total_cents=x.total_cents;t.hit_rate_display=s.hit_rate_display=(100*x.hit_probability).toFixed(1)+'%';s.race_fields=s.race_fields.map(f=>({race_number:f.race_number,programs:[...f.programs].sort((a,b)=>s.review_probabilities[String(f.race_number)][b]-s.review_probabilities[String(f.race_number)][a]||a.localeCompare(b))}));}const sig=JSON.stringify(c.sequences.map(s=>[s.name,s.start_race,s.end_race,s.play_status,s.tickets[0].unit_cents,s.tickets[0].combinations,s.tickets[0].total_cents,s.tickets[0].hit_rate_display,s.tickets[0].legs.map(l=>[l.race_number,l.programs])]));need(sha(sig)===expected[c.track],'Authorized baseline signature mismatch '+c.track)}const cards=validateStagedPickBatch(batch);need(cards.length===12&&cards.reduce((a,c)=>a+c.sequences.length,0)===158,'locked stage validation');const raw=JSON.stringify(batch),key='pick-tickets/staging/'+batch.date+'/revision-0001.json';let writes=0;const env={STORE_DB:{},CARDS_BUCKET:{get:async k=>k===key?{customMetadata:{stage_only:'true',sha256:sha(raw)},text:async()=>raw}:null,put:async()=>{writes++;throw Error('unexpected customer write')}}};need(requiresFinalPickField(batch.date),'final-field gate missing');let result=await prepareScheduledPickStages(env,Date.UTC(2026,10,28,2));need(result.prepared===0&&writes===0,'prescratch became customer-visible');fs.writeFileSync('/tmp/rr-pick-1128-stage.json',raw);"""
 run=subprocess.run(["node","--input-type=module","-e",js],capture_output=True)
 if run.returncode: raise RuntimeError("locked constructor/private stage gate failed: "+run.stderr.decode(errors="replace")[:650])
 raw=tmp.read_bytes();need(datetime.now(timezone.utc)<datetime.fromisoformat(DUE.replace("Z","+00:00")),"cutoff passed")
 put(PREFIX+"revision-0001.json",raw)
 for k,v in customer_before.items():
  old,_=get(k,True);need((None if old is None else sha(old))==v,"customer object unexpectedly changed")
 qa=compact(dict(status="VERIFIED_PRIVATE_STAGE_NOT_CUSTOMER_RELEASE",date=D,release_at=DUE,source_sha256=SOURCE,canonical_manifest_sha256=MAN,stage_sha256=sha(raw),tracks=12,races=113,listed=1020,active=981,roles=1962,conditional_exclusions=39,sequences=158,final_field_gate_required=True,customer_writes=0,baseline_ticket_signatures_verified=12,verified_at=datetime.now(timezone.utc).isoformat()))
 old,om=get(PREFIX+"private-verified-0001.json",True)
 if old is None: put(PREFIX+"private-verified-0001.json",qa)
 else: need(json.loads(old)["stage_sha256"]==sha(raw) and om.get("sha256")==sha(old),"private QA receipt conflict")
 print("PICK_1128_PRIVATE_STAGE_VERIFIED tracks=12 races=113 active=981 sequences=158 customer_writes=0 final_field_required=true sha256="+sha(raw),flush=True)
 tmp.unlink(missing_ok=True)
if __name__=="__main__":
 try: main()
 except Exception as e: raise SystemExit("PICK_1128_PRIVATE_STAGE_HOLD "+type(e).__name__+": "+str(e)[:800])

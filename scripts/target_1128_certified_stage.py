"""Receipt-bound November 28 Target List release. No plaintext data on GitHub."""
import base64,hashlib,io,json,os,re,subprocess,unicodedata,zipfile,zlib,math
from pathlib import Path
from datetime import datetime,timezone
from nacl.public import SealedBox
from target_list_private_review_bridge import private_key
import boto3
from botocore.exceptions import ClientError
D="2026-11-28";DUE=D+"T08:00:00Z";B="rail-and-rye-private-cards"
SRC="d8d4fed7fe0c4dc7ed90687e8c5d11a5419c057c4717f5e064bb61a25e217780"
MAN="d719927d604a9f6eb9a9644b29121ed11fc02bb35ffba25f602c5939adfb4cd8"
PROOF="5b18c7ecfae0526a8560ad2ca6d172f0eee55cbcfed5d8477ece9c04daecffbc"
ZIP="72ea4c59f8bf931bc0b72555343a70ecb216fddd324307c2ddee2f466b8a4ac5"
CIPHER="2d052c562c7f52314207d42c75f27099a0c4a4ea1193891b61a247e0509d65ea"
REVIEW="7edae9860a266c736d91eae59578099ad82ad6837740a08f664117bd5bbc6d03"
FROZEN="bd8c38de63a4c6d055f654347e7eaabe9c7fdbedfd3ea75885b20b46a163158b"
P="intelligence/target-list/staging/"+D+"/"
def need(v,m):
 if not v:raise ValueError(m)
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def norm(x):return re.sub(r"[^a-z0-9]+"," ","".join(c for c in unicodedata.normalize("NFKD",str(x)).lower() if not unicodedata.combining(c))).strip()
def hnorm(x):return norm(re.sub(r"\s*\([A-Z]{2,4}\)$","",str(x)))
def h64(x):return isinstance(x,str) and re.fullmatch("[a-f0-9]{64}",x)
def main():
 need(os.environ["GITHUB_REPOSITORY"]=="scottjazdzewski/rail-and-rye-website","Wrong repository")
 need(datetime.now(timezone.utc)<datetime.fromisoformat(DUE.replace("Z","+00:00")),"Release cutoff passed")
 rawzip=base64.b64decode(Path("private-ingest/20261128/target-v41-proof.zip.b64").read_bytes(),validate=True)
 need(sha(rawzip)==ZIP,"Receipt ZIP changed")
 with zipfile.ZipFile(io.BytesIO(rawzip)) as z:
  need(z.namelist()==["target-1128-certified-proof.enc"],"Unexpected receipt archive contents")
  enc=z.read(z.namelist()[0])
 need(sha(enc)==CIPHER,"Sealed proof changed")
 dec=zlib.decompressobj();raw=dec.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),300001)
 need(dec.eof and not dec.unused_data and len(raw)<=300000 and sha(raw)==PROOF,"Receipt packet changed")
 p=json.loads(raw);need(p["date"]==D and p["release_at"]==DUE and p["source_sha256"]==SRC and p["manifest_sha256"]==MAN and p["counts"]==[12,113,1020,981,1962,39,18],"Proof identity")
 s=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 def get(k):
  try:
   v=s.get_object(Bucket=B,Key=k);return v["Body"].read(),v.get("Metadata",{})
  except ClientError as e:
   if e.response.get("Error",{}).get("Code") in ("404","NoSuchKey","NotFound"):return None,{}
   raise
 def put(k,b,extra=None):
  m={"stage_only":"true","sha256":sha(b),"release_at":DUE,"source_sha256":SRC,**(extra or {})}
  old,om=get(k);need(old is None or (old==b and om.get("sha256")==sha(b) and om.get("release_at")==DUE),"Conflicting immutable release object "+k)
  if old is None:s.put_object(Bucket=B,Key=k,Body=b,ContentType="application/json",CacheControl="private,no-store",Metadata=m,IfNoneMatch="*")
  v,vm=get(k);need(v==b and vm.get("sha256")==sha(b) and vm.get("release_at")==DUE,"Private readback "+k)
 rev,rm=get(P+"canonical-review-0001.json");need(rev and sha(rev)==REVIEW and rm.get("sha256")==REVIEW and rm.get("customer_publish_approved")=="false","Prior approved editorial review changed")
 q=json.loads(rev);need(q["race_date"]==D and q["source_zip_sha256"]==SRC and q["source_manifest_sha256"]==MAN and q["editorial_sha256"]==p["editorial_sha256"] and len(q["targets"])==len(q["selected_race_full_fields"])==len(q["customer_edition"]["targets"])==18,"Editorial source mismatch")
 mb,mm=get("projections/qa/"+D+"/staged-release.json");need(mb and sha(mb)==MAN,"Canonical manifest changed")
 m=json.loads(mb);need(m["source_sha256"]==SRC and m["release_at"]==DUE and m["status"]=="VERIFIED_STAGED" and m["scope"]=="VERIFIED_COMPLETE_SLATE" and len(m["tracks"])==12,"Canonical identity")
 incoming={r["slug"]:r for r in p["receipts"]};need(len(incoming)==len(p["receipts"])==12 and set(incoming)=={x["slug"] for x in m["tracks"]},"Receipt coverage")
 receipts=[];exclusions=[];site={};totals=[0,0,0,0];neutral={"trainer":0,"jockey":0};recover={"trainer":0,"jockey":0}
 means={"trainer":{"rating":0.6322408654376862,"rating_known":0.9811237443426427},"jockey":{"rating":0.6372187879456893,"rating_known":0.9657246936747985}}
 for t in m["tracks"]:
  pr=incoming[t["slug"]];rbytes=pr["receipt_raw"].encode();need(sha(rbytes)==pr["receipt_sha256"],"Raw receipt checksum")
  r=json.loads(rbytes);role=r["permanent_tj_v4_role_proof"];gate=r["rating_resolution_gate"]
  need(r["status"]=="PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME" and r["frozen_runtime_archive_sha256"]==FROZEN and r["official_input_gate"] is True and r["permanent_v4_both_roles_before_pwin"] is True and r["permanent_tj_v4_policy_id"]=="TRI_TJ_NEUTRAL_MEAN_V4_ALWAYS_ON" and role["all_roles_complete"] is True and role["exact_consumed_model_matrix_verified"] is True and not gate["unresolved_fields"] and gate["frozen_feature_means_by_role"]==means,"Actual V4 proof")
  need(r["races"]==pr["races"]==t["races"] and r["starters"]==pr["runners"]==t["runners"]==role["complete_active_runner_count"] and role["trainer_jockey_roles_proven"]==2*t["runners"] and r["max_race_probability_mass_error"]<1e-9,"Active coverage proof")
  need(all(h64(r[k]) for k in ["scored_pwin_output_sha256","scored_79_feature_matrix_sha256","audit_output_sha256","trainer_jockey_model_input_audit_sha256"]) and r["winner_or_result_ledger_used"] is False and r["market_data_used"] is False,"Source scoring hash or leakage")
  cb,cm=get("projections/dashboard/"+D+"/"+t["slug"]+".json");fb,fm=get("projections/f4-ordered/"+D+"/"+t["slug"]+".json")
  need(cb and fb and sha(cb)==t["dashboard_sha256"] and sha(fb)==t["ordered_sha256"] and cm.get("source_sha256")==SRC and cm.get("release_at")==DUE,"Canonical dashboard/F4 changed")
  roster,_=get("projections/qa/"+D+"/conditional-roster/"+t["slug"]+".json");ro=json.loads(roster)
  need(ro["original_pdf_sha256"]==pr["original_pdf_sha256"] and pr["listed"]==t["runners"]+len(ro["conditional_roster"]),"Original source/exclusions differ")
  exclusions.extend([dict(x,track=t["name"]) for x in ro["conditional_roster"]])
  card=json.loads(cb);f4=json.loads(fb);need(card["race_date"]==D and card["track_name"]==pr["track"]==t["name"] and card["projection_status"]=="prescratch" and f4["f4_receipt_sha256"]==card["model_receipts"]["f4_sha256"],"Canonical card identity")
  rows=[]
  for race in card["races"]:
   es=race["entries"];rn=race["race_number"];need(len({str(x["program_number"]) for x in es})==len(es) and abs(sum(x["win_probability_exact"] for x in es)-100)<1e-6,"Canonical mass or programs")
   for x in es:
    v=x["win_probability_exact"]/100
    need(abs(v-x["f4_probabilities"]["exact_p1"])<1e-8,"F4 parity")
    rows.append([rn,str(x["program_number"]),hnorm(x["horse_name"]),norm(x["trainer"]),norm(x["jockey"]),str(x["morning_line"]).replace("-","/"),format(v,".10f")])
   site[(norm(t["name"]),rn)]=es
  rows.sort(key=lambda x:(x[0],x[1]))
  need(len(rows)==t["runners"] and sha(compact(rows))==pr["local_track_score_hash"] and pr["max_canonical_delta_pp"]<1e-9,"Independent actual scorer full-field mismatch")
  receipts.append(dict(track_code=pr["track_code"],track=t["name"],races=r["races"],runners=r["starters"],listed_runners=pr["listed"],pdf_sha256=pr["original_pdf_sha256"],receipt_sha256=pr["receipt_sha256"],score_sha256=r["scored_pwin_output_sha256"],effective_79_sha256=r["scored_79_feature_matrix_sha256"],audit_sha256=r["trainer_jockey_model_input_audit_sha256"],receipt_status=r["status"],max_mass_error=r["max_race_probability_mass_error"],tj_role_receipt={**role,"permanent_tj_v4_policy_id":r["permanent_tj_v4_policy_id"],"permanent_v4_both_roles_before_pwin":r["permanent_v4_both_roles_before_pwin"]}))
  totals=[totals[0]+r["races"],totals[1]+r["starters"],totals[2]+pr["listed"],totals[3]+role["trainer_jockey_roles_proven"]]
  for role_name in neutral:
   neutral[role_name]+=role["neutral_model_mean_roles"][role_name];recover[role_name]+=role["verified_same_scale_recoveries"][role_name]
  print("TARGET_1128_TRACK_V41_PARITY_PASS",t["slug"],r["races"],r["starters"],flush=True)
 need(totals==[113,981,1020,1962] and len(site)==113 and len(exclusions)==39 and len({(norm(x["track"]),x["race"],x["program"]) for x in exclusions})==39,"Whole active slate coverage")
 for field in q["selected_race_full_fields"]:
  rows=site[(norm(field["track"]),field["race"])];a={str(x["program_number"]):x for x in rows};b={str(x["program_number"]):x for x in field["runners"]}
  need(a.keys()==b.keys() and field["field_count"]==len(a),"Selected full field changed")
  for prog,x in b.items():
   y=a[prog];need(all(x[k]==y[k] for k in ("horse_name","trainer","jockey","morning_line","win_probability_exact")),"Selected field mismatch")
 edition=q["customer_edition"];need(edition["targets"]==q["targets"],"Customer editorial changed")
 release=dict(schema_version=1,race_date=D,release_at=DUE,source_zip_sha256=SRC,source_manifest_sha256=MAN,editorial_sha256=q["editorial_sha256"],source_track_count=12,source_race_count=113,source_listed_runners=1020,source_active_runners=981,source_exclusions=exclusions,source_receipts=receipts,raw_v41_proof_sha256=PROOF,selected_race_full_fields=q["selected_race_full_fields"],targets=q["targets"],customer_edition=edition)
 body=compact(release);digest=sha(body)
 # Actual scheduled reader dry run with canonical manifest, absent projection -> deferred.
 js="""import assert from 'node:assert/strict';import {createHash,webcrypto} from 'node:crypto';import {prepareScheduledTargetStages} from './src/target-list-staging.js';import {storeGPTReleasedTargetList,readTargetListEdition} from './src/target-list.js';globalThis.crypto??=webcrypto;let s='';for await(const c of process.stdin)s+=c;let {stage,manifest}=JSON.parse(s),p=JSON.parse(stage),d=p.race_date;const meta={stage_only:'true',release_at:p.release_at,sha256:createHash('sha256').update(stage).digest('hex'),source_sha256:p.source_zip_sha256,editorial_sha256:p.editorial_sha256};const stageKey='intelligence/target-list/staging/'+d+'/revision-0001.json';const map=new Map();let env={STORE_DB:{},CARDS_BUCKET:{get:async k=>k===stageKey?{customMetadata:meta,text:async()=>stage}:k==='projections/qa/'+d+'/staged-release.json'?{text:async()=>manifest}:null}};assert.deepEqual(await prepareScheduledTargetStages(env,Date.UTC(2026,10,28,2)),{prepared:0,deferred:1});const negative=JSON.parse(stage);negative.source_active_runners++;let changed=JSON.stringify(negative);let badMeta={...meta,sha256:createHash('sha256').update(changed).digest('hex')};let bad={STORE_DB:{},CARDS_BUCKET:{get:async k=>k===stageKey?{customMetadata:badMeta,text:async()=>changed}:k==='projections/qa/'+d+'/staged-release.json'?{text:async()=>manifest}:null}};await assert.rejects(()=>prepareScheduledTargetStages(bad,Date.UTC(2026,10,28,2)),/roster|receipt|proof|mismatch/i);const ev={CARDS_BUCKET:{list:async()=>({objects:[],truncated:false}),get:async k=>map.get(k)||null,put:async(k,raw,opt)=>map.set(k,{customMetadata:opt.customMetadata,text:async()=>raw})}};let result=await storeGPTReleasedTargetList(ev,p.customer_edition);assert.equal(result.targets,p.targets.length);assert.equal((await readTargetListEdition(ev,d)).targets.length,p.targets.length);"""
 run=subprocess.run(["node","--input-type=module","-e",js],input=compact({"stage":body.decode(),"manifest":mb.decode()}),capture_output=True)
 need(run.returncode==0,"Actual scheduled worker/reader validation failed")
 need(datetime.now(timezone.utc)<datetime.fromisoformat(DUE.replace("Z","+00:00")),"Release cutoff passed")
 put(P+"source-v41-receipts-0001.json",raw,{"customer_publish_approved":"false","editorial_sha256":q["editorial_sha256"]})
 put(P+"revision-0001.json",body,{"editorial_sha256":q["editorial_sha256"]})
 qa=compact(dict(status="STAGED_PRIVATE_READBACK_VERIFIED",race_date=D,release_at=DUE,source_sha256=SRC,source_manifest_sha256=MAN,source_track_count=12,source_race_count=113,source_listed_runners=1020,source_active_runners=981,source_exclusions=39,roles=1962,neutral_roles=neutral,recovered_roles=recover,selected_races=len(q["targets"]),stage_sha256=digest,raw_v41_proof_sha256=PROOF,editorial_sha256=q["editorial_sha256"]))
 put(P+"qa-0001.json",qa)
 print("TARGET_1128_STAGE_PASS tracks=12 races=113 listed=1020 active=981 roles=1962 neutral="+str(neutral)+" recovered="+str(recover)+" targets="+str(len(q["targets"]))+" release="+DUE+" sha="+digest,flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("TARGET_1128_CERTIFIED_STAGE_HOLD "+type(e).__name__+": "+str(e)[:220])

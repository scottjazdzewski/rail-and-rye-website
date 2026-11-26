"""Dated Churchill scratch gate. Never prints private data or modifies the accepted stage."""
import base64, hashlib, json, os, re, zlib, subprocess, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path
from nacl.public import SealedBox
from pick_private_score_bridge import private_key, BUCKET, REPO, OWNER, ISSUE
import boto3
from botocore.exceptions import ClientError
DATE="2026-11-26"
ROOT=f"pick-tickets/staging/{DATE}/"
CUSTOMER=f"racing-intelligence/product-tabs/pick-tickets/{DATE}/"
PROJECTION=f"projections/dashboard/{DATE}/churchill-downs.json"
KEY=CUSTOMER+"churchill-downs.json"
PARENT="93c7c84ab1f40496d5101f6f1b7f3a7129b21c6bb26d7944011e73c67d24af05"
EXPECTED="b005e4e450d839b01b979c4ddb6c62f3aa4e6251ba37dc1cf91d4f7070040dab"
PREFIX="RR_PICK_SCRATCH_1126_CD_R3"
SOURCE="20a001e4bbf88afb2701d6408e2cbfae63abb508cf18661d484e74d7f8ab0fc7"
def req(x,m):
 if not x:raise ValueError(m)
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def main():
 req(os.environ["GITHUB_REPOSITORY"]==REPO,"Wrong repository")
 s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
 def get(k,optional=False):
  try:
   o=s.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o
  except ClientError as e:
   if optional and e.response.get("Error",{}).get("Code") in ("NoSuchKey","404","NotFound"):return None,None
   raise
 def immutable(k,b):
  old,_=get(k,True)
  if old is None:s.put_object(Bucket=BUCKET,Key=k,Body=b,ContentType="application/json",CacheControl="private,no-store",Metadata={"sha256":sha(b)},IfNoneMatch="*")
  else:req(old==b,"Immutable archive collision")
  req(get(k)[0]==b,"Archive readback mismatch")
 def catalog():
  request=urllib.request.Request("https://railandryeracing.com/api/products?qa=pick-nov26-live",headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
  with urllib.request.urlopen(request,timeout=20) as response:products=json.load(response)["products"]
  rows=products+[i for p in products for i in p.get("included_products",[])]
  tracks={p.get("track") for p in rows if p.get("category")=="Pick Tickets" and p.get("race_date")==DATE and p.get("track")}
  print("NOV26_LIVE_PICK_CATALOG",sorted(tracks),flush=True)
  return tracks
 parent,pm=get(ROOT+"revision-0001.json")
 req(sha(parent)==PARENT and pm["Metadata"].get("sha256")==PARENT,"Stage parent mismatch")
 original=json.loads(parent);req(original["source_archive_sha256"]==SOURCE,"Source archive mismatch")
 prepared=json.loads(get(ROOT+"prepared-0001.json")[0])
 req(prepared["sha256"]==PARENT and len(prepared["tracks"])==6 and sum(t["sequence_count"] for t in prepared["tracks"])==78,"Prepared receipt mismatch")
 original_cd=next(t for t in original["tracks"] if t["card"]["track"]=="Churchill Downs")
 b,o=get(KEY);current=json.loads(b);req(o["Metadata"].get("customer_publish_approved")=="true","Customer parent not approved")
 pb,po=get(PROJECTION);projection=json.loads(pb)
 req(projection["race_date"]==DATE and projection["track_name"]=="Churchill Downs","Projection identity mismatch")
 ev=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text());c=ev.get("comment",{})
 req(ev.get("repository",{}).get("full_name")==REPO and ev.get("issue",{}).get("number")==ISSUE and c.get("user",{}).get("login")==OWNER,"Unauthorized")
 body=c.get("body","");req(body.startswith(PREFIX+"\n"),"Wrong transfer prefix")
 enc=body[len(PREFIX)+1:].strip();req(len(enc)<65000 and re.fullmatch(r"[A-Za-z0-9+/=]+",enc),"Invalid sealed transfer")
 z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),200001)
 req(z.eof and not z.unused_data and len(raw)<=200000 and sha(raw)==EXPECTED,"Exact candidate SHA mismatch")
 batch=json.loads(raw);req(batch["date"]==DATE and batch["revision"]==3 and batch["source_archive_sha256"]==SOURCE and batch["prescratch"] is False and len(batch["tracks"])==1,"Wrong revision")
 row=batch["tracks"][0];card=row["card"];rec=row["receipt"];proof=row["proof"]
 req(card["track"]=="Churchill Downs" and card["revision"]==3 and card["date"]==DATE and card["status"]=="scratch_updated" and card["scratch_verified_at"]=="2026-11-26T17:42:00Z" and card["formula_version"]=="V3.4-TRI-ONLY-LENGTH-SENSITIVE-TRIAL-A","Wrong customer identity")
 req(row["runners"]==91 and row["races"]==12 and len(card["sequences"])==19 and row.get("conditional_exclusions")=={"8":["13","16"]},"Wrong runner inventory")
 req(rec["tri_status"]=="PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME" and rec["f4_status"]=="PASS" and rec["scratch_state"]=="SCRATCH_FINAL" and rec["unresolved_fields"]==0 and rec["f4_p1_equals_tri"] is True and proof["all_roles_complete"] is True and proof["exact_consumed_model_matrix_verified"] is True and proof["trainer_jockey_roles_proven"]==182 and proof["complete_active_runner_count"]==91,"Scorer proof gate")
 req(rec["tri_sha256"]=="013d08f565e8140ecbaf14173ae4d6b5a0a1c8193ea1449a392ea7cdb6c2b242" and rec["f4_sha256"]=="1c29f905e0d3be971a133ccfb5c27cd9b40c0a41e581ad42df1d45de8c1cb88e" and rec["pwin_sha256"]=="6d159cf9b0d3332483a93d9e1c74f14dec2fc5d3a83522b382a6f7e291fb647e" and rec["source_pdf_sha256"]==original_cd["receipt"]["source_pdf_sha256"] and original_cd["receipt"]["f4_sha256"]=="ccd175f12a4ccc5f2f71ea0798d01ecfb9dd13920d44bfdd6304614835469455","Receipt lineage")
 req(card["source_input_sha256"]==rec["pwin_sha256"] and card["model_receipts"]=={"tri_sha256":rec["tri_sha256"],"f4_sha256":rec["f4_sha256"]},"Customer receipt binding")
 req(row["market_source_state"]["change_kind"]=="JOCKEY_AND_SURFACE_CHANGES" and "market_assistance" not in row,"Unsupported market inputs must use exact fallback")
 # Verify the exact already-published R2 and its private source before accepting R3.
 prior_hash="8c1395659223f98ff74dc8e3eea4732ab81f596f9766b69c29ebf2671dfb80c5"
 prior_customer="afc650721ba54aabaaf22306b69611adc1c10fcdb213ab6cf301d8be21e24b41"
 prior_raw,prior_obj=get(f"pick-tickets/scratch-revisions/{DATE}/churchill-downs/r2-source-"+prior_hash+".json")
 req(sha(prior_raw)==prior_hash and prior_obj["Metadata"].get("sha256")==prior_hash,"R2 candidate source mismatch")
 prior_batch=json.loads(prior_raw);prior=prior_batch["tracks"][0]
 req(prior_batch["revision"]==2 and prior_batch["date"]==DATE and prior_batch["source_archive_sha256"]==SOURCE and len(prior_batch["tracks"])==1 and prior["card"]["track"]=="Churchill Downs" and prior["runners"]==92,"Invalid R2 source")
 req(current["status"]=="scratch_updated" and current["revision"]==2 and sha(b)==prior_customer and o["Metadata"].get("content_sha256")==prior_customer and current["source_input_sha256"]==prior["receipt"]["pwin_sha256"],"Current customer is not the exact approved R2")
 req(rec["parent_f4_sha256"]==original_cd["receipt"]["f4_sha256"] and rec["derived_scoring_pdf_sha256"]=="63c46e51ee6798418930ac630d410ac68bdbe598327abc120b42d70d01ccaf13" and rec["official_changes_sha256"]=="12f32e09c8f7c0e7b5809bc0dd08b0f87cdaa45fa2d5b17c2580b034a10cda5e","Cumulative source lineage")
 source_change=row["source_change"]
 req(source_change["parent_candidate_sha256"]==prior_hash and source_change["parent_customer_sha256"]==prior_customer and source_change["prior_f4_sha256"]==prior["receipt"]["f4_sha256"] and source_change["original_pdf_sha256"]==rec["source_pdf_sha256"] and source_change["derived_scoring_pdf_sha256"]==rec["derived_scoring_pdf_sha256"],"R2/R3 source linkage")
 Path("/tmp/rr-pick-1126-cd-r3-input.json").write_bytes(compact({"parent":prior,"current":current,"batch":batch}))
 subprocess.run(["node","scripts/validate_pick_scratch_1126_cd_r3.mjs"],check=True)
 # User authorized this dated release. Require exact final parity or exact older R2
 # scratch-final Race Cards snapshot. No mixed or unverified field is accepted.
 req(po["Metadata"].get("customer_publish_approved")=="true" and projection["projection_status"]=="scratch_final","Race Cards not scratch-final approved")
 by={str(r["race_number"]):{str(e["program_number"]):e for e in r["entries"]} for r in projection["races"]}
 def compare(rows):
  if set(by)!=set(rows):return None
  maxdiff=0.
  for race,rs in rows.items():
   if set(by[race])!={x[0] for x in rs}:return None
   for x in rs:
    e=by[race][x[0]]
    if e["horse_name"]!=x[1]:return None
    maxdiff=max(maxdiff,abs(e["win_probability_exact"]-100*x[2]))
  return maxdiff if maxdiff<1e-7 else None
 parity_status="VERIFIED_SCRATCH_FINAL"
 maxdiff=compare(row["runner_pwin"])
 if maxdiff is None:
  maxdiff=compare(prior["runner_pwin"])
  req(maxdiff is not None,"Race Card parity differs from both verified R2 and R3")
  stamp=projection.get("official_snapshot_utc")
  req(stamp and datetime.fromisoformat(stamp.replace("Z","+00:00"))<datetime.fromisoformat(card["scratch_verified_at"].replace("Z","+00:00")),"Earlier R2 Race Card timestamp not proven")
  parity_status="OWNER_AUTHORIZED_RELEASE_AHEAD_OF_EXACT_R2_RACE_CARDS"
 print("NOV26_CD_R3_PARITY_STATUS",parity_status,"compared_snapshot_max_diff_pp",maxdiff,flush=True)
 # The prepared marker records the actual D1 published product ID and release.
 # Verify that registration even if the public HTTP readback is temporarily unavailable.
 q=next(t for t in prepared["tracks"] if t["track"]=="Churchill Downs")
 req(prepared["date"]==DATE and prepared["release_at"]=="2026-11-26T08:00:00Z" and q["product_id"] and q["sequence_count"]==19 and q["release_at"]=="2026-11-26 08:00:00" and datetime.now(timezone.utc)>=datetime.fromisoformat(prepared["release_at"].replace("Z","+00:00")),"Catalog registration receipt mismatch")
 def check_catalog():
  try:
   req("Churchill Downs" in catalog(),"Live catalog entry missing")
   return "VERIFIED_PUBLIC"
  except (TimeoutError,urllib.error.URLError) as exc:
   print("NOV26_CD_R3_CATALOG_HTTP_UNAVAILABLE",type(exc).__name__,"D1 registration receipt verified",flush=True)
   return "REGISTERED_PUBLIC_HTTP_UNVERIFIED"
 catalog_status=check_catalog()
 new=Path("/tmp/rr-pick-1126-cd-r3-output.json").read_bytes()
 req(get(KEY)[0]==b and get(PROJECTION)[0]==pb,"Concurrent source update")
 audit=f"pick-tickets/scratch-revisions/{DATE}/churchill-downs/"
 immutable(audit+"r3-source-"+sha(raw)+".json",raw)
 immutable(audit+"parent-"+sha(b)+".json",b)
 meta=dict(o["Metadata"]);meta.update(revision="3",content_sha256=sha(new),source_sha256=rec["pwin_sha256"],publication_mode="owner-approved-gpt",customer_publish_approved="true",published_at=datetime.now(timezone.utc).isoformat())
 s.put_object(Bucket=BUCKET,Key=KEY,Body=new,ContentType="application/json",CacheControl="private,no-store",Metadata=meta,IfMatch=o["ETag"])
 got,go=get(KEY);req(got==new and go["Metadata"]["content_sha256"]==sha(new),"Customer readback mismatch")
 receipt=compact({"date":DATE,"track":"Churchill Downs","revision":3,"races":12,"runners":91,"sequences":19,"candidate_sha256":sha(raw),"customer_sha256":sha(new),"race_card_sha256":sha(pb),"parity_status":parity_status,"compared_snapshot_max_diff_pp":maxdiff,"max_pwin_delta_pp":maxdiff if parity_status=="VERIFIED_SCRATCH_FINAL" else None,"catalog_status_before_write":catalog_status,"published_at":meta["published_at"]})
 immutable(audit+"receipt-"+sha(receipt)+".json",receipt)
 print("NOV26_CD_R3_PICK_CUSTOMER_READBACK_PASS",receipt.decode(),flush=True)
 print("NOV26_CD_R3_POST_PUBLICATION_CATALOG",check_catalog(),flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("NOV26_CD_R3_PICK_HOLD "+type(e).__name__+": "+str(e)[:180])

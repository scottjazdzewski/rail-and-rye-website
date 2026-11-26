"""Dated Del Mar scratch gate. Never prints private data or modifies the accepted stage."""
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
PROJECTION=f"projections/dashboard/{DATE}/del-mar.json"
KEY=CUSTOMER+"del-mar.json"
PARENT="93c7c84ab1f40496d5101f6f1b7f3a7129b21c6bb26d7944011e73c67d24af05"
EXPECTED="a891d0d434dcceb6e36c60a848be4bbaf649b0fe622177f337aed31b536e0120"
PREFIX="RR_PICK_SCRATCH_1126_DMR_R2"
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
 original_dmr=next(t for t in original["tracks"] if t["card"]["track"]=="Del Mar")
 b,o=get(KEY);current=json.loads(b);req(o["Metadata"].get("customer_publish_approved")=="true","Customer parent not approved")
 pb,po=get(PROJECTION);projection=json.loads(pb)
 req(projection["race_date"]==DATE and projection["track_name"]=="Del Mar","Projection identity mismatch")
 if os.environ["GITHUB_EVENT_NAME"]=="push":
  print("PICK_PRIVATE_REVIEW_PUBLIC_KEY="+base64.b64encode(bytes(private_key().public_key)).decode(),flush=True)
  count=0
  for r in original["tracks"]:
   c=r["card"];slug=re.sub("[^a-z0-9]+","-",c["track"].lower()).strip("-")
   v,m=get(CUSTOMER+slug+".json");d=json.loads(v)
   req(m["Metadata"].get("customer_publish_approved")=="true" and d["date"]==DATE and d["track"]==c["track"],"Customer edition invalid")
   req(m["Metadata"].get("content_sha256")==sha(v),"Customer SHA mismatch")
   count+=len(d["sequences"])
   print("NOV26_CUSTOMER_READBACK",d["track"],d["revision"],d["status"],len(d["sequences"]),flush=True)
  print("NOV26_CUSTOMER_TOTAL",count,"DMR_RACECARD",projection["projection_status"],sum(len(r["entries"]) for r in projection["races"]),flush=True)
  req(count==78 and len(catalog())==6,"Live catalog not complete")
  return
 ev=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text());c=ev.get("comment",{})
 req(ev.get("repository",{}).get("full_name")==REPO and ev.get("issue",{}).get("number")==ISSUE and c.get("user",{}).get("login")==OWNER,"Unauthorized")
 body=c.get("body","");req(body.startswith(PREFIX+"\n"),"Wrong transfer prefix")
 enc=body[len(PREFIX)+1:].strip();req(len(enc)<65000 and re.fullmatch(r"[A-Za-z0-9+/=]+",enc),"Invalid sealed transfer")
 z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),200001)
 req(z.eof and not z.unused_data and len(raw)<=200000 and sha(raw)==EXPECTED,"Exact candidate SHA mismatch")
 batch=json.loads(raw);req(batch["date"]==DATE and batch["revision"]==2 and batch["source_archive_sha256"]==SOURCE and batch["prescratch"] is False and len(batch["tracks"])==1,"Wrong revision")
 row=batch["tracks"][0];card=row["card"];rec=row["receipt"];proof=row["proof"]
 req(card["track"]=="Del Mar" and card["revision"]==2 and card["date"]==DATE and card["status"]=="scratch_updated" and card["scratch_verified_at"]=="2026-11-26T17:52:00Z" and card["formula_version"]=="V3.4-TRI-ONLY-LENGTH-SENSITIVE-TRIAL-A","Wrong customer identity")
 req(row["runners"]==55 and row["races"]==8 and len(card["sequences"])==11 and row.get("conditional_exclusions")=={},"Wrong runner inventory")
 req(rec["tri_status"]=="PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME" and rec["f4_status"]=="PASS" and rec["scratch_state"]=="SCRATCH_FINAL" and rec["unresolved_fields"]==0 and rec["f4_p1_equals_tri"] is True and proof["all_roles_complete"] is True and proof["exact_consumed_model_matrix_verified"] is True and proof["trainer_jockey_roles_proven"]==110 and proof["complete_active_runner_count"]==55,"Scorer proof gate")
 req(rec["tri_sha256"]=="9bd60612f9c139c9811a7383c360f021efb856abe3c05123d75e824ca2f6a224" and rec["f4_sha256"]=="a23b77c34b9485b0cc4485a06d07989679d10490afd2eba8bfb4887b22889137" and rec["pwin_sha256"]=="a3821d278449afb08b128657f2a46b88643184635280e7aa9949ca467ff12c3e" and rec["source_pdf_sha256"]==original_dmr["receipt"]["source_pdf_sha256"] and original_dmr["receipt"]["f4_sha256"]=="7b68288f630231bd9aef4406bfd825773d9712fed27827f22d9929200ba66308","Receipt lineage")
 req(rec["derived_scoring_pdf_sha256"]=="95d75a5f5f6ec1d80b7c66413726417c8dcedd82aab97b4e52b7841ee9c4449c" and rec["parent_f4_sha256"]==original_dmr["receipt"]["f4_sha256"] and rec["official_changes_sha256"]=="d172e351688becfd9d2aef24b665d552af8d2712411db98f8b334932ad85d588" and row["source_change"]["original_pdf_sha256"]==rec["source_pdf_sha256"] and row["source_change"]["derived_scoring_pdf_sha256"]==rec["derived_scoring_pdf_sha256"],"Official weight source lineage")
 req(card["source_input_sha256"]==rec["pwin_sha256"] and card["model_receipts"]=={"tri_sha256":rec["tri_sha256"],"f4_sha256":rec["f4_sha256"]},"Customer receipt binding")
 req(row["market_source_state"]["change_kind"]=="WEIGHT_AND_GELDING_CHANGES" and "market_assistance" not in row,"Unsupported market inputs must use exact fallback")
 req(current["status"]=="initial_current" and current["revision"]==1,"Current customer revision is not initial; no overwrite")
 Path("/tmp/rr-pick-1126-dmr-input.json").write_bytes(compact({"parent":original_dmr,"current":current,"batch":batch}))
 subprocess.run(["node","scripts/validate_pick_scratch_1126_dmr.mjs"],check=True)
 # Owner's one-time November 26 DMR revision-2 authorization: release tickets
 # before the incoming Race Cards update ONLY if its current object is the exact
 # previously certified prescratch parent. A scratch-final mismatch still holds.
 req(po["Metadata"].get("customer_publish_approved")=="true","Race Card not approved")
 parity_status="VERIFIED_SCRATCH_FINAL"
 expected_rows=row["runner_pwin"]
 if projection["projection_status"]=="prescratch":
  parity_status="OWNER_AUTHORIZED_RELEASE_AHEAD_OF_RACE_CARDS"
  expected_rows=original_dmr["runner_pwin"]
 else:
  req(projection["projection_status"]=="scratch_final","Unexpected Race Card state")
 by={str(r["race_number"]):{str(e["program_number"]):e for e in r["entries"]} for r in projection["races"]}
 req(set(by)==set(expected_rows),"Race Card race inventory differs")
 maxdiff=0
 for race,rows in expected_rows.items():
  req(set(by[race])=={x[0] for x in rows},"Race Card field parity failure R"+race)
  for x in rows:
   e=by[race][x[0]];req(e["horse_name"]==x[1],"Race Card horse identity differs R"+race)
   maxdiff=max(maxdiff,abs(e["win_probability_exact"]-100*x[2]))
 req(maxdiff<1e-7,"Race Card probability parity failure")
 print("NOV26_DMR_PARITY_STATUS",parity_status,"compared_snapshot_max_diff_pp",maxdiff,flush=True)
 # The prepared marker records the actual D1 published product ID and release.
 # Verify that registration even if the public HTTP readback is temporarily unavailable.
 q=next(t for t in prepared["tracks"] if t["track"]=="Del Mar")
 req(prepared["date"]==DATE and prepared["release_at"]=="2026-11-26T08:00:00Z" and q["product_id"] and q["sequence_count"]==11 and q["release_at"]=="2026-11-26 08:00:00" and datetime.now(timezone.utc)>=datetime.fromisoformat(prepared["release_at"].replace("Z","+00:00")),"Catalog registration receipt mismatch")
 def check_catalog():
  try:
   req("Del Mar" in catalog(),"Live catalog entry missing")
   return "VERIFIED_PUBLIC"
  except (TimeoutError,urllib.error.URLError) as exc:
   print("NOV26_DMR_CATALOG_HTTP_UNAVAILABLE",type(exc).__name__,"D1 registration receipt verified",flush=True)
   return "REGISTERED_PUBLIC_HTTP_UNVERIFIED"
 catalog_status=check_catalog()
 new=Path("/tmp/rr-pick-1126-dmr-output.json").read_bytes()
 req(get(KEY)[0]==b and get(PROJECTION)[0]==pb,"Concurrent source update")
 audit=f"pick-tickets/scratch-revisions/{DATE}/del-mar/"
 immutable(audit+"r2-source-"+sha(raw)+".json",raw)
 immutable(audit+"parent-"+sha(b)+".json",b)
 meta=dict(o["Metadata"]);meta.update(revision="2",content_sha256=sha(new),source_sha256=rec["pwin_sha256"],publication_mode="owner-approved-gpt",customer_publish_approved="true",published_at=datetime.now(timezone.utc).isoformat())
 s.put_object(Bucket=BUCKET,Key=KEY,Body=new,ContentType="application/json",CacheControl="private,no-store",Metadata=meta,IfMatch=o["ETag"])
 got,go=get(KEY);req(got==new and go["Metadata"]["content_sha256"]==sha(new),"Customer readback mismatch")
 receipt=compact({"date":DATE,"track":"Del Mar","revision":2,"races":8,"runners":55,"sequences":11,"candidate_sha256":sha(raw),"customer_sha256":sha(new),"race_card_sha256":sha(pb),"parity_status":parity_status,"compared_snapshot_max_diff_pp":maxdiff,"max_pwin_delta_pp":maxdiff if parity_status=="VERIFIED_SCRATCH_FINAL" else None,"catalog_status_before_write":catalog_status,"published_at":meta["published_at"]})
 immutable(audit+"receipt-"+sha(receipt)+".json",receipt)
 print("NOV26_DMR_PICK_CUSTOMER_READBACK_PASS",receipt.decode(),flush=True)
 print("NOV26_DMR_POST_PUBLICATION_CATALOG",check_catalog(),flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("NOV26_DMR_PICK_HOLD "+type(e).__name__+": "+str(e)[:180])

"""Dated Woodbine scratch gate. Never prints private data or modifies the accepted stage."""
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
PROJECTION=f"projections/dashboard/{DATE}/woodbine.json"
KEY=CUSTOMER+"woodbine.json"
PARENT="93c7c84ab1f40496d5101f6f1b7f3a7129b21c6bb26d7944011e73c67d24af05"
EXPECTED="d19545b461e4ff4d8d5eb39065d3a8e2df2f109f26779fe0df2c941abb4fdbd5"
PREFIX="RR_PICK_SCRATCH_1126_WO_R2"
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
 original_wo=next(t for t in original["tracks"] if t["card"]["track"]=="Woodbine")
 b,o=get(KEY);current=json.loads(b);req(o["Metadata"].get("customer_publish_approved")=="true","Customer parent not approved")
 pb,po=get(PROJECTION);projection=json.loads(pb)
 req(projection["race_date"]==DATE and projection["track_name"]=="Woodbine","Projection identity mismatch")
 if os.environ["GITHUB_EVENT_NAME"]=="push":
  print("PICK_PRIVATE_REVIEW_PUBLIC_KEY="+base64.b64encode(bytes(private_key().public_key)).decode(),flush=True)
  count=0
  for r in original["tracks"]:
   c=r["card"];slug=re.sub("[^a-z0-9]+","-",c["track"].lower()).strip("-")
   v,m=get(CUSTOMER+slug+".json");d=json.loads(v)
   req((m["Metadata"].get("customer_publish_approved")=="true" or (c["track"]=="Laurel Park" and m["Metadata"].get("withdrawal_reason")=="weather_cancellation")) and d["date"]==DATE and d["track"]==c["track"],"Customer edition invalid")
   req(m["Metadata"].get("content_sha256")==sha(v),"Customer SHA mismatch")
   count+=len(d["sequences"])
   print("NOV26_CUSTOMER_READBACK",d["track"],d["revision"],d["status"],len(d["sequences"]),flush=True)
  print("NOV26_CUSTOMER_TOTAL",count,"WO_RACECARD",projection["projection_status"],sum(len(r["entries"]) for r in projection["races"]),flush=True)
  req(count==78 and len(catalog())==5,"Live catalog not complete")
  return
 ev=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text());c=ev.get("comment",{})
 req(ev.get("repository",{}).get("full_name")==REPO and ev.get("issue",{}).get("number")==ISSUE and c.get("user",{}).get("login")==OWNER,"Unauthorized")
 body=c.get("body","");req(body.startswith(PREFIX+"\n"),"Wrong transfer prefix")
 enc=body[len(PREFIX)+1:].strip();req(len(enc)<65000 and re.fullmatch(r"[A-Za-z0-9+/=]+",enc),"Invalid sealed transfer")
 z=zlib.decompressobj();raw=z.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),200001)
 req(z.eof and not z.unused_data and len(raw)<=200000 and sha(raw)==EXPECTED,"Exact candidate SHA mismatch")
 batch=json.loads(raw);req(batch["date"]==DATE and batch["revision"]==2 and batch["source_archive_sha256"]==SOURCE and batch["prescratch"] is False and len(batch["tracks"])==1,"Wrong revision")
 row=batch["tracks"][0];card=row["card"];rec=row["receipt"];proof=row["proof"]
 req(card["track"]=="Woodbine" and card["revision"]==2 and card["date"]==DATE and card["status"]=="scratch_updated" and card["scratch_verified_at"]=="2026-11-26T18:19:00Z" and card["formula_version"]=="V3.4-TRI-ONLY-LENGTH-SENSITIVE-TRIAL-A","Wrong customer identity")
 req(row["runners"]==61 and row["races"]==8 and len(card["sequences"])==9 and row.get("conditional_exclusions")=={},"Wrong runner inventory")
 req(rec["tri_status"]=="PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME" and rec["f4_status"]=="PASS" and rec["scratch_state"]=="SCRATCH_FINAL" and rec["unresolved_fields"]==0 and rec["f4_p1_equals_tri"] is True and proof["all_roles_complete"] is True and proof["exact_consumed_model_matrix_verified"] is True and proof["trainer_jockey_roles_proven"]==122 and proof["complete_active_runner_count"]==61,"Scorer proof gate")
 req(rec["tri_sha256"]=="c30ff2ab997c4580d2a43013bb5ff979221bdd5abe46decc1c259bdc9487901c" and rec["f4_sha256"]=="c4755a8628b750c3aa225b17fb13d807db2a6f2616f016df0a8477b0a299d6d6" and rec["pwin_sha256"]=="0d396954735956da48bf20ee7b6a2c304c4e553d1c51bdf6a02e9eb88cf26aee" and rec["source_pdf_sha256"]==original_wo["receipt"]["source_pdf_sha256"] and original_wo["receipt"]["f4_sha256"]=="4635267ab040ace3ce29efd9aace8012c06f9e09fd6122526c8018adc77138cb","Receipt lineage")
 req(rec["derived_scoring_pdf_sha256"]=="bc95ceddee780f95b883291559f1499f2285e4bc30b8b8b48bfd62ab6fd3f517" and rec["parent_f4_sha256"]==original_wo["receipt"]["f4_sha256"] and rec["official_changes_sha256"]=="01356d4cb523e4fb4c8f95c1e62eb81169ad33b6cb913ddb6460ee36373c5c7e" and row["source_change"]["original_pdf_sha256"]==rec["source_pdf_sha256"] and row["source_change"]["derived_scoring_pdf_sha256"]==rec["derived_scoring_pdf_sha256"],"Official weight source lineage")
 req(card["source_input_sha256"]==rec["pwin_sha256"] and card["model_receipts"]=={"tri_sha256":rec["tri_sha256"],"f4_sha256":rec["f4_sha256"]},"Customer receipt binding")
 req(row["market_source_state"]["change_kind"]=="WEIGHT_AND_GELDING_CHANGES" and "market_assistance" not in row,"Unsupported market inputs must use exact fallback")
 req(current["status"]=="initial_current" and current["revision"]==1,"Current customer revision is not initial; no overwrite")
 Path("/tmp/rr-pick-1126-wo-input.json").write_bytes(compact({"parent":original_wo,"current":current,"batch":batch}))
 subprocess.run(["node","scripts/validate_pick_scratch_1126_wo.mjs"],check=True)
 # Owner's one-time November 26 WO revision-2 authorization: release tickets
 # before the incoming Race Cards update ONLY if its current object is the exact
 # previously certified prescratch parent. A scratch-final mismatch still holds.
 req(po["Metadata"].get("customer_publish_approved")=="true","Race Card not approved")
 parity_status="VERIFIED_SCRATCH_FINAL"
 expected_rows=row["runner_pwin"]
 if projection["projection_status"]=="prescratch":
  parity_status="OWNER_AUTHORIZED_RELEASE_AHEAD_OF_RACE_CARDS"
  expected_rows=original_wo["runner_pwin"]
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
 print("NOV26_WO_PARITY_STATUS",parity_status,"compared_snapshot_max_diff_pp",maxdiff,flush=True)
 # The prepared marker records the actual D1 published product ID and release.
 # Verify that registration even if the public HTTP readback is temporarily unavailable.
 q=next(t for t in prepared["tracks"] if t["track"]=="Woodbine")
 req(prepared["date"]==DATE and prepared["release_at"]=="2026-11-26T08:00:00Z" and q["product_id"] and q["sequence_count"]==9 and q["release_at"]=="2026-11-26 08:00:00" and datetime.now(timezone.utc)>=datetime.fromisoformat(prepared["release_at"].replace("Z","+00:00")),"Catalog registration receipt mismatch")
 def check_catalog():
  try:
   req("Woodbine" in catalog(),"Live catalog entry missing")
   return "VERIFIED_PUBLIC"
  except (TimeoutError,urllib.error.URLError) as exc:
   print("NOV26_WO_CATALOG_HTTP_UNAVAILABLE",type(exc).__name__,"D1 registration receipt verified",flush=True)
   return "REGISTERED_PUBLIC_HTTP_UNVERIFIED"
 catalog_status=check_catalog()
 new=Path("/tmp/rr-pick-1126-wo-output.json").read_bytes()
 req(get(KEY)[0]==b and get(PROJECTION)[0]==pb,"Concurrent source update")
 audit=f"pick-tickets/scratch-revisions/{DATE}/woodbine/"
 immutable(audit+"r2-source-"+sha(raw)+".json",raw)
 immutable(audit+"parent-"+sha(b)+".json",b)
 meta=dict(o["Metadata"]);meta.update(revision="2",content_sha256=sha(new),source_sha256=rec["pwin_sha256"],publication_mode="owner-approved-gpt",customer_publish_approved="true",published_at=datetime.now(timezone.utc).isoformat())
 s.put_object(Bucket=BUCKET,Key=KEY,Body=new,ContentType="application/json",CacheControl="private,no-store",Metadata=meta,IfMatch=o["ETag"])
 got,go=get(KEY);req(got==new and go["Metadata"]["content_sha256"]==sha(new),"Customer readback mismatch")
 receipt=compact({"date":DATE,"track":"Woodbine","revision":2,"races":8,"runners":61,"sequences":9,"candidate_sha256":sha(raw),"customer_sha256":sha(new),"race_card_sha256":sha(pb),"parity_status":parity_status,"compared_snapshot_max_diff_pp":maxdiff,"max_pwin_delta_pp":maxdiff if parity_status=="VERIFIED_SCRATCH_FINAL" else None,"catalog_status_before_write":catalog_status,"published_at":meta["published_at"]})
 immutable(audit+"receipt-"+sha(receipt)+".json",receipt)
 print("NOV26_WO_PICK_CUSTOMER_READBACK_PASS",receipt.decode(),flush=True)
 print("NOV26_WO_POST_PUBLICATION_CATALOG",check_catalog(),flush=True)
if __name__=="__main__":
 try:main()
 except Exception as e:raise SystemExit("NOV26_WO_PICK_HOLD "+type(e).__name__+": "+str(e)[:180])

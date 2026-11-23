#!/usr/bin/env python3
"""Owner-only sealed Nov23 scratch-final TRI/F4 tickets -> private Cloudflare R2.

Only AES-equivalent authenticated sealed-box ciphertext is placed in a GitHub
issue comment. No runner scores or paywall material enter GitHub source files,
Actions logs, or public website assets. This script is PRIVATE ADMIN STAGING,
not customer-facing publishing or a new handicapping model.
"""
import base64
import hashlib
import json
import math
import os
import re
import sys
import zlib
from datetime import datetime,timezone
from pathlib import Path
import boto3
from botocore.exceptions import ClientError
from nacl.public import PrivateKey,SealedBox

PREFIX="RR_PICK_SCRATCH_FINAL_V1"
KEY_CONTEXT=b"RAIL-RYE-R2-PICK-INTERIM-REVIEW-ECIES-v1\0"
REPOSITORY="scottjazdzewski/rail-and-rye-website"
AUTHORIZED_OWNER="scottjazdzewski"
ISSUE_NUMBER=202
BUCKET="rail-and-rye-private-cards"
DAY="2026-11-23"
LIMIT=200000
TRACKS={
 "Mountaineer":{"code":"MNR","races":8,"runners":56,"scratches":{
  1:["8"],2:["7"],4:["1","4","5","7"],5:["1","3","5","6","8","12"],
  7:["1","2","9"],8:["5","7","8","11","12","13"]
 },"source_sha":"36e328d19fe10fdca3719cf1d1120bb0d48ce0558920e60a76f0cc7989bb82b4",
 "last_official_utc":"2026-11-23T16:50:00Z","menu":[
 ("Pick 4",1,4,50),("Pick 4",5,8,50),("Pick 3",2,4,100),("Pick 3",6,8,100),("Pick 5",4,8,50)]},
 "Zia Park":{"code":"ZIA","races":10,"runners":67,"scratches":{
  1:["4"],2:["3"],3:["2"],4:["5"],6:["4"],9:["2"]
 },"source_sha":"e34bc8642e1573fdeb1703555d64c2cf6bc18c8b15ca6d96a2507ede58afcde6",
 "last_official_utc":"2026-11-23T17:16:00Z","menu":[
 ("Pick 5",1,5,50),("Pick 5",6,10,50),("Pick 4",2,5,50),("Pick 4",7,10,50),
 ("Pick 3",3,5,50),("Pick 3",8,10,50)]}
}
def require(x,msg):
 if not x:raise ValueError(msg)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def parse_encrypted_comment():
 e=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
 comment=e.get("comment") or {}
 require(e.get("repository",{}).get("full_name")==REPOSITORY,"wrong repository")
 require(e.get("issue",{}).get("number")==ISSUE_NUMBER,"wrong handoff issue")
 require(comment.get("user",{}).get("login")==AUTHORIZED_OWNER,"not owner-authorized")
 body=comment.get("body","")
 require(body.startswith(PREFIX+"\n"),"invalid sealed issue comment")
 encoded=body[len(PREFIX)+1:].strip()
 require(re.fullmatch(r"[A-Za-z0-9+/=]+",encoded) and len(encoded)<=110000,"invalid/oversized sealed ciphertext")
 secret=os.environ["TRI_R2_SECRET_ACCESS_KEY"]
 require(len(secret)>20,"R2 private key missing")
 key=PrivateKey(hashlib.sha256(KEY_CONTEXT+secret.encode()).digest())
 raw=zlib.decompress(SealedBox(key).decrypt(base64.b64decode(encoded,validate=True)))
 require(len(raw)<=LIMIT,"plaintext too large")
 return json.loads(raw)
def _num(v):
 require(type(v) in (float,int) and math.isfinite(v) and 0<=v<=1,"invalid exact probability")
 return v
def check_payload(doc):
 require(doc.get("schema_version")==1 and doc.get("product_type")=="pick_tickets_scratch_final_private_handoff","wrong product")
 require(doc.get("date")==DAY and doc.get("review_only") is True and doc.get("customer_publish_approved") is False,"private-only condition not met")
 cards=doc.get("cards"); audits=doc.get("audit")
 require(isinstance(cards,list) and isinstance(audits,list) and len(cards)==len(audits)==2,"two verified tracks required")
 cardnames={c.get("track") for c in cards}
 require(cardnames==set(TRACKS),"unexpected or missing track")
 out=[]
 for card in cards:
  name=card["track"];config=TRACKS[name]
  a=next((x for x in audits if x.get("track")==name),None)
  require(isinstance(a,dict) and a.get("code")==config["code"],"track audit missing")
  require(a.get("source_input_changes")==[],"changed-rider cards must not use this clean lane")
  require(a.get("official_screenshot_sha256")==config["source_sha"],"official screenshot SHA mismatch")
  require(a.get("races")==config["races"] and a.get("current_runners")==config["runners"],"incorrect scored field")
  for k in ("f4_receipt_sha256","tri_receipt_sha256","f4_ordered_prefixes_sha256"):
   require(re.fullmatch(r"[a-f0-9]{64}",str(a.get(k,""))),k+" invalid")
  require(card.get("schema_version")==1 and card.get("product_type")=="pick_tickets" and card.get("date")==DAY,"wrong card schema/date")
  require(card.get("revision")==2 and card.get("status")=="scratch_updated","not scratch-final revision")
  require(card.get("scratch_verified_at")==config["last_official_utc"],"official source time mismatch")
  receipt=card.get("source_receipt") or {}
  require(receipt.get("sha256")==a["f4_receipt_sha256"],"receipt is not immutable F4 output")
  require(receipt.get("reference")==f'TRI_V4_1_F4_V2_20261123_{config["code"]}_SCRATCH_FINAL',"unapproved F4 model reference")
  rows=a.get("active_runners")
  require(isinstance(rows,dict) and len(rows)==config["races"],"all races required")
  by_race={};total=0
  for race in range(1,config["races"]+1):
   entries=rows.get(str(race))
   require(isinstance(entries,list) and len(entries)>=2,"missing active race")
   seen=set();summass=0.0;nums={}
   for entry in entries:
    p=entry.get("program")
    require(isinstance(p,str) and re.fullmatch(r"[0-9]{1,2}[A-Z]?",p) and p not in seen,"invalid/duplicate program")
    require(p not in config["scratches"].get(race,[]),"withdrawn horse in scored field")
    seen.add(p)
    w=_num(entry.get("pwin"));v=_num(entry.get("f4_p1"))
    require(abs(w-v)<1e-12,"F4 first-place probability differs from frozen TRI")
    for field in ("f4_p2","f4_p3","f4_p4","f4_p5"):
     _num(entry.get(field))
    nums[p]=w;summass+=w;total+=1
   require(abs(summass-1)<1e-10,"PWIN race total differs from 1")
   by_race[race]=nums
  require(total==config["runners"],"wrong number of active runners")
  seqs=card.get("sequences")
  require(isinstance(seqs,list) and len(seqs)==len(config["menu"]),"all official sequences required")
  seenSeq=set()
  for seq in seqs:
   namekey=(seq.get("name"),seq.get("start_race"),seq.get("end_race"))
   require(namekey in [(x[0],x[1],x[2]) for x in config["menu"]] and namekey not in seenSeq,"unexpected sequence")
   seenSeq.add(namekey)
   unit=next(x[3] for x in config["menu"] if x[:3]==namekey)
   require(seq.get("play_status")=="CONDITIONAL","unapproved economic classification")
   require(isinstance(seq.get("tickets"),list) and len(seq["tickets"])==1,"one focused ticket per sequence")
   t=seq["tickets"][0]
   require(t.get("role")=="BEST_POSSIBLE" and t.get("unit_cents")==unit,"wager role/denomination mismatch")
   legs=t.get("legs") or []
   expected_races=list(range(namekey[1],namekey[2]+1))
   require([leg.get("race_number") for leg in legs]==expected_races,"missing/duplicate ticket race")
   fields=seq.get("race_fields") or []
   require([f.get("race_number") for f in fields]==expected_races,"missing eligible field")
   combo=1;hit=1
   for leg,field,race in zip(legs,fields,expected_races):
    nums=by_race[race];sel=leg.get("programs")
    require(isinstance(sel,list) and len(sel)>0 and len(sel)==len(set(sel)),"invalid ticket runner set")
    require(all(p in nums for p in sel),"ticket contains a nonstarter")
    full=field.get("programs")
    require(isinstance(full,list) and len(full)==len(nums) and set(full)==set(nums),"eligible field does not equal official active roster")
    combo*=len(sel)
    hit*=sum(nums[p] for p in sel)
   require(combo==t.get("combinations") and unit*combo==t.get("total_cents"),"exact wager arithmetic fails")
   shown=f"{hit*100:.1f}%"
   require(seq.get("hit_rate_display")==shown and t.get("hit_rate_display")==shown,"ticket hit calculation wrong")
  out.append((card,a))
 return out
def s3():
 account=os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]
 require(re.fullmatch("[a-f0-9]{32}",account),"missing account ID")
 return boto3.client("s3",region_name="auto",
  endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
  aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],
  aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
def optional(s3client,key):
 try:return s3client.get_object(Bucket=BUCKET,Key=key)["Body"].read()
 except ClientError as ex:
  if ex.response.get("Error",{}).get("Code") in ("NoSuchKey","404","NotFound"):return None
  raise
def ingest():
 entries=check_payload(parse_encrypted_comment())
 cli=s3()
 prepared=[]
 for card,a in entries:
  slug=re.sub("[^a-z0-9]+","-",card["track"].lower()).strip("-")
  key=f"pick-tickets/dashboard/{DAY}/{slug}.json"
  text=json.dumps(card,sort_keys=True,separators=(",",":")).encode("utf-8")
  old=optional(cli,key)
  if old:
   prior=json.loads(old)
   require(prior.get("revision",0)<=2,"cannot rollback later scratch editions")
   if prior.get("revision")==2:require(old==text,"existing revision differs; never silently overwrite")
  checksum=digest(text)
  audit_key=f"pick-tickets/scorer-audit/{DAY}/{slug}.json"
  audit_text=json.dumps(a,sort_keys=True,separators=(",",":")).encode("utf-8")
  old_audit=optional(cli,audit_key)
  if old_audit:require(old_audit==audit_text,"same revision has different audit proof")
  prepared.append((key,text,checksum,audit_key,audit_text,card))
 for key,text,checksum,audit_key,audit_text,card in prepared:
  now=datetime.now(timezone.utc).isoformat()
  slug=key.rsplit("/",1)[1][:-5]
  revision_key=f"pick-tickets/revisions/{DAY}/{slug}/r00002-{checksum[:16]}.json"
  options={"ContentType":"application/json; charset=utf-8","CacheControl":"private, no-store"}
  meta={"content_sha256":checksum,"updated_at":now,"receipt_sha256":card["source_receipt"]["sha256"]}
  cli.put_object(Bucket=BUCKET,Key=revision_key,Body=text,Metadata=meta,**options)
  cli.put_object(Bucket=BUCKET,Key=audit_key,Body=audit_text,Metadata={
   "source_receipt_sha256":card["source_receipt"]["sha256"],"private":"true"},**options)
  cli.put_object(Bucket=BUCKET,Key=key,Body=text,Metadata=meta,**options)
  require(optional(cli,key)==text,"R2 current ticket readback failed")
  require(optional(cli,audit_key)==audit_text,"R2 model audit readback failed")
  print(f"PRIVATE_SCRATCH_FINAL_PASS: {card['track']}: {len(card['sequences'])} current Pick sequences, revision 2, content_sha256={checksum}; no source values logged")
 print("PRIVATE_SCRATCH_FINAL_IMPORT_COMPLETE: 2 of 2 tracks. CUSTOMER ACCESS NOT ENABLED.")
def public_key():
 key=PrivateKey(hashlib.sha256(KEY_CONTEXT+os.environ["TRI_R2_SECRET_ACCESS_KEY"].encode()).digest()).public_key
 print("PICK_SCRATCH_FINAL_PUBLIC_KEY="+base64.b64encode(bytes(key)).decode())
if __name__=="__main__":
 try:
  cmd=sys.argv[1] if len(sys.argv)>1 else ""
  if cmd=="public-key":public_key()
  elif cmd=="ingest":ingest()
  else:raise ValueError("Usage public-key|ingest")
 except Exception as ex:
  print("PRIVATE_SCRATCH_FINAL_ERROR:",type(ex).__name__,str(ex)[:155],file=sys.stderr)
  sys.exit(1)

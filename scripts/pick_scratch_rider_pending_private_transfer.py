#!/usr/bin/env python3
"""Private staging of true post-scratch TRI/F4 suggestions where jockey changes
remain pending. Never release this lane as model-final or customer-certified.
Authored source is an owner-sealed issue comment, never plaintext in GitHub.
"""
import json,math,re,sys,hashlib
from datetime import datetime,timezone
import pick_scratch_final_private_transfer as base

PREFIX="RR_PICK_SCRATCH_INTERIM_V1"
BASE_DAY="2026-11-23"
TRACKS={
 "Finger Lakes":{"code":"FL","races":8,"runners":55,"scratches":{1:["2"],3:["2"],5:["9"],7:["1"],8:["7"]},
 "screenshot":"666fe363c095bf6438093bd387c501488a3d5bed9d3e37753a6fba360bebd5c0",
 "time":"2026-11-23T16:59:00Z","menu":[("Pick 5",1,5,50),("Pick 5",4,8,50),
 ("Pick 3",2,4,50),("Pick 3",3,5,50),("Pick 3",6,8,50),("Pick 4",3,6,50),("Pick 4",5,8,50)]},
 "Mahoning Valley":{"code":"MVR","races":10,"runners":85,"scratches":{1:["5"],2:["3"],3:["6","7","9"],10:["5","9"]},
 "screenshot":"a006de8b2f6736a12cacc5a1fbecda12c8c4e740d2f011c13a818ac63c3b5bbf",
 "time":"2026-11-23T16:30:00Z","menu":[
 *[("Pick 3",i,i+2,50) for i in range(1,9)],
 ("Pick 5",1,5,50),("Pick 5",6,10,50),("Pick 4",7,10,50),("Buckeye Pick 6",5,10,20)]},
 "Parx Racing":{"code":"PRX","races":9,"runners":54,"scratches":{1:["6"],3:["6"],4:["4"],5:["1","3"],6:["2"],7:["6"],9:["2","5","9","10"]},
 "screenshot":"7fee502868a7713e55c5236aa1e4c4cbbb04ce93a4dbaf678889f2b9aae3a196",
 "time":"2026-11-23T16:49:00Z","menu":[
 *[("Pick 3",i,i+2,100) for i in range(1,8)],
 ("Pick 4",1,4,50),("Pick 4",2,5,50),("Pick 4",4,7,50),("Pick 4",6,9,50),
 ("Philly Big 5",5,9,50)]}
}
def require(cond,reason):
 if not cond:raise ValueError(reason)
def good_sha(v):return isinstance(v,str) and re.fullmatch("[a-f0-9]{64}",v)
def verify(payload):
 require(payload.get("schema_version")==1 and
  payload.get("product_type")=="pick_tickets_scratch_only_rider_pending_private_handoff" and
  payload.get("date")==BASE_DAY and payload.get("review_only") is True and
  payload.get("customer_publish_approved") is False,"invalid interim-only package")
 cards=payload.get("cards");audits=payload.get("audit")
 require(isinstance(cards,list) and len(cards)==3 and isinstance(audits,list) and len(audits)==3,
  "missing provisional tracks")
 require({c.get("track") for c in cards}==set(TRACKS),"wrong date/track identity")
 prepared=[]
 for c in cards:
  name=c["track"];cfg=TRACKS[name]
  a=next((a for a in audits if a.get("track")==name),None)
  require(isinstance(a,dict) and a.get("code")==cfg["code"],"missing score audit")
  require(a.get("races")==cfg["races"] and a.get("current_runners")==cfg["runners"],"model roster count mismatch")
  require(a.get("official_screenshot_sha256")==cfg["screenshot"],"owner screenshot hash differs")
  require(a.get("rider_scoring_status")=="UNVERIFIED_CHANGED_RIDER_INPUTS_PRESCRATCH_RIDERS_USED",
   "changed-jockey warning is mandatory")
  changes=a.get("source_input_changes",[])
  require(isinstance(changes,list) and any(x.get("type")=="jockey" for x in changes),
   "source jockey change proof must remain flagged")
  for key in ("tri_receipt_sha256","f4_receipt_sha256","f4_ordered_prefixes_sha256"):
   require(good_sha(a.get(key)),key+" missing")
  require(c.get("schema_version")==1 and c.get("product_type")=="pick_tickets" and
   c.get("date")==BASE_DAY and c.get("revision")==2 and
   c.get("status")=="scratch_updated" and c.get("scratch_verified_at")==cfg["time"],
   "incorrect revision or source time")
  receipt=c.get("source_receipt",{})
  require(receipt.get("sha256")==a["f4_receipt_sha256"] and receipt.get("reference")==
   f'TRI_V4_1_F4_V2_20261123_{cfg["code"]}_SCRATCH_ONLY_RIDER_CHANGES_PENDING',
   "must use exact scratch-only F4 receipt and rider-pending label")
  rows=a.get("active_runners")
  require(isinstance(rows,dict) and len(rows)==cfg["races"],"model omitted race")
  race_probs={};horse_total=0
  for race in range(1,cfg["races"]+1):
   field=rows.get(str(race))
   require(isinstance(field,list) and len(field)>1,"missing race field")
   used=set();pwin_mass=0;p={}
   for entry in field:
    program=entry.get("program");w=entry.get("pwin");v=entry.get("f4_p1")
    require(isinstance(program,str) and re.fullmatch("[0-9]{1,2}[A-Z]?",program) and
     program not in used and program not in cfg["scratches"].get(race,[]),
     "invalid/withdrawn current-field horse")
    require(type(w) in (int,float) and type(v) in (int,float) and math.isfinite(w) and
     0<=w<=1 and abs(w-v)<1e-12,"PWIN or F4 exact P1 invalid")
    for pos in range(2,6):
     q=entry.get(f"f4_p{pos}")
     require(type(q) in (int,float) and math.isfinite(q) and 0<=q<=1,
      "missing F4 higher-place probability")
    p[program]=w;pwin_mass+=w;used.add(program);horse_total+=1
   require(abs(pwin_mass-1)<1e-10,"PWIN not normalized")
   race_probs[race]=p
  require(horse_total==cfg["runners"],"active runner total mismatch")
  seqs=c.get("sequences",[])
  require(isinstance(seqs,list) and len(seqs)==len(cfg["menu"]),"missing Pick sequence")
  seen=set()
  for seq in seqs:
   identity=(seq.get("name"),seq.get("start_race"),seq.get("end_race"))
   require(identity in [t[:3] for t in cfg["menu"]] and identity not in seen,
    "unknown or duplicate Pick sequence")
   seen.add(identity)
   unit=next(t[3] for t in cfg["menu"] if t[:3]==identity)
   require(seq.get("play_status")=="CONDITIONAL","unverified ROI status prohibited")
   require("INTERIM" in seq.get("recommendation","") and
     "changed-jockey" in seq.get("recommendation",""),"jockey warning absent")
   tickets=seq.get("tickets")
   require(isinstance(tickets,list) and len(tickets)==1,"single source ticket only")
   t=tickets[0]
   require(t.get("role")=="BEST_POSSIBLE" and t.get("unit_cents")==unit and
    "INTERIM" in t.get("notes",""),"unverified source ticket")
   races=list(range(identity[1],identity[2]+1))
   legs=t.get("legs");fields=seq.get("race_fields")
   require(isinstance(legs,list) and isinstance(fields,list) and len(legs)==len(fields)==len(races),
    "sequence missing full-field source")
   combos=1;chance=1.0
   for idx,race in enumerate(races):
    leg=legs[idx];field=fields[idx];allowed=race_probs[race]
    require(leg.get("race_number")==race and field.get("race_number")==race,
     "sequence race numbering mismatch")
    selected=leg.get("programs");eligible=field.get("programs")
    require(isinstance(selected,list) and selected and len(selected)==len(set(selected)) and
     all(p in allowed for p in selected),"scratch in suggested ticket")
    require(isinstance(eligible,list) and len(eligible)==len(allowed) and
     set(eligible)==set(allowed),"full-field roster mismatch")
    combos*=len(selected);chance*=sum(allowed[p] for p in selected)
   require(combos==t.get("combinations") and combos*unit==t.get("total_cents"),
    "wrong cost/denomination")
   hit=f"{chance*100:.1f}%"
   require(t.get("hit_rate_display")==hit and seq.get("hit_rate_display")==hit,
    "wrong current scratch-only hit projection")
  prepared.append((c,a))
 return prepared
def ingest():
 base.PREFIX=PREFIX
 records=verify(base.parse_encrypted_comment())
 s3=base.s3()
 sealed=[]
 for card,audit in records:
  slug=re.sub("[^a-z0-9]+","-",card["track"].lower()).strip("-")
  key=f"pick-tickets/dashboard/{BASE_DAY}/{slug}.json"
  content=json.dumps(card,separators=(",",":"),sort_keys=True).encode()
  previous=base.optional(s3,key)
  if previous:
   old=json.loads(previous)
   require(old.get("revision",0)<=2,"later revision cannot be overwritten")
   if old.get("revision")==2:require(previous==content,"conflicting revision 2")
  audit_key=f"pick-tickets/scorer-audit/{BASE_DAY}/{slug}.json"
  audit_bytes=json.dumps(audit,separators=(",",":"),sort_keys=True).encode()
  old_audit=base.optional(s3,audit_key)
  if old_audit:require(old_audit==audit_bytes,"same model audit conflicts")
  sealed.append((key,content,audit_key,audit_bytes,card))
 for key,content,audit_key,audit_bytes,card in sealed:
  slug=key.rsplit("/",1)[1][:-5]
  digest=hashlib.sha256(content).hexdigest()
  meta={"content_sha256":digest,"updated_at":datetime.now(timezone.utc).isoformat(),
        "receipt_sha256":card["source_receipt"]["sha256"]}
  options={"ContentType":"application/json; charset=utf-8","CacheControl":"private, no-store"}
  s3.put_object(Bucket=base.BUCKET,Key=f"pick-tickets/revisions/{BASE_DAY}/{slug}/r00002-{digest[:16]}.json",Body=content,Metadata=meta,**options)
  s3.put_object(Bucket=base.BUCKET,Key=audit_key,Body=audit_bytes,Metadata={"private":"true"},**options)
  s3.put_object(Bucket=base.BUCKET,Key=key,Body=content,Metadata=meta,**options)
  require(base.optional(s3,key)==content and base.optional(s3,audit_key)==audit_bytes,"R2 readback mismatch")
  print(f"PRIVATE_INTERIM_PICK_PASS: {card['track']} {len(card['sequences'])} active suggestions, rider inputs pending; sha256={digest}")
 print("PRIVATE_INTERIM_PICK_COMPLETE: 3 tracks. RIDER CHANGES UNVERIFIED, CUSTOMER ACCESS OFF.")
if __name__=="__main__":
 try:
  if len(sys.argv)!=2 or sys.argv[1]!="ingest":raise ValueError("Usage: ingest")
  ingest()
 except Exception as e:
  print("PRIVATE_INTERIM_PICK_ERROR:",type(e).__name__,str(e)[:180],file=sys.stderr)
  sys.exit(1)

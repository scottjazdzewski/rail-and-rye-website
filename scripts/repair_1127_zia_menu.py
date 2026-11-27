import os,json,hashlib,subprocess,urllib.request,time
from datetime import datetime,timezone
import boto3
from pick_private_score_bridge import BUCKET,REPO
def require(ok,msg):
 if not ok:raise RuntimeError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
require(os.environ["GITHUB_REPOSITORY"]==REPO,"Wrong repository")
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
date="2026-11-27";ck="projections/dashboard/"+date+"/zia-park.json";fk="projections/f4-ordered/"+date+"/zia-park.json";qa="projections/qa/"+date+"/"
def get(key):
 o=s.get_object(Bucket=BUCKET,Key=key);return o["Body"].read(),o.get("Metadata",{})
old,meta=get(ck);fb,fmeta=get(fk);card=json.loads(old);model=json.loads(fb)
proof=json.loads(get(qa+"scratch10-zia-release.json")[0])
rows=proof["tracks"];require(proof["status"]=="VERIFIED_SCRATCH_FINAL" and proof["date"]==date and len(rows)==1 and rows[0]["track"]=="Zia Park" and rows[0]["runners"]==79 and rows[0]["scratches"]==4,"Prior receipt scope")
require(sha(fb)==rows[0]["ordered_sha256"] and card["scratch_release_sha256"]==model["scratch_release_sha256"]=="aa175041e3bfa9ad15616d49934a0894a8f19d7fbd1b54294d4c30f4585aa1d8","Parent F4 and scoring receipt")
require(card["race_date"]==date and card["track_name"]=="Zia Park" and card["projection_status"]=="scratch_final" and len(card["races"])==10 and sum(len(r["entries"]) for r in card["races"])==79,"Card identity")
r=next(r for r in card["races"] if r["race_number"]==10)
require(r["post_time_et"] in ("2nd Half Late Daily Double /$1 Exacta / .50","6:08 PM"),"Unexpected time")
prior=r["post_time_et"]
if prior!="6:08 PM":
 require(sha(old)==rows[0]["dashboard_sha256"],"Stored parent hash mismatch")
 r["post_time_et"]="6:08 PM"
new=compact(card) if prior!="6:08 PM" else old
js="""import {readMemberProjectionCards} from './src/projections.js';import {verifyCertifiedScratchFinalTrack} from './src/f4-exotics.js';let raw='';for await(const c of process.stdin)raw+=c;const {card,model}=JSON.parse(raw);const key='projections/dashboard/2026-11-27/zia-park.json';const env={CARDS_BUCKET:{list:async()=>({objects:[{key}]}),get:async k=>k===key?{text:async()=>JSON.stringify(card),customMetadata:{}}:null}};const rows=await readMemberProjectionCards(env,[{id:'qa',category:'Race Cards',race_date:'2026-11-27',track:'Zia Park'}]);if(rows.length!==1||rows[0].card.races.length!==10||rows[0].card.races.find(r=>r.race_number===10).post_time_et!=='6:08 PM'||!verifyCertifiedScratchFinalTrack(card,model))process.exit(1);console.log('ZIA_READER_AND_F4_PASS');"""
subprocess.run(["node","--input-type=module","-e",js],input=compact({"card":card,"model":model}),check=True)
if new!=old:
 require(get(ck)[0]==old and get(fk)[0]==fb,"Concurrent update")
 s.put_object(Bucket=BUCKET,Key=ck,Body=new,Metadata=meta,ContentType="application/json",CacheControl="private,no-store")
require(get(ck)[0]==new and get(fk)[0]==fb,"Readback mismatch")
receipt=compact({"date":date,"status":"VERIFIED_METADATA_REPAIR","track":"Zia Park","race":10,"field":"post_time_et","corrected_value":"6:08 PM","source":"Original November 27 Timeform header: 11/27/2026 6:08 PM","source_pdf_sha256":"b0cf5187101773346dcdc89d69c02e7479b065e0d7d7a057bbc63c961610b9c9","parent_dashboard_sha256":rows[0]["dashboard_sha256"],"dashboard_sha256":sha(new),"ordered_sha256":sha(fb),"verified_at":datetime.now(timezone.utc).isoformat()})
s.put_object(Bucket=BUCKET,Key=qa+"zia-menu-time-repair.json",Body=receipt,ContentType="application/json",CacheControl="private,no-store")
require(get(qa+"zia-menu-time-repair.json")[0]==receipt,"Repair receipt")
print("ZIA_METADATA_REPAIR_READBACK_PASS race=10 post=6:08 PM scoring_unchanged",flush=True)
for attempt in range(6):
 try:
  req=urllib.request.Request("https://railandryeracing.com/api/products?qa=zia-menu-repair-"+str(attempt),headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
  with urllib.request.urlopen(req,timeout=30) as rr: products=json.load(rr)["products"]
  names=sorted({p.get("track") for p in products+[i for p in products for i in p.get("included_products",[])] if p.get("category")=="Race Cards" and p.get("race_date")==date and p.get("track")})
  print("PUBLIC_TRACKS",names,flush=True)
  if "Zia Park" in names and len(names)==15:
   print("ZIA_PUBLIC_MENU_PASS tracks=15",flush=True);break
 except Exception as ex:print("Public check retry",type(ex).__name__,flush=True)
 time.sleep(3)
else:raise RuntimeError("Public catalog has not yet exposed all 15 tracks")

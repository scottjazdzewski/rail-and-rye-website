"""Read-only private R2 Target List discovery. Only sealed ciphertext is printed."""
import os,base64,json,hashlib,re,boto3
from nacl.public import PublicKey,SealedBox
D="2026-11-25"
BUCKET="rail-and-rye-private-cards"
PUB=PublicKey(base64.b64decode("toPHhYHNl9KAzXEPKT8UdaCiz0L07XLvj8o/8Cn3cwA="))
client=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",
aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def fetch(key):
 try:return client.get_object(Bucket=BUCKET,Key=key)
 except client.exceptions.NoSuchKey:return None
def ml(value):
 if isinstance(value,(int,float)) and value>=0:return float(value)
 s=str(value or "").strip().lower().replace("ml:","").replace(" ","")
 if re.fullmatch(r"\d+[-/]\d+",s):
  a,b=re.split(r"[-/]",s);return int(a)/int(b) if int(b) else None
 if re.fullmatch(r"\d+(\.\d+)?",s):return float(s)
 return None
report={"date":D,"schema_samples":[],"races":0,"horses":0,"candidate_races":[],"missing_morning_line":0,"missing_probs":0,"tracks":[],"other_products":[]}
manifest=json.load(open("private-ingest/20261125/manifest.json"))
for t in manifest["tracks"]:
 slug=t["slug"];key="projections/dashboard/"+D+"/"+slug+".json";obj=fetch(key)
 if not obj:raise ValueError("Missing verified source "+slug)
 card=json.loads(obj["Body"].read());assert card["race_date"]==D and card["track_name"]==t["name"]
 report["tracks"].append({"track":t["name"],"races":len(card["races"]),"horses":sum(len(x["entries"]) for x in card["races"])})
 if not report["schema_samples"]:
  report["schema_samples"].append({"race_keys":list(card["races"][0]),"runner_keys":list(card["races"][0]["entries"][0])})
 for race in card["races"]:
  report["races"]+=1;entries=race["entries"];report["horses"]+=len(entries)
  if abs(sum(float(e.get("win_probability_exact",0)) for e in entries)-100)>1e-4:raise ValueError("Bad PWIN mass "+slug)
  def rawline(e):return e.get("morning_line") or e.get("morning_line_display") or e.get("ml") or ""
  valid=[(ml(rawline(e)),e) for e in entries if ml(rawline(e)) is not None]
  report["missing_morning_line"]+=len(entries)-len(valid)
  if not valid:continue
  favorite=min(valid,key=lambda q:q[0]);base=favorite[1]
  bp=float(base.get("win_probability_exact",0))
  qualifying=[]
  for price,e in valid:
   if e is base or price<=favorite[0]:continue
   score=float(e.get("win_probability_exact",0))
   gap=score-bp;fair=100/score-1 if score>0 else 1e6
   if gap>=10-1e-8 and price>fair:
    qualifying.append({"program":e.get("program_number"),"name":e.get("horse_name"),"ml":rawline(e),
                        "ml_decimal":price,"win_exact":score,"fair_decimal":fair,"gap":gap,
                        "trainer":e.get("trainer"),"jockey":e.get("jockey")})
  if qualifying:
   report["candidate_races"].append({"track":t["name"],"race_number":race["race_number"],
    "race_facts":{k:race.get(k) for k in ("post_time_et","distance","surface","conditions","display_race_class","race_name","stakes_name","purse","is_stakes","race_class")},
    "favorite":{"program":base.get("program_number"),"name":base.get("horse_name"),"ml":rawline(base),"ml_decimal":favorite[0],"win_exact":bp,
               "trainer":base.get("trainer"),"jockey":base.get("jockey")},
    "candidates":sorted(qualifying,key=lambda x:-x["gap"])})
for label,key in [("target_review","racing-intelligence/target-list-review/"+D+"/revision-0001.json"),("target_published","racing-intelligence/product-tabs/target-list/"+D+".json"),("target_certified","racing-intelligence/target-list/"+D+"/revision-0001.json")]:
 obj=fetch(key)
 report["other_products"].append({"name":label,"found":bool(obj),"meta":obj.get("Metadata") if obj else None})
encoded=base64.b64encode(SealedBox(PUB).encrypt(json.dumps(report,separators=(",",":"),ensure_ascii=False).encode())).decode()
print("RR_TARGET_1125_SEALED_START")
print(encoded)
print("RR_TARGET_1125_SEALED_END")
print("PASS Private Target List discovery encrypted; no selections printed.",flush=True)

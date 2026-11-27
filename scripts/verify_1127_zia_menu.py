import os,json,urllib.request,subprocess
import boto3
from pick_private_score_bridge import BUCKET
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
date="2026-11-27";prefix="projections/dashboard/"
def get(key):return json.loads(s.get_object(Bucket=BUCKET,Key=key)["Body"].read())
receipt=get("projections/qa/"+date+"/staged-catalog-receipt.json")
print("CATALOG_REGISTERED", [t["track"] for t in receipt["tracks"]],flush=True)
all_keys=s.list_objects_v2(Bucket=BUCKET,Prefix=prefix,MaxKeys=1000)
keys=[k["Key"] for k in all_keys.get("Contents",[])]
print("GLOBAL_LIST",len(keys),all_keys.get("IsTruncated"),"ZIA_PRESENT",prefix+date+"/zia-park.json" in keys,flush=True)
today=s.list_objects_v2(Bucket=BUCKET,Prefix=prefix+date+"/")
cards={k["Key"]:get(k["Key"]) for k in today.get("Contents",[])}
js="""import {readMemberProjectionCards} from './src/projections.js';let raw='';for await(const c of process.stdin)raw+=c;const {cards,products}=JSON.parse(raw);for(const [key,card] of Object.entries(cards)){const env={CARDS_BUCKET:{list:async()=>({objects:[{key}]}),get:async k=>k===key?{text:async()=>JSON.stringify(card),customMetadata:{}}:null}};const r=await readMemberProjectionCards(env,products);console.log('READER',card.track_name,r.length?'PASS':'FAIL');}"""
subprocess.run(["node","--input-type=module","-e",js],input=json.dumps({"cards":cards,"products":[{**t,"category":"Race Cards","race_date":date,"title":t["track"]} for t in receipt["tracks"]]}).encode(),check=True)
req=urllib.request.Request("https://railandryeracing.com/api/products?qa=zia-1127",headers={"Cache-Control":"no-cache","User-Agent":"RailRyeReleaseQA/1"})
with urllib.request.urlopen(req,timeout=30) as r: products=json.load(r)["products"]
print("PUBLIC_TRACKS",sorted({p.get("track") for p in products+[i for p in products for i in p.get("included_products",[])] if p.get("category")=="Race Cards" and p.get("race_date")==date and p.get("track")}),flush=True)

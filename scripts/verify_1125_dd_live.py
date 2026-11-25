import os,json,pathlib,subprocess,urllib.request,time
import boto3
from datetime import datetime
from zoneinfo import ZoneInfo
date="2026-11-25"
assert datetime.now(ZoneInfo("America/New_York")).date().isoformat()==date,"Wrong race date"
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
bucket="rail-and-rye-private-cards"
tracks={"charles-town","churchill-downs","delta-downs","finger-lakes","mahoning-valley","mountaineer","parx-racing","penn-national","tampa-bay-downs"}
cards=[]
for slug in sorted(tracks):
 o=s.get_object(Bucket=bucket,Key=f"projections/dashboard/{date}/{slug}.json")
 cards.append(json.loads(o["Body"].read()))
assert len(cards)==9 and sum(len(c["races"]) for c in cards)==76
assert sum(c["projection_status"]=="scratch_final" for c in cards)>=5
# Only feed private stored results into the actual authorized reader serializer.
# Neither probabilities nor customer data are printed or uploaded.
root=pathlib.Path("/tmp/rr-dd-verify");root.mkdir(mode=0o700,exist_ok=True)
(root/"cards.json").write_text(json.dumps(cards))
subprocess.run(["node","scripts/verify_1125_dd_reader.mjs",str(root)],check=True)
env={**os.environ,"RR_DD_PRIVATE_EDITION":str(root/"edition.json")}
subprocess.run(["node","test-rr-exotic-bet-builder.mjs"],env=env,check=True)
base="https://railandryeracing.com"
def get(path):
 req=urllib.request.Request(base+path,headers={"Cache-Control":"no-cache","User-Agent":"RailRyeDailyDoubleQA/1"})
 with urllib.request.urlopen(req,timeout=20) as r:return r.read()
for i in range(20):
 try:
  html=get("/intelligence/race-cards/?date="+date+"&qa=dd6-"+str(i))
  builder=get("/assets/rr-exotic-bet-builder.js?v=customer-dd-eligibility-6")
  dashboard=get("/assets/projections-dashboard.js?v=customer-dd-launch-6")
  if b"rr-exotic-bet-builder.js?v=customer-dd-eligibility-6" in html and builder==pathlib.Path("public/assets/rr-exotic-bet-builder.js").read_bytes() and dashboard==pathlib.Path("public/assets/projections-dashboard.js").read_bytes():
   print("DD_LIVE_CUSTOMER_SHELL_AND_ASSETS_PASS",flush=True);break
 except Exception as e:print("Live shell retry",i,type(e).__name__,flush=True)
 time.sleep(8)
else:raise RuntimeError("Live customer shell or assets did not match current release")

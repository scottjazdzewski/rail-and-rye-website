"""Read-only Nov27 Pick Ticket preflight; no paid runner data printed or written."""
import boto3,json,hashlib,os,re
from botocore.exceptions import ClientError
from datetime import datetime,timezone
DATE="2026-11-27"
BUCKET="rail-and-rye-private-cards"
SOURCE="c4f7b36d1b72f03ee8bcff3b022cd4740d4dbf0f190e218bc89cf9bf18504e06"
RELEASE="2026-11-27T08:00:00Z"
EXPECTED={
"Belmont Park":(10,97,"0541f18e2a6157b8826e0d6cb55c32f88d01ab0257622a0fa3d08e02ff4ab04e"),
"Churchill Downs":(12,106,"5489c0e9cf93631f02d3d6f234d84ebd318ded89326fe8f2495b0c459798e5b7"),
"Charles Town":(8,69,"3e4a3d4e214cf32b24536efeea5633c7cd44a0d7062f449f8cd8073248c7a0cb"),
"Delta Downs":(9,74,"33f137762a4c14fb3591e5976c89033bc543ff542c0b475220be81dc7f8cc7af"),
"Del Mar":(9,73,"fc83d21b21e6bb3d16ab46d89632c4a4f8b53fb55e27991a4392a70a2dfeb2dc"),
"Fair Grounds":(8,60,"44c9f9416b1d1b983c958ab3f3137b87d8aa780fe9f979da31a738030e809e81"),
"Gulfstream Park":(9,70,"b500062211a40162936e76b64901492bf47f1e88e48c1fe211db2e96640a750c"),
"Laurel Park":(9,81,"72faadc170f8b775b34ace7a8aaba594d1f5bad4b5c83adc06a42c8ed6c976a4"),
"Oaklawn Park":(10,101,"47475b061eb975e24b710ba7a76382aabb2ff3fa80c3b11e1656eb8146a6782b"),
"Parx Racing":(9,72,"647a602df28bb79d6984a605baecdf52cbe5c75bfca55d5e35a6913e2c3ddf43"),
"Remington Park":(8,66,"ff63ec57c7ac7cd166f8ee182ba32aa35ec14178aa43f6b1bef2c46d7e5fa2f1"),
"Tampa Bay":(8,57,"fec803e6938d585f753af4207f2832e226071c41de9c2afbf6a363c9bd88c52b"),
"Turf Paradise":(7,45,"21ccfe43fe9c3448bdc07969b7a5b6e4a82a004e2b9b05ccba68dbb52ef859af"),
"Woodbine":(8,61,"1d0c54da4033f6b37fce37faf1f9a7ca10bfc5f3907eac3ed41bf77c17702cf7"),
"Zia Park":(10,83,"7b68288773eb6adb33e2827ae5def26837f68734a4b7a689ce96122a10865c3e")}
s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
def get(key):
 try:
  v=s.get_object(Bucket=BUCKET,Key=key);b=v["Body"].read();return b,v.get("Metadata",{})
 except ClientError as e:
  if e.response["Error"]["Code"] in ("NoSuchKey","404","NotFound"):return None,{}
  raise
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(v):return json.dumps(v,separators=(",",":"),ensure_ascii=False).encode()
mf,_=get(f"projections/qa/{DATE}/staged-release.json")
manifest=json.loads(mf) if mf else {}
valid_manifest=(manifest.get("status")=="VERIFIED_STAGED" and manifest.get("race_date")==DATE and manifest.get("release_at")==RELEASE and manifest.get("source_sha256")==SOURCE and {x.get("name") for x in manifest.get("tracks",[])}==set(EXPECTED))
print("NOV27_CANONICAL_MANIFEST",bool(mf),valid_manifest,flush=True)
results={}
for name,(nr,ns,digest) in EXPECTED.items():
 slug=re.sub("[^a-z0-9]+","-",name.lower()).strip("-")
 b,m=get(f"projections/dashboard/{DATE}/{slug}.json")
 f,fm=get(f"projections/f4-ordered/{DATE}/{slug}.json")
 if not b or not f:
  results[name]="MISSING_CANONICAL_OBJECT";print("NOV27_PARITY",name,results[name],flush=True);continue
 try:
  d=json.loads(b);model=json.loads(f)
  assert d["race_date"]==DATE and d["track_name"]==name and d["projection_status"]=="prescratch" and model["source_sha256"]==SOURCE and model["date"]==DATE and model["track_name"]==name and model["scratch_state"]=="PRESCRATCH"
  assert model["f4_receipt_sha256"]==d["model_receipts"]["f4_sha256"]
  assert len(d["races"])==nr
  rows=[]
  for r in d["races"]:
   assert abs(sum(e["win_probability_exact"] for e in r["entries"])-100)<1e-6
   for e in r["entries"]:
    assert abs(e["win_probability_exact"]/100-e["f4_probabilities"]["exact_p1"])<1e-12
    rows.append([int(r["race_number"]),str(e["program_number"]),str(e["horse_name"]),f'{e["win_probability_exact"]:.8f}'])
  assert len(rows)==ns and len({(v[0],v[1]) for v in rows})==ns
  rows.sort(key=lambda x:(x[0],x[1]))
  same=sha(compact(rows))==digest
  mr=next((t for t in manifest.get("tracks",[]) if t["name"]==name),{})
  bound=(valid_manifest and mr.get("dashboard_sha256")==sha(b) and mr.get("ordered_sha256")==sha(f) and mr.get("races")==nr and mr.get("runners")==ns and m.get("customer_publish_approved")=="true" and m.get("release_at")==RELEASE)
  results[name]="PARITY_AND_MANIFEST_PASS" if same and bound else ("PARITY_PASS_MANIFEST_PENDING" if same else "PARITY_RECONCILIATION_REQUIRED")
 except (AssertionError,KeyError,TypeError,ValueError):
  results[name]="CANONICAL_IDENTITY_OR_FIELD_HOLD"
 print("NOV27_PARITY",name,results[name],flush=True)
for name,key in [("stage",f"pick-tickets/staging/{DATE}/revision-0001.json"),("prepared",f"pick-tickets/staging/{DATE}/prepared-0001.json")]:
 b,_=get(key);print("NOV27_PICK_RECEIPT",name,bool(b),flush=True)
print("NOV27_PREFLIGHT_SUMMARY",json.dumps(results),flush=True)

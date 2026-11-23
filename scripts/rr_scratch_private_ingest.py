"""Seal TRI scratch-final release locally; decrypt and publish in GitHub Actions.

Only public RSA key and encrypted payload enter public GitHub. The RSA private
key is kept transiently in the already-private R2 bucket and destroyed after
successful R2 readback.
"""
import base64,datetime,hashlib,json,os,re,sys
from pathlib import Path
from urllib.request import Request,urlopen
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding,rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

BUCKET="rail-and-rye-private-cards"
DATE="2026-11-23"
KEY="projections/.encrypted-transfer/20261123-rsa.pem"
PUB="private-ingest/1123-r2-public.pem"
ENVELOPE="private-ingest/1123-scratch.enc.json"
AAD=b"RAIL-RYE|20261123|SCRATCH-FINAL|v1"
EXPECTED={"Finger Lakes":(8,55,5),"Mahoning Valley":(10,85,7),"Parx Racing":(9,54,11),"Zia Park":(10,67,6),"Mountaineer":(8,56,21)}
F4=("exact_p1","exact_p2","exact_p3","exact_p4","exact_p5","p6_plus","top2","top3","top4")

def check(x,msg):
 if not x:raise ValueError(msg)
def b64(x):return base64.b64encode(x).decode()
def ub64(x):return base64.b64decode(x,validate=True)
def sha(x):return hashlib.sha256(x).hexdigest()
def js(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()

def verify(payload):
 check(isinstance(payload,dict) and set(payload)=={"cards"},"Expected sealed five-card release")
 cards=payload["cards"]
 check(isinstance(cards,list) and len(cards)==5 and {c.get("track_name") for c in cards}==set(EXPECTED),"Wrong track set")
 for c in cards:
  name=c["track_name"]; rcount,hcount,scount=EXPECTED[name];rr=c.get("races")
  check(c.get("race_date")==DATE and c.get("schema_version")==1 and c.get("projection_status")=="scratch_final","Wrong scratch-final identity")
  check(c.get("factor_basis")=="verified_prescratch","Bad factor provenance")
  receipts=c.get("model_receipts") or {}
  check(all(re.fullmatch("[a-f0-9]{64}",str(receipts.get(k,""))) for k in ("tri_sha256","f4_sha256","prescratch_parent_sha256","official_changes_sha256")),"Missing certified receipt lineage")
  check(isinstance(rr,list) and len(rr)==rcount and sorted(r["race_number"] for r in rr)==list(range(1,rcount+1)),f"{name}: bad races")
  check(sum(len(r["entries"]) for r in rr)==hcount and sum(len(r["scratches"]) for r in rr)==scount,f"{name}: field count drift")
  for r in rr:
   horses=r["entries"]; scratches=r["scratches"]; prog=[str(e["program_number"]) for e in horses]; out=[str(s["program_number"]) for s in scratches]
   check(r.get("scratch_count")==len(scratches) and len(set(prog))==len(prog) and len(set(out))==len(out) and not set(prog)&set(out),f"{name}: scratch roster mismatch")
   check(all(s.get("horse_name") for s in scratches),f"{name}: incomplete scratch names")
   total=0.
   for h in horses:
    p=h["win_probability_exact"];f=h["f4_probabilities"];total+=p
    check(h.get("horse_name") and h.get("trainer") and h.get("jockey") and 0<p<=100,f"{name}: missing runner/role")
    check(abs(h["win_probability"]-p)<.051 and abs(h["fair_odds_net_to_1_exact"]-(100/p-1))<1e-5,f"{name}: TRI display mismatch")
    check(all(k in f and 0<=f[k]<=1 for k in F4) and abs(sum(f[k] for k in F4[:6])-1)<1e-7 and abs(100*f["exact_p1"]-p)<1e-6,f"{name}: F4 mismatch")
    for k,a,b in (("top2","exact_p1","exact_p2"),("top3","top2","exact_p3"),("top4","top3","exact_p4")):
     check(abs(f[k]-f[a]-f[b])<1e-7,f"{name}: F4 top-place mismatch")
   check(abs(total-100)<1e-6,f"{name}: PWIN field mass != 100")
 return cards

def r2():
 import boto3
 account=os.getenv("TRI_CLOUDFLARE_ACCOUNT_ID","");id=os.getenv("TRI_R2_ACCESS_KEY_ID","");secret=os.getenv("TRI_R2_SECRET_ACCESS_KEY","")
 check(re.fullmatch("[0-9a-fA-F]{32}",account) and id and secret,"R2 secrets unavailable")
 return boto3.session.Session().client("s3",region_name="auto",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",aws_access_key_id=id,aws_secret_access_key=secret)

def bootstrap():
 client=r2()
 try: client.head_object(Bucket=BUCKET,Key=KEY)
 except Exception as e:
  if getattr(e,"response",{}).get("Error",{}).get("Code") not in ("404","NoSuchKey","NotFound"):raise
 else:raise ValueError("Existing transfer key must not be silently replaced")
 private=rsa.generate_private_key(public_exponent=65537,key_size=3072)
 pub=private.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
 priv=private.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
 client.put_object(Bucket=BUCKET,Key=KEY,Body=priv,ContentType="application/x-pem-file",CacheControl="private,no-store",Metadata={"purpose":"one-time-encrypted-release","pubsha256":sha(pub)})
 token=os.getenv("GH_TOKEN","");repo=os.getenv("GITHUB_REPOSITORY","")
 check(token and repo=="scottjazdzewski/rail-and-rye-website","GitHub publisher authority missing")
 body=js({"message":"Stage public encryption key for private TRI scratch update","content":b64(pub),"branch":"main"})
 req=Request(f"https://api.github.com/repos/{repo}/contents/{PUB}",data=body,method="PUT",headers={"Authorization":f"Bearer {token}","Accept":"application/vnd.github+json","Content-Type":"application/json"})
 with urlopen(req,timeout=30) as response:check(response.status in (200,201),"GitHub public-key commit rejected")
 print("R2_SEALED_INGEST_KEY_READY: private key remains exclusively in R2")

def encrypt(source,pubfile,outfile):
 raw=Path(source).read_bytes();verify(json.loads(raw));pubdata=Path(pubfile).read_bytes();pub=serialization.load_pem_public_key(pubdata)
 aes=AESGCM.generate_key(bit_length=256);nonce=os.urandom(12)
 wrapped=pub.encrypt(aes,padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()),algorithm=hashes.SHA256(),label=AAD))
 sealed=AESGCM(aes).encrypt(nonce,raw,AAD)
 Path(outfile).write_bytes(js({"schema_version":1,"transfer":"RAIL_RYE_20261123_SCRATCH_FINAL","pubsha256":sha(pubdata),"wrapped_key":b64(wrapped),"nonce":b64(nonce),"sealed_payload":b64(sealed)}))
 print("ENCRYPTED_RELEASE_READY: no plaintext scores in repository")

def publish():
 client=r2();env=json.loads(Path(ENVELOPE).read_text());check(env.get("transfer")=="RAIL_RYE_20261123_SCRATCH_FINAL","Wrong encrypted transfer")
 private=serialization.load_pem_private_key(client.get_object(Bucket=BUCKET,Key=KEY)["Body"].read(),password=None)
 pub=private.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
 check(env.get("pubsha256")==sha(pub),"Incorrect recipient key")
 session=private.decrypt(ub64(env["wrapped_key"]),padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()),algorithm=hashes.SHA256(),label=AAD))
 raw=AESGCM(session).decrypt(ub64(env["nonce"]),ub64(env["sealed_payload"]),AAD)
 cards=verify(json.loads(raw));pending=[]
 for c in cards:
  target=f"projections/dashboard/{DATE}/"+re.sub("[^a-z0-9]+","-",c["track_name"].lower()).strip("-")+".json"
  try:existing=json.loads(client.get_object(Bucket=BUCKET,Key=target)["Body"].read())
  except Exception as e:
   if getattr(e,"response",{}).get("Error",{}).get("Code") not in ("404","NoSuchKey","NotFound"):raise
   existing=None
  if existing:
   check(existing.get("projection_status") in ("prescratch","scratch_final"),"Refusing to overwrite unknown card state")
   if existing["projection_status"]=="scratch_final":check(existing.get("model_receipts")==c["model_receipts"],"Different scratch-final receipt exists")
  pending.append((c["track_name"],target,js(c)))
 now=datetime.datetime.now(datetime.timezone.utc).isoformat()
 for name,key,blob in pending:
  client.put_object(Bucket=BUCKET,Key=key,Body=blob,ContentType="application/json; charset=utf-8",CacheControl="private,no-store",Metadata={"uploaded_at":now,"stage":"scratch_final","source_sha256":sha(raw)})
  actual=client.get_object(Bucket=BUCKET,Key=key)["Body"].read();check(actual==blob,"R2 readback hash mismatch: "+name)
  print("R2_SCRATCH_VERIFIED",name,sha(actual))
 client.delete_object(Bucket=BUCKET,Key=KEY)
 print("R2_SCRATCH_PUBLISHED_AND_READBACK_OK tracks=5 races=45 active=317 scratches=50")

if __name__=="__main__":
 if len(sys.argv)>1 and sys.argv[1]=="encrypt":
  check(len(sys.argv)==5,"encrypt SOURCE PUBLIC_KEY OUTPUT");encrypt(*sys.argv[2:])
 else:
  check(os.getenv("GITHUB_REPOSITORY")=="scottjazdzewski/rail-and-rye-website","Wrong GitHub repo")
  publish() if Path(ENVELOPE).exists() else bootstrap()

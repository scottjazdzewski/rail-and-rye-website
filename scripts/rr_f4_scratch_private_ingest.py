"""Sealed 2026-11-23 certified F4 scratch-final private release.
The RSA private key and resulting F4 coefficients never enter the public repo.
Every track is verified against the ALREADY DEPLOYED private R2 dashboard
before any private F4 source is updated.
"""
import base64,datetime,hashlib,json,math,os,re,sys,zlib
from pathlib import Path
from urllib.request import Request,urlopen
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding,rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import boto3

BUCKET="rail-and-rye-private-cards"
DATE="2026-11-23"
ENC="private-ingest/1123-f4-scratch.enc.json"
PUB="private-ingest/1123-f4-scratch-public.pem"
KEY="projections/.encrypted-transfer/20261123-scratch-f4-private.pem"
AAD=b"RAIL-RYE|20261123|F4-SCRATCH-JOINT|1"
MODEL="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET"
EXPECTED={"Finger Lakes":(8,55,5),"Mahoning Valley":(10,85,7),"Parx Racing":(9,54,11),"Zia Park":(10,67,6),"Mountaineer":(8,56,21)}
RECEIPTS=("tri_sha256","f4_sha256","prescratch_parent_sha256","official_changes_sha256")
def check(ok,msg):
 if not ok:raise RuntimeError(msg)
def sha(data):return hashlib.sha256(data).hexdigest()
def enc(data):return base64.b64encode(data).decode()
def dec(value):return base64.b64decode(value,validate=True)
def jsonbytes(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def slug(s):return re.sub("[^a-z0-9]+","-",s.lower()).strip("-")
def valid_hash(x):return isinstance(x,str) and bool(re.fullmatch("[0-9a-f]{64}",x))
def r2():
 account=os.getenv("TRI_CLOUDFLARE_ACCOUNT_ID","")
 access=os.getenv("TRI_R2_ACCESS_KEY_ID","")
 secret=os.getenv("TRI_R2_SECRET_ACCESS_KEY","")
 check(bool(re.fullmatch("[0-9a-fA-F]{32}",account)) and access and secret,"Private R2 secrets unavailable")
 return boto3.session.Session().client("s3",region_name="auto",endpoint_url="https://"+account+".r2.cloudflarestorage.com",aws_access_key_id=access,aws_secret_access_key=secret)
def read_optional(client,key):
 try:return client.get_object(Bucket=BUCKET,Key=key)["Body"].read()
 except Exception as err:
  if getattr(err,"response",{}).get("Error",{}).get("Code") in ("404","NoSuchKey","NotFound"):return None
  raise
def check_pairs(track,card,model):
 check(card.get("projection_status")=="scratch_final" and card.get("track_name")==track and card.get("race_date")==DATE,"Wrong live card identity")
 check(model.get("schema_version")==2 and model.get("model_id")==MODEL and model.get("scratch_state")=="SCRATCH_FINAL" and model.get("date")==DATE and model.get("track_name")==track,"Wrong frozen F4 identity")
 receipt=card.get("model_receipts",{})
 check(isinstance(receipt,dict) and isinstance(model.get("dashboard_receipts"),dict),"Missing receipt linkage")
 check(all(valid_hash(receipt.get(k)) and model["dashboard_receipts"].get(k)==receipt[k] for k in RECEIPTS),"R2 dashboard receipt differs from encrypted F4")
 check(model.get("f4_receipt_sha256")==receipt["f4_sha256"] and valid_hash(model.get("prefix_file_sha256")),"Invalid F4 or ordered-prefix hash")
 races=card.get("races",[]);coeff=model.get("races",[])
 check(isinstance(races,list) and isinstance(coeff,list) and len(races)==len(coeff) and {r["race_number"] for r in races}=={r["race_number"] for r in coeff},"Races not identical")
 er,eh,es=EXPECTED[track]
 check(len(races)==er and sum(len(r["entries"]) for r in races)==eh and sum(len(r["scratches"]) for r in races)==es,"Expected races/runners/scratches drifted")
 for race in races:
  sample=next(r for r in coeff if r["race_number"]==race["race_number"])
  active=race["entries"];scratches=race["scratches"]
  programs=[str(x["program_number"]) for x in active]
  check(len(programs)>=4 and len(set(programs))==len(programs) and len(scratches)==race["scratch_count"] and not(set(programs)&{str(x["program_number"]) for x in scratches}),"Active scratch field mismatch")
  check(sample["programs"]==programs,"F4 runner list/order mismatches private dashboard")
  pwin=sample["pwin"];w2=sample["p2_weights"];w3=sample["p3_weights"];n=len(programs)
  check(all(isinstance(x,list) and len(x)==n for x in (pwin,w2,w3)) and all(isinstance(z,(int,float)) and math.isfinite(z) and z>0 for x in (pwin,w2,w3) for z in x),"Incomplete ordered F4 weights")
  check(abs(sum(pwin)-1)<1e-8,"PWIN does not normalize")
  m2=[0.]*n;m3=[0.]*n;s2=sum(w2);s3=sum(w3);mass2=mass3=0.
  for i in range(n):
   for j in range(n):
    if i==j:continue
    two=pwin[i]*w2[j]/(s2-w2[i]);m2[j]+=two;mass2+=two
    for k in range(n):
     if k==i or k==j:continue
     three=two*w3[k]/(s3-w3[i]-w3[j]);m3[k]+=three;mass3+=three
  check(abs(mass2-1)<1e-8 and abs(mass3-1)<1e-8,"Exotic stage distribution not normalized")
  for i,runner in enumerate(active):
   f=runner["f4_probabilities"]
   check(abs(runner["win_probability_exact"]/100-pwin[i])<1e-8 and abs(f["exact_p1"]-pwin[i])<1e-8 and abs(f["exact_p2"]-m2[i])<1e-8 and abs(f["exact_p3"]-m3[i])<1e-8,"F4 ordered distribution differs from current winning/placing marginals")
def bootstrap(client):
 check(read_optional(client,KEY) is None,"Cannot overwrite previously issued one-time private key")
 private=rsa.generate_private_key(public_exponent=65537,key_size=3072)
 pub=private.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
 priv=private.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
 client.put_object(Bucket=BUCKET,Key=KEY,Body=priv,ContentType="application/x-pem-file",CacheControl="private,no-store",Metadata={"pubsha256":sha(pub),"purpose":"20261123-verified-f4-joint-release"})
 token=os.getenv("GH_TOKEN","");repo=os.getenv("GITHUB_REPOSITORY","")
 check(token and repo=="scottjazdzewski/rail-and-rye-website","GitHub publisher identity unavailable")
 data=jsonbytes({"message":"Stage public encryption key for private certified F4 release","content":enc(pub),"branch":"main"})
 request=Request("https://api.github.com/repos/"+repo+"/contents/"+PUB,data=data,method="PUT",headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","Content-Type":"application/json"})
 with urlopen(request,timeout=30) as r:check(r.status in (200,201),"Could not stage F4 encryption key")
 print("F4_PRIVATE_ENCRYPTION_KEY_READY "+sha(pub))
def publish(client):
 blob=json.loads(Path(ENC).read_text())
 check(blob.get("transfer")=="RR_20261123_F4_SCRATCH_FINAL" and blob.get("schema_version")==1,"Wrong sealed transfer")
 key=read_optional(client,KEY);check(key is not None,"One-time private key already destroyed")
 priv=serialization.load_pem_private_key(key,password=None)
 pub=priv.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
 check(sha(pub)==blob.get("pubsha256"),"Different encryption key")
 aes=priv.decrypt(dec(blob["wrapped_key"]),padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()),algorithm=hashes.SHA256(),label=AAD))
 clear=zlib.decompress(AESGCM(aes).decrypt(dec(blob["nonce"]),dec(blob["sealed_payload"]),AAD))
 check(len(clear)<2_000_000,"Sealed F4 payload size limit")
 source=json.loads(clear);cards=source.get("cards")
 check(isinstance(cards,list) and len(cards)==5 and {c["track_name"] for c in cards}==set(EXPECTED),"Incomplete five-track release")
 batch=[]
 for model in cards:
  track=model["track_name"];path="projections/dashboard/"+DATE+"/"+slug(track)+".json";stored=read_optional(client,path)
  check(stored is not None,"Published dashboard missing: "+track)
  card=json.loads(stored)
  check_pairs(track,card,model)
  target="projections/f4-ordered/"+DATE+"/"+slug(track)+".json"
  old=read_optional(client,target)
  if old is not None:
   existing=json.loads(old)
   check(existing.get("scratch_state") in ("PRESCRATCH","SCRATCH_FINAL"),"Unrecognized prior F4 state")
   if existing.get("scratch_state")=="SCRATCH_FINAL":
    check(existing.get("dashboard_receipts")==model["dashboard_receipts"],"Conflicting existing scratch-final F4 source")
  batch.append((track,target,jsonbytes(model)))
 print("SCRATCH_F4_PREFLIGHT_PASS: 5 tracks 45 races 317 runners 50 scratches")
 for track,target,raw in batch:
  client.put_object(Bucket=BUCKET,Key=target,Body=raw,ContentType="application/json; charset=utf-8",CacheControl="private,no-store",Metadata={"f4_receipt_sha256":json.loads(raw)["f4_receipt_sha256"],"stage":"scratch_final"})
  back=read_optional(client,target);check(back==raw,"Private F4 readback mismatch for "+track)
  print("SCRATCH_F4_R2_READBACK_OK "+track+" "+sha(raw))
 client.delete_object(Bucket=BUCKET,Key=KEY)
 print("SCRATCH_F4_PRIVATE_R2_SUCCESS tracks=5 races=45 active=317 scratches=50")
if __name__=="__main__":
 check(os.getenv("GITHUB_REPOSITORY")=="scottjazdzewski/rail-and-rye-website","Wrong repository")
 client=r2()
 publish(client) if Path(ENC).exists() else bootstrap(client)

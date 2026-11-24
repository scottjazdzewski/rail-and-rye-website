"""One-time sealed November 24 TRI V4.1 + F4 V2 prescratch publisher.

Public GitHub receives *only encrypted* score payload and the public RSA key.
Private decrypt key is created in Cloudflare R2, used by an authenticated
GitHub runner and then deleted after verified R2 readback. This is a release
transport, not a scoring model or a PDF parser.
"""
import base64,datetime,hashlib,json,os,re,sys,zlib
from pathlib import Path
from urllib.request import Request,urlopen
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding,rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import boto3

DATE="2026-11-24"
BUCKET="rail-and-rye-private-cards"
KEY="projections/.encrypted-transfer/20261124-initial-private.pem"
PUB="private-ingest/1124-initial-public.pem"
ENVELOPE="private-ingest/1124-initial.enc.json"
AAD=b"RAIL-RYE|20261124|PROMOTED-TRI-V4.1-F4-V2|PRESCRATCH|1"
EXPECTED={"Delta Downs":(8,65),"Finger Lakes":(8,65),"Mahoning Valley":(8,67),
          "Mountaineer":(8,66),"Parx Racing":(9,74),"Zia Park":(10,93)}
MODEL="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET"
def check(ok,message):
 if not ok:raise ValueError(message)
def b64(data):return base64.b64encode(data).decode()
def unb64(s):return base64.b64decode(s,validate=True)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def hash_ok(s):return isinstance(s,str) and bool(re.fullmatch("[a-f0-9]{64}",s))
def slug(s):return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
def jsonbytes(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def r2():
 account=os.environ.get("TRI_CLOUDFLARE_ACCOUNT_ID","")
 access=os.environ.get("TRI_R2_ACCESS_KEY_ID","")
 secret=os.environ.get("TRI_R2_SECRET_ACCESS_KEY","")
 check(bool(re.fullmatch("[a-fA-F0-9]{32}",account)) and access and secret,"Private R2 secrets unavailable")
 return boto3.session.Session().client("s3",region_name="auto",endpoint_url="https://"+account+".r2.cloudflarestorage.com",aws_access_key_id=access,aws_secret_access_key=secret)
def get(client,key):
 try:return client.get_object(Bucket=BUCKET,Key=key)
 except Exception as e:
  if getattr(e,"response",{}).get("Error",{}).get("Code") in ("404","NoSuchKey","NotFound"):return None
  raise
def close(a,b):return isinstance(a,(int,float)) and abs(a-b)<1e-8
def inspect(card,model,source):
 name=card["track_name"];n_races,n_starters=EXPECTED[name]
 check(card.get("schema_version")==1 and card.get("race_date")==DATE and card.get("projection_status")=="prescratch","Wrong prescratch identity")
 check(card.get("model_name")=="TRI V4.1 / F4 V2" and card.get("factor_basis")=="verified_prescratch","Wrong frozen scorer or badge provenance")
 receipt=card.get("model_receipts") or {}
 check(hash_ok(receipt.get("tri_sha256")) and hash_ok(receipt.get("f4_sha256")),"Missing signed model lineage")
 check(source.get("track")==name and source.get("tri_receipt_sha256")==receipt["tri_sha256"] and source.get("f4_receipt_sha256")==receipt["f4_sha256"],"Receipt/source mismatch")
 check(source.get("f4_model_id")==MODEL and source.get("races")==n_races and source.get("runners")==n_starters,"Wrong signed track counts")
 check(hash_ok(source.get("source_sha256")) and hash_ok(source.get("badge_sha256")),"Signed input sources absent")
 check(model.get("schema_version")==2 and model.get("model_id")==MODEL and model.get("date")==DATE and model.get("track_name")==name and model.get("scratch_state")=="PRESCRATCH","Wrong F4 source identity")
 check(model.get("source_sha256")==source["source_sha256"] and model.get("badge_sha256")==source["badge_sha256"] and model.get("f4_receipt_sha256")==receipt["f4_sha256"] and hash_ok(model.get("prefix_file_sha256")),"F4 source provenance does not match")
 races=card.get("races",[]);f4=model.get("races",[])
 check(len(races)==len(f4)==n_races and len({r["race_number"] for r in races})==n_races,"Race missing from track release")
 check(sum(len(r["entries"]) for r in races)==n_starters,"Runner count mismatch")
 check({x["race_number"] for x in races}=={x["race_number"] for x in f4},"F4 races and TRI races disagree")
 for race in races:
  check(race.get("scratch_count") is None and race.get("scratches")==[],"Initial cards must NOT assert zero/final scratches")
  active=race["entries"];n=len(active)
  check(3<=n<=30 and len({str(x["program_number"]) for x in active})==n and all(x.get("jockey") and x.get("trainer") for x in active),"Unresolved initial field/connection")
  check(all(x.get("f4_probabilities") and len(x.get("metrics",[]))==5 and
        {m["label"] for m in x["metrics"]}=={"Speed","Form","Class","Pace Fit","Surface / Distance"} and
        all(m["value"] in ("green","gray","red") for m in x["metrics"]) for x in active),"Unverified or incomplete 5-factor data")
  check(abs(sum(x["win_probability_exact"] for x in active)-100)<1e-6,"PWIN field mass not 100%")
  for x in active:
   f=x["f4_probabilities"];check(close(f["exact_p1"],x["win_probability_exact"]/100) and
    abs(sum(f[z] for z in ("exact_p1","exact_p2","exact_p3","exact_p4","exact_p5","p6_plus"))-1)<1e-8,"F4 runner mass mismatch")
  m=next(q for q in f4 if q["race_number"]==race["race_number"])
  programs=[str(y) for y in m["programs"]];p1=m["pwin"];w2=m["p2_weights"];w3=m["p3_weights"]
  check(len(programs)==len(p1)==len(w2)==len(w3)==n and len(set(programs))==n,"Ordered F4 field mismatch")
  by_prog={str(x["program_number"]):x for x in active}
  check(set(programs)==set(by_prog),"F4 programs differ from live runners")
  check(abs(sum(p1)-1)<1e-8 and all(x>0 for x in p1+w2+w3),"Invalid ordered F4 weights")
  p2=[0.]*n;p3=[0.]*n;sum2=sum(w2);sum3=sum(w3);mass2=mass3=0.
  for i in range(n):
   check(close(p1[i],by_prog[programs[i]]["f4_probabilities"]["exact_p1"]),"F4 P1 != TRI")
   for j in range(n):
    if i==j:continue
    second=p1[i]*w2[j]/(sum2-w2[i]);p2[j]+=second;mass2+=second
    for k in range(n):
     if k in (i,j):continue
     third=second*w3[k]/(sum3-w3[i]-w3[j]);p3[k]+=third;mass3+=third
  check(abs(mass2-1)<1e-8 and abs(mass3-1)<1e-8,"F4 ordered outcome mass invalid")
  for i,prog in enumerate(programs):
   v=by_prog[prog]["f4_probabilities"]
   check(close(p2[i],v["exact_p2"]) and close(p3[i],v["exact_p3"]),"Exacta/trifecta source contradicts F4 positional marginals")
def bootstrap(client):
 check(get(client,KEY) is None,"Existing private transfer key requires manual review")
 private=rsa.generate_private_key(public_exponent=65537,key_size=3072)
 pub=private.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
 priv=private.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
 client.put_object(Bucket=BUCKET,Key=KEY,Body=priv,ContentType="application/x-pem-file",CacheControl="private,no-store",Metadata={"pubsha256":sha(pub)})
 token=os.environ.get("GH_TOKEN","")
 check(token and os.environ.get("GITHUB_REPOSITORY")=="scottjazdzewski/rail-and-rye-website","GitHub publication token missing")
 request=Request("https://api.github.com/repos/scottjazdzewski/rail-and-rye-website/contents/"+PUB,
  data=jsonbytes({"message":"Stage public key for sealed November 24 TRI prescratch transport","content":b64(pub),"branch":"main"}),
  method="PUT",headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","Content-Type":"application/json"})
 with urlopen(request,timeout=35) as reply:check(reply.status in (200,201),"Could not stage release public key")
 print("RR_1124_PRIVATE_KEY_BOOTSTRAP_OK sha256="+sha(pub))
def publish(client):
 env=json.loads(Path(ENVELOPE).read_text())
 check(env.get("transfer")=="RR_20261124_TRI_F4_INITIAL" and env.get("schema_version")==1,"Wrong encrypted release")
 obj=get(client,KEY);check(obj is not None,"Private decryption key absent")
 private=serialization.load_pem_private_key(obj["Body"].read(),password=None)
 pub=private.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
 check(env.get("pubsha256")==sha(pub),"Wrong private release key")
 aes=private.decrypt(unb64(env["wrapped_key"]),padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()),algorithm=hashes.SHA256(),label=AAD))
 raw=zlib.decompress(AESGCM(aes).decrypt(unb64(env["nonce"]),unb64(env["sealed_payload"]),AAD))
 check(len(raw)<4_000_000,"Release exceeds safe size limit")
 data=json.loads(raw);cards=data.get("cards");models=data.get("models");report=data.get("report")
 check(isinstance(cards,list) and isinstance(models,list) and len(cards)==len(models)==len(EXPECTED),"Incomplete six-track release")
 check(isinstance(report,dict) and report.get("date")==DATE,"Release receipt manifest missing")
 card_by={x["track_name"]:x for x in cards};model_by={x["track_name"]:x for x in models}
 check(set(card_by)==set(model_by)==set(EXPECTED),"Wrong source tracks")
 sources={x["track"]:x for x in report["tracks"]};check(set(sources)==set(EXPECTED),"Missing source receipt records")
 pending=[]
 for name in EXPECTED:
  card,model,source=card_by[name],model_by[name],sources[name]
  inspect(card,model,source)
  slugname=slug(name)
  path="projections/dashboard/"+DATE+"/"+slugname+".json"
  f4path="projections/f4-ordered/"+DATE+"/"+slugname+".json"
  existing=get(client,path)
  if existing is not None:
   old=json.loads(existing["Body"].read())
   check(old.get("projection_status")!="scratch_final","Never downgrade already scratch-final race")
   check(old.get("projection_status") in ("prescratch",),"Refusing to overwrite unknown live state")
   check(old.get("model_receipts")==card["model_receipts"],"Different TRI/F4 source already exists for this date; hold replacement")
  previous=get(client,f4path)
  if previous is not None:
   oldf=json.loads(previous["Body"].read())
   check(oldf.get("scratch_state")=="PRESCRATCH" and oldf.get("f4_receipt_sha256")==model["f4_receipt_sha256"],"Do not overwrite different/final F4 ordered source")
  pending.append((name,path,f4path,card,model,source))
 print("RR_1124_PREWRITE_GATE_PASS tracks=6 races=51 runners=430 factor_states=2150")
 now=datetime.datetime.now(datetime.timezone.utc).isoformat()
 for name,path,f4path,card,model,source in pending:
  modelraw=jsonbytes(model)
  client.put_object(Bucket=BUCKET,Key=f4path,Body=modelraw,ContentType="application/json; charset=utf-8",CacheControl="private,no-store",Metadata={"stage":"PRESCRATCH","uploaded_at":now,"f4_receipt_sha256":model["f4_receipt_sha256"]})
  readback=get(client,f4path);check(readback is not None and readback["Body"].read()==modelraw,"Private F4 readback mismatch "+name)
  print("RR_1124_ORDERED_F4_READBACK_PASS "+name,flush=True)
 for name,path,f4path,card,model,source in pending:
  rawcard=jsonbytes(card)
  metadata={"uploaded_at":now,"source_sha256":source["source_sha256"],"badge_sha256":source["badge_sha256"],"stage":"PRESCRATCH","f4_receipt_sha256":model["f4_receipt_sha256"]}
  client.put_object(Bucket=BUCKET,Key=path,Body=rawcard,ContentType="application/json; charset=utf-8",CacheControl="private,no-store",Metadata=metadata)
  back=get(client,path);check(back is not None and back["Body"].read()==rawcard,"Private dashboard readback mismatch "+name)
  cm=back.get("Metadata",{})
  check(cm.get("source_sha256")==metadata["source_sha256"] and cm.get("badge_sha256")==metadata["badge_sha256"],"F4 source metadata proof not persisted")
  print("RR_1124_INITIAL_CARD_READBACK_PASS "+name+" "+sha(rawcard),flush=True)
 manifest={"status":"PRESCRATCH_PUBLISHED_AND_VERIFIED","race_date":DATE,"races":51,"runners":430,"tracks":list(EXPECTED),"release_sha256":sha(raw),"scoring_model":"TRI V4.1 / F4 V2","badge_evaluator":"TBS_FACTOR_BADGE_EVALUATOR_V1_2_6_FIT_CLASS_FORM_GUARDS","uploaded_at":now}
 key="projections/qa/"+DATE+"/initial-release-manifest.json"
 client.put_object(Bucket=BUCKET,Key=key,Body=jsonbytes(manifest),ContentType="application/json",CacheControl="private,no-store")
 check(get(client,key)["Body"].read()==jsonbytes(manifest),"Release manifest readback mismatch")
 client.delete_object(Bucket=BUCKET,Key=KEY)
 print("RR_1124_ALL_PRIVATE_READBACKS_PASS tracks=6 races=51 runners=430 factor_states=2150",flush=True)
if __name__=="__main__":
 check(os.environ.get("GITHUB_REPOSITORY")=="scottjazdzewski/rail-and-rye-website","Repository authority mismatch")
 conn=r2()
 publish(conn) if Path(ENVELOPE).exists() else bootstrap(conn)

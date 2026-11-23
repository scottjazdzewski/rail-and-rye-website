#!/usr/bin/env python3
"""One-time encrypted distribution of signed F4 exotic conditional law to R2.

No proprietary horse data or secrets in GitHub. RSA-3072 private key exists
only temporarily in private R2. AES-256-GCM ciphertext is safe for transport.
The exact recovered input file was validated offline against every frozen F4
ordered exacta/trifecta/superfecta prefix and runner P1..P4 position marginal.
"""
import argparse
import base64
import brotli
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys

BUCKET="rail-and-rye-private-cards"
DATE="2026-11-23"
KEY="projections/intake-keys/tri-20261123-f4-exotics-rsa.pem"
MODEL="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET"
SOURCE="14a6cff824fd69626010b4fff969d67812cc9d5b7269642705cb52ac6ab80307"
BADGE="9182feead400d01464a793903d4f63445e50e0c7b2078f404294e262f409774b"
SHA="926284a4444aaa771e1d08d79d03c8e831ca0a47a8cf2d435095eeea365dbaa0"
AAD=b"RAIL-RYE-F4-EXOTIC-PROBABILITIES-2026-11-23"
TRACKS={
 "Finger Lakes":("FL","finger-lakes",8,60),
 "Mountaineer":("MNR","mountaineer",8,77),
 "Mahoning Valley":("MVR","mahoning-valley",10,92),
 "Parx Racing":("PRX","parx-racing",9,65),
 "Zia Park":("ZIA","zia-park",10,73)
}
def require(value,msg):
 if not value:raise RuntimeError(msg)
def client():
 import boto3
 account=os.environ.get("TRI_CLOUDFLARE_ACCOUNT_ID","").strip()
 key=os.environ.get("TRI_R2_ACCESS_KEY_ID","").strip()
 secret=os.environ.get("TRI_R2_SECRET_ACCESS_KEY","").strip()
 require(bool(re.fullmatch("[0-9a-fA-F]{32}",account)) and len(key)==32 and secret,
         "Cloudflare R2 credentials are not configured correctly")
 return boto3.client("s3",region_name="auto",
  endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
  aws_access_key_id=key,aws_secret_access_key=secret)
def optional(r2,key):
 from botocore.exceptions import ClientError
 try:return r2.get_object(Bucket=BUCKET,Key=key)
 except ClientError as exc:
  if exc.response.get("Error",{}).get("Code") in ("NoSuchKey","404","NotFound"):return None
  raise

def bootstrap(r2):
 from cryptography.hazmat.primitives.asymmetric import rsa
 from cryptography.hazmat.primitives import serialization
 saved=optional(r2,KEY)
 if saved is None:
  private=rsa.generate_private_key(public_exponent=65537,key_size=3072)
  blob=private.private_bytes(serialization.Encoding.PEM,
       serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
  r2.put_object(Bucket=BUCKET,Key=KEY,Body=blob,
       ContentType="application/x-pem-file",CacheControl="private, no-store")
 else:
  private=serialization.load_pem_private_key(saved["Body"].read(),password=None)
 public=private.public_key().public_bytes(serialization.Encoding.PEM,
                                          serialization.PublicFormat.SubjectPublicKeyInfo)
 print("TRI_EXOTIC_RSA_PUBLIC_B64="+base64.b64encode(public).decode("ascii"))
 print("TRI_F4_PRIVATE_MODEL_KEY_READY")

def validate(blob):
 require(len(blob)<80000 and hashlib.sha256(blob).hexdigest()==SHA,
         "Verified frozen-F4 private exotic source checksum differs")
 root=json.loads(blob)
 require(root.get("schema_version")==2 and root.get("date")==DATE
         and root.get("model_id")==MODEL and root.get("scratch_state")=="PRESCRATCH"
         and root.get("source_sha256")==SOURCE and root.get("badge_sha256")==BADGE,
         "Certified exotic model root identity is invalid")
 tracks=root.get("tracks")
 require(isinstance(tracks,list) and len(tracks)==5
         and {t.get("track_name") for t in tracks}==set(TRACKS),
         "Incomplete signed five-track exotic model package")
 races=horses=0
 for track in tracks:
  code,slug,racecount,runnercount=TRACKS[track["track_name"]]
  require(track.get("track_code")==code and
          bool(re.fullmatch("[a-f0-9]{64}",track.get("f4_receipt_sha256",""))) and
          bool(re.fullmatch("[a-f0-9]{64}",track.get("prefix_file_sha256",""))),
          "Missing F4 scorer receipt or prefix checksum")
  r=track.get("races")
  require(isinstance(r,list) and len(r)==racecount and
          len({x.get("race_number") for x in r})==racecount,
          "Incomplete model track race field")
  n=0
  for race in r:
   program=race.get("programs");p=race.get("pwin")
   w2=race.get("p2_weights");w3=race.get("p3_weights")
   require(isinstance(program,list) and len(program)>=4 and
           len(program)==len(set(program)) and all(isinstance(x,str) and x for x in program),
           "Incomplete F4 program roster")
   count=len(program);n+=count
   require(all(isinstance(vector,list) and len(vector)==count for vector in [p,w2,w3]),
           "Missing normalized model vectors")
   require(all(isinstance(x,(int,float)) and math.isfinite(x) and x>0 for vector in [p,w2,w3] for x in vector)
           and abs(sum(p)-1)<1e-8,
           "Invalid F4 conditional law")
   races+=1
  require(n==runnercount,"Approved runner count differs from F4 source")
  horses+=n
 require((races,horses)==(45,367),"Private F4 model is not complete")
 return root

def decrypt(r2,path):
 from cryptography.hazmat.primitives.ciphers.aead import AESGCM
 from cryptography.hazmat.primitives.asymmetric import padding
 from cryptography.hazmat.primitives import hashes,serialization
 env=json.loads(Path(path).read_text())
 require(env.get("version")==1 and env.get("date")==DATE
         and env.get("compression")=="brotli","Wrong encrypted F4 source header")
 saved=optional(r2,KEY)
 require(saved is not None,"Private RSA transfer key is missing")
 private=serialization.load_pem_private_key(saved["Body"].read(),password=None)
 wrapped=base64.b64decode(env["wrapped_key_b64"],validate=True)
 nonce=base64.b64decode(env["nonce_b64"],validate=True)
 ciphertext=base64.b64decode(env["ciphertext_b64"],validate=True)
 require(len(nonce)==12 and 10<len(ciphertext)<55000 and len(wrapped)<1000,
         "Invalid sealed F4 source bounds")
 aes=private.decrypt(wrapped,padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                        algorithm=hashes.SHA256(),label=None))
 plain=brotli.decompress(AESGCM(aes).decrypt(nonce,ciphertext,AAD))
 return validate(plain)

def inspect_source(r2,root):
 plans=[]
 for track in root["tracks"]:
  code,slug,_,_=TRACKS[track["track_name"]]
  cardkey=f"projections/dashboard/{DATE}/{slug}.json"
  obj=optional(r2,cardkey)
  require(obj is not None,"Matching private prescratch projection card is unavailable")
  metadata=obj.get("Metadata") or {}
  require(metadata.get("source_sha256")==SOURCE
          and metadata.get("badge_sha256")==BADGE,
          "Current private cards differ from validated model and badge source")
  card=json.loads(obj["Body"].read())
  require(card.get("race_date")==DATE and card.get("track_name")==track["track_name"]
          and card.get("projection_status")=="prescratch",
          "A post-scratch or foreign card must not receive prescratch probabilities")
  actual={r["race_number"]:r for r in card["races"]}
  require(len(actual)==len(track["races"]),"R2 race set changed")
  for r in track["races"]:
   live=actual.get(r["race_number"])
   require(live is not None,"One projected race is missing")
   runner={str(e["program_number"]):e for e in live["entries"]}
   progs=r["programs"];N=len(progs)
   require(len(runner)==len(progs) and set(runner)==set(progs)
      and not live.get("scratches") and live.get("scratch_count") is None,
      "Horse roster or scratch state differs from verified F4 model")
   pwin=dict(zip(progs,r["pwin"]))
   p2w=dict(zip(progs,r["p2_weights"]))
   p3w=dict(zip(progs,r["p3_weights"]))
   p2={p:0. for p in progs};p3={p:0. for p in progs}
   w2sum=sum(p2w.values());w3sum=sum(p3w.values())
   for a in progs:
    for b in progs:
     if a==b:continue
     pair=pwin[a]*p2w[b]/(w2sum-p2w[a]);p2[b]+=pair
     for c in progs:
      if c not in (a,b):
       p3[c]+=pair*p3w[c]/(w3sum-p3w[a]-p3w[b])
   for p in progs:
    e=runner[p]
    f=e.get("f4_probabilities") or {}
    require(abs(e["win_probability_exact"]/100-pwin[p])<1e-9
       and abs(f["exact_p1"]-pwin[p])<1e-9
       and abs(f["exact_p2"]-p2[p])<1e-8
       and abs(f["exact_p3"]-p3[p])<1e-8,
       "Frozen F4 model output does not reproduce current runner P1/P2/P3")
  bundle={k:root[k] for k in ("schema_version","model_id","date","scratch_state",
                            "source_sha256","badge_sha256")}
  bundle.update(track)
  key=f"projections/f4-ordered/{DATE}/{slug}.json"
  previous=optional(r2,key)
  if previous:
   old=json.loads(previous["Body"].read())
   require(old.get("scratch_state")=="PRESCRATCH",
           "Refusing to replace a scratch-adjusted exotic model")
  body=json.dumps(bundle,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
  require(len(body)<30000,"F4 model track file unexpectedly large")
  plans.append((key,body,{"source_sha256":SOURCE,"badge_sha256":BADGE,
                          "f4_receipt_sha256":track["f4_receipt_sha256"]}))
 return plans

def publish(r2,encrypted):
 root=decrypt(r2,encrypted)
 plans=inspect_source(r2,root) # All five track cards preflight before any writes
 for key,body,metadata in plans:
  r2.put_object(Bucket=BUCKET,Key=key,Body=body,
   ContentType="application/json; charset=utf-8",
   CacheControl="private, no-store",Metadata=metadata)
 for key,body,metadata in plans:
  item=optional(r2,key)
  require(item is not None and item["Body"].read()==body
          and item.get("Metadata",{}).get("source_sha256")==SOURCE
          and item.get("Metadata",{}).get("f4_receipt_sha256")==metadata["f4_receipt_sha256"],
          "Source-certified private F4 model read-back did not match")
 r2.delete_object(Bucket=BUCKET,Key=KEY)
 print("TRI_F4_EXOTICS_PRIVATE_R2_SUCCESS tracks=5 races=45 runners=367 "
       "signed_prefixes=EXACT_P2_P3_P4 verified_conditional_law=PASS "
       "private_model_readback=PASS key_deleted=true")

def main():
 parser=argparse.ArgumentParser()
 parser.add_argument("action",choices=["bootstrap","publish"])
 parser.add_argument("--sealed-file")
 args=parser.parse_args()
 try:
  r2=client()
  if args.action=="bootstrap":bootstrap(r2)
  else:
   require(args.sealed_file,"--sealed-file is required")
   publish(r2,args.sealed_file)
 except Exception as exc:
  print("TRI_F4_EXOTIC_HOLD: "+type(exc).__name__+": "+str(exc)[:170],file=sys.stderr)
  sys.exit(2)
if __name__=="__main__":main()

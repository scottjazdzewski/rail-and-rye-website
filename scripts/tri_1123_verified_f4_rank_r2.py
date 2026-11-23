#!/usr/bin/env python3
"""One-time source-verified 2026-11-23 F4 V2 display-order patch to private R2.

Only sealed AES-256-GCM/Brotli ciphertext is committed temporarily to the
public website repository. RSA private key never leaves the private R2 bucket.
All model probabilities, scores, badge states, trainer/jockey and scratch
metadata are retained exactly; only rank and whole-row display order change.
"""
import argparse
import base64
import brotli
import hashlib
import json
import math
import os
import re
import sys
from pathlib import Path

DATE = "2026-11-23"
BUCKET = "rail-and-rye-private-cards"
KEY = "projections/intake-keys/tri-20261123-f4-verified-rank-rsa.pem"
PATCH_SHA = "9a79f46394290e27a790f085e1f3084de5b68070d23ba70d43797de484051a27"
SOURCE_SHA = "14a6cff824fd69626010b4fff969d67812cc9d5b7269642705cb52ac6ab80307"
BADGE_SHA = "9182feead400d01464a793903d4f63445e50e0c7b2078f404294e262f409774b"
AAD = b"RAIL-RYE-VERIFIED-F4-V2-FINISH-RANK-2026-11-23"
TRACKS = {
 "Finger Lakes":("FL","finger-lakes",8,60),
 "Mountaineer":("MNR","mountaineer",8,77),
 "Mahoning Valley":("MVR","mahoning-valley",10,92),
 "Parx Racing":("PRX","parx-racing",9,65),
 "Zia Park":("ZIA","zia-park",10,73),
}

def require(value,message):
 if not value:raise RuntimeError(message)

def client():
 import boto3
 account=os.environ.get("TRI_CLOUDFLARE_ACCOUNT_ID","").strip()
 key=os.environ.get("TRI_R2_ACCESS_KEY_ID","").strip()
 secret=os.environ.get("TRI_R2_SECRET_ACCESS_KEY","").strip()
 require(bool(re.fullmatch(r"[a-fA-F0-9]{32}",account)) and key and secret,
         "Private Cloudflare R2 credentials unavailable")
 return boto3.client("s3",region_name="auto",
     endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
     aws_access_key_id=key,aws_secret_access_key=secret)

def optional_get(r2,key):
 from botocore.exceptions import ClientError
 try:return r2.get_object(Bucket=BUCKET,Key=key)
 except ClientError as exc:
  if exc.response.get("Error",{}).get("Code") in ("NoSuchKey","404","NotFound"):
   return None
  raise

def bootstrap(r2):
 from cryptography.hazmat.primitives.asymmetric import rsa
 from cryptography.hazmat.primitives import serialization
 item=optional_get(r2,KEY)
 if item is None:
  private=rsa.generate_private_key(public_exponent=65537,key_size=3072)
  pem=private.private_bytes(serialization.Encoding.PEM,
       serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
  r2.put_object(Bucket=BUCKET,Key=KEY,Body=pem,
       ContentType="application/x-pem-file",CacheControl="private, no-store")
 else:
  private=serialization.load_pem_private_key(item["Body"].read(),password=None)
 public=private.public_key().public_bytes(
        serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
 print("TRI_F4_TRANSFER_PUBLIC_KEY_B64="+base64.b64encode(public).decode("ascii"))
 print("PRIVATE_F4_TRANSFER_KEY_READY")

def validate(bytes_data):
 require(hashlib.sha256(bytes_data).hexdigest()==PATCH_SHA,
         "F4 rank patch SHA-256 differs from certified 367-runner source")
 p=json.loads(bytes_data)
 require(p.get("patch_version")==1 and p.get("race_date")==DATE
  and p.get("base_model_source_sha256")==SOURCE_SHA
  and p.get("badge_sha256")==BADGE_SHA
  and p.get("f4_model")=="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET"
  and p.get("rank_law")=="TOP_EXACT_TRI_PWIN_THEN_ASCENDING_F4_V2_EXPECTED_FINISH",
  "Wrong model, source or approved F4 rank policy")
 tracks=p.get("tracks")
 require(isinstance(tracks,list) and len(tracks)==5 and
         {t.get("track_name") for t in tracks}==set(TRACKS),
         "Missing or duplicated track patch")
 total_races=total_horses=0
 for track in tracks:
  code,slug,racecount,horsecount=TRACKS[track["track_name"]]
  require(track.get("track_code")==code and
          re.fullmatch(r"[a-f0-9]{64}",track.get("f4_receipt_sha256","")) is not None,
          "Invalid certified F4 model receipt proof")
  races=track.get("races")
  require(isinstance(races,list) and len(races)==racecount and
          len({r.get("race_number") for r in races})==racecount,
          "F4 patch race field mismatch")
  n=0
  for race in races:
   horses=race.get("entries")
   require(isinstance(horses,list) and len(horses)>=2,
           "Empty approved F4 race field")
   require(len({str(h.get("program_number")) for h in horses})==len(horses)
           and len({h.get("horse_name") for h in horses})==len(horses),
           "Duplicate F4 horse identity")
   ranks=sorted(h.get("rank") for h in horses)
   require(ranks==list(range(1,len(horses)+1)),"Incomplete projected ranks")
   for horse in horses:
    require(bool(horse.get("horse_name"))
         and math.isfinite(float(horse.get("win_probability_exact",float("nan"))))
         and math.isfinite(float(horse.get("f4_expected_position",float("nan"))))
         and 1<=float(horse["f4_expected_position"])<=len(horses)
         and 0<float(horse["win_probability_exact"])<=100,
         "Invalid F4 source horse or expected position")
   leader=max(horses,key=lambda h:h["win_probability_exact"])
   require(leader["rank"]==1,"Exact TRI PWIN favorite must appear first")
   followers=sorted((h for h in horses if h["rank"]>1),key=lambda h:h["rank"])
   require(all(a["f4_expected_position"]<=b["f4_expected_position"]+1e-12
             for a,b in zip(followers,followers[1:])),
           "Remaining horses not ordered by certified F4 expected position")
   n+=len(horses)
   total_races+=1
  require(n==horsecount,"Certified full-field horses missing")
  total_horses+=n
 require(total_races==45 and total_horses==367,"Incorrect source proof totals")
 return tracks

def decrypt(r2,sealed_path):
 from cryptography.hazmat.primitives import serialization,hashes
 from cryptography.hazmat.primitives.asymmetric import padding
 from cryptography.hazmat.primitives.ciphers.aead import AESGCM
 sealed=json.loads(Path(sealed_path).read_text())
 require(sealed.get("date")==DATE and sealed.get("version")==1
         and sealed.get("compression")=="brotli",
         "Wrong sealed F4 transfer header")
 stored=optional_get(r2,KEY)
 require(stored is not None,"Temporary RSA key is missing")
 private=serialization.load_pem_private_key(stored["Body"].read(),password=None)
 parts=sealed.get("ciphertext_b64_chunks")
 require(isinstance(parts,list) and len(parts)<=100 and
         all(isinstance(part,str) and len(part)<=1500 for part in parts),
         "Bad encrypted F4 transfer chunks")
 wrapped=base64.b64decode(sealed["wrapped_key_b64"],validate=True)
 nonce=base64.b64decode(sealed["nonce_b64"],validate=True)
 ciphertext=base64.b64decode("".join(parts),validate=True)
 require(len(nonce)==12 and 16<len(ciphertext)<150000,
         "Invalid encrypted F4 payload size")
 aes=private.decrypt(wrapped,padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                       algorithm=hashes.SHA256(),label=None))
 require(len(aes)==32,"Bad temporary AES key")
 compressed=AESGCM(aes).decrypt(nonce,ciphertext,AAD)
 plain=brotli.decompress(compressed)
 require(len(plain)<=150000,"Expanded F4 rank proof is oversized")
 return validate(plain)

def patch(r2,sealed_path):
 source=decrypt(r2,sealed_path)
 plan=[]
 for track in source:
  name=track["track_name"]
  code,slug,_,_=TRACKS[name]
  path=f"projections/dashboard/{DATE}/{slug}.json"
  existing=optional_get(r2,path)
  require(existing is not None,"Private F4 source card is missing")
  metadata=existing.get("Metadata") or {}
  require(metadata.get("source_sha256")==SOURCE_SHA and
          metadata.get("badge_sha256")==BADGE_SHA,
          "Current R2 model/badge source differs from certified F4 rank patch")
  card=json.loads(existing["Body"].read())
  require(card.get("race_date")==DATE and card.get("track_name")==name
          and card.get("projection_status")=="prescratch",
          "Scratch-updated or foreign card must not be overwritten")
  live={r["race_number"]:r for r in card["races"]}
  require(len(live)==len(track["races"]),"Race field changed since F4 run")
  for rank_race in track["races"]:
   race=live.get(rank_race["race_number"])
   require(race is not None and len(race["entries"])==len(rank_race["entries"]),
           "Horse field changed since certified F4 run")
   runners={str(h["program_number"]):h for h in race["entries"]}
   require(len(runners)==len(race["entries"]),"Duplicate program in existing R2 card")
   for row in rank_race["entries"]:
    horse=runners.get(str(row["program_number"]))
    require(horse is not None
            and horse.get("horse_name","").strip().casefold()==row["horse_name"].strip().casefold(),
            "Horse identity changed after source certification")
    require(abs(float(horse["win_probability_exact"])-float(row["win_probability_exact"]))<1e-9
            and abs(float(horse["f4_probabilities"]["exact_p1"])*100-
                    float(row["win_probability_exact"]))<1e-8,
            "Frozen TRI/F4 probabilities do not match certified source")
    require(isinstance(horse.get("metrics"),list) and len(horse["metrics"])==5
            and all(m.get("value") in ("green","gray","red") for m in horse["metrics"]),
            "Approved five-factor badges were unexpectedly changed")
    original_rank=horse.get("rank")
    require(original_rank is None or original_rank==row["rank"],
            "Existing projection rank conflicts with certified F4 patch")
    horse["rank"]=row["rank"]
   race["entries"].sort(key=lambda h:h["rank"])
   require([h["rank"] for h in race["entries"]]==list(range(1,len(race["entries"])+1)),
           "F4 whole-row display order not complete")
  new_metadata=dict(metadata)
  new_metadata["f4_order_sha256"]=PATCH_SHA
  plan.append((path,card,new_metadata,metadata.get("f4_order_sha256")!=PATCH_SHA))
 written=0
 for path,card,metadata,needs_write in plan:
  if needs_write:
   body=json.dumps(card,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode()
   require(len(body)<1024*1024,"Private projections exceed API limit")
   r2.put_object(Bucket=BUCKET,Key=path,Body=body,
       ContentType="application/json; charset=utf-8",CacheControl="private, no-store",
       Metadata=metadata)
   written+=1
  persisted=optional_get(r2,path)
  require(persisted is not None and json.loads(persisted["Body"].read())==card
          and persisted.get("Metadata",{}).get("f4_order_sha256")==PATCH_SHA,
          "F4 rank output did not persist or read back")
 r2.delete_object(Bucket=BUCKET,Key=KEY)
 print("TRI_F4_PRIVATE_R2_ORDER_SUCCESS date=2026-11-23 tracks=5 races=45 "
       f"runners=367 written={written} f4_rank_permutation=PASS "
       "original_scores_and_badges=PRESERVED private_r2_readback=PASS "
       "ephemeral_key_deleted=true")

def main():
 parser=argparse.ArgumentParser()
 parser.add_argument("action",choices=("bootstrap","publish"))
 parser.add_argument("--sealed-file")
 args=parser.parse_args()
 try:
  r2=client()
  if args.action=="bootstrap":bootstrap(r2)
  else:
   require(args.sealed_file,"--sealed-file required")
   patch(r2,args.sealed_file)
 except Exception as exc:
  print("TRI_F4_PRIVATE_R2_HOLD: "+type(exc).__name__+": "+str(exc)[:140],
        file=sys.stderr)
  sys.exit(2)

if __name__=="__main__":
 main()

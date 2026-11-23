#!/usr/bin/env python3
"""One-time sealed transfer of 1,835 verified November 23 TRI badge states to R2.

A GitHub Actions runner creates an ephemeral RSA key, stores ONLY the private
key inside private R2, and prints the PUBLIC key. The ChatGPT production
environment seals the previously verified JSON with AES-256-GCM and RSA-OAEP.
Only ciphertext is placed in the public repository for one trigger commit.
The runner then decrypts and validates the exact SHA-256 of the certified
source JSON, imports the 5 private R2 dashboard objects and deletes the key.

Never print decrypted projections, unwrapped keys or private-key bytes.
"""
import argparse
import base64
import brotli
import hashlib
import json
import os
import re
import sys
import unicodedata

DATE = "2026-11-23"
KEY_OBJECT = "projections/intake-keys/tri-20261123-approved-badges-rsa.pem"
BUCKET = "rail-and-rye-private-cards"
SOURCE_JSON_SHA256 = "9182feead400d01464a793903d4f63445e50e0c7b2078f404294e262f409774b"
BASE_MODEL_SHA = "14a6cff824fd69626010b4fff969d67812cc9d5b7269642705cb52ac6ab80307"
FACTORS = ["Speed", "Form", "Class", "Pace Fit", "Surface / Distance"]
EXPECTED_COLORS = {"green":445,"gray":1216,"red":174}
TRACK_CODES = {"Finger Lakes":"FL","Mountaineer":"MNR","Mahoning Valley":"MVR","Parx Racing":"PRX","Zia Park":"ZIA"}
AAD = b"RAIL-RYE-TRI-APPROVED-BADGES-2026-11-23"
COUNTS = {"Finger Lakes": (8, 60), "Mountaineer": (8, 77),
          "Mahoning Valley": (10, 92), "Parx Racing": (9, 65),
          "Zia Park": (10, 73)}


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def r2_client():
    import boto3
    account = os.environ.get("TRI_CLOUDFLARE_ACCOUNT_ID", "").strip()
    key = os.environ.get("TRI_R2_ACCESS_KEY_ID", "").strip()
    secret = os.environ.get("TRI_R2_SECRET_ACCESS_KEY", "").strip()
    require(bool(re.fullmatch(r"[a-fA-F0-9]{32}", account) and key and secret),
            "R2 credentials unavailable or account ID invalid")
    return boto3.client("s3", region_name="auto",
                        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                        aws_access_key_id=key, aws_secret_access_key=secret)


def get_optional(client, path):
    from botocore.exceptions import ClientError
    try:
        return client.get_object(Bucket=BUCKET, Key=path)
    except ClientError as err:
        if err.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "NotFound"):
            return None
        raise


def boot(client):
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    stored = get_optional(client, KEY_OBJECT)
    if stored is None:
        private = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        private_pem = private.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption())
        client.put_object(Bucket=BUCKET, Key=KEY_OBJECT, Body=private_pem,
                          ContentType="application/x-pem-file", CacheControl="private, no-store")
    else:
        private = serialization.load_pem_private_key(stored["Body"].read(), password=None)
    public_pem = private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    print("TRI_ONE_TIME_PUBLIC_KEY_B64=" + base64.b64encode(public_pem).decode("ascii"))
    print("R2_EPHEMERAL_KEY_READY: public key above is safe to share; private key is in private R2 only")


def track_key(name):
    folded = unicodedata.normalize("NFD", name)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    slug = re.sub(r"[^a-z0-9]+", "-", folded.lower()).strip("-")[:80] or "track"
    return f"projections/dashboard/{DATE}/{slug}.json"


def validate(json_bytes):
    require(hashlib.sha256(json_bytes).hexdigest() == SOURCE_JSON_SHA256,
            "Verified badge patch differs from 1,835 source-backed states")
    patch = json.loads(json_bytes)
    require(patch.get("patch_version") == 1 and patch.get("race_date") == DATE
            and patch.get("base_model_source_sha256") == BASE_MODEL_SHA
            and patch.get("badge_authority") == "TBS_FACTOR_BADGE_EVALUATOR_V1_2_6_FIT_CLASS_FORM_GUARDS",
            "Incorrect source model/approved badge evaluator")
    tracks=patch.get("tracks")
    require(isinstance(tracks,list) and len(tracks)==5,
            "Expected five approved track patch entries")
    require(len({t.get("track_name") for t in tracks})==5
            and {t.get("track_name") for t in tracks}==set(COUNTS),
            "Duplicate or missing approved track patch")
    counts={"green":0,"gray":0,"red":0}
    race_count=runner_count=0
    for track in tracks:
        name=track["track_name"]
        require(track.get("track_code")==TRACK_CODES[name],
                "Track's score/badge identity changed")
        expected_races,expected_runners=COUNTS[name]
        races=track.get("races",[])
        require(len(races)==expected_races and
                len({r.get("race_number") for r in races})==expected_races,
                "Unexpected race count or duplicate race")
        runners=0
        for race in races:
            require(race.get("pace") in ("Strong","Moderate","Weak"),
                    "Pace must use approved current evaluator")
            entries=race.get("entries",[])
            require(isinstance(entries,list) and entries
                    and len({str(e.get("program_number")) for e in entries})==len(entries),
                    "Horse program is missing or duplicated")
            for horse in entries:
                require(bool(horse.get("horse_name")),"Missing certified horse name")
                metrics=horse.get("metrics")
                require(isinstance(metrics,list) and len(metrics)==5
                    and [m.get("label") for m in metrics]==FACTORS,
                    "Badge factor labels do not match approved source order")
                for metric in metrics:
                    color=metric.get("value")
                    require(color in counts,"Unapproved badge state")
                    counts[color]+=1
                runners+=1
            race_count+=1
        require(runners==expected_runners,"Wrong runner count for "+name)
        runner_count+=runners
    require(race_count==45 and runner_count==367 and counts==EXPECTED_COLORS,
            "Certified badge count or state distribution mismatch")
    return tracks


def publish(client, sealed_file):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes, serialization
    with open(sealed_file, "r", encoding="utf-8") as f:
        sealed = json.load(f)
    require(sealed.get("version")==1 and sealed.get("date")==DATE
            and sealed.get("compression")=="brotli",
            "Incorrect date/encryption format")
    stored=get_optional(client,KEY_OBJECT)
    require(stored is not None,"No matching private RSA transfer key")
    private=serialization.load_pem_private_key(stored["Body"].read(),password=None)
    wrapped=base64.b64decode(sealed["wrapped_key_b64"],validate=True)
    nonce=base64.b64decode(sealed["nonce_b64"],validate=True)
    chunks=sealed.get("ciphertext_b64_chunks")
    require(isinstance(chunks,list) and len(chunks)<=100
            and all(isinstance(x,str) and len(x)<=1500 for x in chunks),
            "Invalid sealed chunk format")
    ciphertext=base64.b64decode("".join(chunks),validate=True)
    require(len(nonce)==12 and 16<len(ciphertext)<500000,
            "Unexpected ciphertext dimensions")
    aes_key=private.decrypt(wrapped,padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),algorithm=hashes.SHA256(),label=None))
    compressed=AESGCM(aes_key).decrypt(nonce,ciphertext,AAD)
    plaintext=brotli.decompress(compressed)
    require(len(plaintext)<=500000,"Unexpected decompressed badge size")
    tracks=validate(plaintext)
    plan=[]
    for track in tracks:
        key=track_key(track["track_name"])
        obj=get_optional(client,key)
        require(obj is not None,"Existing frozen TRI model projection absent: "+key)
        metadata=obj.get("Metadata") or {}
        require(metadata.get("source_sha256")==BASE_MODEL_SHA,
                "A different model run is active; badge patch refused: "+key)
        card=json.loads(obj["Body"].read())
        require(card.get("projection_status")=="prescratch" and
                card.get("race_date")==DATE and
                card.get("track_name")==track["track_name"],
                "Not the original 2026-11-23 prescratch projection")
        live_races={r["race_number"]:r for r in card["races"]}
        require(len(live_races)==len(track["races"]),
                "Track's frozen race field has changed")
        for patch_race in track["races"]:
            race=live_races.get(patch_race["race_number"])
            require(race is not None and len(race["entries"])==len(patch_race["entries"]),
                    "Race field no longer matches the certified badge ledger")
            existing={str(e["program_number"]):e for e in race["entries"]}
            require(len(existing)==len(race["entries"]),"Duplicate live program numbers")
            for runner in patch_race["entries"]:
                item=existing.get(str(runner["program_number"]))
                require(item is not None and
                        item["horse_name"].strip().casefold()==runner["horse_name"].strip().casefold(),
                        "A scratched or replaced horse prevents prescratch badge patch")
                item["metrics"]=runner["metrics"]
            race["pace"]=patch_race["pace"]
        new_metadata=dict(metadata)
        new_metadata["badge_sha256"]=SOURCE_JSON_SHA256
        plan.append((key,card,new_metadata,
                     metadata.get("badge_sha256")!=SOURCE_JSON_SHA256))
    written=0
    for key,card,metadata,needs_write in plan:
        if needs_write:
            encoded=json.dumps(card,ensure_ascii=False,separators=(",",":")).encode()
            require(len(encoded)<1024*1024,"Resulting track card exceeds maximum payload")
            client.put_object(Bucket=BUCKET,Key=key,Body=encoded,
                ContentType="application/json; charset=utf-8",
                CacheControl="private, no-store",Metadata=metadata)
            written+=1
        obj=get_optional(client,key)
        require(obj is not None and
                json.loads(obj["Body"].read())==card,
                "Private R2 badge update did not read back correctly")
    client.delete_object(Bucket=BUCKET,Key=KEY_OBJECT)
    print("TRI_R2_BADGES_VERIFIED date=2026-11-23 tracks=5 races=45 "
          "runners=367 factor_badges=1835 green=445 gray=1216 red=174 "
          f"written={written} private_r2_readback=PASS; transfer_key_deleted")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("bootstrap", "publish"))
    parser.add_argument("--sealed-file", default="")
    args = parser.parse_args()
    try:
        client = r2_client()
        if args.action == "bootstrap":
            boot(client)
        else:
            require(args.sealed_file, "--sealed-file is mandatory")
            publish(client, args.sealed_file)
    except Exception as exc:
        # Do not include returned key material or serialized source in errors.
        print("TRI_R2_ONE_OFF_HOLD: " + type(exc).__name__ + ": " + str(exc)[:180],
              file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()

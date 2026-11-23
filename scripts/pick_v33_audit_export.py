#!/usr/bin/env python3
"""Private read-only source audit: encrypted output only.

Never prints a runner, program selection, TRI probability, wager, or ticket.
The browser/ChatGPT operator possesses the one-time X25519 private audit key,
which is never placed in GitHub, Cloudflare, the action, or the repository.
"""
import base64
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import zlib

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

PUBLIC_KEY_HEX="d383af029216c97117827507b2c1625a4987fa6975bb51b199fdb839e7fef05e"
INFO=b"RAIL-RYE-PICK-V33-AUDIT-20261123"
AAD=b"RRV33-AUDIT-V1"
BUCKET="rail-and-rye-private-cards"
TRACKS=("Finger Lakes","Mahoning Valley","Mountaineer","Parx Racing","Zia Park")

def seal(plaintext:bytes)->str:
    recipient=X25519PublicKey.from_public_bytes(bytes.fromhex(PUBLIC_KEY_HEX))
    ephemeral=X25519PrivateKey.generate()
    salt=secrets.token_bytes(16)
    secret=ephemeral.exchange(recipient)
    key=HKDF(algorithm=hashes.SHA256(),length=32,salt=salt,info=INFO).derive(secret)
    nonce=secrets.token_bytes(12)
    from cryptography.hazmat.primitives import serialization
    e_pub=ephemeral.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,format=serialization.PublicFormat.Raw)
    cipher=AESGCM(key).encrypt(nonce,zlib.compress(plaintext,9),AAD)
    return base64.b64encode(e_pub+salt+nonce+cipher).decode("ascii")

def main():
    import boto3
    account=os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()
    access=os.environ["TRI_R2_ACCESS_KEY_ID"].strip()
    secret=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip()
    if not re.fullmatch(r"[a-f0-9]{32}",account) or not access or not secret:
        raise RuntimeError("R2 credentials not configured")
    s3=boto3.client("s3",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        region_name="auto",aws_access_key_id=access,aws_secret_access_key=secret)
    sources=[]
    for track in TRACKS:
        slug=re.sub(r"[^a-z0-9]+","-",track.lower())
        key=f"projections/dashboard/2026-11-23/{slug}.json"
        blob=s3.get_object(Bucket=BUCKET,Key=key)["Body"].read()
        if len(blob)>1500000:raise RuntimeError("Unexpectedly large source")
        card=json.loads(blob)
        sources.append({"card":card,"source_key":key,
            "r2_sha256":hashlib.sha256(blob).hexdigest()})
    stored=[]
    page=s3.list_objects_v2(Bucket=BUCKET,Prefix="pick-tickets/dashboard/",MaxKeys=1000)
    if page.get("IsTruncated"):raise RuntimeError("Unexpected private ticket page truncation")
    for item in page.get("Contents",[]):
        key=item["Key"]
        if not ("2026-11-23" in key):continue
        raw=s3.get_object(Bucket=BUCKET,Key=key)["Body"].read()
        if len(raw)>500000:raise RuntimeError("Unexpectedly large stored ticket")
        stored.append({"card":json.loads(raw),"source_key":key})
    proc=subprocess.run(["node","scripts/pick_v33_encrypted_audit.mjs"],
        input=json.dumps({"sources":sources,"stored":stored}),text=True,
        capture_output=True,timeout=180)
    if proc.returncode!=0:
        # Do not echo Node exceptions: they could contain private input values.
        raise RuntimeError("Private JS audit failed to evaluate complete source")
    report=json.loads(proc.stdout)
    if report.get("date")!="2026-11-23":raise RuntimeError("Wrong report date")
    blob=json.dumps(report,separators=(",",":"),ensure_ascii=True).encode("utf-8")
    if len(blob)>2000000:raise RuntimeError("Unexpected audit payload")
    # One-time-key encrypted evidence; logs contain no proprietary plaintext.
    print("RR_PRIVATE_V33_AUDIT_SEALED="+seal(blob))
    # A smaller, independently auditable sealed dataset stores each race's
    # probability distribution once, rather than repeating complete fields
    # for every overlapping Pick 3/4/5/6 sequence. No plaintext is logged.
    unique_races={}
    tickets=[]
    for track in report.get("tracks",[]):
        for sequence in track.get("sequences",[]):
            for leg in sequence["complete_leg_fields"]:
                key=(track["track"],leg["race_number"])
                source_rows=[(x["program_number"],x["pwin"]) for x in leg["entries"]]
                if key in unique_races and unique_races[key]!=source_rows:
                    raise RuntimeError("Overlapping sequences have different source probability fields")
                unique_races[key]=source_rows
            tickets.append({
                "track":track["track"],
                "name":sequence["name"],
                "start_race":sequence["start_race"],
                "end_race":sequence["end_race"],
                "wager_type":sequence["wager_type"],
                "base_cents":sequence["base_cents"],
                "combinations":sequence["combinations"],
                "cost_cents":sequence["cost_cents"],
                "displayed_hit_rate":sequence["displayed_hit_rate"],
                "exact_hit_probability":sequence["exact_hit_probability"],
                "score":sequence["score"],
                "leg_counts":sequence["leg_counts"],
                "leg_coverage":sequence["leg_coverage"],
                "picks":sequence["runner_numbers"],
                "internal_checks":sequence["internal_checks"]
            })
    concise={
        "overall":report["overall"],
        "source_rows":report["source_rows"],
        "races":[{"track":t,"race_number":n,
           "entries":v} for (t,n),v in sorted(unique_races.items())],
        "tickets":tickets,
        "stored_editions":report["authorized_editions"]
    }
    compact_blob=json.dumps(concise,separators=(",",":"),ensure_ascii=True).encode()
    print("RR_PRIVATE_V33_COMPACT_SEALED="+seal(compact_blob))

    total=report["overall"]
    print("RR_PRIVATE_V33_AUDIT_STATUS="+json.dumps({
        "source_tracks":total["source_tracks"],
        "eligible_tracks":total["eligible_tracks"],
        "audited_sequences":total["audited_sequences"],
        "expected_sequences":total["expected_sequences"],
        "math_error_count":len(total["math_discrepancies"]),
        "source_row_total":total["source_runner_total"],
        "stored_authorized":total["stored_authorized"]
    },separators=(",",":")))
    if total["audited_sequences"]!=total["expected_sequences"] or total["math_discrepancies"]:
        raise RuntimeError("Private ticket audit found incomplete data or discrepancies. See encrypted report.")
if __name__=="__main__":
    main()

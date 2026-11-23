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

def independently_optimize_v33(field_legs,unit_cents):
    """A separate Python exact dynamic-programming implementation.

    Does not call the site's JavaScript ticket selection logic.
    """
    import math
    dp={1:(1.0,())}
    for race in field_legs:
        runners=sorted(race,key=lambda row:(-row[1],row[0]))
        if abs(sum(r[1] for r in runners)-1)>1e-7:
            raise ValueError("Independent source probability mass invalid")
        mass=0
        prefixes=[]
        for k,(number,p) in enumerate(runners,1):
            mass+=p
            if mass+1e-12>=.5:
                prefixes.append((k,mass,tuple(x[0] for x in runners[:k])))
        nxt={}
        for n,(prior_hit,prior_picks) in dp.items():
            for k,covered,programs in prefixes:
                combinations=n*k
                h=prior_hit*covered
                picks=prior_picks+(programs,)
                prev=nxt.get(combinations)
                if prev is None or h>prev[0]+1e-14 or (
                    abs(h-prev[0])<=1e-14 and picks<prev[1]):
                    nxt[combinations]=(h,picks)
        dp=nxt
        if not dp:raise ValueError("Independent optimizer has no feasible ticket")
    best_mass=-1
    frontier=[]
    for combinations,(hit,picks) in sorted(dp.items()):
        if hit>best_mass+1e-12:
            frontier.append((combinations,hit,picks))
            best_mass=hit
    winner=None
    bestscore=-float("inf")
    for combinations,hit,picks in frontier:
        cents=combinations*unit_cents
        score=math.log(hit)-cents/100/30 if hit>0 else -float("inf")
        if winner is None or score>bestscore or (
            score==bestscore and cents<winner[0]*unit_cents):
            winner=(combinations,hit,picks)
            bestscore=score
    return winner

def independent_audit(concise):
    fields={
        (r["track"],r["race_number"]):
          [(str(program),float(prob)) for program,prob in r["entries"]]
        for r in concise["races"]
    }
    failures=[]
    for row in concise["tickets"]:
        name=row["track"]+" "+row["name"]+" "+str(row["start_race"])
        try:
            legs=[fields[(row["track"],n)] for n in range(row["start_race"],row["end_race"]+1)]
            combos,hit,picks=independently_optimize_v33(legs,row["base_cents"])
            actual=tuple(tuple(leg) for leg in row["picks"])
            if combos!=row["combinations"] or combos*row["base_cents"]!=row["cost_cents"]:
                failures.append(name+": INDEPENDENT_COMBINATION_MISMATCH")
            if abs(hit-row["exact_hit_probability"])>1e-10:
                failures.append(name+": INDEPENDENT_HIT_PROBABILITY_MISMATCH")
            if actual!=picks:
                failures.append(name+": INDEPENDENT_SELECTION_MISMATCH")
            for i,(field,selected) in enumerate(zip(legs,row["picks"])):
                mapped=dict(field)
                mass=sum(mapped[x] for x in selected)
                if mass+1e-12<.5:
                    failures.append(name+": BELOW_FLOOR")
                if abs(mass-row["leg_coverage"][i])>1e-10:
                    failures.append(name+": COVERAGE_MISMATCH")
        except Exception:
            failures.append(name+": INDEPENDENT_VERIFICATION_ERROR")
    return failures

def main():
    import boto3
    account=os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()
    access=os.environ["TRI_R2_ACCESS_KEY_ID"].strip()
    secret=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip()
    if not re.fullmatch(r"[a-f0-9]{32}",account) or not access or not secret:
        raise RuntimeError("R2 credentials not configured")
    s3=boto3.client("s3",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        region_name="auto",aws_access_key_id=access,aws_secret_access_key=secret)
    # Presence-only discovery; never emit private score rows, object keys, or
    # credentials. An existing R2 PWIN array is NOT a V4.1 source rerun.
    kinds={"card_sidecars":0,"connection_evidence_jsonl":0,"person_ratings_jsonl":0,
           "scoring_run_receipts":0,"source_zips":0}
    matched=0
    pages=0
    for page in s3.get_paginator("list_objects_v2").paginate(
        Bucket=BUCKET,PaginationConfig={"PageSize":1000,"MaxItems":15000}):
        pages+=1
        for obj in page.get("Contents",[]):
            key=obj["Key"].lower()
            if not any(part in key for part in ("2026-11-23","20261123","1123")):
                continue
            matched+=1
            if "card_connection" in key or "sidecar" in key:kinds["card_sidecars"]+=1
            if "connection" in key and key.endswith(".jsonl"):kinds["connection_evidence_jsonl"]+=1
            if "person" in key and key.endswith(".jsonl"):kinds["person_ratings_jsonl"]+=1
            if "receipt" in key and ("score" in key or "tri" in key or "f4" in key):
                kinds["scoring_run_receipts"]+=1
            if key.endswith(".zip") and ("source" in key or "tri" in key):
                kinds["source_zips"]+=1
    print("TRI_1123_PRIVATE_SCORING_INPUT_PRESENCE="+json.dumps({
      "dated_objects":matched,"categories":kinds,"pages_scanned":pages},separators=(",",":")))
    for track in TRACKS:
        code=re.sub(r"[^a-z0-9]+","-",track.lower())
        key=f"pick-tickets/scorer-audit/2026-11-23/{code}.json"
        try:
            doc=json.loads(s3.get_object(Bucket=BUCKET,Key=key)["Body"].read())
            print("TRI_1123_STAGED_PROOF="+json.dumps({
              "track":track,
              "rider_state":doc.get("rider_scoring_status","UNSPECIFIED"),
              "has_tri_receipt":bool(doc.get("tri_receipt_sha256")),
              "has_f4_receipt":bool(doc.get("f4_receipt_sha256")),
              "claimed_current_runner_count":doc.get("current_runners"),
            },separators=(",",":")))
        except s3.exceptions.NoSuchKey:
            print("TRI_1123_STAGED_PROOF="+json.dumps({"track":track,"present":False}))
        except Exception:
            print("TRI_1123_STAGED_PROOF="+json.dumps({"track":track,"present":False}))
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
    independent_errors=independent_audit(concise)
    concise["independent_verification_errors"]=independent_errors
    print("RR_PRIVATE_V33_INDEPENDENT_OPTIMALITY="+json.dumps({
        "total_sequences":len(tickets),
        "passed":len(tickets)-len(set(x.split(":")[0] for x in independent_errors)),
        "error_count":len(independent_errors)
    },separators=(",",":")))
    compact_blob=json.dumps(concise,separators=(",",":"),ensure_ascii=True).encode()
    print("RR_PRIVATE_V33_COMPACT_SEALED="+seal(compact_blob))
    short={
        "date":"2026-11-23",
        "overall":report["overall"],
        "sources":[{"track":r["track"],"runner_count":r["runner_count"],
                    "stage":r["projection_status"],"factor_basis":r["factor_basis"],
                    "status":r["status"]} for r in report["source_rows"]],
        "tickets":[{
            "track":r["track"],"name":r["name"],
            "start_race":r["start_race"],"end_race":r["end_race"],
            "wager_type":r["wager_type"],"base_cents":r["base_cents"],
            "combinations":r["combinations"],"cost_cents":r["cost_cents"],
            "hit_probability":r["exact_hit_probability"],
            "leg_counts":r["leg_counts"],"leg_coverage":r["leg_coverage"],
            "picks":r["picks"],"checks":r["internal_checks"]
        } for r in tickets]
    }
    short_data=json.dumps(short,separators=(",",":"),ensure_ascii=True).encode()
    print("RR_PRIVATE_V33_SHORT_SEALED="+seal(short_data))

    total=report["overall"]
    print("RR_PRIVATE_V33_AUDIT_STATUS="+json.dumps({
        "source_tracks":total["source_tracks"],
        "eligible_tracks":total["eligible_tracks"],
        "audited_sequences":total["audited_sequences"],
        "expected_sequences":total["expected_sequences"],
        "math_error_count":len(total["math_discrepancies"]),
        "source_row_total":total["source_runner_total"],
        "stored_authorized":total["stored_authorized"],
        "upload_field_gate_pass":total.get("upload_field_gate_pass",0),
        "upload_field_gate_failed":total.get("upload_field_gate_failed",[]),
        "source_scratches":[{"track":row["track"],"count":row.get("declared_scratch_count",0)}
          for row in report["source_rows"]]
    },separators=(",",":")))
    if independent_errors:
        raise RuntimeError("Independent Python optimizer disagrees with private ticket math; see encrypted audit.")
    if total["audited_sequences"]!=total["expected_sequences"] or total["math_discrepancies"]:
        raise RuntimeError("Private ticket audit found incomplete data or discrepancies. See encrypted report.")
if __name__=="__main__":
    main()

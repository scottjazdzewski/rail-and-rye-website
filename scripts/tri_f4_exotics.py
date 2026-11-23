"""Certified frozen-F4 exacta/trifecta distribution parameters for private R2.

This is NOT a new model. It reconstructs the existing V2 P2 and P3+ Plackett-
Luce conditional vectors from receipt-hashed complete ordered-prefix CSVs
and verifies every emitted exacta, trifecta AND superfecta probability before
shipping compact coefficients. The private Worker performs further live-card
source/roster/marginal checks before handing the current race to customers.
"""
import csv
import hashlib
import io
import json
import math
import zipfile

from tri_f4_finish_order import parse_receipt_prefixes, F4OrderHold
MODEL="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET"

class ExoticHold(RuntimeError):
    pass

def guard(ok,msg):
    if not ok:raise ExoticHold(msg)

def to_bytes(x):
    return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()

def make_f4_exotic_payloads(source_zip_bytes,cards,source_sha256):
    guard(len(source_sha256)==64,"Invalid official TRI source hash")
    out=[]
    with zipfile.ZipFile(io.BytesIO(source_zip_bytes)) as z:
        date=cards[0]["race_date"]
        for card in cards:
            code=card["track_code"]
            receipt_name=f"internal_receipts/{code}/TRI_F4_V2_{date.replace('-','')}_PRESCRATCH_SCORING_RECEIPT.json"
            receipt_blob=z.read(receipt_name)
            receipt=json.loads(receipt_blob)
            try:prefixes=parse_receipt_prefixes(z,code,date,receipt)
            except F4OrderHold as exc:raise ExoticHold(str(exc)) from exc
            badge_hash=card.get("badge_source_sha256")
            guard(isinstance(badge_hash,str) and len(badge_hash)==64,
                  "Approved five-factor badge source is missing")
            track={
              "schema_version":2,"model_id":MODEL,"date":date,
              "scratch_state":"PRESCRATCH","source_sha256":source_sha256,
              "badge_sha256":badge_hash,"track_code":code,
              "track_name":card["track_name"],
              "f4_receipt_sha256":hashlib.sha256(receipt_blob).hexdigest(),
              "prefix_file_sha256":receipt["output_hashes"][f"TRI_F4_V2_{date.replace('-','')}_PRESCRATCH_ORDERED_PREFIXES.csv"],
              "races":[]
            }
            guard(len(prefixes)==len(card["races"]),"Incomplete F4 race coverage")
            for race in card["races"]:
                key=f"{date.replace('-','')}|{code}|{race['race_number']}"
                data=prefixes.get(key)
                guard(data is not None,"Certified F4 race prefix is absent")
                entries=race["entries"]
                programs=[str(e["program_number"]) for e in entries]
                n=len(programs)
                guard(n>=4 and len(set(programs))==n,"Bad F4 exotic field")
                favorite=programs[0]
                w2={favorite:1.0};w3={favorite:1.0}
                for program in programs[1:]:
                    ref=next(x for x in programs if x not in (favorite,program))
                    a,b=[x for x in programs if x not in (favorite,program)][:2]
                    w2[program]=data[(ref,program)]/data[(ref,favorite)]
                    w3[program]=data[(a,b,program)]/data[(a,b,favorite)]
                guard(all(math.isfinite(x) and x>0 for x in (*w2.values(),*w3.values())),
                      "Certified F4 conditional weights invalid")
                pwin={str(e["program_number"]):e["f4_probabilities"]["exact_p1"] for e in entries}
                guard(abs(sum(pwin.values())-1)<1e-9,"F4 PWIN not normalized")
                got={k:{p:0. for p in programs} for k in range(1,5)}
                total={k:0. for k in (2,3,4)}
                for seq,value in data.items():
                    k=len(seq)
                    if k not in (2,3,4):raise ExoticHold("Unexpected F4 outcome stage")
                    p=pwin[seq[0]]
                    p*=w2[seq[1]]/sum(w2[x] for x in programs if x!=seq[0])
                    for i in range(2,k):
                        allowed=[x for x in programs if x not in seq[:i]]
                        p*=w3[seq[i]]/sum(w3[x] for x in allowed)
                    guard(abs(value-p)<1e-11,
                          "Frozen F4 ordered outcomes cannot be reproduced exactly")
                    total[k]+=p
                    if k==2:
                        got[1][seq[0]]+=value
                        got[2][seq[1]]+=value
                    else:
                        got[k][seq[-1]]+=value
                for stage in (2,3,4):
                    guard(len([x for x in data if len(x)==stage])==math.perm(n,stage),
                          "Incomplete signed F4 outcome stage")
                    guard(abs(total[stage]-1)<1e-8,"F4 outcome stage not normalized")
                for horse in entries:
                    program=str(horse["program_number"])
                    for k in range(1,5):
                        guard(abs(got[k][program]-horse["f4_probabilities"][f"exact_p{k}"])<1e-9,
                              "F4 ordered probabilities disagree with original runner marginal")
                    guard(abs(horse["win_probability_exact"]/100-pwin[program])<1e-9,
                          "F4 PWIN drift")
                track["races"].append({
                    "race_number":race["race_number"],"programs":programs,
                    "pwin":[pwin[p] for p in programs],
                    "p2_weights":[w2[p] for p in programs],
                    "p3_weights":[w3[p] for p in programs]
                })
            out.append(track)
    return out

def sync_f4_exotic_payloads(payloads,client,bucket="rail-and-rye-private-cards",dry_run=False):
    guard(bucket=="rail-and-rye-private-cards","Unexpected private model bucket")
    actions=[]
    for track in payloads:
        slug=__import__("re").sub(r"[^a-z0-9]+","-",track["track_name"].lower()).strip("-")
        key=f"projections/f4-ordered/{track['date']}/{slug}.json"
        prior=None
        try:
            item=client.get_object(Bucket=bucket,Key=key)
            prior=json.loads(item["Body"].read())
        except Exception as exc:
            response=getattr(exc,"response",{})
            if not(isinstance(response,dict) and response.get("Error",{}).get("Code") in
                  ("NoSuchKey","404","NotFound")):raise
        if prior is not None:
            guard(prior.get("scratch_state")=="PRESCRATCH",
                  "Refusing to overwrite scratch-updated F4 exotic coefficients")
        actions.append((key,track,prior!=track))
    pending=[(key,track) for key,track,change in actions if change]
    if dry_run:return len(pending),len(actions)-len(pending)
    for key,track in pending:
        client.put_object(Bucket=bucket,Key=key,Body=to_bytes(track),
            ContentType="application/json; charset=utf-8",
            CacheControl="private, no-store",
            Metadata={"source_sha256":track["source_sha256"],
                      "badge_sha256":track["badge_sha256"],
                      "f4_receipt_sha256":track["f4_receipt_sha256"]})
    return len(pending),len(actions)-len(pending)

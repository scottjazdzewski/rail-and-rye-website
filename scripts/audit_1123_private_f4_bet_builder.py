#!/usr/bin/env python3
"""Read-only private F4 exotic payout/coverage audit for all verified Nov 23 races.

Never exports individual runners, prices or proprietary model weights.
Validates the exact R2 objects consumed by the protected Bet Builder.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
from collections import defaultdict

DATE="2026-11-23"
BUCKET="rail-and-rye-private-cards"
MODEL="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET"
HEX=re.compile(r"^[0-9a-f]{64}$",re.I)
TRACKS={
  "Finger Lakes":("finger-lakes",8,60),
  "Mountaineer":("mountaineer",8,77),
  "Mahoning Valley":("mahoning-valley",10,92),
  "Parx Racing":("parx-racing",9,65),
  "Zia Park":("zia-park",10,73),
}

def require(condition,message):
    if not condition:
        raise RuntimeError(message)

def read_r2(client,key):
    object_=client.get_object(Bucket=BUCKET,Key=key)
    blob=object_["Body"].read()
    require(0<len(blob)<=1024*1024,"R2 model object outside size limit")
    return json.loads(blob),object_.get("Metadata") or {}

def audit_race(race,source):
    entries=race["entries"]
    n=len(entries)
    require(n>=4 and n<=30 and isinstance(source,dict),"Illegal exotic race field")
    assert not race.get("scratches"),"A scratch-adjusted field cannot use prescratch coefficients"
    horses={str(e["program_number"]):e for e in entries}
    programs=source["programs"]
    require(len(horses)==n==len(programs) and set(horses)==set(programs),
            "F4 data does not represent exactly the current race starters")
    pwin=source["pwin"]
    w2=source["p2_weights"]
    w3=source["p3_weights"]
    require(len(pwin)==len(w2)==len(w3)==n,"Frozen F4 coefficients are incomplete")
    require(all(isinstance(x,(int,float)) and math.isfinite(x) for x in [*pwin,*w2,*w3]),
            "Non-finite F4 input")
    require(all(0<x<1 for x in pwin) and all(x>0 for x in [*w2,*w3]),
            "Invalid conditional F4 weights")
    require(abs(sum(pwin)-1)<1e-8,"PWIN mass does not total 1")
    index={p:i for i,p in enumerate(programs)}
    for p in programs:
        e=horses[p]
        idx=index[p]
        require(abs(e["win_probability_exact"]/100-pwin[idx])<1e-8,
                "Runner exact TRI PWIN disagrees with private F4 coefficient")
        require(abs(e["f4_probabilities"]["exact_p1"]-pwin[idx])<1e-8,
                "Frozen P1 marginal disagrees with private F4 coefficient")
    exacta=defaultdict(float)
    trifecta=defaultdict(float)
    marginal2={p:0.0 for p in programs}
    marginal3={p:0.0 for p in programs}
    total2=total3=0.0
    sum2=sum(w2);sum3=sum(w3)
    for i,a in enumerate(programs):
        d2=sum2-w2[i]
        require(d2>0,"Invalid F4 P2 conditional denominator")
        conditional2=0.0
        conditional3=0.0
        for j,b in enumerate(programs):
            if j==i:continue
            x=pwin[i]*w2[j]/d2
            exacta[a]+=x
            marginal2[b]+=x
            total2+=x
            conditional2+=x
            d3=sum3-w3[i]-w3[j]
            require(d3>0,"Invalid F4 P3 conditional denominator")
            for k,c in enumerate(programs):
                if k in (i,j):continue
                t=x*w3[k]/d3
                trifecta[a]+=t
                marginal3[c]+=t
                total3+=t
                conditional3+=t
        # A single-runner key over ALL valid second-place horses equals PWIN.
        require(abs(conditional2-pwin[i])<1e-10,
                "Exhaustive exacta key must equal the keyed horse's win probability")
        # Same invariant for 1st over all remaining 2nd/3rd permutations.
        require(abs(conditional3-pwin[i])<1e-10,
                "Exhaustive trifecta key must equal the keyed horse's win probability")
        # No incomplete first-place key can be mistaken for all-field 100% coverage.
        require(conditional2<1-1e-9,"A first-place key cannot be called 100%")
        # Rounding UP minimum gross equal-payout threshold for all-second exacta key
        total_bet=n-1
        break_even=math.ceil(total_bet/conditional2*100-1e-9)/100
        require(break_even*conditional2+1e-8>=total_bet,
                "Displayed break-even payout would understate required gross")
    require(abs(total2-1)<1e-9 and abs(total3-1)<1e-9,
            "Complete exacta/trifecta boxes must cover 100% of modeled outcomes")
    for p in programs:
        e=horses[p]
        require(abs(marginal2[p]-e["f4_probabilities"]["exact_p2"])<1e-8,
                "Exacta outcome law fails verified F4 P2 marginal")
        require(abs(marginal3[p]-e["f4_probabilities"]["exact_p3"])<1e-8,
                "Trifecta outcome law fails verified F4 P3 marginal")
    ranks=[e["rank"] for e in entries]
    require(sorted(ranks)==list(range(1,n+1)),"Full-field finish display ranks are incomplete")
    require(abs(horses[next(p for p in programs if horses[p]["rank"]==1)]["win_probability_exact"]/100-max(pwin))<1e-9,
            "Highest exact TRI win-probability horse must lead the ranking")
    return n

def main():
    import boto3
    account=os.environ.get("TRI_CLOUDFLARE_ACCOUNT_ID","").strip()
    key=os.environ.get("TRI_R2_ACCESS_KEY_ID","").strip()
    secret=os.environ.get("TRI_R2_SECRET_ACCESS_KEY","").strip()
    require(bool(re.fullmatch(r"[a-fA-F0-9]{32}",account)) and key and secret,
            "Existing private R2 read credentials are unavailable")
    client=boto3.client("s3",region_name="auto",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=key,aws_secret_access_key=secret)
    total_races=total_runners=0
    for track,(slug,expected_races,expected_runners) in TRACKS.items():
        base,metadata=read_r2(client,f"projections/dashboard/{DATE}/{slug}.json")
        proof,_=read_r2(client,f"projections/f4-ordered/{DATE}/{slug}.json")
        require(base.get("track_name")==track and base.get("race_date")==DATE
                and base.get("projection_status")=="prescratch",
                "Race card has been updated or does not match the requested track")
        require(proof.get("schema_version")==2 and proof.get("model_id")==MODEL
                and proof.get("date")==DATE and proof.get("track_name")==track
                and proof.get("scratch_state")=="PRESCRATCH",
                "Frozen F4 model or scratch state differs")
        require(HEX.fullmatch(str(proof.get("f4_receipt_sha256","")))
                and HEX.fullmatch(str(proof.get("prefix_file_sha256","")))
                and metadata.get("source_sha256")==proof.get("source_sha256")
                and metadata.get("badge_sha256")==proof.get("badge_sha256"),
                "Frozen F4 proof and current projection source hashes disagree")
        races=base.get("races") or []
        models=proof.get("races") or []
        require(len(races)==len(models)==expected_races,
                "Race count differs from the certified source")
        model_by_number={x["race_number"]:x for x in models}
        require(len(model_by_number)==expected_races,
                "Duplicate F4 race keys")
        runners=0
        for race in races:
            model=model_by_number.get(race["race_number"])
            require(model is not None,"Missing source-verified F4 race")
            runners+=audit_race(race,model)
        require(runners==expected_runners,
                "Runner coverage differs from the certified source")
        total_races+=len(races);total_runners+=runners
    require(total_races==45 and total_runners==367,
            "Not all original private R2 models were independently audited")
    print("PASS — PRIVATE F4 BET BUILDER AUDIT: 5 tracks / 45 races / 367 runners; "
          "P1/P2/P3 verified; exacta + trifecta outcome mass = 100%; "
          "all full keys = exact TRI PWIN; no partial first-place key = 100%; "
          "full-box outcomes = 100%; rounded gross break-even never underpays; "
          "prescratch roster/source/receipt identity verified; 0 objects written")

if __name__=="__main__":
    main()

#!/usr/bin/env python3
"""READ ONLY quality/coverage audit for Race-Day Pulse historical private R2.
Never prints horse names, probabilities, objects, receipts or private R2 keys.
No R2 write/delete operations. Only aggregate public-safe QA counts.
"""
import collections
import json
import os
import re

BUCKET = "rail-and-rye-private-cards"
DATES = [d for d in os.getenv("PULSE_CALIBRATION_DATES", "2026-11-24,2026-11-25,2026-11-26").split(",")
         if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d)]
assert 1 <= len(DATES) <= 10
BASE = "race-day-pulse/prescratch/"
DASH = "projections/dashboard/"

def source_ok(original, current):
    if original.get("projection_status") != "prescratch" or current.get("projection_status") != "scratch_final":
        return False
    if current.get("factor_basis") != "verified_scratch_final":
        return False
    receipts = current.get("model_receipts") or {}
    if not all(re.fullmatch(r"[a-fA-F0-9]{64}", str(receipts.get(k, "")))
               for k in ("tri_sha256", "f4_sha256", "prescratch_parent_sha256", "official_changes_sha256")):
        return False
    parent = (original.get("model_receipts") or {}).get("f4_sha256")
    if parent and parent != receipts["prescratch_parent_sha256"]:
        return False
    return (original.get("race_date") == current.get("race_date")
            and original.get("track_name") == current.get("track_name"))

def runner_map(race):
    try:
        mapped = {str(x["program_number"]).strip().upper():x for x in race["entries"]}
        if len(mapped) != len(race["entries"]) or not mapped: return None
        values = [float(x["win_probability_exact"]) for x in mapped.values()]
        if any(x < 0 or x > 100 for x in values) or abs(sum(values)-100) > .00001: return None
        return mapped
    except (KeyError, ValueError, TypeError, ZeroDivisionError):
        return None

def analyze(original, current):
    older = {r.get("race_number"):r for r in original.get("races", [])}
    output=[]
    for fresh in current.get("races", []):
        old = older.get(fresh.get("race_number"))
        if not old:continue
        a,b=runner_map(old),runner_map(fresh)
        if a is None or b is None or len(b) < 2:continue
        scratches=[str(s["program_number"]).strip().upper() for s in fresh.get("scratches", [])]
        removed=set(scratches)
        if not removed or len(removed)!=len(scratches) or set(a)-set(b)!=removed:continue
        if set(b)-set(a):continue
        oldfav=max(a,key=lambda k:float(a[k]["win_probability_exact"]))
        newfav=max(b,key=lambda k:float(b[k]["win_probability_exact"]))
        delta=max(abs(float(b[k]["win_probability_exact"])-float(a[k]["win_probability_exact"])) for k in b)
        f4diff=0
        for k in b:
            try:
                now=sum(float(b[k]["f4_probabilities"]["exact_p"+str(j)]) for j in (2,3))
                prior=sum(float(a[k]["f4_probabilities"]["exact_p"+str(j)]) for j in (2,3))
                f4diff=max(f4diff,abs((now-prior)*100))
            except (KeyError,ValueError,TypeError):
                pass
        output.append({"changed":oldfav!=newfav,
                       "scratched_favorite":oldfav not in b,
                       "win_delta":delta, "f4_delta":f4diff})
    return output

def iter_keys(client,prefix):
    cursor=None
    while True:
        args=dict(Bucket=BUCKET,Prefix=prefix,MaxKeys=100)
        if cursor:args["ContinuationToken"]=cursor
        result=client.list_objects_v2(**args)
        for obj in result.get("Contents", []):
            key=obj.get("Key","")
            if key.startswith(prefix) and key.endswith(".json") and "/" not in key[len(prefix):]:
                yield key
        cursor=result.get("NextContinuationToken")
        if not cursor:break

def start():
    try:
        import boto3
        client=boto3.client("s3",region_name="auto",
            endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
    except Exception:
        print("PULSE_REPLAY_STATUS: credentials or boto3 unavailable; no private audit run")
        return
    totals=collections.Counter()
    runs=[]
    for date in DATES:
        baseline_prefix=BASE+date+"/"
        dashboard_prefix=DASH+date+"/"
        try:
            baselines=set(iter_keys(client,baseline_prefix))
            dashboards=set(iter_keys(client,dashboard_prefix))
            pairs=sorted(k for k in dashboards if k.replace(dashboard_prefix,baseline_prefix,1) in baselines)
            rows=[]
            for key in pairs:
                original=json.loads(client.get_object(Bucket=BUCKET,Key=key.replace(dashboard_prefix,baseline_prefix,1))["Body"].read())
                current=json.loads(client.get_object(Bucket=BUCKET,Key=key)["Body"].read())
                if not source_ok(original,current):
                    totals["unverified_pair"]+=1
                    continue
                rows.extend(analyze(original,current))
            runs.extend(rows)
            totals["dashboards"]+=len(dashboards)
            totals["baselines"]+=len(baselines)
            totals["pairs"]+=len(pairs)
            print("PULSE_REPLAY_DAY date={} dashboards={} prescratch_baselines={} matched_pairs={} comparable_races={}".format(
                date,len(dashboards),len(baselines),len(pairs),len(rows)))
        except Exception as exc:
            print("PULSE_REPLAY_DAY date={} status=UNAVAILABLE reason_type={}".format(date,type(exc).__name__))
    print("PULSE_REPLAY_COVERAGE dashboards={} baselines={} pairs={} comparable_races={} mismatched_pairs={}".format(
        totals["dashboards"],totals["baselines"],totals["pairs"],len(runs),totals["unverified_pair"]))
    if not runs:
        print("PULSE_CALIBRATION_STATUS=INSUFFICIENT_COMPARABLE_HISTORICAL_DATA")
        return
    print("PULSE_SIGNAL_COUNTS legitimate_favorite_flips={} flipped_only_because_favorite_removed={}".format(
        sum(r["changed"] and not r["scratched_favorite"] for r in runs),
        sum(r["changed"] and r["scratched_favorite"] for r in runs)))
    for gate in [2,3,4,5,6,8,10]:
        print("PULSE_WIN_SHIFT_GATE_{}PT eligible_races={}".format(gate,sum(r["win_delta"]>=gate for r in runs)))
    for gate in [5,7,10,12]:
        print("PULSE_F4_SHIFT_GATE_{}PT eligible_races={}".format(gate,sum(r["f4_delta"]>=gate for r in runs)))
    print("PULSE_CALIBRATION_STATUS={} sample_size={}".format(
        "PRELIMINARY_SOURCE_BACKED_REPLAY" if len(runs)>=30 else "TOO_FEW_FOR_RELIABLE_THRESHOLD_CALIBRATION",len(runs)))
if __name__=="__main__":
    start()

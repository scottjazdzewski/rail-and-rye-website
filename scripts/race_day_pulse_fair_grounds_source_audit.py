#!/usr/bin/env python3
"""Fair Grounds Pulse QA against existing certified original cards (READ ONLY).

All change details are user-supplied. This module never fetches Equibase,
writes R2, reruns TRI/F4, publishes findings or prints private probabilities.
"""
import argparse
import json
import os
import re
import unicodedata
from collections import Counter,defaultdict
from pathlib import Path

SOURCE=Path("research/pulse/2026-11-26-fair-grounds-user-supplied.json")
BUCKET="rail-and-rye-private-cards"
DAY="2026-11-26"
ORIGINAL_PREFIX=f"race-day-pulse/prescratch/{DAY}/"
DASH_PREFIX=f"projections/dashboard/{DAY}/"
MAX_BYTES=1_100_000
def require(value,message):
    if not value:raise RuntimeError(message)
def norm(value):
    value=unicodedata.normalize("NFKD",str(value or "").casefold())
    return " ".join("".join(c for c in value if not unicodedata.combining(c)).split())
def number(value):
    return str(value or "").strip().upper()
def time_et(value):
    return bool(re.fullmatch(r"\d\d:\d\d",str(value or "")))
def verify_fixture():
    data=json.loads(SOURCE.read_text(encoding="utf-8"))
    require(data.get("schema_version")==1 and data.get("race_date")==DAY,"Wrong supplied card date")
    require(data.get("track")=="Fair Grounds" and data.get("track_code")=="FG","Wrong FG source track")
    require(data.get("source_type")=="USER_SUPPLIED_LATE_CHANGES_TABLE" and
            data.get("source_is_automatically_polled") is False,"No authorized automatic feed")
    scratches=data.get("scratches") or []
    require(len(scratches)==8,"Expected exactly 8 user-supplied scratches")
    grouped=defaultdict(list)
    seen=set()
    for row in scratches:
        require(row["race_number"] in (2,5,6,7,10),"Unexpected scratch race")
        key=(row["race_number"],number(row["program_number"]))
        require(key not in seen,"Duplicate scratch")
        seen.add(key)
        require(norm(row["horse_name"]) and norm(row["reason"]) and time_et(row["posted_et"]),"Incomplete scratch")
        grouped[row["race_number"]].append(row)
    require(sum(r["reason"]=="Main-Track-Only" for r in scratches)==2,"Expected two MTO scratches")
    changes=data.get("other_changes") or []
    require(len(changes)==7,"Expected 2 jockey, 1 weight, 4 rail updates")
    jockeys=[x for x in changes if x["type"]=="JOCKEY_CHANGE"]
    weights=[x for x in changes if x["type"]=="WEIGHT_CHANGE"]
    rails=[x for x in changes if x["type"]=="TEMP_RAIL_14_FT"]
    require(sorted(x["race_number"] for x in jockeys)==[1,6],"Jockey-change races wrong")
    require(len(weights)==1 and weights[0]["race_number"]==9 and weights[0]["weight_before_lbs"]==122
            and weights[0]["weight_after_lbs"]==120,"Weight change source wrong")
    require(sorted(x["race_number"] for x in rails)==[2,4,6,8] and
            all(x["posted_et"]=="REPORTED_AT_ENTRY_TIME" for x in rails),
            "Entry-time rail must never be treated as a new 11AM change")
    require(any(x["race_number"]==1 and number(x["program_number"])=="4" and
                norm(x["horse_name"])=="azteca storm" and
                norm(x["jockey_before"])=="rey williams" and norm(x["jockey_after"])=="alex birzer"
                and time_et(x["posted_et"]) for x in jockeys),"R1 jockey notice changed")
    require(any(x["race_number"]==6 and number(x["program_number"])=="1" and
                norm(x["horse_name"])=="sono abscato" and
                norm(x["jockey_before"])=="rey williams" and norm(x["jockey_after"])=="gabriel saez"
                and time_et(x["posted_et"]) for x in jockeys),"R6 jockey notice changed")
    require(data.get("latest_item_posted_et")=="11:03" and
            any(x["race_number"]==10 and number(x["program_number"])=="7" and
                norm(x["horse_name"])=="deal with it daddy" and x["posted_et"]=="11:03"
                for x in scratches),"Latest update wrongly attributed")
    print("FG_USER_SOURCE_FIXTURE_PASS date={} scratches=8 mto=2 jockey=2 weight=1 rails_at_entry=4 latest=11:03_ET".format(DAY))
    return data,grouped
def list_approved_original(client):
    result=client.list_objects_v2(Bucket=BUCKET,Prefix=ORIGINAL_PREFIX,MaxKeys=100)
    require(not result.get("IsTruncated"),"Private originals list incomplete; fail closed")
    matched=[]
    for obj in result.get("Contents",[]):
        key=obj.get("Key","")
        if not key.startswith(ORIGINAL_PREFIX) or not re.fullmatch(r"[a-z0-9-]+\.json",key[len(ORIGINAL_PREFIX):]):
            continue
        result=client.get_object(Bucket=BUCKET,Key=key)
        card=json.loads(result["Body"].read(MAX_BYTES))
        if card.get("race_date")==DAY and norm(card.get("track_name")) in ("fair grounds","fair grounds race course"):
            matched.append((key,card))
    require(len(matched)==1,"No unique immutable Fair Grounds original; do not reconstruct from later revisions")
    return matched[0]
def inspect(original,data,grouped):
    require(original.get("schema_version")==1 and
            original.get("projection_status")=="prescratch" and
            original.get("race_date")==DAY,"Not a certified original race card")
    receipts=original.get("model_receipts") or {}
    require(all(re.fullmatch(r"[a-fA-F0-9]{64}",str(receipts.get(k,"")))
                for k in ("tri_sha256","f4_sha256")),"Original TRI/F4 receipts missing")
    races={int(x["race_number"]):x for x in original.get("races",[])}
    relevant=set(grouped)|{1,4,8,9}
    require(relevant.issubset(races),"The source has incomplete FG race coverage; hold report")
    counter=Counter()
    for n in sorted(grouped):
        race=races[n]
        entries=race.get("entries") or []
        maps={number(x["program_number"]):x for x in entries}
        require(len(maps)==len(entries),"Original duplicate program number")
        matched=missing_mto=missing_other=wrong=0
        for item in grouped[n]:
            runner=maps.get(number(item["program_number"]))
            if runner is None:
                if item["reason"]=="Main-Track-Only":missing_mto+=1
                else:missing_other+=1
            elif norm(runner.get("horse_name"))!=norm(item["horse_name"]):wrong+=1
            else:matched+=1
        counter.update(matched=matched,missing_mto=missing_mto,missing_other=missing_other,wrong_names=wrong)
        surface=re.sub("[^a-zA-Z0-9_-]","",str(race.get("surface") or ""))[:32] or "UNKNOWN"
        print("FG_ORIGINAL_RACE race={} original_field={} listed_scratches={} matched={} mto_not_original={} missing_non_mto={} wrong_name={} source_surface={}".format(
            n,len(entries),len(grouped[n]),matched,missing_mto,missing_other,wrong,surface))
    changes=data["other_changes"]
    for item in changes:
        if item["type"] not in ("JOCKEY_CHANGE","WEIGHT_CHANGE"):continue
        number_of_race=item["race_number"];runner=next((x for x in races[number_of_race]["entries"]
                     if number(x.get("program_number"))==number(item["program_number"])),None)
        match=bool(runner and norm(runner.get("horse_name"))==norm(item["horse_name"]))
        before=None
        if runner:
            if item["type"]=="JOCKEY_CHANGE":
                before=next((runner.get(k) for k in ("jockey_name","jockey","jockey_display_name") if runner.get(k)),None)
            else:
                before=next((runner.get(k) for k in ("weight_carried_lbs","weight_lbs","weight") if runner.get(k) is not None),None)
        status="NAME_MATCHED" if match else "NOT_MATCHED"
        if before is None:
            old_value_status="NOT_EXPOSED_IN_DASHBOARD"
        elif item["type"]=="JOCKEY_CHANGE":
            old_value_status="BEFORE_MATCHED" if norm(before)==norm(item["jockey_before"]) else "BEFORE_DIFFERS_REQUIRES_SOURCE_QA"
        else:
            old_value_status="BEFORE_MATCHED" if str(before).strip()==str(item["weight_before_lbs"]) else "BEFORE_DIFFERS_REQUIRES_SOURCE_QA"
        print("FG_NON_SCRATCH_CHANGE race={} type={} runner_identity={} prior_input_status={} scorer_policy=NO_UNVERIFIED_CHANGE".format(
            number_of_race,item["type"],status,old_value_status))
        if not match:counter["other_identity_mismatch"]+=1
        if "DIFFERS" in old_value_status:counter["prior_input_mismatch"]+=1
    # MTO runners included in the original TURF dashboard may have been
    # conditionally eligible only on a main-track switch. Their removal
    # cannot automatically be described as a newly changed pace setup.
    for n in (2,6):
        race=races[n]
        mto=[x for x in grouped[n] if x["reason"]=="Main-Track-Only"]
        programs={number(x.get("program_number")) for x in race.get("entries",[])}
        turf=norm(race.get("surface"))=="turf"
        conditional=sum(number(x["program_number"]) in programs for x in mto)
        print("FG_MTO_ELIGIBILITY race={} original_turf={} original_included_conditional_MTO={} pulse_pace_attribution=HOLD".format(
            n,turf,conditional))
    print("FG_ENTRY_RAIL races=2,4,6,8 rail=14_ft event=REPORTED_AT_ENTRY_TIME not_new_scratches=true")
    print("FG_ORIGINAL_AUDIT_SUMMARY matched={} mto_outside_field={} missing_non_mto={} wrong_names={} other_identity_mismatch={} prior_input_mismatch={} writes=0".format(
        counter["matched"],counter["missing_mto"],counter["missing_other"],counter["wrong_names"],
        counter["other_identity_mismatch"],counter["prior_input_mismatch"]))
    return counter
def read_current(client,source_key,data,grouped,original):
    current_key=source_key.replace(ORIGINAL_PREFIX,DASH_PREFIX,1)
    c=client.get_object(Bucket=BUCKET,Key=current_key)
    current=json.loads(c["Body"].read(MAX_BYTES))
    if current.get("race_date")!=DAY or norm(current.get("track_name")) not in ("fair grounds","fair grounds race course"):
        print("FG_CURRENT_DASHBOARD status=IDENTITY_MISMATCH hold=true")
        return
    status=str(current.get("projection_status"))
    if status!="scratch_final":
        print("FG_CURRENT_DASHBOARD status={} source_changes_NOT_CERTIFIED_SCORED=true research_only=true".format(
            re.sub("[^a-zA-Z_-]","",status)[:30]))
        return
    receipts=current.get("model_receipts") or {}
    complete=all(re.fullmatch(r"[a-fA-F0-9]{64}",str(receipts.get(k,"")))
                 for k in ("tri_sha256","f4_sha256","prescratch_parent_sha256","official_changes_sha256"))
    rs={int(x["race_number"]):x for x in current.get("races",[])}
    reported=0
    for n,items in grouped.items():
        r=rs.get(n)
        if not r:continue
        published={(number(x.get("program_number")),norm(x.get("horse_name"))) for x in r.get("scratches",[])}
        reported+=sum((number(x["program_number"]),norm(x["horse_name"])) in published for x in items)
    j_replaced=0
    for item in data.get("other_changes",[]):
        if item.get("type")!="JOCKEY_CHANGE":continue
        r=rs.get(int(item["race_number"]),{})
        runner=next((e for e in r.get("entries",[]) if number(e.get("program_number"))==number(item["program_number"])),None)
        if (runner and norm(runner.get("horse_name"))==norm(item["horse_name"]) and
                norm(runner.get("jockey"))==norm(item["jockey_after"])):
            j_replaced+=1
    parent_ok=bool(complete and receipts.get("prescratch_parent_sha256")==(
        original.get("model_receipts") or {}).get("f4_sha256"))
    proof=current.get("parent_replay_proof") or {}
    source_based_parent_ok=bool(
        isinstance(proof,dict) and
        proof.get("stored_parent_receipts")==original.get("model_receipts") and
        proof.get("replay_f4_sha256")==receipts.get("prescratch_parent_sha256") and
        re.fullmatch(r"[0-9a-fA-F]{64}",str(proof.get("replay_tri_sha256") or "")))
    print("FG_LINEAGE_QA stored_F4_receipt_equals_replay_parent={} certified_replay_proof_links_original={} mismatch_needs_review={}".format(
        parent_ok,source_based_parent_ok,not(parent_ok or source_based_parent_ok)))
    jockey_prior_unchanged=0
    for item in data["other_changes"]:
        if item["type"]!="JOCKEY_CHANGE":continue
        o=next((e for e in next(r for r in original["races"] if int(r["race_number"])==item["race_number"])["entries"]
                if number(e.get("program_number"))==number(item["program_number"])),None)
        c=next((e for e in rs.get(item["race_number"],{}).get("entries",[])
                if number(e.get("program_number"))==number(item["program_number"])),None)
        if o and c and norm(o.get("jockey"))==norm(c.get("jockey")):
            jockey_prior_unchanged+=1
    print("FG_CURRENT_DASHBOARD status=scratch_final complete_model_receipts={} parent_f4_matches_original={} user_scratches_found={}/8 jockey_effective_updated={}/2 jockey_prescratch_unchanged={}/2 MTO_eligibility_requires_review=true weight_input_not_in_dashboard=true research_only=true".format(
        bool(complete),parent_ok,reported,j_replaced,jockey_prior_unchanged))
    # Pulse only for original-field scratches that meet score movement gates.
    # Only race 5/7/10 currently have no reported MTO or jockey update;
    # the others must await conditional eligibility / rider source QA.
    def runner_map(race):
        if not race:return None
        try:
            rows={number(e["program_number"]):e for e in race["entries"]}
            mass=sum(float(e["win_probability_exact"]) for e in rows.values())
            if len(rows)!=len(race["entries"]) or abs(mass-100)>1e-6:return None
            return rows
        except (KeyError,ValueError,TypeError):return None
    original_races={int(r["race_number"]):r for r in original.get("races",[])}
    for n in sorted(grouped):
        if n in (2,6):
            print("FG_PULSE_CANDIDATE race={} status=HELD reason=CONDITIONAL_MTO_AND_OR_UNRECONCILED_JOCKEY".format(n))
            continue
        a,b=runner_map(original_races.get(n)),runner_map(rs.get(n))
        if not a or not b or not complete or not (parent_ok or source_based_parent_ok) or reported!=8:
            print("FG_PULSE_CANDIDATE race={} status=HELD reason=INCOMPLETE_OR_UNVERIFIED_SCORES".format(n))
            continue
        old_scratched={number(x["program_number"]) for x in grouped[n]}
        if set(b)!=set(a)-old_scratched or any(norm(b[k].get("horse_name"))!=norm(a[k].get("horse_name")) for k in b):
            print("FG_PULSE_CANDIDATE race={} status=HELD reason=FIELD_IDENTITY_OR_SCRATCH_MISMATCH".format(n))
            continue
        oldlead=max(a,key=lambda k:float(a[k]["win_probability_exact"]))
        newlead=max(b,key=lambda k:float(b[k]["win_probability_exact"]))
        delta=max(abs(float(b[k]["win_probability_exact"])-float(a[k]["win_probability_exact"])) for k in b)
        f4_change=0.0
        try:
            for k in b:
                p=sum(float(b[k]["f4_probabilities"]["exact_p"+str(i)]) for i in (2,3))
                before=sum(float(a[k]["f4_probabilities"]["exact_p"+str(i)]) for i in (2,3))
                f4_change=max(f4_change,abs((p-before)*100))
        except (KeyError,ValueError,TypeError):
            print("FG_PULSE_CANDIDATE race={} status=HELD reason=F4_SOURCE_MISSING".format(n))
            continue
        qualifies=(oldlead!=newlead or delta>=4 or f4_change>=7)
        print("FG_PULSE_CANDIDATE race={} status={} favorite_changed={} win_shift_gate_4={} F4_underneath_gate_7={} quantitative_values=PRIVATE".format(
            n,"PROVISIONAL_ELIGIBLE_FOR_EDITORIAL_QA" if qualifies else "BELOW_ALERT_THRESHOLD",
            oldlead!=newlead,delta>=4,f4_change>=7))
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--fixture-only",action="store_true")
    args=parser.parse_args()
    data,grouped=verify_fixture()
    if args.fixture_only:return
    import boto3
    client=boto3.client("s3",region_name="auto",
        endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
    key,original=list_approved_original(client)
    counts=inspect(original,data,grouped)
    read_current(client,key,data,grouped,original)
    if any(counts[k] for k in ("missing_other","wrong_names","other_identity_mismatch","prior_input_mismatch")):
        print("FG_SOURCE_QA_STATUS=HOLD unresolved_original_identity_or_input_mismatch=true no_publishing=true")
    else:
        print("FG_SOURCE_QA_STATUS=ORIGINAL_IDENTITIES_RECONCILED not_a_TRI_recalculation=true no_publishing=true")
if __name__=="__main__":
    main()

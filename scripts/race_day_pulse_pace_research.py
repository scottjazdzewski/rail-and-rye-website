#!/usr/bin/env python3
"""Research only: verify pace evidence availability and distinguish field
renormalization from changed projections. No output of private runner data,
no external change feed, no R2 writes, no scorer or publication changes.
"""
import json, os, math, sys
from pathlib import Path
from collections import Counter
from race_day_pulse_customer_example_audit import (
    BUCKET, DATE, TRACKS, HX, norm, n, load, certified, entry_map
)

PACE={"weak","moderate","strong"}
BADGE={"red":0,"gray":1,"green":2}
EVALUATOR="TBS_FACTOR_BADGE_EVALUATOR_V1_2_6_FIT_CLASS_FORM_GUARDS"

def fit(entry):
    matches=[x.get("value") for x in (entry.get("metrics") or [])
             if isinstance(x,dict) and x.get("label")=="Pace Fit"]
    return matches[0] if len(matches)==1 and matches[0] in BADGE else None

def residual(old, new, survivor_mass):
    # Counterfactual benchmark only: proportional redistribution after deletion.
    # A positive residual does NOT identify pace causation or establish value.
    if not all(math.isfinite(x) for x in (old,new,survivor_mass)) or not 0<survivor_mass<=100.00001:
        raise ValueError("invalid survivor mass")
    return new-100*old/survivor_mass

def compare(a,b,reported):
    before,after=entry_map(a),entry_map(b)
    if not before or not after or len(after)<2:
        return "invalid_field",[]
    if not norm(a.get("surface")) or norm(a.get("surface"))!=norm(b.get("surface")):
        return "surface_change_or_missing",[]
    if norm(a.get("track_condition"))!=norm(b.get("track_condition")):
        return "condition_change",[]
    if norm(a.get("distance"))!=norm(b.get("distance")):
        return "distance_change",[]
    if a.get("temporary_rail_feet")!=b.get("temporary_rail_feet"):
        return "rail_change",[]
    def identities(rows):
        out={}
        for x in rows:
            k=n(x.get("program_number")); name=norm(x.get("horse_name"))
            if not k or not name or k in out: return None
            out[k]=name
        return out
    official=identities(reported)
    listed=identities(b.get("scratches") or [])
    if official is None or listed is None or b.get("scratch_count")!=len(listed):
        return "scratch_identity_or_count",[]
    active={k:v for k,v in official.items() if k in before}
    if not active or {k:v for k,v in listed.items() if k in before}!=active:
        return "scratch_revision_mismatch",[]
    if set(after)!=set(before)-set(active):
        return "field_mismatch",[]
    if any(norm(before[k].get("horse_name"))!=v for k,v in active.items()):
        return "scratch_name_mismatch",[]
    if any(not norm(after[k].get("horse_name")) or norm(before[k].get("horse_name"))!=norm(after[k].get("horse_name")) for k in after):
        return "runner_name_mismatch",[]
    if any(norm(before[k].get("jockey"))!=norm(after[k].get("jockey")) or norm(before[k].get("trainer"))!=norm(after[k].get("trainer")) for k in after):
        return "rider_or_trainer_change",[]
    p,q=norm(a.get("pace")),norm(b.get("pace"))
    if p not in PACE or q not in PACE: return "missing_race_pace",[]
    if any(fit(x) is None for x in list(before.values())+list(after.values())):
        return "missing_or_invalid_pace_fit",[]
    vals=[float(x["win_probability_exact"]) for x in list(before.values())+list(after.values())]
    if any(not math.isfinite(x) for x in vals): return "nonfinite_probability",[]
    mass=sum(float(before[k]["win_probability_exact"]) for k in after)
    if mass<=0: return "invalid_survivor_mass",[]
    results=[]
    for k,e in after.items():
        old=float(before[k]["win_probability_exact"]); new=float(e["win_probability_exact"])
        results.append((p!=q, BADGE[fit(e)]>BADGE[fit(before[k])], new-old, residual(old,new,mass)))
    return "comparable",results

def self_test():
    def e(k,w,fit_color):
        return {"program_number":str(k),"horse_name":"Horse "+str(k),
                "win_probability_exact":w,"metrics":[{"label":"Pace Fit","value":fit_color}]}
    scratch={"program_number":"3","horse_name":"Horse 3"}
    a={"surface":"Dirt","pace":"Strong","entries":[e(1,40,"gray"),e(2,40,"green"),e(3,20,"red")]}
    b={"surface":"Dirt","pace":"Moderate","scratch_count":1,"scratches":[scratch],
       "entries":[e(1,50,"green"),e(2,50,"green")]}
    status,rows=compare(a,b,[scratch])
    assert status=="comparable" and rows[0]==(True,True,10,0), rows
    assert not any(r[1] and r[3]>=4 for r in rows) # mechanical gain not enough
    shifted={**b,"entries":[e(1,55,"green"),e(2,45,"green")]}
    assert compare(a,shifted,[scratch])[1][0]==(True,True,15,5)
    assert compare(a,{**b,"surface":"Turf"},[scratch])[0]=="surface_change_or_missing"
    assert compare(a,{**b,"pace":""},[scratch])[0]=="missing_race_pace"
    assert compare(a,{**b,"entries":[e(1,50,""),e(2,50,"green")]},[scratch])[0]=="missing_or_invalid_pace_fit"
    assert compare(a,b,[{**scratch,"horse_name":"Wrong"}])[0]=="scratch_revision_mismatch"
    assert compare(a,{**b,"scratch_count":0},[scratch])[0]=="scratch_identity_or_count"
    assert compare(a,{**b,"track_condition":"Sloppy"},[scratch])[0]=="condition_change"
    assert compare(a,{**b,"entries":[{**e(1,50,"green"),"jockey":"Changed"},e(2,50,"green")]},[scratch])[0]=="rider_or_trainer_change"
    print("PACE_RESEARCH_SELF_TEST=PASS")

def main():
    import boto3
    client=boto3.client("s3",region_name="auto",
        endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
    totals=Counter()
    for slug,name,path in TRACKS:
        count=Counter()
        source=json.loads(Path(path).read_text(encoding="utf8"))
        original,_=load(client,f"race-day-pulse/prescratch/{DATE}/{slug}.json")
        final,meta=load(client,f"projections/dashboard/{DATE}/{slug}.json")
        ok,why=certified(original,final,meta)
        if not ok or any(c.get("race_date")!=DATE or c.get("track_name")!=name for c in (original,final)):
            print(f"PACE_TRACK track={slug} hold=source_lineage_or_identity reason={why}")
            totals["track_hold"]+=1
            continue
        # Original badges must come from the approved evaluator; final badge
        # provenance must be present on its certified release metadata.
        if (original.get("badge_evaluator_version")!=EVALUATOR
            or not HX.fullmatch(str(original.get("badge_source_sha256","")))
            or not HX.fullmatch(str(meta.get("badge_sha256","")))):
            print(f"PACE_TRACK track={slug} hold=badge_provenance")
            totals["track_hold_badge_provenance"]+=1
            continue
        old={int(x["race_number"]):x for x in original.get("races",[])}
        new={int(x["race_number"]):x for x in final.get("races",[])}
        grouped={}
        for x in source.get("scratches",[]): grouped.setdefault(int(x["race_number"]),[]).append(x)
        for race,reported in grouped.items():
            count["scratch_races"]+=1
            # Known conditional entry and source reconciliation exceptions.
            if (slug=="fair-grounds" and race in (2,6)) or (slug=="churchill-downs" and race==8):
                count["known_source_hold"]+=1; continue
            if any(int(x["race_number"])==race and x.get("type") in ("TURF_TO_DIRT","JOCKEY_CHANGE","WEIGHT_CHANGE")
                   for x in source.get("other_changes",[])):
                count["other_reported_change"]+=1; continue
            if race not in old or race not in new:
                count["missing_race"]+=1; continue
            status,rows=compare(old[race],new[race],reported)
            count[status]+=1
            if status!="comparable":continue
            count["pace_state_changed"]+=int(any(x[0] for x in rows))
            count["survivors_compared"]+=len(rows)
            count["pace_fit_improved"]+=sum(x[1] for x in rows)
            count["fit_improved_and_raw_gain_4"]+=sum(x[1] and x[2]>=4 for x in rows)
            count["fit_improved_and_residual_gain_4"]+=sum(x[1] and x[3]>=4 for x in rows)
            count["pace_change_fit_improved_residual_gain_4"]+=sum(x[0] and x[1] and x[3]>=4 for x in rows)
        totals.update(count)
        print("PACE_TRACK "+json.dumps({"track":slug,**count},sort_keys=True))
    print("PACE_SUMMARY "+json.dumps(dict(totals),sort_keys=True))
    print("RESEARCH_ONLY=true PUBLICATION=NONE CAUSAL_CLAIM=NONE R2_WRITES=0")

if __name__=="__main__":
    self_test()
    if "--self-test" not in sys.argv: main()

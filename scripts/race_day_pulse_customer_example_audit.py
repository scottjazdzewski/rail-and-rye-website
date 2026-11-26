#!/usr/bin/env python3
"""Read-only exact-source Race-Day Pulse customer example preview.

Compares immutable private original cards with the current authenticated final
for FG and CD, reconciles the USER-provided 2026-11-26 change ledgers, and
prints only small candidate teaser summaries, NOT complete scores/rosters.
No R2 writes, no score changes, no release, no public API writes, no external fetch.
"""
import json,os,re,unicodedata
from pathlib import Path
from collections import defaultdict

BUCKET="rail-and-rye-private-cards"
DATE="2026-11-26"
TRACKS=[
("churchill-downs","Churchill Downs","research/pulse/2026-11-26-churchill-user-supplied.json"),
("fair-grounds","Fair Grounds","research/pulse/2026-11-26-fair-grounds-user-supplied.json")
]
HX=re.compile(r"^[0-9a-fA-F]{64}$")
def norm(x):
    s=unicodedata.normalize("NFKD",str(x or "").casefold())
    return " ".join("".join(c for c in s if not unicodedata.combining(c)).split())
def n(x):return str(x or "").strip().upper()
def pct(x):return f"{x:.1f}%"
def load(client,key):
    try:
        out=client.get_object(Bucket=BUCKET,Key=key)
        b=out["Body"].read(1_100_001)
        if len(b)>1_100_000:return None,{}
        return json.loads(b),out.get("Metadata") or {}
    except Exception:return None,{}
def certified(original,final,metadata):
    if not original or not final:return False,"MISSING_ORIGINAL_OR_CURRENT"
    if original.get("projection_status")!="prescratch":return False,"ORIGINAL_NOT_PRESCRATCH"
    if final.get("projection_status")!="scratch_final":return False,"CURRENT_NOT_SCRATCH_FINAL"
    if final.get("factor_basis")!="verified_scratch_final":return False,"FACTOR_BASIS_UNVERIFIED"
    if metadata.get("stage","").upper()!="SCRATCH_FINAL" and metadata.get("customer_publish_approved")!="true":
        return False,"FINAL_PUBLICATION_METADATA_NOT_APPROVED"
    orig=original.get("model_receipts") or {}
    recent=final.get("model_receipts") or {}
    if not all(HX.fullmatch(str(recent.get(k,""))) for k in
        ("tri_sha256","f4_sha256","prescratch_parent_sha256","official_changes_sha256")):
        return False,"FINAL_RECEIPT_INVALID"
    if not all(HX.fullmatch(str(orig.get(k,""))) for k in ("tri_sha256","f4_sha256")):
        return False,"ORIGINAL_RECEIPT_INVALID"
    direct=(orig["f4_sha256"]==recent["prescratch_parent_sha256"])
    proof=final.get("parent_replay_proof") or {}
    replay=(isinstance(proof,dict) and proof.get("stored_parent_receipts")==orig
        and proof.get("replay_f4_sha256")==recent["prescratch_parent_sha256"]
        and HX.fullmatch(str(proof.get("replay_tri_sha256",""))))
    return (True,"DIRECT_PARENT" if direct else "CERTIFIED_REPLAY") if direct or replay else (False,"PARENT_LINEAGE_NOT_VERIFIED")
def entry_map(race):
    try:
        data={n(e["program_number"]):e for e in race["entries"]}
        if not data or len(data)!=len(race["entries"]):return None
        vals=[float(x["win_probability_exact"]) for x in data.values()]
        if any(x<0 or x>100 for x in vals) or abs(sum(vals)-100)>1e-5:return None
        return data
    except (KeyError,TypeError,ValueError):return None
def main():
    import boto3
    client=boto3.client("s3",region_name="auto",
        endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
    total=0
    for slug,name,path in TRACKS:
        source=json.loads(Path(path).read_text(encoding="utf8"))
        original,_=load(client,f"race-day-pulse/prescratch/{DATE}/{slug}.json")
        final,meta=load(client,f"projections/dashboard/{DATE}/{slug}.json")
        if not original or not final:
            print(f"PULSE_EXAMPLES_TRACK track={slug} status=MISSING_ORIGINAL_OR_FINAL no_publication=true")
            continue
        if original.get("track_name")!=name or final.get("track_name")!=name:
            print(f"PULSE_EXAMPLES_TRACK track={slug} status=TRACK_IDENTITY_MISMATCH no_publication=true")
            continue
        if original.get("race_date")!=DATE or final.get("race_date")!=DATE:
            print(f"PULSE_EXAMPLES_TRACK track={slug} status=DATE_MISMATCH no_publication=true")
            continue
        ok,why=certified(original,final,meta)
        print(f"PULSE_EXAMPLES_TRACK track={slug} status={final.get('projection_status')} certified_lineage={ok} ancestry={why}")
        if not ok:continue
        old={int(x["race_number"]):x for x in original.get("races",[])}
        new={int(x["race_number"]):x for x in final.get("races",[])}
        grouped=defaultdict(list)
        for scratch in source.get("scratches",[]):
            grouped[int(scratch["race_number"])].append(scratch)
        other=defaultdict(list)
        for change in source.get("other_changes",[]):
            other[int(change["race_number"])].append(change)
        for race in sorted(grouped):
            a,b=old.get(race),new.get(race)
            if not a or not b:
                print(f"PULSE_EXAMPLE race={race} track={slug} HOLD=MISSING_RACE")
                continue
            before,after=entry_map(a),entry_map(b)
            if not before or not after or len(after)<2:
                print(f"PULSE_EXAMPLE race={race} track={slug} HOLD=INVALID_MASS_OR_FIELD")
                continue
            reported=grouped[race]
            active=[r for r in reported if n(r["program_number"]) in before]
            excludes=[r for r in reported if n(r["program_number"]) not in before]
            if any(norm(before[n(r["program_number"])]["horse_name"])!=norm(r["horse_name"]) for r in active):
                print(f"PULSE_EXAMPLE race={race} track={slug} HOLD=ORIGINAL_HORSE_IDENTITY")
                continue
            listed={(n(x.get("program_number")),norm(x.get("horse_name"))) for x in b.get("scratches",[])}
            if any((n(r["program_number"]),norm(r["horse_name"])) not in listed for r in active):
                print(f"PULSE_EXAMPLE race={race} track={slug} HOLD=NOT_ALL_REPORTED_SCRATCHES_PRESENT")
                continue
            removed={n(r["program_number"]) for r in active}
            final_removed={n(x["program_number"]) for x in b.get("scratches",[]) if n(x["program_number"]) in before}
            if final_removed!=removed:
                print(f"PULSE_EXAMPLE race={race} track={slug} HOLD=FINAL_SCRATCH_REVISION_DIFFERS_FROM_USER_SHEET")
                continue
            if set(after)!=set(before)-removed:
                print(f"PULSE_EXAMPLE race={race} track={slug} HOLD=SCORER_FIELD_MISMATCH")
                continue
            if any(norm(before[k]["horse_name"])!=norm(after[k]["horse_name"]) for k in after):
                print(f"PULSE_EXAMPLE race={race} track={slug} HOLD=RUNNER_NAME_DRIFT")
                continue
            oldsurface=norm(a.get("surface"))
            finalsurface=norm(b.get("surface"))
            switch=oldsurface!=finalsurface
            reported_switch=any(ch["type"]=="TURF_TO_DIRT" for ch in other[race])
            if switch!=reported_switch:
                print(f"PULSE_EXAMPLE race={race} track={slug} HOLD=SURFACE_CONTEXT_INCOMPLETE old_surface={oldsurface} new_surface={finalsurface}")
                continue
            if slug=="fair-grounds" and race in (2,6):
                print(f"PULSE_EXAMPLE race={race} track={slug} HOLD=CONDITIONAL_MTO_ELIGIBILITY_AND_JOCKEY_QA")
                continue
            if slug=="churchill-downs" and race in (5,12) and (oldsurface!="turf" or finalsurface not in ("dirt","main")):
                print(f"PULSE_EXAMPLE race={race} track={slug} HOLD=TURF_TO_DIRT_NOT_CERTIFIED")
                continue
            def win(e):return float(e["win_probability_exact"])
            oldfav=max(before,key=lambda k:win(before[k]))
            newfav=max(after,key=lambda k:win(after[k]))
            lead_delta=win(after[newfav])-win(before[newfav])
            shifts=[(k,win(after[k])-win(before[k])) for k in after]
            max_prog,max_delta=max(shifts,key=lambda t:abs(t[1]))
            placements=[]
            for k in after:
                try:
                    p=sum(float(after[k]["f4_probabilities"][f"exact_p{j}"]) for j in (2,3))*100
                    prev=sum(float(before[k]["f4_probabilities"][f"exact_p{j}"]) for j in (2,3))*100
                    placements.append((k,p-prev,p,prev))
                except (KeyError,TypeError,ValueError):pass
            f4=max(placements,key=lambda x:abs(x[1])) if placements else None
            kind=None
            if switch and (oldfav!=newfav or abs(lead_delta)>=4):kind="SURFACE_SWITCH"
            elif oldfav!=newfav and (oldfav in after or lead_delta>=4):kind="NEW_FAVORITE"
            elif abs(max_delta)>=4:kind="WIN_SHIFT"
            elif f4 and abs(f4[1])>=7:kind="F4_SHIFT"
            status="QUALIFIES_QUANTITATIVELY" if kind else "BELOW_PROVISIONAL_GATE"
            if kind:
                target=newfav if kind in ("NEW_FAVORITE","SURFACE_SWITCH") else max_prog if kind=="WIN_SHIFT" else f4[0]
                horse=after[target]["horse_name"]
                pre=win(before[target]);post=win(after[target])
                extra=f" f4_place2plus3_old={f4[3]:.1f}% f4_place2plus3_new={f4[2]:.1f}%" if kind=="F4_SHIFT" else ""
                print(f"PULSE_EXAMPLE race={race} track={slug} status={status} kind={kind} horse_program={target} horse_name={horse!r} old_win={pct(pre)} new_win={pct(post)} old_favorite_program={oldfav} new_favorite_program={newfav} original_surface={oldsurface} final_surface={finalsurface} scratches={len(active)}{extra} publication=DEV_ONLY")
                total+=1
            else:
                print(f"PULSE_EXAMPLE race={race} track={slug} status={status} favorite_changed={oldfav!=newfav} win_shift_gate_4={abs(max_delta)>=4} f4_under_gate_7={bool(f4 and abs(f4[1])>=7)} publication=NONE")
    print(f"PULSE_EXAMPLE_SUMMARY date={DATE} quantitatively_qualified={total} published_live=0 readonly=true")
if __name__=="__main__":
    main()

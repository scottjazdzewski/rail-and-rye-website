"""Private final-field gate. No scoring or web access.

Input JSON: race_date, track, race_number, source_sha256, official_url,
official_retrieved_at (timezone-aware ISO timestamp), original (list of
{program,horse}), official (list of {program,horse,status}), expected
(list of {program,horse}). Status is ACTIVE, SCRATCHED, NOT_DRAWN or
UNRESOLVED. Official must cover every original horse. Evidence must come
from a current authoritative full roster plus verified changes, not an
old AE label; this helper cannot independently authenticate it.
Before scoring run with expected. Before publishing additionally supply
stages object with tri, f4, factors, dashboard lists of unique runner
identities (collapse five factor rows to runner identities first);
use --publication to require all four. No numeric program coercion.
"""
import argparse
import datetime
import json
import re

def require(ok, message):
    if not ok:
        raise ValueError(message)

def index(rows):
    out = {}
    for row in rows:
        p, h = row["program"], row["horse"]
        require(isinstance(p,str) and bool(p.strip()) and p==p.strip(), "Invalid program")
        require(isinstance(h,str) and bool(h.strip()) and h==h.strip(), "Invalid horse")
        require(p not in out, "Duplicate program: "+p)
        out[p] = h
    return out

def verify(m, publication=False):
    require(bool(re.fullmatch(r"[0-9a-f]{64}",m["source_sha256"])), "Missing original source hash")
    require(m["official_url"].startswith("https://"), "Missing official evidence URL")
    stamp=datetime.datetime.fromisoformat(m["official_retrieved_at"].replace("Z","+00:00"))
    require(stamp.utcoffset() is not None, "Official retrieval timestamp must include timezone")
    datetime.date.fromisoformat(m["race_date"])
    require(bool(m["track"]) and type(m["race_number"]) is int and m["race_number"]>0,"Missing race identity")
    original=index(m["original"])
    official=index(m["official"])
    require(original==official,"Official roster does not account for every original identity; reconcile source explicitly")
    allowed={"ACTIVE","SCRATCHED","NOT_DRAWN","UNRESOLVED"}
    for row in m["official"]:
        require(row["status"] in allowed,"Unknown disposition")
        require(row["status"]!="UNRESOLVED","Unresolved runner "+row["program"])
    active=index([r for r in m["official"] if r["status"]=="ACTIVE"])
    require(bool(active),"Empty active field; handle cancellation separately")
    require(index(m["expected"])==active,"Expected field differs from official active roster")
    stages=m.get("stages",{})
    if publication:
        require({"tri","f4","factors","dashboard"} <= set(stages),"Missing publication stages")
    for stage, rows in stages.items():
        require(index(rows)==active,stage+" field differs from official active roster")
    return {"status":"PASS","race_date":m["race_date"],"track":m["track"],"race_number":m["race_number"],"active_programs":list(active),"active_count":len(active)}

def self_test():
    # Synthetic identity fixture reflecting the CD R9 13-entry / 2-scratch incident.
    orig=[{"program":str(i),"horse":"Horse "+str(i)} for i in range(1,14)]
    off=[dict(r,status="SCRATCHED" if r["program"] in {"8","11"} else "ACTIVE") for r in orig]
    active=[r for r in orig if r["program"] not in {"8","11"}]
    m=dict(race_date="2026-11-27",track="CD",race_number=9,source_sha256="a"*64,official_url="https://example.invalid/fixture",official_retrieved_at="2026-11-27T15:00:00-05:00",original=orig,official=off,expected=active,stages={s:active for s in ("tri","f4","factors","dashboard")})
    require(verify(m,True)["active_count"]==11,"Positive regression")
    for bad in [dict(m,expected=active[:-1]),dict(m,official=off[:-1]),dict(m,official=off[:-1]+[dict(off[-1],status="UNRESOLVED")]),dict(m,stages=dict(m["stages"],f4=active[:-1])),dict(m,stages={})]:
        try: verify(bad,True)
        except ValueError: continue
        raise AssertionError("Invalid field accepted")
    print("FINAL_FIELD_ROSTER_SELF_TEST_PASS")

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("manifest",nargs="?")
    p.add_argument("--publication",action="store_true")
    p.add_argument("--self-test",action="store_true")
    a=p.parse_args()
    if a.self_test: self_test()
    else:
        require(a.manifest,"Manifest required")
        with open(a.manifest,encoding="utf-8") as f: print(json.dumps(verify(json.load(f),a.publication)))

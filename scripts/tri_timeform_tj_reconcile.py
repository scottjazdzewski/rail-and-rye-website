#!/usr/bin/env python3
"""Source-proven repair of TimeformUS concatenated trainer headings.

Reads ORIGINAL PDF geometry, never guesses a jockey or numeric rating. Writes
new roster and scoring sidecars to a separate output folder, leaving frozen
model, original PDF, and original extracted files unchanged.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
from pathlib import Path
from tri_timeform_tj_reconcile_gate import printed_person, page_spans, same_person
import fitz

TITLE_PREFIX = "Earnings Top Fig "


def repair(roster_path, source_dir, sidecars_dir, dest_dir, day):
    roster = json.loads(Path(roster_path).read_text(encoding="utf-8"))
    source_dir = Path(source_dir)
    sidecars_dir = Path(sidecars_dir)
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    documents = {}
    corrected = copy.deepcopy(roster)
    corrected_rows = []
    held = []
    for race in corrected:
        filename = race["filename"]
        if filename not in documents:
            documents[filename] = fitz.open(source_dir / filename)
        doc = documents[filename]
        track_code = filename.split("TFUS")[-1].split("99.pdf")[0]
        for horse in race["runners"]:
            spans = page_spans(doc[horse["page"]])
            for role in ("trainer", "jockey"):
                actual, proof = printed_person(spans, horse["name"], role)
                old = horse.get(role)
                if proof != "SOURCE_PERSON_VERIFIED_GEOMETRICALLY":
                    held.append({"track": track_code, "race": race["race_no"], "program": horse["number"], "horse": horse["name"], "role": role, "reason": proof})
                    continue
                if same_person(actual, old):
                    horse[role] = actual
                    continue
                if role == "trainer" and str(old or "").startswith(TITLE_PREFIX) and same_person(old[len(TITLE_PREFIX):], actual):
                    corrected_rows.append({"track": track_code, "race": race["race_no"], "program": horse["number"], "horse": horse["name"], "role": role, "old": old, "source_verified": actual, "pdf": filename, "page": horse["page"]+1})
                    horse[role] = actual
                else:
                    held.append({"track": track_code, "race": race["race_no"], "program": horse["number"], "horse": horse["name"], "role": role, "reason": "IDENTITY_CONFLICT_NOT_AUTO_CORRECTABLE", "source_verified": actual})
    (dest_dir / "source_roster_reconciled.json").write_text(json.dumps(corrected, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    track_counts = {}
    for track in sorted({x['filename'].split('TFUS')[-1].split('99.pdf')[0] for x in roster}):
        folder = sidecars_dir / track
        path = folder / "card_connections.json"
        source = json.loads(path.read_text(encoding="utf-8"))
        changed = {(x["race"], x["program"], x["horse"]): x for x in corrected_rows if x['track']==track}
        for row in source["rows"]:
            old = changed.get((row['race'], row['program'], row['horse']))
            if not old:
                continue
            if row['trainer_person'] != old['old']:
                raise ValueError("Original sidecar trainer did not match expected damaged source")
            row['trainer'] = old['source_verified']
            row['trainer_label'] = old['source_verified']
            row['trainer_person'] = old['source_verified']
            # Keep exact raw rating and approved state; only correct the source person.
            row['trainer_resolution_evidence'] = row['trainer_resolution_evidence'].replace(
                'trainer ' + old['old'] + ',', 'trainer ' + old['source_verified'] + ',')
            row['trainer_resolution_evidence'] += f' Source-person geometry-verified on PDF page {old["page"]}; removed layout header only.'
        target = dest_dir / "sidecars" / track
        target.mkdir(parents=True, exist_ok=True)
        (target / 'card_connections.json').write_text(json.dumps(source,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
        # Original connection evidence contains raw trainer person names; update only
        # the rows tied to exact race / program / horse identity.
        for fname in ['connections.jsonl','person_registry.jsonl']:
            original=folder/fname
            if not original.exists():
                raise ValueError('Required canonical source sidecar missing: '+str(original))
            lines=[json.loads(l) for l in original.read_text(encoding='utf-8').splitlines() if l.strip()]
            if fname=='connections.jsonl':
                for line in lines:
                    if line.get('role')!='Trainer':continue
                    old=changed.get((line.get('race'),line.get('program'),line.get('horse')))
                    if old:
                        if line.get('person')!=old['old']:
                            raise ValueError('Connection evidence/person mismatch')
                        line['person']=old['source_verified']
            else:
                # Historical registry may collapse one name with multiple entries;
                # only replace an exact corrupted merged-heading identity.
                for line in lines:
                    if line.get('role')!='Trainer':continue
                    for old in changed.values():
                        if line.get('person')==old['old']:
                            line['person']=old['source_verified']
            (target/fname).write_text(''.join(json.dumps(line,ensure_ascii=False)+'\n' for line in lines),encoding='utf-8')
        track_counts[track] = len(changed)
    output={"date":day,"lock_id":"RAIL_RYE_TJ_SOURCE_GEOMETRY_V1","geometry_verified_trainer_corrections":len(corrected_rows),
            "affected_tracks":track_counts,"identity_holds":held,
            "name_corrections":corrected_rows,"changes_to_provider_rating_values":0,
            "frozen_model_modified":False}
    (dest_dir / "source_role_reconciliation_changes.json").write_text(json.dumps(output,indent=2,ensure_ascii=False)+"\n",encoding='utf-8')
    print('SOURCE_GEOMETRY_RECONCILED',len(corrected_rows),'trainer headings; unproven identity roles',len(held))
    print('rerun all affected tracks with CORRECTED sidecars; no percentages reused')
    return output


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--roster',type=Path,required=True)
    parser.add_argument('--source-dir',type=Path,required=True)
    parser.add_argument('--sidecars-dir',type=Path,required=True)
    parser.add_argument('--race-date',required=True)
    parser.add_argument('--out-dir',type=Path,required=True)
    a=parser.parse_args()
    repair(a.roster,a.source_dir,a.sidecars_dir,a.out_dir,a.race_date)

if __name__=='__main__':main()
#!/usr/bin/env python3
"""Rail & Rye: immutable TimeformUS trainer/jockey source reconciliation preflight.

This tool checks original PDF geometry and the scoring sidecars. It does NOT
modify the frozen model, invent identities/ratings or convert provider scales.
Confirmed missing rating => V4 model-mean neutral disposition; confirmed 0
is preserved. Unverified identity => hold affected race only. Independently verified unassigned jockey => neutral.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

try:
    import fitz
except ImportError as exc:
    raise SystemExit("PyMuPDF required: pip install pymupdf") from exc

LOCK_ID = "RAIL_RYE_TJ_SOURCE_GEOMETRY_V1"
KNOWN = "NOT_FLAGGED_TFUS_VALUE_PRESENT"
NEUTRAL = "VERIFIED_UNRATED"
ZERO = "VERIFIED_ZERO"
ROLES = ("trainer", "jockey")


def identity(row):
    return (str(row.get("date", "")), int(row.get("race", 0)),
            str(row.get("program", "")).strip().upper(),
            re.sub(r"\W+", "", str(row.get("horse", "")).casefold()))


def page_spans(page):
    return [sp for block in page.get_text("dict")["blocks"]
            if "lines" in block for line in block["lines"]
            for sp in line["spans"]]


def printed_person(spans, horse, role):
    """Read the actual PDF name beside the correct role, not flattened text.

    TimeformUS occasionally merges `Earnings Top Fig` with the trainer on
    the same native-PDF span. This strips ONLY that verified column heading.
    """
    anchors = [sp for sp in spans if 20 <= sp["bbox"][0] <= 190
               and sp["text"].strip() == horse]
    if len(anchors) != 1:
        return None, "HORSE_TITLE_MISSING_OR_AMBIGUOUS"
    y = anchors[0]["bbox"][1]
    if role == "jockey":
        lines = [sp for sp in spans if 407 <= sp["bbox"][0] <= 440
                 and sp["text"].strip().startswith("Jockey")
                 and abs(sp["bbox"][1] - (y + 20)) <= 12]
        if len(lines) != 1:
            return None, "JOCKEY_NAME_ABSENT_FROM_ORIGINAL_PDF"
        person = re.sub(r"^Jockey\s*", "", lines[0]["text"].strip()).strip()
        if not person:
            return None, "JOCKEY_IDENTITY_BLANK_ON_ORIGINAL_PDF"
    else:
        headers = [sp for sp in spans if 467 <= sp["bbox"][0] <= 510
                   and sp["text"].strip().startswith("Ratings")
                   and abs(sp["bbox"][1] - (y - 6)) <= 12]
        if len(headers) != 1:
            return None, "TRAINER_RATINGS_LABEL_MISSING_OR_AMBIGUOUS"
        ry = headers[0]["bbox"][1]
        name_spans = [sp for sp in spans if 340 <= sp["bbox"][0] < 475
                      and abs(sp["bbox"][1] - ry) <= 2.0
                      and sp["text"].strip() not in
                      ("Earnings", "Top Fig", "Earnings Top Fig")]
        if not name_spans:
            return None, "TRAINER_NAME_MISSING_FROM_ORIGINAL_PDF"
        original = " ".join(x["text"].strip() for x in name_spans).strip()
        person = re.sub(r"^Earnings\s+Top\s+Fig\s*", "", original,
                        flags=re.IGNORECASE).strip()
        if not person or person == original == "Earnings Top Fig":
            return None, "TRAINER_IDENTITY_NOT_EXTRACTABLE"
    if not person or len(person) > 90:
        return None, "INVALID_OR_AMBIGUOUS_PERSON_NAME"
    return person, "SOURCE_PERSON_VERIFIED_GEOMETRICALLY"


def same_person(a, b):
    return re.sub(r"[^a-z0-9]", "", str(a or "").casefold()) == re.sub(
        r"[^a-z0-9]", "", str(b or "").casefold())


def detect_rating(spans, horse, role):
    # The printed TimeformUS Ratings table has its own x-coordinate column.
    # Never read 'Past Yr', 'Win%', 'Starts', or the next column as the rating.
    anchors = [sp for sp in spans if 20 <= sp["bbox"][0] <= 190
               and sp["text"].strip() == horse]
    if len(anchors) != 1:
        return None, "HORSE_TITLE_MISSING_OR_AMBIGUOUS"
    y = anchors[0]["bbox"][1]
    word, offset = ("Overall", 3) if role == "trainer" else ("Jockey", 20)
    labels = [sp for sp in spans if 407 <= sp["bbox"][0] <= 440
              and (sp["text"].strip() == word
                   or sp["text"].strip().startswith(word + " "))
              and abs(sp["bbox"][1] - (y + offset)) <= 12]
    if len(labels) != 1:
        return None, "ROLE_LABEL_MISSING_OR_AMBIGUOUS"
    headers = [sp for sp in spans if 467 <= sp["bbox"][0] <= 500
               and sp["text"].strip().startswith("Ratings")
               and abs(sp["bbox"][1] - (y - 6)) <= 12]
    if len(headers) != 1:
        return None, "RATINGS_COLUMN_HEADER_MISSING_OR_AMBIGUOUS"
    x = headers[0]["bbox"][0]
    matching = [sp for sp in spans if (x - 7) <= sp["bbox"][0] <= (x + 27)
                and abs(sp["bbox"][1] - labels[0]["bbox"][1]) <= 2.5
                and re.fullmatch(r"\d{1,3}", sp["text"].strip())]
    if len(matching) > 1:
        return None, "MULTIPLE_RATING_VALUES_IN_CELL"
    if not matching:
        return None, "SOURCE_VERIFIED_RATING_BLANK"
    rating = int(matching[0]["text"])
    if not 0 <= rating <= 100:
        return None, "RATING_OUT_OF_PROVIDER_RANGE"
    return rating, "SOURCE_PRINTED_RATING"


def verified_unassigned_jockey(horse, row, spans, digest, day, track_code, race_no, page):
    """An explicit operator-captured official entry observation is required.
    A missing PDF label alone is NEVER enough. Proof is scoped to the original
    source hash, page and exact starter; an assigned rider cannot use this path.
    """
    proof = row.get("jockey_unassigned_proof")
    if not isinstance(proof, dict):
        return False
    name = str(horse.get("name", "")).strip()
    num = str(horse.get("number", "")).strip().upper()
    person, state = printed_person(spans, name, "jockey")
    if person is not None or state not in ("JOCKEY_NAME_ABSENT_FROM_ORIGINAL_PDF", "JOCKEY_IDENTITY_BLANK_ON_ORIGINAL_PDF"):
        return False
    anchors = [sp for sp in spans if 20 <= sp["bbox"][0] <= 190 and sp["text"].strip() == name]
    if len(anchors) != 1:
        return False
    y = anchors[0]["bbox"][1]
    labels = [sp for sp in spans if 407 <= sp["bbox"][0] <= 440 and sp["text"].strip().startswith("Jockey") and abs(sp["bbox"][1] - (y + 20)) <= 12]
    if len(labels) > 1 or any(sp["text"].strip() != "Jockey" for sp in labels):
        return False
    # A genuine printed jockey row with a number is not an unassigned input.
    if labels and detect_rating(spans, name, "jockey") != (None, "SOURCE_VERIFIED_RATING_BLANK"):
        return False
    if any(str(x or "").strip() not in ("", "Not assigned") for x in (horse.get("jockey"),row.get("jockey_person"))):
        return False
    expected_url = "https://tvg.equibase.com/static/entry/" + track_code + date.fromisoformat(day).strftime("%m%d%y") + "USA" + str(race_no) + "-EQB.html"
    return (proof.get("date") == day and proof.get("track_code") == track_code and proof.get("race") == race_no
            and proof.get("program") == num and proof.get("horse") == name
            and proof.get("source_pdf_sha256") == digest and proof.get("pdf_page") == page + 1
            and proof.get("official_entry_url") == expected_url
            and proof.get("official_jockey") is None and "official_jockey" in proof
            and proof.get("status") == "VERIFIED_UNASSIGNED"
            and isinstance(proof.get("checked_at"), str) and bool(proof["checked_at"].strip())
            and isinstance(proof.get("observation"), str) and bool(proof["observation"].strip())
            and row.get("jockey_rating") is None
            and row.get("jockey_resolution_disposition") == NEUTRAL
            and row.get("jockey_rating_model_state") == NEUTRAL
            and digest in str(row.get("jockey_resolution_evidence", "")))


def reconcile(roster_path, source_dir, sidecars_dir, race_date):
    races = json.loads(Path(roster_path).read_text(encoding="utf-8"))
    if not isinstance(races, list) or not races:
        raise ValueError("Complete date-scoped source roster required")
    pdf_cache = {}; sidecar_cache = {}; summary = defaultdict(lambda: {"races": set(), "runners": 0, "roles_verified": 0, "neutral": 0, "zeros": 0, "held_races": set(), "holds": [], "source_sha256": ""})
    matched = set()
    for race in races:
        file_name = race.get("filename")
        if not file_name or not re.fullmatch(r"[A-Za-z0-9_.-]+\.pdf", file_name):
            raise ValueError("Invalid original PDF filename")
        pdf_path = Path(source_dir) / file_name
        if not pdf_path.is_file():
            raise ValueError("Missing original PDF: " + file_name)
        if file_name not in pdf_cache:
            doc = fitz.open(pdf_path)
            pdf_cache[file_name] = (doc, hashlib.sha256(pdf_path.read_bytes()).hexdigest(), {})
        doc, digest, spans_by_page = pdf_cache[file_name]
        track_match = re.search(r"TFUS([A-Z]{2,3})99\.pdf$", file_name)
        track_code = track_match.group(1) if track_match else None
        if not track_code:
            raise ValueError("Cannot identify track from immutable PDF filename")
        report = summary[track_code]
        report["source_sha256"] = digest
        race_no = int(race.get("race_no", 0))
        report["races"].add(race_no)
        if track_code not in sidecar_cache:
            path = Path(sidecars_dir) / track_code / "card_connections.json"
            if not path.is_file():
                raise ValueError("Missing approved card connection sidecar for " + track_code)
            source = json.loads(path.read_text(encoding="utf-8"))
            rows = source.get("rows", [])
            keys = [identity(item) for item in rows]
            if len(keys) != len(set(keys)):
                raise ValueError("Duplicate trainer/jockey sidecar runner for " + track_code)
            sidecar_cache[track_code] = (source, dict(zip(keys, rows)))
        sidecar, side_by_key = sidecar_cache[track_code]
        if sidecar.get("source_pdf_sha256") != digest:
            raise ValueError("Source/sidecar PDF SHA mismatch: " + track_code)
        for horse in race.get("runners", []):
            report["runners"] += 1
            num = str(horse.get("number", "")).strip().upper()
            hname = str(horse.get("name", "")).strip()
            key = (race_date, race_no, num, re.sub(r"\W+", "", hname.casefold()))
            if key in matched:
                raise ValueError("Duplicate source horse " + str(key))
            matched.add(key)
            source_row = side_by_key.get(key)
            if source_row is None:
                report["holds"].append({"race": race_no, "program": num, "horse": hname, "role": "both", "reason": "NO_EXACT_RACE_PROGRAM_HORSE_SIDECAR_MATCH"})
                report["held_races"].add(race_no)
                continue
            pidx = horse.get("page")
            if not isinstance(pidx, int) or not (0 <= pidx < len(doc)):
                report["held_races"].add(race_no)
                report["holds"].append({"race": race_no, "program": num, "horse": hname, "role": "both", "reason": "INVALID_PDF_PAGE_REFERENCE"})
                continue
            if pidx not in spans_by_page:
                spans_by_page[pidx] = page_spans(doc[pidx])
            spans = spans_by_page[pidx]
            for role in ROLES:
                person = str(horse.get(role) or "").strip()
                side_person = str(source_row.get(role + "_person") or "").strip()
                value, source_state = detect_rating(spans, hname, role)
                source_person, person_state = printed_person(spans, hname, role)
                if role == "jockey" and verified_unassigned_jockey(horse, source_row, spans, digest, race_date, track_code, race_no, pidx):
                    value = None
                    problem = ""
                elif person_state != "SOURCE_PERSON_VERIFIED_GEOMETRICALLY":
                    problem = person_state
                elif source_state not in ("SOURCE_VERIFIED_RATING_BLANK", "SOURCE_PRINTED_RATING"):
                    problem = source_state
                elif not person or not side_person or not same_person(person, side_person) or not same_person(person, source_person):
                    problem = "PERSON_IDENTITY_DIFFERS_FROM_PDF_OR_SIDECAR"
                elif source_row.get(role + "_rating") != value:
                    problem = "RATING_NOT_EQUAL_TO_PDF_RATINGS_COLUMN"
                else:
                    disposition = NEUTRAL if value is None else ZERO if value == 0 else KNOWN
                    if source_row.get(role + "_resolution_disposition") != disposition:
                        problem = "SIDECAR_DISPOSITION_VS_PRINT_MISMATCH"
                    elif source_row.get(role + "_rating_model_state") != disposition:
                        problem = "SIDECAR_MODEL_STATE_VS_PRINT_MISMATCH"
                    elif digest not in str(source_row.get(role + "_resolution_evidence", "")):
                        problem = "MISSING_EXACT_SOURCE_SHA_IN_PROOF"
                    else:
                        problem = ""
                if problem:
                    report["held_races"].add(race_no)
                    report["holds"].append({"race": race_no, "program": num, "horse": hname, "role": role, "reason": problem})
                else:
                    report["roles_verified"] += 1
                    report["neutral"] += value is None
                    report["zeros"] += value == 0
    for track, (_, rows) in sidecar_cache.items():
        all_keys = set(rows)
        track_keys = {key for key in matched if key in rows}
        if all_keys != track_keys:
            raise ValueError(f"Source/sidecar full-field roster mismatch: {track} (extra={len(all_keys-track_keys)}, missing={len(track_keys-all_keys)})")
    final = {}
    for track, item in sorted(summary.items()):
        safe = set(item["races"]) - item["held_races"]
        final[track] = {"status": "PASS" if not item["held_races"] else "PARTIAL_HOLD",
             "race_count": len(item["races"]), "runners": item["runners"],
             "roles_verified": item["roles_verified"], "neutral_roles": item["neutral"],
             "verified_zero_roles": item["zeros"],
             "eligible_races": sorted(safe), "held_races": sorted(item["held_races"]),
             "holds": item["holds"], "source_pdf_sha256": item["source_sha256"]}
    return {"lock_id": LOCK_ID, "race_date": race_date,
            "original_field_runners": len(matched), "tracks": final,
            "all_tracks_complete": all(x["status"] == "PASS" for x in final.values()),
            "no_model_coefficients_modified": True,
            "neutral_policy": "TRI_TJ_NEUTRAL_MEAN_V4_ALWAYS_ON",
            "instruction": "Apply neutral rating AND known feature means in canonical frozen scoring hook; never replace blanks with zero or 50."}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--roster", type=Path, required=True)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--sidecars-dir", type=Path, required=True)
    parser.add_argument("--race-date", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()
    date.fromisoformat(args.race_date)
    report = reconcile(args.roster, args.source_dir, args.sidecars_dir, args.race_date)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for track, x in report["tracks"].items():
        print(f"{track}: {x['status']}; runners={x['runners']}; roles={x['roles_verified']}; held races={x['held_races']}")
    print(f"LOCKED_SOURCE_GATE {report['lock_id']} -- {args.out}")
    if args.require_complete and not report["all_tracks_complete"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
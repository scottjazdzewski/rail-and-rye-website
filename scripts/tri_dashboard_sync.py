#!/usr/bin/env python3
"""Publish verified frozen TRI V4.1/F4 V2 prescratch ZIP directly to Cloudflare R2.

Run from the TRI production process after the model passes all gates.
No Google Cloud, Google Drive sync or GitHub scheduled runner required.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import os
import re
import sys
import unicodedata
import zipfile
from tri_f4_finish_order import apply_certified_f4_order, F4OrderHold

APPROVED_STATUSES = {"TRI_V4_F4_V2_MODEL_SOURCE_INPUT_ERRORS_RESOLVED_ALL_FIVE", "TRI_V4_F4_V2_PRESCRATCH_ALL_TRACKS_PASS"}
PWIN_PASS = "PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME"
TRACK_FILE_RE = re.compile(r"^([A-Z0-9]{2,4})_(\d{4})_VERIFIED_TRI_F4_SOURCE\.json$")
F4 = ("exact_p1", "exact_p2", "exact_p3", "exact_p4", "exact_p5", "p6_plus", "top2", "top3", "top4")
MAX_ZIP_SIZE = 16 * 1024 * 1024
MAX_UNCOMPRESSED = 35 * 1024 * 1024
MAX_IMPORT_SIZE = 1024 * 1024
BUCKET_DEFAULT = "rail-and-rye-private-cards"


class Hold(RuntimeError):
    """Do not publish anything if input or previous-release status is unsafe."""


def require(ok, message):
    if not ok:
        raise Hold(message)


def compact_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def read_member(archive, name):
    require(name in archive.namelist(), "Missing signed-off evidence: " + name)
    return archive.read(name)


def parse_json(archive, name):
    return json.loads(read_member(archive, name))


def digest(value):
    return hashlib.sha256(value).hexdigest()


def prob(value, label):
    require(type(value) in (int, float) and 0 <= value <= 1, label + ": invalid probability")
    return float(value)


def build_cards(zip_bytes):
    """Pure, offline, fail-closed transform; no external service called."""
    require(len(zip_bytes) <= MAX_ZIP_SIZE, "Input ZIP is too large")
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        names = z.namelist()
        require(len(names) <= 140, "Excessive ZIP members")
        require(sum(x.file_size for x in z.infolist()) <= MAX_UNCOMPRESSED, "ZIP exceeds expansion limit")
        require(all(".." not in x.filename.split("/") and not x.filename.startswith("/") for x in z.infolist()),
                "Unsafe ZIP file path")
        receipt = parse_json(z, "RESOLUTION_RECEIPT.json")
        require(receipt.get("status") in APPROVED_STATUSES and receipt.get("prescratch_not_final") is True,
                "Model-resolution receipt is not a valid prescratch PASS")
        date = receipt.get("date")
        require(isinstance(date, str) and re.fullmatch(r"20\d{2}-\d{2}-\d{2}", date),
                "Invalid signed-off race date")
        try:
            asof = dt.date.fromisoformat(date)
        except ValueError as exc:
            raise Hold("Invalid model date") from exc
        mmdd = asof.strftime("%m%d")
        expected = receipt.get("tracks", [])
        require(isinstance(expected, list) and expected, "No certified tracks")
        require(len({item.get("track") for item in expected}) == len(expected), "Duplicate receipt track")
        actual_files = [x for x in names if TRACK_FILE_RE.fullmatch(x)]
        require(len(actual_files) == len(expected), "Track export count differs from resolution receipt")
        cards = []
        f4_receipts = {}
        race_total = runner_total = role_total = 0
        for proof in expected:
            code = proof["track"]
            filename = f"{code}_{mmdd}_VERIFIED_TRI_F4_SOURCE.json"
            source = parse_json(z, filename)
            require(source.get("race_date") == date and source.get("track_code") == code,
                    "Track/date source identity mismatch")
            require(source.get("output_kind") == "INTERNAL_VERIFIED_MODEL_SCORE_HANDOFF_NOT_CUSTOMER_CARD",
                    "Source file is not the certified internal score handoff")
            require(source.get("release_state") == "SCORES_PASS_AND_F4_PASS__CUSTOMER_RENDER_AND_VISUAL_QA_NOT_DONE",
                    "Source file release state is not prescratch-only")
            require(source.get("pick_tickets") is None, "Race source unexpectedly includes Pick tickets")
            receipt_map = source.get("scorer_receipts", {})
            paths = {
                "tri_receipt_sha256": f"internal_receipts/{code}/tri_receipt.json",
                "f4_receipt_sha256": f"internal_receipts/{code}/TRI_F4_V2_{asof.strftime('%Y%m%d')}_PRESCRATCH_SCORING_RECEIPT.json",
                "role_audit_sha256": f"internal_receipts/{code}/source_roles_audit.json",
            }
            for key, path in paths.items():
                require(receipt_map.get(key) == digest(read_member(z, path)),
                        "Certified scorer evidence checksum mismatch for " + code + ": " + key)
            tri = parse_json(z, paths["tri_receipt_sha256"])
            f4r = parse_json(z, paths["f4_receipt_sha256"])
            roles_audit = parse_json(z, paths["role_audit_sha256"])
            require(tri.get("status") == PWIN_PASS and f4r.get("status") == "PASS",
                    "Frozen scorer receipt did not PASS for " + code)
            f4_receipts[code] = f4r
            require(f4r.get("official_scratches_verified") is False,
                    "Prescratch-only importer does not accept finalized scratch outputs")
            require(not roles_audit.get("unresolved"), "Unresolved trainer/jockey evidence for " + code)
            require(roles_audit.get("date") == date and roles_audit.get("track") == code,
                    "Role-audit identity mismatch for " + code)
            sidecar = parse_json(z, f"internal_receipts/{code}/sidecar.json")
            require(sidecar.get("asof") == date, "Connection sidecar date mismatch")
            source_rows = sidecar.get("rows", [])
            lookup = {}
            for row in source_rows:
                key = (int(row["race"]), str(row["program"]), str(row["horse"]).strip().casefold())
                require(key not in lookup and row.get("date") == date, "Duplicate/mismatched connection evidence")
                require(row.get("trainer_person") and row.get("jockey_person"),
                        "Missing verified trainer or jockey")
                lookup[key] = row
            track = {"schema_version": 1, "race_date": date,
                     "track_name": source["track_name"], "track_code": code, "projection_status": "prescratch",
                     "model_name": "Frozen TRI TJ V4.1 PWIN + F4 V2",
                     "fair_odds_basis": "net_to_1_review", "races": []}
            used = set()
            for race in source.get("races", []):
                num = int(race["race_number"])
                require(race.get("state") == "PRESCRATCH_TRI_F4_RECEIPTS_PASS",
                        "Race is not marked model verified")
                purse = race.get("official_purse_usd")
                require(type(purse) is int and purse > 0, "Exact official purse is required")
                entries = []
                mass = 0.0
                for horse in race.get("entries", []):
                    key = (num, str(horse["program_number"]), str(horse["horse_name"]).strip().casefold())
                    require(key in lookup and key not in used, "Runner not matched to verified role evidence")
                    used.add(key)
                    identity = lookup[key]
                    pwin = float(horse["win_probability_exact"])
                    require(0 <= pwin <= 100, "Invalid TRI win probability")
                    display = float(horse["win_probability_display_1dp"])
                    require(abs(pwin - display) <= .051, "Displayed win chance conflicts with frozen score")
                    fair = float(horse["fair_odds_to_1_exact"])
                    require(pwin > 0 and 0 <= fair <= 100000 and abs((100/pwin - 1) - fair) < .00001,
                            "Fair odds conflict with exact PWIN")
                    placements = {k: prob(horse["f4_probabilities"][k], k) for k in F4}
                    require(abs(sum(placements[k] for k in F4[:6]) - 1) < 1e-7, "F4 outcomes do not total one")
                    require(abs(placements["exact_p1"]*100 - pwin) < 1e-6, "F4 winner not TRI winner")
                    for top, last, component in [("top2","exact_p1","exact_p2"),
                                                  ("top3","top2","exact_p3"),
                                                  ("top4","top3","exact_p4")]:
                        require(abs(placements[top] - placements[last] - placements[component]) < 1e-7,
                                "F4 cumulative finish inconsistent")
                    entries.append({
                        "program_number": str(horse["program_number"]),
                        "horse_name": horse["horse_name"], "rank": None,
                        "win_probability": display, "win_probability_exact": pwin,
                        "morning_line": horse.get("morning_line") or "",
                        "fair_odds": f"{fair:.2f}/1", "fair_odds_net_to_1_exact": fair,
                        "trainer": identity["trainer_person"], "jockey": identity["jockey_person"],
                        "metrics": [], "notes": "", "f4_probabilities": placements
                    })
                    mass += pwin
                require(entries and abs(mass - 100) < 1e-6, "Race PWIN mass not 100%")
                track["races"].append({
                    "race_number": num, "post_time_et": race.get("post_time_et") or "",
                    "surface": race.get("surface") or "", "distance": race.get("distance") or "",
                    "conditions": race.get("race_class_or_name") or "",
                    "purse": f"${purse:,}", "pace": "", "scratch_count": None,
                    "scratches": [], "summary": "", "entries": entries
                })
            race_count = len(track["races"])
            runners = sum(len(r["entries"]) for r in track["races"])
            require(race_count == proof["races"] and runners == proof["runners"],
                    "Track cardinality differs from verified receipt for " + code)
            require(len(used) == len(lookup) == runners and roles_audit.get("runner_count") == runners,
                    "Source trainer/jockey role coverage incomplete for " + code)
            require(tri.get("races") == race_count and tri.get("starters") == runners,
                    "Frozen TRI receipt race/runner count conflict")
            cards.append(track)
            race_total += race_count
            runner_total += runners
            role_total += runners * 2
        require(race_total == receipt["race_total"] and runner_total == receipt["runner_total"],
                "Combined race/runner counts differ from signed-off receipt")
        require(role_total == receipt["role_cells_verified"],
                "Combined trainer/jockey count differs from proof")
        try:
            ordered_races = apply_certified_f4_order(cards, z, date, f4_receipts)
        except F4OrderHold as exc:
            raise Hold("Certified F4 finishing order unavailable: " + str(exc)) from exc
        require(ordered_races == race_total,
                "Certified F4 finishing order did not cover all scored races")
        payload = compact_json({"cards": cards})
        require(len(payload) <= MAX_IMPORT_SIZE, "Dashboard payload exceeds API size limit")
        return date, cards, payload, {"tracks": len(cards), "races": race_total,
                                      "runners": runner_total, "f4_ordered_races": ordered_races, "sha256": digest(zip_bytes)}


def attach_verified_badges(cards, badge_zip_bytes):
    """Merge only source-certified factor badges/pace from the approved race-card QA ZIP.

    This preserves exact frozen TRI/F4 projections and rejects partial or
    stale evaluator evidence. No fabricated/default colored badges.
    """
    require(len(badge_zip_bytes) <= 20*1024*1024, "Badge QA package exceeds limit")
    with zipfile.ZipFile(io.BytesIO(badge_zip_bytes)) as z:
        names=z.namelist()
        require(len(names) <= 200 and
                all(not x.startswith("/") and ".." not in x.split("/") for x in names),
                "Invalid badge QA ZIP structure")
        require(sum(x.file_size for x in z.infolist()) <= 45*1024*1024,
                "Badge QA expansion limit exceeded")
        manifest=parse_json(z,"SHA256_MANIFEST.json")
        receipt_path="output/FINAL_QA_RECEIPT.json"
        require(manifest.get(receipt_path)==digest(read_member(z,receipt_path)),
                "Approved production QA receipt checksum mismatch")
        receipt=parse_json(z,receipt_path)
        dates={card["race_date"] for card in cards}
        require(len(dates)==1 and receipt.get("date") in dates and
                receipt.get("production")=="PRESCRATCH_RACECARDS_ONLY" and
                receipt.get("root_self_test")=="PASS_CANONICAL_PRODUCTION_SEAL_AND_ALL_STATIC_SADDLE_CHIPS",
                "Badge source is not current-root certified prescratch evidence")
        expected_races=sum(len(card["races"]) for card in cards)
        expected_runners=sum(len(r["entries"]) for card in cards for r in card["races"])
        require(receipt.get("source_races")==expected_races
                and receipt.get("source_runners")==expected_runners,
                "Badge QA card population differs from certified model field")
        factors=[("Speed","speed"),("Form","form"),("Class","class"),
                 ("Pace Fit","pace"),("Surface / Distance","surface")]
        matched=0
        for card in cards:
            code=card.get("track_code")
            require(isinstance(code,str) and re.fullmatch(r"[A-Z0-9]{2,4}",code),
                    "Original TRI track code unavailable for badge evidence matching")
            ledger_path=f"data/{code}/badge_audit_ledger.json"
            data_path=f"data/{code}/{code}_RACE_ONLY_INPUT.json"
            for path in (ledger_path,data_path):
                require(manifest.get(path)==digest(read_member(z,path)),
                        "Badge source checksum mismatch: "+path)
            ledger=parse_json(z,ledger_path)
            source=parse_json(z,data_path)
            require(source.get("track_code")==code
                    and source.get("track_name")==card["track_name"]
                    and source.get("badge_evaluator_version")==
                        "TBS_FACTOR_BADGE_EVALUATOR_V1_2_6_FIT_CLASS_FORM_GUARDS",
                    "Unapproved badge evaluator or track identity")
            require(source.get("no_pick_tickets") is True, "Badge evidence includes obsolete pick tickets")
            rows={}
            for row in ledger:
                key=(int(row["Race"]),str(row["Program"]),
                     str(row["Horse"]).strip().casefold(),row["Factor"])
                require(key not in rows,"Duplicate source badge factor evidence")
                rows[key]=row
            used=set()
            race_lookup={r["race_no"]:r for r in source.get("races",[])}
            require(len(race_lookup)==len(card["races"]),
                    "Missing race in official badge source")
            for race in card["races"]:
                src=race_lookup.get(race["race_number"])
                require(src is not None and len(src.get("rows",[]))==len(race["entries"])
                        and not src.get("scratches"),
                        "Badge-source race field differs from initial TRI field")
                require(f"${src.get('official_purse_usd'):,}"==race["purse"],
                        "Badge-source official purse conflicts with TRI card")
                pace=str(src.get("pace") or "").lower()
                require(pace in ("strong","moderate","weak"),
                        "Certified race pace state unavailable")
                source_runners={str(item["program"]):item for item in src["rows"]}
                require(len(source_runners)==len(src["rows"]),"Duplicate badge-source runner")
                for horse in race["entries"]:
                    program=str(horse["program_number"])
                    row=source_runners.get(program)
                    require(row is not None and
                            row["horse"].strip().casefold()==horse["horse_name"].strip().casefold(),
                            "Badge-source runner differs from original TRI card")
                    require(abs(float(row["pwin"])-float(horse["win_probability"]))<0.000001
                            and abs(100*float(row["pwin_exact"])-
                                    float(horse["win_probability_exact"]))<0.000001,
                            "Factor badge source uses a different TRI PWIN")
                    metrics=[]
                    for label,field in factors:
                        key=(race["race_number"],program,
                             horse["horse_name"].strip().casefold(),label)
                        require(key in rows,"Unmatched approved factor for TRI runner")
                        item=rows[key]
                        color=str(item.get("color","")).lower()
                        require(color in ("green","gray","red")
                                and row["states"].get(field)==color,
                                "Factor badge does not match approved evaluator audit")
                        metrics.append({"label":label,"value":color})
                        require(key not in used,"Badge audit reused for two entries")
                        used.add(key)
                        matched+=1
                    horse["metrics"]=metrics
                race["pace"]=pace.title()
            require(len(used)==len(ledger)==5*sum(len(r["entries"]) for r in card["races"]),
                    "Missing or extraneous badges in track audit")
            card["badge_source_sha256"]=digest(read_member(z,ledger_path))
            card["badge_evaluator_version"]=source["badge_evaluator_version"]
        require(matched==expected_runners*5,"Full-field certified factor count mismatch")
        return matched


def target_key(card):
    """Match the website's trackSlug key convention exactly."""
    normalized = unicodedata.normalize("NFD", card["track_name"])
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")[:80] or "track"
    return f"projections/dashboard/{card['race_date']}/{slug}.json"


def create_client(account_id, access_key_id, secret_access_key):
    import boto3
    require(bool(account_id and access_key_id and secret_access_key),
            "Cloudflare R2 credentials are not configured in the TRI scoring environment")
    require(re.fullmatch(r"[0-9a-fA-F]{32}", account_id) is not None,
            "Cloudflare account ID must be 32 hexadecimal characters")
    return boto3.session.Session().client(
        "s3", region_name="auto",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key_id, aws_secret_access_key=secret_access_key)


def is_not_found(error):
    response = getattr(error, "response", None)
    code = response.get("Error", {}).get("Code") if isinstance(response, dict) else None
    return code in ("NoSuchKey", "404", "NotFound")


def sync_cards(cards, source_hash, bucket=BUCKET_DEFAULT, dry_run=False, client=None):
    """Preflight all targets before writes; never downgrade a scratch-updated card."""
    if client is None:
        client = create_client(
            os.getenv("TRI_CLOUDFLARE_ACCOUNT_ID", "").strip(),
            os.getenv("TRI_R2_ACCESS_KEY_ID", "").strip(),
            os.getenv("TRI_R2_SECRET_ACCESS_KEY", "").strip())
    require(bucket == BUCKET_DEFAULT, "TRI cannot publish to an unexpected R2 bucket")
    actions = []
    seen = set()
    for card in cards:
        target = target_key(card)
        require(target not in seen, "Two TRI tracks would overwrite the same R2 key")
        seen.add(target)
        prior = None
        metadata = {}
        try:
            current = client.get_object(Bucket=bucket, Key=target)
            metadata = current.get("Metadata") or {}
            blob = current["Body"].read(MAX_IMPORT_SIZE + 1)
            require(len(blob) <= MAX_IMPORT_SIZE, "Existing R2 projection exceeds the 1 MB limit")
            prior = json.loads(blob)
        except Exception as exc:
            if not is_not_found(exc):
                raise
        if prior is not None:
            require(isinstance(prior, dict) and prior.get("projection_status") == "prescratch",
                    "Refusing to overwrite an existing scratch-updated/final card: " + target)
            if metadata.get("source_sha256") == source_hash and prior == card:
                actions.append((target, card, "same"))
                continue
        actions.append((target, card, "write"))
    pending = [(target, card) for target, card, action in actions if action == "write"]
    if dry_run:
        return len(pending), len(actions) - len(pending)
    for target, card in pending:
        client.put_object(Bucket=bucket, Key=target, Body=compact_json(card),
                          ContentType="application/json; charset=utf-8",
                          CacheControl="private, no-store",
                          Metadata={"source_sha256": source_hash, "stage": "prescratch",
                                    "badge_sha256": card.get("badge_source_sha256","")})
    return len(pending), len(actions) - len(pending)


def main():
    parser = argparse.ArgumentParser(
        description="Validate frozen TRI/F4 model evidence and optionally send it directly to private Cloudflare R2")
    parser.add_argument("--zip", "--verify-zip", dest="source_zip", required=True,
                        help="Final verified scorer ZIP from TRI production")
    parser.add_argument("--badge-source-zip", help="Approved current-root race-card QA ZIP with five-factor badge audit and locked renderer proof")
    parser.add_argument("--out", help="Optional local backup JSON (never pushed to public GitHub)")
    parser.add_argument("--publish", action="store_true",
                        help="Upload verified projection cards directly into private R2")
    parser.add_argument("--dry-run", action="store_true",
                        help="With --publish, test R2 access and overwrite safety without saving")
    args = parser.parse_args()
    try:
        require(not args.dry_run or args.publish, "--dry-run requires --publish")
        with open(args.source_zip, "rb") as infile:
            date, cards, payload, counts = build_cards(infile.read())
        if args.publish:
            require(args.badge_source_zip,
                    "Current official initial cards require --badge-source-zip with original certified factors")
        if args.badge_source_zip:
            with open(args.badge_source_zip,"rb") as badgefile:
                badge_count=attach_verified_badges(cards,badgefile.read())
            payload=compact_json({"cards":cards})
            require(len(payload)<=MAX_IMPORT_SIZE,
                    "Source-certified badge payload exceeds dashboard API limit")
            print(f"TRI_BADGES_CERTIFIED date={date} badge_count={badge_count}")
        if args.out:
            with open(args.out, "wb") as outfile:
                outfile.write(payload)
        print(f"TRI_VERIFIED date={date} tracks={counts['tracks']} "
              f"races={counts['races']} runners={counts['runners']} "
              f"payload_bytes={len(payload)} source_sha256={counts['sha256']}")
        if args.publish:
            updated, unchanged = sync_cards(cards, counts["sha256"], dry_run=args.dry_run)
            print(f"TRI_R2 date={date} written={updated} unchanged={unchanged} "
                  f"status={'DRY_RUN' if args.dry_run else 'PRIVATE_R2_PUBLISHED'}")
    except (Hold, ValueError, KeyError, TypeError, zipfile.BadZipFile, OSError) as exc:
        print("TRI_PUBLISH_HOLD: " + str(exc), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()

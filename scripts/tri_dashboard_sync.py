#!/usr/bin/env python3
"""Secure TRI V4.1/F4 V2 prescratch ZIP -> private Cloudflare R2 dashboard sync.

No runner scores or source files are stored in GitHub. The source ZIP is fetched
from a privately shared Google Drive folder using a read-only service account.
Requires google-auth, requests, boto3 only in --sync mode.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import os
import re
import sys
import zipfile
from zoneinfo import ZoneInfo

APPROVED_STATUSES = {"TRI_V4_F4_V2_MODEL_SOURCE_INPUT_ERRORS_RESOLVED_ALL_FIVE", "TRI_V4_F4_V2_PRESCRATCH_ALL_TRACKS_PASS"}
PWIN_PASS = "PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME"
ZIP_NAME_RE = re.compile(r"^RAIL_RYE_(?:\d{4}|\d{8})_(?:TRI_V4_F4_V2_ROLE_RATING_REPAIR_ALL_FIVE_PASS|TRI_DASHBOARD_VERIFIED_PRESCRATCH)\.zip$")
TRACK_FILE_RE = re.compile(r"^([A-Z0-9]{2,4})_(\d{4})_VERIFIED_TRI_F4_SOURCE\.json$")
F4 = ("exact_p1", "exact_p2", "exact_p3", "exact_p4", "exact_p5", "p6_plus", "top2", "top3", "top4")
MAX_ZIP_SIZE = 16 * 1024 * 1024
MAX_UNCOMPRESSED = 35 * 1024 * 1024
MAX_IMPORT_SIZE = 1024 * 1024
BUCKET_DEFAULT = "rail-and-rye-private-cards"
FOLDER_DEFAULT = "1yR79Mp8BndMd1KQfGEsbUOKvq-BJ2Vzd"


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
                     "track_name": source["track_name"], "projection_status": "prescratch",
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
        payload = compact_json({"cards": cards})
        require(len(payload) <= MAX_IMPORT_SIZE, "Dashboard payload exceeds API size limit")
        return date, cards, payload, {"tracks": len(cards), "races": race_total,
                                      "runners": runner_total, "sha256": digest(zip_bytes)}


def list_source_files(credentials, folder_id):
    import requests
    from google.auth.transport.requests import Request
    credentials.refresh(Request())
    headers = {"Authorization": "Bearer " + credentials.token}
    params = {
        "q": f"'{folder_id}' in parents and trashed = false and name contains 'TRI'",
        "fields": "nextPageToken,files(id,name,size,mimeType,modifiedTime,md5Checksum)",
        "pageSize": 100,
        "supportsAllDrives": "true", "includeItemsFromAllDrives": "true"
    }
    found = []
    for _ in range(5):
        res = requests.get("https://www.googleapis.com/drive/v3/files",
                           params=params, headers=headers, timeout=25)
        res.raise_for_status()
        result = res.json()
        found.extend(result.get("files", []))
        if not result.get("nextPageToken"):
            break
        params["pageToken"] = result["nextPageToken"]
    return found, headers


def get_source_zip(file_id, headers):
    import requests
    require(bool(re.fullmatch(r"[A-Za-z0-9_-]{10,128}", file_id)), "Invalid Drive source file ID")
    res = requests.get("https://www.googleapis.com/drive/v3/files/" + file_id,
                       params={"alt": "media", "supportsAllDrives": "true"},
                       headers=headers, timeout=70)
    res.raise_for_status()
    require(len(res.content) <= MAX_ZIP_SIZE, "Downloaded source exceeds ZIP limit")
    return res.content


def sync_cards(cards, source_hash, source_id, bucket, account_id, key_id, secret, preview=False):
    import boto3
    from botocore.exceptions import ClientError
    session = boto3.session.Session()
    r2 = session.client("s3", region_name="auto",
                        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
                        aws_access_key_id=key_id, aws_secret_access_key=secret)
    actions = []
    # Preflight every target before the first write. NEVER restore prescratch
    # over a scratch-updated or manually finalized dashboard.
    for card in cards:
        slug = re.sub(r"[^a-z0-9]+", "-", card["track_name"].lower()).strip("-")
        target = f"projections/dashboard/{card['race_date']}/{slug}.json"
        prior = None
        metadata = {}
        try:
            existing = r2.get_object(Bucket=bucket, Key=target)
            metadata = existing.get("Metadata", {})
            if metadata.get("source_sha256") == source_hash:
                actions.append((target, card, "same"))
                continue
            prior = json.loads(existing["Body"].read(MAX_IMPORT_SIZE + 1))
        except ClientError as exc:
            if exc.response["Error"].get("Code") not in ("NoSuchKey", "404", "NotFound"):
                raise
        require(prior is None or prior.get("projection_status") == "prescratch",
                "Refusing to replace existing scratch-updated/final dashboard: " + target)
        actions.append((target, card, "write"))
    needed = [row for row in actions if row[2] == "write"]
    if preview:
        return len(needed), len(actions) - len(needed)
    for target, card, action in needed:
        r2.put_object(Bucket=bucket, Key=target, Body=compact_json(card),
                      ContentType="application/json; charset=utf-8",
                      CacheControl="private, no-store",
                      Metadata={"source_sha256": source_hash,
                                "source_file_id": source_id, "stage": "prescratch"})
    return len(needed), len(actions) - len(needed)


def run_sync(source_file_id=None, dry_run=False):
    from google.oauth2 import service_account
    sa = os.getenv("TRI_GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    account = os.getenv("TRI_CLOUDFLARE_ACCOUNT_ID", "").strip()
    key = os.getenv("TRI_R2_ACCESS_KEY_ID", "").strip()
    secret = os.getenv("TRI_R2_SECRET_ACCESS_KEY", "").strip()
    folder = os.getenv("TRI_DRIVE_FOLDER_ID", FOLDER_DEFAULT).strip()
    require(sa and account and key and secret, "One-time Google Drive and R2 credentials are not configured")
    require(re.fullmatch(r"[A-Za-z0-9_-]{10,128}", folder) is not None, "Invalid configured Drive folder")
    credentials = service_account.Credentials.from_service_account_info(
        json.loads(sa), scopes=["https://www.googleapis.com/auth/drive.readonly"])
    available, headers = list_source_files(credentials, folder)
    today = dt.datetime.now(ZoneInfo("America/New_York")).date()
    files = []
    for item in available:
        match = ZIP_NAME_RE.fullmatch(str(item.get("name", "")))
        if not match:
            continue
        if item.get("mimeType") != "application/zip" and item.get("mimeType") != "application/x-zip-compressed":
            continue
        if int(item.get("size", "0")) > MAX_ZIP_SIZE:
            continue
        files.append(item)
    if source_file_id:
        files = [item for item in files if item["id"] == source_file_id]
        require(files, "Specified source ZIP is not in the approved production folder")
    else:
        # Filename uses MMDD only; exact year comes from the signed receipt.
        files.sort(key=lambda item: item.get("modifiedTime", ""), reverse=True)
    if not files:
        print("NO_APPROVED_SOURCE_PACKAGES")
        return
    completed = 0
    processed_dates = set()
    for item in files[:10]:
        raw = get_source_zip(item["id"], headers)
        date, cards, _, counts = build_cards(raw)
        race_day = dt.date.fromisoformat(date)
        if not source_file_id and race_day not in (today, today + dt.timedelta(days=1)):
            continue
        if date in processed_dates:
            continue
        processed_dates.add(date)
        wrote, same = sync_cards(cards, counts["sha256"], item["id"], BUCKET_DEFAULT,
                                 account, key, secret, preview=dry_run)
        completed += 1
        print(f"TRI_SYNC date={date} tracks={counts['tracks']} races={counts['races']} "
              f"runners={counts['runners']} written={wrote} unchanged={same} "
              f"mode={'DRY_RUN' if dry_run else 'PRIVATE_R2'}")
    if not completed:
        print("NO_CURRENT_PRESCRATCH_PACKAGE")


def main():
    parser = argparse.ArgumentParser(description="Sync verified TRI prescratch package to private R2")
    parser.add_argument("--verify-zip", help="Offline audit, no credentials/no network")
    parser.add_argument("--out", help="Optional offline secure dashboard JSON output path")
    parser.add_argument("--source-file-id", default="", help="Manual run: exact already-approved Drive ZIP ID")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        if args.verify_zip:
            with open(args.verify_zip, "rb") as file:
                date, cards, payload, counts = build_cards(file.read())
            if args.out:
                with open(args.out, "wb") as file:
                    file.write(payload)
            print(f"TRI_VERIFIED date={date} tracks={counts['tracks']} "
                  f"races={counts['races']} runners={counts['runners']} "
                  f"payload_bytes={len(payload)}")
        else:
            run_sync(args.source_file_id or None, args.dry_run)
    except (Hold, ValueError, KeyError, TypeError, zipfile.BadZipFile) as exc:
        print("TRI_SYNC_HOLD: " + str(exc), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()

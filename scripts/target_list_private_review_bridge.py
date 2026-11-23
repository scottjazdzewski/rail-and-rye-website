#!/usr/bin/env python3
"""One-way private Target List review transfer through GitHub Actions.
Only a sealed ciphertext is posted to GitHub; plaintext goes directly to R2.
The R2 access secret never enters GitHub comments/artifacts and remains a secret.
This lane never certifies scores and never publishes customer results.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sys
from pathlib import Path

from nacl.public import PrivateKey, PublicKey, SealedBox
from nacl.encoding import Base64Encoder

PREFIX = "RR_TARGET_REVIEW_ENCRYPTED_V1"
R2_PREFIX = "racing-intelligence/target-list-review/"
CONTEXT = b"RAIL-RYE-R2-TARGET-EDITORIAL-REVIEW-ECIES-v1\0"
MAX_PAYLOAD = 512 * 1024


def private_key():
    secret = os.environ.get("TRI_R2_SECRET_ACCESS_KEY", "")
    if len(secret) < 20:
        raise RuntimeError("Missing private R2 key secret in GitHub Actions.")
    return PrivateKey(hashlib.sha256(CONTEXT + secret.encode("utf-8")).digest())


def public_key_output(path):
    key = private_key().public_key.encode(encoder=Base64Encoder).decode("ascii")
    Path(path).write_text(key + "\n", encoding="utf-8")
    print("Private review public encryption key created; no private key exported.")


def seal_file(source_path, public_path, output_path):
    raw = Path(source_path).read_bytes()
    if not raw or len(raw) > MAX_PAYLOAD:
        raise ValueError("Review JSON is missing or too large.")
    validate_review(json.loads(raw))
    pub = PublicKey(Path(public_path).read_text(encoding="utf-8").strip(), encoder=Base64Encoder)
    cipher = SealedBox(pub).encrypt(raw)
    Path(output_path).write_text(PREFIX + "\n" + base64.b64encode(cipher).decode("ascii") + "\n", encoding="utf-8")
    print("Private review sealed for GitHub handoff; plaintext not posted.")


def require_string(value, label):
    if not isinstance(value, str) or not value.strip() or len(value) > 5000:
        raise ValueError(f"Required Target List source field: {label}")
    return value


def validate_review(raw):
    if not isinstance(raw, dict):
        raise ValueError("Review must be a structured JSON object.")
    if raw.get("schema_version") != 1 or raw.get("product_type") != "target_list":
        raise ValueError("Wrong review schema.")
    if raw.get("review_only") is not True or raw.get("customer_publish_approved") is not False or raw.get("production_receipt_verified") is not False:
        raise ValueError("Review must be explicitly blocked from customer publication.")
    date = raw.get("race_date")
    if not isinstance(date, str) or not re.fullmatch(r"20\d{2}-\d{2}-\d{2}", date):
        raise ValueError("Invalid race date.")
    from datetime import date as realdate
    try:
        if realdate.fromisoformat(date).isoformat() != date:
            raise ValueError("Invalid ISO date.")
    except Exception as e:
        raise ValueError("Invalid ISO date.") from e
    revision = raw.get("revision")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1 or revision > 9999:
        raise ValueError("Invalid edition revision.")
    if (revision == 1 and raw.get("status") != "initial") or (revision > 1 and raw.get("status") != "scratch_update"):
        raise ValueError("Private review revision/state mismatch.")
    src = raw.get("source")
    if not isinstance(src, dict):
        raise ValueError("Missing original source provenance.")
    for name in ["editorial_sha256", "timeforms_zip_sha256"]:
        if not re.fullmatch("[a-f0-9]{64}", str(src.get(name, ""))):
            raise ValueError("Missing original PDF/Timeform ZIP SHA-256.")
    if src.get("tri_full_field_receipt_id") is not None or src.get("tri_unrounded_scoring_receipt_sha256") is not None:
        raise ValueError("Only explicitly noncertified editorial reviews belong in this lane.")
    targets = raw.get("targets")
    if not isinstance(targets, list) or len(targets) > 100:
        raise ValueError("Invalid daily target array.")
    seen = set()
    for item in targets:
        if not isinstance(item, dict):
            raise ValueError("Invalid target race.")
        if not isinstance(item.get("rank"), int) or item["rank"] < 1:
            raise ValueError("Missing source editorial rank.")
        track = require_string(item.get("track"), "track")
        race = item.get("race_number")
        if not isinstance(race, int) or isinstance(race, bool) or race < 1 or race > 99:
            raise ValueError("Invalid race number.")
        race_id = (track.casefold(), race)
        if race_id in seen:
            raise ValueError("Duplicate target race.")
        seen.add(race_id)
        require_string(item.get("analysis"), "source-supported analysis")
        for role in ["favorite", "attack"]:
            horse = item.get(role)
            if not isinstance(horse, dict):
                raise ValueError("Missing source horse role.")
            for name in ["program_number", "horse_name", "morning_line", "fair_odds"]:
                require_string(horse.get(name), role + "." + name)
            chance = horse.get("win_probability")
            if not isinstance(chance, (int, float)) or isinstance(chance, bool) or not 0 <= chance <= 100:
                raise ValueError("Invalid published percent.")
            if horse.get("unrounded_verified_pwin") is not None:
                raise ValueError("Unrounded certified values may not be invented in review data.")
        if item["attack"]["win_probability"] <= item["favorite"]["win_probability"]:
            raise ValueError("Review ATTACK must exceed displayed favorite win%.")
    return raw


def publish_from_issue():
    import boto3
    from botocore.exceptions import ClientError
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    comment = event.get("comment") or {}
    issue = event.get("issue") or {}
    repo = event.get("repository") or {}
    if repo.get("full_name") != "scottjazdzewski/rail-and-rye-website" or issue.get("number") != 149 or comment.get("user", {}).get("login") != "scottjazdzewski":
        raise RuntimeError("Unauthorized Target List review transfer.")
    body = comment.get("body", "")
    if not body.startswith(PREFIX + "\n"):
        raise ValueError("Not a Target List encrypted review transfer.")
    encoded = body[len(PREFIX) + 1:].strip()
    if not re.fullmatch(r"[A-Za-z0-9+/=]+", encoded) or len(encoded) > MAX_PAYLOAD * 2:
        raise ValueError("Invalid private review ciphertext.")
    ciphertext = base64.b64decode(encoded, validate=True)
    plain = SealedBox(private_key()).decrypt(ciphertext)
    if not plain or len(plain) > MAX_PAYLOAD:
        raise ValueError("Decrypted review exceeds source limit.")
    data = validate_review(json.loads(plain))
    checksum = hashlib.sha256(plain).hexdigest()
    key = f"{R2_PREFIX}{data['race_date']}/revision-{data['revision']:04}.json"
    account = os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()
    access = os.environ["TRI_R2_ACCESS_KEY_ID"].strip()
    secret = os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip()
    if not re.fullmatch(r"[a-f0-9]{32}", account) or not access or not secret:
        raise RuntimeError("Missing Cloudflare R2 credentials.")
    s3 = boto3.client("s3", endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                      region_name="auto", aws_access_key_id=access, aws_secret_access_key=secret)
    bucket = "rail-and-rye-private-cards"
    try:
        current = s3.get_object(Bucket=bucket, Key=key)
        prior = current["Body"].read()
        if prior != plain:
            raise RuntimeError("An existing private review revision cannot be silently replaced.")
        print(f"Private review {data['race_date']} revision {data['revision']} already matches, verified.")
        return
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") not in ("NoSuchKey", "404", "NotFound"):
            raise
    s3.put_object(Bucket=bucket, Key=key, Body=plain,
                  ContentType="application/json; charset=utf-8", CacheControl="private, no-store",
                  Metadata={"sha256":checksum,"uploaded_at":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
                            "editorial_sha256":data["source"]["editorial_sha256"],"review_only":"true"})
    confirm = s3.get_object(Bucket=bucket,Key=key)
    if hashlib.sha256(confirm["Body"].read()).hexdigest() != checksum:
        raise RuntimeError("Private R2 readback checksum mismatch.")
    print(f"Private R2 editorial review uploaded and read back: {data['race_date']}, revision {data['revision']}, {len(data['targets'])} source selections, SHA256 {checksum}. Not customer-certified.")


if __name__ == "__main__":
    p=argparse.ArgumentParser()
    p.add_argument("mode",choices=["public-key","seal","ingest"])
    p.add_argument("--public-key")
    p.add_argument("--source")
    p.add_argument("--output")
    a=p.parse_args()
    try:
        if a.mode=="public-key":public_key_output(a.output or "target-list-review-public-key.txt")
        elif a.mode=="seal":seal_file(a.source,a.public_key,a.output)
        else:publish_from_issue()
    except Exception as e:
        # Do not print plaintext or private credentials in a CI log.
        print("PRIVATE_REVIEW_TRANSFER_HOLD:",type(e).__name__,str(e)[:160],file=sys.stderr)
        sys.exit(1)

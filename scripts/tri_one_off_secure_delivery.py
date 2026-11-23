#!/usr/bin/env python3
"""One-time secure transfer of verified 2026-11-23 TRI prescratch cards to R2.

A GitHub Actions runner creates an ephemeral RSA key, stores ONLY the private
key inside private R2, and prints the PUBLIC key. The ChatGPT production
environment seals the previously verified JSON with AES-256-GCM and RSA-OAEP.
Only ciphertext is placed in the public repository for one trigger commit.
The runner then decrypts and validates the exact SHA-256 of the certified
source JSON, imports the 5 private R2 dashboard objects and deletes the key.

Never print decrypted projections, unwrapped keys or private-key bytes.
"""
import argparse
import base64
import brotli
import hashlib
import json
import os
import re
import sys
import unicodedata

DATE = "2026-11-23"
KEY_OBJECT = "projections/intake-keys/tri-20261123-rsa.pem"
BUCKET = "rail-and-rye-private-cards"
SOURCE_JSON_SHA256 = "14a6cff824fd69626010b4fff969d67812cc9d5b7269642705cb52ac6ab80307"
AAD = b"RAIL-RYE-TRI-PRESCRATCH-2026-11-23"
COUNTS = {"Finger Lakes": (8, 60), "Mountaineer": (8, 77),
          "Mahoning Valley": (10, 92), "Parx Racing": (9, 65),
          "Zia Park": (10, 73)}


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def r2_client():
    import boto3
    account = os.environ.get("TRI_CLOUDFLARE_ACCOUNT_ID", "").strip()
    key = os.environ.get("TRI_R2_ACCESS_KEY_ID", "").strip()
    secret = os.environ.get("TRI_R2_SECRET_ACCESS_KEY", "").strip()
    require(bool(re.fullmatch(r"[a-fA-F0-9]{32}", account) and key and secret),
            "R2 credentials unavailable or account ID invalid")
    return boto3.client("s3", region_name="auto",
                        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                        aws_access_key_id=key, aws_secret_access_key=secret)


def get_optional(client, path):
    from botocore.exceptions import ClientError
    try:
        return client.get_object(Bucket=BUCKET, Key=path)
    except ClientError as err:
        if err.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "NotFound"):
            return None
        raise


def boot(client):
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    stored = get_optional(client, KEY_OBJECT)
    if stored is None:
        private = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        private_pem = private.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption())
        client.put_object(Bucket=BUCKET, Key=KEY_OBJECT, Body=private_pem,
                          ContentType="application/x-pem-file", CacheControl="private, no-store")
    else:
        private = serialization.load_pem_private_key(stored["Body"].read(), password=None)
    public_pem = private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    print("TRI_ONE_TIME_PUBLIC_KEY_B64=" + base64.b64encode(public_pem).decode("ascii"))
    print("R2_EPHEMERAL_KEY_READY: public key above is safe to share; private key is in private R2 only")


def track_key(name):
    folded = unicodedata.normalize("NFD", name)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    slug = re.sub(r"[^a-z0-9]+", "-", folded.lower()).strip("-")[:80] or "track"
    return f"projections/dashboard/{DATE}/{slug}.json"


def validate(json_bytes):
    require(hashlib.sha256(json_bytes).hexdigest() == SOURCE_JSON_SHA256,
            "Source model JSON SHA-256 differs from previously verified 367-runner export")
    body = json.loads(json_bytes)
    require(isinstance(body, dict) and set(body) == {"cards"}, "Invalid batch object")
    cards = body["cards"]
    require(isinstance(cards, list) and len(cards) == len(COUNTS), "Expected five complete tracks")
    by_track = {c["track_name"]: c for c in cards}
    require(set(by_track) == set(COUNTS), "Incorrect or duplicated track names")
    races_seen = runners_seen = 0
    for name, card in by_track.items():
        nraces, nrunners = COUNTS[name]
        require(card["schema_version"] == 1 and card["race_date"] == DATE
                and card["projection_status"] == "prescratch"
                and card["fair_odds_basis"] == "net_to_1_review",
                "A race card is not the certified prescratch model export")
        races = card["races"]
        require(len(races) == nraces
                and len({r["race_number"] for r in races}) == nraces,
                "Race count or number mismatch")
        n = 0
        for race in races:
            require(race.get("scratch_count") is None and race.get("scratches") == [],
                    "Scratch status cannot be asserted for these prescratch projections")
            require(bool(race.get("purse")), "Certified race purse missing")
            entries = race["entries"]
            require(entries and len({e["program_number"] for e in entries}) == len(entries),
                    "Runner count or saddlecloth ID conflict")
            mass = 0.0
            for e in entries:
                exact = float(e["win_probability_exact"])
                f4 = e["f4_probabilities"]
                require(bool(e.get("horse_name") and e.get("trainer") and e.get("jockey"))
                        and e.get("metrics") == [],
                        "Runner lacks verified connections or has uncertified factor badges")
                require(0 < exact <= 100 and abs(exact - float(e["win_probability"])) <= 0.051,
                        "Exact TRI PWIN conflicts with display value")
                require(abs(float(f4["exact_p1"]) * 100 - exact) < 1e-6,
                        "F4 winner conflicts with exact TRI PWIN")
                placement = [float(f4[p]) for p in
                             ("exact_p1", "exact_p2", "exact_p3", "exact_p4", "exact_p5", "p6_plus")]
                require(all(0 <= p <= 1 for p in placement)
                        and abs(sum(placement) - 1) < 1e-7,
                        "F4 finish-position probabilities do not normalize to one")
                require(abs(float(f4["top2"]) - sum(placement[:2])) < 1e-7
                        and abs(float(f4["top3"]) - sum(placement[:3])) < 1e-7
                        and abs(float(f4["top4"]) - sum(placement[:4])) < 1e-7,
                        "F4 cumulative probabilities do not match exact positions")
                mass += exact
            require(abs(mass - 100) < 1e-6, "TRI probabilities do not sum to 100%")
            n += len(entries)
        require(n == nrunners, "Incorrect full-field runner count")
        races_seen += len(races)
        runners_seen += n
    require(races_seen == 45 and runners_seen == 367, "Incorrect batch totals")
    return cards


def publish(client, sealed_file):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes, serialization

    with open(sealed_file, "r", encoding="utf-8") as source:
        sealed = json.load(source)
    require(sealed.get("version") == 1 and sealed.get("date") == DATE,
            "Staged encrypted payload has invalid identity")
    private_object = get_optional(client, KEY_OBJECT)
    require(private_object is not None, "Missing ephemeral decryption key")
    private = serialization.load_pem_private_key(private_object["Body"].read(), password=None)
    wrapped = base64.b64decode(sealed["wrapped_key_b64"], validate=True)
    nonce = base64.b64decode(sealed["nonce_b64"], validate=True)
    ciphertext = base64.b64decode(sealed["ciphertext_b64"], validate=True)
    require(len(nonce) == 12 and len(ciphertext) < 1_000_000, "Invalid sealed payload size")
    aes_key = private.decrypt(wrapped, padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(), label=None))
    require(len(aes_key) == 32, "Invalid unwrapped AES key")
    compressed = AESGCM(aes_key).decrypt(nonce, ciphertext, AAD)
    require(sealed.get("compression") == "brotli", "Expected Brotli compressed encrypted transfer")
    plaintext = brotli.decompress(compressed)
    require(len(plaintext) <= 1024*1024, "Decompressed transfer unexpectedly exceeds 1 MB")
    cards = validate(plaintext)

    # Check every object *before* the first write. Never roll over a scratch-
    # updated result with yesterday's verified prescratch source.
    actions = []
    for card in cards:
        key = track_key(card["track_name"])
        obj = get_optional(client, key)
        if obj is not None:
            current = json.loads(obj["Body"].read())
            require(current.get("projection_status") == "prescratch",
                    "Existing final or scratch-updated card blocks upload")
            if obj.get("Metadata", {}).get("source_sha256") == SOURCE_JSON_SHA256:
                actions.append((key, card, False))
                continue
        actions.append((key, card, True))

    for key, card, needs_write in actions:
        if needs_write:
            content = json.dumps(card, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            client.put_object(Bucket=BUCKET, Key=key, Body=content,
                              ContentType="application/json; charset=utf-8",
                              CacheControl="private, no-store",
                              Metadata={"source_sha256": SOURCE_JSON_SHA256,
                                        "stage": "prescratch"})
        check = get_optional(client, key)
        require(check is not None, "R2 write did not persist")
        persisted = json.loads(check["Body"].read())
        require(persisted == card, "R2 object validation mismatch after write")
    client.delete_object(Bucket=BUCKET, Key=KEY_OBJECT)
    print("TRI_PRIVATE_R2_IMPORT_SUCCESS date=2026-11-23 tracks=5 races=45 runners=367 "
          f"written={sum(1 for _, _, write in actions if write)} "
          "prescratch=true; encryption key erased")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("bootstrap", "publish"))
    parser.add_argument("--sealed-file", default="")
    args = parser.parse_args()
    try:
        client = r2_client()
        if args.action == "bootstrap":
            boot(client)
        else:
            require(args.sealed_file, "--sealed-file is mandatory")
            publish(client, args.sealed_file)
    except Exception as exc:
        # Do not include returned key material or serialized source in errors.
        print("TRI_R2_ONE_OFF_HOLD: " + type(exc).__name__ + ": " + str(exc)[:180],
              file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()

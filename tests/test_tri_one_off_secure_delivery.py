import base64
import brotli
import contextlib
import hashlib
import io
import json
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import padding
from botocore.exceptions import ClientError

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
import tri_one_off_secure_delivery as tri


class FakeR2:
    def __init__(self):
        self.stored = {}
    def get_object(self, Bucket, Key):
        if Key not in self.stored:
            raise ClientError({"Error": {"Code": "NoSuchKey", "Message": "Missing"}}, "GetObject")
        obj = self.stored[Key]
        return {"Body": io.BytesIO(obj["Body"]), "Metadata": obj["Metadata"]}
    def put_object(self, Bucket, Key, Body, Metadata=None, **kwargs):
        self.stored[Key] = {"Body": Body, "Metadata": Metadata or {}}
    def delete_object(self, Bucket, Key):
        del self.stored[Key]


def fake_payload():
    cards = []
    for track, (nraces, nrunners) in tri.COUNTS.items():
        base, extra = divmod(nrunners, nraces)
        races = []
        for ri in range(nraces):
            n = base + (ri < extra)
            p = 100 / n
            entries = []
            for k in range(n):
                f = 1 / n
                f4 = dict(exact_p1=f, exact_p2=0, exact_p3=0, exact_p4=0,
                          exact_p5=0, p6_plus=1-f, top2=f, top3=f, top4=f)
                entries.append(dict(program_number=str(k+1), horse_name=f"Runner {k+1}",
                    trainer="Verified Trainer", jockey="Verified Jockey", metrics=[],
                    win_probability=round(p,1), win_probability_exact=p,
                    f4_probabilities=f4))
            races.append(dict(race_number=ri+1,purse="$10,000",
                scratch_count=None,scratches=[],entries=entries))
        cards.append(dict(track_name=track,schema_version=1,race_date=tri.DATE,
            projection_status="prescratch",fair_odds_basis="net_to_1_review",races=races))
    return json.dumps({"cards": cards}, separators=(",", ":")).encode()


class OneTimeDeliveryTests(unittest.TestCase):
    def test_secure_envelope_delivers_verified_data_and_erases_key(self):
        r2 = FakeR2()
        original = fake_payload()
        with mock.patch.object(tri, "SOURCE_JSON_SHA256", hashlib.sha256(original).hexdigest()):
            printed = io.StringIO()
            with contextlib.redirect_stdout(printed):
                tri.boot(r2)
            key_b64 = printed.getvalue().split("TRI_ONE_TIME_PUBLIC_KEY_B64=",1)[1].splitlines()[0]
            public = serialization.load_pem_public_key(base64.b64decode(key_b64))
            aes_key = os.urandom(32)
            nonce = os.urandom(12)
            wrapped = public.encrypt(aes_key, padding.OAEP(
                mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
            sealed = {
                "version": 1, "date": tri.DATE, "compression": "brotli",
                "wrapped_key_b64": base64.b64encode(wrapped).decode(),
                "nonce_b64": base64.b64encode(nonce).decode(),
                "ciphertext_b64_chunks": [base64.b64encode(
                    AESGCM(aes_key).encrypt(nonce, brotli.compress(original, quality=11), tri.AAD)).decode()]
            }
            with tempfile.NamedTemporaryFile(mode="w+", encoding="utf-8") as file:
                json.dump(sealed, file)
                file.flush()
                with contextlib.redirect_stdout(io.StringIO()):
                    tri.publish(r2, file.name)
            self.assertNotIn(tri.KEY_OBJECT, r2.stored)
            data_keys = [key for key in r2.stored if key.startswith("projections/dashboard/")]
            self.assertEqual(len(data_keys), 5)
            self.assertEqual(sum(len(r["entries"]) for key in data_keys
                for r in json.loads(r2.stored[key]["Body"])["races"]), 367)

    def test_bad_digest_blocks_import(self):
        with self.assertRaisesRegex(RuntimeError, "SHA-256"):
            tri.validate(fake_payload())

    def test_r2_keys_match_app(self):
        self.assertEqual(tri.track_key("Parx Racing"),
            "projections/dashboard/2026-11-23/parx-racing.json")


if __name__ == "__main__":
    unittest.main()

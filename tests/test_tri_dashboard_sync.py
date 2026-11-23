import copy
import hashlib
import io
import json
import os
import sys
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from tri_dashboard_sync import build_cards, Hold, ZIP_NAME_RE


def dump(value):
    return json.dumps(value, separators=(",", ":"), allow_nan=False).encode()


def make_zip(*, wrong_hash=False, wrong_mass=False, unresolved=False):
    date = "2026-11-23"
    statuses = {
        "tri_receipt_sha256": "internal_receipts/PRX/tri_receipt.json",
        "f4_receipt_sha256": "internal_receipts/PRX/TRI_F4_V2_20261123_PRESCRATCH_SCORING_RECEIPT.json",
        "role_audit_sha256": "internal_receipts/PRX/source_roles_audit.json",
    }
    filemap = {
        statuses["tri_receipt_sha256"]: dump({"status": "PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME", "races": 1, "starters": 2}),
        statuses["f4_receipt_sha256"]: dump({"status": "PASS", "official_scratches_verified": False}),
        statuses["role_audit_sha256"]: dump({"date": date, "track": "PRX", "runner_count": 2,
                                                "unresolved": ["trainer"] if unresolved else []}),
        "internal_receipts/PRX/sidecar.json": dump({"asof": date, "rows": [
            {"date": date, "race": 1, "program": "1", "horse": "Runner One",
             "trainer_person": "Verified Trainer 1", "jockey_person": "Verified Jockey 1"},
            {"date": date, "race": 1, "program": "2", "horse": "Runner Two",
             "trainer_person": "Verified Trainer 2", "jockey_person": "Verified Jockey 2"}
        ]}),
    }
    f4a = {"exact_p1": .6, "exact_p2": .2, "exact_p3": .1, "exact_p4": .05, "exact_p5": .03, "p6_plus": .02,
           "top2": .8, "top3": .9, "top4": .95}
    f4b = {"exact_p1": .4, "exact_p2": .25, "exact_p3": .15, "exact_p4": .1, "exact_p5": .05, "p6_plus": .05,
           "top2": .65, "top3": .8, "top4": .9}
    scores = {
        "schema_version": 1, "output_kind": "INTERNAL_VERIFIED_MODEL_SCORE_HANDOFF_NOT_CUSTOMER_CARD",
        "race_date": date, "track_code": "PRX", "track_name": "Parx Racing",
        "release_state": "SCORES_PASS_AND_F4_PASS__CUSTOMER_RENDER_AND_VISUAL_QA_NOT_DONE",
        "pick_tickets": None,
        "scorer_receipts": {key: hashlib.sha256(filemap[name]).hexdigest() for key, name in statuses.items()},
        "races": [{
            "race_number": 1, "race_class_or_name": "Allowance", "official_purse_usd": 20000,
            "post_time_et": "1:00 PM ET", "surface": "Dirt", "distance": "6 F",
            "state": "PRESCRATCH_TRI_F4_RECEIPTS_PASS",
            "entries": [{
                "program_number": "1", "horse_name": "Runner One",
                "win_probability_exact": 60, "win_probability_display_1dp": 60,
                "fair_odds_to_1_exact": 2/3, "morning_line": "2-1",
                "f4_probabilities": f4a
            }, {
                "program_number": "2", "horse_name": "Runner Two",
                "win_probability_exact": 39 if wrong_mass else 40,
                "win_probability_display_1dp": 39 if wrong_mass else 40,
                "fair_odds_to_1_exact": 100/39-1 if wrong_mass else 1.5,
                "morning_line": "3-1", "f4_probabilities": f4b
            }]
        }]
    }
    if wrong_hash:
        scores["scorer_receipts"]["tri_receipt_sha256"] = "0"*64
    filemap["PRX_1123_VERIFIED_TRI_F4_SOURCE.json"] = dump(scores)
    filemap["RESOLUTION_RECEIPT.json"] = dump({
        "date": date, "status": "TRI_V4_F4_V2_MODEL_SOURCE_INPUT_ERRORS_RESOLVED_ALL_FIVE",
        "prescratch_not_final": True, "tracks": [{"track": "PRX", "races": 1, "runners": 2}],
        "race_total": 1, "runner_total": 2, "role_cells_verified": 4
    })
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as zipfile_out:
        for name, content in filemap.items():
            zipfile_out.writestr(name, content)
    return stream.getvalue()


class TestPrescratchSync(unittest.TestCase):
    def test_verification_accepts_existing_and_future_daily_package_names(self):
        self.assertIsNotNone(ZIP_NAME_RE.fullmatch(
            "RAIL_RYE_1123_TRI_V4_F4_V2_ROLE_RATING_REPAIR_ALL_FIVE_PASS.zip"))
        self.assertIsNotNone(ZIP_NAME_RE.fullmatch(
            "RAIL_RYE_20261124_TRI_DASHBOARD_VERIFIED_PRESCRATCH.zip"))
        self.assertIsNone(ZIP_NAME_RE.fullmatch(
            "UNVERIFIED_MODEL_EXPORT.zip"))

    def test_verified_source_becomes_only_prescratch_private_import(self):
        date, cards, payload, totals = build_cards(make_zip())
        self.assertEqual(date, "2026-11-23")
        self.assertEqual((totals["tracks"], totals["races"], totals["runners"]), (1, 1, 2))
        saved = json.loads(payload)["cards"][0]
        self.assertEqual(saved["projection_status"], "prescratch")
        self.assertIsNone(saved["races"][0]["scratch_count"])
        self.assertEqual(saved["races"][0]["scratches"], [])
        self.assertEqual(saved["races"][0]["entries"][0]["trainer"], "Verified Trainer 1")
        self.assertEqual(saved["races"][0]["entries"][0]["fair_odds"], "0.67/1")
        self.assertEqual(saved["races"][0]["entries"][1]["f4_probabilities"]["exact_p2"], .25)
        self.assertEqual(saved["races"][0]["entries"][0]["metrics"], [])
        self.assertIsNone(saved["races"][0]["entries"][0]["rank"])

    def test_modified_receipt_is_blocked(self):
        with self.assertRaisesRegex(Hold, "checksum mismatch"):
            build_cards(make_zip(wrong_hash=True))

    def test_f4_and_pwin_mass_mismatch_is_blocked(self):
        with self.assertRaisesRegex(Hold, "F4 winner not TRI winner"):
            build_cards(make_zip(wrong_mass=True))

    def test_unresolved_connections_block_all_uploads(self):
        with self.assertRaisesRegex(Hold, "Unresolved trainer/jockey"):
            build_cards(make_zip(unresolved=True))


if __name__ == "__main__":
    unittest.main()

import copy
import hashlib
import io
import json
import os
import sys
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from tri_dashboard_sync import build_cards, attach_verified_badges, Hold, sync_cards, target_key


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
        statuses["f4_receipt_sha256"]: b"",
        statuses["role_audit_sha256"]: dump({"date": date, "track": "PRX", "runner_count": 2,
                                                "unresolved": ["trainer"] if unresolved else []}),
        "internal_receipts/PRX/sidecar.json": dump({"asof": date, "rows": [
            {"date": date, "race": 1, "program": "1", "horse": "Runner One",
             "trainer_person": "Verified Trainer 1", "jockey_person": "Verified Jockey 1"},
            {"date": date, "race": 1, "program": "2", "horse": "Runner Two",
             "trainer_person": "Verified Trainer 2", "jockey_person": "Verified Jockey 2"}
        ]}),
    }
    prefix_name="TRI_F4_V2_20261123_PRESCRATCH_ORDERED_PREFIXES.csv"
    prefix_path="internal_receipts/PRX/"+prefix_name
    filemap[prefix_path]=(
        "race_key,position_prefix,programs,probability,wager_prefix\\n"
        "20261123|PRX|1,2,1-2,0.6,EXACTA\\n"
        "20261123|PRX|1,2,2-1,0.4,EXACTA\\n"
    ).encode()
    filemap[statuses["f4_receipt_sha256"]]=dump({
        "status":"PASS","model_id":"TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET",
        "expected_date":date,"scratch_state":"PRESCRATCH",
        "race_count":1,"official_scratches_verified":False,
        "output_hashes":{prefix_name:hashlib.sha256(filemap[prefix_path]).hexdigest()}
    })
    f4a = {"exact_p1": .6, "exact_p2": .4, "exact_p3": 0., "exact_p4": 0., "exact_p5": 0., "p6_plus": 0.,
           "top2": 1., "top3": 1., "top4": 1.}
    f4b = {"exact_p1": .4, "exact_p2": .6, "exact_p3": 0., "exact_p4": 0., "exact_p5": 0., "p6_plus": 0.,
           "top2": 1., "top3": 1., "top4": 1.}
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


def make_badge_source_zip(*, bad_color=False, wrong_pwin=False):
    date="2026-11-23"
    factors=[("Speed","speed"),("Form","form"),("Class","class"),
             ("Pace Fit","pace"),("Surface / Distance","surface")]
    entries=[]
    ledger=[]
    for program, horse, pwin in [(1,"Runner One",60),(2,"Runner Two",40)]:
        states={"speed":"green","form":"gray","class":"red","pace":"green","surface":"gray"}
        if bad_color and program==1:
            states["speed"]="red"
        entries.append({"program":program,"horse":horse,"pwin":pwin,
                        "pwin_exact":pwin/100,"states":states})
        for label, field in factors:
            color="green" if field in ("speed","pace") else "red" if field=="class" else "gray"
            ledger.append({"Race":1,"Program":str(program),"Horse":horse,
                           "Factor":label,"color":color})
    if wrong_pwin:
        entries[0]["pwin_exact"]=.5
    path1="data/PRX/badge_audit_ledger.json"
    path2="data/PRX/PRX_RACE_ONLY_INPUT.json"
    receipt_path="output/FINAL_QA_RECEIPT.json"
    files={
        path1: dump(ledger),
        path2: dump({"track_code":"PRX","track_name":"Parx Racing",
                     "badge_evaluator_version":"TBS_FACTOR_BADGE_EVALUATOR_V1_2_6_FIT_CLASS_FORM_GUARDS",
                     "no_pick_tickets":True,"races":[{"race_no":1,"pace":"moderate",
                      "official_purse_usd":20000,"scratches":[],"rows":entries}]}),
        receipt_path: dump({"date":date,"production":"PRESCRATCH_RACECARDS_ONLY",
            "source_races":1,"source_runners":2,
            "root_self_test":"PASS_CANONICAL_PRODUCTION_SEAL_AND_ALL_STATIC_SADDLE_CHIPS"})
    }
    files["SHA256_MANIFEST.json"]=dump({
        name:hashlib.sha256(value).hexdigest() for name,value in files.items()})
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,"w",zipfile.ZIP_DEFLATED) as result:
        for name,value in files.items():
            result.writestr(name,value)
    return stream.getvalue()


class TestPrescratchSync(unittest.TestCase):
    def test_source_verified_f4_display_ranks_are_complete(self):
        date,cards,_,counts=build_cards(make_zip())
        self.assertEqual(date,"2026-11-23")
        self.assertEqual(counts["f4_ordered_races"],1)
        self.assertEqual([e["rank"] for e in cards[0]["races"][0]["entries"]],[1,2])
        self.assertEqual(cards[0]["races"][0]["entries"][0]["f4_probabilities"]["exact_p1"],.6)

    def test_tampered_f4_prefix_hash_holds_entire_publish(self):
        original=make_zip()
        with zipfile.ZipFile(io.BytesIO(original)) as z:
            rows={name:z.read(name) for name in z.namelist()}
        name="internal_receipts/PRX/TRI_F4_V2_20261123_PRESCRATCH_ORDERED_PREFIXES.csv"
        rows[name]=rows[name].replace(b"0.6,EXACTA",b"0.7,EXACTA")
        out=io.BytesIO()
        with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
            for path,blob in rows.items():z.writestr(path,blob)
        with self.assertRaisesRegex(Hold,"Certified F4 finishing order unavailable"):
            build_cards(out.getvalue())

    def test_keys_match_website_r2_storage(self):
        self.assertEqual(target_key({"track_name": "Parx Racing", "race_date": "2026-11-23"}),
                         "projections/dashboard/2026-11-23/parx-racing.json")
        self.assertEqual(target_key({"track_name": "M\u00e1hon\u00edng Valley", "race_date": "2026-11-23"}),
                         "projections/dashboard/2026-11-23/mahoning-valley.json")

    def test_direct_private_r2_write_is_idempotent_and_protects_final_cards(self):
        class Missing(Exception):
            def __init__(self):
                self.response = {"Error": {"Code": "NoSuchKey"}}
        class Body:
            def __init__(self, value):
                self.value = value
            def read(self, _limit=None):
                return self.value
        class FakeR2:
            def __init__(self):
                self.saved = {}
                self.writes = 0
            def get_object(self, Bucket, Key):
                if Key not in self.saved:
                    raise Missing()
                item = self.saved[Key]
                return {"Body": Body(item["Body"]), "Metadata": item["Metadata"]}
            def put_object(self, Bucket, Key, Body, Metadata, **kwargs):
                self.writes += 1
                self.saved[Key] = {"Body": Body, "Metadata": Metadata}
        _, cards, _, result = build_cards(make_zip())
        client = FakeR2()
        self.assertEqual(sync_cards(cards, result["sha256"], client=client, dry_run=True), (1, 0))
        self.assertEqual(client.writes, 0)
        self.assertEqual(sync_cards(cards, result["sha256"], client=client), (1, 0))
        self.assertEqual(sync_cards(cards, result["sha256"], client=client), (0, 1))
        self.assertEqual(client.writes, 1)
        key = target_key(cards[0])
        self.assertEqual(json.loads(client.saved[key]["Body"])["projection_status"], "prescratch")
        client.saved[key]["Body"] = dump({"schema_version": 1, "projection_status": "post-scratch"})
        with self.assertRaisesRegex(Hold, "scratch-updated"):
            sync_cards(cards, result["sha256"], client=client)
        self.assertEqual(client.writes, 1, "A newer post-scratch card must remain untouched")


    def test_original_badges_are_reused_without_rescoring(self):
        _,cards,_,_=build_cards(make_zip())
        certified=attach_verified_badges(cards,make_badge_source_zip())
        self.assertEqual(certified,10)
        self.assertEqual(cards[0]["races"][0]["pace"],"Moderate")
        self.assertEqual(cards[0]["races"][0]["entries"][0]["win_probability_exact"],60)
        self.assertEqual(cards[0]["races"][0]["entries"][0]["f4_probabilities"]["exact_p1"],.6)
        self.assertEqual([m["value"] for m in cards[0]["races"][0]["entries"][0]["metrics"]],
                         ["green","gray","red","green","gray"])

    def test_mismatched_audit_color_is_never_published(self):
        _,cards,_,_=build_cards(make_zip())
        with self.assertRaisesRegex(Hold,"Factor badge does not match"):
            attach_verified_badges(cards,make_badge_source_zip(bad_color=True))

    def test_badge_evaluator_on_different_win_score_is_rejected(self):
        _,cards,_,_=build_cards(make_zip())
        with self.assertRaisesRegex(Hold,"different TRI PWIN"):
            attach_verified_badges(cards,make_badge_source_zip(wrong_pwin=True))

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

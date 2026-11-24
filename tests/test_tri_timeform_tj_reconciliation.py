import unittest
import json
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from tri_timeform_tj_reconcile_gate import detect_rating, printed_person, same_person


def sp(text, x, y):
    return {"text": text, "bbox": (float(x), float(y), float(x + len(text)*4), float(y+8))}


class TjReconciliationGateTests(unittest.TestCase):
    def base(self, trainer='J. Smith', jockey='Jockey A. Torres', include_jockey=True):
        spans=[sp('Actual Horse',30,100),sp(trainer,415,94),sp('Ratings',481,94),
               sp('Past Yr',513,94),sp('Win%',542,94),
               sp('Overall',415,103),sp('68',481,103),sp('114',513,103),
               sp('19',542,103),sp('Jockey',415,120) if not include_jockey else sp(jockey,415,120),
               sp('81',481,120),sp('67',513,120)]
        if not include_jockey:spans=[x for x in spans if x['text']!='Jockey']
        return spans

    def test_printed_ratings_and_persons(self):
        s=self.base()
        self.assertEqual(detect_rating(s,'Actual Horse','trainer'),(68,'SOURCE_PRINTED_RATING'))
        self.assertEqual(detect_rating(s,'Actual Horse','jockey'),(81,'SOURCE_PRINTED_RATING'))
        self.assertEqual(printed_person(s,'Actual Horse','trainer')[0],'J. Smith')
        self.assertEqual(printed_person(s,'Actual Horse','jockey')[0],'A. Torres')

    def test_embedded_column_heading_removed_only_with_printed_source(self):
        s=self.base(trainer='Earnings Top Fig B. Colebrook')
        self.assertEqual(printed_person(s,'Actual Horse','trainer')[0],'B. Colebrook')
        self.assertFalse(same_person('Earnings Top Fig B. Colebrook','B. Colebrook'))
        self.assertTrue(same_person('B. Colebrook','B. Colebrook'))

    def test_missing_rating_neutral_not_0_or_other_column(self):
        s=[x for x in self.base() if not (x['text']=='68' and x['bbox'][0]==481)]
        self.assertEqual(detect_rating(s,'Actual Horse','trainer'),(None,'SOURCE_VERIFIED_RATING_BLANK'))
        # Next column's 114 must never leak into Ratings.
        self.assertEqual(printed_person(s,'Actual Horse','trainer')[0],'J. Smith')

    def test_genuine_zero_preserved_as_source_zero(self):
        s=self.base()
        s=[dict(x,text='0') if x['text']=='81' and x['bbox'][0]==481 else x for x in s]
        self.assertEqual(detect_rating(s,'Actual Horse','jockey'),(0,'SOURCE_PRINTED_RATING'))

    def test_no_jockey_identity_means_hold_not_fake_neutral(self):
        s=self.base(include_jockey=False)
        self.assertEqual(printed_person(s,'Actual Horse','jockey')[1],'JOCKEY_NAME_ABSENT_FROM_ORIGINAL_PDF')
        self.assertEqual(detect_rating(s,'Actual Horse','jockey')[1],'ROLE_LABEL_MISSING_OR_AMBIGUOUS')

    def test_duplicated_ratings_are_ambiguous(self):
        s=self.base()+[sp('58',481,103)]
        self.assertEqual(detect_rating(s,'Actual Horse','trainer')[1],'MULTIPLE_RATING_VALUES_IN_CELL')

    def test_horse_to_person_binding_fails_wrong_title(self):
        s=self.base()
        self.assertEqual(printed_person(s,'Different Horse','trainer')[1],'HORSE_TITLE_MISSING_OR_AMBIGUOUS')


class MandatoryScoreLauncherTests(unittest.TestCase):
    def test_missing_jockey_race_blocks_scoring_not_site_staging(self):
        from tri_timeform_tj_verified_score import run
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            engine=root/'engine';(engine/'CODE').mkdir(parents=True)
            (engine/'CODE/score_current_runtime_v1_3_7.py').write_text('# canonical scorer stub')
            (root/'frozen.zip').write_bytes(b'REFERENCE_ONLY')
            args=SimpleNamespace(roster=root/'roster.json',source_dir=root/'source',
                                 sidecars_dir=root/'sidecars',race_date='2026-11-25',
                                 out_dir=root/'verified',engine_dir=engine,
                                 runtime_zip=root/'frozen.zip',timeout=5)
            gate={'lock_id':'RAIL_RYE_TJ_SOURCE_GEOMETRY_V1',
                  'neutral_policy':'TRI_TJ_NEUTRAL_MEAN_V4_ALWAYS_ON',
                  'tracks':{'PRX':{'status':'PARTIAL_HOLD','held_races':[4,7,8],'runners':72}}}
            with patch('tri_timeform_tj_verified_score.repair'), \
                 patch('tri_timeform_tj_verified_score.reconcile',return_value=gate), \
                 patch('tri_timeform_tj_verified_score.subprocess.run') as score:
                self.assertEqual(run(args),2)
                score.assert_not_called()
            receipt=json.loads((root/'verified/source_to_tri_scoring_run_receipt.json').read_text())
            self.assertFalse(receipt['publishing_enabled'])
            self.assertEqual(receipt['held'][0]['held_races'],[4,7,8])
            self.assertEqual(receipt['tracks_scored'],[])


if __name__=='__main__':unittest.main()
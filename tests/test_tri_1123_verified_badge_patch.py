import hashlib
import json
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent.parent/"scripts"))
import tri_1123_verified_badge_patch as badge


def synthetic_patch():
    states=["green"]*445+["gray"]*1216+["red"]*174
    pos=0
    tracks=[]
    for name,(races,runners) in badge.COUNTS.items():
        q,rem=divmod(runners,races)
        rs=[]
        for index in range(races):
            entries=[]
            for row_index in range(q+(index<rem)):
                metrics=[]
                for factor in badge.FACTORS:
                    metrics.append({"label":factor,"value":states[pos]})
                    pos+=1
                entries.append({"program_number":str(row_index+1),
                                "horse_name":"Verified Runner "+str(row_index+1),
                                "metrics":metrics})
            rs.append({"race_number":index+1,"pace":"Moderate","entries":entries})
        tracks.append({"track_name":name,"track_code":badge.TRACK_CODES[name],"races":rs})
    assert pos==1835
    return {"patch_version":1,"race_date":badge.DATE,
            "base_model_source_sha256":badge.BASE_MODEL_SHA,
            "badge_authority":"TBS_FACTOR_BADGE_EVALUATOR_V1_2_6_FIT_CLASS_FORM_GUARDS",
            "tracks":tracks}


class BadgeTransferTests(unittest.TestCase):
    def test_1835_source_backed_colors_with_full_fields_pass(self):
        data=json.dumps(synthetic_patch(),separators=(",",":")).encode()
        with patch.object(badge,"SOURCE_JSON_SHA256",hashlib.sha256(data).hexdigest()):
            self.assertEqual(len(badge.validate(data)),5)

    def test_wrong_digest_rejected(self):
        with self.assertRaisesRegex(RuntimeError,"differs"):
            badge.validate(json.dumps(synthetic_patch()).encode())

    def test_unapproved_state_rejected(self):
        sample=synthetic_patch()
        sample["tracks"][0]["races"][0]["entries"][0]["metrics"][0]["value"]="made-up"
        data=json.dumps(sample,separators=(",",":")).encode()
        with patch.object(badge,"SOURCE_JSON_SHA256",hashlib.sha256(data).hexdigest()):
            with self.assertRaisesRegex(RuntimeError,"Unapproved"):
                badge.validate(data)

    def test_incorrect_race_or_horse_counts_rejected(self):
        sample=synthetic_patch()
        sample["tracks"][0]["races"][0]["entries"].pop()
        data=json.dumps(sample,separators=(",",":")).encode()
        with patch.object(badge,"SOURCE_JSON_SHA256",hashlib.sha256(data).hexdigest()):
            with self.assertRaisesRegex(RuntimeError,"Wrong runner count"):
                badge.validate(data)


if __name__=="__main__":
    unittest.main()

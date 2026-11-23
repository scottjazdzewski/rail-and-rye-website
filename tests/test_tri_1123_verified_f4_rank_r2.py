import copy
import io
import json
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,os.path.join(os.path.dirname(__file__),"..","scripts"))
import tri_1123_verified_f4_rank_r2 as delivery


class MemoryR2:
 def __init__(self,card):
  self.objects={
   "projections/dashboard/2026-11-23/parx-racing.json":{
    "Body":json.dumps(card).encode(),
    "Metadata":{"source_sha256":delivery.SOURCE_SHA,
                "badge_sha256":delivery.BADGE_SHA,"stage":"prescratch"}
   }
  }
  self.writes=0
 def get_object(self,Bucket,Key):
  obj=self.objects[Key]
  return {"Body":io.BytesIO(obj["Body"]),"Metadata":obj["Metadata"]}
 def put_object(self,Bucket,Key,Body,Metadata,**other):
  self.objects[Key]={"Body":Body,"Metadata":Metadata}
  self.writes+=1
 def delete_object(self,Bucket,Key):
  self.objects.pop(Key,None)


def sample():
 rows=[]
 ranks={}
 for prog,horse,pwin,rank in [("1","Leader",60.,1),("2","Follower 2",25.,3),("3","Follower 3",15.,2)]:
  rows.append({"program_number":prog,"horse_name":horse,
    "win_probability_exact":pwin,
    "f4_probabilities":{"exact_p1":pwin/100,
                        "exact_p2":.2,"exact_p3":.1,"exact_p4":0.,
                        "exact_p5":0.,"p6_plus":0.},
    "metrics":[{"label":name,"value":color} for name,color in
      [("Speed","green"),("Form","gray"),("Class","red"),
       ("Pace Fit","green"),("Surface / Distance","gray")]],
    "trainer":"Verified Trainer","jockey":"Verified Jockey",
    "rank":None,"morning_line":"4-1","fair_odds":"1.50/1"})
  ranks[prog]={"program_number":prog,"horse_name":horse,
       "win_probability_exact":pwin,
       "f4_expected_position":{1:1.6,2:2.8,3:2.0}[int(prog)],
       "rank":rank}
 card={"race_date":delivery.DATE,"track_name":"Parx Racing",
       "projection_status":"prescratch",
       "races":[{"race_number":1,"entries":rows}]}
 source=[{"track_name":"Parx Racing","track_code":"PRX",
          "races":[{"race_number":1,"entries":list(ranks.values())}]}]
 return card,source


class VerifiedPrivateF4RankTransferTests(unittest.TestCase):
 def test_exact_row_reordering_preserves_all_model_and_badge_data(self):
  card,source=sample()
  r2=MemoryR2(card)
  with patch.object(delivery,"decrypt",return_value=source):
   delivery.patch(r2,"encrypted")
  self.assertEqual(r2.writes,1)
  stored=r2.objects["projections/dashboard/2026-11-23/parx-racing.json"]
  current=json.loads(stored["Body"])
  self.assertEqual([x["program_number"] for x in current["races"][0]["entries"]],
      ["1","3","2"])
  self.assertEqual([x["rank"] for x in current["races"][0]["entries"]],[1,2,3])
  original={x["program_number"]:x for x in card["races"][0]["entries"]}
  for row in current["races"][0]["entries"]:
   expected=copy.deepcopy(original[row["program_number"]]);expected["rank"]=row["rank"]
   self.assertEqual(row,expected)
  self.assertEqual(stored["Metadata"]["source_sha256"],delivery.SOURCE_SHA)
  self.assertEqual(stored["Metadata"]["badge_sha256"],delivery.BADGE_SHA)
  self.assertEqual(stored["Metadata"]["f4_order_sha256"],delivery.PATCH_SHA)

 def test_post_scratch_model_cannot_be_overwritten(self):
  card,source=sample();card["projection_status"]="scratch_updated"
  r2=MemoryR2(card)
  with patch.object(delivery,"decrypt",return_value=source):
   with self.assertRaisesRegex(RuntimeError,"Scratch-updated"):
    delivery.patch(r2,"encrypted")
  self.assertEqual(r2.writes,0)

 def test_trainer_and_jockey_not_used_as_rank_keys(self):
  card,source=sample()
  card["races"][0]["entries"][1]["horse_name"]="Wrong Runner"
  r2=MemoryR2(card)
  with patch.object(delivery,"decrypt",return_value=source):
   with self.assertRaisesRegex(RuntimeError,"Horse identity"):
    delivery.patch(r2,"encrypted")
  self.assertEqual(r2.writes,0)

 def test_badge_provenance_must_match(self):
  card,source=sample();r2=MemoryR2(card)
  r2.objects["projections/dashboard/2026-11-23/parx-racing.json"]["Metadata"]["badge_sha256"]="bad"
  with patch.object(delivery,"decrypt",return_value=source):
   with self.assertRaisesRegex(RuntimeError,"model/badge"):
    delivery.patch(r2,"encrypted")
  self.assertEqual(r2.writes,0)


if __name__=="__main__":unittest.main()

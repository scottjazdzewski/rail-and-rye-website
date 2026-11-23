import csv
import hashlib
import io
import json
import math
import os
import sys
import unittest
import zipfile

sys.path.insert(0,os.path.join(os.path.dirname(__file__),"..","scripts"))
from tri_f4_exotics import make_f4_exotic_payloads, sync_f4_exotic_payloads, ExoticHold
from test_tri_f4_finish_order import reference_model

DATE="2026-11-23"
MODEL="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET"

def synthetic():
    entries, prefixes, _ = reference_model()
    entries=[dict(x) for x in entries]
    for entry in entries:
        entry["horse_name"]="Horse "+str(entry["program_number"])
    csv_io=io.StringIO()
    writer=csv.writer(csv_io,lineterminator="\n")
    writer.writerow(["race_key","position_prefix","programs","probability","wager_prefix"])
    for seq,p in prefixes.items():
        writer.writerow(["20261123|PRX|1",len(seq),"-".join(seq),repr(p),
                         {2:"EXACTA",3:"TRIFECTA",4:"SUPERFECTA"}[len(seq)]])
    csv_blob=csv_io.getvalue().encode()
    prefix_name="TRI_F4_V2_20261123_PRESCRATCH_ORDERED_PREFIXES.csv"
    receipt={"status":"PASS","model_id":MODEL,"scratch_state":"PRESCRATCH",
             "expected_date":DATE,"official_scratches_verified":False,
             "race_count":1,
             "output_hashes":{prefix_name:hashlib.sha256(csv_blob).hexdigest()}}
    payloads={
      "internal_receipts/PRX/"+prefix_name:csv_blob,
      "internal_receipts/PRX/TRI_F4_V2_20261123_PRESCRATCH_SCORING_RECEIPT.json":
       json.dumps(receipt).encode()
    }
    file=io.BytesIO()
    with zipfile.ZipFile(file,"w",zipfile.ZIP_DEFLATED) as z:
        for name,blob in payloads.items():z.writestr(name,blob)
    card={"track_code":"PRX","track_name":"Parx Racing","race_date":DATE,
          "badge_source_sha256":"b"*64,
          "races":[{"race_number":1,"entries":entries}]}
    return file.getvalue(),card

class TestCertifiedF4ExoticWeights(unittest.TestCase):
    def test_conditional_law_exactly_reproduces_signed_prefixes(self):
        blob,card=synthetic()
        result=make_f4_exotic_payloads(blob,[card],"a"*64)
        self.assertEqual(len(result),1)
        track=result[0]
        self.assertEqual(track["schema_version"],2)
        self.assertEqual(track["model_id"],MODEL)
        self.assertEqual(track["source_sha256"],"a"*64)
        race=track["races"][0]
        self.assertEqual(len(race["programs"]),5)
        self.assertAlmostEqual(sum(race["pwin"]),1)
        self.assertEqual(race["p2_weights"][0],1)
        self.assertEqual(race["p3_weights"][0],1)

    def test_mismatched_signed_prefix_does_not_publish(self):
        blob,card=synthetic()
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            items={name:z.read(name) for name in z.namelist()}
        target=next(x for x in items if x.endswith("ORDERED_PREFIXES.csv"))
        items[target]=items[target].replace(b",0.",b",0.9",1)
        zipped=io.BytesIO()
        with zipfile.ZipFile(zipped,"w") as z:
            for key,val in items.items():z.writestr(key,val)
        with self.assertRaises(ExoticHold):
            make_f4_exotic_payloads(zipped.getvalue(),[card],"a"*64)

    def test_private_r2_store_is_idempotent_and_scratch_safe(self):
        class NotFound(Exception):
            response={"Error":{"Code":"NoSuchKey"}}
        class B:
            def __init__(self,v):self.v=v
            def read(self):return self.v
        class Client:
            def __init__(self):self.objects={};self.writes=0
            def get_object(self,**kwargs):
                key=kwargs["Key"]
                if key not in self.objects:raise NotFound()
                return {"Body":B(self.objects[key])}
            def put_object(self,**kwargs):
                self.objects[kwargs["Key"]]=kwargs["Body"];self.writes+=1
        blob,card=synthetic()
        tracks=make_f4_exotic_payloads(blob,[card],"a"*64)
        client=Client()
        self.assertEqual(sync_f4_exotic_payloads(tracks,client,dry_run=True),(1,0))
        self.assertEqual(sync_f4_exotic_payloads(tracks,client),(1,0))
        self.assertEqual(sync_f4_exotic_payloads(tracks,client),(0,1))
        self.assertEqual(client.writes,1)
        key=next(iter(client.objects))
        self.assertEqual(key,"projections/f4-ordered/2026-11-23/parx-racing.json")
        item=json.loads(client.objects[key])
        item["scratch_state"]="SCRATCHED"
        client.objects[key]=json.dumps(item).encode()
        with self.assertRaisesRegex(ExoticHold,"scratch-updated"):
            sync_f4_exotic_payloads(tracks,client)
        self.assertEqual(client.writes,1)

if __name__=="__main__":unittest.main()

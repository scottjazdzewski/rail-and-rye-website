"""Recover exact previously staged original cards; never reconstruct or publish."""
import base64,hashlib,json,os,re,zlib
from pathlib import Path
from collections import Counter
import boto3
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO
from pulse_prescratch_archive import preserve,validate_original,digest
DATE="2026-11-27"
def compact(o):return json.dumps(o,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def main():
    assert os.environ["GITHUB_REPOSITORY"]==REPO
    client=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
    def get(key):return client.get_object(Bucket=BUCKET,Key=key)
    receipt=json.loads(get(f"projections/qa/{DATE}/staged-release.json")["Body"].read())
    assert receipt["status"]=="VERIFIED_STAGED" and receipt["scope"]=="VERIFIED_COMPLETE_SLATE" and receipt["race_date"]==DATE and len(receipt["tracks"])==15
    candidates={}
    for directory in Path("private-ingest").glob("20261127-*"):
        if not ("prestage-" in directory.name or "verified-" in directory.name):continue
        manifest=json.loads((directory/"manifest.json").read_text())
        if manifest["date"]!=DATE or manifest["source_sha256"]!=receipt["source_sha256"] or manifest["release_at"]!=receipt["release_at"]:continue
        for t in manifest["tracks"]:
            if not t.get("cipher_sha256"):continue
            path=directory/(t["slug"]+".enc")
            if path.is_file():candidates.setdefault(t["slug"],[]).append((path,t))
    counts=Counter()
    for t in receipt["tracks"]:
        slug=t["slug"];track=t["name"]
        try:
            final_obj=get(f"projections/dashboard/{DATE}/{slug}.json")
            final=json.loads(final_obj["Body"].read())
            assert final["race_date"]==DATE and final["track_name"]==track and final["projection_status"]=="scratch_final" and final["factor_basis"]=="verified_scratch_final"
            assert final_obj["Metadata"].get("source_sha256")==receipt["source_sha256"]
            matched=None
            for path,source in candidates.get(slug,[]):
                encoded=path.read_bytes()
                if digest(encoded)!=source["cipher_sha256"]:continue
                dec=zlib.decompressobj();raw=dec.decompress(SealedBox(private_key()).decrypt(base64.b64decode(encoded,validate=True)),200001)
                if not dec.eof or dec.unused_data or len(raw)>200000 or digest(raw)!=source["raw_sha256"]:continue
                payload=json.loads(raw);card=payload["card"];model=payload["model"];cb,fb=compact(card),compact(model)
                if digest(cb)!=t["dashboard_sha256"] or digest(fb)!=t["ordered_sha256"]:continue
                validate_original(cb,DATE,track)
                assert model["source_sha256"]==receipt["source_sha256"] and model["f4_receipt_sha256"]==card["model_receipts"]["f4_sha256"] and model["scratch_state"]=="PRESCRATCH"
                proof=final.get("parent_replay_proof") or {};mr=final["model_receipts"]
                direct=card["model_receipts"]["f4_sha256"]==mr["prescratch_parent_sha256"]
                replay=proof.get("stored_parent_receipts")==card["model_receipts"] and re.fullmatch(r"[a-f0-9]{64}",str(proof.get("replay_tri_sha256","")),re.I) and proof.get("replay_f4_sha256")==mr["prescratch_parent_sha256"]
                if not (direct or replay):continue
                matched=cb;break
            if matched is None:counts["held"]+=1;print("PULSE_BASELINE_HOLD",slug,"no exact certified source/lineage",flush=True);continue
            created=preserve(client,BUCKET,slug,DATE,track,matched,t["dashboard_sha256"])
            counts["created" if created else "existing"]+=1
            print("PULSE_BASELINE_VERIFIED",slug,"created" if created else "existing",flush=True)
        except Exception as exc:
            counts["held"]+=1;print("PULSE_BASELINE_HOLD",slug,type(exc).__name__,flush=True)
    print("PULSE_BASELINE_RECOVERY",json.dumps(dict(counts)),flush=True)
    assert sum(counts.values())==15 and counts["held"]==0,"One or more tracks held"
if __name__=="__main__":main()

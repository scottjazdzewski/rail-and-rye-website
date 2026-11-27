"""Preserve exact certified original dashboard bytes, never a reconstructed field."""
import hashlib,json,re
from botocore.exceptions import ClientError
HEX=re.compile(r"^[a-f0-9]{64}$",re.I)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def validate_original(raw,date,track):
    card=json.loads(raw)
    assert card["schema_version"]==1 and card["race_date"]==date and card["track_name"]==track
    assert card["projection_status"]=="prescratch" and card["factor_basis"]=="verified_prescratch"
    assert all(HEX.fullmatch(card["model_receipts"][k]) for k in ("tri_sha256","f4_sha256"))
    assert card["races"] and len({r["race_number"] for r in card["races"]})==len(card["races"])
    for race in card["races"]:
        assert not race.get("scratches") and race.get("scratch_count") in (None,0)
        entries=race["entries"]
        assert len(entries)>=2 and len({str(e["program_number"]) for e in entries})==len(entries)
        p=[e["win_probability_exact"] for e in entries]
        assert all(0<=v<=100 for v in p) and abs(sum(p)-100)<.00001
    return card
def preserve(client,bucket,slug,date,track,raw,expected_sha):
    assert re.fullmatch(r"[a-z0-9-]+",slug) and re.fullmatch(r"\d{4}-\d{2}-\d{2}",date)
    assert HEX.fullmatch(expected_sha) and digest(raw)==expected_sha
    validate_original(raw,date,track)
    key=f"race-day-pulse/prescratch/{date}/{slug}.json"
    created=True
    try:
        client.put_object(Bucket=bucket,Key=key,Body=raw,IfNoneMatch="*",ContentType="application/json",CacheControl="private,no-store",Metadata={"stage":"PRESCRATCH_PULSE_BASE","original_source_sha256":expected_sha})
    except ClientError as exc:
        if exc.response["ResponseMetadata"]["HTTPStatusCode"]!=412:raise
        created=False
    saved=client.get_object(Bucket=bucket,Key=key)["Body"].read()
    assert saved==raw,"Existing immutable original differs; hold Pulse for track"
    return created

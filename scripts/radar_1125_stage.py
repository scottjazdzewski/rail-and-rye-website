"""Private, date-scoped Radar staging. No paid data in logs or clear GitHub files."""
import base64, hashlib, json, os, re, subprocess, zlib, math
from datetime import datetime,timezone
from pathlib import Path
from nacl.public import SealedBox,PublicKey
import boto3
from botocore.exceptions import ClientError
from pick_private_score_bridge import private_key
D="2026-11-25"; DUE="2026-11-25T08:00:00Z"; B="rail-and-rye-private-cards"
SRC="8a1538f5ced6efb2ced53013c1fc4bc01052a209c840091b45af6245460a0b13"
MODEL="de289a89bcb5d4759cd8255819149557640faee5787fc642e5e3d0725c346025"
def need(x,msg):
    if not x: raise ValueError(msg)
def sha(b): return hashlib.sha256(b).hexdigest()
def compact(x): return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def norm(s): return re.sub(r"[^a-z0-9]+"," ",str(s).lower()).strip()
def price(s):
    m=re.fullmatch(r"(\d+)\s*[-/]\s*(\d+)",str(s))
    return int(m[1])/int(m[2]) if m and int(m[2]) else None
def key(t,r,p,h): return (norm(t),int(r),str(p).upper(),norm(h))
def main():
    need(os.environ["GITHUB_REPOSITORY"]=="scottjazdzewski/rail-and-rye-website","Wrong repository")
    need(datetime.now(timezone.utc)<datetime.fromisoformat(DUE.replace("Z","+00:00")),"Not before release")
    enc=Path("private-ingest/20261125/radar.enc").read_bytes()
    dec=zlib.decompressobj(); plain=dec.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),200001)
    need(dec.eof and not dec.unused_data and len(plain)<=200000,"Invalid encrypted packet")
    packet=json.loads(plain); edition=packet["edition"]; qa=packet["qa_decisions"]
    correction=None
    patch_path=Path("private-ingest/20261125/radar-correction.enc")
    if patch_path.exists():
        dc=zlib.decompressobj(); patch_raw=dc.decompress(SealedBox(private_key()).decrypt(base64.b64decode(patch_path.read_bytes(),validate=True)),10001)
        need(dc.eof and not dc.unused_data and len(patch_raw)<=10000,"Invalid reconciliation envelope")
        correction=json.loads(patch_raw)
        need(correction["original_qa_hash"]==packet["qa_hash"]==edition["receipts"]["editorial_qa_sha256"],"Reconciliation receipt mismatch")
        need(re.fullmatch("[a-f0-9]{64}",correction["new_qa_hash"]) is not None,"Invalid new QA receipt")
        ck=key(correction["track"],correction["race"],correction["program"],correction["horse"])
        qr=[x for x in qa if key(x["track"],x["race"],x["program"],x["horse"])==ck]
        er=[x for x in edition["candidates"] if key(x["track"],x["race_number"],x["program_number"],x["horse_name"])==ck]
        need(len(qr)==len(er)==1 and qr[0]["disposition"]=="PASS","Reconciliation identity mismatch")
        need(abs(qr[0]["pwin_exact"]-correction["old_pwin"])<1e-12 and abs(er[0]["pwin_exact"]-correction["old_pwin"])<1e-12,"Reconciliation prior PWIN mismatch")
        qr[0]["pwin_exact"]=correction["pwin_exact"]
        er[0]["pwin_exact"]=correction["pwin_exact"];er[0]["pwin_display"]=correction["pwin_display"]
        packet["qa_hash"]=edition["receipts"]["editorial_qa_sha256"]=correction["new_qa_hash"]
        edition["generated_at"]=correction["generated_at"]
    need(edition["race_date"]==D and edition["revision"]==1 and edition["status"]=="prescratch","Wrong edition")
    need(edition["receipts"]["source_sha256"]==SRC and packet["runtime_hash"]==MODEL and edition["receipts"]["editorial_qa_sha256"]==packet["qa_hash"],"Receipt mismatch")
    node="""import {validateLongshotEdition} from './src/longshot-radar.js';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(JSON.stringify(validateLongshotEdition(JSON.parse(s))));"""
    proc=subprocess.run(["node","--input-type=module","-e",node],input=compact(edition),capture_output=True)
    need(proc.returncode==0,"Website schema rejected edition")
    output=proc.stdout; edition=json.loads(output)
    s=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
    def get(k):
        try:
            o=s.get_object(Bucket=B,Key=k);return o["Body"].read(),o.get("Metadata",{})
        except ClientError as e:
            if e.response.get("Error",{}).get("Code") in ("404","NoSuchKey","NotFound"):return None,{}
            raise
    raw,meta=get("projections/qa/"+D+"/staged-release.json");need(raw,"Missing projection stage")
    m=json.loads(raw);need(m["source_sha256"]==SRC and m["release_at"]==DUE and len(m["tracks"])==9,"Projection source identity mismatch")
    elig={}; lookup={}; nr=0; n=0
    for t in m["tracks"]:
        b,md=get("projections/dashboard/"+D+"/"+t["slug"]+".json");need(b and sha(b)==t["dashboard_sha256"] and md.get("release_at")==DUE,"Projection stage hash or timing mismatch")
        card=json.loads(b);need(card["race_date"]==D and card["projection_status"]=="prescratch" and card["track_name"]==t["name"],"Projection source identity mismatch")
        for race in card["races"]:
            nr+=1; need(abs(sum(e["win_probability_exact"] for e in race["entries"])-100)<1e-6,"PWIN mass mismatch")
            for e in race["entries"]:
                n+=1;p=e["win_probability_exact"]/100;ml=price(e["morning_line"])
                need(abs(p-e["f4_probabilities"]["exact_p1"])<1e-8,"F4 mismatch")
                k=key(t["name"],race["race_number"],e["program_number"],e["horse_name"]);need(k not in lookup,"Duplicate source runner")
                lookup[k]=(e,race)
                if ml is not None and ml>=6 and p>=1/7 and p*(1+ml)-1>=.5:
                    elig[k]={"track":t["name"],"race":race["race_number"],"program":e["program_number"],"horse":e["horse_name"],"pwin_exact":p,"original_ml":e["morning_line"],"trainer":e["trainer"],"jockey":e["jockey"],"post_time":race.get("post_time_et"),"display":e["win_probability"],"field":[[x["program_number"],x["horse_name"]] for x in race["entries"]]}
    need(nr==76 and n==626,"Unexpected staged field counts")
    if correction is not None:
        need(ck in elig,"Corrected runner no longer qualifies")
        x=elig[ck]
        need(sha(compact(sorted(x["field"])))==correction["field_sha256"],"Corrected race field identity differs")
        need(abs(x["pwin_exact"]-correction["pwin_exact"])<1e-12 and x["display"]==correction["pwin_display"],"Corrected value not exact staged projection")
    q={key(x["track"],x["race"],x["program"],x["horse"]):x for x in qa}
    need(len(q)==len(qa),"Duplicate QA decision")
    selected={key(c["track"],c["race_number"],c["program_number"],c["horse_name"]):c for c in edition["candidates"]}
    mismatch=set(q)!=set(elig) or set(selected)!={k for k,x in q.items() if x["disposition"]=="PASS"}
    for k in q.keys()&elig.keys():
        if abs(q[k]["pwin_exact"]-elig[k]["pwin_exact"])>1e-10 or price(q[k]["original_ml"])!=price(elig[k]["original_ml"]):mismatch=True
    for k,c in selected.items():
        if k not in elig: mismatch=True;continue
        x=elig[k]
        if abs(c["pwin_exact"]-x["pwin_exact"])>1e-10 or abs(c["pwin_display"]-x["display"])>1e-9 or price(c["original_morning_line"])!=price(x["original_ml"]) or norm(c["trainer"])!=norm(x["trainer"]) or norm(c["jockey"])!=norm(x["jockey"]):mismatch=True
    if mismatch:
        # Return source differences only to the private one-use recipient, never to public logs in clear.
        report={"qualifiers":list(elig.values()),"local_count":len(q),"remote_count":len(elig),"matched_ids":len(q.keys()&elig.keys()),"remote_only":len(elig.keys()-q.keys()),"local_only":len(q.keys()-elig.keys())}
        cipher=base64.b64encode(SealedBox(PublicKey(base64.b64decode(packet["return_pub"]))).encrypt(zlib.compress(compact(report),9))).decode()
        print("SEALED_SOURCE_RECONCILIATION="+cipher,flush=True)
        raise ValueError("Local editorial decisions differ from exact staged source; no write")
    stage="intelligence/longshot-radar/staging/"+D+"/revision-0001.json"
    prior,pmeta=get(stage)
    need(prior is None or (prior==output and pmeta.get("release_at")==DUE and pmeta.get("sha256")==sha(output)),"Existing stage differs")
    if prior is None:
        s.put_object(Bucket=B,Key=stage,Body=output,ContentType="application/json",CacheControl="private,no-store",Metadata={"stage_only":"true","release_at":DUE,"sha256":sha(output),"source_sha256":SRC})
    written,md=get(stage);need(written==output and md.get("stage_only")=="true" and md.get("release_at")==DUE,"Private stage readback failed")
    print("RADAR_PRIVATE_STAGE_READBACK_PASS date="+D+" release_at="+DUE+" candidates="+str(len(selected))+" numeric_qualified="+str(len(elig))+" sha256="+sha(output),flush=True)
if __name__=="__main__":
    try:main()
    except Exception as e:raise SystemExit("RADAR_STAGE_HOLD "+type(e).__name__+": "+str(e)[:160])

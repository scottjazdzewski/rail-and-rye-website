"""Source-locked private November 26 Radar release; no paid data in logs."""
import base64,hashlib,json,os,re,subprocess,zlib,math
from datetime import datetime,timezone
from pathlib import Path
from nacl.public import SealedBox,PublicKey
from pick_private_score_bridge import private_key
import boto3
from botocore.exceptions import ClientError
D="2026-11-26"; DUE="2026-11-26T08:00:00Z"; B="rail-and-rye-private-cards"
SRC="20a001e4bbf88afb2701d6408e2cbfae63abb508cf18661d484e74d7f8ab0fc7"
MODEL="de289a89bcb5d4759cd8255819149557640faee5787fc642e5e3d0725c346025"
PACKET="430a129deeb18e547326a015fc25cc6474cbea5f3257025e1fc438cb21bc6f44"
def need(x,msg):
    if not x:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(x):return json.dumps(x,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def norm(x):return re.sub(r"[^a-z0-9]+"," ",str(x).lower()).strip()
def price(x):
    m=re.fullmatch(r"(\d+)\s*[-/]\s*(\d+)",str(x))
    return int(m[1])/int(m[2]) if m and int(m[2]) else None
def ident(t,r,p,h):return (norm(t),int(r),str(p).upper(),norm(h))
TOTE=[(1,5),(2,5),(1,2),(3,5),(4,5),(1,1),(6,5),(7,5),(3,2),(8,5),(9,5),(2,1),(5,2),(3,1),(7,2),(4,1),(9,2),(5,1)]
def fair(p):
    net=1/p-1
    if net>=5:return str(math.ceil(net))+"/1"
    a,b=next((a,b) for a,b in TOTE if a/b>=net-1e-12)
    return f"{a}/{b}"
def main():
    need(os.environ["GITHUB_REPOSITORY"]=="scottjazdzewski/rail-and-rye-website","Wrong repository")
    need(datetime.now(timezone.utc)<datetime.fromisoformat(DUE.replace("Z","+00:00")),"Release window closed")
    enc=Path("private-ingest/20261126/radar.enc").read_bytes()
    dec=zlib.decompressobj(); raw=dec.decompress(SealedBox(private_key()).decrypt(base64.b64decode(enc,validate=True)),200001)
    need(dec.eof and not dec.unused_data and len(raw)<=200000 and sha(raw)==PACKET,"Encrypted packet hash mismatch")
    packet=json.loads(raw);edition=packet["edition"];decisions=packet["decisions"]
    need(edition["race_date"]==D and edition["revision"]==1 and edition["status"]=="prescratch" and edition["receipts"]["source_sha256"]==SRC and edition["receipts"]["model_sha256"]==MODEL and edition["receipts"]["editorial_qa_sha256"]==packet["qa_hash"],"Source/editorial receipt mismatch")
    s=boto3.client("s3",region_name="auto",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
    def get(k):
        try:
            o=s.get_object(Bucket=B,Key=k);return o["Body"].read(),o.get("Metadata",{})
        except ClientError as e:
            if e.response.get("Error",{}).get("Code") in ("404","NoSuchKey","NotFound"):return None,{}
            raise
    mb,mm=get("projections/qa/"+D+"/staged-release.json");need(mb,"Missing staged projections")
    m=json.loads(mb);need(m["source_sha256"]==SRC and m["release_at"]==DUE and len(m["tracks"])==6,"Staged source identity mismatch")
    eligible={}; fields={}; lookup={};n=nr=0
    for t in m["tracks"]:
        b,md=get("projections/dashboard/"+D+"/"+t["slug"]+".json")
        need(b and sha(b)==t["dashboard_sha256"] and md.get("release_at")==DUE and md.get("source_sha256")==SRC,"Source object checksum or timing mismatch")
        card=json.loads(b);need(card["race_date"]==D and card["projection_status"]=="prescratch" and card["track_name"]==t["name"],"Source date/track mismatch")
        for r in card["races"]:
            nr+=1; fkey=norm(t["name"])+"|"+str(r["race_number"]); fields[fkey]=r["entries"]
            need(abs(sum(x["win_probability_exact"] for x in r["entries"])-100)<1e-6,"PWIN mass mismatch")
            for x in r["entries"]:
                n+=1;p=x["win_probability_exact"]/100; ml=price(x["morning_line"])
                need(abs(p-x["f4_probabilities"]["exact_p1"])<1e-8,"F4 probability mismatch")
                k=ident(t["name"],r["race_number"],x["program_number"],x["horse_name"]);need(k not in lookup,"Duplicate source horse");lookup[k]=x
                if ml is not None and ml>=6 and p>=1/7 and p*(1+ml)-1>=.5:eligible[k]=x
    need(nr==56 and n==482,"Staged roster totals changed")
    q={ident(*d[:4]):d for d in decisions}
    sel={ident(c["track"],c["race_number"],c["program_number"],c["horse_name"]):c for c in edition["candidates"]}
    errors=[]
    if set(q)!=set(eligible):errors.append("Qualifier inventory differs")
    if set(sel)!={k for k,d in q.items() if d[6]=="PASS"}:errors.append("Editorial disposition mismatch")
    maxdelta=0; visible_changes=0; changed_candidate_ranks=0
    for fk,proof in packet["fields"].items():
        rs=sorted(fields.get(fk,[]),key=lambda e:str(e["program_number"]))
        rows=[[str(x["program_number"]),norm(x["horse_name"]),norm(x["trainer"]),norm(x["jockey"]),str(x["morning_line"]).replace("-","/")] for x in rs]
        if sha(compact(rows))!=proof["identity_hash"]:errors.append("Reviewed field identity/ML/connection mismatch")
        lp=dict(proof["probabilities"])
        if set(lp)!=set(str(x["program_number"]) for x in rs):errors.append("Reviewed roster differs");continue
        for x in rs:
            delta=abs(lp[str(x["program_number"])]-x["win_probability_exact"]/100)*100
            maxdelta=max(delta,maxdelta)
            if round(100*lp[str(x["program_number"])],1)!=round(x["win_probability_exact"],1):visible_changes+=1
            if delta>=.10:errors.append("Reviewed field probability differs by at least 0.10 percentage points")
        for k in q:
            if k[0]+"|"+str(k[1])!=fk or k[2] not in lp:continue
            old_rank=1+sum(v>lp[k[2]]+1e-12 for v in lp.values())
            xp=next(x["win_probability_exact"] for x in rs if str(x["program_number"])==k[2])
            new_rank=1+sum(x["win_probability_exact"]>xp+1e-10 for x in rs)
            if old_rank!=new_rank:changed_candidate_ranks+=1;errors.append("Reviewed qualifier rank differs")
    for k,d in q.items():
        if k in eligible and price(d[4])!=price(eligible[k]["morning_line"]):errors.append("Original ML differs")
    for k,c in sel.items():
        if k not in eligible:continue
        x=eligible[k]
        if norm(c["trainer"])!=norm(x["trainer"]) or norm(c["jockey"])!=norm(x["jockey"]):errors.append("Selected connection differs")
    print("RADAR_1126_PARITY max_field_pct_delta="+str(maxdelta)+" rounded_runner_changes="+str(visible_changes)+" qualifier_rank_changes="+str(changed_candidate_ranks)+" local_qualifiers="+str(len(q))+" site_qualifiers="+str(len(eligible)),flush=True)
    if errors:
        # Only sealed diagnostics, never clear paid source data.
        relevant=set(packet["fields"])|{k[0]+"|"+str(k[1]) for k in eligible}
        report={"errors":sorted(set(errors)),"qualifiers":[[list(k),x] for k,x in eligible.items()],"fields":{k:fields[k] for k in relevant if k in fields}}
        # minimize report to original required identities, scores and price
        for k,rs in report["fields"].items():report["fields"][k]=[{key:x.get(key) for key in ("program_number","horse_name","trainer","jockey","morning_line","win_probability_exact","win_probability")} for x in rs]
        report["qualifiers"]=[k for k,x in report["qualifiers"]]
        print("SEALED_RADAR_1126_RECONCILIATION="+base64.b64encode(SealedBox(PublicKey(base64.b64decode(packet["return_pub"]))).encrypt(zlib.compress(compact(report),9))).decode(),flush=True)
        raise ValueError("Reviewed and staged inputs differ; no write: "+",".join(sorted(set(errors))))
    # The site is the single authoritative exact probability source after the reviewed whole-field check.
    changes=[]
    for k,c in sel.items():
        x=eligible[k];p=x["win_probability_exact"]/100
        if c["pwin_exact"]!=p:changes.append({"key":list(k),"prior":c["pwin_exact"],"site":p})
        c["pwin_exact"]=p;c["pwin_display"]=x["win_probability"];c["fair_odds_display"]=fair(p)
    evidence={"original_editorial_qa_sha256":packet["qa_hash"],"original_packet_sha256":PACKET,"projection_stage_sha256":sha(mb),"reviewed_field_count":len(packet["fields"]),"numeric_qualifiers":len(eligible),"editorial_selected":len(sel),"site_exact_probability_changes":changes,"max_reviewed_field_pct_delta":maxdelta,"rounded_runner_changes":visible_changes,"qualifier_rank_changes":changed_candidate_ranks}
    proof=compact(evidence);edition["receipts"]["editorial_qa_sha256"]=sha(proof)
    node="""import {validateLongshotEdition} from './src/longshot-radar.js';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(JSON.stringify(validateLongshotEdition(JSON.parse(s))));"""
    proc=subprocess.run(["node","--input-type=module","-e",node],input=compact(edition),capture_output=True)
    need(proc.returncode==0,"Website validator rejected reconciled edition")
    output=proc.stdout;stage="intelligence/longshot-radar/staging/"+D+"/revision-0001.json"
    def put(k,body,meta):
        prev,pm=get(k)
        need(prev is None or (prev==body and pm.get("sha256")==sha(body) and pm.get("release_at")==DUE),"Conflicting existing stage; no overwrite")
        if prev is None:s.put_object(Bucket=B,Key=k,Body=body,ContentType="application/json",CacheControl="private,no-store",Metadata=meta,IfNoneMatch="*")
        rb,rm=get(k);need(rb==body and rm.get("sha256")==sha(body) and rm.get("release_at")==DUE,"R2 readback failed")
    need(datetime.now(timezone.utc)<datetime.fromisoformat(DUE.replace("Z","+00:00")),"Release window closed")
    put(stage.replace("revision-0001","qa-0001"),proof,{"stage_only":"true","sha256":sha(proof),"release_at":DUE,"source_sha256":SRC})
    put(stage,output,{"stage_only":"true","release_at":DUE,"sha256":sha(output),"source_sha256":SRC})
    print("RADAR_1126_PRIVATE_STAGE_PASS date="+D+" release_at="+DUE+" tracks=6 races=56 source_runners=482 candidates="+str(len(sel))+" numeric_qualified="+str(len(eligible))+" max_field_pct_delta="+str(maxdelta)+" sha="+sha(output),flush=True)
if __name__=="__main__":
    try:main()
    except Exception as e:raise SystemExit("RADAR_1126_STAGE_HOLD "+type(e).__name__+": "+str(e)[:200])

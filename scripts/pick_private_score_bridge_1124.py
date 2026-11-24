#!/usr/bin/env python3
"""Date-specific owner-authorized sealed November 24 prescratch Pick source."""
import base64,hashlib,json,os,re,zlib
from pathlib import Path
from datetime import datetime,timezone
from nacl.public import SealedBox
from pick_private_score_bridge import private_key,BUCKET,REPO,OWNER,ISSUE
import boto3
from botocore.exceptions import ClientError

PREFIX="RR_PICK_PRIVATE_SCORES_1124_V1"
KEY="pick-tickets/interim/2026-11-24/revision-0001.json"
COUNTS={"Delta Downs":(8,65),"Finger Lakes":(8,65),"Mahoning Valley":(8,67),"Mountaineer":(8,66),"Parx Racing":(9,74),"Zia Park":(10,93)}
SOURCE="7395a45700a3aa4fdf9f3dff05f393f7079adf4deb30cb2413aea7a78d4345c3"
EXPECTED="4130a2873d2369956ccbdd82dd7097ef700fb5b58e93722ec37927ba81e18399"
def validate(raw):
    if hashlib.sha256(raw).hexdigest()!=EXPECTED:raise ValueError("Unexpected scored source hash")
    d=json.loads(raw)
    if (d.get("schema_version"),d.get("product_type"),d.get("race_date"),d.get("revision"),d.get("review_only"),d.get("source_archive_sha256"))!=(1,"pick_tickets_prescratch_tri_f4","2026-11-24",1,True,SOURCE):raise ValueError("Wrong source envelope")
    if len(d["tracks"])!=len(COUNTS) or {t["track"] for t in d["tracks"]}!=set(COUNTS):raise ValueError("Wrong tracks")
    for t in d["tracks"]:
        n,nr=COUNTS[t["track"]]
        if any(not re.fullmatch(r"[0-9a-f]{64}",t.get(x,"")) for x in ("tri_sha256","f4_sha256")):raise ValueError("Missing scorer receipt")
        if len(t["races"])!=n or {r["race_number"] for r in t["races"]}!=set(range(1,n+1)):raise ValueError("Wrong race roster")
        total=0
        for r in t["races"]:
            es=r["entries"];seen=set();mass=0
            if not 2<=len(es)<=30:raise ValueError("Invalid field")
            for pn,p,f in es:
                if not isinstance(pn,str) or not re.fullmatch(r"[0-9]{1,2}[A-Z]?",pn) or pn in seen:raise ValueError("Invalid interest")
                if type(p) not in (int,float) or type(f) not in (int,float) or not 0<=p<=100 or not 0<=f<=1 or abs(p/100-f)>1e-10:raise ValueError("PWIN/F4 mismatch")
                seen.add(pn);mass+=p
            if abs(mass-100)>1e-7:raise ValueError("Mass mismatch")
            total+=len(es)
        if total!=nr:raise ValueError("Runner count mismatch")
    return d
def main():
    ev=json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    c=ev.get("comment",{})
    if ev.get("repository",{}).get("full_name")!=REPO or ev.get("issue",{}).get("number")!=ISSUE or c.get("user",{}).get("login")!=OWNER:raise PermissionError("Unauthorized")
    body=c.get("body","")
    if not body.startswith(PREFIX+"\n"):raise ValueError("Wrong prefix")
    b64=body[len(PREFIX)+1:].strip()
    if not re.fullmatch(r"[A-Za-z0-9+/=]+",b64) or len(b64)>80000:raise ValueError("Invalid encrypted payload")
    dec=SealedBox(private_key()).decrypt(base64.b64decode(b64,validate=True))
    z=zlib.decompressobj();raw=z.decompress(dec,120001)
    if not z.eof or z.unused_data or len(raw)>120000:raise ValueError("Invalid compressed payload")
    validate(raw)
    account=os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()
    s3=boto3.client("s3",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
    try:
        prior=s3.get_object(Bucket=BUCKET,Key=KEY)["Body"].read()
        if prior!=raw:raise ValueError("Existing review differs; no overwrite")
    except ClientError as e:
        if e.response.get("Error",{}).get("Code") not in ("NoSuchKey","404","NotFound"):raise
        s3.put_object(Bucket=BUCKET,Key=KEY,Body=raw,ContentType="application/json",CacheControl="private, no-store",Metadata={"sha256":EXPECTED,"review_only":"true","uploaded_at":datetime.now(timezone.utc).isoformat()})
    confirm=s3.get_object(Bucket=BUCKET,Key=KEY)["Body"].read()
    validate(confirm)
    if confirm!=raw:raise RuntimeError("Private R2 readback mismatch")
    print("PASS: private November 24 source verified, 6 tracks / 51 races / 430 horses / 50 ticket sequences; prescratch admin review.")
if __name__=="__main__":main()

"""Private receipt bridge. Never print source contents or paid predictions.
Run only in the existing scoped R2 secret environment:
  python scripts/pick_final_field_receipt_bridge.py pending DATE SLUG NOTICE_SHA256 NOTICE_RECEIVED_AT
  python scripts/pick_final_field_receipt_bridge.py verify PATH_TO_PRIVATE_PROOF_JSON
  python scripts/pick_final_field_receipt_bridge.py preflight PATH_TO_PRIVATE_CUSTOMER_CARD_JSON
The verify command publishes only the field receipt, not tickets.
The preflight command checks the current receipt and canonical data immediately
before a separately authorized Pick Ticket writer. Recheck before customer put.
For encrypted transfers use the existing output-only SealedBox route.
"""
import argparse,os,json,re,hashlib,subprocess
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
import boto3
from botocore.exceptions import ClientError
from pick_private_score_bridge import BUCKET,REPO

def need(ok,message):
    if not ok: raise ValueError(message)
def compact(v): return json.dumps(v,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
def sha(v): return hashlib.sha256(v).hexdigest()
def stamp(s): return datetime.fromisoformat(s.replace("Z","+00:00"))
def slug(s): return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
def main():
    a=argparse.ArgumentParser(); sub=a.add_subparsers(dest="command",required=True)
    p=sub.add_parser("pending");p.add_argument("date");p.add_argument("slug");p.add_argument("notice_sha256");p.add_argument("notice_received_at")
    for cmd in ("verify","preflight"):
        p=sub.add_parser(cmd);p.add_argument("file")
    args=a.parse_args()
    need(os.environ.get("GITHUB_REPOSITORY")==REPO and os.environ.get("GITHUB_REF")=="refs/heads/main","Unauthorized bridge")
    s=boto3.client("s3",endpoint_url="https://"+os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"].strip()+".r2.cloudflarestorage.com",region_name="auto",aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"].strip(),aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"].strip())
    def get(k,optional=False):
        try:
            o=s.get_object(Bucket=BUCKET,Key=k);return o["Body"].read(),o
        except ClientError as e:
            if optional and e.response["Error"]["Code"] in ("404","NoSuchKey","NotFound"):return None,None
            raise
    def key(d,t):
        need(bool(re.fullmatch(r"\d{4}-\d\d-\d\d",d)) and bool(re.fullmatch(r"[a-z0-9-]+",t)),"Bad key")
        need(d==datetime.now(timezone.utc).astimezone(ZoneInfo("America/New_York")).date().isoformat(),"Not today's racing date")
        return f"projections/qa/{d}/final-fields/{t}.json"
    def write(k,body,prior,approved):
        condition={"IfMatch":prior["ETag"]} if prior else {"IfNoneMatch":"*"}
        s.put_object(Bucket=BUCKET,Key=k,Body=body,ContentType="application/json",CacheControl="private,no-store",Metadata={"customer_publish_approved":str(approved).lower(),"content_sha256":sha(body)},**condition)
        need(get(k)[0]==body,"Receipt readback mismatch")
    if args.command=="pending":
        k=key(args.date,args.slug);old,prior=get(k,True)
        need(bool(re.fullmatch(r"[a-f0-9]{64}",args.notice_sha256)) and stamp(args.notice_received_at).utcoffset() is not None and stamp(args.notice_received_at)<=datetime.now(timezone.utc),"Bad latest notice")
        v={"schema_version":1,"status":"PENDING","race_date":args.date,"track_slug":args.slug,"latest_notice_sha256":args.notice_sha256,"latest_notice_received_at":args.notice_received_at}
        if old:
            previous=json.loads(old);t=stamp(previous["latest_notice_received_at"]);n=stamp(args.notice_received_at)
            need(n>=t and (n>t or previous["latest_notice_sha256"]==args.notice_sha256),"Stale/conflicting notice")
            if previous.get("status")=="PENDING" and previous["latest_notice_sha256"]==args.notice_sha256 and n==t: print("PICK_PENDING_ALREADY_SET");return
        write(k,compact(v),prior,False);print("PICK_PENDING_READBACK_PASS",args.date,args.slug);return
    with open(args.file,encoding="utf-8") as f: data=json.load(f)
    card=data if args.command=="preflight" else None
    d=card["date"] if card else data["race_date"];t=slug(card["track"] if card else data["track"])
    k=key(d,t);old,prior=get(k);existing=json.loads(old)
    proof=existing if card else data
    if card:need(prior["Metadata"].get("customer_publish_approved")=="true","No approved current receipt")
    else:
        need(existing["status"]=="PENDING" and existing["latest_notice_sha256"]==proof["latest_notice_sha256"] and stamp(existing["latest_notice_received_at"])==stamp(proof["latest_notice_received_at"]),"Latest notice changed or pending intake absent")
    bk=f"projections/dashboard/{d}/{t}.json";fk=f"projections/f4-ordered/{d}/{t}.json"
    b,_=get(bk);f,_=get(fk)
    subprocess.run(["node","scripts/verify_pick_final_release.mjs"],input=compact({"proof":proof,"dashboard":b.decode(),"ordered":f.decode(),**({"card":card} if card else {})}),check=True)
    need(get(k)[0]==old and get(bk)[0]==b and get(fk)[0]==f,"Concurrent field/notice update")
    if not card:write(k,compact(proof),prior,True);print("PICK_FINAL_FIELD_RECEIPT_READBACK_PASS",d,t)
    else:print("PICK_FINAL_FIELD_CUSTOMER_PREFLIGHT_PASS",d,t)
if __name__=="__main__":main()

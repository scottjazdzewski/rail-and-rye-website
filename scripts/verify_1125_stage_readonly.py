"""Read-only. Never changes R2, D1, live products or proprietary prediction data."""
import os,json,hashlib,boto3
from pathlib import Path
from botocore.exceptions import ClientError
B='rail-and-rye-private-cards';D='2026-11-25';DUE='2026-11-25T08:00:00Z'
s3=boto3.client('s3',endpoint_url='https://'+os.environ['TRI_CLOUDFLARE_ACCOUNT_ID'].strip()+'.r2.cloudflarestorage.com',region_name='auto',aws_access_key_id=os.environ['TRI_R2_ACCESS_KEY_ID'].strip(),aws_secret_access_key=os.environ['TRI_R2_SECRET_ACCESS_KEY'].strip())
def fetch(key):
    try:
        obj=s3.get_object(Bucket=B,Key=key)
        return obj['Body'].read(),obj.get('Metadata',{})
    except ClientError as e:
        if e.response.get('Error',{}).get('Code') in ('NoSuchKey','404','NotFound'):return None,{}
        raise
def need(value,message):
    if not value:raise AssertionError(message)
m=json.loads(Path('private-ingest/20261125/manifest.json').read_text())
need(m['date']==D and m['release_at']==DUE and len(m['tracks'])==9,'Incorrect release time or source manifest')
need(m['source_sha256']=='8a1538f5ced6efb2ced53013c1fc4bc01052a209c840091b45af6245460a0b13','Source ZIP checksum changed')
raw,_=fetch('projections/qa/'+D+'/staged-release.json')
need(raw,'Missing projections stage receipt')
proj=json.loads(raw)
need(proj['status']=='VERIFIED_STAGED' and proj['race_date']==D and proj['release_at']==DUE,'Projection receipt identity mismatch')
need(len(proj['tracks'])==9 and sum(x['races'] for x in proj['tracks'])==76 and sum(x['runners'] for x in proj['tracks'])==626,'Projection totals differ')
need(proj['source_sha256']==m['source_sha256'],'Source identity mismatch')
cards={}
for t in proj['tracks']:
    key='projections/dashboard/'+D+'/'+t['slug']+'.json'; fkey='projections/f4-ordered/'+D+'/'+t['slug']+'.json'
    c,meta=fetch(key);f,fmeta=fetch(fkey)
    need(c and f,'Missing projected card/F4 '+t['slug'])
    need(hashlib.sha256(c).hexdigest()==t['dashboard_sha256'] and hashlib.sha256(f).hexdigest()==t['ordered_sha256'],'Hash mismatch '+t['slug'])
    need(meta.get('release_at')==DUE and meta.get('customer_publish_approved')=='true' and fmeta.get('release_at')==DUE,'Incomplete stage metadata '+t['slug'])
    d=json.loads(c);model=json.loads(f)
    need(d['race_date']==D and d['track_name']==t['name'] and len(d['races'])==t['races'] and model['date']==D,'Wrong projected identity')
    need(sum(len(r['entries']) for r in d['races'])==t['runners'],'Wrong entrant total')
    need(all(abs(sum(e['win_probability_exact'] for e in r['entries'])-100)<1e-6 for r in d['races']),'PWIN mass invalid')
    cards[d['track_name']]=d
print('PROJECTIONS_R2_ACCEPTED: 9 tracks 76 races 626 scored entries 08:00 UTC. SHA/F4/PWIN readback PASS.',flush=True)
cat,_=fetch('projections/qa/'+D+'/staged-catalog-receipt.json')
if cat:
    row=json.loads(cat)
    need(row['race_date']==D and row['release_at']==DUE and row['source_sha256']==m['source_sha256'] and len(row['tracks'])==9,'Projection catalog queue receipt mismatch')
    need(all(t.get('id') and t.get('release_at')=='2026-11-25 08:00:00' for t in row['tracks']),'Projection catalog schedule missing')
    print('PROJECTIONS_CATALOG_QUEUED: 9 dated products scheduled for 08:00 UTC',flush=True)
else:
    print('PROJECTIONS_CATALOG_NOT_CONFIRMED: staged cards exist but catalog/D1 receipt not found',flush=True)
raw,meta=fetch('pick-tickets/staging/'+D+'/revision-0001.json')
need(raw and meta.get('stage_only')=='true' and meta.get('release_at')==DUE,'Pick stage not accepted')
picks=json.loads(raw)
need(len(picks['tracks'])==9 and sum(len(t['card']['sequences']) for t in picks['tracks'])==92,'Pick stage totals invalid')
prepared,_=fetch('pick-tickets/staging/'+D+'/prepared-0001.json')
need(prepared,'Pick catalog queue missing')
p=json.loads(prepared)
need(p['sha256']==hashlib.sha256(raw).hexdigest() and p['release_at']==DUE and len(p['tracks'])==9,'Pick catalog queue hash mismatch')
need(sum(t['sequence_count'] for t in p['tracks'])==92 and all(t.get('product_id') for t in p['tracks']),'Pick product registration incomplete')
print('PICK_TICKETS_CATALOG_QUEUED: 9 tracks, 92 sequences 08:00 UTC. Private stage R2 readback PASS.',flush=True)
for t in picks['tracks']:
    name=t['card']['track'];active=cards.get(name)
    if active:
        n=sum(len(r['entries']) for r in active['races'])
        print('ROSTER_COUNT: '+name+' original='+str(t['runners'])+' scored='+str(n)+' difference='+str(t['runners']-n),flush=True)
parx=cards.get('Parx Racing')
if parx:
    unassigned=[(r['race_number'],e['program_number']) for r in parx['races'] for e in r['entries'] if e['jockey']=='Not assigned']
    print('PARX_ORIGINAL_JOCKEY_HOLDS: '+str(len(unassigned))+' entries, races '+','.join(map(str,sorted(set(x[0] for x in unassigned)))),flush=True)
for label,key in [
 ('RADAR_REVIEW','intelligence/longshot-radar/review/'+D+'.json'),
 ('RADAR_CUSTOMER','racing-intelligence/product-tabs/longshot-radar/'+D+'.json'),
 ('TARGET_REVIEW','racing-intelligence/target-list-review/'+D+'/revision-0001.json'),
 ('TARGET_CUSTOMER','racing-intelligence/product-tabs/target-list/'+D+'.json')]:
    dat,meta=fetch(key)
    print(label+': '+('PRESENT' if dat else 'NOT_FOUND')+'; keys='+','.join(sorted(meta)),flush=True)
print('NOV25_R2_READONLY_AUDIT_COMPLETE',flush=True)
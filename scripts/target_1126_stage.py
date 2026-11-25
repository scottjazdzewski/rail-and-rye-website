"""Owner-approved November 26 Target List: immutable *private stage*, not customer publication.

Unseal the exact owner-reviewed, source-backed prescratch card; validate all scored
races and producer receipts, prepare the site's edition, and write an R2 staging
bundle for the scheduled 3 AM ET site reconciler. Never alter today's edition.
"""
import base64,hashlib,json,os,re,math,subprocess
from datetime import datetime,timezone
from pathlib import Path
from nacl.public import SealedBox
import boto3
from botocore.exceptions import ClientError
from target_list_private_review_bridge import private_key

REPO='scottjazdzewski/rail-and-rye-website';DAY='2026-11-26';DUE='2026-11-26T08:00:00Z'
BUCKET='rail-and-rye-private-cards';STAGE='intelligence/target-list/staging/'+DAY+'/revision-0001.json'; RECEIPT='intelligence/target-list/staging/'+DAY+'/qa-0001.json'
ZIP='20a001e4bbf88afb2701d6408e2cbfae63abb508cf18661d484e74d7f8ab0fc7';MODEL='bd8c38de63a4c6d055f654347e7eaabe9c7fdbedfd3ea75885b20b46a163158b';V41='de289a89bcb5d4759cd8255819149557640faee5787fc642e5e3d0725c346025'
EDITORIAL='88bcd5833097a02531581438beac8b215bc930545c5cd47763ead8cb30fa709f'
PACKET='7a660cd8b718802695e46105ffb493aed879e9bc5345bf7649b688ecec3d0daa'
TOTE=[(1,5),(2,5),(1,2),(3,5),(4,5),(1,1),(6,5),(7,5),(3,2),(8,5),(9,5),(2,1),(5,2),(3,1),(7,2),(4,1),(9,2),(5,1),(6,1),(7,1),(8,1),(9,1),(10,1),(12,1),(15,1),(20,1),(25,1),(30,1),(40,1),(50,1),(60,1),(80,1),(100,1)]
def need(ok,message):
 if not ok:raise ValueError(message)
def compact(x):return json.dumps(x,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
def sha(x):return hashlib.sha256(x).hexdigest()
def norm(x):return re.sub(r'[^a-z0-9]+',' ',str(x).lower()).strip()
def ml(value):
 m=re.fullmatch(r'(\d+)[-/](\d+)',str(value))
 need(m and int(m.group(2))>0,'Missing original North American ML')
 return int(m.group(1))/int(m.group(2))
def fair(p):
 need(math.isfinite(p) and 0<p<=100,'Scoring not a true PWIN')
 exact=100/p-1
 a,b=min(TOTE,key=lambda v:(abs(v[0]/v[1]-exact),v[0]/v[1]));return f'{a}/{b}'
def normalize_runner(source):
 return dict(program_number=source['program_number'],horse_name=source['horse_name'],morning_line=source['morning_line'],win_probability=round(float(source['win_probability_exact']),1),fair_odds=fair(float(source['win_probability_exact'])),trainer=source['trainer'],jockey=source['jockey'])
def stage():
 need(os.environ.get('GITHUB_REPOSITORY')==REPO,'Authorized repo only')
 now=datetime.now(timezone.utc)
 need(now<datetime.fromisoformat(DUE.replace('Z','+00:00')),'Cannot stage after release instant')
 sealed=Path('private-ingest/20261126/target.enc').read_text().strip()
 raw=SealedBox(private_key()).decrypt(base64.b64decode(sealed,validate=True))
 need(sha(raw)==PACKET,'Scored/edited packet hash mismatch')
 p=json.loads(raw)
 need(p['race_date']==DAY and p['revision']==1 and p['status']=='initial' and p['stage_only'] is True and p['release_at']==DUE,'Stage date/revision/state mismatch')
 need(p['source_zip_sha256']==ZIP and p['frozen_v1372_sha256']==MODEL and p['tri_v41_sha256']==V41 and p['editorial_sha256']==EDITORIAL,'Source/engine/editorial drift')
 need(p['card_state']=='PRESCRATCH' and p['editorial_policy']=='TARGET_LIST_PERMANENT_10PP_EVIDENCE_FIRST_V20261120','Policy or scratch state changed')
 receipts=p['source_receipts'];need(len(receipts)==6 and {x['track_code'] for x in receipts}=={'CD','DMR','FG','GP','LRL','WO'},'Missing entire scored track')
 need(sum(x['races'] for x in receipts)==56 and sum(x['runners'] for x in receipts)==488,'Whole-source field coverage differs')
 for x in receipts:
  need(x['receipt_status']=='PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME','T/J scoring gate held '+x['track_code'])
  need(x['tj_role_receipt']['permanent_tj_v4_policy_id']=='TRI_TJ_NEUTRAL_MEAN_V4_ALWAYS_ON' and x['tj_role_receipt']['permanent_v4_both_roles_before_pwin'] is True,'T/J verified evidence not permanent '+x['track_code'])
  need(x['max_mass_error']<1e-12,'Probability mass gate held '+x['track_code'])
  need(all(re.fullmatch('[0-9a-f]{64}',x[k]) for k in ('pdf_sha256','score_sha256','receipt_sha256')),'Missing source checksum')
 full={(norm(x['track']),x['race']):x for x in p['selected_race_full_fields']}
 targets=p['targets'];need(0<len(targets)<60 and len(full)==len(targets),'Editorial/full-scored race match')
 out=[];ids=set()
 for rank,t in enumerate(targets,1):
  key=(norm(t['track']),t['race_number'])
  need(key in full and key not in ids,'Duplicate or unscored selected race');ids.add(key)
  race=full[key];entries=race['runners'];need(len(entries)==race['field_count']>=3,'Field runners incomplete')
  need(abs(sum(float(e['win_probability_exact']) for e in entries)-100)<1e-7,'Full field mass not 100')
  unique={(e['program_number'],norm(e['horse_name'])):e for e in entries};need(len(unique)==len(entries),'Duplicate original saddlecloth')
  favorite=min(entries,key=lambda e:ml(e['morning_line']));tied=[e for e in entries if ml(e['morning_line'])==ml(favorite['morning_line'])]
  need(len(tied)==1,'Tied favorite: user adjudication required')
  need((favorite['program_number'],norm(favorite['horse_name']))==(t['favorite_program'],norm(t['favorite_name'])),'Morning-line favorite mismatch')
  attack=unique.get((t['attack_program'],norm(t['attack_name'])));need(attack and attack is not favorite,'ATTACK program not in scored field')
  pwin=float(attack['win_probability_exact']);base=float(favorite['win_probability_exact']);need(pwin-base>=10 and ml(attack['morning_line'])>ml(favorite['morning_line']) and ml(attack['morning_line'])>100/pwin-1,'10pp and original price gate failed')
  need(all(e.get('trainer') and e.get('jockey') and e['jockey']!='Not assigned' for e in [favorite,attack]),'Unassigned connection for selected horse')
  prose=t['analysis'];need(len(prose.split())>=22 and len(prose.split())<=100,'Missing short original analysis')
  need(t['attack_name'].casefold() in prose.casefold() and t['favorite_name'].casefold() in prose.casefold(),'Two-sided source explanation absent')
  need(not re.search(r'\b(TRI|Timeform|algorithm|model|ratings|that matters|the key here|what stands out)\b',prose,re.I),'Forbidden technical copy')
  out.append(dict(rank=rank,track=t['track'],race_number=t['race_number'],post_time_et=t['post_time_et'],distance=t['distance'],surface=t['surface'],conditions=t['conditions'],analysis=prose,favorite=normalize_runner(favorite),attack=normalize_runner(attack),scratches=[]))
 release=dict(schema_version=1,product_type='target_list',race_date=DAY,revision=1,status='initial',publication_mode='owner-approved-gpt',source={'editorial_sha256':EDITORIAL},targets=out)
 # Use the website's actual reader/validator in memory; don't expose private scores.
 node="""import {handleAdminTargetList,readTargetListEdition} from './src/target-list.js';let str='';for await(const c of process.stdin)str+=c;const p=JSON.parse(str);const o=new Map();const env={CARDS_BUCKET:{get:async key=>o.get(key)||null,list:async()=>({objects:[],truncated:false}),put:async(k,raw,opt)=>o.set(k,{text:async()=>raw,customMetadata:opt.customMetadata})}};const url=new URL('https://railandryeracing.com/api/admin/target-list');const req=new Request(url,{method:'POST',body:JSON.stringify(p)});const r=await handleAdminTargetList(req,env,url);if(r.status!==201)throw Error('Website rejected card '+await r.text());const ed=await readTargetListEdition(env,p.race_date);if(!ed||ed.targets.length!==p.targets.length)throw Error('Customer reader could not load card');"""
 proc=subprocess.run(['node','--input-type=module','-e',node],input=compact(release),capture_output=True)
 need(proc.returncode==0,'Actual site schema validation failed '+proc.stderr.decode(errors='replace')[-250:])
 doc=dict(schema_version=1,race_date=DAY,release_at=DUE,source_zip_sha256=ZIP,editorial_sha256=EDITORIAL,source_receipts=receipts,selected_race_full_fields=p['selected_race_full_fields'],targets=release['targets'],customer_edition=release,tied_favorite_holds=p['tied_favorite_holds'],source_jockey_holds=p['source_jockey_holds'])
 payload=compact(doc);digest=sha(payload)
 s=boto3.client('s3',region_name='auto',endpoint_url='https://'+os.environ['TRI_CLOUDFLARE_ACCOUNT_ID']+'.r2.cloudflarestorage.com',aws_access_key_id=os.environ['TRI_R2_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['TRI_R2_SECRET_ACCESS_KEY'])
 def get(key):
  try:
   obj=s.get_object(Bucket='rail-and-rye-private-cards',Key=key)
   return obj['Body'].read(),obj.get('Metadata',{})
  except ClientError as e:
   if e.response['Error']['Code'] in ('NoSuchKey','404','NotFound'):return None,{}
   raise
 prior,md=get(STAGE)
 need(prior is None or (prior==payload and md.get('sha256')==digest and md.get('stage_only')=='true' and md.get('release_at')==DUE),'Conflicting sealed stage already exists; not overwriting')
 if prior is None:
  s.put_object(Bucket=BUCKET,Key=STAGE,Body=payload,ContentType='application/json; charset=utf-8',CacheControl='private, no-store',Metadata={'stage_only':'true','release_at':DUE,'sha256':digest,'source_sha256':ZIP,'editorial_sha256':EDITORIAL})
 saved,m=get(STAGE);need(saved==payload and m.get('stage_only')=='true' and m.get('release_at')==DUE and m.get('sha256')==digest,'R2 staging failed readback')
 receipt=dict(status='STAGED_PRIVATE_READBACK_VERIFIED',race_date=DAY,release_at=DUE,source_sha256=ZIP,score_receipts=6,full_field_races=56,source_listed_runners=488,selected_races=len(out),stage_sha256=digest,editorial_sha256=EDITORIAL,staged_at=now.isoformat())
 proof=compact(receipt);older,_=get(RECEIPT)
 need(older is None or json.loads(older)['stage_sha256']==digest,'Conflicting original staging receipt')
 if older is None:
  s.put_object(Bucket=BUCKET,Key=RECEIPT,Body=proof,ContentType='application/json',CacheControl='private, no-store',Metadata={'sha256':sha(proof),'stage_only':'true','release_at':DUE})
 receipt_read,rm=get(RECEIPT);need(receipt_read and json.loads(receipt_read)['stage_sha256']==digest and rm.get('release_at')==DUE,'Staging receipt readback failed')
 print('TARGET_1126_PRIVATE_STAGE_PASS date='+DAY+' release_at='+DUE+' scored_tracks=6 races=56 source_horses=488 selected='+str(len(out))+' sha='+digest,flush=True)
if __name__=='__main__':
 try:stage()
 except Exception as e:raise SystemExit('TARGET_1126_STAGE_HOLD '+type(e).__name__+': '+str(e)[:210])
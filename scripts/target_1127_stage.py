"""Nov 27 Target List: sealed, source-certified owner-requested staging only.

No plaintext GitHub input, no score changes, no changes to Nov26 customer edition.
Cloudflare Worker will queue *only* when independent date-matched site
Projections agree on ALL selected field identities and displayed PWIN.
"""
import base64,hashlib,json,os,re,math,subprocess
from pathlib import Path
from datetime import datetime,timezone
import boto3
from botocore.exceptions import ClientError
from nacl.public import SealedBox
from target_list_private_review_bridge import private_key

DAY='2026-11-27'
DUE='2026-11-27T08:00:00Z'
REPO='scottjazdzewski/rail-and-rye-website'
BUCKET='rail-and-rye-private-cards'
STAGE=f'intelligence/target-list/staging/{DAY}/revision-0001.json'
QA=f'intelligence/target-list/staging/{DAY}/qa-0001.json'
SOURCE_SHA='c4f7b36d1b72f03ee8bcff3b022cd4740d4dbf0f190e218bc89cf9bf18504e06'
MODEL_SHA='bd8c38de63a4c6d055f654347e7eaabe9c7fdbedfd3ea75885b20b46a163158b'
V41_SHA='de289a89bcb5d4759cd8255819149557640faee5787fc642e5e3d0725c346025'
EDITORIAL_SHA='57b34cf130e4734821abd7bef714c9c9fc001bf80940f08f2e18e6cfe4e04b02'
PACKET_SHA='09b241953134f4e97234cd7c7a11909254871cb85f2f64a9f7df2c3565391bb5'
CODES=set('BEL CD CT DED DMR FG GP LRL OP PRX RP TAM TUP WO ZIA'.split())
TOTE=[(1,5),(2,5),(1,2),(3,5),(4,5),(1,1),(6,5),(7,5),(3,2),(8,5),(9,5),(2,1),(5,2),(3,1),(7,2),(4,1),(9,2),(5,1),(6,1),(7,1),(8,1),(9,1),(10,1),(12,1),(15,1),(20,1),(25,1),(30,1),(40,1),(50,1),(60,1),(80,1),(100,1)]

def sha(b):return hashlib.sha256(b).hexdigest()
def compact(x):return json.dumps(x,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def need(ok,msg):
 if not ok:raise ValueError(msg)
def norm(x):return re.sub(r'[^a-z0-9]+',' ',str(x).lower()).strip()
def ml(x):
 m=re.fullmatch(r'(\d+)[/-](\d+)',str(x).strip())
 need(m and int(m.group(2))>0,'Original source ML invalid')
 return int(m.group(1))/int(m.group(2))
def fair(percent):
 need(math.isfinite(percent) and 0<percent<=100,'PWIN must be positive and finite')
 x=100/percent-1
 a,b=min(TOTE,key=lambda pair:(abs(pair[0]/pair[1]-x),pair[0]/pair[1]))
 return f'{a}/{b}'
def published_runner(r):
 return {**{k:r[k] for k in ('program_number','horse_name','morning_line','trainer','jockey')},'win_probability':round(float(r['win_probability_exact']),1),'fair_odds':fair(float(r['win_probability_exact']))}
def validate(p):
 need(p['race_date']==DAY and p['revision']==1 and p['status']=='initial' and p['stage_only'] is True and p['release_at']==DUE and p['card_state']=='PRESCRATCH','Wrong dated stage or scratch status')
 need(p['source_zip_sha256']==SOURCE_SHA and p['frozen_v1372_sha256']==MODEL_SHA and p['tri_v41_sha256']==V41_SHA and p['editorial_sha256']==EDITORIAL_SHA,'Original source/scoring/editorial SHA differs')
 need(p['editorial_policy']=='TARGET_LIST_PERMANENT_10PP_EVIDENCE_FIRST_V20261120' and p['editorial_voice_lock']=='TARGET_LIST_EDITORIAL_VOICE_LOCK_V2_20261025','Editorial lock modified')
 receipts=p['source_receipts'];need(p['source_track_count']==15 and p['source_race_count']==134 and p['source_listed_runners']==1156,'Registered inventory mismatch')
 need(len(receipts)==15 and {x['track_code'] for x in receipts}==CODES,'15-track receipt coverage incomplete')
 need(sum(x['races'] for x in receipts)==134 and sum(x['runners'] for x in receipts)==1156,'Race/runner accounting mismatch')
 for r in receipts:
  proof=r['tj_role_receipt']
  need(r['receipt_status']=='PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME' and proof['permanent_tj_v4_policy_id']=='TRI_TJ_NEUTRAL_MEAN_V4_ALWAYS_ON' and proof['permanent_v4_both_roles_before_pwin'] is True and proof['exact_consumed_model_matrix_verified'] is True and proof['all_roles_complete'] is True and proof['trainer_jockey_roles_proven']==2*r['runners'],'Actual T/J role matrix held '+r['track_code'])
  need(r['max_mass_error']<1e-9 and all(re.fullmatch(r'[a-f0-9]{64}',r[k]) for k in ('pdf_sha256','score_sha256','receipt_sha256')),'Original scoring receipt held '+r['track_code'])
 targets=p['targets'];full={(norm(x['track']),x['race']):x for x in p['selected_race_full_fields']}
 need(0<len(targets)<=100 and len(targets)==len(full),'Duplicate/absent selected race')
 out=[];used=set()
 for rank,target in enumerate(targets,1):
  key=(norm(target['track']),target['race_number']);need(key in full and key not in used and target['rank']==rank,'Ranked selected race not scored');used.add(key)
  race=full[key];rows=race['runners'];need(len(rows)==race['field_count']>=3,'Partial selected race field')
  need(len({(x['program_number'],norm(x['horse_name'])) for x in rows})==len(rows),'Duplicate program/horse')
  need(abs(sum(x['win_probability_exact'] for x in rows)-100)<1e-6,'Win probabilities do not total 100')
  for rr in rows:need(0<rr['win_probability_exact']<=100 and rr['trainer'] and rr['jockey'] and ml(rr['morning_line'])>=0,'Invalid runner input')
  ordered=sorted(rows,key=lambda x:ml(x['morning_line']));fav=ordered[0]
  need(ml(ordered[0]['morning_line'])<ml(ordered[1]['morning_line']),'Tied lowest ML favorite requires hold')
  need((norm(fav['horse_name']),fav['program_number'])==(norm(target['favorite_name']),target['favorite_program']),'Wrong ML favorite')
  attack=next((x for x in rows if x['program_number']==target['attack_program'] and norm(x['horse_name'])==norm(target['attack_name'])),None)
  need(attack and attack is not fav,'Wrong source ATTACK')
  pct=attack['win_probability_exact'];need(pct-fav['win_probability_exact']>=10 and ml(attack['morning_line'])>ml(fav['morning_line']) and ml(attack['morning_line'])>100/pct-1,'ATTACK no longer qualifies on source PWIN/ML')
  need(fav['jockey']!='Not assigned' and attack['jockey']!='Not assigned','Chosen horse source jockey unassigned')
  prose=target['analysis'];need(22<=len(prose.split())<=100 and target['favorite_name'].casefold() in prose.casefold() and target['attack_name'].casefold() in prose.casefold(),'Incomplete two-sided independent race analysis')
  need(not any(x in prose.casefold() for x in ('timeform','model','algorithm','that matters','the key here','what stands out')),'Unapproved editorial writing')
  need(not target['post_time_et'],'No unverified Eastern post time may be carried forward; site provides actual post_time_et')
  out.append(dict(rank=rank,track=target['track'],race_number=target['race_number'],post_time_et='',surface=target['surface'],distance=target['distance'],conditions=target['conditions'],analysis=prose,favorite=published_runner(fav),attack=published_runner(attack),scratches=[]))
 customer=dict(schema_version=1,product_type='target_list',race_date=DAY,revision=1,status='initial',publication_mode='owner-approved-gpt',source={'editorial_sha256':EDITORIAL_SHA},targets=out)
 # Test the *actual* customer schema and R2 reader before any persistent write.
 js="""import {storeGPTReleasedTargetList,readTargetListEdition} from './src/target-list.js';import {webcrypto} from 'node:crypto';globalThis.crypto??=webcrypto;let s='';for await(const c of process.stdin)s+=c;const edition=JSON.parse(s);const map=new Map();const env={CARDS_BUCKET:{list:async()=>({objects:[],truncated:false}),get:async k=>map.get(k)||null,put:async(k,raw,opt)=>map.set(k,{customMetadata:opt.customMetadata,text:async()=>raw})}};const result=await storeGPTReleasedTargetList(env,edition);if(result.targets!==edition.targets.length)throw Error('Site validation wrong selection count');const reader=await readTargetListEdition(env,edition.race_date);if(!reader||reader.targets.length!==edition.targets.length)throw Error('Customer reader failed');"""
 run=subprocess.run(['node','--input-type=module','-e',js],input=compact(customer),capture_output=True)
 need(run.returncode==0,'Website schema/reader fails: '+(run.stderr.decode(errors='replace')[-600:]))
 return customer

def run():
 need(os.environ.get('GITHUB_REPOSITORY')==REPO,'Unauthorized repository')
 need(datetime.now(timezone.utc)<datetime.fromisoformat(DUE.replace('Z','+00:00')),'No longer before scheduled cutoff')
 ciphertext=Path('private-ingest/20261127/target.enc').read_text().strip()
 need(len(ciphertext)<200000 and re.fullmatch(r'[A-Za-z0-9+/=]+',ciphertext),'Malformed sealed source')
 raw=SealedBox(private_key()).decrypt(base64.b64decode(ciphertext,validate=True))
 need(sha(raw)==PACKET_SHA,'Original scored selection packet checksum changed')
 packet=json.loads(raw);customer=validate(packet)
 release={k:packet[k] for k in ('schema_version','race_date','release_at','source_zip_sha256','editorial_sha256','source_track_count','source_race_count','source_listed_runners','source_receipts','selected_race_full_fields','tied_favorite_holds','source_jockey_holds')}
 release.update({'targets':customer['targets'],'customer_edition':customer})
 body=compact(release);digest=sha(body)
 cf=os.environ['TRI_CLOUDFLARE_ACCOUNT_ID'].strip()
 s=boto3.client('s3',endpoint_url='https://'+cf+'.r2.cloudflarestorage.com',region_name='auto',aws_access_key_id=os.environ['TRI_R2_ACCESS_KEY_ID'].strip(),aws_secret_access_key=os.environ['TRI_R2_SECRET_ACCESS_KEY'].strip())
 def get(key):
  try:
   result=s.get_object(Bucket=BUCKET,Key=key)
   return result['Body'].read(),result.get('Metadata',{})
  except ClientError as e:
   if e.response.get('Error',{}).get('Code') in ('404','NoSuchKey','NotFound'):return None,{}
   raise
 prior,md=get(STAGE)
 need(prior is None or (prior==body and md.get('sha256')==digest and md.get('stage_only')=='true' and md.get('release_at')==DUE),'Different immutable Nov27 Target List already staged')
 if prior is None:
  s.put_object(Bucket=BUCKET,Key=STAGE,Body=body,ContentType='application/json; charset=utf-8',CacheControl='private,no-store',Metadata={'stage_only':'true','release_at':DUE,'sha256':digest,'source_sha256':SOURCE_SHA,'editorial_sha256':EDITORIAL_SHA})
 saved,meta=get(STAGE);need(saved==body and meta.get('sha256')==digest and meta.get('release_at')==DUE,'Private R2 stage readback failed')
 receipt={'status':'STAGED_PRIVATE_READBACK_VERIFIED','race_date':DAY,'release_at':DUE,'source_sha256':SOURCE_SHA,'source_track_count':15,'source_race_count':134,'source_listed_runners':1156,'selected_races':len(customer['targets']),'stage_sha256':digest,'editorial_sha256':EDITORIAL_SHA,'staged_at':datetime.now(timezone.utc).isoformat()}
 old,om=get(QA);need(old is None or json.loads(old).get('stage_sha256')==digest,'Immutable QA receipt conflicts')
 if old is None:
  qr=compact(receipt);s.put_object(Bucket=BUCKET,Key=QA,Body=qr,ContentType='application/json',CacheControl='private,no-store',Metadata={'stage_only':'true','release_at':DUE,'sha256':sha(qr)})
 check,m=get(QA);need(check and json.loads(check)['stage_sha256']==digest and m.get('release_at')==DUE,'Private QA receipt failed')
 print('TARGET_1127_PRIVATE_STAGE_PASS tracks=15 races=134 runners=1156 targets='+str(len(customer['targets']))+' release='+DUE+' stage_sha256='+digest,flush=True)
if __name__=='__main__':
 try:run()
 except Exception as ex:raise SystemExit('TARGET_1127_PRIVATE_STAGE_HOLD '+type(ex).__name__+': '+str(ex)[:350])
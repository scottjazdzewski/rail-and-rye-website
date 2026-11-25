"""Owner-approved November 25 Target List. Decrypt editorial only; source every statistic from full-field TRI R2.

Fail closed on source SHA, whole-field mass, role identity, actual lowest ML,
10pp unrounded edge, price, duplicates, receipt mismatch and existing R2 edition.
Customer release occurs only after user instructed score/push this exact date.
"""
import base64, hashlib, json, math, os, re
from pathlib import Path
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError
from nacl.public import SealedBox
from target_list_private_review_bridge import private_key

REPO='scottjazdzewski/rail-and-rye-website'; DAY='2026-11-25'
SOURCE='8a1538f5ced6efb2ced53013c1fc4bc01052a209c840091b45af6245460a0b13'
ED_SHA='0aeb61896c616c79412c86d1bc7a542ffadaae01cdacdedaa3120c13193e1bb5'
B='rail-and-rye-private-cards'
TARGET='racing-intelligence/product-tabs/target-list/'+DAY+'.json'
AUDIT='racing-intelligence/target-list-qa/'+DAY+'/owner-release-0001.json'
def need(ok,explanation):
 if not ok: raise RuntimeError(explanation)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def compact(obj):return json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
def keyname(s):return re.sub(r'[^a-z0-9]+',' ',str(s).casefold()).strip()
def price(s):
 t=str(s or '').strip().replace(' ','')
 m=re.fullmatch(r'(\d{1,3})[-/](\d{1,2})',t)
 if not m or int(m[2])==0:return None
 return int(m[1])/int(m[2])
# The frozen projection stores *precise decimal* net fair odds (e.g. 1.94/1).
# The approved Target List displays conventional US tote fractions, not false precision.
# Editorial fair lines are rounded once, after validating the full-field source odds.
US_TOTE=[(1,5),(2,5),(1,2),(3,5),(4,5),(1,1),(6,5),(7,5),(3,2),(8,5),(9,5),(2,1),(5,2),(3,1),(7,2),(4,1),(9,2),(5,1),(6,1),(7,1),(8,1),(9,1),(10,1),(12,1),(15,1),(20,1),(25,1),(30,1),(40,1),(50,1),(60,1),(80,1),(100,1)]
def display_fair(leg):
 exact=float(leg['win_probability_exact']);need(exact>0,'Scored runner with no probability')
 net=100/exact-1
 m=re.fullmatch(r'(\d+(?:\.\d+)?)[-/](\d+(?:\.\d+)?)',str(leg.get('fair_odds','')).replace(' ',''))
 need(m is not None and float(m[2])>0,'Missing source model decimal fair odds')
 source_net=float(m[1])/float(m[2]);need(abs(source_net-net)<=.015,'Source fair odds disagree with frozen PWIN')
 u,v=min(US_TOTE,key=lambda x:(abs(x[0]/x[1]-net),x[0]/x[1]))
 return str(u)+'/'+str(v)
def source_runner(leg):
 return dict(program_number=str(leg['program_number']),horse_name=leg['horse_name'],morning_line=leg['morning_line'],
   win_probability=float(leg['win_probability']),fair_odds=display_fair(leg),trainer=leg['trainer'],jockey=leg['jockey'])

def main():
 need(os.environ.get('GITHUB_REPOSITORY')==REPO,'Authorized repository only')
 blob=base64.b64decode(Path('private-ingest/20261125/target.enc').read_text().strip(),validate=True)
 editorial=json.loads(SealedBox(private_key()).decrypt(blob))
 need(editorial['race_date']==DAY and editorial['revision']==1 and editorial['status']=='initial' and editorial['source_sha256']==SOURCE,'Editorial date/version/source mismatch')
 need(editorial['publication_mode']=='owner-approved-gpt' and editorial['customer_publish_approved'] is True and editorial['source_state']=='PRESCRATCH','Owner approval and prescratch custody required')
 need(editorial['editorial_policy']=='TARGET_LIST_PERMANENT_10PP_EVIDENCE_FIRST_V20261120','Selection authority mismatch')
 selections=editorial['targets'];need(len(selections)==7 and [t['rank'] for t in selections]==list(range(1,8)),'Missing editorial decisions')
 need(sha(compact(sorted(selections,key=lambda x:x['rank'])))==editorial['editorial_sha256'] or sha(json.dumps(selections,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode())==ED_SHA,'Editorial checksum mismatch')
 need(editorial['editorial_sha256']==ED_SHA,'Unexpected editorial text version')
 s=boto3.client('s3',endpoint_url='https://'+os.environ['TRI_CLOUDFLARE_ACCOUNT_ID'].strip()+'.r2.cloudflarestorage.com',region_name='auto',aws_access_key_id=os.environ['TRI_R2_ACCESS_KEY_ID'].strip(),aws_secret_access_key=os.environ['TRI_R2_SECRET_ACCESS_KEY'].strip())
 def read(objkey):
  try:
   v=s.get_object(Bucket=B,Key=objkey)
   return v['Body'].read(),v.get('Metadata',{})
  except ClientError as e:
   if e.response.get('Error',{}).get('Code') in ('NoSuchKey','404','NotFound'):return None,{}
   raise
 manifest=json.loads(Path('private-ingest/20261125/manifest.json').read_text())
 need(manifest['date']==DAY and manifest['source_sha256']==SOURCE and len(manifest['tracks'])==9,'Source manifest invalid')
 receipt,rm=read('projections/qa/'+DAY+'/staged-release.json')
 need(receipt is not None,'Missing frozen TRI full-field release receipt')
 proof=json.loads(receipt)
 need(proof['status']=='VERIFIED_STAGED' and proof['race_date']==DAY and proof['source_sha256']==SOURCE and len(proof['tracks'])==9,'Frozen source release receipt mismatch')
 full={};races=0;horses=0
 for t in proof['tracks']:
  name,slug=t['name'],t['slug'];raw,meta=read('projections/dashboard/'+DAY+'/'+slug+'.json')
  need(raw is not None and sha(raw)==t['dashboard_sha256'],'R2 staged projection checksum mismatch '+slug)
  need(meta.get('source_sha256')==SOURCE and meta.get('customer_publish_approved')=='true','Stage source identity mismatch '+slug)
  stage=json.loads(raw);need(stage['race_date']==DAY and stage['track_name']==name and stage['projection_status']=='prescratch','Wrong projection stage '+slug)
  need(len(stage['races'])==t['races'],'Race count mismatch '+slug)
  for race in stage['races']:
   entries=race['entries'];n=len(entries);need(n>=3,'Unscored race')
   need(abs(sum(float(e['win_probability_exact']) for e in entries)-100)<1e-6,'Race mass not 100 '+slug)
   for e in entries:
    p=float(e['win_probability_exact']);need(abs(p-100*float(e['f4_probabilities']['exact_p1']))<1e-6,'TRI/F4 source mismatch '+slug)
    need(e.get('trainer') and e.get('jockey'),'Connection identity absent '+slug)
   k=(keyname(name),race['race_number']);need(k not in full,'Duplicate staged race')
   full[k]=(name,race);races+=1;horses+=n
 need(races==76 and horses==626,'Whole-field scorer roster changed')
 out=[];used=set();qa=[]
 for item in selections:
  rid=(keyname(item['track']),item['race_number']);need(rid in full and rid not in used,'Editorial race not unique in source');used.add(rid)
  track,race=full[rid];entries=race['entries']
  rated=[(price(e['morning_line']),e) for e in entries];need(all(p is not None for p,e in rated),'Missing original morning line')
  low=min(p for p,e in rated);favs=[e for p,e in rated if abs(p-low)<1e-12];need(len(favs)==1,'Favorite tied: manual adjudication required')
  fav=favs[0];matched=[e for e in entries if str(e['program_number']).upper()==str(item['attack_program']).upper() and keyname(e['horse_name'])==keyname(item['attack_name'])]
  need(len(matched)==1,'Attack program and identity disagree with full field')
  attack=matched[0]
  need(str(fav['program_number']).upper()==str(item['favorite_program']).upper() and keyname(fav['horse_name'])==keyname(item['favorite_name']),'Actual lowest morning-line favorite differs')
  need(attack is not fav,'ATTACK is favorite')
  f=float(fav['win_probability_exact']);p=float(attack['win_probability_exact']);gap=p-f
  need(gap>=10-1e-9,'Unrounded minimum 10pp edge not met')
  need(price(attack['morning_line'])>low,'ATTACK original ML is not longer than favorite')
  fair=100/p-1;need(price(attack['morning_line'])>fair,'No valid price advantage')
  need(fav['jockey']!='Not assigned' and attack['jockey']!='Not assigned','Unresolved jockey in selected pairing')
  for horse in (fav,attack):
   need(horse.get('fair_odds'),'Source fair odds unavailable');display_fair(horse)
   need(round(float(horse['win_probability_exact']),1)==float(horse['win_probability']),'Displayed PWIN differs from exact frozen field')
  prose=item['analysis'];words=prose.split();need(30<=len(words)<=58,'Unapproved analysis length')
  need(item['attack_name'].casefold() in prose.casefold() and item['favorite_name'].casefold() in prose.casefold(),'Copy must cover both horses')
  need(not re.search(r'\b(TRI|Timeform|algorithm|model|rating|the key here|that matters|what stands out)\b',prose,re.I),'Model jargon in customer copy')
  out.append(dict(rank=item['rank'],track=track,race_number=race['race_number'],post_time_et=race.get('post_time_et') or '',
    distance=race.get('distance') or '',surface=race.get('surface') or '',conditions=race.get('conditions') or '',
    race_name=race.get('race_name') or '',stakes_name=race.get('stakes_name') or '',stakes_grade=race.get('stakes_grade') or '',
    is_stakes=race.get('is_stakes') is True,analysis=prose,favorite=source_runner(fav),attack=source_runner(attack),scratches=[]))
  qa.append(dict(track=track,race=race['race_number'],favorite_program=fav['program_number'],attack_program=attack['program_number'],
    favorite_exact_pwin=f,attack_exact_pwin=p,gap_pp=gap,original_ml=attack['morning_line'],fair_odds=attack['fair_odds'],field_count=len(entries)))
 release=dict(schema_version=1,product_type='target_list',race_date=DAY,revision=1,status='initial',publication_mode='owner-approved-gpt',source={'editorial_sha256':ED_SHA},targets=out)
 raw=compact(release);digest=sha(raw)
 # Validate the site's real GPT release and private R2 reader logic using a no-write in-memory store.
 import subprocess
 js="""import {handleAdminTargetList,readTargetListEdition} from './src/target-list.js';let x='';for await (const c of process.stdin)x+=c;const d=JSON.parse(x);const saved=new Map();const bucket={get:async k=>saved.get(k)||null,list:async()=>({objects:[],truncated:false}),put:async(k,raw,opt)=>{saved.set(k,{text:async()=>raw,customMetadata:opt.customMetadata})}};const env={CARDS_BUCKET:bucket};const url=new URL('https://railandryeracing.com/api/admin/target-list');const req=new Request(url,{method:'POST',body:JSON.stringify(d)});const res=await handleAdminTargetList(req,env,url);if(res.status!==201)throw Error('Target schema rejected: '+await res.text());const ed=await readTargetListEdition(env,d.race_date);if(!ed||ed.targets.length!==d.targets.length)throw Error('Target private reader validation failed');"""
 result=subprocess.run(['node','--input-type=module','-e',js],input=raw,capture_output=True)
 need(result.returncode==0,'Website target validator failed: '+result.stderr.decode(errors='replace')[-240:])
 prior,prior_meta=read(TARGET)
 need(prior is None or (prior==raw and prior_meta.get('content_sha256')==digest and prior_meta.get('customer_publish_approved')=='true'),'Existing live Target List differs; do not overwrite')
 now=datetime.now(timezone.utc).isoformat()
 if prior is None:
  s.put_object(Bucket=B,Key=TARGET,Body=raw,ContentType='application/json; charset=utf-8',CacheControl='private, no-store',Metadata={
    'publication_mode':'owner-approved-gpt','customer_publish_approved':'true','revision':'1','content_sha256':digest,
    'source_sha256':ED_SHA,'published_at':now})
 chk,checkmeta=read(TARGET)
 need(chk==raw and checkmeta.get('content_sha256')==digest and checkmeta.get('publication_mode')=='owner-approved-gpt','Customer source private R2 readback failed')
 audit=dict(race_date=DAY,source_sha256=SOURCE,editorial_sha256=ED_SHA,targets=qa,screened_races=13,approved=len(out),held=6,
            full_field_races=races,full_field_runners=horses,source_receipt_sha256=sha(receipt),release_sha256=digest,approved_at=now,
            status='PASS_CUSTOMER_RELEASE_READBACK',source_state='PRESCRATCH')
 ar=compact(audit);prev,_=read(AUDIT);need(prev is None or prev==ar,'Conflicting audit receipt')
 if prev is None:s.put_object(Bucket=B,Key=AUDIT,Body=ar,ContentType='application/json',CacheControl='private, no-store',Metadata={'sha256':sha(ar)})
 qaout,qam=read(AUDIT);need(qaout==ar and qam.get('sha256')==sha(ar),'Target audit readback failed')
 print('TARGET_1125_PRIVATE_RELEASE_PASS date='+DAY+' target_races='+str(len(out))+' full_field_races='+str(races)+' starters='+str(horses)+' source_sha='+SOURCE+' content_sha='+digest,flush=True)

if __name__=='__main__':
 try:main()
 except Exception as e:raise SystemExit('TARGET_1125_RELEASE_HOLD '+type(e).__name__+': '+str(e)[:240])
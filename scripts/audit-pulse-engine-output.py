#!/usr/bin/env python3
"""Read-only integration QA against the housed TRI/F4 production output.
No scoring, private data publication, or remote writes. The actual Worker
selector runs with a memory-only bucket adapter; only aggregate counts leave
the runner. Do not upload the input or subprocess stdout as artifacts.
"""
import collections
import datetime
import json
import os
import re
import subprocess
from zoneinfo import ZoneInfo
import boto3

BUCKET = "rail-and-rye-private-cards"
NOW = datetime.datetime.now(ZoneInfo("America/New_York"))
DAY = (NOW.date() - datetime.timedelta(days=NOW.hour < 3)).isoformat()
DAYS = os.getenv("PULSE_ENGINE_AUDIT_DATES", DAY).split(",")
assert 1 <= len(DAYS) <= 7 and all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", day) for day in DAYS)
client = boto3.client("s3", region_name="auto",
    endpoint_url="https://" + os.environ["TRI_CLOUDFLARE_ACCOUNT_ID"] + ".r2.cloudflarestorage.com",
    aws_access_key_id=os.environ["TRI_R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["TRI_R2_SECRET_ACCESS_KEY"])
JS = """
import fs from 'node:fs';
import path from 'node:path';
import {readRaceDayPulse} from './src/race-day-pulse.js';
const {date,now,objects}=JSON.parse(fs.readFileSync(0,'utf8'));
const map=new Map(objects.map(x=>[x.key,x]));
const counts={dashboard_tracks:0,original_tracks:0,final_tracks:0,paired_tracks:0,final_without_baseline:0,unverified_lineage:0,certified_lineage:0,active_field_changes:0,eligible_items:0};
const hash=/^[a-f0-9]{64}$/i;
for(const [key,v] of map){
  if(key.startsWith('race-day-pulse/prescratch/')){counts.original_tracks++;continue;}
  if(!key.startsWith('projections/dashboard/'))continue;
  counts.dashboard_tracks++;
  const c=v.card;
  if(c?.projection_status!=='scratch_final')continue;
  counts.final_tracks++;
  const old=map.get(key.replace('projections/dashboard/','race-day-pulse/prescratch/'))?.card;
  if(!old){counts.final_without_baseline++;continue;}
  counts.paired_tracks++;
  const original=old.model_receipts||{},receipts=c.model_receipts||{},proof=c.parent_replay_proof||{},stored=proof.stored_parent_receipts;
  const direct=hash.test(original.f4_sha256||'')&&original.f4_sha256===receipts.prescratch_parent_sha256;
  const replay=stored&&Object.keys(stored).length===Object.keys(original).length&&Object.entries(original).every(([k,v])=>stored[k]===v)&&hash.test(proof.replay_tri_sha256||'')&&proof.replay_f4_sha256===receipts.prescratch_parent_sha256;
  if(!(direct||replay))counts.unverified_lineage++;else counts.certified_lineage++;
  const prev=new Map((old.races||[]).map(r=>[r.race_number,r]));
  for(const race of c.races||[]){const p=prev.get(race.race_number);if(!p)continue;const a=new Set((p.entries||[]).map(e=>String(e.program_number)));if((race.entries||[]).some(e=>!a.has(String(e.program_number))))counts.active_field_changes++;}
}
const bucket={
  async list({prefix}){return {objects:[...map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key,uploaded:new Date(map.get(key).uploaded||now)})),truncated:false};},
  async get(key){const o=map.get(key);return o?{etag:o.etag,customMetadata:o.metadata||{},async json(){return o.card;}}:null;},
  async put(key,body,options){if(!key.startsWith('race-day-pulse/public/'))throw Error('Unexpected simulated write');map.set(key,{card:JSON.parse(body),metadata:options.customMetadata,etag:'memory-only'});return {etag:'memory-only'};}
};
const result=await readRaceDayPulse({CARDS_BUCKET:bucket},now);
if(result.date!==date||result.status!=='ok')throw Error('Worker integration audit failed');
const byKind={};
for(const item of result.items){if(item.date!==date||item.id.startsWith('demo-')||!item.hub_url?.startsWith('/intelligence/race-cards/'))throw Error('Invalid public output');if(/model_receipts|f4_probabilities|parent_replay_proof|win_probability_exact/.test(JSON.stringify(item)))throw Error('Private field leak');byKind[item.kind]=(byKind[item.kind]||0)+1;}
counts.eligible_items=result.items.length;
// Explicit private rehearsal only: ephemeral, sanitized output for browser rendering.
// Never export the source objects, receipts, or full runner matrices.
if(process.env.PULSE_PRIVATE_REHEARSAL_DIR){
 const dir=process.env.PULSE_PRIVATE_REHEARSAL_DIR;
 fs.writeFileSync(path.join(dir,date+'.json'),JSON.stringify(result),{mode:0o600});
}
console.log(JSON.stringify({date,...counts,byKind}));
"""
for day in DAYS:
    objects = []
    for prefix in ("projections/dashboard/", "race-day-pulse/prescratch/"):
        root = prefix + day + "/"
        for page in client.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=root):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if not re.fullmatch(r"[a-z0-9-]+\.json", key[len(root):]):
                    continue
                response = client.get_object(Bucket=BUCKET, Key=key)
                body = response["Body"].read(2_000_001)
                if len(body)>2_000_000: raise RuntimeError("Source object exceeds QA budget")
                objects.append({"key":key,"card":json.loads(body),"metadata":response.get("Metadata",{}),"etag":response.get("ETag","").strip('"'),"uploaded":obj["LastModified"].isoformat()})
    # Replay at end of historical racing day, not after the next 3am rollover.
    instant = NOW if day == DAY else datetime.datetime.combine(datetime.date.fromisoformat(day),datetime.time(23,59),tzinfo=NOW.tzinfo)
    p = subprocess.run(["node","--input-type=module","-e",JS],input=json.dumps({"date":day,"now":int(instant.timestamp()*1000),"objects":objects}),text=True,capture_output=True)
    if p.returncode: raise RuntimeError("Worker integration QA failed; private subprocess output suppressed")
    report=json.loads(p.stdout)
    print("PULSE_ENGINE_AUDIT "+json.dumps(report,sort_keys=True))

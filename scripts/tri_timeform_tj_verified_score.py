#!/usr/bin/env python3
"""Mandatory daily TimeformUS -> verified sidecar -> frozen TRI V4.1 launcher.

Never uses guessed names/ratings or edits original PDFs/frozen model.
Only a fully source-PASS track can execute a full-track frozen scoring run;
held race numbers remain in the gate receipt for optional separately sourced reruns.
Does not publish, stage, or alter customer data by itself.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from tri_timeform_tj_reconcile import repair
from tri_timeform_tj_reconcile_gate import reconcile

REQUIRED_STATUS = "PASS_TRI_TJ_V4_PERMANENT_FORWARD_RUNTIME"
REQUIRED_POLICY = "TRI_TJ_NEUTRAL_MEAN_V4_ALWAYS_ON"


def run(args):
    result_root=args.out_dir.resolve();result_root.mkdir(parents=True, exist_ok=True)
    verified=result_root/"verified_source"
    repair(args.roster,args.source_dir,args.sidecars_dir,verified,args.race_date)
    audit=reconcile(verified/"source_roster_reconciled.json",args.source_dir,verified/"sidecars",args.race_date)
    (result_root/"tri_tj_lock_receipt.json").write_text(json.dumps(audit,indent=2)+"\n",encoding="utf-8")
    if audit['neutral_policy']!=REQUIRED_POLICY:raise RuntimeError('Wrong locked neutral policy')
    engine=args.engine_dir.resolve()
    runtime=args.runtime_zip.resolve()
    if not (engine/'CODE/score_current_runtime_v1_3_7.py').is_file() or not runtime.is_file():
        raise RuntimeError('Canonical promoted TRI source/runtime missing')
    accepted=[];held=[];scorer_results={}
    for code,track in sorted(audit['tracks'].items()):
        if track['status']!='PASS':
            held.append({'track':code,'held_races':track['held_races'],'reason':'T/J roles not fully source-verified in complete track. Do not use earlier scores.'})
            continue
        pdfs=sorted(args.source_dir.glob(f'*TFUS{code}99.pdf'))
        if len(pdfs)!=1:raise RuntimeError(f'Missing/ambiguous TimeformUS PDF for {code}')
        isolated=result_root/'source_by_track'/code
        isolated.mkdir(parents=True,exist_ok=True)
        link=isolated/pdfs[0].name
        if link.exists() or link.is_symlink():
            if link.resolve()!=pdfs[0].resolve():raise RuntimeError('Source symlink collision')
        else:link.symlink_to(pdfs[0].resolve())
        sidecar=verified/'sidecars'/code
        prefix=result_root/'scores'/code
        prefix.parent.mkdir(parents=True,exist_ok=True)
        cmd=[sys.executable,'CODE/score_current_runtime_v1_3_7.py',str(isolated),
             '--runtime-zip',str(runtime),
             '--card-connections-json',str(sidecar/'card_connections.json'),
             '--connections-jsonl',str(sidecar/'connections.jsonl'),
             '--person-ratings-jsonl',str(sidecar/'person_registry.jsonl'),
             '--out',str(prefix)+'-pwin.csv',
             '--receipt',str(prefix)+'-receipt.json',
             '--audit-out',str(prefix)+'-audit.csv',
             '--features-out',str(prefix)+'-features.csv',
             '--raw-features-out',str(prefix)+'-raw.csv',
             '--model-scores-out',str(prefix)+'-scores.csv']
        completed=subprocess.run(cmd,cwd=engine,text=True,capture_output=True,timeout=args.timeout)
        (result_root/'scores'/f'{code}-score.log').write_text(completed.stdout+'\n'+completed.stderr)
        if completed.returncode:
            held.append({'track':code,'reason':'Canonical frozen scoring failed; see local log.'})
            continue
        receipt=json.loads(Path(str(prefix)+'-receipt.json').read_text())
        proof=receipt.get('permanent_tj_v4_role_proof') or {}
        if receipt.get('status')!=REQUIRED_STATUS or proof.get('permanent_policy_id')!=REQUIRED_POLICY or \
           proof.get('all_roles_complete') is not True or proof.get('exact_consumed_model_matrix_verified') is not True or \
           proof.get('trainer_jockey_roles_proven')!=2*track['runners'] or receipt.get('starters')!=track['runners'] or \
           receipt.get('source_to_consumed_model_score_parity')!='PASS':
            held.append({'track':code,'reason':'Frozen scoring receipt did not reconcile full 79-feature trainer/jockey input.'})
            continue
        accepted.append(code)
        scorer_results[code]={'runners':track['runners'],'roles':proof['trainer_jockey_roles_proven'],
             'pwin_sha256':hashlib.sha256(Path(str(prefix)+'-pwin.csv').read_bytes()).hexdigest(),
             'source_pdf_sha256':track['source_pdf_sha256']}
        print(f'VERIFIED_TRI_PASS {code} {track["runners"]} runners',flush=True)
    report={'race_date':args.race_date,'source_gate_id':audit['lock_id'],
            'tracks_scored':accepted,'held':held,'results':scorer_results,
            'model_coefficients_unchanged':True,'publishing_enabled':False}
    (result_root/'source_to_tri_scoring_run_receipt.json').write_text(json.dumps(report,indent=2)+"\n",encoding='utf-8')
    print(f'VERIFIED_TRI_FINAL: {len(accepted)} scored tracks, {len(held)} held, not published.',flush=True)
    return 0 if not held else 2


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--roster',type=Path,required=True)
    p.add_argument('--source-dir',type=Path,required=True)
    p.add_argument('--sidecars-dir',type=Path,required=True)
    p.add_argument('--engine-dir',type=Path,required=True)
    p.add_argument('--runtime-zip',type=Path,required=True)
    p.add_argument('--race-date',required=True)
    p.add_argument('--out-dir',type=Path,required=True)
    p.add_argument('--timeout',type=int,default=420)
    args=p.parse_args()
    return run(args)

if __name__=='__main__':raise SystemExit(main())
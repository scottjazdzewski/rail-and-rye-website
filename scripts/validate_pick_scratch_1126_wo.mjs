import fs from 'node:fs';
import assert from 'node:assert/strict';
import {normalizePickTickets,requireCustomerPickPwin} from '../src/pick-tickets.js';
import {approvedPrivateAdditions,validateLockedSelection} from '../src/pick-tickets-output-validation.js';
const {parent,current,batch}=JSON.parse(fs.readFileSync('/tmp/rr-pick-1126-wo-input.json','utf8'));
const row=batch.tracks[0],c=row.card,base=normalizePickTickets(parent.card),old=normalizePickTickets(current),sorted=x=>[...x].sort(),eq=(a,b)=>assert.deepEqual(a,b);
eq(old,base);eq(c.post_times_by_race,parent.card.post_times_by_race);
const scr={'2':['4'],'3':['1'],'4':['5','6'],'8':['9']};
eq(c.scratches_by_race,scr);
const activated={};
const map=new Map();let count=0;
for(let n=1;n<=8;n++){
 const k=String(n),prior=parent.runner_pwin[k],now=row.runner_pwin[k];
 assert.ok(prior&&now);
 const oldBy=new Map(prior.map(e=>[e[0],e])),newBy=new Map(now.map(e=>[e[0],e]));
 const removed=(scr[k]||[]).filter(p=>oldBy.has(p));
 eq(sorted(newBy.keys()),sorted([...oldBy.keys()].filter(p=>!removed.includes(p)).concat(Object.keys(activated[k]||{}))));
 eq(newBy.size,now.length);
 for(const e of now){assert.ok(typeof e[2]==='number'&&e[2]>=0&&e[2]<=1&&Math.abs(e[2]-e[3])<1e-12);eq(e[1],oldBy.get(e[0])?.[1]??activated[k]?.[e[0]]);}
 assert.ok(Math.abs(now.reduce((a,e)=>a+e[2],0)-1)<1e-10);
 if(!scr[k]&&n!==7)for(const e of now)assert.ok(Math.abs(oldBy.get(e[0])[2]-e[2])<1e-10,'Unchanged race score mismatch');
 map.set(n,newBy);count+=now.length;
}
eq(count,61);
const additions=approvedPrivateAdditions(row,batch.source_archive_sha256);eq(additions.size,0);
eq(c.sequences.length,base.sequences.length);
const classes={PLAY:0,CONDITIONAL:0,PASS:0};
for(let i=0;i<c.sequences.length;i++){
 const a=base.sequences[i],s=c.sequences[i];eq([s.name,s.start_race,s.end_race],[a.name,a.start_race,a.end_race]);eq(s.tickets.length,1);
 eq(s.tickets[0].unit_cents,a.tickets[0].unit_cents);eq(s.tickets[0].title,a.tickets[0].title);eq(s.tickets[0].role,a.tickets[0].role);
 eq(s.race_fields.map(f=>f.race_number),a.race_fields.map(f=>f.race_number));
 const legs=s.race_fields.map(f=>{const field=map.get(f.race_number);eq(sorted(f.programs),sorted(field.keys()));const p=s.review_probabilities[String(f.race_number)];eq(sorted(Object.keys(p)),sorted(field.keys()));for(const k of f.programs)assert.ok(Math.abs(p[k]-100*field.get(k)[2])<1e-9);return {race_number:f.race_number,entries:f.programs.map(k=>({program_number:k,pwin:p[k]/100}))};});
 validateLockedSelection(legs,s,additions.get(i));classes[s.play_status]++;
}
eq(classes,{PLAY:5,CONDITIONAL:4,PASS:0});
const final=requireCustomerPickPwin(normalizePickTickets(c));
fs.writeFileSync('/tmp/rr-pick-1126-wo-output.json',JSON.stringify(final));
console.log('NOV26_WO_PICK_TICKET_VALIDATION_PASS',JSON.stringify({runners:count,sequences:c.sequences.length,classes}));

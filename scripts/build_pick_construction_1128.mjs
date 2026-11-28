import fs from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {normalizePickTickets,requireCustomerPickPwin,readPublishedPickTicketCards} from '../src/pick-tickets.js';
globalThis.crypto??=webcrypto;
const d=JSON.parse(fs.readFileSync(0,'utf8')),sha=x=>createHash('sha256').update(x).digest('hex'),need=(v,m)=>{if(!v)throw Error(m)};
const base=requireCustomerPickPwin(normalizePickTickets(d.stageCard)),prior=requireCustomerPickPwin(normalizePickTickets(JSON.parse(d.prior)));
need(JSON.stringify(base)===JSON.stringify(prior),'Current edition differs from stage');
const card=structuredClone(base);card.revision=2;
for(const [name,i,start,end,unit,old,picks,classification] of d.rows){
 const s=card.sequences[i],t=s?.tickets[0];need(name===card.track&&s.start_race===start&&s.end_race===end&&[5,6].includes(end-start+1)&&t.unit_cents===unit&&JSON.stringify(t.legs.map(l=>l.programs))===JSON.stringify(old),'Exact prior ticket identity');
 let combinations=1,hit=1;
 for(let j=0;j<picks.length;j++){
  const p=picks[j],rn=start+j,field=s.review_probabilities[String(rn)];
  need(Array.isArray(p)&&p.length&&new Set(p).size===p.length&&p.every(k=>Object.hasOwn(field,k)),'Inactive or duplicate runner');
  const mass=p.reduce((sum,k)=>sum+field[k]/100,0);
  need(p.length!==1||mass>=.4,'Single below floor');hit*=mass;combinations*=p.length;
 }
 need(picks.length===end-start+1&&combinations*unit<=t.total_cents,'Budget or length violation');
 need(['PLAY','CONDITIONAL','PASS'].includes(classification)&&!(s.play_status==='PASS'&&classification!=='PASS'),'Invalid class change');
 s.play_status=classification;s.hit_rate_display=t.hit_rate_display=(hit*100).toFixed(1)+'%';t.combinations=combinations;t.total_cents=unit*combinations;t.legs=picks.map((programs,j)=>({race_number:start+j,programs}));
}
const customer=JSON.stringify(requireCustomerPickPwin(normalizePickTickets(card)));
const approval=JSON.stringify({kind:'OWNER_APPROVED_INITIAL_CONSTRUCTION_1128',date:card.date,track:card.track,revision:2,stage_sha256:d.stageHash,source_input_sha256:card.source_input_sha256,customer_sha256:sha(customer),parent_customer_sha256:sha(d.prior),changed_sequences:d.rows.length});
const meta={customer_publish_approved:'true',publication_mode:'owner-approved-gpt',revision:'2',source_sha256:card.source_input_sha256,content_sha256:sha(customer),initial_stage_sha256:d.stageHash,staged_release_at:d.release,construction_approval_sha256:sha(approval)};
const key='racing-intelligence/product-tabs/pick-tickets/'+card.date+'/'+d.slug+'.json',ak='pick-tickets/construction-revisions/'+card.date+'/'+d.slug+'/approved-0002.json';
const env={CARDS_BUCKET:{list:async()=>({objects:[{key}]}),get:async k=>k===key?{customMetadata:meta,text:async()=>customer}:k===ak?{customMetadata:{customer_publish_approved:'true'},text:async()=>approval}:null}};
const accepted=await readPublishedPickTicketCards(env,card.date);need(accepted.length===1&&accepted[0].revision===2,'Customer reader rejected corrected edition');
console.log(JSON.stringify({customer,approval,meta}));

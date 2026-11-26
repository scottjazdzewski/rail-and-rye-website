// Publication-side structural verification ONLY. No odds/market inference or market constructor here.
// The owner-authorized private source transfer authenticates the audit and frozen model receipt.
// The public Worker independently checks V3.4 baseline, at most one explicitly approved add,
// complete unchanged TRI fields, ticket arithmetic and unchanged SQR. All evidence stays private.
import {chooseV34} from "./pick-tickets-v34.js";
import {sequenceQuality} from "./pick-tickets-sqr.js";
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
const hash=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const timestamp=x=>typeof x==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(x)&&Number.isFinite(Date.parse(x));
export function approvedPrivateAdditions(row,sourceArchiveSha256){
 const p=row.market_assistance;if(p===undefined)return new Map();
 const c=row.card;
 check(p&&p.schema==="RR_PICK_PRIVATE_MARKET_ASSIST_V1"&&p.version==="V3.5-MARKET-ASSISTED-TRIAL-1"&&p.operator_approved===true,"Private addition not authorized");
 check(p.date===c.date&&p.track===c.track&&p.revision===c.revision&&p.source_input_sha256===c.source_input_sha256&&hash(p.source_input_sha256)&&p.source_archive_sha256===sourceArchiveSha256&&hash(sourceArchiveSha256),"Private addition source binding");
 check(p.tri_sha256===c.model_receipts?.tri_sha256&&p.f4_sha256===c.model_receipts?.f4_sha256&&hash(p.tri_sha256)&&hash(p.f4_sha256),"Private addition scorer identity");
 check([p.market_packet_sha256,p.market_run_receipt_sha256,p.private_audit_sha256,p.model_sha256?.steam25,p.model_sha256?.drift20].every(hash),"Private addition receipt missing");
 check(timestamp(p.as_of_utc)&&p.as_of_utc.slice(0,10)<=c.date,"Private addition timestamp invalid");
 if(c.status==="scratch_updated")check(Number.isFinite(Date.parse(c.scratch_verified_at))&&Date.parse(p.as_of_utc)>=Date.parse(c.scratch_verified_at),"Private addition predates scratch update");
 check(Array.isArray(p.approved_changes)&&p.approved_changes.length>0&&p.approved_changes.length<=c.sequences.length,"Private addition inventory");
 const additions=new Map();
 for(const a of p.approved_changes){
  check(Number.isSafeInteger(a.sequence_index)&&a.sequence_index>=0&&a.sequence_index<c.sequences.length&&!additions.has(a.sequence_index)&&Number.isSafeInteger(a.race_number)&&/^[0-9]{1,2}[A-Z]?$/.test(a.program),"Duplicate or invalid private addition");
  const s=c.sequences[a.sequence_index];
  check(a.race_number>=s.start_race&&a.race_number<=s.end_race&&s.race_fields.some(f=>f.race_number===a.race_number&&f.programs.includes(a.program)),"Private addition outside source field");
  additions.set(a.sequence_index,a);
 }
 return additions;
}
export function validateLockedSelection(legs,s,addition){
 const t=s.tickets[0],base=chooseV34(legs,t.unit_cents);
 let expected=base.picks.map(p=>[...p]);
 if(addition){
  const i=legs.findIndex(l=>l.race_number===addition.race_number);
  check(i>=0&&!expected[i].includes(addition.program)&&legs[i].entries.some(e=>e.program_number===addition.program),"Private addition is not an omitted active interest");
  expected[i].push(addition.program);
 }
 check(equal(expected,t.legs.map(l=>l.programs)),"Locked constructor / approved single-addition mismatch");
 let n=1,h=1;
 for(let i=0;i<legs.length;i++){
  const by=new Map(legs[i].entries.map(e=>[e.program_number,e.pwin]));
  n*=expected[i].length;h*=expected[i].reduce((p,k)=>p+by.get(k),0);
 }
 const cents=n*t.unit_cents,q=sequenceQuality(legs,{hit_probability:h,total_cents:cents}),shown=(100*h).toFixed(1)+"%";
 check(n===t.combinations&&cents===t.total_cents&&shown===t.hit_rate_display&&shown===s.hit_rate_display&&q.classification===s.play_status,"Ticket cost/hit/SQR mismatch");
 return {combinations:n,total_cents:cents,hit_probability:h,quality:q,added:!!addition};
}

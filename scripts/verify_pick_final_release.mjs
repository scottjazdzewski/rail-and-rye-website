// CLI for every direct R2 Pick Tickets publisher. Inputs remain private.
import fs from "node:fs";
import {normalizePickTickets,requireCustomerPickPwin} from "../src/pick-tickets.js";
import {verifyFinalFieldReceipt,requireFinalPickField,finalFieldReceiptKey,digest} from "../src/pick-final-field-gate.js";
let raw="";for await(const c of process.stdin)raw+=c;
const x=JSON.parse(raw),p=x.proof,b=JSON.parse(x.dashboard),f=JSON.parse(x.ordered);
if(await digest(x.dashboard)!==p.dashboard_sha256||await digest(x.ordered)!==p.ordered_sha256)throw Error("Canonical receipt hash mismatch");
const field=verifyFinalFieldReceipt(p,b,f);
if(Date.now()-field.verifiedAt>30*60*1000)throw Error("Official source must be rechecked before release");
if(x.card){
 const card=requireCustomerPickPwin(normalizePickTickets(x.card));
 const key=finalFieldReceiptKey(card.date,card.track);
 const obj=text=>({text:async()=>text,customMetadata:{customer_publish_approved:"true"}});
 const env={CARDS_BUCKET:{get:async k=>k===key?obj(JSON.stringify(p)):k.includes("/dashboard/")?obj(x.dashboard):obj(x.ordered)}};
 await requireFinalPickField(env,card);
}
console.log(x.card?"PICK_DIRECT_RELEASE_PREFLIGHT_PASS":"FINAL_FIELD_RECEIPT_PREFLIGHT_PASS");

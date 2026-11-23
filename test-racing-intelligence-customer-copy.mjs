import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Permanent publication copy contract. Keep underlying data/schema status
// fields intact; the rule applies to customer-facing presentation only.
const pages=[
 "public/admin/projections-preview.html",
 "public/admin/pick-tickets-preview.html",
 "public/admin/longshot-radar.html",
 "public/admin/target-list-preview.html",
 "public/membership/dashboard/index.html"
];
const renderers=[
 "public/assets/projections-dashboard.js",
 "public/assets/pick-tickets-dashboard.js",
 "public/assets/longshot-radar.js",
 "public/assets/target-list-dashboard.js"
];
const forbidden=[
 /\binitial\s*[·:|/—-]\s*current\b/i,
 /\bscratch[ -]?updated\s*[·:|/—-]\s*current\b/i,
 /\b(?:pre[ -]?scratch|prescratch)\b/i,
 /\bpreliminary\b/i,
 /\b(?:pre[- ]?scratch|prescratch)\s*[-·|:/—]*\s*current\b/i,
 /\b(?:initial|preliminary|prescratch)\s*[·|:/—-]\s*current\b/i,
 /\bCURRENT\b/,
 /\bmodel review\b/i,
 /\btest window\b/i,
 /\bprivate (?:preview|design review|editorial review)\b/i,
 /\bcustomer access off\b/i,
 /\bcertified source ticket\b/i,
 /\bproduction receipt\b/i,
 /\bnot scorer-certified\b/i,
 /\bsource received\b/i,
 /\btickets on hold\b/i
];
function visibleSourceStrings(js){
 // Scan quoted JS string literals (rather than every source-code token) to
 // avoid treating legitimate status keys such as "prescratch" as UI labels.
 const result=[];
 let i=0,line=1;
 const skipQuoted=(quote,start)=>{
  let value="";
  for(i++;i<js.length;i++){
   const c=js[i];
   if(c==="\\"){value+=js[i+1]||"";i++;continue}
   if(c===quote){i++;return value;}
   if(c==="\n")line++;
   value+=c;
  }
  throw Error("Unterminated string on line "+start);
 };
 while(i<js.length){
  const c=js[i],n=js[i+1];
  if(c==="\n"){line++;i++;continue;}
  if(c==="/"&&n==="/"){
   i+=2;while(i<js.length&&js[i]!=="\n")i++;continue;
  }
  if(c==="/"&&n==="*"){
   i+=2;while(i<js.length&&!(js[i]==="*"&&js[i+1]==="/")){if(js[i]==="\n")line++;i++;}
   i+=2;continue;
  }
  if(c==='"'||c==="'"||c==="`"){
   const start=line,raw=skipQuoted(c,start);
   result.push({start,raw});
   continue;
  }
  i++;
 }
 return result;
}
const codeValues=new Set([
 "prescratch","scratch_updated","scratch_final","initial",
 "verified_prescratch"
]);
for(const file of pages){
 const html=readFileSync(file,"utf8");
 // Strip scripts/styles before checking the visible DOM text. External script
 // code is checked separately with the JS literal scanner below.
 const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"")
  .replace(/<[^>]*>/g," ");
 for(const re of forbidden)assert.doesNotMatch(visible,re,file+" must not contain editorial/production labels.");
 assert.doesNotMatch(html,/<input\b[^>]*type\s*=\s*["']file["']/i,
   file+" must not ask a customer to upload a file.");
 assert.doesNotMatch(html,/id=["'](?:rr-pt-upload|rr-pt-file|rr-target-local-file)["']/i,
   file+" must not include retired uploader controls.");
 console.log("PASS customer copy HTML: "+file);
}
for(const file of renderers){
 const js=readFileSync(file,"utf8");
 for(const item of visibleSourceStrings(js)){
  const label=item.raw.trim();
  if(codeValues.has(label))continue; // internal source status values, NOT labels
  for(const re of forbidden)assert.doesNotMatch(label,re,
    file+":"+item.start+" reintroduced banned customer-facing wording.");
 }
 assert.doesNotMatch(js,/rr-dash-card-update-state|rr-pt-upload|rr-pt-file/,
  file+" must not reference retired presentation or file-upload controls.");
 console.log("PASS customer copy JS: "+file);
}
const design=readFileSync("docs/RACING_INTELLIGENCE_HUB_DESIGN_SYSTEM.md","utf8");
assert.match(design,/Permanent customer-copy lock/);
assert.match(design,/never render internal edition-stage labels/i);
console.log("PASS: all four Racing Intelligence products enforce no publication-stage nomenclature or user JSON upload.");

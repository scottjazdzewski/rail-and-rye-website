import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {join} from "node:path";

/**
 * Brand-safety contract for customer-visible Rail & Rye page assets:
 * The data provider is a private input source, never a displayed advertiser.
 * The regex is deliberately word-boundary aware (DateTimeFormat is unrelated).
 */
function customerFiles(dir,into=[]){
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);
  if(entry.isDirectory())customerFiles(path,into);
  else if(entry.isFile()&&/\.(?:html|js|css|txt|md)$/.test(entry.name))into.push(path);
 }
 return into;
}
const files=customerFiles("public");
assert.ok(files.length>=40,"Customer asset audit must cover the website, not just Radar");
for(const path of files){
 const text=readFileSync(path,"utf8");
 assert.doesNotMatch(text,/\btimeform(?:us)?\b/i,
  "Private source brand must never appear in a customer-facing website asset: "+path);
}
const radar=readFileSync("public/assets/longshot-radar.js","utf8");
assert.match(radar,/make\("p","rr-lr-case",item\.betting_case\)/,
 "Radar must render the approved one-sentence betting reason");
assert.doesNotMatch(radar,/item\.(?:source_causal_evidence|counterargument_checked)/,
 "Research notes and counterarguments belong only in private QA");
assert.doesNotMatch(radar,/rr-lr-evidence/,
 "Do not create research-detail rows on the customer-facing Radar cards");
const server=readFileSync("src/longshot-radar.js","utf8");
for(const phrase of ["Original Timeform morning line","provisional Timeform morning-line"]){
 assert.ok(!server.includes(phrase),"No branded source wording in client-returned validation errors");
}
console.log("PASS: "+files.length+" public website assets have no restricted source brand; Radar shows only approved one-sentence analysis and keeps detailed QA private.");

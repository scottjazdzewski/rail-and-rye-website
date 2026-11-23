import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const stylesheets=[
 "public/assets/projections-dashboard.css",
 "public/assets/rr-projections-race-header.css",
 "public/assets/pick-tickets-dashboard.css",
 "public/assets/longshot-radar.css",
 "public/assets/target-list-dashboard.css"
];
const retired=[
 "rr-dash-prescratch-note","rr-dash-private-banner",
 "rr-lr-import","rr-lr-upload-form","rr-review-demo-controls",
 "rr-target-review-loader",
 "rr-pt-upload","rr-pt-demo-warning","rr-pt-private","rr-pt-review-notice"
];

// Check selector/property authority within identical media/support contexts.
// Different media queries and distinct selectors are intentional. Repeated
// properties for the SAME selector in the SAME context are stale overrides.
function rules(css,file){
 const result=[],stack=[];
 let token=0,quote="",comment=false;
 for(let i=0;i<css.length;i++){
  const c=css[i],n=css[i+1];
  if(comment){
   if(c==="*"&&n==="/"){comment=false;i++;}
   continue;
  }
  if(quote){
   if(c==="\\"){i++;continue;}
   if(c===quote)quote="";
   continue;
  }
  if(c==="/"&&n==="*"){comment=true;i++;continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c==="{"){
   const header=css.slice(token,i).replace(/\/\*[\s\S]*?\*\//g,"").trim();
   assert.ok(header,file+": empty CSS rule header");
   const context=stack.filter(x=>x.header.startsWith("@")).map(x=>x.header).join("|");
   stack.push({header,context,start:i});
   token=i+1;
   continue;
  }
  if(c==="}"){
   assert.ok(stack.length,file+": unmatched closing brace");
   const item=stack.pop();
   if(!item.header.startsWith("@")){
    const body=css.slice(item.start+1,i);
    const declarations=[...body.matchAll(/(?:^|;)\s*([a-zA-Z-]+)\s*:\s*([^;{}]+)/g)]
     .map(m=>({property:m[1].toLowerCase(),value:m[2].trim()}));
    if(declarations.length)result.push({...item,declarations});
   }
   token=i+1;
  }
 }
 assert.ok(!stack.length,file+": unterminated CSS block");
 assert.ok(!comment&&!quote,file+": unfinished CSS comment/string");
 return result;
}

for(const path of stylesheets){
 const css=readFileSync(path,"utf8");
 for(const className of retired){
  assert.ok(!css.includes("."+className),path+": retired UI rule returned: "+className);
 }
 const seen=new Map();
 for(const rule of rules(css,path)){
  const identity=rule.context+"||"+rule.header;
  const properties=seen.get(identity)||new Set();
  for(const decl of rule.declarations){
   assert.ok(!properties.has(decl.property),
    path+": duplicate/dead cascade declaration for "+rule.header+
    " / "+decl.property+" in "+(rule.context||"base rules"));
   properties.add(decl.property);
  }
  seen.set(identity,properties);
 }
 console.log("PASS CSS authority: "+path+" ("+seen.size+" scoped selectors)");
}
const general=readFileSync("public/assets/projections-dashboard.css","utf8");
const shared=readFileSync("public/assets/rr-intelligence-chips.css","utf8");
for(const [filename,content] of [["projections-dashboard.css",general],["rr-intelligence-chips.css",shared]]){
 const withoutComments=content.replace(/\/\*[\s\S]*?\*\//g,"");
 assert.doesNotMatch(withoutComments,/\.rr-dash-race-banner\s*\{/,
  filename+": legacy race-header CSS was not removed");
 assert.doesNotMatch(withoutComments,/\.rr-dash-scratch-strip\s*\{/,
  filename+": legacy scratch-bar CSS was not removed");
}
console.log("PASS: dedicated projection header owns all race metadata and scratch chip presentation");

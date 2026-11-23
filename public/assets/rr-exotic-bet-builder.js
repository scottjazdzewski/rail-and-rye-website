/* Rail & Rye · single-race exotic research builder.
   Requires authenticated race data supplied by the Projections application.
   Nothing in this module places a wager or fetches live tote information. */
(function(){
 "use strict";
 const ROOT="/assets/approved/saddlecloths/";
 const F4_MODEL="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET";
 const TYPES=["exacta","trifecta"];
 const MODES=["straight","box","key","wheel"];
 const CASH=(value)=>"$"+Number(value).toFixed(2);
 const el=(tag,cls,txt)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(txt!==undefined)node.textContent=String(txt);
  return node;
 };
 const state={race:null,track:"",date:"",type:"exacta",mode:"wheel",
              base:1,positions:[new Set(),new Set(),new Set()],box:new Set(),loading:false,modelError:"",requestId:0};
 let dialog=null;
 function horseChip(program){
  const value=String(program||"").toUpperCase();
  const wrap=el("span","rr-horse-chip");
  const match=value.match(/^(\d{1,2})([A-Z]?)$/);
  const n=match?Number(match[1]):NaN;
  if(Number.isInteger(n)&&n>=1&&n<=20){
   const image=document.createElement("img");image.src=ROOT+n+".png";
   image.alt="";image.loading="lazy";image.decoding="async";
   wrap.append(image);
   if(match[2])wrap.append(el("span","rr-horse-chip__suffix",match[2]));
  }else wrap.append(el("span","rr-horse-chip__fallback",value||"—"));
  wrap.setAttribute("aria-hidden","true");
  return wrap;
 }
 function usableEntries(race){
  const scratchSet=new Set((race?.scratches||[]).map(e=>String(e.program_number||e.program||"")));
  const seen=new Set();
  return (race?.entries||[]).filter(e=>{
   const number=String(e?.program_number||"");
   if(!number||seen.has(number)||scratchSet.has(number)||e.scratched===true||e.status==="SCRATCHED")return false;
   seen.add(number);return true;
  });
 }
 function positionLists(){
  const n=state.type==="exacta"?2:3;
  if(state.mode==="box")return Array.from({length:n},()=>[...state.box]);
  return state.positions.slice(0,n).map(x=>[...x]);
 }
 function combinations(){
  const lists=positionLists();
  if(lists.some(list=>!list.length))return [];
  let rows=[[]];
  for(const list of lists){
   const result=[];
   for(const row of rows)for(const program of list){
    if(!row.includes(program))result.push([...row,program]);
   }
   rows=result;
  }
  const distinct=new Map(rows.map(row=>[row.join("|"),row]));
  return [...distinct.values()];
 }
 function selectHorse(program,leg){
  const target=state.mode==="box"?state.box:state.positions[leg];
  if(target.has(program))target.delete(program);
  else{
   if(state.mode==="straight"||(state.mode==="key"&&leg===0))target.clear();
   target.add(program);
  }
  render();
 }
 function setType(value){
  if(!TYPES.includes(value))return;
  state.type=value;
  state.positions=[new Set(),new Set(),new Set()];
  state.box.clear();render();
 }
 function setMode(value){
  if(!MODES.includes(value))return;
  state.mode=value;
  state.positions=[new Set(),new Set(),new Set()];
  state.box.clear();render();
 }
 // The published frozen F4 conditional law is mathematically identical
 // to the signed full ordered-prefix CSV. The Worker validates the source
 // receipt, exact active field and P1/P2/P3 marginals before serving it.
 function verifiedDistribution(entries,kind){
  const dist=state.race?.f4_ordered_probabilities;
  if(!dist||dist.schema_version!==2||dist.model_id!==F4_MODEL||
    dist.status!=="verified"||dist.scratch_state!=="PRESCRATCH"||
    dist.date!==state.date||dist.track!==state.track||
    dist.race_number!==state.race?.race_number||
    !(/^[a-f0-9]{64}$/i.test(String(dist.receipt_sha256||"")))||
    !(/^[a-f0-9]{64}$/i.test(String(dist.prefix_sha256||""))))return null;
  const programs=dist.programs;
  if(!Array.isArray(programs)||programs.length!==entries.length||
    !Array.isArray(dist.pwin)||!Array.isArray(dist.p2_weights)||
    !Array.isArray(dist.p3_weights)||dist.pwin.length!==programs.length||
    dist.p2_weights.length!==programs.length||dist.p3_weights.length!==programs.length||
    new Set(programs).size!==programs.length)return null;
  const field=new Map(entries.map(e=>[String(e.program_number),e]));
  if(field.size!==programs.length||programs.some(p=>!field.has(p)))return null;
  const p1=new Map(),p2=new Map(),p3=new Map();
  for(let i=0;i<programs.length;i++){
   const program=programs[i],a=dist.pwin[i],b=dist.p2_weights[i],c=dist.p3_weights[i];
   const horse=field.get(program);
   if(!Number.isFinite(a)||a<=0||a>=1||
      !Number.isFinite(b)||b<=0||!Number.isFinite(c)||c<=0||
      !Number.isFinite(horse?.win_probability_exact)||
      Math.abs(a-horse.win_probability_exact/100)>1e-8)return null;
   p1.set(program,a);p2.set(program,b);p3.set(program,c);
  }
  if(Math.abs([...p1.values()].reduce((a,b)=>a+b,0)-1)>1e-8)return null;
  const sum2=[...p2.values()].reduce((a,b)=>a+b,0),sum3=[...p3.values()].reduce((a,b)=>a+b,0);
  const map=new Map();let mass=0;
  for(const first of programs){
   const denom2=sum2-p2.get(first);
   if(denom2<=0)return null;
   for(const second of programs){
    if(second===first)continue;
    const prob2=p1.get(first)*p2.get(second)/denom2;
    if(kind==="exacta"){map.set(first+"|"+second,prob2);mass+=prob2;continue;}
    const denom3=sum3-p3.get(first)-p3.get(second);
    if(denom3<=0)return null;
    for(const third of programs){
     if(third===first||third===second)continue;
     const prob3=prob2*p3.get(third)/denom3;
     map.set(first+"|"+second+"|"+third,prob3);mass+=prob3;
    }
   }
  }
  return Math.abs(mass-1)<=1e-8?map:null;
 }
 function calculate(entries){
  const combos=combinations(),cost=Number((combos.length*state.base).toFixed(2));
  const probabilities=verifiedDistribution(entries,state.type);
  const complete=probabilities!==null&&combos.every(x=>probabilities.has(x.join("|")));
  const chance=complete?combos.reduce((sum,x)=>sum+probabilities.get(x.join("|")),0):null;
  const fair=chance!==null&&chance>0?Math.ceil((cost/chance)*100-1e-9)/100:null;
  return {combos,cost,chance,fair,probabilities:complete?probabilities:null};
 }
 function button(text,selected,fn,cls){
  const b=el("button",cls||"rr-bet-option",text);
  b.type="button";b.setAttribute("aria-pressed",String(!!selected));b.addEventListener("click",fn);
  return b;
 }
 function selectionGrid(entries,leg,selected){
  const grid=el("div","rr-bet-horse-grid");
  for(const e of entries){
   const program=String(e.program_number),on=selected.has(program);
   const b=el("button","rr-bet-horse-choice");
   b.type="button";b.setAttribute("aria-pressed",String(on));
   b.setAttribute("aria-label",program+" "+e.horse_name+", "+(on?"selected":"not selected"));
   b.append(horseChip(program));
   b.append(el("span","rr-bet-horse-name",e.horse_name));
   b.addEventListener("click",()=>selectHorse(program,leg));grid.append(b);
  }
  return grid;
 }
 function group(label,entries,leg,selected){
  const wrap=el("section","rr-bet-position");
  wrap.append(el("h3","rr-bet-position-name",label));
  wrap.append(selectionGrid(entries,leg,selected));return wrap;
 }
 function render(){
  if(!dialog||!state.race)return;
  const entries=usableEntries(state.race);
  const body=el("div","rr-bet-body");
  const title=el("div","rr-bet-heading");
  const context=el("div","rr-bet-context");
  context.append(el("strong","","Rail & Rye · Bet Builder"));
  context.append(el("span","",state.track+" · Race "+state.race.race_number+
    (state.date?" · "+state.date:"")));
  const close=el("button","rr-bet-close","Close");
  close.type="button";close.setAttribute("aria-label","Close Bet Builder");
  close.addEventListener("click",()=>dialog.close());
  title.append(context,close);body.append(title);
  const intro=el("p","rr-bet-intro","Build single-race exotic combinations using approved saddlecloths. No live tote connection or wager placement.");
  body.append(intro);
  const types=el("div","rr-bet-types");
  types.setAttribute("role","group");types.setAttribute("aria-label","Wager type");
  for(const type of TYPES)types.append(button(type==="exacta"?"Exacta":"Trifecta",state.type===type,()=>setType(type)));
  body.append(types);
  const constructions=el("div","rr-bet-constructions");
  constructions.setAttribute("role","group");constructions.setAttribute("aria-label","Ticket construction");
  for(const mode of MODES)constructions.append(button(mode==="straight"?"Straight":mode==="box"?"Box":mode==="key"?"1st-Place Key":"Part-Wheel",state.mode===mode,()=>setMode(mode)));
  body.append(constructions);
  if(state.mode==="box")body.append(group("BOX HORSES · any finishing order",entries,0,state.box));
  else{
   const positions=state.type==="exacta"?2:3;
   const labels=["1ST PLACE","2ND PLACE","3RD PLACE"];
   for(let i=0;i<positions;i++)body.append(group(labels[i],entries,i,state.positions[i]));
  }
  const denom=el("div","rr-bet-denomination");
  const money=el("label","","Base wager");
  money.htmlFor="rr-bet-base";
  const select=el("select","");select.id="rr-bet-base";
  for(const value of [0.5,1,2,5]){
   const o=el("option","",CASH(value));o.value=String(value);select.append(o);
  }
  select.value=String(state.base);
  select.addEventListener("change",()=>{state.base=Number(select.value);render();});
  denom.append(money,select);body.append(denom);
  const result=calculate(entries),stats=el("div","rr-bet-stats");
  const stat=(label,value)=>{const d=el("div","rr-bet-stat");d.append(el("span","",label),el("strong","",value));return d;};
  stats.append(stat("Combinations",result.combos.length.toLocaleString("en-US")));
  stats.append(stat("Ticket cost",CASH(result.cost)));
  stats.append(stat("Projected hit chance",result.chance===null?"Not available":(result.chance*100).toFixed(2)+"%"));
  stats.append(stat("Minimum break-even gross payout*",result.fair===null?"Not available":CASH(result.fair)));
  body.append(stats);
  const info=el("p","rr-bet-disclaimer",result.probabilities?
    "F4 hit chance uses the verified ordered finish model. *For boxes/wheels, the minimum gross payout assumes every covered winning combination pays the SAME amount; actual payouts vary. Compare the payout for your selected denomination against the live tote yourself. Higher than break-even is needed for positive model value.":
    state.loading?"Checking the private certified F4 finishing probabilities for this race…":
    "Ticket cost is calculated. The current field has no matching verified F4 ordered data: no hit chance or break-even payout can be shown.");
  body.append(info);
  const details=el("details","rr-bet-combos");
  details.append(el("summary","","Show "+result.combos.length+" covered combinations"));
  const list=el("ol","");
  for(const combo of result.combos.slice(0,40)){
   const line=el("li","rr-bet-combo");
   const strip=el("div","rr-bet-combo-chips");
   for(const p of combo)strip.append(horseChip(p));
   line.append(strip);
   if(result.probabilities){
    const probability=result.probabilities.get(combo.join("|"));
    line.append(el("span","rr-bet-combo-prob",
      (probability*100).toFixed(3)+"% · break-even gross "+
      (probability>0?CASH(Math.ceil((state.base/probability)*100-1e-9)/100):"—")));
   }
   list.append(line);
  }
  if(result.combos.length>40)list.append(el("li","rr-bet-list-truncated",
   "Showing 40 of "+result.combos.length+" combinations."));
  details.append(list);body.append(details);
  dialog.replaceChildren(body);
 }
 async function loadCertifiedF4(options,sequence){
  if(typeof fetch!=="function"){
   state.loading=false;render();return;
  }
  try{
   const url=(options.preview?"/api/admin/projections-f4":"/api/membership/projections-f4")+"?"+
    new URLSearchParams({date:state.date,track:state.track,race:String(state.race.race_number)});
   const response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
   if(!response.ok)throw Error("The certified ordered model for this race is unavailable.");
   const data=await response.json();
   if(sequence!==state.requestId||!state.race)return;
   if(!data?.f4||data.f4.model_id!==F4_MODEL||data.f4.status!=="verified")
    throw Error("The model receipt does not match the current race.");
   state.race.f4_ordered_probabilities=data.f4;
   state.loading=false;render();
  }catch(error){
   if(sequence!==state.requestId)return;
   state.loading=false;state.modelError=String(error?.message||"Model unavailable");render();
  }
 }
 function open(options){
  const race=options?.race;
  if(!race||!Array.isArray(race.entries)||race.entries.length<2)return;
  state.race=race;state.track=String(options.track||"");state.date=String(options.date||"");
  state.type="exacta";state.mode="wheel";state.base=1;state.loading=true;state.modelError="";
  state.positions=[new Set(),new Set(),new Set()];state.box=new Set();
  delete state.race.f4_ordered_probabilities;
  const request=++state.requestId;
  if(!dialog){
   dialog=el("dialog","rr-bet-dialog");
   dialog.setAttribute("aria-label","Rail & Rye exotic Bet Builder");
   document.body.append(dialog);
   dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
  }
  render();if(!dialog.open)dialog.showModal();
  loadCertifiedF4(options,request);
 }
 window.RRBetBuilder=Object.freeze({open,
   // Narrow testing hooks. Pure calculation never uses live market data.
   _calculate:()=>calculate(usableEntries(state.race)),
   _state:state});
})();

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
              base:1,positions:[new Set(),new Set(),new Set()],box:new Set()};
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
 function verifiedDistribution(entries,kind){
  const dist=state.race?.f4_ordered_probabilities;
  if(!dist||dist.schema_version!==1||dist.model_id!==F4_MODEL||
     dist.status!=="verified"||!(/^[a-f0-9]{64}$/i.test(String(dist.receipt_sha256||""))))return null;
  const values=dist[kind];
  if(!Array.isArray(values))return null;
  const expectedPrograms=entries.map(e=>String(e.program_number));
  const available=new Set(expectedPrograms);
  const n=kind==="exacta"?2:3;
  const expectedLength=expectedPrograms.length===2&&n===3?0:
   expectedPrograms.length*(expectedPrograms.length-1)*(n===3?expectedPrograms.length-2:1);
  if(values.length!==expectedLength)return null;
  const map=new Map();let sum=0;
  for(const item of values){
   const parts=item?.programs,p=item?.probability;
   if(!Array.isArray(parts)||parts.length!==n||parts.some(x=>typeof x!=="string"||!available.has(x))||
      new Set(parts).size!==n||typeof p!=="number"||!Number.isFinite(p)||p<0||p>1)return null;
   const key=parts.join("|");
   if(map.has(key))return null;
   map.set(key,p);sum+=p;
  }
  if(Math.abs(sum-1)>0.000001)return null;
  return map;
 }
 function calculate(entries){
  const combos=combinations(),cost=Number((combos.length*state.base).toFixed(2));
  const probabilities=verifiedDistribution(entries,state.type);
  const complete=probabilities!==null&&combos.every(x=>probabilities.has(x.join("|")));
  const chance=complete?combos.reduce((sum,x)=>sum+probabilities.get(x.join("|")),0):null;
  const fair=chance!==null&&chance>0?cost/chance:null;
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
  stats.append(stat("F4 hit chance",result.chance===null?"Not available":(result.chance*100).toFixed(2)+"%"));
  stats.append(stat("Equal-payout break-even",result.fair===null?"Not available":CASH(result.fair)));
  body.append(stats);
  const info=el("p","rr-bet-disclaimer",result.probabilities?
    "Hit probabilities come from certified F4 ordered combinations. Break-even assumes the same gross payout for every covered winning combination; actual tote returns differ.":
    "Ticket cost is calculated. Certified F4 ordered-combination probabilities have not been published for this race, so no hit chance or fair payout is claimed.");
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
      (probability*100).toFixed(3)+"% · fair "+
      (probability>0?CASH(state.base/probability):"—")));
   }
   list.append(line);
  }
  if(result.combos.length>40)list.append(el("li","rr-bet-list-truncated",
   "Showing 40 of "+result.combos.length+" combinations."));
  details.append(list);body.append(details);
  dialog.replaceChildren(body);
 }
 function open(options){
  const race=options?.race;
  if(!race||!Array.isArray(race.entries)||race.entries.length<2)return;
  state.race=race;state.track=String(options.track||"");state.date=String(options.date||"");
  state.type="exacta";state.mode="wheel";state.base=1;
  state.positions=[new Set(),new Set(),new Set()];state.box=new Set();
  if(!dialog){
   dialog=el("dialog","rr-bet-dialog");
   dialog.setAttribute("aria-label","Rail & Rye exotic Bet Builder");
   document.body.append(dialog);
   dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
  }
  render();if(!dialog.open)dialog.showModal();
 }
 window.RRBetBuilder=Object.freeze({open,
   // Narrow testing hooks. Pure calculation never uses live market data.
   _calculate:()=>calculate(usableEntries(state.race)),
   _state:state});
})();

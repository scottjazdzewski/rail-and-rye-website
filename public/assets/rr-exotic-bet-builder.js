/* Rail & Rye · single-race exotic research builder.
   Requires authenticated race data supplied by the Projections application.
   Nothing in this module places a wager or fetches live tote information. */
(function(){
 "use strict";
 const ROOT="/assets/approved/saddlecloths/";
 const F4_MODEL="TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET";
 const TYPES=["exacta","trifecta","daily-double"];
 const MODES=["straight","box","key","wheel"];
 const CASH=(value)=>"$"+Number(value).toFixed(2);
 const el=(tag,cls,txt)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(txt!==undefined)node.textContent=String(txt);
  return node;
 };
 const state={race:null,card:null,track:"",date:"",type:"exacta",mode:"wheel",
              base:1,positions:[new Set(),new Set(),new Set()],box:new Set(),
              ddPair:null,ddSelections:[new Set(),new Set()],loading:false,modelError:"",requestId:0};
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
 function hasTimeformDailyDoubleEvidence(pool){
  const wagers=String(pool?.wager_text||"");
  if(pool?.source!=="timeform_wagers"||/\b(?:2nd|second)\s+half\b/i.test(wagers))return false;
  const legs=wagers.match(/\bdouble\s*(?:\(\s*\$\d+(?:\.\d+)?\s*\)\s*)?\(\s*races?\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s*\)/i)
   ||wagers.match(/\bdouble\s*(?:\(\s*\$\d+(?:\.\d+)?\s*\)\s*)?(\d{1,2})\s*&\s*(\d{1,2})(?!\d)/i);
  if(legs)return Number(legs[2])===Number(legs[1])+1&&Number(legs[1])===Number(pool.first_race_number)&&Number(legs[2])===Number(pool.second_race_number);
  return /\b(?:(?:daily|rolling|late)\s+double|double\s+wagers?)\b|(?:^|[/*:])\s*double\b/i.test(wagers);
 }
 function dailyDoublePairs(card=state.card,race=state.race,date=state.date){
  if(card?.race_date!==date)return [];
  const byNumber=new Map((card?.races||[]).filter(r=>Number.isInteger(Number(r?.race_number)))
   .map(r=>[Number(r.race_number),r]));
  if(!Array.isArray(card?.daily_double_pools))return [];
  const seen=new Set(),pairs=[];
  for(const pool of card.daily_double_pools){
   const firstNumber=Number(pool?.first_race_number),secondNumber=Number(pool?.second_race_number);
   if(firstNumber!==Number(race?.race_number)||!Number.isInteger(firstNumber)||secondNumber!==firstNumber+1||seen.has(firstNumber)||
      !hasTimeformDailyDoubleEvidence(pool))continue;
   const first=byNumber.get(firstNumber),second=byNumber.get(secondNumber);
   if(!first||!second||first.timeform_wagers!==pool.wager_text||usableEntries(first).length<2||usableEntries(second).length<2)continue;
   seen.add(firstNumber);pairs.push({first,second});
  }
  return pairs;
 }
 function doublePairKey(pair){
  return pair?String(pair.first.race_number)+"-"+String(pair.second.race_number):"";
 }
 function ensureDailyDoublePair(pairs){
  const currentKey=doublePairKey(state.ddPair);
  const existing=pairs.find(pair=>doublePairKey(pair)===currentKey);
  if(existing){state.ddPair=existing;return;}
  const active=Number(state.race?.race_number);
  state.ddPair=pairs.find(pair=>Number(pair.first.race_number)===active)||
   pairs.find(pair=>Number(pair.second.race_number)===active)||pairs[0]||null;
 }
 function verifiedWinProbabilities(race){
  const entries=usableEntries(race);
  if(entries.length<2)return null;
  const probabilities=new Map();let total=0;
  for(const entry of entries){
   const percent=Number(entry.win_probability_exact),chance=percent/100;
   if(!Number.isFinite(percent)||percent<=0||percent>=100)return null;
   probabilities.set(String(entry.program_number),chance);total+=chance;
  }
  return Math.abs(total-1)<=1e-8?{entries,probabilities}:null;
 }
 function positionLists(){
  if(state.type==="daily-double")return [];
  const n=state.type==="exacta"?2:3;
  if(state.mode==="box")return Array.from({length:n},()=>[...state.box]);
  return state.positions.slice(0,n).map(x=>[...x]);
 }
 function combinations(){
  if(state.type==="daily-double"){
   const first=[...state.ddSelections[0]],second=[...state.ddSelections[1]];
   return first.flatMap(a=>second.map(b=>[a,b]));
  }
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
  if(state.type==="daily-double"){
   const target=state.ddSelections[leg];
   if(target.has(program))target.delete(program);else target.add(program);
   render();return;
  }
  const target=state.mode==="box"?state.box:state.positions[leg];
  if(target.has(program))target.delete(program);
  else{
   if(state.mode==="straight"||(state.mode==="key"&&leg===0))target.clear();
   target.add(program);
  }
  render();
 }
 function setType(value){
  if(!TYPES.includes(value)||(value==="daily-double"&&!dailyDoublePairs().length))return;
  state.type=value;
  state.positions=[new Set(),new Set(),new Set()];
  state.box.clear();state.ddSelections=[new Set(),new Set()];render();
 }
 function setMode(value){
  if(state.type==="daily-double"||!MODES.includes(value))return;
  state.mode=value;
  state.positions=[new Set(),new Set(),new Set()];
  state.box.clear();state.ddSelections=[new Set(),new Set()];render();
 }
 // The published frozen F4 conditional law is mathematically identical
 // to the signed full ordered-prefix CSV. The Worker validates the source
 // receipt, exact active field and P1/P2/P3 marginals before serving it.
 function verifiedDistribution(entries,kind){
  const dist=state.race?.f4_ordered_probabilities;
  if(!dist||dist.schema_version!==2||dist.model_id!==F4_MODEL||
    dist.status!=="verified"||dist.scratch_state!==(state.snapshotStatus==="scratch_final"?"SCRATCH_FINAL":"PRESCRATCH")||
    dist.date!==state.date||dist.track!==state.track||
    dist.race_number!==state.race?.race_number||
     (state.snapshotStatus==="scratch_final"&&(
      !state.modelReceipts||!dist.dashboard_receipts||
      ["tri_sha256","f4_sha256","prescratch_parent_sha256","official_changes_sha256"].some(
       k=>!(/^[a-f0-9]{64}$/i.test(String(state.modelReceipts[k]||"")))||
          state.modelReceipts[k]!==dist.dashboard_receipts[k])||
      dist.receipt_sha256!==state.modelReceipts.f4_sha256))||
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
 // A 100% hit probability is only possible if the ticket covers every
 // distinct exacta/trifecta finish in the verified current field. This is NOT
 // the probability of turning a profit; tote payouts vary by combination.
 function formatChance(chance,fullFieldCoverage){
  if(chance===null)return "Not available";
  if(chance>0&&chance<0.00005)return "<0.01%";
  // Never round 99.995% up to an unearned "100.00%" claim.
  if(!fullFieldCoverage&&chance>=0.99995)return ">99.99%";
  return (chance*100).toFixed(2)+"%";
 }
 function calculateDailyDouble(){
  const combos=combinations(),cost=Number((combos.length*state.base).toFixed(2));
  const first=state.ddPair?verifiedWinProbabilities(state.ddPair.first):null;
  const second=state.ddPair?verifiedWinProbabilities(state.ddPair.second):null;
  const complete=!!first&&!!second&&combos.length>0;
  const probabilities=new Map();
  if(first&&second){
   for(const [a,p1] of first.probabilities)for(const [b,p2] of second.probabilities)
    probabilities.set(a+"|"+b,p1*p2);
  }
  const fullTicket=complete&&combos.every(combo=>probabilities.has(combo.join("|")));
  const rawChance=fullTicket?combos.reduce((sum,combo)=>sum+probabilities.get(combo.join("|")),0):null;
  const chance=rawChance===null?null:Math.min(1,Math.max(0,rawChance));
  const allOutcomesCovered=complete&&state.ddSelections[0].size===first.entries.length&&
   state.ddSelections[1].size===second.entries.length;
  const threshold=chance!==null&&chance>0?cost/chance:null;
  const fair=threshold!==null&&Number.isFinite(threshold)?
   Math.ceil(threshold*100-1e-9)/100:null;
  return {combos,cost,chance,fair,probabilities:fullTicket?probabilities:null,
   modelAvailable:!!first&&!!second,allOutcomesCovered,firstPlaceKey:false,leadHorse:null};
 }
 function calculate(entries){
  if(state.type==="daily-double")return calculateDailyDouble();
  const combos=combinations(),cost=Number((combos.length*state.base).toFixed(2));
  const probabilities=verifiedDistribution(entries,state.type);
  const complete=probabilities!==null&&combos.length>0&&
   combos.every(x=>probabilities.has(x.join("|")));
  const rawChance=complete?combos.reduce((sum,x)=>sum+probabilities.get(x.join("|")),0):null;
  const chance=rawChance===null?null:Math.min(1,Math.max(0,rawChance));
  const allOutcomesCovered=complete&&combos.length===probabilities.size;
  const threshold=chance!==null&&chance>0?cost/chance:null;
  const fair=threshold!==null&&Number.isFinite(threshold)?
   Math.ceil(threshold*100-1e-9)/100:null;
  const lead=positionLists()[0];
  const firstPlaceKey=complete&&lead.length===1&&
   combos.every(combo=>combo[0]===lead[0])&&
   combos.length===(state.type==="exacta"?entries.length-1:(entries.length-1)*(entries.length-2));
  const leadHorse=firstPlaceKey?entries.find(e=>String(e.program_number)===lead[0]):null;
  // For a complete first-place key the combined chance MUST equal that
  // runner's exact TRI win probability. Never show a source-drifted figure.
  const keyPwin=leadHorse?Number(leadHorse.win_probability_exact)/100:null;
  if(firstPlaceKey&&(!Number.isFinite(keyPwin)||Math.abs(chance-keyPwin)>1e-8))
   return {combos,cost,chance:null,fair:null,probabilities:null,modelAvailable:false,
    allOutcomesCovered:false,firstPlaceKey:false,leadHorse:null};
  return {combos,cost,chance,fair,probabilities:complete?probabilities:null,
   modelAvailable:probabilities!==null,allOutcomesCovered,firstPlaceKey,leadHorse};
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
   b.dataset.betChoiceKey=String(leg)+":"+program;
   b.setAttribute("data-bet-choice-key",b.dataset.betChoiceKey);
   b.append(horseChip(program));
   b.append(el("span","rr-bet-horse-name",e.horse_name));
   b.addEventListener("click",()=>selectHorse(program,leg));grid.append(b);
  }
  return grid;
 }
 function group(label,entries,leg,selected){
  const wrap=el("section","rr-bet-position"),heading=el("div","rr-bet-position-heading");
  heading.append(el("h3","rr-bet-position-name",label));
  heading.append(el("span","rr-bet-selection-count",selected.size?selected.size+" selected":"Select horses"));
  if(selected.size){
   const clear=el("button","rr-bet-clear","Clear");
   clear.type="button";clear.setAttribute("aria-label","Clear "+label.toLowerCase()+" selections");
   clear.addEventListener("click",()=>{selected.clear();render();});heading.append(clear);
  }
  wrap.append(heading,selectionGrid(entries,leg,selected));return wrap;
 }
 function render(){
  if(!dialog||!state.race)return;
  const entries=usableEntries(state.race);
  const body=el("div","rr-bet-body");
  const title=el("div","rr-bet-heading");
  const context=el("div","rr-bet-context");
  context.append(el("strong","","Rail & Rye · Bet Builder"));
  const raceContext=state.type==="daily-double"&&state.ddPair?
   "Daily Double · Races "+state.ddPair.first.race_number+"–"+state.ddPair.second.race_number:
   "Race "+state.race.race_number;
  context.append(el("span","",state.track+" · "+raceContext+(state.date?" · "+state.date:"")));
  const close=el("button","rr-bet-close","Close");
  close.type="button";close.setAttribute("aria-label","Close Bet Builder");
  close.addEventListener("click",()=>dialog.close());
  title.append(context,close);body.append(title);
  const types=el("div","rr-bet-types");
  types.setAttribute("role","group");types.setAttribute("aria-label","Wager type");
  const typeLabels={exacta:"Exacta",trifecta:"Trifecta","daily-double":"Daily Double"};
  const availableTypes=TYPES.filter(type=>type!=="daily-double"||dailyDoublePairs().length>0);
  if(state.type==="daily-double"&&!availableTypes.includes("daily-double"))state.type="exacta";
  for(const type of availableTypes)types.append(button(typeLabels[type],state.type===type,()=>setType(type)));
  body.append(types);
  if(state.type==="daily-double"){
   const pairs=dailyDoublePairs();ensureDailyDoublePair(pairs);
   if(pairs.length){
    const pairWrap=el("div","rr-bet-pair-selector");
    const pairLabel=el("label","","Daily Double race pair");pairLabel.htmlFor="rr-bet-pair";
    const pairSelect=el("select","");pairSelect.id="rr-bet-pair";
    pairSelect.setAttribute("aria-label","Daily Double race pair");
    for(const pair of pairs){
     const option=el("option","","Races "+pair.first.race_number+"–"+pair.second.race_number);
     option.value=doublePairKey(pair);pairSelect.append(option);
    }
    pairSelect.value=doublePairKey(state.ddPair);
    pairSelect.addEventListener("change",()=>{
     state.ddPair=pairs.find(pair=>doublePairKey(pair)===pairSelect.value)||null;
     state.ddSelections=[new Set(),new Set()];render();
    });
    pairWrap.append(pairLabel,pairSelect);body.append(pairWrap);
   }else body.append(el("p","rr-bet-no-pairs","No Daily Double race pairs are available on this card."));
  }else{
   const constructions=el("div","rr-bet-constructions");
   constructions.setAttribute("role","group");constructions.setAttribute("aria-label","Ticket construction");
   for(const mode of MODES)constructions.append(button(mode==="straight"?"Straight":mode==="box"?"Box":mode==="key"?"1st-Place Key":"Part-Wheel",state.mode===mode,()=>setMode(mode)));
   body.append(constructions);
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
  const result=calculate(entries);
  // Decision-critical F4 numbers appear BEFORE the horse grids and remain
  // visible on mobile as customers change a leg, box, key or denomination.
  const summary=el("section","rr-bet-summary");
  summary.setAttribute("aria-label","Your exotic ticket probability and payout");
  const summaryHeading=el("div","rr-bet-summary-heading");
  summaryHeading.append(el("strong","","YOUR TICKET"));
   summary.append(summaryHeading);
  const primary=el("div","rr-bet-summary-primary");
  const mainStat=(label,value,cssClass)=>{
   const box=el("div","rr-bet-main-stat "+cssClass);
   box.append(el("span","",label),el("strong","",value));
   return box;
  };
  primary.append(mainStat("PROJECTED HIT CHANCE",
   result.chance===null?"—":formatChance(result.chance,result.allOutcomesCovered),"rr-bet-main-stat--chance"));
  primary.append(mainStat("BREAK-EVEN GROSS PAYOUT",
   result.fair===null?"—":CASH(result.fair),"rr-bet-main-stat--payout"));
  summary.append(primary);
  const secondary=el("div","rr-bet-summary-secondary");
  secondary.append(el("span","",result.combos.length.toLocaleString("en-US")+" combinations"));
  secondary.append(el("strong","","Ticket cost "+CASH(result.cost)));
  summary.append(secondary);
  if(result.firstPlaceKey)summary.append(el("span","rr-bet-summary-key",
   "Full key: #"+result.leadHorse.program_number+" must WIN"));
  if(state.type==="daily-double"&&result.modelAvailable)
   summary.append(el("small","rr-bet-summary-assumption",
    "Model estimate combines both legs’ win chances and assumes independent race outcomes."));
  else if(result.combos.length>1&&result.modelAvailable)
   summary.append(el("small","rr-bet-summary-assumption",
    "Break-even assumes equal gross payouts; actual tote payouts vary."));
  if(result.allOutcomesCovered)
   summary.append(el("small","rr-bet-summary-caveat",
    "100% outcome coverage does NOT guarantee a profit."));
  // Ticket calculations and receipt checks remain unchanged. Customer-facing
   // status stays in the numbers rather than explaining internal model steps.
   if(!result.modelAvailable&&!state.loading)
    summary.setAttribute("aria-label","Your exotic ticket; no hit probability available");
   
  body.append(summary);
  if(state.type==="daily-double"&&state.ddPair){
   body.append(group("LEG 1 · RACE "+state.ddPair.first.race_number,
    usableEntries(state.ddPair.first),0,state.ddSelections[0]));
   body.append(group("LEG 2 · RACE "+state.ddPair.second.race_number,
    usableEntries(state.ddPair.second),1,state.ddSelections[1]));
  }else if(state.type!=="daily-double"&&state.mode==="box")
   body.append(group("BOX HORSES · any finishing order",entries,0,state.box));
  else if(state.type!=="daily-double"){
   const positions=state.type==="exacta"?2:3;
   const labels=["1ST PLACE","2ND PLACE","3RD PLACE"];
   for(let i=0;i<positions;i++)body.append(group(labels[i],entries,i,state.positions[i]));
  }
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
    const detail=state.type==="daily-double"?
     (probability*100).toFixed(3)+"% projected hit chance":
     (probability*100).toFixed(3)+"% · break-even gross "+
      (probability>0?CASH(Math.ceil((state.base/probability)*100-1e-9)/100):"—");
    line.append(el("span","rr-bet-combo-prob",detail));
   }
   list.append(line);
  }
  if(result.combos.length>40)list.append(el("li","rr-bet-list-truncated",
   "Showing 40 of "+result.combos.length+" combinations."));
  details.append(list);body.append(details);
  const previousScroll=dialog.scrollTop;
  const focusChoice=document.activeElement?.dataset?.betChoiceKey;
  dialog.replaceChildren(body);
  // Rebuilding a selection grid must not jump iOS users back to the top.
  if(Number.isFinite(previousScroll)&&previousScroll>0)dialog.scrollTop=previousScroll;
  if(focusChoice&&dialog.querySelectorAll){
   const next=[...dialog.querySelectorAll("[data-bet-choice-key]")].find(
    node=>node.dataset?.betChoiceKey===focusChoice);
   if(next?.focus)next.focus({preventScroll:true});
  }
 }
 async function loadCertifiedF4(options,sequence){
  if(typeof fetch!=="function"){
   state.loading=false;render();return;
  }
  try{
   const url=(options.customer?"/api/product-tabs/projections-f4":options.preview?"/api/admin/projections-f4":"/api/membership/projections-f4")+"?"+
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
  state.race=race;state.card=options.card&&Array.isArray(options.card.races)?options.card:null;
  state.track=String(options.track||"");state.date=String(options.date||"");
  state.type="exacta";state.mode="wheel";state.base=1;state.loading=true;state.modelError="";
  state.ddPair=null;state.ddSelections=[new Set(),new Set()];
  if(options.initialType==="daily-double"&&dailyDoublePairs().length)state.type="daily-double";
   state.snapshotStatus=options.projection_status==="scratch_final"?"scratch_final":"prescratch";
   state.modelReceipts=options.model_receipts||null;
  state.positions=[new Set(),new Set(),new Set()];state.box=new Set();
  delete state.race.f4_ordered_probabilities;
  const request=++state.requestId;
  if(!dialog){
   dialog=el("dialog","rr-bet-dialog");
   dialog.setAttribute("aria-label","Rail & Rye exotic Bet Builder");
   document.body.append(dialog);
   dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
  }
  dialog.scrollTop=0;
  render();if(!dialog.open)dialog.showModal();
  loadCertifiedF4(options,request);
 }
 window.RRBetBuilder=Object.freeze({open,
   canOpenDailyDouble:({card,race,date})=>dailyDoublePairs(card,race,date).length>0,
   // Narrow testing hooks. Pure calculation never uses live market data.
   _calculate:()=>calculate(usableEntries(state.race)),
   _formatChance:formatChance,
   _state:state});
})();

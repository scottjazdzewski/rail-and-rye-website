// Metadata-only repair for the already scored November 24 cards.
// Source: date-specific official entry indexes, retrieved 2026-11-23.
// The underlying certified scored objects and hashes are never rewritten.
const entries1124 = {
  "delta-downs": {
    "code": "DED",
    "p": [
      18000,
      18000,
      18000,
      13000,
      13000,
      14000,
      37000,
      16000
    ],
    "n": [
      7,
      6,
      10,
      9,
      8,
      9,
      6,
      10
    ]
  },
  "finger-lakes": {
    "code": "FL",
    "p": [
      13700,
      13700,
      17500,
      32600,
      32600,
      13800,
      14000,
      14000
    ],
    "n": [
      7,
      6,
      7,
      8,
      10,
      9,
      8,
      10
    ]
  },
  "mahoning-valley": {
    "code": "MVR",
    "p": [
      31800,
      27500,
      13000,
      11100,
      31800,
      14800,
      33700,
      20000
    ],
    "n": [
      7,
      6,
      8,
      10,
      11,
      9,
      8,
      8
    ]
  },
  "mountaineer": {
    "code": "MNR",
    "p": [
      7000,
      9500,
      19000,
      15000,
      19000,
      10000,
      13000,
      9000
    ],
    "n": [
      8,
      9,
      6,
      8,
      8,
      7,
      7,
      13
    ]
  },
  "parx-racing": {
    "code": "PRX",
    "p": [
      18000,
      21000,
      21000,
      24000,
      25000,
      21000,
      28000,
      32000,
      26000
    ],
    "n": [
      9,
      8,
      7,
      7,
      8,
      11,
      7,
      6,
      11
    ]
  },
  "zia-park": {
    "code": "ZIA",
    "p": [
      67500,
      67500,
      67500,
      100000,
      100000,
      100000,
      100000,
      100000,
      300000,
      350000
    ],
    "n": [
      10,
      9,
      11,
      8,
      8,
      10,
      10,
      10,
      7,
      10
    ],
    // Equibase official Nov 24 Zia Park entry index. These are proper event
    // names, NOT the generic conditions field ("STAKES") in some TRI cards.
    // All seven are non-graded; a trophy must NEVER be inferred from purses.
    "stakes": {
      "4": "Zia Park Juvenile Stakes",
      "5": "Zia Park Sprint Stakes",
      "6": "Zia Park Distaff Stakes",
      "7": "Zia Park Princess Stakes",
      "8": "Zia Park Championship Stakes",
      "9": "Zia Park Oaks",
      "10": "Zia Park Derby"
    }
  }
};

export function validPurse(value){
 const s=String(value??"").trim();
 return /^\$(?:[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)(?:\.00)?$/.test(s);
}
// One publication-wide gate. Raw conditions such as "STAKES" are a
// classification, never a proper race name. No event name is guessed from purse.
export const genericStakesTitle=value=>/^(?:(?:overnight|listed|graded|ungraded|restricted|open|non-graded)\s+)?(?:stake|stakes|stks?\.?|s\.?)\s*(?:\(?(?:g[123]|grade\s*[123])\)?)?$/i.test(String(value??"").trim());
export function hasVerifiedStakesTitle(race){
 const named=[race?.stakes_name,race?.race_name,race?.conditions]
  .map(value=>String(value??"").trim()).filter(Boolean);
 return named.some(value=>!genericStakesTitle(value));
}
export function requireProductionStakesNames(card){
 for(const race of card.races||[]){
  const classText=String(race.conditions||"");
  const unverified=genericStakesTitle(classText)||
   race.is_stakes===true||Boolean(String(race.stakes_name||"").trim())||
   Boolean(String(race.stakes_grade||"").trim());
  if(unverified&&!hasVerifiedStakesTitle(race))
   throw Error("Race "+race.race_number+": full official stakes race name required; generic STAKES is not publishable.");
 }
}
export function enrichRaceInformation(card){
 if(card.race_date!=="2026-11-24")return card;
 const slug=String(card.track_name||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
 const source=entries1124[slug];
 if(!source||card.races.length!==source.p.length)return card;
 const numbers=new Set(card.races.map(r=>r.race_number));
 if(source.p.some((_,i)=>!numbers.has(i+1)))return card;
 return {...card,races:card.races.map(race=>{
  const i=race.race_number-1;
  let result=race;
  if(!validPurse(race.purse)&&!String(race.purse??"").trim()&&
     card.projection_status==="prescratch"&&race.entries.length===source.n[i])
   result={...result,purse:"$"+source.p[i].toLocaleString("en-US")};
  const named=source.stakes?.[String(race.race_number)];
  const current=[race.stakes_name,race.race_name,race.conditions]
   .map(value=>String(value??"").trim()).filter(Boolean);
  // The date + complete track race list + verified purse must all match
  // before supplementing a missing race name. Scratches may change field sizes.
  const sourcedPurse="$"+source.p[i].toLocaleString("en-US");
  if(named&&current.every(genericStakesTitle)&&
     (!String(result.purse||"").trim()||result.purse===sourcedPurse))
   result={...result,stakes_name:named,is_stakes:true};
  return result;
 })};
}
export function requireProductionPurses(card){
 if(!card.projection_status&&!card.factor_basis)return;
 for(const race of card.races){
  if(!validPurse(race.purse))throw Error("Race "+race.race_number+": verified official purse required (not claiming price).");
 }
}

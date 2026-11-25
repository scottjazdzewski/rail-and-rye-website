import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium,webkit} from "playwright";
const edition=JSON.parse(fs.readFileSync("/tmp/rr-dd-verify/edition.json","utf8"));
const base="https://railandryeracing.com";
const expected=new Map(edition.cards.map(c=>[c.track,new Set(c.card.daily_double_pools.map(p=>p.first_race_number))]));
for(const [name,engine] of [["Chromium",chromium],["WebKit",webkit]]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/api/product-tabs/edition?**",route=>route.fulfill({json:edition}));
  // Daily Double uses certified exact PWIN in both legs, not the single-race F4 endpoint.
  await page.route("**/api/product-tabs/projections-f4?**",route=>route.fulfill({status:404,json:{error:"QA mock"}}));
  await page.goto(base+"/intelligence/race-cards/?date=2026-11-25&qa=dd-launch6",{waitUntil:"domcontentloaded"});
  await page.locator("#rr-dash-track").waitFor({state:"visible",timeout:20000});
  let yes=0,no=0;
  for(const [track,starts] of expected){
   await page.locator("#rr-dash-track").selectOption({label:track});
   const card=edition.cards.find(c=>c.track===track).card;
   for(const race of card.races){
    await page.locator('#rr-dash-races button[data-race-number="'+race.race_number+'"]').click();
    const direct=page.locator(".rr-bet-launch-dd");
    if(starts.has(race.race_number)){
     assert.equal(await direct.isVisible(),true,track+" R"+race.race_number+" direct launch");
     await direct.click();
     const dialog=page.locator("dialog.rr-bet-dialog");
     await dialog.waitFor({state:"visible"});
     assert.equal(await dialog.getByRole("button",{name:"Daily Double",exact:true}).getAttribute("aria-pressed"),"true");
     assert.match(await dialog.innerText(),new RegExp("LEG 1 · RACE "+race.race_number+"\\b"));
     assert.match(await dialog.innerText(),new RegExp("LEG 2 · RACE "+(race.race_number+1)+"\\b"));
     if(track==="Parx Racing"&&race.race_number===1){
      await dialog.locator(".rr-bet-position").nth(0).locator(".rr-bet-horse-choice").first().click();
      await dialog.locator(".rr-bet-position").nth(1).locator(".rr-bet-horse-choice").first().click();
      assert.match(await dialog.locator(".rr-bet-summary").innerText(),/\d+\.\d+%/);
     }
     await dialog.getByRole("button",{name:"Close Bet Builder"}).click();
     yes++;
    }else{
     assert.equal(await direct.count(),0,track+" R"+race.race_number+" hidden");
     await page.locator(".rr-bet-launch").click();
     const dialog=page.locator("dialog.rr-bet-dialog");
     assert.equal(await dialog.getByRole("button",{name:"Daily Double",exact:true}).count(),0);
     await dialog.getByRole("button",{name:"Close Bet Builder"}).click();no++;
    }
   }
  }
  assert.equal(yes,63);assert.equal(no,13);assert.deepEqual(errors,[]);
  console.log("MOBILE_DD_BROWSER_PASS "+name+" visible="+yes+" hidden="+no);
 }finally{await browser.close()}
}

import { clockHooks } from '../helpers/determinism-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {test,expect} from '../helpers/release-fixture.mjs';
import {open,start,settings,finishWithNativeResume} from '../helpers/player-flow.mjs';
const completePositive=page=>finishWithNativeResume(page,{info:test.info()});
import {ROOT} from '../helpers/config.mjs';
import {localImports,sourceAdapter} from '../helpers/source-adapter.mjs';
const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/support/release-cases.json')));
const vectors=catalog.required_fixture.spawnVectors;
async function prefs(page){await page.addInitScript(()=>localStorage.setItem('threejs-snake-settings',JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',sound:false,haptics:false}})));}
async function wallClock(page){await page.addInitScript(()=>{const ActualDate=Date;window.__utc='2026-10-08T23:59:59.000Z';window.Date=class extends ActualDate{constructor(...args){super(...(args.length?args:[ActualDate.parse(window.__utc)]));}static now(){return ActualDate.parse(window.__utc);}};});}
for(const [intent,first,next]of[['daily','DAILY-2026-10-08','DAILY-2026-10-09'],['DAILY-2026-10-08','DAILY-2026-10-08','DAILY-2026-10-08'],['custom-seed','custom-seed','custom-seed']]){
 test(`ACC-SEED-03 ${intent} captured tuple stays fixed while new Play again/Restart obeys UTC intent`,async({gamePage:page})=>{
  await prefs(page);await wallClock(page);await open(page,`?seed=${intent}&mode=classic&rules=2`);await start(page);
  await expect(page.locator('body')).toHaveAttribute('data-active-seed',first);
  await page.evaluate(()=>window.__utc='2026-10-09T00:00:01.000Z');await completePositive(page);await expect(page.locator('#message strong')).toHaveText(first);
  await page.locator('#actionBtn').click();await expect(page.locator('body')).toHaveAttribute('data-active-seed',next);
  await settings(page);await page.locator('#settingsModeSelector [data-mode="frenzy"]').click();await expect(page.locator('body')).toHaveAttribute('data-active-mode','classic');
  await page.evaluate(()=>window.__utc='2026-10-10T00:00:01.000Z');await page.locator('#settingsRestartBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-active-mode','frenzy');await expect(page.locator('body')).toHaveAttribute('data-active-seed',intent==='daily'?'DAILY-2026-10-10':first);
 });
}
test('ACC-SEED-03 Daily button uses selected mode and title tuple without mutating an active run',async({gamePage:page})=>{
 await prefs(page);await wallClock(page);await open(page);await page.locator('#modeSelector [data-mode="frenzy"]').click();await page.locator('#dailyBtn').click();
 await expect(page.locator('#challengeTuple')).toContainText('Frenzy');await start(page);await expect(page.locator('body')).toHaveAttribute('data-active-mode','frenzy');await expect(page.locator('body')).toHaveAttribute('data-active-category','daily');
});

if(!process.env.RELEASE_DIST)test.describe('bounded simulation fixtures',()=>{
 test.use({sourceHooks:true});
 async function arrange(page){await page.route('**/snake-three.html*',async route=>{
  const response=await route.fetch();const hooks=`const originalHazards=HAZARDS.generatePillars;let countStart=false;window.__startupGenerations=0;HAZARDS.generatePillars=function(...args){if(countStart)window.__startupGenerations++;return originalHazards.apply(this,args);};
   const actualStart=startGame;startGame=function(...args){window.__startupGenerations=0;countStart=true;try{actualStart.apply(this,args);}finally{countStart=false;}window.arrangeNextMovement(100000);};
   window.__seedFixture={
    cells(cells){for(const s of segs)removeSegment(s);segs=cells.map(([x,z],i)=>i?makeBodyCell(x,z):makeHeadCell(x,z));lengthDirty=true;},
    opening(){return {identity:RNG.identity,foodSeed:RNG.foodSeed,hazardSeed:RNG.hazardSeed,foodState:prng.state,hazardState:hazardPrng.state,draws:RNG.stepCount,hazardDraws:RNG.hazardCount,mode:currentMode,seed:RNG.seed,cells:segs.map(s=>[s.x,s.z]),prey:PREY_FX.entities.map(({proximityNear,...e})=>e),food:{...food},food2:{...food2},active:[foodMesh.visible,foodMesh2.visible],pillars:HAZARDS.getPillarPositions(),queue:inputQueue.map(d=>({...d}))};},
    varied(i){food2.x=i%21;food2.z=Math.floor(i/21);foodMesh2.visible=true;Object.assign(PREY_FX.entities[1],{type:'golden',timer:3,hasHopped:true,isHopping:true,hopProgress:.5});},
    demo(){startAttract(true);for(let i=0;i<300;i++)attractStep();},
    vector(v){stopAttract(true);HAZARDS.ON=false;currentMode='classic';BASE_STEP_MS=115;MIN_STEP_MS=62;this.cells(v.occupiedPredicate?Array.from({length:441},(_,i)=>[i%21,Math.floor(i/21)]).filter(([x,z])=>Math.abs(x-10)+Math.abs(z-10)<=4):v.occupiedCells);score=0;setPreyInactive(0);setPreyInactive(1);PREY_FX.forcedType=null;
      const original=gameRandom;let draws=0;
      if(v.scriptedRandom)gameRandom=()=>{if(draws>=v.scriptedRandom.length)throw Error('extra draw');return v.scriptedRandom[draws++];};
      else {RNG.setSeed(JSON.parse(v.identity)[2]);RNG.reset('classic');gameRandom=()=>{draws++;return original();};}
      spawnFood(1,v.forcedCommon);gameRandom=original;return {type:PREY_FX.entities[0].type,x:food.x,z:food.z,randomDraws:draws,foodSeed:RNG.foodSeed};},
    fresh(mode,cells){stopAttract(true);setMode(mode);startGame();HAZARDS.ON=false;HAZARDS.generatePillars(1);RUN_STATS.TARGET_LENGTH=0;this.cells(cells);setPreyInactive(0);setPreyInactive(1);},
    tail(growing){this.fresh('calm',[[1,1],[1,2],[0,2],[0,1]]);dir={x:-1,z:0};food.x=growing?0:5;food.z=growing?1:5;foodMesh.visible=true;step();return {state,outcome:RUN_STATS.lastSummary?.outcome,head:{x:segs[0].x,z:segs[0].z}};},
    seam(){this.fresh('calm',[[20,0],[19,0],[18,0]]);dir={x:1,z:0};food.x=5;food.z=5;foodMesh.visible=true;step();return {state,head:{x:segs[0].x,z:segs[0].z}};},
    last(){const cells=Array.from({length:441},(_,i)=>[i%21,Math.floor(i/21)]).filter(([x,z])=>x!==0||z!==0);const head=cells.findIndex(([x,z])=>x===1&&z===0);[cells[0],cells[head]]=[cells[head],cells[0]];this.fresh('frenzy',cells);food2.x=0;food2.z=0;foodMesh2.visible=true;applyPreyType('common',1);const result=spawnFood(1,true);const before={result,state,primary:foodMesh.visible,secondary:foodMesh2.visible,food2:{...food2}};dir={x:-1,z:0};inputQueue=[];step();return {before,after:{state,score,len:segs.length,outcome:RUN_STATS.lastSummary?.outcome}};},
    one(){this.fresh('calm',Array.from({length:441},(_,i)=>[i%21,Math.floor(i/21)]).filter(([x,z])=>x!==20||z!==20));spawnFood(1,true);return {food:{...food},visible:foodMesh.visible,state};},
    pillar(){this.fresh('classic',[[10,10],[9,10],[8,10]]);HAZARDS.ON=true;HAZARDS.reset();const p=HAZARDS.getPillarPositions()[0];this.cells([[p.x-1,p.z],[p.x-2,p.z],[p.x-3,p.z]]);dir={x:1,z:0};step();return RUN_STATS.lastSummary?.outcome;}
   };`;
  await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL(route.request().url()).origin+'/'),{hooks})});
 });}
 test('ACC-SEED-01 Frenzy openings match after twenty poisoned old secondary states and demo cycles',async({gamePage:page})=>{
  await prefs(page);await arrange(page);await open(page,'?seed=release-regression-42&mode=frenzy&rules=2');await start(page);expect(await page.evaluate(()=>window.__startupGenerations)).toBe(1);await page.keyboard.press('Space');const baseline=await page.evaluate(()=>window.__seedFixture.opening());
  for(let i=0;i<20;i++){await page.evaluate(i=>window.__seedFixture.varied(i),i);await page.locator('#restartRunBtn').click();expect(await page.evaluate(()=>window.__startupGenerations)).toBe(1);await page.keyboard.press('Space');expect(await page.evaluate(()=>window.__seedFixture.opening())).toEqual(baseline);}
  await page.evaluate(()=>window.__seedFixture.demo());await page.keyboard.press('r');expect(await page.evaluate(()=>window.__startupGenerations)).toBe(1);await page.keyboard.press('Space');expect(await page.evaluate(()=>window.__seedFixture.opening())).toEqual(baseline);
 });
 test('ACC-SEED-02 all five catalog spawn vectors match independent reference and exact draw counts',async({gamePage:page})=>{
  await prefs(page);await arrange(page);await open(page,'?seed=release-regression-42&mode=classic');
  for(const vector of vectors){const result=await page.evaluate(v=>window.__seedFixture.vector(v),vector);const {foodSeed,...actual}=result;expect(actual,vector.name).toEqual(vector.expected);if(vector.foodStreamSeed)expect(foodSeed).toBe(vector.foodStreamSeed);}
 });
 test('ACC-SEED-02 tail handoff growth collision wrap pillar and last-free two-prey board semantics',async({gamePage:page})=>{
  await prefs(page);await arrange(page);await open(page,'?seed=board-fixture&mode=classic');
  const safe=await page.evaluate(()=>window.__seedFixture.tail(false));expect(safe.state).toBe('playing');expect(safe.head).toEqual({x:0,z:1});
  expect((await page.evaluate(()=>window.__seedFixture.tail(true))).outcome).toBe('self');
  expect((await page.evaluate(()=>window.__seedFixture.seam())).head).toEqual({x:0,z:0});
  expect(await page.evaluate(()=>window.__seedFixture.pillar())).toBe('pillar');
  expect(await page.evaluate(()=>window.__seedFixture.one())).toMatchObject({food:{x:20,z:20},visible:true,state:'playing'});
  const last=await page.evaluate(()=>window.__seedFixture.last());expect(last.before).toMatchObject({result:true,state:'playing',primary:false,secondary:true,food2:{x:0,z:0}});expect(last.after).toMatchObject({state:'over',len:441,outcome:'board'});expect(last.after.score).toBeGreaterThan(0);
 });
});


async function clockPrefs(page){await page.addInitScript(()=>localStorage.setItem('threejs-snake-settings',JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',sound:false,haptics:false}})));}
async function clock(page){await clockPrefs(page);await page.route('**/snake-three.html*',async route=>{const response=await route.fetch();await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL(route.request().url()).origin+'/'),{hooks:clockHooks})});});await open(page,'?seed=clock-vector&mode=classic&rules=2');}

if(!process.env.RELEASE_DIST)test.describe('simulation replay cadence',()=>{
 test.use({sourceHooks:true});
 test('ACC-SEED-04 movement-indexed replay matches all modes tiers and frame cadences',async({gamePage:page})=>{
  await clock(page);
  for(const mode of['classic','calm','frenzy']){let expected;
   for(const tier of['low','balanced','high'])for(const frames of[[1000/30],[1000/60],[1000/120],[17,83,4,211,32],[250],[125,125]]){
    const actual=await page.evaluate(({mode,tier,frames})=>window.__clock.replay(mode,tier,frames),{mode,tier,frames});if(!expected)expected=actual;expect(actual,mode+' '+tier+' '+frames).toEqual(expected);
   }
  }
 });
});

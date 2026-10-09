import fs from 'node:fs';
import path from 'node:path';
import {test,expect} from '../helpers/release-fixture.mjs';
import {open,start,settings,finishWithNativeResume} from '../helpers/player-flow.mjs';
const completePositive=page=>finishWithNativeResume(page,{info:test.info()});
import {ROOT} from '../helpers/config.mjs';
import {localImports,sourceAdapter} from '../helpers/source-adapter.mjs';
const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'plans/public-release.acceptance.json')));
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
   const actualStart=startGame;startGame=function(){window.__startupGenerations=0;countStart=true;try{actualStart();}finally{countStart=false;}stepMs=100000;};
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

const clockHooks="const liveFrame=SIMULATION.frame.bind(SIMULATION);SIMULATION.frame=()=>{};\nwindow.__clock={\n snap(){return {now:SIMULATION.simNowMs,moves:SIMULATION.movements,next:SIMULATION.nextMoveMs,acc,mode:currentMode,state,score,stepMs,dir:{...dir},cells:segs.map(s=>[s.x,s.z]),food:{...food},food2:{...food2},prey:PREY_FX.entities.map(e=>({type:e.type,deadline:e.deadlineMs,hasHopped:e.hasHopped})),combo:{streak:COMBO_FX.streak,mult:COMBO_FX.multiplier,deadline:COMBO_FX.deadlineMs},rng:{food:prng.state,foodCount:RNG.stepCount,hazards:hazardPrng.state,hazardCount:RNG.hazardCount},metrics:{time:RUN_STATS.timeAlive,maxSpeed:RUN_STATS.maxSpeedLevel,maxCombo:RUN_STATS.maxCombo,food:{...RUN_STATS.foodBreakdown}},summary:RUN_STATS.lastSummary?{outcome:RUN_STATS.lastSummary.outcome,score:RUN_STATS.lastSummary.score,timeMs:RUN_STATS.lastSummary.timeMs}:null};},\n cells(cells){for(const s of segs)removeSegment(s);segs=cells.map(([x,z],i)=>i?makeBodyCell(x,z):makeHeadCell(x,z));},\n fresh(mode='classic',interval=100000){setMode(mode);challengeSelection.seedIntent='custom';RNG.setSeed('clock-vector');HAZARDS.ON=true;startGame();HAZARDS.ON=false;RUN_STATS.TARGET_LENGTH=0;stepMs=interval;SIMULATION.reset();COMBO_FX.reset();setPreyInactive(0);setPreyInactive(1);this.cells([[10,10],[9,10],[8,10]]);dir={x:1,z:0};inputQueue=[];},\n prey(i,type,x,z){Object.assign(i?food2:food,{x,z});(i?foodMesh2:foodMesh).visible=true;applyPreyType(type,i);},\n advance(ms){SIMULATION.advanceTo(ms);return this.snap();},\n frame(ms){liveFrame(ms);return this.snap();},\n golden(time){this.fresh('classic',time);this.prey(0,'golden',11,10);return this.advance(time);},\n combo(offset){this.fresh();COMBO_FX.onEat();const deadline=COMBO_FX.deadlineMs;this.prey(0,'common',11,10);SIMULATION.nextMoveMs=deadline+offset;return this.advance(deadline+offset);},\n windows(){this.fresh();const result=[];for(let i=0;i<5;i++){COMBO_FX.onEat();result.push(COMBO_FX.deadlineMs-SIMULATION.simNowMs);}return result;},\n paused(){this.fresh('frenzy',100);this.prey(0,'golden',18,18);this.prey(1,'jittery',12,10);COMBO_FX.onEat();this.advance(100);const before=this.snap(),hop=PREY_FX.entities[1].hopProgress;pauseGame();this.frame(200);this.advance(20000);drawFood(.2);const after=this.snap();const pausedHop=PREY_FX.entities[1].hopProgress;resumeGame();this.frame(50);return {before,after,hop,pausedHop,resumed:this.snap()};},\n jitter(){this.fresh('frenzy',100);this.prey(0,'jittery',11,11);this.prey(1,'jittery',11,9);this.advance(100);return this.snap();},\n blocked(){this.fresh('classic',100);this.prey(0,'jittery',11,11);HAZARDS.ON=true;const original=HAZARDS.getPillarPositions;HAZARDS.getPillarPositions=()=>[{x:12,z:11},{x:10,z:11},{x:11,z:12}];this.advance(100);const first=this.snap();drawFood(.1);const render=this.snap();HAZARDS.getPillarPositions=()=>[];this.advance(200);const second=this.snap();HAZARDS.getPillarPositions=original;return {first,render,second};},\n speed(){this.fresh('classic',115);score=20;this.prey(0,'common',11,10);const ate=this.advance(115);const before=this.advance(225);const due=this.advance(226);return {ate,before,due};},\n render(){this.fresh('frenzy',100000);this.prey(0,'golden',12,10);this.prey(1,'jittery',10,12);COMBO_FX.onEat();const before=this.snap();for(let i=0;i<30;i++){drawFood(.1);drawSnake(.3,.1);drawCamera(.1);COMBO_FX.update(.1);renderFrame();}return {before,after:this.snap()};},\n collision(){this.fresh('classic',115);this.cells([[20,10],[19,10],[18,10]]);return this.advance(230);},\n demo(){this.fresh('classic',100000);this.frame(32.5);const protectedState=()=>({now:SIMULATION.simNowMs,fraction:SIMULATION.fractionMs,next:SIMULATION.nextMoveMs,last:SIMULATION.lastMoveMs,moves:SIMULATION.movements,rng:prng.state,count:RNG.stepCount,time:RUN_STATS.timeAlive});const before=protectedState();startAttract(true);this.prey(0,'golden',18,18);activeClock().nextMoveMs=100000;activeClock().advanceTo(6000);const expired=PREY_FX.entities[0].type;resetAttract();this.prey(0,'jittery',11,11);activeClock().advanceTo(135);const hopped=PREY_FX.entities[0].hasHopped;drawFood(.05);const hop=PREY_FX.entities[0].hopProgress;SETTINGS.open();drawFood(1);const suspendedHop=PREY_FX.entities[0].hopProgress;SETTINGS.close();for(let i=0;i<12;i++){resetAttract();activeClock().advanceTo(150000);}const after=protectedState();stopAttract(true);return {before,after,restored:protectedState(),expired,hopped,hop,suspendedHop};},\n replay(mode,tier,frames){this.fresh(mode,MODES[mode].baseStepMs);SETTINGS.set('quality',tier);let frameIndex=0;const originalStep=step;step=()=>{const h=segs[0];let d=dir;if(h.x===14&&d.x===1)d={x:0,z:1};else if(h.z===14&&d.z===1)d={x:-1,z:0};else if(h.x===8&&d.x===-1)d={x:0,z:-1};else if(h.z===8&&d.z===-1)d={x:1,z:0};inputQueue=[d];if(SIMULATION.movements%3===1){this.prey(0,SIMULATION.movements%9===1?'golden':'common',h.x+d.x,h.z+d.z);}originalStep();};\n const snapshots=[];for(let target=500;target<=4000;target+=500){while(state==='playing'&&SIMULATION.simNowMs<target){const ms=Math.min(frames[frameIndex++%frames.length],target-SIMULATION.simNowMs-SIMULATION.fractionMs);if(ms<=0){SIMULATION.fractionMs=0;this.advance(target);break;}this.frame(ms);}snapshots.push(this.snap());}step=originalStep;return snapshots;}\n};";
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

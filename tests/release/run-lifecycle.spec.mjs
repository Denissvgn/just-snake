import {test,expect} from '../helpers/release-fixture.mjs';
import {open,start,finishWithNativeResume,settings} from '../helpers/player-flow.mjs';
const completePositive=page=>finishWithNativeResume(page,{info:test.info()});
import {sourceAdapter,localImports} from '../helpers/source-adapter.mjs';
const query='?seed=run-lifecycle&mode=classic&rules=2';
async function preferences(page){await page.addInitScript(()=>{
 localStorage.setItem('threejs-snake-settings',JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',haptics:false,sound:false}}));
});}
async function clipboard(page,deferred=false){await page.addInitScript(deferred=>{
 window.__copies=[];window.__finishCopy=null;
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{window.__copies.push(text);return deferred?new Promise(resolve=>window.__finishCopy=resolve):Promise.resolve();}}});
},deferred);}

test('ACC-RUN-02 real summary actions are state-bound and one click toggles/copies once',async({gamePage:page})=>{
 await preferences(page);await clipboard(page);await open(page,query);
 for(const id of ['shareBtn','leaderboardBtn'])await expect(page.locator('#'+id)).toBeHidden();
 await start(page);await page.keyboard.press('Space');
 for(const id of ['shareBtn','leaderboardBtn'])await expect(page.locator('#'+id)).toBeHidden();
 await expect(page.locator('body')).toHaveAttribute('data-screen','paused');
 await expect(page.locator('#title')).toHaveText('Paused');await expect(page.locator('#actionBtn')).toHaveText('Resume');await expect(page.locator('#actionBtn')).toBeVisible();await expect(page.locator('#actionBtn')).toBeEnabled();
 await page.locator('#actionBtn').click();await completePositive(page);
 await expect(page.locator('#shareBtn')).toBeVisible();await expect(page.locator('#leaderboardBtn')).toBeVisible();
 await page.locator('#shareBtn').click();await expect(page.locator('#shareStatus')).toHaveText('Challenge copied.');
 expect(await page.evaluate(()=>window.__copies.length)).toBe(1);
 await page.locator('#leaderboardBtn').click();await expect(page.locator('.lb-title')).toBeVisible();
 await page.locator('#leaderboardBtn').click();await expect(page.locator('.summary-grid')).toBeVisible();
 await page.locator('#actionBtn').click();for(const id of ['shareBtn','leaderboardBtn'])await expect(page.locator('#'+id)).toBeHidden();
});

test('ACC-RUN-03 restart during delayed death and stale clipboard completion cannot alter new run',async({gamePage:page})=>{
 await preferences(page);await clipboard(page,true);await open(page,query);await start(page);
 await expect(page.locator('body')).toHaveAttribute('data-screen','summary',{timeout:15000});
 // Summary owner changes immediately; R starts before the delayed overlay can focus an old action.
 await page.keyboard.press('r');await expect(page.locator('body')).toHaveAttribute('data-screen','playing');
 await page.keyboard.press('Space');await expect(page.locator('body')).toHaveAttribute('data-screen','paused');
 await page.waitForTimeout(600);await expect(page.locator('#title')).toHaveText('Paused');
 await page.locator('#actionBtn').click();await completePositive(page);await page.locator('#shareBtn').click();
 expect(await page.evaluate(()=>window.__copies.length)).toBe(1);
 await page.locator('#actionBtn').click();await page.keyboard.press('Space');
 await page.evaluate(()=>window.__finishCopy());await page.waitForTimeout(20);
 await expect(page.locator('#title')).toHaveText('Paused');await expect(page.locator('#shareBtn')).toBeHidden();
 await expect(page.locator('#shareBtn')).toHaveText('Share run 📋');
});

if(!process.env.RELEASE_DIST)test.describe('authoritative player arrangements',()=>{
 test.use({sourceHooks:true});
 async function arrange(page){await page.route('**/snake-three.html*',async route=>{
  const response=await route.fetch();const hooks=`const begin=startGame;startGame=function(){begin();stepMs=100000;};
   window.__runScenario={
    eat(type){applyPreyType(type,0);food.x=segs[0].x+dir.x;food.z=segs[0].z+dir.z;step();stepMs=100000;},
    snapshot(){return {run:RUN_STATS.run,priorBest:RUN_STATS.priorBest,score,length:segs.length,time:RUN_STATS.timeAlive,food:{...RUN_STATS.foodBreakdown},maxSpeed:RUN_STATS.maxSpeedLevel,maxCombo:RUN_STATS.maxCombo};},
    finish(){HUD_FX.speedLevel=999;const before=RUN_STATS.timeAlive;const a=RUN_STATS.finalize('wall');const b=RUN_STATS.finalize('target');return {before,a,b,same:a===b,frozen:Object.isFrozen(a)&&Object.isFrozen(a.foodBreakdown)&&Object.isFrozen(a.descriptor),rows:RUN_STATS.getLeaderboard().length};},
    poison(){best=99999;},bindings(){RUN_STATS.init();RUN_STATS.setupUI();RUN_STATS.setupUI();},
    stale(){DEATH.OVERLAY_DELAY_MS=1000;showDeathOverlay('Old run','Old callback','Old action');}
   };`;
  await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL(route.request().url()).origin+'/'),{hooks})});
 });}
 test('ACC-RUN-01 exact authoritative player metrics deep-frozen descriptor and idempotent finalization',async({gamePage:page})=>{
  await preferences(page);await arrange(page);await page.addInitScript(()=>{window.__recordWrites=0;const put=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='threejs-snake-scores-v2')window.__recordWrites++;return put.call(this,key,value);};});
  await open(page,query);await page.evaluate(()=>{window.__recordWrites=0;window.__runScenario.poison();});await start(page);
  const initial=await page.evaluate(()=>window.__runScenario.snapshot());expect(initial.priorBest).toBe(0);expect(initial.run).toMatchObject({rulesVersion:2,kind:'player',mode:'classic',seed:'run-lifecycle',category:'custom',isDaily:false,dailyDate:null});
  for(const type of ['common','golden','jittery'])await page.evaluate(type=>window.__runScenario.eat(type),type);
  await page.keyboard.press('Space');const paused=await page.evaluate(()=>window.__runScenario.snapshot());await page.waitForTimeout(60);expect((await page.evaluate(()=>window.__runScenario.snapshot())).time).toBe(paused.time);
  await page.locator('#actionBtn').click();await page.keyboard.press('Space');
  const done=await page.evaluate(()=>window.__runScenario.finish());
  expect(done.same).toBe(true);expect(done.frozen).toBe(true);expect(done.rows).toBe(1);expect(await page.evaluate(()=>window.__recordWrites)).toBe(1);
  expect(done.a).toMatchObject({score:150,finalScore:150,length:6,finalLength:6,maxCombo:3,maxSpeedLevel:6,outcome:'wall',deathReason:'wall',isNewBest:true,foodBreakdown:{common:1,golden:1,jittery:1,total:3}});
  expect(done.a.timeMs).toBe(Math.round(done.before*1000));expect(done.a.runId).toBe(initial.run.runId);expect(done.a.date).toBe(done.b.date);
  await page.keyboard.press('r');const next=await page.evaluate(()=>window.__runScenario.snapshot());expect(next.run.runId).not.toBe(initial.run.runId);expect(next.priorBest).toBe(150);expect(next.food.total).toBe(0);expect(next.score).toBe(0);
 });
 test('ACC-RUN-02 repeated initialization cannot multiply actual summary listeners',async({gamePage:page})=>{
  await preferences(page);await clipboard(page);await arrange(page);await open(page,query);await start(page);await page.keyboard.press('Space');
  await page.evaluate(()=>{window.__runScenario.bindings();window.__runScenario.finish();});
  // A source-arranged finalize provides an otherwise real, visible completed summary.
  await page.evaluate(()=>document.getElementById('overlay').classList.remove('hidden'));
  await page.locator('#shareBtn').click();expect(await page.evaluate(()=>window.__copies.length)).toBe(1);
  await page.locator('#leaderboardBtn').click();await expect(page.locator('.lb-title')).toBeVisible();
 });
 test('ACC-RUN-03 old run-id timer is canceled before real modal Restart',async({gamePage:page})=>{
  await preferences(page);await arrange(page);await open(page,query);await start(page);await settings(page);
  const before=await page.evaluate(()=>window.__runScenario.snapshot());await page.evaluate(()=>window.__runScenario.stale());await page.locator('#settingsRestartBtn').click();
  const after=await page.evaluate(()=>window.__runScenario.snapshot());expect(after.run.runId).not.toBe(before.run.runId);
  await page.keyboard.press('Space');await page.waitForTimeout(1100);await expect(page.locator('#title')).toHaveText('Paused');
 });
});

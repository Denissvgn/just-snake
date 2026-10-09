import {test,expect} from '../helpers/release-fixture.mjs';
import {open,settings} from '../helpers/player-flow.mjs';
import {localImports,sourceAdapter} from '../helpers/source-adapter.mjs';
const query='?seed=armed-player&mode=classic&rules=2';
async function seed(page){await page.addInitScript(()=>{
 localStorage.setItem('threejs-snake-settings',JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',sound:false,haptics:false,keymap:'ijkl'}}));
 localStorage.setItem('threejs-snake-best','37');localStorage.setItem('preserved-custom-key','bytes untouched');
});}
const storage=page=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));

test('ACC-DEMO-02 ordinary title cycles preserve exact storage/HUD then mapped direction starts fresh player',async({gamePage:page})=>{
 await seed(page);await open(page,query);const bytes=await storage(page);const hud=await page.locator('#ui').textContent();
 const cycle=Number(await page.locator('body').getAttribute('data-demo-cycle'));
 for(let i=0;i<2;i++){await page.waitForTimeout(500);await settings(page);await page.keyboard.press('Escape');}
 expect(Number(await page.locator('body').getAttribute('data-demo-cycle'))).toBeGreaterThanOrEqual(cycle+2);
 expect(await storage(page)).toEqual(bytes);await expect(page.locator('#ui')).toHaveText(hud);await expect(page.locator('body')).toHaveAttribute('data-screen','title');
 await page.keyboard.press('i');await expect(page.locator('body')).toHaveAttribute('data-screen','playing');
 await page.keyboard.press('Space');await expect(page.locator('#pauseTelemetry')).toHaveText(/Score: 0 · Length: 3 · Time:/);
 await expect(page.locator('#shareBtn')).toBeHidden();expect(await storage(page)).toEqual(bytes);
});

if(!process.env.RELEASE_DIST)test.describe('demo state arrangements',()=>{
 test.use({sourceHooks:true});
 async function arrange(page){await page.route('**/snake-three.html*',async route=>{
  const response=await route.fetch();const hooks=`const realPlayerStart=startGame;startGame=function(){realPlayerStart();stepMs=100000;};
  window.__demoScenario={
   protected(){const saved=ATTRACT.context?.saved;return JSON.stringify({run:RUN_STATS.run,summary:RUN_STATS.lastSummary,time:RUN_STATS.timeAlive,food:RUN_STATS.foodBreakdown,maxCombo:RUN_STATS.maxCombo,maxSpeed:RUN_STATS.maxSpeedLevel,prior:RUN_STATS.priorBest,best,seed:RNG.seed,initial:RNG.initialSeed,state:prng.state,draws:RNG.stepCount,combo:[COMBO_FX.streak,COMBO_FX.multiplier,COMBO_FX.timer],hud:[scoreEl.textContent,bestEl.textContent,HUD_FX.speedLevel,HUD_FX.speedProgress,HUD_FX.comboMultiplier],cells:(saved?.segs||segs).map(s=>[s.x,s.z]),prey:(saved?.prey||PREY_FX.entities).map(e=>({...e})),storage:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))});},
   playerRng(){return {seed:RNG.seed,state:prng.state,draws:RNG.stepCount};},
   opening(){return {descriptor:{...RUN_STATS.run,runId:null},cells:segs.map(s=>[s.x,s.z]),dir:{...dir},food:{...food},food2:{...food2},prey:PREY_FX.entities.map(({proximityNear,...logical})=>logical),pillars:HAZARDS.getPillarPositions(),queue:inputQueue.map(d=>({...d})),seed:RNG.seed,state:prng.state,draws:RNG.stepCount};},
   finishPlayer(){gameOver('wall');}, start(mode){startAttract(true,mode);},
   terminal(reason){reason==='target'||reason==='board'?winGame(reason):gameOver(reason);},
   loop(n){for(let i=0;i<n;i++)attractStep();for(let i=0;i<50;i++)updateAttract(.27);return {acc:ATTRACT.acc,cycle:ATTRACT.cycle,moves:ATTRACT.movements,title:titleEl.textContent,screen:UI_SCREEN.screen,active:ATTRACT.active};},
   candidateGrowth(){currentMode='frenzy';foodMesh2.visible=true;segs[0].x=10;segs[0].z=10;const tail=segs.at(-1);tail.x=10;tail.z=11;food.x=2;food.z=2;food2.x=10;food2.z=11;return evaluateCandidateMove(segs[0],{x:0,z:1},food).valid;},
   trap(){while(segs.length<5)segs.push(makeBodyCell(0,0));const cells=[[10,10],[11,10],[10,9],[9,10],[10,11]];cells.forEach((p,i)=>{segs[i].x=p[0];segs[i].z=p[1];});food.x=10;food.z=11;dir={x:1,z:0};const before=ATTRACT.cycle;attractStep();return ATTRACT.cycle>before;},
   pillar(){const p=HAZARDS.getPillarPositions()[0];if(!p)return;segs[0].x=p.x-1;segs[0].z=p.z;dir={x:1,z:0};step();},
   takeover(){return {seed:RNG.seed,run:RUN_STATS.run,score,length:segs.length,queue:inputQueue.map(d=>({...d})),time:RUN_STATS.timeAlive};}
  };
  window.__demoAudio=0;const ensure=AUDIO.ensureCtx;AUDIO.ensureCtx=function(){window.__demoAudio++;return ensure.call(this);};window.__demoHaptic=0;Object.defineProperty(navigator,'vibrate',{configurable:true,value:()=>{window.__demoHaptic++;return true;}});`;
  await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL(route.request().url()).origin+'/'),{hooks})});
 });}
 test('ACC-DEMO-01 all-mode 3000-step stress and real terminals keep player context/RNG/HUD/storage byte-identical',async({gamePage:page})=>{
  await seed(page);await arrange(page);await open(page,query);await page.locator('#actionBtn').click();await page.keyboard.press('Space');
  await page.evaluate(()=>{window.__demoScenario.finishPlayer();window.SETTINGS.set('sound',true);window.SETTINGS.set('haptics',true);});
  const before=await page.evaluate(()=>window.__demoScenario.protected());
  await page.evaluate(()=>{window.__demoAudio=0;window.__demoHaptic=0;});
  for(const mode of ['calm','classic','frenzy']){
   await page.evaluate(mode=>window.__demoScenario.start(mode),mode);
   for(const reason of ['wall','self','pillar','target','board'])await page.evaluate(reason=>window.__demoScenario.terminal(reason),reason);
   if(mode!=='calm')await page.evaluate(()=>window.__demoScenario.pillar());
   expect(await page.evaluate(()=>window.__demoScenario.trap())).toBe(true);
   const result=await page.evaluate(()=>window.__demoScenario.loop(3000));
   expect(result.acc).toBeGreaterThanOrEqual(0);expect(result.screen).toBe('title');expect(result.active).toBe(true);expect(result.title).not.toBe('Game Over');
   expect(await page.evaluate(()=>window.__demoScenario.protected())).toBe(before);
  }
  expect(await page.evaluate(()=>window.__demoAudio)).toBe(0);expect(await page.evaluate(()=>window.__demoHaptic)).toBe(0);
  expect(await page.evaluate(()=>window.__demoScenario.candidateGrowth())).toBe(false);
 });
 test('ACC-DEMO-02 demo cycles leave exposed player RNG stream and armed tuple untouched before real takeover',async({gamePage:page})=>{
  await seed(page);await arrange(page);await open(page,query);
  await page.keyboard.press('i');const baseline=await page.evaluate(()=>window.__demoScenario.opening());
  await page.keyboard.press('Space');await page.locator('#returnTitleBtn').click();
  const seedBefore=await page.evaluate(()=>window.__demoScenario.playerRng());
  await page.evaluate(()=>window.__demoScenario.loop(500));
  expect(await page.evaluate(()=>window.__demoScenario.playerRng())).toEqual(seedBefore);
  await page.keyboard.press('i');const opening=await page.evaluate(()=>window.__demoScenario.opening());expect(opening).toEqual(baseline);
  expect(opening.queue).toEqual([{x:0,z:-1}]);await page.keyboard.press('Space');
  const player=await page.evaluate(()=>window.__demoScenario.takeover());expect(player.run).toMatchObject({kind:'player',mode:'classic',seed:'armed-player'});expect(player.score).toBe(0);expect(player.length).toBe(3);
 });
});

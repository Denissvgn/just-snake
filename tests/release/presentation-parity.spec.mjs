import { test, expect } from '../helpers/release-fixture.mjs';
import { open } from '../helpers/player-flow.mjs';
import { attachPresentationEvidence } from '../helpers/presentation-evidence.mjs';
import { sourceAdapter } from '../helpers/source-adapter.mjs';
import { clockHooks } from '../helpers/determinism-fixture.mjs';

async function prefs(page) { await page.addInitScript(() => localStorage.setItem('threejs-snake-settings', JSON.stringify({ schemaVersion:2,
  values:{quality:'low',aa:'none',sound:false,haptics:false,reducedMotion:true} }))); }

test('ACC-PRES-02 actual selectable views restore one canvas and context through ordinary title controls', async ({gamePage:page}, info) => {
  await prefs(page); await open(page,'?seed=presentation-parity&mode=classic&rules=2');
  const handle=await page.evaluateHandle(()=>document.querySelector('canvas').getContext('webgl2'));
  try { for(const id of ['original','neon-district','original']){
    await page.locator(`#presentationSelector [data-presentation-choice="${id}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-presentation',id);
    await attachPresentationEvidence(page,info,id);
    expect(await page.locator('canvas').count()).toBe(1);
    expect(await page.evaluate(gl=>gl===document.querySelector('canvas').getContext('webgl2'),handle)).toBe(true);
  }} finally { await handle.dispose(); }
});

const parityHooks=clockHooks+`
const parityBaseSnapshot=window.__clock.snap.bind(window.__clock);
window.__presentationReplay={
 park(){renderer.setAnimationLoop(null);RESIZE.cancel();tuned=2;},
 async select(id){if(state==='playing')pauseGame();PRESENTATION.request(id,{persist:false});
  for(let i=0;i<200&&PRESENTATION.effective!==id&&!PRESENTATION.loadFailed;i++)await new Promise(resolve=>setTimeout(resolve,10));
  if(PRESENTATION.effective!==id)throw Error('Actual presentation did not select '+id);
  this.draw();
 },
 draw(){const tuple=PRESENTATION.resolveView();if(lengthDirty)applyLengthStyle();drawSnake(1,0);drawFood(0);drawCamera(0);
  if(PRESENTATION.effective==='neon-district'){const f=PRESENTATION.snapshot(1);PRESENTATION.view.setPresentationOptions(f.options);PRESENTATION.view.sync(f);}
  renderFrame(tuple);renderer.getContext().finish();
  if(document.body.dataset.presentationRendered!==PRESENTATION.effective)throw Error('Actual view draw witness missing');
 },
 detailed(normalize=false){const run=RUN_STATS.run?{...RUN_STATS.run}:null,summary=RUN_STATS.lastSummary?{...RUN_STATS.lastSummary,descriptor:{...RUN_STATS.lastSummary.descriptor}}:null;
  if(normalize){if(run)delete run.runId;if(summary){delete summary.runId;delete summary.completedAt;delete summary.date;delete summary.descriptor.runId;}}
  const result={...parityBaseSnapshot(),cells:segs.map(s=>[s.x,s.z,s.px,s.pz]),active:[foodMesh.visible,foodMesh2.visible],
   pillars:HAZARDS.getPillarPositions(),hazardsEnabled:HAZARDS.ON,
   queue:inputQueue.map(d=>({...d})),
   prey:PREY_FX.entities.map(e=>({type:e.type,timer:e.timer,maxTimer:e.maxTimer,deadline:e.deadlineMs,hasHopped:e.hasHopped,isHopping:e.isHopping,hopProgress:e.hopProgress,hopStartX:e.hopStartX,hopStartZ:e.hopStartZ,hopTargetX:e.hopTargetX,hopTargetZ:e.hopTargetZ})),
   clock:{now:SIMULATION.simNowMs,fraction:SIMULATION.fractionMs,next:SIMULATION.nextMoveMs,last:SIMULATION.lastMoveMs,movements:SIMULATION.movements},
   rng:{seed:RNG.seed,initialSeed:RNG.initialSeed,isDaily:RNG.isDaily,identity:RNG.identity,foodSeed:RNG.foodSeed,hazardSeed:RNG.hazardSeed,stepCount:RNG.stepCount,hazardCount:RNG.hazardCount,foodState:prng.state,hazardState:hazardPrng.state},
   combo:{on:COMBO_FX.ON,streak:COMBO_FX.streak,multiplier:COMBO_FX.multiplier,maxMultiplier:COMBO_FX.maxMultiplier,timer:COMBO_FX.timer,deadline:COMBO_FX.deadlineMs,duration:COMBO_FX.duration,bestStreak:COMBO_FX.bestStreak},
   metrics:{on:RUN_STATS.ON,targetLength:RUN_STATS.TARGET_LENGTH,timeAlive:RUN_STATS.timeAlive,maxSpeedLevel:RUN_STATS.maxSpeedLevel,maxCombo:RUN_STATS.maxCombo,foodBreakdown:{...RUN_STATS.foodBreakdown},currentSeed:RUN_STATS.currentSeed,isDaily:RUN_STATS.isDaily,priorBest:RUN_STATS.priorBest},
   share:{challenge:RUN_STATS.run?RUN_STATS.challengeURL(RUN_STATS.run):null,text:RUN_STATS.formatShareText(summary),viewingLeaderboard:RUN_STATS.viewingLeaderboard,rankingFilter:RUN_STATS.rankingFilter,...(normalize?{}:{attempt:RUN_STATS.shareAttempt,pendingTimers:RUN_STATS.timers.size,screen:UI_SCREEN.screen,settings:SETTINGS.isOpen,rankings:NEON_RANKINGS.isOpen})},
   identity:RNG.identity,seed:RNG.seed,rules:2,seedIntent:challengeSelection.seedIntent,run,summary};
  const defined=(value,label)=>{if(value===undefined)throw Error('Missing parity field '+label);if(value&&typeof value==='object')for(const [key,child]of Object.entries(value))defined(child,label+'.'+key);};
  defined(result,'snapshot');
  return result;
 },
 isolatedStore(){COMBO_FX.bestStreak=0;SCORE_STORE.memory.records=[];SCORE_STORE.seen.clear();SCORE_STORE.persist();},
 async replay(id,mode,tier,frames){await this.select(id);this.isolatedStore();const originalSnap=window.__clock.snap;
  window.__clock.snap=()=>{this.draw();return this.detailed(true);}; // installed only while the engine fixture asks for snapshots
  try{return window.__clock.replay(mode,tier,frames);}finally{window.__clock.snap=originalSnap;}
 },
 async events(id){await this.select(id);this.isolatedStore();const rows=[];const capture=name=>{this.draw();rows.push({event:name,snapshot:this.detailed(true)});};
  window.__clock.fresh('classic',6000);window.__clock.prey(0,'golden',11,10);capture('golden-before-expiry');SIMULATION.advanceTo(6000);capture('golden-equality');
  window.__clock.fresh('frenzy',100);window.__clock.prey(0,'jittery',11,11);window.__clock.prey(1,'jittery',11,9);SIMULATION.advanceTo(100);capture('dual-jitter-hop');
  window.__clock.fresh('classic',115);HAZARDS.ON=true;HAZARDS.reset();const p=HAZARDS.getPillarPositions()[0];window.__clock.cells([[p.x-1,p.z],[p.x-2,p.z],[p.x-3,p.z]]);dir={x:1,z:0};SIMULATION.advanceTo(115);capture('real-pillar-terminal');
  window.__clock.collision();capture('wall-terminal');return rows;
 },
 async exactSwitch(){await this.select('original');window.__clock.fresh('frenzy',100);
  window.__clock.prey(0,'golden',18,18);window.__clock.prey(1,'jittery',11,11);COMBO_FX.onEat();COMBO_FX.onEat();
  SIMULATION.advanceTo(100);this.draw();pauseGame();
  // Intentional pause clears native pending input; a labelled source arrangement restores two pending directions before the exact switch boundary.
  inputQueue=[{x:0,z:1},{x:-1,z:0}];this.draw();
  const before=this.detailed(false),stored=localStorage.getItem(SCORE_KEY);
  for(const id of ['neon-district','original','neon-district']){await this.select(id);this.draw();
   if(JSON.stringify(this.detailed(false))!==JSON.stringify(before)||localStorage.getItem(SCORE_KEY)!==stored)throw Error('Midrun presentation changed exact player state');}
  return {before,after:this.detailed(false),stored,afterStored:localStorage.getItem(SCORE_KEY),view:PRESENTATION.effective};
 }
};
`;

if(!process.env.RELEASE_DIST){
 async function arrange(page){await prefs(page);await page.route('**/snake-three.html*',async route=>{const response=await route.fetch();
  await route.fulfill({response,body:sourceAdapter(await response.text(),{hooks:parityHooks})});});
  await open(page,'?seed=presentation-parity&mode=classic&rules=2');
  for(const id of ['original','neon-district']){await page.locator(`#presentationSelector [data-presentation-choice="${id}"]`).click();await expect(page.locator('body')).toHaveAttribute('data-presentation',id);await attachPresentationEvidence(page,test.info(),id);}
  await page.evaluate(()=>window.__presentationReplay.park());
 }
 test('ACC-PRES-03 exact deterministic replay matches both actual views at11 mode tier cadence configurations',async({gamePage:page},info)=>{
  await arrange(page);const rows=[];
  const cases=['calm','classic','frenzy'].flatMap(mode=>[30,60,120].map(fps=>({mode,tier:'low',fps}))).concat([{mode:'classic',tier:'balanced',fps:60},{mode:'classic',tier:'high',fps:60}]);
  for(const config of cases){const pair=[];for(const id of ['original','neon-district'])pair.push(await page.evaluate(({id,mode,tier,fps})=>window.__presentationReplay.replay(id,mode,tier,[1000/fps]),{id,...config}));
   expect(pair[1],JSON.stringify(config)).toEqual(pair[0]);rows.push({...config,original:pair[0],neon:pair[1]});}
  await info.attach('presentation-replay-parity',{body:JSON.stringify({method:'Shared existing movement-indexed source fixture, identical isolated store per fresh replay; fresh isolated store and bestStreak setup; normalize only newly created runId and completedAt/date aliases, actual selected view render witness. All engine/game fields compared.',rows}),contentType:'application/json'});
 });
 test('ACC-PRES-03 active golden expiry dual jitter hops and real pillar wall terminal outcomes match both views',async({gamePage:page},info)=>{
  await arrange(page);const pair=[];for(const id of ['original','neon-district'])pair.push(await page.evaluate(id=>window.__presentationReplay.events(id),id));
  expect(pair[1]).toEqual(pair[0]);const [golden,expired,hop,pillar,wall]=pair[0];
  expect(golden.snapshot.prey[0]).toMatchObject({type:'golden',deadline:6000});expect(expired.snapshot.score).toBe(10);
  expect(hop.snapshot.prey.filter(p=>p.hasHopped)).toHaveLength(2);expect(hop.snapshot.active).toEqual([true,true]);
  expect(pillar.snapshot.pillars.length).toBeGreaterThan(0);expect(pillar.snapshot.summary).toMatchObject({outcome:'pillar',rulesVersion:2,mode:'classic'});
  expect(wall.snapshot.summary).toMatchObject({outcome:'wall',rulesVersion:2,mode:'classic'});await info.attach('presentation-event-parity',{body:JSON.stringify({normalization:'Only independentrunIDs andcompletiondate aliases',original:pair[0],neon:pair[1]}),contentType:'application/json'});
 });
 test('ACC-PRES-03 parked repeated switching retains exact run ID descriptor state and score bytes',async({gamePage:page},info)=>{
  await arrange(page);const result=await page.evaluate(()=>window.__presentationReplay.exactSwitch());expect(result.after).toEqual(result.before);expect(result.afterStored).toBe(result.stored);
  expect(result.before.run.runId).toBeTruthy();expect(result.before.queue).toHaveLength(2);expect(result.before.active).toEqual([true,true]);expect(result.before.prey[0].deadline).toBeGreaterThan(result.before.clock.now);expect(result.before.prey[1].hasHopped).toBe(true);expect(result.before.combo.streak).toBe(2);expect(result.before.combo.deadline).toBeGreaterThan(result.before.clock.now);expect(result.view).toBe('neon-district');await info.attach('presentation-exact-switch',{body:JSON.stringify({method:'Source-only activefoods/combo/deadlines and two pendingdirections restored after intentionalpause clears queue; first actualdraw precedes exact boundary; no normalization',...result}),contentType:'application/json'});
 });
}

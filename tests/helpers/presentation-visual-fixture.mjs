import { sourceAdapter } from './source-adapter.mjs';

// Screenshot material only: this is not a production spawn or replay vector.
export const presentationVisualPose = Object.freeze({
  seed: 'neon-material-11', mode: 'frenzy', direction: Object.freeze({ x: 1, z: 0 }),
  cells: Object.freeze([[14,13],[13,13],[12,13],[11,13],[10,13],[10,12],[10,11],[10,10]].map(Object.freeze)),
  foods: Object.freeze([{ x: 8, z: 6, type: 'common' }, { x: 16, z: 9, type: 'golden' }].map(Object.freeze))
});

export const presentationVisualHooks = `
window.__presentationVisualFixture={
 park(){renderer.setAnimationLoop(null);RESIZE.cancel();},
 logical(){return {screen:UI_SCREEN.screen,mode:currentMode,seed:RNG.seed,run:RUN_STATS.run,
  cells:segs.map(s=>[s.x,s.z,s.px,s.pz]),direction:{...dir},score,stepMs,
  foods:[{...food},{...food2}],active:[foodMesh.visible,foodMesh2.visible],
  archetypes:PREY_FX.entities.map(e=>e.type),pillars:HAZARDS.getPillarPositions(),
  clock:[SIMULATION.simNowMs,SIMULATION.fractionMs,SIMULATION.nextMoveMs],
  streams:[prng.state,RNG.stepCount,hazardPrng.state,RNG.hazardCount]};},
 async assets(){await document.fonts.ready;if(PRESENTATION.effective==='neon-district'){
  const city=PRESENTATION.view.scene.getObjectByName('Wet city');for(let i=0;i<200&&!city.material.map?.image;i++)await new Promise(r=>setTimeout(r,10));
  if(!city.material.map?.image)throw Error('Visual fixture intended local city plate not decoded');
 }await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},
 pose(){this.park();stopAttract(true,false);setMode('${presentationVisualPose.mode}');RNG.setSeed('${presentationVisualPose.seed}');startGame();pauseGame();this.park();
  for(const s of segs)removeSegment(s);segs=${JSON.stringify(presentationVisualPose.cells)}.map(([x,z],i)=>i?makeBodyCell(x,z):makeHeadCell(x,z));
  dir={x:1,z:0};inputQueue=[];Object.assign(food,{x:8,z:6});Object.assign(food2,{x:16,z:9});
  applyPreyType('common',0);applyPreyType('golden',1);foodMesh.visible=foodMesh2.visible=true;
  const occupied=new Set(segs.map(s=>s.x+','+s.z));occupied.add('8,6');occupied.add('16,9');
  const pillars=HAZARDS.getPillarPositions();if(!pillars.length||pillars.some(p=>occupied.has(p.x+','+p.z)))throw Error('Visual fixture deterministic pillars overlap occupied cells');
  lengthDirty=true;applyLengthStyle();updateScore();PRESENTATION.syncHUD();return this.draw();},
 draw(){const before=this.logical();if(lengthDirty)applyLengthStyle();drawSnake(1,0);drawFood(0);drawCamera(0);
  const tuple=PRESENTATION.resolveView();if(PRESENTATION.effective==='neon-district'){const f=PRESENTATION.snapshot(1);PRESENTATION.view.setPresentationOptions(f.options);PRESENTATION.view.sync(f);}
  const nativeRender=renderer.render;let selectedDraws=0;renderer.render=function(s,c){if(s===tuple.scene&&c===tuple.camera)selectedDraws++;return nativeRender.call(this,s,c);};
  try{renderFrame(tuple);renderer.getContext().finish();}finally{renderer.render=nativeRender;}
  const after=this.logical();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Visual draw changed logical player state');
  if(!selectedDraws||document.body.dataset.presentationRendered!==PRESENTATION.effective)throw Error('Visual selected tuple did not complete a render');
  return {before,after,presentation:PRESENTATION.effective,rendered:document.body.dataset.presentationRendered,
   scene:tuple.scene.uuid,camera:tuple.camera.uuid,selectedDraws,buffer:[renderer.domElement.width,renderer.domElement.height],dpr:renderer.getPixelRatio()};},
 fatal(){RECOVERY.fail('runtime',new Error('ND11 labelled fatal visual fixture'));}
};`;

export async function installPresentationVisualFixture(page) {
  if (process.env.RELEASE_DIST) throw Error('Visual fixture is source-only');
  await page.route('**/snake-three.html*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: sourceAdapter(await response.text(), { hooks: presentationVisualHooks }) });
  });
}

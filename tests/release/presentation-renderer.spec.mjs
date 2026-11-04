import { test, expect } from '../helpers/release-fixture.mjs';
import { attachPresentationEvidence } from '../helpers/presentation-evidence.mjs';
import { open } from '../helpers/player-flow.mjs';
import { localImports, sourceAdapter } from '../helpers/source-adapter.mjs';

test('ACC-PRES-02 ordinary Original retains one full-window canvas and completed frames', async ({ gamePage: page }) => {
  await open(page, '?seed=presentation-renderer&mode=classic&rules=2');
  await attachPresentationEvidence(page, test.info(), 'original');
  const observed = await page.evaluate(() => {
    const canvas = document.querySelector('canvas'), bounds = canvas.getBoundingClientRect();
    return { effective: document.body.dataset.presentation, rendered: document.body.dataset.presentationRendered,
      canvases: document.querySelectorAll('canvas').length,
      parent: canvas.parentElement.tagName, bounds: [bounds.width, bounds.height],
      window: [innerWidth, innerHeight], frames: window.__snakeRenderedFrames,
      controllerLeaked: 'PRESENTATION' in window, scaffoldHidden: document.getElementById('neonCabinet').hidden };
  });
  expect(observed).toMatchObject({ effective: 'original', rendered: 'original', canvases: 1, parent: 'BODY', controllerLeaked: false, scaffoldHidden: true });
  expect(observed.bounds).toEqual(observed.window);
  expect(observed.frames).toBeGreaterThan(0);
});

if (!process.env.RELEASE_DIST) {
  async function arrange(page) {
    await page.addInitScript(() => localStorage.setItem('threejs-snake-settings', JSON.stringify({ schemaVersion: 2,
      values: { quality: 'balanced', aa: 'none', bloomOn: true, sound: false } })));
    await page.route('**/snake-three.html*', async route => {
      const response = await route.fetch();
      const hooks = `window.__presentationRenderer = {
        park() { renderer.setAnimationLoop(null); RESIZE.cancel(); stopAttract(true,false); startGame(); pauseGame(); tuned=2; },
        logical() { return JSON.stringify({run:RUN_STATS.run,seed:RNG.seed,identity:RNG.identity,
          rng:[prng.state,hazardPrng.state,RNG.stepCount,RNG.hazardCount],
          cells:segs.map(s=>[s.x,s.z,s.px,s.pz]),food,food2,foodVisible:[foodMesh.visible,foodMesh2.visible],
          dir,inputQueue,score,clock:[SIMULATION.simNowMs,SIMULATION.fractionMs,SIMULATION.nextMoveMs],
          prey:PREY_FX.entities.map(e=>[e.type,e.deadlineMs,e.hasHopped]),pillars:HAZARDS.getPillarPositions(),
          metrics:[RUN_STATS.timeAlive,RUN_STATS.maxSpeedLevel,RUN_STATS.maxCombo,RUN_STATS.foodBreakdown],
          summary:RUN_STATS.lastSummary,stored:localStorage.getItem(SCORE_KEY)}); },
        stub() {
          const ownedScene=new THREE.Scene();ownedScene.background=new THREE.Color(0x291520);
          const ownedCamera=new THREE.OrthographicCamera(-11,11,11,-11,.1,60);
          ownedCamera.position.set(0,24,0);ownedCamera.up.set(0,0,-1);ownedCamera.lookAt(0,0,0);
          const geometry=new THREE.BoxGeometry(.8,.3,.8),material=new THREE.MeshBasicMaterial({color:0xff9c32});
          const mesh=new THREE.Mesh(geometry,material);mesh.layers.enable(BLOOM_LAYER);ownedScene.add(mesh);
          return {scene:ownedScene,camera:ownedCamera,sync(){},setPresentationOptions(){},
            resize(w,h){const aspect=w/h;ownedCamera.left=-11*Math.max(1,aspect);ownedCamera.right=-ownedCamera.left;
              ownedCamera.top=11*Math.max(1,1/aspect);ownedCamera.bottom=-ownedCamera.top;ownedCamera.updateProjectionMatrix();},
            dispose(){geometry.dispose();material.dispose();}};
        },
        maskRestoration() {
          this.park();const view=this.stub(), originalRender=renderer.render;
          const target=POST.compRT, savedColor=renderer.getClearColor(new THREE.Color()), savedAlpha=renderer.getClearAlpha();
          const savedTarget=renderer.getRenderTarget(), savedShadow=renderer.shadowMap.autoUpdate;
          view.scene.environment=scene.environment;view.scene.fog=new THREE.Fog(0x291520,1,30);view.camera.layers.mask=513;
          const expected={background:view.scene.background,environment:view.scene.environment,fog:view.scene.fog};
          let inside,thrown='';renderer.setClearColor(0x123456,.37);renderer.setRenderTarget(target);renderer.shadowMap.autoUpdate=true;
          renderer.render=function(s,c){inside={scene:s===view.scene,camera:c===view.camera,mask:c.layers.mask,
            background:s.background,environment:s.environment,fog:s.fog,shadow:renderer.shadowMap.autoUpdate};throw Error('mask draw fixture');};
          try {try{renderBloomMask({scene:view.scene,camera:view.camera});}catch(error){thrown=error.message;}
            return {thrown,inside,restored:{background:view.scene.background===expected.background,
              environment:view.scene.environment===expected.environment,fog:view.scene.fog===expected.fog,
              mask:view.camera.layers.mask,color:renderer.getClearColor(new THREE.Color()).getHex(),alpha:renderer.getClearAlpha(),
              target:renderer.getRenderTarget()===target,shadow:renderer.shadowMap.autoUpdate}};
          }finally{renderer.render=originalRender;renderer.setClearColor(savedColor,savedAlpha);renderer.setRenderTarget(savedTarget);
            renderer.shadowMap.autoUpdate=savedShadow;view.dispose();}
        },
        frameRestoration() {
          this.park();const view=this.stub(),originalRender=renderer.render,first=[];
          const savedColor=renderer.getClearColor(new THREE.Color()),savedAlpha=renderer.getClearAlpha(),savedTarget=renderer.getRenderTarget();
          const savedTilt=compMat.uniforms.uTiltShift.value,savedTint=compMat.uniforms.uZoneTint.value.clone();
          const tuple={scene:view.scene,camera:view.camera,options:{neutralGrade:true}};
          const previousNeonTuple=PRESENTATION.neonView,observer=new MutationObserver(()=>{}),stamps={};
          PRESENTATION.clearRendered();observer.observe(document.body,{attributes:true,attributeFilter:['data-presentation-rendered']});
          let throwDraw=false,thrown='',inside;
          renderer.render=function(s,c){if(s===scene||s===view.scene){first.push(s===scene?'original':'fixture');
            if(s===view.scene){inside={tilt:compMat.uniforms.uTiltShift.value,tint:compMat.uniforms.uZoneTint.value.toArray()};
              if(throwDraw)throw Error('frame draw fixture');}}return originalRender.call(this,s,c);};
          try {
            compMat.uniforms.uTiltShift.value=.44;compMat.uniforms.uZoneTint.value.set(.2,.3,.4);
            renderFrame();const legacy=first[0];stamps.first=observer.takeRecords().length;
            renderFrame();stamps.repeatedOriginal=observer.takeRecords().length;first.length=0;
            PRESENTATION.neonView=tuple;
            renderFrame(tuple);const explicit=first[0];stamps.changedView=observer.takeRecords().length;
            renderFrame(tuple);stamps.repeatedNeon=observer.takeRecords().length;first.length=0;
            renderer.setClearColor(0x345678,.29);renderer.setRenderTarget(POST.compRT);throwDraw=true;
            try{renderFrame(tuple);}catch(error){thrown=error.message;}
            stamps.thrown=observer.takeRecords().length;
            return {legacy,explicit,inside,thrown,stamps,after:{tilt:compMat.uniforms.uTiltShift.value,
              tint:compMat.uniforms.uZoneTint.value.toArray(),color:renderer.getClearColor(new THREE.Color()).getHex(),
              alpha:renderer.getClearAlpha(),target:renderer.getRenderTarget()===POST.compRT}};
          }finally{renderer.render=originalRender;renderer.setClearColor(savedColor,savedAlpha);renderer.setRenderTarget(savedTarget);
            compMat.uniforms.uTiltShift.value=savedTilt;compMat.uniforms.uZoneTint.value.copy(savedTint);
            observer.disconnect();PRESENTATION.neonView=previousNeonTuple;PRESENTATION.clearRendered();view.dispose();}
        },
        async viewportAndSnapshot() {
          this.park();const originalRenderer=renderer,originalCamera=camera,canvas=renderer.domElement,observer=PRESENTATION.observer;
          const before=this.logical(),frame=PRESENTATION.snapshot(.5),buffer=frame.segments,foods=frame.foods,pillars=frame.pillars;
          const copied={count:frame.segmentCount,head:Array.from(frame.segments.slice(0,4)),
            foodActive:frame.foods.map(f=>f.active),foodTypes:frame.foods.map(f=>f.type),pillarCount:frame.pillarCount};
          const expectedHead=[segs[0].x,segs[0].z,segs[0].px,segs[0].pz];
          frame.segments[0]=999;frame.foods[0].x=999;frame.pillars[0]=999;
          const copyDoesNotMutate=this.logical()===before;
          const next=PRESENTATION.snapshot(.5);const reused=next===frame&&next.segments===buffer&&next.foods===foods&&next.pillars===pillars;
          PRESENTATION.rendererAvailable=true;PRESENTATION.module={createNeonView:()=>this.stub()};
          resumeGame();PRESENTATION.request('neon-district',{persist:false});
          const deferred={effective:PRESENTATION.effective,screen:UI_SCREEN.screen,parent:canvas.parentElement.tagName};
          pauseGame();
          // Mount measures provisionally before HUD/font reflow. Let the real
          // ResizeObserver/coalesced RAF owner settle while simulation is paused.
          await document.fonts.ready;
          const settlement=[];let stableFrames=0;
          for(let i=0;i<6&&stableFrames<2;i++){
            await new Promise(resolve=>requestAnimationFrame(resolve));
            const measured=document.getElementById('neonBoardViewport').getBoundingClientRect();
            const size=renderer.getSize(new THREE.Vector2()).toArray();
            const bounds=[Math.round(measured.width),Math.round(measured.height)];
            const matched=size[0]===bounds[0]&&size[1]===bounds[1]&&RESIZE.pending===null;
            settlement.push({size,bounds,pending:RESIZE.pending,screen:UI_SCREEN.screen,matched});
            stableFrames=matched?stableFrames+1:0;
          }
          if(stableFrames!==2)throw Error('Owned viewport did not settle '+JSON.stringify(settlement));
          const bounds=document.getElementById('neonBoardViewport').getBoundingClientRect();
          // Require the intended explicit draw, rather than readiness from any
          // legitimate draw that may have completed during layout settlement.
          PRESENTATION.clearRendered();
          const beforeRender=document.body.dataset.presentationRendered??null;
          const selected=PRESENTATION.resolveView();PRESENTATION.view.sync(PRESENTATION.snapshot(1));renderFrame(selected);
          const neon={effective:PRESENTATION.effective,parent:canvas.parentElement.id,
            beforeRender,rendered:document.body.dataset.presentationRendered,
            size:renderer.getSize(new THREE.Vector2()).toArray(),bounds:[Math.round(bounds.width),Math.round(bounds.height)],
            cameraPreserved:camera===originalCamera,originalAspect:camera.aspect,
            selectedScene:selected.scene===PRESENTATION.view.scene,selectedCamera:selected.camera===PRESENTATION.view.camera};
          PRESENTATION.request('original',{persist:false});
          const restored={effective:PRESENTATION.effective,parent:canvas.parentElement.tagName,
            beforeRender:document.body.dataset.presentationRendered??null,
            placeholderNext:PRESENTATION.placeholder.nextSibling===canvas,size:renderer.getSize(new THREE.Vector2()).toArray(),
            window:[innerWidth,innerHeight],sameRenderer:renderer===originalRenderer,sameCamera:camera===originalCamera,
            sameObserver:PRESENTATION.observer===observer,canvases:document.querySelectorAll('canvas').length};
          const after=this.logical();PRESENTATION.view.dispose();PRESENTATION.view=null;PRESENTATION.neonView=null;
          PRESENTATION.rendererAvailable=false;PRESENTATION.module=null;
          return {copied,expectedHead,copyDoesNotMutate,reused,before,after,deferred,settlement,stableFrames,neon,restored};
        }
      };`;
      await route.fulfill({ response, body: sourceAdapter(localImports(await response.text(), new URL(route.request().url()).origin + '/'), { hooks }) });
    });
    await open(page, '?seed=presentation-renderer&mode=classic&rules=2');
  await attachPresentationEvidence(page, test.info(), 'original');
  }

  test('ACC-PRES-02 source mask restores exact selected view and renderer state after thrown draw', async ({ gamePage: page }) => {
    await arrange(page);
    const result = await page.evaluate(() => window.__presentationRenderer.maskRestoration());
    expect(result.thrown).toBe('mask draw fixture');
    expect(result.inside).toEqual({ scene: true, camera: true, mask: 2, background: null, environment: null, fog: null, shadow: false });
    expect(result.restored).toEqual({ background: true, environment: true, fog: true, mask: 513, color: 0x123456, alpha: .37, target: true, shadow: true });
  });

  test('ACC-PRES-02 source explicit frame uses selected view neutral grades and finally restoration', async ({ gamePage: page }) => {
    await arrange(page);
    const result = await page.evaluate(() => window.__presentationRenderer.frameRestoration());
    expect(result).toMatchObject({ legacy: 'original', explicit: 'fixture', inside: { tilt: 0, tint: [1, 1, 1] }, thrown: 'frame draw fixture',
      stamps: { first: 1, repeatedOriginal: 0, changedView: 1, repeatedNeon: 0, thrown: 0 },
      after: { tilt: .44, tint: [.2, .3, .4], color: 0x345678, alpha: .29, target: true } });
  });

  test('ACC-PRES-02 source measured slot preserves single renderer camera and copied snapshot purity', async ({ gamePage: page }) => {
    await arrange(page);
    const result = await page.evaluate(() => window.__presentationRenderer.viewportAndSnapshot());
    expect(result.copyDoesNotMutate).toBe(true); expect(result.reused).toBe(true);
    expect(result.copied.head).toEqual(result.expectedHead); expect(result.copied.count).toBeGreaterThan(0);
    expect(result.copied.foodActive).toEqual([true, false]); expect(result.copied.pillarCount).toBeGreaterThan(0);
    expect(result.before).toBe(result.after);
    expect(result.stableFrames).toBe(2);
    expect(result.settlement.slice(-2).every(sample=>sample.matched&&sample.pending===null&&sample.screen==='paused'&&
      JSON.stringify(sample.size)===JSON.stringify(sample.bounds))).toBe(true);
    expect(result.deferred).toEqual({ effective: 'original', screen: 'playing', parent: 'BODY' });
    expect(result.neon).toMatchObject({ effective: 'neon-district', rendered: 'neon-district', beforeRender: null,
      parent: 'neonBoardViewport', cameraPreserved: true, selectedScene: true, selectedCamera: true });
    expect(result.neon.size).toEqual(result.neon.bounds);
    expect(result.neon.originalAspect).toBe(result.restored.window[0] / result.restored.window[1]);
    expect(result.restored).toMatchObject({ effective: 'original', beforeRender: null, parent: 'BODY', placeholderNext: true, sameRenderer: true, sameCamera: true, sameObserver: true, canvases: 1 });
    expect(result.restored.size).toEqual(result.restored.window);
    await test.info().attach('owned-viewport-settlement', { body: JSON.stringify({
      method:'Source-only parked simulation; local font readiness then bounded native RAF observations of the real ResizeObserver/coalesced resize owner. Two consecutive exact size/bounds endpoints, no manual resize or equality tolerance; intended explicit scene/camera render owns the cleared readiness witness.', result }), contentType:'application/json' });
  });
}

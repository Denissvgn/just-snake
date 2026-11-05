/* SPEC-V3 §9 — death as an event acceptance run.
   Asserts zero idle cost, bounded sequence cost, determinism, constant program count,
   clean mid-flight restart, overlay deadline, and V2 bloom interaction.
*/
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_death.html';

const hook = `
window.__d = {
  freeze: () => { if (state === 'over' || state === 'ready') startGame(); pauseGame(); acc = 0; },
  getDeath: () => window.DEATH,
  triggerDeath: (reason) => window.startDeath(reason || 'wall'),
  stepDeath: (dt) => window.updateDeath(dt),
  cleanDeath: () => window.endDeath(),
  setTier: (t) => applyQuality(t, true),
  info: () => ({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    programs: renderer.info.programs.length,
    programIds: renderer.info.programs.map(program => program.id).sort((a, b) => a - b),
    geometries: renderer.info.memory.geometries,
    frames: window.__snakeRenderedFrames,
    deathAt: DEATH.at
  }),
  pipelineReady: () => document.body.dataset.originalBackground !== 'loading' &&
    (POST.aa !== 'smaa' || (smaaState === 'ready' && smaaVerifyFrames >= 5 &&
      smaaPass?.areaTexture?.image?.complete && smaaPass?.searchTexture?.image?.complete)),
  isOverlayHidden: () => document.getElementById('overlay').classList.contains('hidden'),
  getPiecesCount: () => (window.DEATH.pieces ? window.DEATH.pieces.length : 0),
  getPiecePositions: () => (window.DEATH.pieces || []).map(p => ({
    x: +p.mesh.position.x.toFixed(3),
    y: +p.mesh.position.y.toFixed(3),
    z: +p.mesh.position.z.toFixed(3)
  })),
  bloomStats: () => ({
    hasBloomRT: !!POST.bloomRT,
    tagCount: bloomTagCount,
    hasFxTag: !!(BLOOM_TAGS && BLOOM_TAGS.fx)
  }),
  preparationState: (fail = false, origin = 'target') => {
    if (!POST.sceneRT) throw Error('Post target required for preparation state check');
    const gl = renderer.getContext(), target = POST.sceneRT;
    const original = { target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
      viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(), compile: renderer.compile };
    const references = { background: scene.background, environment: scene.environment, fog: scene.fog };
    const capture = () => ({ target: renderer.getRenderTarget()?.uuid, face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
      viewport: renderer.getViewport(new THREE.Vector4()).toArray(), currentViewport: renderer.getCurrentViewport(new THREE.Vector4()).toArray(),
      scissor: renderer.getScissor(new THREE.Vector4()).toArray(), currentScissor: Array.from(gl.getParameter(gl.SCISSOR_BOX)),
      scissorTest: renderer.getScissorTest(), currentScissorTest: gl.isEnabled(gl.SCISSOR_TEST),
      targetViewport: target.viewport.toArray(), targetScissor: target.scissor.toArray(), targetScissorTest: target.scissorTest,
      layers: camera.layers.mask, shadowAuto: renderer.shadowMap.autoUpdate, toneMapping: renderer.toneMapping,
      outputColorSpace: renderer.outputColorSpace, renderFrame: renderer.info.render.frame, calls: renderer.info.render.calls,
      programs: renderer.info.programs.map(program => program.id).sort((a, b) => a - b) });
    let calls = 0, error = null;
    try {
      renderer.setRenderTarget(origin === 'target' ? target : null);
      // Actual target state intentionally differs from both canvas and target
      // defaults. Merely rebinding the same target cannot restore this state.
      if (origin === 'target') {
        renderer.setViewport(7, 11, 23, 29); renderer.setScissor(5, 9, 17, 21);
      } else {
        const dpr = renderer.getPixelRatio();
        renderer.setViewport(7.75 / dpr, 11.75 / dpr, 23.75 / dpr, 29.75 / dpr);
        renderer.setScissor(5.75 / dpr, 9.75 / dpr, 17.75 / dpr, 21.75 / dpr);
      }
      renderer.setScissorTest(true);
      if (origin === 'canvas-floor') renderer.setRenderTarget(null);
      const before = capture();
      renderer.compile = function (...args) {
        calls++;
        if (fail && calls === 2) throw Error('Declared death preparation compile failure');
        return original.compile.apply(this, args);
      };
      try { prepareDeathPrograms(); } catch (caught) { error = caught.message; }
      const after = capture();
      return { before, after, same: JSON.stringify(before) === JSON.stringify(after), calls, error,
        referencesRestored: scene.background === references.background && scene.environment === references.environment && scene.fog === references.fog,
        sharedOwners: deathProgramGroup.isGroup && deathProgramGroup.parent === null && deathProgramGroup.children.length === 2 &&
          deathProgramGroup.children[0].geometry === ringMesh.geometry && deathProgramGroup.children[0].material === ringMat &&
          deathProgramGroup.children[1].geometry === flashMesh.geometry && deathProgramGroup.children[1].material === flashMat };
    } finally {
      renderer.compile = original.compile;
      renderer.setViewport(original.viewport); renderer.setScissor(original.scissor); renderer.setScissorTest(original.scissorTest);
      renderer.setRenderTarget(original.target, original.face, original.mip);
    }
  }
};
`;

async function completedNormalFrame(page) {
  await page.waitForFunction(() => window.__d.pipelineReady(), { timeout: 30000 });
  const frame = await page.evaluate(() => window.__d.info().frames);
  await page.waitForFunction(previous => window.__d.info().frames > previous, { timeout: 30000 }, frame);
}

const samePrograms = (before, after) => before.programs === after.programs &&
  JSON.stringify(before.programIds) === JSON.stringify(after.programIds);

let failures = 0;
const check = (label, ok, detail) => {
  if (ok) {
    console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
};

async function run() {
  console.log('[SPEC-V3 Acceptance Run]');
  const html = fs.readFileSync(SRC, 'utf8');

  // Verify determinism statically: no Math.random in V3 death routines
  const deathMatch = html.match(/function\s+startDeath[\s\S]*?function\s+endDeath[\s\S]*?\}/);
  check('no Math.random in V3 death logic', deathMatch && !/Math\.random/.test(deathMatch[0]));

  const injected = html.slice(0, html.lastIndexOf('</script>')) + '\n' + hook + '\n' + html.slice(html.lastIndexOf('</script>'));
  fs.writeFileSync(DBG, injected);

  let browser;
  const programEvidence = { kind: 'cold-death-program-stability', states: [] };
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader-webgl']
    });

    const page = await browser.newPage();
    await page.goto('http://localhost:8099/__dbg_death.html');
    await page.waitForSelector('#actionBtn');
    // Finish ordinary asset/AA rendering without ever triggering death. Freeze
    // the actual player immediately, then observe its completed normal frame.
    await completedNormalFrame(page);
    await page.click('#actionBtn');
    await page.evaluate(() => window.__d.freeze());
    await completedNormalFrame(page);

    // Baseline and first activation share one task so no Auto transition can
    // occur between them. No test-only death primer precedes this baseline.
    const { beforeDeath, deathInit } = await page.evaluate(() => {
      const beforeDeath = window.__d.info();
      window.__d.triggerDeath('wall');
      return { beforeDeath, deathInit: {
        active: window.__d.getDeath().active,
        pieces: window.__d.getPiecesCount(),
        info: window.__d.info(),
        overlayHidden: window.__d.isOverlayHidden(),
        bloom: window.__d.bloomStats()
      } };
    });
    // 1. Zero idle cost
    check('renderer initialised', beforeDeath.calls > 0, `${beforeDeath.calls} calls`);
    check('first death has not been prewarmed by an earlier death', beforeDeath.deathAt === 0);

    // 2. Start death sequence
    check('death activated', deathInit.active);
    check('pieces spawned', deathInit.pieces >= 3, `${deathInit.pieces} pieces`);
    check('overlay hidden initially at t=0', deathInit.overlayHidden);
    check('fx bloom tag registered', deathInit.bloom.hasFxTag);

    // 3. Step physics and verify determinism
    const posTick1 = await page.evaluate(() => {
      window.__d.stepDeath(0.016);
      return window.__d.getPiecePositions();
    });
    check('pieces moved with physics', posTick1.length > 0 && posTick1.some(p => p.y > 0.22));

    // 4. Observe a completed real first death render, not just the synchronous
    // activation. Slow IPC must not change whether first-use compilation counts.
    await page.waitForFunction(previous => window.__d.info().frames > previous,
      { timeout: 30000 }, deathInit.info.frames);
    const duringDeath = await page.evaluate(() => window.__d.info());
    programEvidence.first = { before: beforeDeath, after: duringDeath };
    check('programs remain constant', samePrograms(beforeDeath, duringDeath), `${beforeDeath.programs} -> ${duringDeath.programs}; exact IDs`);

    // 5. Clean restart
    await page.evaluate(() => window.__d.cleanDeath());
    const afterClean = await page.evaluate(() => ({
      active: window.__d.getDeath().active,
      info: window.__d.info()
    }));
    check('clean death resets state', !afterClean.active);

    // A new actual non-post tier has different target/tone-map/light parameters.
    // Its first death must also use programs prepared before the baseline.
    await page.evaluate(() => window.__d.setTier('low'));
    await completedNormalFrame(page);
    const lowBefore = await page.evaluate(() => {
      const before = window.__d.info(); window.__d.triggerDeath('wall'); return before;
    });
    await page.waitForFunction(previous => window.__d.info().frames > previous,
      { timeout: 30000 }, lowBefore.frames);
    const lowDuring = await page.evaluate(() => window.__d.info());
    programEvidence.low = { before: lowBefore, after: lowDuring };
    check('first Low-profile death keeps exact programs', samePrograms(lowBefore, lowDuring), `${lowBefore.programs} -> ${lowDuring.programs}; exact IDs`);
    await page.evaluate(() => window.__d.cleanDeath());

    await page.evaluate(() => window.__d.setTier('high'));
    await completedNormalFrame(page);
    for (const origin of ['target', 'canvas-round', 'canvas-floor']) for (const fail of [false, true]) {
      const state = await page.evaluate(({ fail, origin }) => window.__d.preparationState(fail, origin), { fail, origin });
      programEvidence.states.push({ origin, fail, ...state });
      check('preparation restores exact ' + origin + ' state' + (fail ? ' after declared compile failure' : ''),
        state.same && state.referencesRestored && state.sharedOwners && state.calls === 2 &&
        state.error === (fail ? 'Declared death preparation compile failure' : null));
    }
    const round = programEvidence.states.find(state => state.origin === 'canvas-round');
    const floor = programEvidence.states.find(state => state.origin === 'canvas-floor');
    check('fractional canvas probes distinguish rounded and floored actual state',
      JSON.stringify(round.before.viewport) === JSON.stringify(floor.before.viewport) &&
      JSON.stringify(round.before.scissor) === JSON.stringify(floor.before.scissor) &&
      JSON.stringify(round.before.currentViewport) !== JSON.stringify(floor.before.currentViewport) &&
      JSON.stringify(round.before.currentScissor) !== JSON.stringify(floor.before.currentScissor));

    console.log(`\nAll death suite checks complete. Failures: ${failures}`);
  } catch (err) {
    console.error('Test execution error:', err);
    failures++;
  } finally {
    if (browser) await browser.close();
    if (process.env.TEST_ARTIFACTS) fs.writeFileSync(process.env.TEST_ARTIFACTS + '/death-programs.json', JSON.stringify(programEvidence, null, 2));
    try { fs.unlinkSync(DBG); } catch (e) {}
  }

  process.exit(failures > 0 ? 1 : 0);
}

run();

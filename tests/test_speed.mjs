/* SPEC-V6 §5 — Sell the speed acceptance run.
   Asserts dynamic FOV scaling, dolly kick impulse,
   stretched sparks pool, head ribbon quad strip,
   tier scaling, and clean reset.
*/
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_speed.html';

const hook = `
window.__s = {
  readiness: () => ({ state, motion: A11Y.reducedMotion, frames: renderedFrames,
    headRp: segs[0]?.rp ? segs[0].rp.toArray() : null, player: RUN_STATS.ownsPlayer() }),
  freeze: () => {
    if (state === 'over' || state === 'ready') startGame();
    pauseGame();
    acc = 0;
    if (window.resetSpeedFx) window.resetSpeedFx();
  },
  unfreeze: () => {
    resumeGame();
  },
  setStepMs: (ms) => {
    if (window.setStepMs) window.setStepMs(ms);
    else stepMs = ms;
  },
  triggerKick: () => {
    if (window.triggerSpeedKick) window.triggerSpeedKick();
  },
  resetFx: () => {
    if (window.resetSpeedFx) window.resetSpeedFx();
  },
  setTier: (t) => {
    applyQuality(t, true);
  },
  stepCam: (dt) => {
    if (window.drawCamera) window.drawCamera(dt);
    if (window.updateSpeedFx) window.updateSpeedFx(dt);
  },
  getSpeedState: () => {
    const sfx = window.SPEED_FX || {};
    const fov = camera ? camera.fov : 0;
    const factor = window.getSpeedFactor ? window.getSpeedFactor() : 0;
    const kick = sfx.fovKick || 0;
    const sparksVisible = sfx.sparkLines ? sfx.sparkLines.visible : false;
    const ribbonVisible = sfx.ribbonMesh ? sfx.ribbonMesh.visible : false;
    const ribbonVertCount = (sfx.ribbonGeo && sfx.ribbonGeo.attributes.position) ? sfx.ribbonGeo.attributes.position.count : 0;
    const sparkVertCount = (sfx.sparkGeo && sfx.sparkGeo.attributes.position) ? sfx.sparkGeo.attributes.position.count : 0;
    
    // Check if any spark has non-zero stretch
    let activeSparks = 0;
    if (sfx.sparks) {
      activeSparks = sfx.sparks.filter(s => s.life > 0).length;
    }

    return {
      fov: +fov.toFixed(2),
      factor: +factor.toFixed(2),
      kick: +kick.toFixed(2),
      sparksVisible,
      ribbonVisible,
      ribbonVertCount,
      sparkVertCount,
      activeSparks,
      bloomSparksTagged: !!(BLOOM_TAGS && BLOOM_TAGS.sparks),
      bloomFxTagged: !!(BLOOM_TAGS && BLOOM_TAGS.fx)
    };
  }
};
`;

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
  console.log('[SPEC-V6 Acceptance Run]');
  const html = fs.readFileSync(SRC, 'utf8');

  // 1. Static check
  check('SPEED_FX controller in source', /const\s+SPEED_FX\s*=\s*\{/.test(html));
  check('drawCamera updates FOV', /camera\.fov\s*=/.test(html));
  check('LineSegments used for stretched sparks', /THREE\.LineSegments/.test(html));

  const injected = html.slice(0, html.lastIndexOf('</script>')) + '\n' + hook + '\n' + html.slice(html.lastIndexOf('</script>'));
  fs.writeFileSync(DBG, injected);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader-webgl']
    });

    const page = await browser.newPage();
    // These effect baselines intentionally select full motion; B03 separately tests reduced rendering.
    await page.evaluateOnNewDocument(() => localStorage.setItem('threejs-snake-settings', JSON.stringify({schemaVersion:2,values:{reducedMotion:false,haptics:false}})));
    await page.goto('http://localhost:8099/__dbg_speed.html');
    await page.waitForSelector('#actionBtn');
    const framesBefore = await page.evaluate(() => window.__s.readiness().frames);
    await page.click('#actionBtn');
    await page.waitForFunction(frames => {
      const r = window.__s.readiness();
      return r.player && !r.motion && r.frames > frames && r.headRp?.length === 3 && r.headRp.every(Number.isFinite);
    }, { timeout: 10000 }, framesBefore);
    console.log('  actual post-Start pose:', JSON.stringify(await page.evaluate(() => window.__s.readiness())));

    // Freeze game loop to isolate tests
    await page.evaluate(() => window.__s.freeze());
    await page.waitForFunction(() => {
      const r = window.__s.readiness();
      return r.player && !r.motion && r.headRp?.length === 3 && r.headRp.every(Number.isFinite);
    }, { timeout: 10000 });
    console.log('  actual frozen pose:', JSON.stringify(await page.evaluate(() => window.__s.readiness())));

    // 1. Initial State at Base Speed (stepMs = 115, k = 0)
    await page.evaluate(() => window.__s.setStepMs(115));
    // Step camera to settle
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.__s.stepCam(0.05));
    }
    const init = await page.evaluate(() => window.__s.getSpeedState());
    check('Base FOV is 52.0 degrees', Math.abs(init.fov - 52.0) <= 0.2, `fov: ${init.fov}`);
    check('Initial speed factor k = 0', init.factor === 0, `factor: ${init.factor}`);
    check('Ribbon geometry contains 32 vertices', init.ribbonVertCount === 32, `verts: ${init.ribbonVertCount}`);
    check('Spark geometry contains 64 vertices', init.sparkVertCount === 64, `verts: ${init.sparkVertCount}`);
    check('Selective bloom tags registered', init.bloomSparksTagged && init.bloomFxTagged);

    // 2. High Speed Dynamic FOV (stepMs = 62, k = 1)
    await page.evaluate(() => window.__s.setStepMs(62));
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.__s.stepCam(0.05));
    }
    const highSpd = await page.evaluate(() => window.__s.getSpeedState());
    check('Speed factor k = 1.0 at min stepMs', highSpd.factor === 1.0, `factor: ${highSpd.factor}`);
    check('FOV widens to 59.0 degrees at top speed', Math.abs(highSpd.fov - 59.0) <= 0.35, `fov: ${highSpd.fov}`);

    // 3. Dolly Kick Impulse
    // Trigger kick on high speed
    await page.evaluate(() => window.__s.triggerKick());
    await page.evaluate(() => window.__s.stepCam(0.016));
    const kickPeak = await page.evaluate(() => window.__s.getSpeedState());
    check('Dolly kick spikes FOV above base target', kickPeak.fov >= 61.0, `peak fov: ${kickPeak.fov}`);

    // Step 0.45s forward -> kick should decay away
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.__s.stepCam(0.035));
    }
    const kickDecayed = await page.evaluate(() => window.__s.getSpeedState());
    check('Dolly kick decays within 0.45s', kickDecayed.kick === 0 && Math.abs(kickDecayed.fov - 59.0) <= 0.35, `settled fov: ${kickDecayed.fov}`);

    // 4. Quality Tier Scaling
    await page.evaluate(() => window.__s.setTier('low'));
    const lowTier = await page.evaluate(() => window.__s.getSpeedState());
    check('Low tier hides sparks and ribbon meshes', !lowTier.sparksVisible && !lowTier.ribbonVisible);
    check('Low tier maintains dynamic FOV scaling', Math.abs(lowTier.fov - 59.0) <= 0.35, `fov: ${lowTier.fov}`);

    // Restore high tier
    await page.evaluate(() => window.__s.setTier('high'));
    const restoredTier = await page.evaluate(() => window.__s.getSpeedState());
    check('High tier restores sparks and ribbon visibility', restoredTier.sparksVisible && restoredTier.ribbonVisible);

    // 5. Clean Reset
    await page.evaluate(() => window.__s.resetFx());
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.__s.stepCam(0.05));
    }
    const resetState = await page.evaluate(() => window.__s.getSpeedState());
    check('Reset restores base FOV 52.0 degrees', Math.abs(resetState.fov - 52.0) <= 0.25, `fov: ${resetState.fov}`);
    check('Reset clears dolly kick', resetState.kick === 0, `kick: ${resetState.kick}`);

  } catch (err) {
    console.error('Test execution error:', err);
    failures++;
  } finally {
    if (browser) await browser.close();
    try { fs.unlinkSync(DBG); } catch (e) {}
  }

  console.log(`\nAll speed suite checks complete. Failures: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

run();

/* SPEC-V7 §5 — Camera life acceptance run.
   Asserts velocity parallax lead, dynamic growth zoom-out,
   cinematic death push-in & Dutch roll tilt, and clean reset.
*/
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_camera.html';

const hook = `
window.__c = {
  readiness: () => ({state,motion:A11Y.reducedMotion,frames:renderedFrames,headRp:segs[0]?.rp?segs[0].rp.toArray():null,player:RUN_STATS.ownsPlayer()}),
  freeze: () => {
    if (state === 'over' || state === 'ready') startGame();
    pauseGame();
    acc = 0;
    if (window.resetCameraLife) window.resetCameraLife();
  },
  unfreeze: () => {
    resumeGame();
  },
  setDirection: (x, z) => {
    dir = { x, z };
  },
  setLength: (len) => {
    if (window.setTestSnakeLength) window.setTestSnakeLength(len);
  },
  stepCam: (dt) => {
    if (window.drawCamera) window.drawCamera(dt);
  },
  triggerDeath: (pos, dirVec) => {
    if (window.triggerCameraDeath) window.triggerCameraDeath(pos, dirVec);
  },
  resetLife: () => {
    if (window.resetCameraLife) window.resetCameraLife();
  },
  getCameraState: () => {
    const cl = window.CAMERA_LIFE || {};
    const pos = camera ? camera.position : { x: 0, y: 0, z: 0 };
    const rot = camera ? camera.rotation : { x: 0, y: 0, z: 0 };
    return {
      posX: +pos.x.toFixed(3),
      posY: +pos.y.toFixed(3),
      posZ: +pos.z.toFixed(3),
      rotZ: +rot.z.toFixed(4),
      leadX: +(cl.lookLead ? cl.lookLead.x : (cl.lead ? cl.lead.x : 0)).toFixed(3),
      leadZ: +(cl.lookLead ? cl.lookLead.z : (cl.lead ? cl.lead.z : 0)).toFixed(3),
      currentGrowth: +(cl.currentGrowth || 0).toFixed(3),
      deathRoll: +(cl.deathRoll || 0).toFixed(4),
      deathProgress: +(cl.deathProgress || 0).toFixed(3)
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
  console.log('[SPEC-V7 Acceptance Run]');
  const html = fs.readFileSync(SRC, 'utf8');

  // 1. Static check
  check('CAMERA_LIFE controller in source', /const\s+CAMERA_LIFE\s*=\s*\{/.test(html));
  check('drawCamera invokes updateCameraLife', /updateCameraLife\s*\(dt\)/.test(html));
  check('Dutch roll applied to camera.rotation.z', /camera\.rotation\.z\s*=/.test(html));

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
    await page.goto('http://localhost:8099/__dbg_camera.html');
    await page.waitForSelector('#actionBtn');
    const beforeFrames=await page.evaluate(()=>window.__c.readiness().frames);
    await page.click('#actionBtn');
    console.log('Post-start pose diagnostic:',JSON.stringify(await page.evaluate(()=>window.__c.readiness())));
    await page.waitForFunction(frames=>{const r=window.__c.readiness();return r.player&&!r.motion&&r.frames>frames&&r.headRp?.every(Number.isFinite);},{timeout:10000},beforeFrames);

    // Freeze game loop to isolate tests
    await page.evaluate(() => window.__c.freeze());
    console.log('Frozen pose diagnostic:',JSON.stringify(await page.evaluate(()=>window.__c.readiness())));
    await page.waitForFunction(()=>{const r=window.__c.readiness();return r.player&&!r.motion&&r.headRp?.every(Number.isFinite);},{timeout:10000});

    // 1. Initial State at Base
    const baseState = await page.evaluate(() => {
      window.__c.stepCam(0.1);
      return window.__c.getCameraState();
    });
    check('Initial camera rotation.z is 0', Math.abs(baseState.rotZ) < 0.001, `rotZ: ${baseState.rotZ}`);
    check('Initial growth factor is 0', baseState.currentGrowth === 0, `growth: ${baseState.currentGrowth}`);

    // 2. Parallax Lead: Direction (1, 0)
    await page.evaluate(() => {
      window.__c.setDirection(1, 0);
      for (let i = 0; i < 15; i++) window.__c.stepCam(0.02);
    });
    const eastState = await page.evaluate(() => window.__c.getCameraState());
    check('Positive X velocity produces positive X look-ahead lead', eastState.leadX > 0.35, `leadX: ${eastState.leadX}`);

    // Parallax Lead: Direction (0, -1)
    await page.evaluate(() => {
      window.__c.setDirection(0, -1);
      for (let i = 0; i < 15; i++) window.__c.stepCam(0.02);
    });
    const northState = await page.evaluate(() => window.__c.getCameraState());
    check('Negative Z velocity produces negative Z look-ahead lead', northState.leadZ < -0.35, `leadZ: ${northState.leadZ}`);

    // 3. Dynamic Growth Zoom-Out
    // Set snake length to 48 (late game)
    await page.evaluate(() => {
      window.__c.setLength(48);
      for (let i = 0; i < 25; i++) window.__c.stepCam(0.02);
    });
    const longState = await page.evaluate(() => window.__c.getCameraState());
    check('Growth factor approaches 1.0 for length 48', longState.currentGrowth > 0.85, `growth: ${longState.currentGrowth}`);
    check('Camera altitude increases with snake length', longState.posY > baseState.posY + 1.8, `posY: ${longState.posY} vs base: ${baseState.posY}`);
    check('Camera distance increases with snake length', longState.posZ > baseState.posZ + 1.4, `posZ: ${longState.posZ} vs base: ${baseState.posZ}`);

    // 4. Cinematic Death Push-In & Dutch Roll
    await page.evaluate(() => {
      window.__c.triggerDeath({ x: 8, y: 0.35, z: 8 }, { x: 1, z: 0 });
      for (let i = 0; i < 10; i++) window.__c.stepCam(0.03); // ~0.3s into death
    });
    const deathMid = await page.evaluate(() => window.__c.getCameraState());
    check('Death impact triggers Dutch roll tilt', Math.abs(deathMid.rotZ) > 0.015, `rotZ: ${deathMid.rotZ}`);
    check('Death impact initiates camera push-in altitude drop', deathMid.posY < longState.posY - 0.8, `posY: ${deathMid.posY}`);

    // Step to completion of death sequence
    await page.evaluate(() => {
      for (let i = 0; i < 35; i++) window.__c.stepCam(0.03);
    });
    const deathEnd = await page.evaluate(() => window.__c.getCameraState());
    check('Dutch roll returns toward rest after damping', Math.abs(deathEnd.rotZ) < 0.015, `rotZ: ${deathEnd.rotZ}`);

    // 5. Clean Reset
    await page.evaluate(() => {
      window.__c.resetLife();
      window.__c.stepCam(0.05);
    });
    const resetState = await page.evaluate(() => window.__c.getCameraState());
    check('Reset restores camera rotation.z to 0', Math.abs(resetState.rotZ) < 0.001, `rotZ: ${resetState.rotZ}`);
    check('Reset clears growth offset', resetState.currentGrowth === 0, `growth: ${resetState.currentGrowth}`);
    check('Reset restores base altitude', Math.abs(resetState.posY - baseState.posY) < 0.15, `posY: ${resetState.posY} vs base: ${baseState.posY}`);

  } catch (err) {
    console.error('Test execution error:', err);
    failures++;
  } finally {
    if (browser) await browser.close();
    try { fs.unlinkSync(DBG); } catch {}
  }

  console.log(`\nAll camera suite checks complete. Failures: ${failures}`);
  process.exit(failures > 0 ? 1 : 0);
}

run();

/* SPEC-V8 §5 — Skin liveliness acceptance run.
   Asserts motion-coupled texture UV scrolling, grazing-angle iridescence,
   per-segment slither muscle roll, quality tier gating, and clean reset.
*/
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_skin.html';

const hook = `
window.__sk = {
  freeze: () => {
    if (state === 'over' || state === 'ready') startGame();
    pauseGame();
    acc = 0;
    if (window.resetSkinFx) window.resetSkinFx();
  },
  unfreeze: () => {
    resumeGame();
  },
  setMotionFactor: (mf) => {
    motionFactor = mf;
    if (window.SKIN_FX) window.SKIN_FX.motionFactor = mf;
  },
  stepGame: (dt) => {
    if (window.updateSkinFx) window.updateSkinFx(dt);
    if (window.updateBodyTube) window.updateBodyTube();
  },
  setTier: (t) => {
    applyQuality(t, true);
  },
  resetFx: () => {
    if (window.resetSkinFx) window.resetSkinFx();
  },
  getSkinState: () => {
    const sfx = window.SKIN_FX || {};
    const bMat = (typeof bodyMat !== 'undefined') ? bodyMat : null;
    const irid = bMat ? bMat.iridescence : 0;
    const ior = bMat ? bMat.iridescenceIOR : 0;
    const thick = bMat ? bMat.iridescenceThicknessRange : [0, 0];
    
    let texOffsetY = 0;
    if (typeof skinMaps !== 'undefined' && skinMaps.normalMap) {
      texOffsetY = skinMaps.normalMap.offset.y;
    }

    return {
      scrollOffset: +sfx.scrollOffset.toFixed(4),
      iridescence: +(irid || 0).toFixed(2),
      iridescenceIOR: +(ior || 0).toFixed(2),
      thicknessMin: thick ? thick[0] : 0,
      thicknessMax: thick ? thick[1] : 0,
      texOffsetY: +texOffsetY.toFixed(4),
      rollTorsion: +(sfx.rollTorsion || 0).toFixed(4),
      rollGain: +(sfx.rollGain || 0).toFixed(2)
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
  console.log('[SPEC-V8 Acceptance Run]');
  const html = fs.readFileSync(SRC, 'utf8');

  // 1. Static check
  check('SKIN_FX controller in source', /const\s+SKIN_FX\s*=\s*\{/.test(html));
  check('Iridescence property configured', /iridescence:\s*(?:0\.45|SKIN_FX\.iridescence)/.test(html));
  check('Texture matrix offset in updateSkinFx', /normalMap\.offset\.y\s*=\s*SKIN_FX\.scrollOffset/.test(html));

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
    await page.goto('http://localhost:8099/__dbg_skin.html');
    await page.waitForSelector('#actionBtn');
    await page.click('#actionBtn');
    await new Promise(r => setTimeout(r, 400));

    // Freeze game loop to isolate tests
    await page.evaluate(() => window.__sk.freeze());

    // 1. Initial State
    const init = await page.evaluate(() => window.__sk.getSkinState());
    check('Initial iridescence is 0.45', init.iridescence === 0.45, `iridescence: ${init.iridescence}`);
    check('Initial iridescenceIOR is 1.33', init.iridescenceIOR === 1.33, `ior: ${init.iridescenceIOR}`);
    check('Initial scrollOffset is 0', init.scrollOffset === 0, `scroll: ${init.scrollOffset}`);
    check('Initial texture offset is 0', init.texOffsetY === 0, `offsetY: ${init.texOffsetY}`);
    check('rollGain is 0.16', init.rollGain === 0.16, `rollGain: ${init.rollGain}`);

    // 2. Motion-Coupled UV Scrolling
    await page.evaluate(() => {
      window.__sk.setMotionFactor(1.0);
      for (let i = 0; i < 20; i++) window.__sk.stepGame(0.016);
    });
    const movingState = await page.evaluate(() => window.__sk.getSkinState());
    check('Texture offset advances during locomotion', movingState.texOffsetY > 0.05, `offsetY: ${movingState.texOffsetY}`);
    check('scrollOffset matches texture offset', Math.abs(movingState.scrollOffset - movingState.texOffsetY) < 0.001, `scroll: ${movingState.scrollOffset} vs tex: ${movingState.texOffsetY}`);
    check('Active slither roll torsion is non-zero during motion', movingState.rollTorsion > 0.05, `torsion: ${movingState.rollTorsion}`);

    // Stop moving: motionFactor = 0
    await page.evaluate(() => {
      window.__sk.setMotionFactor(0.0);
      for (let i = 0; i < 20; i++) window.__sk.stepGame(0.016);
    });
    const stoppedState = await page.evaluate(() => window.__sk.getSkinState());
    check('Texture scroll pauses when stationary', Math.abs(stoppedState.scrollOffset - movingState.scrollOffset) < 0.001, `stopped: ${stoppedState.scrollOffset} vs moving: ${movingState.scrollOffset}`);
    check('Slither roll torsion settles to zero at rest', stoppedState.rollTorsion === 0, `torsion: ${stoppedState.rollTorsion}`);

    // 3. Quality Tier Gating
    await page.evaluate(() => window.__sk.setTier('low'));
    const lowTier = await page.evaluate(() => window.__sk.getSkinState());
    check('Low tier disables iridescence (0.0)', lowTier.iridescence === 0.0, `low iridescence: ${lowTier.iridescence}`);

    await page.evaluate(() => window.__sk.setTier('high'));
    const highTier = await page.evaluate(() => window.__sk.getSkinState());
    check('High tier restores iridescence (0.45)', highTier.iridescence === 0.45, `high iridescence: ${highTier.iridescence}`);

    // 4. Clean Reset
    await page.evaluate(() => {
      window.__sk.resetFx();
      window.__sk.stepGame(0.016);
    });
    const resetState = await page.evaluate(() => window.__sk.getSkinState());
    check('Reset zeroes scroll offset', resetState.scrollOffset === 0, `scrollOffset: ${resetState.scrollOffset}`);
    check('Reset zeroes texture offset', resetState.texOffsetY === 0, `offsetY: ${resetState.texOffsetY}`);

  } catch (err) {
    console.error('Test execution error:', err);
    failures++;
  } finally {
    if (browser) await browser.close();
    try { fs.unlinkSync(DBG); } catch {}
  }

  console.log(`\nAll skin suite checks complete. Failures: ${failures}`);
  process.exit(failures > 0 ? 1 : 0);
}

run();

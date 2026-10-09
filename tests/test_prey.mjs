/* SPEC-V9 §5 — Distinct prey silhouettes & idle behaviour acceptance run.
   Asserts 3 distinct geometries/materials, point values (10, 30, 20),
   idle micro-behaviors, proximity anticipation, and clean reset.
*/
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_prey.html';

const hook = `
window.__pr = {
  freeze: () => {
    if (state === 'over' || state === 'ready') startGame();
    pauseGame();
    acc = 0;
    if (window.resetPreyFx) window.resetPreyFx();
  },
  unfreeze: () => {
    resumeGame();
  },
  setType: (t) => {
    if (window.setPreyType) window.setPreyType(t);
  },
  stepFood: (dt, headDist) => {
    if (window.setPreySimulatedDist) {
      window.setPreySimulatedDist(headDist !== undefined ? headDist : null);
    }
    if (window.drawFood) window.drawFood(dt);
  },
  resetFx: () => {
    if (window.resetPreyFx) window.resetPreyFx();
  },
  getPreyState: () => {
    const pfx = window.PREY_FX || {};
    const fMesh = (typeof foodMesh !== 'undefined') ? foodMesh : null;
    const fHalo = (typeof foodHalo !== 'undefined') ? foodHalo : null;
    const geomType = (fMesh && fMesh.geometry) ? fMesh.geometry.type : '';
    const matColor = (fMesh && fMesh.material && fMesh.material.color) ? fMesh.material.color.getHex() : 0;
    const haloScale = fHalo ? fHalo.scale.x : 0;
    const rotY = fMesh ? fMesh.rotation.y : 0;

    return {
      type: pfx.currentType || '',
      points: window.getPreyPoints ? window.getPreyPoints() : 10,
      geomType,
      matColor,
      haloScale: +haloScale.toFixed(2),
      rotY: +rotY.toFixed(3),
      proximityNear: +(pfx.proximityNear || 0).toFixed(2),
      twitchYaw: +(pfx.twitchYaw || 0).toFixed(3),
      hasHopped: !!pfx.hasHopped
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
  console.log('[SPEC-V9 Acceptance Run]');
  const html = fs.readFileSync(SRC, 'utf8');

  // 1. Static check
  check('PREY_FX controller in source', /const\s+PREY_FX\s*=\s*\{/.test(html));
  check('Distinct geometries in source', /IcosahedronGeometry/.test(html) && /OctahedronGeometry/.test(html) && /CapsuleGeometry/.test(html));
  check('getPreyPoints function present', /function\s+getPreyPoints\s*\(/.test(html));

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
    await page.goto('http://localhost:8099/__dbg_prey.html');
    await page.waitForSelector('#actionBtn');
    await page.click('#actionBtn');
    await new Promise(r => setTimeout(r, 400));

    // Freeze game loop to isolate tests
    await page.evaluate(() => window.__pr.freeze());

    // 1. Initial State (Common Prey)
    const init = await page.evaluate(() => window.__pr.getPreyState());
    check('Initial prey type is common', init.type === 'common', `type: ${init.type}`);
    check('Common point value is 10', init.points === 10, `points: ${init.points}`);
    check('Common geometry is IcosahedronGeometry', init.geomType === 'IcosahedronGeometry', `geom: ${init.geomType}`);

    // 2. Switch to Golden Prey
    await page.evaluate(() => window.__pr.setType('golden'));
    const golden = await page.evaluate(() => window.__pr.getPreyState());
    check('Golden prey type active', golden.type === 'golden', `type: ${golden.type}`);
    check('Golden point value is 40', golden.points === 40, `points: ${golden.points}`);
    check('Golden geometry is OctahedronGeometry', golden.geomType === 'OctahedronGeometry', `geom: ${golden.geomType}`);
    check('Golden material color is gold (0xffd700)', golden.matColor === 0xffd700, `color: 0x${golden.matColor.toString(16)}`);
    check('Golden halo scale expands (>= 3.0)', golden.haloScale >= 3.0, `scale: ${golden.haloScale}`);

    // 3. Switch to Jittery Prey
    await page.evaluate(() => window.__pr.setType('jittery'));
    const jittery = await page.evaluate(() => window.__pr.getPreyState());
    check('Jittery prey type active', jittery.type === 'jittery', `type: ${jittery.type}`);
    check('Jittery point value is 20', jittery.points === 20, `points: ${jittery.points}`);
    check('Jittery geometry is CapsuleGeometry', jittery.geomType === 'CapsuleGeometry', `geom: ${jittery.geomType}`);
    check('Jittery material color is emerald (0x10b981)', jittery.matColor === 0x10b981, `color: 0x${jittery.matColor.toString(16)}`);

    // 4. Idle Motion & Rotation rate comparison
    // 4. Idle Motion & Rotation rate comparison
    // Compare rotation rate of common vs golden over 0.2s with head far away
    await page.evaluate(() => {
      window.__pr.setType('common');
      window.__pr.stepFood(0.2, 10);
    });
    const commonRot = await page.evaluate(() => window.__pr.getPreyState().rotY);

    await page.evaluate(() => {
      window.__pr.setType('golden');
      window.__pr.stepFood(0.2, 10);
    });
    const goldenRot = await page.evaluate(() => window.__pr.getPreyState().rotY);
    check('Golden exhibits faster spin rate than common', goldenRot > commonRot, `golden: ${goldenRot} vs common: ${commonRot}`);

    // 5. Proximity Reaction (Head Approaches d = 1.2 < 3.0)
    await page.evaluate(() => {
      window.__pr.setType('golden');
      window.__pr.stepFood(0.1, 1.2);
    });
    const nearState = await page.evaluate(() => window.__pr.getPreyState());
    check('Proximity near factor triggers when head approaches', nearState.proximityNear > 0.5, `near: ${nearState.proximityNear}`);

    // 6. Jittery Escape Hop
    await page.evaluate(() => {
      window.__pr.setType('jittery');
      if (window.triggerEscapeHop) window.triggerEscapeHop();
      window.__pr.stepFood(0.2);
    });
    const hopState = await page.evaluate(() => window.__pr.getPreyState());
    check('Jittery escape hop executed', hopState.type === 'jittery' && hopState.hasHopped);

    // 7. Clean Reset
    await page.evaluate(() => {
      window.__pr.resetFx();
    });
    const resetState = await page.evaluate(() => window.__pr.getPreyState());
    check('Reset restores common prey archetype', resetState.type === 'common', `type: ${resetState.type}`);
    check('Reset restores 10 points value', resetState.points === 10, `points: ${resetState.points}`);
    check('Reset zeroes proximity agitation', resetState.proximityNear === 0, `near: ${resetState.proximityNear}`);

  } catch (err) {
    console.error('Test execution error:', err);
    failures++;
  } finally {
    if (browser) await browser.close();
    try { fs.unlinkSync(DBG); } catch {}
  }

  console.log(`\nAll prey suite checks complete. Failures: ${failures}`);
  process.exit(failures > 0 ? 1 : 0);
}

run();

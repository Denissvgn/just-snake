/* SPEC-V4 §6 — eat juice acceptance run.
   Asserts ground shockwave, prey squash-pop, custom particle shader attributes,
   world-space score sprite (0 DOM thrashing), and V2 bloom interaction.
*/
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_eat.html';

const hook = `
window.__e = {
  freeze: () => { if (state === 'over' || state === 'ready') startGame(); pauseGame(); acc = 0; },
  triggerEat: () => { window.onEat(); },
  stepFx: (dt) => { if (window.updateEatFx) window.updateEatFx(dt); if (window.updateParticles) window.updateParticles(dt); },
  resetFx: () => { if (window.resetEatFx) window.resetEatFx(); },
  info: () => ({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    programs: renderer.info.programs.length,
    geometries: renderer.info.memory.geometries
  }),
  getDomPopScores: () => document.querySelectorAll('.floatScore').length,
  getEatState: () => {
    const efx = window.EAT_FX || {};
    const rings = efx.ringPool || [];
    const pops = efx.popPool || [];
    const scores = efx.scorePool || [];
    return {
      activeRings: rings.filter(r => r.mesh.visible).length,
      ringRadii: rings.filter(r => r.mesh.visible).map(r => r.mesh.scale.x),
      ringOpacities: rings.filter(r => r.mesh.visible).map(r => r.mat.opacity),
      activePops: pops.filter(p => p.mesh.visible).length,
      popScales: pops.filter(p => p.mesh.visible).map(p => ({ x: +p.mesh.scale.x.toFixed(2), y: +p.mesh.scale.y.toFixed(2) })),
      activeScores: scores.filter(s => s.sprite.visible).length,
      scorePositions: scores.filter(s => s.sprite.visible).map(s => ({ x: +s.sprite.position.x.toFixed(2), y: +s.sprite.position.y.toFixed(2) })),
      scoreOpacities: scores.filter(s => s.sprite.visible).map(s => s.mat.opacity)
    };
  },
  getParticleAttrs: () => {
    const geo = window.pointsGeo;
    if (!geo) return null;
    return {
      hasSize: !!geo.attributes.pSize,
      hasAlpha: !!geo.attributes.pAlpha,
      hasColor: !!geo.attributes.color
    };
  },
  bloomStats: () => ({
    tagCount: bloomTagCount,
    hasFxTag: !!(BLOOM_TAGS && BLOOM_TAGS.fx),
    hasPreyTag: !!(BLOOM_TAGS && BLOOM_TAGS.prey)
  })
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
  console.log('[SPEC-V4 Acceptance Run]');
  const html = fs.readFileSync(SRC, 'utf8');

  // 1. Static check: DOM floatScore appendChild removed from popScore
  const hasDomFloatScore = /document\.body\.appendChild\(el\)/.test(html) && /el\.className\s*=\s*['"]floatScore['"]/.test(html);
  check('DOM floatScore removed from popScore', !hasDomFloatScore);

  // 2. Static check: Particle shader attributes present
  check('Particle pSize attribute present', /pSize/.test(html));
  check('Particle pAlpha attribute present', /pAlpha/.test(html));

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
    await page.goto('http://localhost:8099/__dbg_eat.html');
    await page.waitForSelector('#actionBtn');
    await page.click('#actionBtn');
    await new Promise(r => setTimeout(r, 400));

    // Freeze simulation to isolate eat juice
    await page.evaluate(() => window.__e.freeze());

    // Verify particle attributes exist on geometry
    const pAttrs = await page.evaluate(() => window.__e.getParticleAttrs());
    check('Particle geometry has pSize attribute', pAttrs && pAttrs.hasSize);
    check('Particle geometry has pAlpha attribute', pAttrs && pAttrs.hasAlpha);

    // Initial state: 0 active eat fx
    const initFx = await page.evaluate(() => window.__e.getEatState());
    check('Zero idle eat effects active initially', initFx.activeRings === 0 && initFx.activePops === 0 && initFx.activeScores === 0);

    // Trigger Eat
    await page.evaluate(() => window.__e.triggerEat());

    // Inspect immediately after onEat (t = 0)
    const onEatState = await page.evaluate(() => ({
      fx: window.__e.getEatState(),
      domElements: window.__e.getDomPopScores(),
      bloom: window.__e.bloomStats()
    }));

    check('No DOM floatScore elements created on eat', onEatState.domElements === 0);
    check('Ground shockwave spawned', onEatState.fx.activeRings > 0);
    check('Prey squash proxy spawned', onEatState.fx.activePops > 0);
    check('World-space score sprite spawned', onEatState.fx.activeScores > 0);
    check('Bloom fx tag registered', onEatState.bloom.hasFxTag);

    // Step 0.06s: squash anticipation
    await page.evaluate(() => window.__e.stepFx(0.06));
    const step1 = await page.evaluate(() => window.__e.getEatState());
    check('Prey squashes vertically', step1.popScales.length > 0 && step1.popScales[0].y < 0.85, `scale.y: ${step1.popScales[0]?.y}`);
    check('Shockwave ring expands', step1.ringRadii.length > 0 && step1.ringRadii[0] > 0.25, `radius: ${step1.ringRadii[0]}`);

    // Step 0.3s: shockwave and prey pop dissolve
    await page.evaluate(() => window.__e.stepFx(0.3));
    const step2 = await page.evaluate(() => window.__e.getEatState());
    check('World score rises upward in 3D', step2.scorePositions.length > 0 && step2.scorePositions[0].y > 0.85, `score y: ${step2.scorePositions[0]?.y}`);

    // Step to completion (0.5s more -> total 0.86s)
    await page.evaluate(() => window.__e.stepFx(0.5));
    const step3 = await page.evaluate(() => window.__e.getEatState());
    check('Shockwave and prey pop returned to pool', step3.activeRings === 0 && step3.activePops === 0);
    check('World score returned to pool', step3.activeScores === 0);

    // Clean reset
    await page.evaluate(() => window.__e.resetFx());
    const resetState = await page.evaluate(() => window.__e.getEatState());
    check('Reset cleans all active eat fx', resetState.activeRings === 0 && resetState.activeScores === 0);

    console.log(`\nAll eat suite checks complete. Failures: ${failures}`);
  } catch (err) {
    console.error('Test execution error:', err);
    failures++;
  } finally {
    if (browser) await browser.close();
    try { fs.unlinkSync(DBG); } catch (e) {}
  }

  process.exit(failures > 0 ? 1 : 0);
}

run();

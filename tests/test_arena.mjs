/* SPEC-V5 §4 — reactive arena acceptance run.
   Asserts floor bioluminescent trail, wall perimeter death pulse,
   and composite zone atmosphere color grading (uZoneTint).
*/
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_arena.html';

const hook = `
window.__a = {
  freeze: () => { if (state === 'over' || state === 'ready') startGame(); pauseGame(); acc = 0; if (window.resetArenaFx) window.resetArenaFx(); },
  stepTrail: (x, z) => { if (window.stepArenaTrail) window.stepArenaTrail(x, z); },
  triggerPulse: (x, y, z) => { if (window.triggerWallPulse) window.triggerWallPulse(new THREE.Vector3(x, y, z), 'wall'); },
  stepFx: (dt) => { if (window.updateArenaFx) window.updateArenaFx(dt); },
  resetFx: () => { if (window.resetArenaFx) window.resetArenaFx(); },
  setEatCount: (count) => { if (window.checkZoneProgression) window.checkZoneProgression(count); },
  getArenaState: () => {
    const afx = window.ARENA_FX || {};
    const trails = afx.trailPool || [];
    const pulses = afx.pulsePool || [];
    const ct = afx.currentTint || { x: 1, y: 1, z: 1 };
    const tt = afx.targetTint || { x: 1, y: 1, z: 1 };
    return {
      activeTrails: trails.filter(t => t.mesh.visible).length,
      trailElevations: trails.filter(t => t.mesh.visible).map(t => +t.mesh.position.y.toFixed(3)),
      trailOpacities: trails.filter(t => t.mesh.visible).map(t => +t.mat.opacity.toFixed(2)),
      activePulses: pulses.filter(p => p.mesh.visible).length,
      pulsePositions: pulses.filter(p => p.mesh.visible).map(p => ({ x: +p.mesh.position.x.toFixed(2), z: +p.mesh.position.z.toFixed(2) })),
      pulseOpacities: pulses.filter(p => p.mesh.visible).map(p => +p.mat.opacity.toFixed(2)),
      zone: afx.currentZone,
      tint: { x: +ct.x.toFixed(2), y: +ct.y.toFixed(2), z: +ct.z.toFixed(2) },
      targetTint: { x: +tt.x.toFixed(2), y: +tt.y.toFixed(2), z: +tt.z.toFixed(2) }
    };
  },
  getShaderTint: () => {
    if (!compMat || !compMat.uniforms.uZoneTint) return null;
    const v = compMat.uniforms.uZoneTint.value;
    return { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) };
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
  console.log('[SPEC-V5 Acceptance Run]');
  const html = fs.readFileSync(SRC, 'utf8');

  // 1. Static check: COMP_FS uZoneTint uniform
  check('COMP_FS uZoneTint uniform declared', /uniform\s+vec3\s+uZoneTint/.test(html));
  check('Trail elevation 0.016 present', /0\.016/.test(html));

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
    await page.goto('http://localhost:8099/__dbg_arena.html');
    await page.waitForSelector('#actionBtn');
    await page.click('#actionBtn');
    await new Promise(r => setTimeout(r, 400));

    // Freeze game loop to isolate tests
    await page.evaluate(() => window.__a.freeze());

    // 1. Initial State
    const init = await page.evaluate(() => window.__a.getArenaState());
    check('Zero idle trail and pulse effects active initially', init.activeTrails === 0 && init.activePulses === 0);
    check('Initial zone is 0 (neutral tint)', init.zone === 0 && init.tint.x === 1 && init.tint.y === 1 && init.tint.z === 1);

    // 2. Trigger Floor Trail
    await page.evaluate(() => window.__a.stepTrail(3, 4));
    const trail1 = await page.evaluate(() => window.__a.getArenaState());
    check('Floor trail quad spawned on step', trail1.activeTrails === 1);
    check('Trail elevation is 0.016', trail1.trailElevations[0] === 0.016, `y: ${trail1.trailElevations[0]}`);
    check('Trail initial opacity is positive', trail1.trailOpacities[0] > 0.35, `opacity: ${trail1.trailOpacities[0]}`);

    // Step 0.6s forward
    await page.evaluate(() => window.__a.stepFx(0.6));
    const trail2 = await page.evaluate(() => window.__a.getArenaState());
    check('Trail quad decays smoothly', trail2.trailOpacities[0] < trail1.trailOpacities[0] && trail2.trailOpacities[0] > 0, `opacity: ${trail2.trailOpacities[0]}`);

    // Step to completion (total 1.3s > 1.25s)
    await page.evaluate(() => window.__a.stepFx(0.7));
    const trail3 = await page.evaluate(() => window.__a.getArenaState());
    check('Trail quad returned to pool after expiry', trail3.activeTrails === 0);

    // 3. Trigger Wall Perimeter Pulse
    await page.evaluate(() => window.__a.triggerPulse(0, 0.35, 10));
    const pulse1 = await page.evaluate(() => window.__a.getArenaState());
    check('Wall pulse twin waves spawned on collision', pulse1.activePulses === 2);

    // Step pulse forward 0.2s
    await page.evaluate(() => window.__a.stepFx(0.2));
    const pulse2 = await page.evaluate(() => window.__a.getArenaState());
    check('Wall pulse travels along perimeter', pulse2.pulsePositions.length === 2 && pulse2.pulsePositions[0].x !== 0, `x: ${pulse2.pulsePositions[0]?.x}`);

    // Step pulse to completion (0.5s more -> total 0.7s > 0.65s)
    await page.evaluate(() => window.__a.stepFx(0.5));
    const pulse3 = await page.evaluate(() => window.__a.getArenaState());
    check('Wall pulses returned to pool', pulse3.activePulses === 0);

    // 4. Zone Progression & Color Grading
    await page.evaluate(() => window.__a.setEatCount(10)); // Triggers Zone 1 (Bio Emerald)
    const zone1 = await page.evaluate(() => window.__a.getArenaState());
    check('Ten successful prey advance to Zone 1', zone1.zone === 1);
    check('Zone 1 target tint configured', zone1.targetTint.y > 1.0, `target g: ${zone1.targetTint.y}`);

    // Step 1.0s to allow atmospheric transition
    await page.evaluate(() => window.__a.stepFx(1.0));
    const zoneGraded = await page.evaluate(() => ({
      arena: window.__a.getArenaState(),
      shader: window.__a.getShaderTint()
    }));
    check('Current tint transitioned toward target tint', zoneGraded.arena.tint.y > 1.05, `tint g: ${zoneGraded.arena.tint.y}`);
    check('Composite shader uniform uZoneTint updated', zoneGraded.shader && zoneGraded.shader.y > 1.05, `shader g: ${zoneGraded.shader?.y}`);

    // 5. Clean Reset
    await page.evaluate(() => {
      window.__a.stepTrail(1, 1);
      window.__a.triggerPulse(5, 0.35, 0);
      window.__a.resetFx();
    });
    const resetState = await page.evaluate(() => window.__a.getArenaState());
    check('Reset clears active trails and pulses', resetState.activeTrails === 0 && resetState.activePulses === 0);
    check('Reset restores Zone 0 neutral tint', resetState.zone === 0 && resetState.tint.x === 1 && resetState.tint.y === 1 && resetState.tint.z === 1);

    console.log(`\nAll arena suite checks complete. Failures: ${failures}`);
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

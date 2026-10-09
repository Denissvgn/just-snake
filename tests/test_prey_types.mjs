// tests/test_prey_types.mjs
// Dynamic Puppeteer acceptance test for SPEC-G2: Prey Types (Archetypes · 3D Countdown Arc · Center Placement Bias · Dual-Prey Lifecycle)

import puppeteer from './helpers/legacy-browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('[SPEC-G2 Acceptance Run]');

let failures = 0;
function pass(label, detail) {
  console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
}
function fail(label, detail) {
  console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader-webgl']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700 });

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto('http://localhost:8099/snake-three.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.getPreyState !== undefined, { timeout: 10000 });

  // 1. Initial State (Common Prey on entity 0)
  const initialCommon = await page.evaluate(() => {
    return window.getPreyState ? window.getPreyState(0) : null;
  });

  if (initialCommon && initialCommon.type === 'common' && initialCommon.points === 10 && !initialCommon.arcVisible) {
    pass('Initial prey is common with 10 pts and hidden arc', `geom: ${initialCommon.geomType}`);
  } else {
    fail('Initial prey state mismatch', JSON.stringify(initialCommon));
  }

  // 2. Center Cell Helper Function
  const centerChecks = await page.evaluate(() => {
    return {
      center: window.isCenterCell(10, 10),
      nearCenter: window.isCenterCell(12, 11), // dist 3 <= 4
      corner: window.isCenterCell(0, 0),       // dist 20 > 4
      edge: window.isCenterCell(10, 2)         // dist 8 > 4
    };
  });

  if (centerChecks.center && centerChecks.nearCenter && !centerChecks.corner && !centerChecks.edge) {
    pass('isCenterCell helper accurately identifies center diamond', JSON.stringify(centerChecks));
  } else {
    fail('isCenterCell helper failed distance checks', JSON.stringify(centerChecks));
  }

  // 3. Golden Prey & Diegetic 3D Countdown Arc
  // Keep these manual event-clock probes in one call: no real frame can pause
  // the active context between advancement and the corresponding snapshot.
  const goldenLifecycle = await page.evaluate(() => {
    window.startGame(); window.arrangeNextMovement(100000);
    window.setPreyType('golden', 0);
    window.drawFood(0);
    const initial = window.getPreyState(0);
    window.advanceSimulation(2000); window.drawFood(0);
    const mid = window.getPreyState(0);
    window.advanceSimulation(2500); window.drawFood(0);
    const warning = window.getPreyState(0);
    window.advanceSimulation(2000); window.drawFood(0);
    return { initial, mid, warning, expired: window.getPreyState(0) };
  });
  const goldenState = goldenLifecycle.initial;

  if (goldenState.type === 'golden' && goldenState.points === 40 && goldenState.arcVisible && goldenState.timer === 6.0) {
    pass('Golden prey activates with 40 pts, visible 3D arc, and 6.0s timer', `timer: ${goldenState.timer}`);
  } else {
    fail('Golden prey initial state failed', JSON.stringify(goldenState));
  }

  // Advance timer by 2.0s
  const midTimerState = goldenLifecycle.mid;

  if (midTimerState.timer <= 4.1 && midTimerState.timer >= 3.9 && midTimerState.arcVisible && midTimerState.arcDrawCount < 384 && midTimerState.arcDrawCount > 0) {
    pass('3D countdown arc depletes draw range proportionally over time', `timer: ${midTimerState.timer.toFixed(2)}, drawCount: ${midTimerState.arcDrawCount}/384`);
  } else {
    fail('Countdown arc depletion failed', JSON.stringify(midTimerState));
  }

  // Advance timer into low warning zone (<= 2.0s)
  const lowTimerState = goldenLifecycle.warning;

  if (lowTimerState.timer <= 2.0 && lowTimerState.timer > 0 && lowTimerState.isFlashing) {
    pass('Low timer warning pulses when remaining time <= 2.0s', `timer: ${lowTimerState.timer.toFixed(2)}, isFlashing: ${lowTimerState.isFlashing}`);
  } else {
    fail('Low timer warning failed', JSON.stringify(lowTimerState));
  }

  // Advance timer past expiration (> 6.0s total) -> reverts to common
  const expiredState = goldenLifecycle.expired;

  if (expiredState.type === 'common' && expiredState.points === 10 && !expiredState.arcVisible) {
    pass('Golden prey reverts to common prey upon timer expiration', `type: ${expiredState.type}, arcVisible: ${expiredState.arcVisible}`);
  } else {
    fail('Expiration reversion failed', JSON.stringify(expiredState));
  }

  // 4. Center-Biased Placement Distribution
  const placementSample = await page.evaluate(() => {
    const totalSpawns = 30;
    let centerHits = 0;
    window.setPreyType('golden', 0);
    for (let i = 0; i < totalSpawns; i++) {
      window.spawnFood(1); // spawn entity 1 with golden
      if (window.isCenterCell(food.x, food.z)) {
        centerHits++;
      }
    }
    return { totalSpawns, centerHits, ratio: centerHits / totalSpawns };
  });

  if (placementSample.ratio >= 0.75) {
    pass('Golden prey placement strongly biased toward hazardous arena center', `hits: ${placementSample.centerHits}/${placementSample.totalSpawns} (${(placementSample.ratio * 100).toFixed(0)}%)`);
  } else {
    fail('Center placement bias underperformed threshold (expected >= 75%)', JSON.stringify(placementSample));
  }

  // 5. Dual-Prey Independent Lifecycle in Frenzy Mode
  const frenzyDualCheck = await page.evaluate(() => {
    window.setMode('frenzy');
    window.startGame(); window.arrangeNextMovement(100000);

    // Entity 0: golden, Entity 1: jittery
    window.setPreyType('golden', 0);
    window.setPreyType('jittery', 1);

    const s0 = window.getPreyState(0);
    const s1 = window.getPreyState(1);
    window.advanceSimulation(3000); window.drawFood(0);
    return { s0, s1, timer: { s0Timer: window.getPreyState(0).timer, s1Type: window.getPreyState(1).type } };
  });

  if (frenzyDualCheck.s0.type === 'golden' && frenzyDualCheck.s0.points === 40 && frenzyDualCheck.s0.arcVisible &&
      frenzyDualCheck.s1.type === 'jittery' && frenzyDualCheck.s1.points === 20 && !frenzyDualCheck.s1.arcVisible) {
    pass('Frenzy dual-prey supports distinct concurrent archetypes', `e0: ${frenzyDualCheck.s0.type} (+40pts), e1: ${frenzyDualCheck.s1.type} (+20pts)`);
  } else {
    fail('Dual-prey archetype assignment failed', JSON.stringify(frenzyDualCheck));
  }

  // Independent timer tick in Frenzy mode
  const frenzyTimerTick = frenzyDualCheck.timer;

  if (frenzyTimerTick.s0Timer <= 3.1 && frenzyTimerTick.s1Type === 'jittery') {
    pass('Frenzy dual-prey maintains independent timers without cross-entity leakage', `e0 timer: ${frenzyTimerTick.s0Timer.toFixed(1)}s, e1 remains: ${frenzyTimerTick.s1Type}`);
  } else {
    fail('Dual-prey timer isolation failed', JSON.stringify(frenzyTimerTick));
  }

  // 6. RUN_STATS Prey Breakdown Accuracy
  const statsEatTest = await page.evaluate(() => {
    if (typeof ATTRACT !== 'undefined') ATTRACT.active = false;
    window.startGame(); // establish a real player descriptor before recording fixture consumption.
    // Simulate eating golden (entity 0), jittery (entity 1), and common
    window.RUN_STATS.recordEat('golden', 1, 40);
    window.RUN_STATS.recordEat('jittery', 2, 40);
    window.RUN_STATS.recordEat('common', 1, 10);
    return window.RUN_STATS.foodBreakdown;
  });

  if (statsEatTest.golden === 1 && statsEatTest.jittery === 1 && statsEatTest.common === 1 && statsEatTest.total === 3) {
    pass('RUN_STATS accurately records all prey archetypes', JSON.stringify(statsEatTest));
  } else {
    fail('RUN_STATS breakdown recording mismatch', JSON.stringify(statsEatTest));
  }

  // 7. Clean Reset
  const resetCheck = await page.evaluate(() => {
    window.resetPreyFx();
    return {
      s0: window.getPreyState(0),
      s1: window.getPreyState(1)
    };
  });

  if (resetCheck.s0.type === 'common' && !resetCheck.s0.arcVisible && resetCheck.s1.type === 'common' && !resetCheck.s1.arcVisible) {
    pass('resetPreyFx restores both entities to baseline common archetype', JSON.stringify(resetCheck));
  } else {
    fail('Clean reset failed', JSON.stringify(resetCheck));
  }

  if (pageErrors.length > 0) {
    fail('Browser console errors observed', pageErrors.join(' | '));
  }

} catch (err) {
  fail('Unhandled test exception', err.stack);
} finally {
  if (browser) await browser.close();
}

console.log(`\nAll G2 acceptance checks complete. Failures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);

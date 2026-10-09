// tests/test_hazards.mjs
// Dynamic Puppeteer acceptance test for SPEC-G3: Arena Hazards (Seeded Pillars · Sweeping Perimeter Light Beam · Mode Dynamics)

import puppeteer from './helpers/legacy-browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('[SPEC-G3 Acceptance Run]');

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
  await page.waitForFunction(() => window.HAZARDS && window.HAZARDS.ON !== undefined, { timeout: 10000 });

  // 1. Initial State & Hazard Configuration
  const initialHazards = await page.evaluate(() => {
    if (!window.HAZARDS) return null;
    return {
      on: window.HAZARDS.ON,
      pillars: window.getPillarPositions ? window.getPillarPositions() : [],
      beamPos: window.HAZARDS.beam ? window.HAZARDS.beam.pos : -1,
      headSafe: window.isPillarCell ? window.isPillarCell(10, 10) : true
    };
  });

  if (initialHazards && initialHazards.on && initialHazards.pillars.length >= 4 && !initialHazards.headSafe) {
    pass('HAZARDS initialized with seeded pillars and safe head spawn', `pillars: ${initialHazards.pillars.length}, headSafe: ${!initialHazards.headSafe}`);
  } else {
    fail('Initial hazards state mismatch', JSON.stringify(initialHazards));
  }

  // 2. Pillar Spatial Distribution & Food Placement Safety
  const spatialChecks = await page.evaluate(() => {
    const pillars = window.getPillarPositions();
    const isPillar = window.isPillarCell;
    const p0 = pillars[0];
    const isP0 = isPillar(p0.x, p0.z);
    const isNearCenter = isPillar(10, 10);
    const isOutOfBounds = isPillar(-1, 25);

    // Verify spawnFood never picks a pillar cell
    let foodCollidedWithPillar = false;
    for (let i = 0; i < 20; i++) {
      window.spawnFood(1);
      if (isPillar(food.x, food.z)) {
        foodCollidedWithPillar = true;
        break;
      }
    }

    return {
      pillarCount: pillars.length,
      samplePillarMatches: isP0,
      centerClean: !isNearCenter,
      oobSafe: !isOutOfBounds,
      foodExcludesPillars: !foodCollidedWithPillar
    };
  });

  if (spatialChecks.samplePillarMatches && spatialChecks.centerClean && spatialChecks.oobSafe && spatialChecks.foodExcludesPillars) {
    pass('Pillars correctly mapped and excluded from food spawn candidates', JSON.stringify(spatialChecks));
  } else {
    fail('Spatial checks or food exclusion failed', JSON.stringify(spatialChecks));
  }

  // 3. Sweeping Perimeter Light Beam Animation
  const beamMotion = await page.evaluate(() => {
    const b0 = window.HAZARDS.beam.pos;
    if (window.HAZARDS.update) {
      window.HAZARDS.update(1.5);
    }
    const b1 = window.HAZARDS.beam.pos;
    const beamMeshVisible = window.HAZARDS.beam.mesh ? window.HAZARDS.beam.mesh.visible : false;
    return {
      b0,
      b1,
      delta: b1 - b0,
      visible: beamMeshVisible
    };
  });

  if (beamMotion.delta > 0 && beamMotion.visible) {
    pass('Sweeping light beam moves along perimeter over time', `pos: ${beamMotion.b0.toFixed(2)} -> ${beamMotion.b1.toFixed(2)} (delta: ${beamMotion.delta.toFixed(2)})`);
  } else {
    fail('Sweeping beam motion failed', JSON.stringify(beamMotion));
  }

  // 4. Lethal Pillar Collision Detection in step()
  const collisionTest = await page.evaluate(() => {
    // Start game
    if (typeof ATTRACT !== 'undefined') ATTRACT.active = false;
    window.startGame();

    // Position head immediately in front of a known pillar and step into it
    const pillars = window.getPillarPositions();
    const target = pillars[0]; // e.g. (5, 5)
    segs[0].x = target.x - 1;
    segs[0].z = target.z;
    dir = { x: 1, z: 0 };
    inputQueue = [];

    // Trigger step
    window.step();

    return {
      state,
      deathReason: DEATH.reason,
      overlayText: document.getElementById('message') ? document.getElementById('message').innerHTML : ''
    };
  });

  if (collisionTest.state === 'over' && collisionTest.deathReason === 'pillar') {
    pass('Colliding with a pillar triggers lethal game over with "pillar" death reason', `reason: ${collisionTest.deathReason}`);
  } else {
    fail('Pillar collision handling failed', JSON.stringify(collisionTest));
  }

  // 5. RUN_STATS records pillar collision
  const statsCheck = await page.evaluate(() => {
    return {
      lastSummaryReason: window.RUN_STATS.lastSummary ? window.RUN_STATS.lastSummary.deathReason : null
    };
  });

  if (statsCheck.lastSummaryReason === 'pillar') {
    pass('RUN_STATS accurately records pillar collision in summary', `summaryReason: ${statsCheck.lastSummaryReason}`);
  } else {
    fail('RUN_STATS summary mismatch for pillar death', JSON.stringify(statsCheck));
  }

  // 6. Mode Dynamics (Calm mode hazards bypass or safe navigation)
  const calmModeCheck = await page.evaluate(() => {
    window.setMode('calm');
    window.startGame(); // selection owns the next fresh run, not the completed Classic context.
    const calmHasHazards = window.MODES.calm ? window.MODES.calm.hazards : null;
    return {
      mode: window.getMode(),
      calmHasHazards
    };
  });

  if (calmModeCheck.mode === 'calm' && calmModeCheck.calmHasHazards === false) {
    pass('Calm mode disables hazards for casual wrap-around play', JSON.stringify(calmModeCheck));
  } else {
    fail('Calm mode hazards configuration mismatch', JSON.stringify(calmModeCheck));
  }

  // 7. Clean Reset
  const resetCheck = await page.evaluate(() => {
    window.setMode('classic');
    window.startGame();
    window.resetGame();
    return {
      state,
      hazardsOn: window.HAZARDS.ON,
      pillarsPresent: window.getPillarPositions().length >= 4
    };
  });

  if (resetCheck.state === 'ready' && resetCheck.hazardsOn && resetCheck.pillarsPresent) {
    pass('resetGame restores clean ready state and preserves pillar pool', JSON.stringify(resetCheck));
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

console.log(`\nAll G3 acceptance checks complete. Failures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);

// tests/test_difficulty.mjs
// Dynamic Puppeteer acceptance test for SPEC-G6: Difficulty Modes

import puppeteer from './helpers/legacy-browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('[SPEC-G6 Acceptance Run]');

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
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700 });

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto('http://localhost:8099/snake-three.html', { waitUntil: 'networkidle0' });

  // 1. Initial Mode Inspection
  const initialMode = await page.evaluate(() => {
    return {
      mode: window.getMode ? window.getMode() : null,
      modes: window.MODES ? Object.keys(window.MODES) : [],
      desc: document.getElementById('modeDesc') ? document.getElementById('modeDesc').textContent : null,
      activePill: document.querySelector('.mode-pill.active') ? document.querySelector('.mode-pill.active').getAttribute('data-mode') : null
    };
  });

  if (initialMode.mode === 'classic' && initialMode.activePill === 'classic') {
    pass('Default mode is classic', `active: ${initialMode.mode}`);
  } else {
    fail('Default mode mismatch', JSON.stringify(initialMode));
  }

  // 2. Mode Switching via DOM Pill Clicks
  const calmClick = await page.evaluate(async () => {
    const calmBtn = document.querySelector('.mode-pill[data-mode="calm"]');
    if (calmBtn) calmBtn.click();
    return {
      mode: window.getMode(),
      desc: document.getElementById('modeDesc').textContent,
      state: window.getDifficultyState()
    };
  });

  if (calmClick.mode === 'calm' && calmClick.state.wrap === true && calmClick.state.baseStepMs === 140) {
    pass('Calm mode activated via pill click', `baseStepMs: ${calmClick.state.baseStepMs}, wrap: ${calmClick.state.wrap}`);
  } else {
    fail('Calm mode activation failed', JSON.stringify(calmClick));
  }

  // 3. LocalStorage Persistence
  const savedStorage = await page.evaluate(() => localStorage.getItem('threejs-snake-mode'));
  if (savedStorage === 'calm') {
    pass('Selected mode persisted to localStorage', `stored: ${savedStorage}`);
  } else {
    fail('LocalStorage persistence failed', `stored: ${savedStorage}`);
  }

  // Reload page to verify restoration
  await page.reload({ waitUntil: 'networkidle0' });
  const restoredMode = await page.evaluate(() => window.getMode ? window.getMode() : null);
  if (restoredMode === 'calm') {
    pass('Persisted mode restored on page reload', `restored: ${restoredMode}`);
  } else {
    fail('Mode failed to restore on reload', `restored: ${restoredMode}`);
  }

  // 4. Calm Mode Wrap-Around Verification
  // Start game in calm mode
  await page.keyboard.press('Space');
  await new Promise(r => setTimeout(r, 100));

  // Drive snake toward wall (+x) and verify it wraps around without death
  const wrapResult = await page.evaluate(() => {
    // Current head position
    let initialX = window.segs[0].x;
    // Step until head reaches and wraps border
    let wrapped = false;
    let initialDir = window.dir;
    for (let i = 0; i < 30; i++) {
      window.step();
      if (window.state === 'over') {
        return { died: true, reason: window.DEATH ? window.DEATH.reason : 'unknown', steps: i };
      }
      if (window.segs[0].x < initialX && window.dir.x > 0) {
        wrapped = true;
        break;
      }
      initialX = window.segs[0].x;
    }
    return { died: false, wrapped, head: window.segs[0], state: window.state };
  });

  if (!wrapResult.died && wrapResult.wrapped) {
    pass('Calm mode wraps snake around wall without death', `new head x: ${wrapResult.head.x}`);
  } else {
    fail('Calm wrap-around failed', JSON.stringify(wrapResult));
  }

  // 5. Calm Mode Self-Collision Mortaility
  // Force snake to grow then turn into itself
  const selfCollisionResult = await page.evaluate(() => {
    // Grow snake to length 5
    for (let i = 0; i < 5; i++) {
      const tail = window.segs[window.segs.length - 1];
      window.segs.push(window.makeBodyCell(tail.px, tail.pz));
    }
    // Turn U-turn: Right -> Down -> Left -> Up (or loop into body)
    window.dir = { x: 0, z: 1 };
    window.step();
    window.dir = { x: -1, z: 0 };
    window.step();
    window.dir = { x: 0, z: -1 };
    window.step();
    return {
      state: window.state,
      reason: window.DEATH ? window.DEATH.reason : null
    };
  });

  if (selfCollisionResult.state === 'over' && selfCollisionResult.reason === 'self') {
    pass('Calm mode preserves lethal self-collision', `reason: ${selfCollisionResult.reason}`);
  } else {
    fail('Calm mode self-collision failed', JSON.stringify(selfCollisionResult));
  }

  // 6. Classic Mode Wall Mortality
  await page.evaluate(() => {
    window.setMode('classic');
    window.startGame();
  });
  await new Promise(r => setTimeout(r, 100));

  const classicWallResult = await page.evaluate(() => {
    for (let i = 0; i < 30; i++) {
      window.step();
      if (window.state === 'over') {
        return { state: window.state, reason: window.DEATH ? window.DEATH.reason : null, steps: i };
      }
    }
    return { state: window.state, steps: 30 };
  });

  if (classicWallResult.state === 'over' && classicWallResult.reason === 'wall') {
    pass('Classic mode maintains lethal wall collisions', `reason: ${classicWallResult.reason}`);
  } else {
    fail('Classic mode wall collision failed', JSON.stringify(classicWallResult));
  }

  // DEC06/SET04: a paused run owns its mode; selection affects the next run only.
  const modeOwnership = await page.evaluate(() => {
    window.setMode('classic'); window.startGame(); window.pauseGame();
    const before = JSON.stringify({ mode: window.getMode(), seed: window.getSeed(),
      cells: window.segs.map(s => [s.x, s.z]), food: window.getDifficultyState().food1 });
    window.applySetting('wrap', true); // removed preference cannot alter frozen difficulty rules.
    document.querySelector('#settingsModeSelector [data-mode="frenzy"]').click();
    const after = JSON.stringify({ mode: window.getMode(), seed: window.getSeed(),
      cells: window.segs.map(s => [s.x, s.z]), food: window.getDifficultyState().food1 });
    const classicWalls = window.MODES.classic.wrap === false && Object.isFrozen(window.MODES) && Object.values(window.MODES).every(Object.isFrozen);
    window.startGame();
    return { unchanged: before === after, classicWalls, next: window.getMode() };
  });
  if (modeOwnership.unchanged && modeOwnership.classicWalls && modeOwnership.next === 'frenzy') {
    pass('Paused selection preserves active mode/seed/cells; wrap preference rejected and next run promotes selection');
  } else fail('Paused difficulty ownership failed', JSON.stringify(modeOwnership));

  // 7. Frenzy Mode: Dual Food Verification
  await page.evaluate(() => {
    window.setMode('frenzy');
    window.startGame();
  });
  await new Promise(r => setTimeout(r, 100));

  const frenzyState = await page.evaluate(() => {
    const s = window.getDifficultyState();
    return {
      mode: s.mode,
      baseStepMs: s.baseStepMs,
      dualFood: s.dualFood,
      f1: s.food1,
      f2: s.food2,
      mesh2Visible: window.foodMesh2 ? window.foodMesh2.visible : false
    };
  });

  if (frenzyState.mode === 'frenzy' && frenzyState.dualFood && frenzyState.f2 && frenzyState.mesh2Visible) {
    const distinctCells = !(frenzyState.f1.x === frenzyState.f2.x && frenzyState.f1.z === frenzyState.f2.z);
    if (distinctCells) {
      pass('Frenzy mode activates dual simultaneous preys', `prey1: (${frenzyState.f1.x},${frenzyState.f1.z}), prey2: (${frenzyState.f2.x},${frenzyState.f2.z})`);
    } else {
      fail('Frenzy prey cells overlap', JSON.stringify(frenzyState));
    }
  } else {
    fail('Frenzy dual prey activation failed', JSON.stringify(frenzyState));
  }

  // Consume prey 2 directly and assert only prey 2 respawns
  const eatPrey2Result = await page.evaluate(() => {
    const f1Before = { ...window.food };
    const f2Before = { ...window.food2 };
    // Teleport head 1 step behind food2
    window.segs[0].x = f2Before.x === 0 ? 1 : f2Before.x - 1;
    window.segs[0].z = f2Before.z;
    window.dir = { x: f2Before.x === 0 ? -1 : 1, z: 0 };
    const scoreBefore = window.score;
    window.step(); // Steps directly onto food2
    return {
      scoreGrown: window.score > scoreBefore,
      f1Unchanged: window.food.x === f1Before.x && window.food.z === f1Before.z,
      f2Respawned: !(window.food2.x === f2Before.x && window.food2.z === f2Before.z)
    };
  });

  if (eatPrey2Result.scoreGrown && eatPrey2Result.f1Unchanged && eatPrey2Result.f2Respawned) {
    pass('Consuming secondary prey increments score and respawns cleanly', 'prey1 preserved');
  } else {
    fail('Eating secondary prey failed', JSON.stringify(eatPrey2Result));
  }

  // 8. UI Lifecycle: Mode Selector Visibility Gating
  const uiLifecycle = await page.evaluate(() => {
    const selector = document.getElementById('modeSelector');
    const playingDisplay = selector ? window.getComputedStyle(selector).display : null;
    
    // Trigger Game Over
    window.gameOver('wall');
    const overDisplay = selector ? window.getComputedStyle(selector).display : null;

    // Check summary card mode badge
    const summaryCard = document.querySelector('.summary-cause') || document.querySelector('.stat-card');
    const summaryHtml = document.getElementById('message').innerHTML;

    return {
      playingHidden: playingDisplay === 'none',
      overHidden: overDisplay === 'none',
      summaryHasMode: /Frenzy|Mode/i.test(summaryHtml) || /frenzy/i.test(summaryHtml)
    };
  });

  if (uiLifecycle.playingHidden && uiLifecycle.overHidden) {
    pass('Mode selector cleanly hidden during active play and game over');
  } else {
    fail('Mode selector visibility gating failed', JSON.stringify(uiLifecycle));
  }

  // Restore classic mode
  await page.evaluate(() => {
    window.setMode('classic');
  });

  if (pageErrors.length > 0) {
    fail('Browser reported unexpected errors', pageErrors.join('; '));
  }

} catch (err) {
  fail('Dynamic test execution threw exception', err.stack);
} finally {
  if (browser) await browser.close();
}

console.log(`\nAll difficulty modes suite checks complete. Failures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);

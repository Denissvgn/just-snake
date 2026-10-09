// tests/test_combo.mjs
// Dynamic Puppeteer acceptance tests for SPEC-G1: Combo multiplier

import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

let failures = 0;
function pass(desc, detail = '') {
  console.log(`  PASS  ${desc}${detail ? ' — ' + detail : ''}`);
}
function fail(desc, detail = '') {
  console.error(`  FAIL  ${desc}${detail ? ' — ' + detail : ''}`);
  failures++;
}

console.log('[SPEC-G1 Acceptance Run]');

// 1. Static source checks
const html = fs.readFileSync(htmlPath, 'utf8');
if (/const\s+COMBO_FX\s*=\s*\{/.test(html)) {
  pass('COMBO_FX controller in source');
} else {
  fail('COMBO_FX controller missing in source');
}

if (/COMBO_FX\.onEat\s*\(/.test(html)) {
  pass('Scoring pipeline integrates COMBO_FX.onEat');
} else {
  fail('COMBO_FX.onEat missing from scoring pipeline');
}

// 2. Dynamic browser tests
async function runDynamicTests() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader-webgl']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 700 });
    await page.goto('http://localhost:8099/snake-three.html', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 600));

    // Check COMBO_FX initialization
    const initCheck = await page.evaluate(() => {
      if (typeof window.COMBO_FX === 'undefined') return null;
      return {
        on: window.COMBO_FX.ON,
        streak: window.COMBO_FX.streak,
        mult: window.COMBO_FX.multiplier,
        timer: window.COMBO_FX.timer,
        maxMult: window.COMBO_FX.maxMultiplier
      };
    });

    if (initCheck && initCheck.on) {
      pass('COMBO_FX controller initialized');
    } else {
      fail('COMBO_FX controller failed to initialize', JSON.stringify(initCheck));
    }

    if (initCheck && initCheck.streak === 0 && initCheck.mult === 1 && initCheck.timer === 0) {
      pass('Initial streak is 0, multiplier is 1, timer is 0.0');
    } else {
      fail('Initial combo state incorrect', JSON.stringify(initCheck));
    }

    // Test First Eat (streak 1, multiplier 1, window 4.5s)
    const activeCombo = await page.evaluate(() => {
      // Ensure player playing state
      window.startGame();
      window.arrangeNextMovement(100000);
      const m = window.COMBO_FX.onEat();
      const first = {
        retMult: m,
        streak: window.COMBO_FX.streak,
        mult: window.COMBO_FX.multiplier,
        timer: window.COMBO_FX.timer
      };
      const m2 = window.COMBO_FX.onEat();
      const second = { retMult: m2, streak: window.COMBO_FX.streak,
        mult: window.COMBO_FX.multiplier, timer: window.COMBO_FX.timer };
      window.COMBO_FX.update(0.016);
      const wrap = document.getElementById('comboWrapper');
      const badge = document.getElementById('comboBadge');
      const fill = document.getElementById('comboFill');
      const hud = { opacity: wrap ? wrap.style.opacity : null,
        badgeText: badge ? badge.textContent : '',
        fillProg: fill ? fill.style.getPropertyValue('--combo-prog') : null };
      const m3 = window.COMBO_FX.onEat(), t3 = window.COMBO_FX.timer;
      const m4 = window.COMBO_FX.onEat(), t4 = window.COMBO_FX.timer;
      const m5 = window.COMBO_FX.onEat(), t5 = window.COMBO_FX.timer;
      const m6 = window.COMBO_FX.onEat(), t6 = window.COMBO_FX.timer;
      return { first, second, hud, ladder: { m3, t3, m4, t4, m5, t5, m6, t6, streak: window.COMBO_FX.streak } };
    });
    const firstEat = activeCombo.first;

    if (firstEat.retMult === 1 && firstEat.streak === 1 && Math.abs(firstEat.timer - 4.5) < 0.01) {
      pass('First eat primes combo: streak 1, multiplier 1, timer 4.5s', `timer: ${firstEat.timer}`);
    } else {
      fail('First eat combo priming failed', JSON.stringify(firstEat));
    }

    // Test Second Rapid Eat (streak 2, multiplier 2, shrinking window 3.9s)
    const secondEat = activeCombo.second;

    if (secondEat.retMult === 2 && secondEat.streak === 2 && Math.abs(secondEat.timer - 3.9) < 0.01) {
      pass('Second rapid eat elevates to x2: streak 2, timer 3.9s', `mult: ${secondEat.mult}, timer: ${secondEat.timer}`);
    } else {
      fail('Second rapid eat elevation failed', JSON.stringify(secondEat));
    }

    // Test HUD Feed & Bar Activation
    const hudCheck = activeCombo.hud;

    if (hudCheck.opacity === '1' && hudCheck.badgeText.includes('x2') && parseFloat(hudCheck.fillProg) > 0.9) {
      pass('HUD combo bar activates: visible opacity, x2 badge, positive progress', `prog: ${hudCheck.fillProg}`);
    } else {
      fail('HUD combo bar activation failed', JSON.stringify(hudCheck));
    }

    // Test Multiplier Ladder Progression up to x5 cap
    const ladderCheck = activeCombo.ladder;

    if (ladderCheck.m3 === 3 && Math.abs(ladderCheck.t3 - 3.3) < 0.01 &&
        ladderCheck.m4 === 4 && Math.abs(ladderCheck.t4 - 2.7) < 0.01 &&
        ladderCheck.m5 === 5 && Math.abs(ladderCheck.t5 - 2.4) < 0.01 &&
        ladderCheck.m6 === 5 && Math.abs(ladderCheck.t6 - 2.4) < 0.01 &&
        ladderCheck.streak === 6) {
      pass('Ladder progresses monotonically to x5 (2.4s) and strictly caps at x5 for streak >= 5');
    } else {
      fail('Ladder progression or capping failed', JSON.stringify(ladderCheck));
    }

    // Test Pause Freeze (no decay while paused)
    const pauseCheck = await page.evaluate(() => {
      // A separate, deliberately paused transaction; never restore a state that
      // may already have been paused by a real frame between browser commands.
      window.startGame(); window.arrangeNextMovement(100000);
      for (let i = 0; i < 6; i++) window.COMBO_FX.onEat();
      const beforeTimer = window.COMBO_FX.timer;
      window.pauseGame();
      window.advanceSimulation(500);
      const afterTimer = window.COMBO_FX.timer;
      return { beforeTimer, afterTimer };
    });

    if (Math.abs(pauseCheck.beforeTimer - 2.4) < 0.01 && Math.abs(pauseCheck.beforeTimer - pauseCheck.afterTimer) < 0.0001) {
      pass('Combo decay timer freezes during pause (no decay when not playing)');
    } else {
      fail('Combo timer decayed during pause', JSON.stringify(pauseCheck));
    }

    // Test Decay & Expiry Past Window
    const expiryCheck = await page.evaluate(() => {
      window.startGame(); window.arrangeNextMovement(100000);
      for (let i = 0; i < 6; i++) window.COMBO_FX.onEat();
      // Advance by 3.0s (exceeds 2.4s window)
      window.advanceSimulation(3100);
      const wrap = document.getElementById('comboWrapper');
      return {
        streak: window.COMBO_FX.streak,
        mult: window.COMBO_FX.multiplier,
        timer: window.COMBO_FX.timer,
        opacity: wrap ? wrap.style.opacity : null
      };
    });

    if (expiryCheck.streak === 0 && expiryCheck.mult === 1 && expiryCheck.timer === 0 && expiryCheck.opacity === '0') {
      pass('Decay past window duration resets streak to 0, multiplier to 1, and fades HUD bar');
    } else {
      fail('Combo decay expiry failed', JSON.stringify(expiryCheck));
    }

    // Test Attract Mode Isolation
    const attractCheck = await page.evaluate(() => {
      if (!window.ATTRACT) return null;
      const before = window.COMBO_FX.streak;
      window.startAttract(true);
      const m = window.COMBO_FX.onEat();
      const streak = window.COMBO_FX.streak;
      window.stopAttract(true);
      return { m, streak, before };
    });

    if (attractCheck && attractCheck.m === 1 && attractCheck.streak === attractCheck.before) {
      pass('Attract mode is fully isolated: onEat returns 1 with preserved player streak');
    } else {
      fail('Attract mode isolation failed', JSON.stringify(attractCheck));
    }

    // Test Kill Switch (COMBO_FX.ON = false)
    const killSwitchCheck = await page.evaluate(() => {
      window.startGame(); window.arrangeNextMovement(100000);
      window.COMBO_FX.ON = false;
      const m = window.COMBO_FX.onEat();
      window.COMBO_FX.update(0.1);
      window.COMBO_FX.ON = true;
      return { m, streak: window.COMBO_FX.streak };
    });

    if (killSwitchCheck.m === 1 && killSwitchCheck.streak === 0) {
      pass('Kill switch COMBO_FX.ON = false safely bypasses combo logic and returns multiplier 1');
    } else {
      fail('Kill switch verification failed', JSON.stringify(killSwitchCheck));
    }

    // Test Clean Reset
    const resetCheck = await page.evaluate(() => {
      window.startGame(); window.arrangeNextMovement(100000);
      window.COMBO_FX.onEat(); // streak 1
      window.COMBO_FX.onEat(); // streak 2
      const primedStreak = window.COMBO_FX.streak;
      window.COMBO_FX.reset();
      const wrap = document.getElementById('comboWrapper');
      return {
        streak: window.COMBO_FX.streak,
        mult: window.COMBO_FX.multiplier,
        timer: window.COMBO_FX.timer,
        opacity: wrap ? wrap.style.opacity : null,
        primedStreak
      };
    });

    if (resetCheck.primedStreak === 2 && resetCheck.streak === 0 && resetCheck.mult === 1 && resetCheck.timer === 0 && resetCheck.opacity === '0') {
      pass('COMBO_FX.reset() cleanly restores baseline streak, multiplier, timer, and HUD');
    } else {
      fail('COMBO_FX.reset() failed', JSON.stringify(resetCheck));
    }

  } catch (err) {
    fail('Dynamic test execution threw exception', err.stack || err.message);
  } finally {
    await browser.close();
  }
}

await runDynamicTests();

console.log(`\nAll combo multiplier suite checks complete. Failures: ${failures}`);
if (failures > 0) process.exit(1);

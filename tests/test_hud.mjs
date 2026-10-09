// tests/test_hud.mjs
// Dynamic Puppeteer acceptance tests for SPEC-V12: HUD design

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

console.log('[SPEC-V12 Acceptance Run]');

// 1. Static source checks
const html = fs.readFileSync(htmlPath, 'utf8');
if (/const\s+HUD_FX\s*=\s*\{/.test(html)) {
  pass('HUD_FX controller in source');
} else {
  fail('HUD_FX controller missing in source');
}

if (/id=["']speedTrack["']/.test(html) && /id=["']speedFill["']/.test(html)) {
  pass('Speed meter elements present in markup');
} else {
  fail('Speed meter elements missing in markup');
}

if (/id=["']comboWrapper["']/.test(html)) {
  pass('Combo bar elements present in markup');
} else {
  fail('Combo bar elements missing in markup');
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
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('threejs-snake-settings', JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',sound:false,haptics:false}}));
      localStorage.setItem('threejs-snake-scores-v2', JSON.stringify({schemaVersion:2,legacyImported:true,legacy:{best:null,records:[]},records:[{schemaVersion:2,rulesVersion:2,runId:'legacy-hud-prior',mode:'classic',category:'casual',seed:'CASUAL-prior',isDaily:false,dailyDate:null,score:50,length:8,timeMs:1000,maxSpeedLevel:2,maxCombo:1,foodBreakdown:{common:5,golden:0,jittery:0,total:5},outcome:'wall',completedAt:'2026-10-08T00:00:00.000Z'}]}));
    });
    await page.goto('http://localhost:8099/snake-three.html', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 600));

    // Check HUD_FX initialization
    // B04: inspect the real player's reset HUD, not mutable title-demo score (isolated fully in B05).
    await page.evaluate(() => { window.startGame(); window.pauseGame(); });
    const initCheck = await page.evaluate(() => {
      if (typeof window.HUD_FX === 'undefined') return null;
      return {
        on: window.HUD_FX.ON,
        level: window.HUD_FX.speedLevel,
        prog: window.HUD_FX.speedProgress,
        badge: document.getElementById('levelBadge') ? document.getElementById('levelBadge').textContent : '',
        fillProg: document.getElementById('speedFill') ? document.getElementById('speedFill').style.getPropertyValue('--speed-prog') : null,
        hasCombo: !!document.getElementById('comboWrapper'),
        hintText: document.getElementById('hint') ? document.getElementById('hint').textContent : '',
        role: document.getElementById('speedTrack') ? document.getElementById('speedTrack').getAttribute('role') : null
      };
    });

    if (initCheck && initCheck.on) {
      pass('HUD_FX controller initialized');
    } else {
      fail('HUD_FX controller failed to initialize', JSON.stringify(initCheck));
    }

    if (initCheck && initCheck.level === 1 && initCheck.prog === 0.0) {
      pass('Initial speed level is 1 with 0.0 progress', `level: ${initCheck.level}, prog: ${initCheck.prog}`);
    } else {
      fail('Initial speed state incorrect', JSON.stringify(initCheck));
    }

    if (initCheck && initCheck.badge.includes('SPD LVL 1')) {
      pass('Initial badge displays SPD LVL 1', `badge: ${initCheck.badge}`);
    } else {
      fail('Initial badge text incorrect', JSON.stringify(initCheck));
    }

    if (initCheck && initCheck.role === 'progressbar') {
      pass('Speed track carries accessible role="progressbar"');
    } else {
      fail('Speed track missing role="progressbar"', JSON.stringify(initCheck));
    }

    // Test Progress Within Bracket (score = 15 -> progress = 0.5)
    const midBracket = await page.evaluate(() => {
      window.HUD_FX.update(15, 0, 115);
      return {
        level: window.HUD_FX.speedLevel,
        prog: window.HUD_FX.speedProgress,
        fillProg: document.getElementById('speedFill').style.getPropertyValue('--speed-prog'),
        ariaNow: document.getElementById('speedTrack').getAttribute('aria-valuenow')
      };
    });

    if (midBracket.level === 1 && Math.abs(midBracket.prog - 0.5) < 0.001) {
      pass('Progress within speed bracket calculates correctly at score 15', `prog: ${midBracket.prog}`);
    } else {
      fail('Progress calculation within bracket failed', JSON.stringify(midBracket));
    }

    if (midBracket.fillProg && Math.abs(parseFloat(midBracket.fillProg) - 0.5) < 0.01) {
      pass('CSS variable --speed-prog updated to 0.5', `fillProg: ${midBracket.fillProg}`);
    } else {
      fail('CSS variable --speed-prog not updated', JSON.stringify(midBracket));
    }

    if (midBracket.ariaNow === '50') {
      pass('aria-valuenow updated to 50 for accessibility', `aria-valuenow: ${midBracket.ariaNow}`);
    } else {
      fail('aria-valuenow not updated', JSON.stringify(midBracket));
    }

    // Test Speed Level Up at boundary (score = 30 -> level = 2, progress = 0.0)
    const levelUp = await page.evaluate(() => {
      window.HUD_FX.update(30, 0, 111);
      return {
        level: window.HUD_FX.speedLevel,
        prog: window.HUD_FX.speedProgress,
        badge: document.getElementById('levelBadge').textContent
      };
    });

    if (levelUp.level === 2 && Math.abs(levelUp.prog) < 0.001) {
      pass('Score 30 advances to Speed Level 2 with 0.0 progress', `level: ${levelUp.level}`);
    } else {
      fail('Level advancement failed', JSON.stringify(levelUp));
    }

    if (levelUp.badge.includes('SPD LVL 2')) {
      pass('Badge updates to SPD LVL 2', `badge: ${levelUp.badge}`);
    } else {
      fail('Badge text did not advance', JSON.stringify(levelUp));
    }

    // Test Max Speed Capping (score = 420 -> level = 15, max progress = 1.0)
    const maxSpeed = await page.evaluate(() => {
      window.HUD_FX.update(420, 0, 62);
      return {
        level: window.HUD_FX.speedLevel,
        prog: window.HUD_FX.speedProgress,
        badge: document.getElementById('levelBadge').textContent,
        fillProg: document.getElementById('speedFill').style.getPropertyValue('--speed-prog')
      };
    });

    if (maxSpeed.level === 15 && Math.abs(maxSpeed.prog - 1.0) < 0.001) {
      pass('Score 420 caps at Speed Level 15 (MAX) with 1.0 progress', `level: ${maxSpeed.level}`);
    } else {
      fail('Max speed capping failed', JSON.stringify(maxSpeed));
    }

    if (maxSpeed.badge.includes('MAX')) {
      pass('Badge displays (MAX) indicator at top speed', `badge: ${maxSpeed.badge}`);
    } else {
      fail('Badge missing (MAX) indicator', JSON.stringify(maxSpeed));
    }

    // Test Personal Best Record Milestone & Tie Semantics
    const tieCheck = await page.evaluate(() => {
      window.HUD_FX.previousBest = 0; // Presentation alias cannot override captured player priorBest=50.
      window.HUD_FX.update(50, 50, 111); // score == previousBest -> NOT a new record
      return { isRecord: window.HUD_FX.isRecord };
    });

    if (!tieCheck.isRecord) {
      pass('Score equal to previous best is not a record (strict > required)');
    } else {
      fail('Tie with previous best incorrectly triggered record', JSON.stringify(tieCheck));
    }

    const recordState = await page.evaluate(() => {
      window.HUD_FX.previousBest = 999999;
      window.HUD_FX.update(60, 60, 107); // Captured priorBest=50; ignore poisoned presentation alias.
      const scoreEl = document.getElementById('score');
      const bestEl = document.getElementById('best');
      return {
        isRecord: window.HUD_FX.isRecord,
        scoreHasClass: scoreEl ? scoreEl.classList.contains('new-record') : false,
        bestHasClass: bestEl ? bestEl.classList.contains('new-record') : false
      };
    });

    if (recordState.isRecord && (recordState.scoreHasClass || recordState.bestHasClass)) {
      pass('Surpassing previous best triggers new record milestone state');
    } else {
      fail('New record state not triggered', JSON.stringify(recordState));
    }

    // Test Combo Bar API
    const comboActive = await page.evaluate(() => {
      window.HUD_FX.setCombo(2, 0.75);
      const wrap = document.getElementById('comboWrapper');
      const badge = document.getElementById('comboBadge');
      const fill = document.getElementById('comboFill');
      return {
        active: window.HUD_FX.comboActive,
        mult: window.HUD_FX.comboMultiplier,
        prog: window.HUD_FX.comboProgress,
        badgeText: badge ? badge.textContent : '',
        fillProg: fill ? fill.style.getPropertyValue('--combo-prog') : null,
        opacity: wrap ? wrap.style.opacity : null
      };
    });

    if (comboActive.active && comboActive.mult === 2 && Math.abs(comboActive.prog - 0.75) < 0.01) {
      pass('setCombo(2, 0.75) correctly activates combo state', `mult: ${comboActive.mult}, prog: ${comboActive.prog}`);
    } else {
      fail('setCombo activation failed', JSON.stringify(comboActive));
    }

    if (comboActive.badgeText.includes('x2')) {
      pass('Combo badge displays x2 multiplier', `badge: ${comboActive.badgeText}`);
    } else {
      fail('Combo badge text incorrect', JSON.stringify(comboActive));
    }

    // Test Combo Deactivation
    const comboDeactivated = await page.evaluate(() => {
      window.HUD_FX.setCombo(1, 0.0);
      return {
        active: window.HUD_FX.comboActive,
        opacity: document.getElementById('comboWrapper').style.opacity
      };
    });

    if (!comboDeactivated.active) {
      pass('setCombo(1, 0.0) cleanly deactivates combo bar');
    } else {
      fail('Combo deactivation failed', JSON.stringify(comboDeactivated));
    }

    // C01/C02: selected-map help replaces decorative quality keycaps.
    const controlsCheck = await page.evaluate(() => {
      const hint = document.getElementById('hint');
      if (!hint) return null;
      return { text: hint.textContent };
    });

    if (controlsCheck && controlsCheck.text === 'Move with Arrow keys or WASD. Pause with Space. Open settings with Esc.') {
      pass('Controls help names selected default steering map, Space pause and Esc settings', controlsCheck.text);
    } else {
      fail('Selected-map controls help incorrect', JSON.stringify(controlsCheck));
    }

    // Test Zero WebGL / Three.js Impact (programs and draw calls invariant)
    const zeroWebglImpact = await page.evaluate(() => {
      if (!window.renderer) return null;
      const progBefore = window.renderer.info.programs ? window.renderer.info.programs.length : 0;
      for (let s = 0; s < 500; s += 10) {
        window.HUD_FX.update(s, 100, 115);
        window.HUD_FX.setCombo(2, 0.5);
      }
      const progAfter = window.renderer.info.programs ? window.renderer.info.programs.length : 0;
      return { progBefore, progAfter, delta: progAfter - progBefore };
    });

    if (zeroWebglImpact && zeroWebglImpact.delta === 0) {
      pass('Zero WebGL program impact across 50 HUD updates', `programs: ${zeroWebglImpact.progBefore} -> ${zeroWebglImpact.progAfter}`);
    } else {
      fail('WebGL program count changed unexpectedly during HUD updates', JSON.stringify(zeroWebglImpact));
    }

    // Test Clean Reset
    const resetCheck = await page.evaluate(() => {
      window.HUD_FX.reset();
      return {
        level: window.HUD_FX.speedLevel,
        prog: window.HUD_FX.speedProgress,
        isRecord: window.HUD_FX.isRecord,
        badge: document.getElementById('levelBadge').textContent
      };
    });

    if (resetCheck.level === 1 && resetCheck.prog === 0.0 && !resetCheck.isRecord) {
      pass('HUD_FX.reset() cleanly restores baseline level and progress');
    } else {
      fail('HUD_FX.reset() failed', JSON.stringify(resetCheck));
    }

  } catch (err) {
    fail('Dynamic test execution threw exception', err.stack || err.message);
  } finally {
    await browser.close();
  }
}

await runDynamicTests();

console.log(`\nAll HUD design suite checks complete. Failures: ${failures}`);
if (failures > 0) process.exit(1);

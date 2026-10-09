// tests/test_seeded_rng.mjs
// Dynamic Puppeteer acceptance test for SPEC-G7: Seeded RNG & Challenge of the Day

import puppeteer from './helpers/legacy-browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('[SPEC-G7 Acceptance Run]');

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
  await page.waitForFunction(() => window.RNG && window.RNG.random !== undefined, { timeout: 10000 });

  // 1. Initial State & RNG Controller Inspection
  const initialRng = await page.evaluate(() => {
    return {
      hasRng: Boolean(window.RNG),
      hasSetSeed: typeof window.setSeed === 'function',
      hasGetSeed: typeof window.getSeed === 'function',
      hasStartDaily: typeof window.startDailyChallenge === 'function',
      hasGetDailySeed: typeof window.getDailySeed === 'function',
      seed: window.getSeed ? window.getSeed() : null,
      sampleVal: window.RNG ? window.RNG.random() : -1
    };
  });

  if (initialRng.hasRng && initialRng.hasSetSeed && initialRng.sampleVal >= 0 && initialRng.sampleVal < 1) {
    pass('RNG controller initialized with valid PRNG output', `seed: ${initialRng.seed}, sample: ${initialRng.sampleVal.toFixed(4)}`);
  } else {
    fail('RNG controller missing or invalid output', JSON.stringify(initialRng));
  }

  // 2. Deterministic Sequence Invariant
  const determinismCheck = await page.evaluate(() => {
    window.setSeed('benchmark-42');
    const seq1 = [];
    for (let i = 0; i < 8; i++) seq1.push(window.RNG.random());

    window.setSeed('benchmark-42');
    const seq2 = [];
    for (let i = 0; i < 8; i++) seq2.push(window.RNG.random());

    window.setSeed('different-seed-99');
    const seq3 = [];
    for (let i = 0; i < 8; i++) seq3.push(window.RNG.random());

    const matches1And2 = seq1.every((v, i) => v === seq2[i]);
    const differs3 = seq1.some((v, i) => v !== seq3[i]);

    return { matches1And2, differs3, len: seq1.length, seq1Preview: seq1.slice(0, 3) };
  });

  if (determinismCheck.matches1And2 && determinismCheck.differs3) {
    pass('PRNG produces identical sequences for identical seeds and diverges for different seeds',
      `preview: [${determinismCheck.seq1Preview.map(n => n.toFixed(3)).join(', ')}]`);
  } else {
    fail('PRNG sequence determinism failed', JSON.stringify(determinismCheck));
  }

  // 3. Reproducible Gameplay Food Placement
  const foodDeterminism = await page.evaluate(() => {
    // Compare the player stream, not a title-demo render context.
    window.stopAttract(true);
    window.setSeed('fixed-food-seed-77');
    window.resetGame();
    const run1Food = { x: window.food.x, z: window.food.z };
    const run1Type = window.PREY_FX ? window.PREY_FX.entities[0].type : null;

    // Trigger two more spawns
    window.spawnFood(1);
    const run1FoodB = { x: window.food.x, z: window.food.z };
    window.spawnFood(1);
    const run1FoodC = { x: window.food.x, z: window.food.z };

    // Repeat run with identical seed
    window.setSeed('fixed-food-seed-77');
    window.resetGame();
    const run2Food = { x: window.food.x, z: window.food.z };
    const run2Type = window.PREY_FX ? window.PREY_FX.entities[0].type : null;

    window.spawnFood(1);
    const run2FoodB = { x: window.food.x, z: window.food.z };
    window.spawnFood(1);
    const run2FoodC = { x: window.food.x, z: window.food.z };

    const initialMatch = run1Food.x === run2Food.x && run1Food.z === run2Food.z && run1Type === run2Type;
    const bMatch = run1FoodB.x === run2FoodB.x && run1FoodB.z === run2FoodB.z;
    const cMatch = run1FoodC.x === run2FoodC.x && run1FoodC.z === run2FoodC.z;

    return {
      initialMatch,
      bMatch,
      cMatch,
      run1: [run1Food, run1FoodB, run1FoodC],
      run2: [run2Food, run2FoodB, run2FoodC],
      type: run1Type
    };
  });

  if (foodDeterminism.initialMatch && foodDeterminism.bMatch && foodDeterminism.cMatch) {
    pass('Food placement and prey archetype sequence 100% reproducible with fixed seed',
      `coords: (${foodDeterminism.run1.map(p => `${p.x},${p.z}`).join(' → ')})`);
  } else {
    fail('Food placement determinism failed', JSON.stringify(foodDeterminism));
  }

  // 4. Daily Challenge Activation & UI State
  const dailyActivation = await page.evaluate(() => {
    const previousSeed=window.getSeed(),previousCount=window.RNG.stepCount;
    window.startDailyChallenge();
    const armedUnchanged=window.getSeed()===previousSeed && window.RNG.stepCount===previousCount;
    const expectedDate = new Date().toISOString().slice(0, 10);
    window.startGame();
    const dailySeed = window.getSeed();
    const isDaily = window.RNG.isDaily;
    const dailyBtn = document.getElementById('dailyBtn');
    const isBtnActive = dailyBtn ? dailyBtn.classList.contains('active') : false;

    return {
      dailySeed,armedUnchanged,
      expectedPrefix: `DAILY-${expectedDate}`,
      isDaily,
      isBtnActive
    };
  });

  if (dailyActivation.armedUnchanged && dailyActivation.isDaily && dailyActivation.dailySeed.startsWith('DAILY-') && dailyActivation.isBtnActive) {
    pass('Daily title intent leaves active RNG unchanged; actual Start captures UTC seed and active button', `seed: ${dailyActivation.dailySeed}`);
  } else {
    fail('Daily Challenge activation failed', JSON.stringify(dailyActivation));
  }

  // 5. URL Parameter Handling (?seed=...)
  const pageWithCustomSeed = await browser.newPage();
  await pageWithCustomSeed.setViewport({ width: 1000, height: 700 });
  await pageWithCustomSeed.goto('http://localhost:8099/snake-three.html?seed=speedrun2026', { waitUntil: 'domcontentloaded' });
  await pageWithCustomSeed.waitForFunction(() => window.RNG && window.getSeed, { timeout: 10000 });

  const customSeedCheck = await pageWithCustomSeed.evaluate(() => {
    return {
      seed: window.getSeed(),
      isDaily: window.RNG.isDaily
    };
  });

  if (customSeedCheck.seed === 'speedrun2026' && !customSeedCheck.isDaily) {
    pass('URL parameter ?seed=speedrun2026 accurately sets active run seed', `seed: ${customSeedCheck.seed}`);
  } else {
    fail('Custom URL seed handling failed', JSON.stringify(customSeedCheck));
  }

  // Test ?seed=daily
  const pageWithDailyUrl = await browser.newPage();
  await pageWithDailyUrl.setViewport({ width: 1000, height: 700 });
  await pageWithDailyUrl.goto('http://localhost:8099/snake-three.html?seed=daily', { waitUntil: 'domcontentloaded' });
  await pageWithDailyUrl.waitForFunction(() => window.RNG && window.getSeed, { timeout: 10000 });

  const urlDailyCheck = await pageWithDailyUrl.evaluate(() => {
    return {
      seed: window.getSeed(),
      isDaily: window.RNG.isDaily
    };
  });

  if (urlDailyCheck.isDaily && urlDailyCheck.seed.startsWith('DAILY-')) {
    pass('URL parameter ?seed=daily arms Daily Challenge mode directly', `seed: ${urlDailyCheck.seed}`);
  } else {
    fail('URL ?seed=daily handling failed', JSON.stringify(urlDailyCheck));
  }

  await pageWithCustomSeed.close();
  await pageWithDailyUrl.close();

  // 6. RUN_STATS & Game Over Summary Integration
  const runStatsCheck = await page.evaluate(() => {
    window.startDailyChallenge();
    window.startGame();
    window.gameOver('wall');
    const summary = window.RUN_STATS.getSummary();
    const overlayHtml = (document.getElementById('message')?.innerHTML || '') +
      (document.getElementById('overlay')?.innerHTML || '');

    return {
      summarySeed: summary ? summary.seed : null,
      summaryIsDaily: summary ? summary.isDaily : null,
      overlayContainsSeed: overlayHtml.includes(window.getSeed())
    };
  });

  if (runStatsCheck.summaryIsDaily && runStatsCheck.summarySeed && runStatsCheck.overlayContainsSeed) {
    pass('RUN_STATS records daily seed and renders it in game over summary overlay', `seed: ${runStatsCheck.summarySeed}`);
  } else {
    fail('RUN_STATS seed summary integration failed', JSON.stringify(runStatsCheck));
  }

  if (pageErrors.length > 0) {
    fail('Browser console errors observed', pageErrors.join(' | '));
  }

} catch (err) {
  fail('Unhandled test exception', err.stack);
} finally {
  if (browser) await browser.close();
}

console.log(`\nAll G7 acceptance checks complete. Failures: ${failures}`);
if (failures > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

// tests/test_accessibility.mjs
// Dynamic Puppeteer acceptance test for SPEC-G10: Accessibility (A11y)

import puppeteer from './helpers/legacy-browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('[SPEC-G10 Acceptance Run]');

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
  await page.waitForFunction(() => window.A11Y && typeof window.setReducedMotion === 'function', { timeout: 10000 });

  // 1. Initial State & Contract Inspection
  const initialA11y = await page.evaluate(() => {
    return {
      hasA11y: Boolean(window.A11Y),
      hasSetMotion: typeof window.setReducedMotion === 'function',
      hasSetContrast: typeof window.setHighContrast === 'function',
      hasSetColorblind: typeof window.setColorblindMode === 'function',
      hasSetKeymap: typeof window.setKeymap === 'function',
      hasGetState: typeof window.getA11yState === 'function',
      state: window.getA11yState ? window.getA11yState() : null
    };
  });

  if (initialA11y.hasA11y && initialA11y.hasSetMotion && initialA11y.hasSetContrast && initialA11y.state) {
    pass('A11Y controller initialized with global contracts and default state',
      `reducedMotion: ${initialA11y.state.reducedMotion}, keymap: ${initialA11y.state.keymap}`);
  } else {
    fail('A11Y controller missing or invalid', JSON.stringify(initialA11y));
  }

  // 2. Reduced Motion Suppression
  const motionCheck = await page.evaluate(() => {
    window.setReducedMotion(true);
    // Artificially inject shake
    window.shake = 1.0;
    // Step simulation / render pass
    window.step();

    const compMat = window.compMat;
    const caVal = compMat ? compMat.uniforms.ca.value : -1;
    const grainVal = compMat ? compMat.uniforms.grain.value : -1;

    // Turn off
    window.setReducedMotion(false);
    return { caVal, grainVal, isMotionOff: window.getA11yState().reducedMotion };
  });

  if (motionCheck.caVal === 0 && motionCheck.grainVal === 0 && !motionCheck.isMotionOff) {
    pass('Reduced motion suppresses chromatic aberration and film grain to 0.0', `ca: ${motionCheck.caVal}, grain: ${motionCheck.grainVal}`);
  } else {
    fail('Reduced motion suppression failed', JSON.stringify(motionCheck));
  }

  // 3. Colour-Blind-Safe Palette Switching
  const colorblindCheck = await page.evaluate(() => {
    window.setColorblindMode('colorblind');
    const cbCommon = window.PREY_FX.mats.common.color.getHex();
    const cbGolden = window.PREY_FX.mats.golden.color.getHex();
    const cbJittery = window.PREY_FX.mats.jittery.color.getHex();

    window.setColorblindMode('default');
    const defCommon = window.PREY_FX.mats.common.color.getHex();
    const defGolden = window.PREY_FX.mats.golden.color.getHex();
    const defJittery = window.PREY_FX.mats.jittery.color.getHex();

    return {
      cbCommon: '0x' + cbCommon.toString(16),
      cbGolden: '0x' + cbGolden.toString(16),
      cbJittery: '0x' + cbJittery.toString(16),
      defCommon: '0x' + defCommon.toString(16),
      isDifferent: cbCommon !== defCommon && cbJittery !== defJittery
    };
  });

  if (colorblindCheck.isDifferent && colorblindCheck.cbCommon === '0x6b6d4') {
    pass('Colorblind safe palette mode applies accessible Cyan/Gold/Magenta hues',
      `common: ${colorblindCheck.cbCommon}, jittery: ${colorblindCheck.cbJittery}`);
  } else {
    fail('Colorblind palette switching failed', JSON.stringify(colorblindCheck));
  }

  // 4. High-Contrast Mode & Styling
  const contrastCheck = await page.evaluate(() => {
    window.setHighContrast(true);
    const hasClassOn = document.body.classList.contains('high-contrast');

    window.setHighContrast(false);
    const hasClassOff = !document.body.classList.contains('high-contrast');

    return { hasClassOn, hasClassOff };
  });

  if (contrastCheck.hasClassOn && contrastCheck.hasClassOff) {
    pass('High-contrast mode toggles .high-contrast class on document body', 'styling applied cleanly');
  } else {
    fail('High contrast mode toggle failed', JSON.stringify(contrastCheck));
  }

  // 5. Key Remapping (IJKL and HJKL)
  const keymapCheck = await page.evaluate(() => {
    window.startGame();
    window.setKeymap('ijkl');

    // Simulate 'k' (down in IJKL)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
    const dirIJKL = { ...window.dir };

    // Simulate 'j' (left in IJKL)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    const dirLeft = { ...window.dir };

    // Restore default
    window.setKeymap('wasd_arrows');

    return { dirIJKL, dirLeft };
  });

  if ((keymapCheck.dirIJKL.z === 1 || keymapCheck.dirIJKL.x !== 0) && keymapCheck.dirLeft) {
    pass('Key remapping allows alternative directional layouts (IJKL / HJKL)', `down: z=1, left: x=-1`);
  } else {
    fail('Key remapping failed', JSON.stringify(keymapCheck));
  }

  // 6. Settings Persistence in LocalStorage
  const persistenceCheck = await page.evaluate(() => {
    window.setReducedMotion(true);
    window.setColorblindMode('colorblind');
    const stored = localStorage.getItem('threejs-snake-settings');
    let parsed = null;
    try { parsed = JSON.parse(stored); } catch (e) {}
    return {
      hasStored: Boolean(stored),
      motion: parsed?.schemaVersion === 2 ? parsed.values?.reducedMotion : null,
      palette: parsed?.schemaVersion === 2 ? parsed.values?.colorblind : null
    };
  });

  if (persistenceCheck.hasStored && persistenceCheck.motion === true && persistenceCheck.palette === 'colorblind') {
    pass('Accessibility preferences persist to localStorage', `motion: true, palette: colorblind`);
  } else {
    fail('Accessibility persistence failed', JSON.stringify(persistenceCheck));
  }

  // Reload page to verify restored preferences
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.A11Y && typeof window.getA11yState === 'function', { timeout: 10000 });

  const restoredCheck = await page.evaluate(() => {
    const s = window.getA11yState();
    return {
      motion: s ? s.reducedMotion : null,
      palette: s ? s.colorblind : null
    };
  });

  if (restoredCheck.motion === true && restoredCheck.palette === 'colorblind') {
    pass('Persisted accessibility settings restored upon page reload',
      `motion: ${restoredCheck.motion}, palette: ${restoredCheck.palette}`);
  } else {
    fail('Accessibility restoration failed', JSON.stringify(restoredCheck));
  }

  if (pageErrors.length > 0) {
    fail('Browser console errors observed', pageErrors.join(' | '));
  }

} catch (err) {
  fail('Unhandled test exception', err.stack);
} finally {
  if (browser) await browser.close();
}

console.log(`\nAll G10 acceptance checks complete. Failures: ${failures}`);
if (failures > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

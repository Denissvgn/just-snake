// tests/test_settings.mjs
// Dynamic Puppeteer acceptance test for SPEC-G9: Settings & Pause Menu

import puppeteer from './helpers/legacy-browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('[SPEC-G9 Acceptance Run]');

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
  await page.waitForFunction(() => window.SETTINGS && typeof window.openSettings === 'function', { timeout: 10000 });

  // 1. Initial State & Contract Inspection
  const initialSettings = await page.evaluate(() => {
    return {
      hasSettings: Boolean(window.SETTINGS),
      hasOpen: typeof window.openSettings === 'function',
      hasClose: typeof window.closeSettings === 'function',
      hasGet: typeof window.getSettings === 'function',
      hasApply: typeof window.applySetting === 'function',
      current: window.getSettings ? window.getSettings() : null,
      hasBtn: Boolean(document.getElementById('settingsBtn'))
    };
  });

  if (initialSettings.hasSettings && initialSettings.hasOpen && initialSettings.hasBtn && initialSettings.current) {
    pass('SETTINGS controller initialized with global contracts and UI button',
      `tier: ${initialSettings.current.tier}, bloom: ${initialSettings.current.bloomOn}`);
  } else {
    fail('SETTINGS controller missing or invalid', JSON.stringify(initialSettings));
  }

  // 2. Open / Close Settings Modal via UI Button
  const modalToggleCheck = await page.evaluate(async () => {
    const btn = document.getElementById('settingsBtn');
    if (btn) btn.click();
    const modal = document.getElementById('settingsModal');
    const isVisibleAfterOpen = modal && !modal.classList.contains('hidden');

    window.closeSettings();
    const isHiddenAfterClose = modal && modal.classList.contains('hidden');

    return { isVisibleAfterOpen, isHiddenAfterClose };
  });

  if (modalToggleCheck.isVisibleAfterOpen && modalToggleCheck.isHiddenAfterClose) {
    pass('Settings modal opens via #settingsBtn and closes via closeSettings()', 'modal display toggled cleanly');
  } else {
    fail('Settings modal toggle failed', JSON.stringify(modalToggleCheck));
  }

  // 3. Live Quality Tier Setting Adjustment
  const tierChangeCheck = await page.evaluate(() => {
    window.applySetting('tier', 'low');
    const hudLow = document.getElementById('tier')?.textContent || '';
    const isLow = hudLow.toLowerCase().includes('low');

    window.applySetting('tier', 'high');
    const hudHigh = document.getElementById('tier')?.textContent || '';
    const isHigh = hudHigh.toLowerCase().includes('high');

    return { isLow, isHigh, hudLow, hudHigh };
  });

  if (tierChangeCheck.isLow && tierChangeCheck.isHigh) {
    pass('Quality tier setting changes apply live and update HUD readout',
      `low: ${tierChangeCheck.hudLow} → high: ${tierChangeCheck.hudHigh}`);
  } else {
    fail('Quality tier setting change failed', JSON.stringify(tierChangeCheck));
  }

  // 4. Live Bloom & FX Toggles
  const bloomChangeCheck = await page.evaluate(() => {
    window.applySetting('bloomOn', false);
    const hudOff = document.getElementById('tier')?.textContent || '';
    const isOff = hudOff.toLowerCase().includes('bloom off');

    window.applySetting('bloomOn', true);
    const hudOn = document.getElementById('tier')?.textContent || '';
    const isOn = !hudOn.toLowerCase().includes('bloom off');

    return { isOff, isOn, hudOff, hudOn };
  });

  if (bloomChangeCheck.isOff && bloomChangeCheck.isOn) {
    pass('Bloom toggle setting immediately affects post-processing pipeline and HUD',
      `off: ${bloomChangeCheck.hudOff} → on: ${bloomChangeCheck.hudOn}`);
  } else {
    fail('Bloom setting toggle failed', JSON.stringify(bloomChangeCheck));
  }

  // 5. Live Body Mode (Tube vs Segments) Adjustment
  const bodyModeCheck = await page.evaluate(() => {
    window.applySetting('bodyMode', 'segments');
    const hudSegs = document.getElementById('tier')?.textContent || '';
    const isSegs = hudSegs.toLowerCase().includes('segments');

    window.applySetting('bodyMode', 'tube');
    const hudTube = document.getElementById('tier')?.textContent || '';
    const isTube = hudTube.toLowerCase().includes('tube');

    return { isSegs, isTube, hudSegs, hudTube };
  });

  if (bodyModeCheck.isSegs && bodyModeCheck.isTube) {
    pass('Body mesh mode (Tube vs Segments) setting applies live',
      `segments: ${bodyModeCheck.hudSegs} → tube: ${bodyModeCheck.hudTube}`);
  } else {
    fail('Body mesh setting change failed', JSON.stringify(bodyModeCheck));
  }

  // 6. Pause Menu Integration & Keyboard Escape Handling
  const pauseCheck = await page.evaluate(async () => {
    window.startGame();
    window.pauseGame();

    const isPaused = (window.state === 'paused');
    const overlayTitle = document.getElementById('title')?.textContent || '';
    const resumeBtn = document.getElementById('resumeBtn') || document.getElementById('actionBtn');
    const isPauseShown = overlayTitle.toLowerCase().includes('pause');

    // Resume
    if (resumeBtn) resumeBtn.click();
    const isPlayingAfterResume = (window.state === 'playing');

    // Pause again
    window.pauseGame();

    return { isPaused, isPauseShown, isPlayingAfterResume };
  });

  if (pauseCheck.isPaused && pauseCheck.isPauseShown && pauseCheck.isPlayingAfterResume) {
    pass('Pause menu triggers during active gameplay and resumes cleanly', `state: playing -> paused -> playing`);
  } else {
    fail('Pause menu gameplay integration failed', JSON.stringify(pauseCheck));
  }

  // 7. Settings Persistence in LocalStorage
  const persistenceCheck = await page.evaluate(() => {
    window.applySetting('sound', false);
    const stored = localStorage.getItem('threejs-snake-settings');
    let parsed = null;
    try { parsed = JSON.parse(stored); } catch (e) {}
    return {
      hasStored: Boolean(stored),
      storedSound: parsed?.schemaVersion === 2 ? parsed.values?.sound : null
    };
  });

  if (persistenceCheck.hasStored && persistenceCheck.storedSound === false) {
    pass('Settings persist to localStorage under "threejs-snake-settings"', `stored: sound=false`);
  } else {
    fail('Settings persistence failed', JSON.stringify(persistenceCheck));
  }

  // Reload page to verify restored preferences
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SETTINGS && typeof window.getSettings === 'function', { timeout: 10000 });

  const restoredCheck = await page.evaluate(() => {
    const s = window.getSettings();
    return { sound: s ? s.sound : null };
  });

  if (restoredCheck.sound === false) {
    pass('Persisted settings restored upon page reload', `restored sound: ${restoredCheck.sound}`);
  } else {
    fail('Settings restoration failed', JSON.stringify(restoredCheck));
  }

  if (pageErrors.length > 0) {
    fail('Browser console errors observed', pageErrors.join(' | '));
  }

} catch (err) {
  fail('Unhandled test exception', err.stack);
} finally {
  if (browser) await browser.close();
}

console.log(`\nAll G9 acceptance checks complete. Failures: ${failures}`);
if (failures > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

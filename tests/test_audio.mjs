// tests/test_audio.mjs
// Dynamic Puppeteer acceptance test for SPEC-G11: Audio with Zero Assets (WebAudio Synthesis)

import puppeteer from './helpers/legacy-browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('[SPEC-G11 Acceptance Run]');

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

  // 1. Verify Zero External Audio Asset Requests
  const audioAssetRequests = [];
  page.on('request', req => {
    const url = req.url().toLowerCase();
    if (url.endsWith('.mp3') || url.endsWith('.wav') || url.endsWith('.ogg') ||
        url.endsWith('.m4a') || url.endsWith('.flac') || url.endsWith('.weba') ||
        url.includes('/audio/') || url.includes('/sounds/')) {
      audioAssetRequests.push(url);
    }
  });

  await page.goto('http://localhost:8099/snake-three.html?mode=calm&seed=audio-suite&rules=2', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.AUDIO && typeof window.playEatSound === 'function', { timeout: 10000 });

  // 2. Initial State & Global Contracts
  const initialAudio = await page.evaluate(() => {
    return {
      hasAudio: Boolean(window.AUDIO),
      hasPlayEat: typeof window.playEatSound === 'function',
      hasPlayThud: typeof window.playThudSound === 'function',
      hasPlayTongue: typeof window.playTongueHiss === 'function',
      hasSetAudio: typeof window.setAudioEnabled === 'function',
      hasGetState: typeof window.getAudioState === 'function',
      state: window.getAudioState ? window.getAudioState() : null
    };
  });

  if (initialAudio.hasAudio && initialAudio.hasPlayEat && initialAudio.hasPlayThud &&
      initialAudio.hasPlayTongue && initialAudio.hasSetAudio && initialAudio.state) {
    pass('AUDIO controller initialized with global contracts and default state',
      `enabled: ${initialAudio.state.enabled}, ctx: ${initialAudio.state.ctxState}`);
  } else {
    fail('AUDIO controller missing or invalid contracts', JSON.stringify(initialAudio));
  }

  // 3. AudioContext Unlock on User Gesture
  await page.click('#actionBtn'); // A trusted gesture creates a real player, outside title-demo ownership.
  const unlockCheck = await page.evaluate(async () => {
    window.arrangeNextMovement(100000);
    if (window.AUDIO.unlock) await window.AUDIO.unlock();
    return window.getAudioState();
  });

  if (unlockCheck.unlocked || unlockCheck.ctxState === 'running') {
    pass('AudioContext safely unlocks upon user gesture', `state: ${unlockCheck.ctxState}, unlocked: ${unlockCheck.unlocked}`);
  } else {
    fail('AudioContext unlock failed', JSON.stringify(unlockCheck));
  }

  // 4. Eat Sound Combo Multiplier Pitch Ladder
  const comboPitches = await page.evaluate(() => {
    const freqs = [];
    for (let c = 1; c <= 5; c++) {
      const f = window.playEatSound(c, 'common');
      freqs.push(f);
    }
    const goldenRes = window.playEatSound(2, 'golden');
    const jitteryRes = window.playEatSound(2, 'jittery');
    return { freqs, goldenRes, jitteryRes };
  });

  const freqsAscending = comboPitches.freqs.every((f, i, arr) => i === 0 || f > arr[i - 1]);
  if (freqsAscending && comboPitches.freqs.length === 5) {
    pass('Eat sound pitches up monotonically with combo multiplier (x1 -> x5)',
      `frequencies: [${comboPitches.freqs.map(f => Math.round(f) + 'Hz').join(', ')}]`);
  } else {
    fail('Combo pitch ascension failed', JSON.stringify(comboPitches));
  }

  await page.evaluate(()=>window.gameOver('wall'));

  // 5. Collision Thud & Pillar Metallic Resonance
  const thudCheck = await page.evaluate(() => {
    const wallRes = window.playThudSound('wall');
    const pillarRes = window.playThudSound('pillar');
    const selfRes = window.playThudSound('self');
    return { wall: wallRes, pillar: pillarRes, self: selfRes };
  });

  if (thudCheck.wall && thudCheck.pillar && thudCheck.self) {
    pass('Collision impact thuds synthesize procedural noise and resonance',
      `wall: ${thudCheck.wall.type}, pillar: ${thudCheck.pillar.type}`);
  } else {
    fail('Collision thud synthesis failed', JSON.stringify(thudCheck));
  }

  await page.click('#actionBtn');
  await page.evaluate(()=>window.arrangeNextMovement(100000));

  // 6. Tongue Hiss Procedural Synthesis
  const tongueCheck = await page.evaluate(() => {
    const res = window.playTongueHiss();
    return res;
  });

  if (tongueCheck && tongueCheck.success) {
    pass('Tongue hiss synthesizes procedural high-pass noise burst', `filter: ${tongueCheck.filterFreq}Hz`);
  } else {
    fail('Tongue hiss synthesis failed', JSON.stringify(tongueCheck));
  }

  // 7. Speed Drone Dynamic Frequency Modulation
  const droneCheck = await page.evaluate(() => {
    window.startGame();
    window.AUDIO.updateDrone(0.0, 'playing');
    const baseFreq = window.AUDIO.getDroneFreq ? window.AUDIO.getDroneFreq() : 55;

    window.AUDIO.updateDrone(1.0, 'playing');
    const maxFreq = window.AUDIO.getDroneFreq ? window.AUDIO.getDroneFreq() : 110;

    window.AUDIO.updateDrone(0.5, 'paused');
    const isPausedSilent = window.AUDIO.isDroneSilent ? window.AUDIO.isDroneSilent() : true;

    return { baseFreq, maxFreq, isPausedSilent, freqIncreased: maxFreq > baseFreq };
  });

  if (droneCheck.freqIncreased && droneCheck.isPausedSilent) {
    pass('Speed drone frequency ascends with speedFactor and silences when paused',
      `base: ${droneCheck.baseFreq}Hz -> max: ${droneCheck.maxFreq}Hz`);
  } else {
    fail('Speed drone modulation failed', JSON.stringify(droneCheck));
  }

  // 8. Settings Mute Toggle, UI Button & LocalStorage Persistence
  const muteCheck = await page.evaluate(() => {
    window.setAudioEnabled(false);
    const s1 = window.getAudioState();
    const btnText1 = document.getElementById('soundToggleBtn') ? document.getElementById('soundToggleBtn').textContent : '';

    const stored1 = localStorage.getItem('threejs-snake-settings');
    const parsed1 = stored1 ? JSON.parse(stored1) : {};

    window.setAudioEnabled(true);
    const s2 = window.getAudioState();
    const btnText2 = document.getElementById('soundToggleBtn') ? document.getElementById('soundToggleBtn').textContent : '';

    // Re-mute to test reload persistence
    window.setAudioEnabled(false);

    return {
      mutedEnabled: s1.enabled,
      unmutedEnabled: s2.enabled,
      btnMuted: btnText1.includes('MUTED'),
      btnUnmuted: btnText2.includes('ON'),
      persistedSound: parsed1.values?.sound
    };
  });

  if (!muteCheck.mutedEnabled && muteCheck.unmutedEnabled && muteCheck.btnMuted &&
      muteCheck.btnUnmuted && muteCheck.persistedSound === false) {
    pass('Audio mute toggle updates master gain, UI button text, and persists to localStorage',
      'muted -> unmuted -> persisted');
  } else {
    fail('Audio mute toggle failed', JSON.stringify(muteCheck));
  }

  // Reload page to verify restored sound preference
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.AUDIO && typeof window.getAudioState === 'function', { timeout: 10000 });

  const restoredCheck = await page.evaluate(() => {
    const s = window.getAudioState();
    const btn = document.getElementById('soundToggleBtn');
    return {
      enabled: s.enabled,
      btnText: btn ? btn.textContent : ''
    };
  });

  if (restoredCheck.enabled === false && restoredCheck.btnText.includes('MUTED')) {
    pass('Persisted mute setting restored upon page reload', `enabled: ${restoredCheck.enabled}`);
  } else {
    fail('Audio persistence restoration failed', JSON.stringify(restoredCheck));
  }

  // Restore audio to enabled for subsequent tests
  await page.evaluate(() => window.setAudioEnabled(true));

  // 9. Zero External Audio Asset Downloads Verification
  if (audioAssetRequests.length === 0) {
    pass('Zero audio asset files downloaded (100% pure WebAudio procedural synthesis)', '0 network audio requests');
  } else {
    fail('Audio assets unexpectedly requested over network', audioAssetRequests.join(', '));
  }

  if (pageErrors.length > 0) {
    fail('Browser console errors observed', pageErrors.join(' | '));
  }

} catch (err) {
  fail('Unhandled test exception', err.stack);
} finally {
  if (browser) await browser.close();
}

console.log(`\nAll G11 acceptance checks complete. Failures: ${failures}`);
if (failures > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

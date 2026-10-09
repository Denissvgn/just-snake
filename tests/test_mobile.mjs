// tests/test_mobile.mjs
// Dynamic Puppeteer acceptance test for SPEC-G12: Mobile Experience (Radial Pad, Touch-Action, Haptics & Fullscreen)

import puppeteer from './helpers/legacy-browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('[SPEC-G12 Acceptance Run]');

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

  await page.goto('http://localhost:8099/snake-three.html?mode=calm&seed=legacy-mobile', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.MOBILE && typeof window.showRadialPad === 'function', { timeout: 10000 });

  // 1. Verify Canvas CSS Rules (touch-action: none, user-select: none)
  const canvasStyles = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const style = window.getComputedStyle(canvas);
    return {
      touchAction: style.touchAction,
      userSelect: style.userSelect || style.webkitUserSelect
    };
  });

  if (canvasStyles && canvasStyles.touchAction === 'none') {
    pass('Canvas enforces touch-action: none to suppress pull-to-refresh & pinch zoom',
      `touchAction: ${canvasStyles.touchAction}, userSelect: ${canvasStyles.userSelect}`);
  } else {
    fail('Canvas touch-action guard missing or incorrect', JSON.stringify(canvasStyles));
  }

  // 2. Verify DOM Markup: Radial Pad HUD & Fullscreen Button
  const domCheck = await page.evaluate(() => {
    const pad = document.getElementById('radialPad');
    const ring = pad ? pad.querySelector('.radial-ring') : null;
    const knob = pad ? pad.querySelector('.radial-knob') : null;
    const pips = pad ? pad.querySelectorAll('.radial-pip') : [];
    const fsBtn = document.getElementById('fullscreenBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    return {
      hasPad: Boolean(pad),
      hasRing: Boolean(ring),
      hasKnob: Boolean(knob),
      pipCount: pips.length,
      hasFsBtn: Boolean(fsBtn),
      fsBtnParent: fsBtn ? fsBtn.parentElement === (settingsBtn ? settingsBtn.parentElement : null) : false
    };
  });

  if (domCheck.hasPad && domCheck.hasRing && domCheck.hasKnob && domCheck.pipCount === 4 && domCheck.hasFsBtn) {
    pass('DOM markup contains complete #radialPad HUD and #fullscreenBtn beside #settingsBtn',
      `pips: ${domCheck.pipCount}, fsBtn aligned: ${domCheck.fsBtnParent}`);
  } else {
    fail('DOM markup elements incomplete', JSON.stringify(domCheck));
  }

  // 3. Verify Global Contracts Surface
  const contractsCheck = await page.evaluate(() => {
    return {
      hasMobile: Boolean(window.MOBILE),
      hasShowPad: typeof window.showRadialPad === 'function',
      hasHidePad: typeof window.hideRadialPad === 'function',
      hasTriggerHaptic: typeof window.triggerHaptic === 'function',
      hasToggleFullscreen: typeof window.toggleFullscreen === 'function',
      hasGetMobileState: typeof window.getMobileState === 'function',
      initialState: window.getMobileState ? window.getMobileState() : null
    };
  });

  if (contractsCheck.hasMobile && contractsCheck.hasShowPad && contractsCheck.hasHidePad &&
      contractsCheck.hasTriggerHaptic && contractsCheck.hasToggleFullscreen && contractsCheck.hasGetMobileState &&
      contractsCheck.initialState) {
    pass('Global contracts surface exposed on window with valid initial state',
      `active: ${contractsCheck.initialState.active}, hapticsEnabled: ${contractsCheck.initialState.hapticsEnabled}`);
  } else {
    fail('Global contracts surface missing or invalid', JSON.stringify(contractsCheck));
  }

  // 4. Test Programmatic Show and Hide of Radial Pad
  const padVisibilityCheck = await page.evaluate(() => {
    window.showRadialPad(250, 350);
    const pad = document.getElementById('radialPad');
    const stateActive = window.getMobileState();
    const styleActive = {
      opacity: window.getComputedStyle(pad).opacity,
      left: pad.style.left,
      top: pad.style.top
    };

    window.hideRadialPad();
    const stateHidden = window.getMobileState();
    const styleHidden = {
      opacity: pad.style.opacity
    };

    return { stateActive, styleActive, stateHidden, styleHidden };
  });

  if (padVisibilityCheck.stateActive.active === true &&
      padVisibilityCheck.styleActive.left === '250px' &&
      padVisibilityCheck.styleActive.top === '350px' &&
      padVisibilityCheck.stateHidden.active === false &&
      padVisibilityCheck.styleHidden.opacity === '0') {
    pass('showRadialPad and hideRadialPad correctly position and toggle visual pad state',
      `shown at (${padVisibilityCheck.styleActive.left}, ${padVisibilityCheck.styleActive.top}), hidden opacity: ${padVisibilityCheck.styleHidden.opacity}`);
  } else {
    fail('Programmatic radial pad show/hide failed', JSON.stringify(padVisibilityCheck));
  }

  await page.click('#actionBtn');
  await page.evaluate(()=>window.arrangeNextMovement(100000));

  // 5. Test Pointer Event Handling: Continuous Steering & Pip Illumination
  const pointerGestureCheck = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const pad = document.getElementById('radialPad');
    const knob = pad.querySelector('.radial-knob');
    const pipDown = pad.querySelector('.radial-pip[data-dir="down"]');
    const pipRight = pad.querySelector('.radial-pip[data-dir="right"]');

    // Start touch at (300, 300)
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 300, pointerType: 'touch', pointerId:1, isPrimary:true, button:0, buttons:1, bubbles: true }));
    const downPos = {
      active: window.getMobileState().active,
      x: window.getMobileState().x,
      y: window.getMobileState().y
    };

    // Move downwards to (300, 350) - dy = 50px (>= 20px threshold)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 350, pointerType: 'touch', pointerId:1, isPrimary:true, button:0, buttons:1, bubbles: true }));
    const stateAfterDownMove = window.getMobileState();
    const pipDownActive = pipDown ? pipDown.classList.contains('active') : false;
    const knobDownTransform = knob ? knob.style.transform : '';

    // Move rightwards to (360, 300) - dx = 60px
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 360, clientY: 300, pointerType: 'touch', pointerId:1, isPrimary:true, button:0, buttons:1, bubbles: true }));
    const stateAfterRightMove = window.getMobileState();
    const pipRightActive = pipRight ? pipRight.classList.contains('active') : false;

    // Release finger
    window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId:1, isPrimary:true, button:0, buttons:1, bubbles: true }));
    const stateAfterUp = window.getMobileState();

    return {
      downPos,
      stateAfterDownMove,
      pipDownActive,
      knobDownTransform,
      stateAfterRightMove,
      pipRightActive,
      stateAfterUp
    };
  });

  if (pointerGestureCheck.downPos.active &&
      pointerGestureCheck.downPos.x === 300 &&
      pointerGestureCheck.downPos.y === 300 &&
      pointerGestureCheck.stateAfterDownMove.dir === 'down' &&
      pointerGestureCheck.pipDownActive &&
      pointerGestureCheck.stateAfterRightMove.dir === 'right' &&
      pointerGestureCheck.pipRightActive &&
      pointerGestureCheck.stateAfterUp.active === false) {
    pass('Continuous pointer gesture steers snake immediately and illuminates directional pips',
      `down queued: ${pointerGestureCheck.stateAfterDownMove.dir}, right queued: ${pointerGestureCheck.stateAfterRightMove.dir}`);
  } else {
    fail('Continuous pointer gesture steering failed', JSON.stringify(pointerGestureCheck));
  }

  // 6. Test Procedural Haptic Dispatcher & Settings Guard
  const hapticCheck = await page.evaluate(() => {
    const vibrateCalls = [];
    navigator.vibrate = (pattern) => {
      vibrateCalls.push(pattern);
      return true;
    };

    // Ensure haptics enabled
    if (window.SETTINGS) window.SETTINGS.set('haptics',true);
    window.MOBILE.hapticsAvailable=true;

    window.gameOver('wall'); // Actual owned crash dispatches its one death pattern.
    window.startGame();window.arrangeNextMovement(100000);
    window.triggerHaptic('eat');
    window.triggerHaptic('swipe');

    const enabledCalls = [...vibrateCalls];

    // Disable haptics and verify suppression
    vibrateCalls.length = 0;
    if (window.SETTINGS) window.SETTINGS.set('haptics',false);
    window.triggerHaptic('death');
    window.triggerHaptic('eat');

    const disabledCalls = [...vibrateCalls];

    // Restore haptics
    if (window.SETTINGS) window.SETTINGS.set('haptics',true);
    window.MOBILE.hapticsAvailable=true;

    return { enabledCalls, disabledCalls };
  });

  const deathMatch = Array.isArray(hapticCheck.enabledCalls[0]) && hapticCheck.enabledCalls[0].join(',') === '60,40,100';
  const eatMatch = hapticCheck.enabledCalls[1] === 18 || (Array.isArray(hapticCheck.enabledCalls[1]) && hapticCheck.enabledCalls[1][0] === 18);
  const swipeMatch = hapticCheck.enabledCalls[2] === 10 || (Array.isArray(hapticCheck.enabledCalls[2]) && hapticCheck.enabledCalls[2][0] === 10);
  const suppressionMatch = hapticCheck.disabledCalls.length === 0;

  if (deathMatch && eatMatch && swipeMatch && suppressionMatch) {
    pass('Procedural haptics dispatch calibrated vibration pulses and respect settings guard',
      `death: [60,40,100], eat: 18ms, swipe: 10ms, suppressed: ${suppressionMatch}`);
  } else {
    fail('Procedural haptics test failed', JSON.stringify(hapticCheck));
  }

  // 7. Test Fullscreen Button and Lifecycle
  const fullscreenCheck = await page.evaluate(async () => {
    let active=null,requests=0,exits=0;
    Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});
    Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>active});
    document.documentElement.requestFullscreen=()=>{requests++;active=document.documentElement;document.dispatchEvent(new Event('fullscreenchange'));};
    document.exitFullscreen=async()=>{exits++;active=null;document.dispatchEvent(new Event('fullscreenchange'));};
    window.MOBILE.detectFullscreen();window.MOBILE.syncFullscreen();
    await window.toggleFullscreen();const entered=document.getElementById('fullscreenBtn').getAttribute('aria-pressed');
    await window.toggleFullscreen();return {requests,exits,entered,exited:document.getElementById('fullscreenBtn').getAttribute('aria-pressed')};
  });
  if(fullscreenCheck.requests===1 && fullscreenCheck.exits===1 && fullscreenCheck.entered==='true' && fullscreenCheck.exited==='false')pass('Fullscreen normalizes void/Promise APIs and reflects actual element/change state');
  else fail('Fullscreen state synchronization failed',JSON.stringify(fullscreenCheck));

  // 8. Verify Zero Unhandled Exceptions
  if (pageErrors.length === 0) {
    pass('Zero uncaught page errors during mobile interactions');
  } else {
    fail('Encountered page errors during mobile execution', pageErrors.join('; '));
  }

} catch (err) {
  fail('Fatal runner error', err.stack || err.message);
} finally {
  if (browser) await browser.close();
}

console.log(`\nSPEC-G12 acceptance run finished with ${failures} failure(s).\n`);
process.exit(failures > 0 ? 1 : 0);

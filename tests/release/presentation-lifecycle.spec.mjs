import { test, expect } from '../helpers/release-fixture.mjs';
import { open, start, settings } from '../helpers/player-flow.mjs';
import { attachPresentationEvidence } from '../helpers/presentation-evidence.mjs';
import { localImports, sourceAdapter } from '../helpers/source-adapter.mjs';
import { validateDeclaredFontWarnings, observeDeclaredFontFaces, observeDeclaredFontLoadFailure, DECLARED_OXANIUM_FAULT_BYTES } from '../helpers/presentation-fault-evidence.mjs';

const query = '?seed=neon-lifecycle&mode=calm&rules=2';
async function prefs(page, presentation = 'original') {
  await page.addInitScript(presentation => localStorage.setItem('threejs-snake-settings', JSON.stringify({ schemaVersion: 2,
    values: { presentation, quality: 'low', aa: 'none', sound: false, bodyMode: 'segments' } })), presentation);
}
const choose = (page, value) => page.locator(`#presentationSelector [data-presentation-choice="${value}"]`).click();
async function selected(page, id = 'neon-district') {
  await expect(page.locator('body')).toHaveAttribute('data-presentation', id);
  await attachPresentationEvidence(page, test.info(), id);
}
async function delayedModule(page) {
  let release, observed, finished;
  const gate = new Promise(resolve => release = resolve), seen = new Promise(resolve => observed = resolve), done = new Promise(resolve => finished = resolve);
  const requests = [];
  await page.route('**/assets/neon-view.js*', async route => {
    requests.push(route.request().url()); observed(); await gate;
    if (page.isClosed()) return;
    const response = await route.fetch(); await route.fulfill({ response }); finished();
  });
  return { release, seen, done, requests };
}
async function nativeLoss(page) {
  const available = await page.evaluate(() => {
    const canvas = document.querySelector('canvas'), gl = canvas.getContext('webgl2');
    window.__neonLoss = { canvas, gl, extension: gl.getExtension('WEBGL_lose_context') };
    if (!window.__neonLoss.extension) return false;
    window.__neonLoss.extension.loseContext(); return true;
  });
  expect(available, 'Actual native WEBGL_lose_context is required').toBe(true);
  await expect(page.locator('#gpuStatus')).toHaveText('Graphics interrupted. Waiting for recovery.');
  expect(await page.evaluate(() => window.__neonLoss.gl.isContextLost())).toBe(true);
}
async function nativeRestore(page) {
  await page.evaluate(() => window.__neonLoss.extension.restoreContext());
  await expect(page.locator('#gpuStatus')).toHaveText('Graphics restored. Resume when you are ready.');
  expect(await page.evaluate(() => window.__neonLoss.canvas === document.querySelector('canvas') &&
    window.__neonLoss.gl === document.querySelector('canvas').getContext('webgl2') && !window.__neonLoss.gl.isContextLost())).toBe(true);
}

test('ACC-PRES-06 cold Start keeps Original during play with visible pending preference then commits at Pause', async ({ gamePage: page }) => {
  await prefs(page); const module = await delayedModule(page);
  try {
    await open(page, query); await choose(page, 'neon-district'); await module.seen;
    await start(page); module.release(); await module.done;
    await expect(page.locator('#presentationNotice')).toBeVisible();
    await expect(page.locator('#presentationLiveStatus')).toContainText('Pause or return to title');
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'original');
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'playing');
    await page.keyboard.press('Space'); await selected(page);
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
    await expect(page.locator('#neonActionBtn')).toHaveText('Resume');
    expect(module.requests).toHaveLength(1);
  } finally { module.release(); }
});

test('ACC-PRES-06 obsolete import cannot overwrite newer Original preference or steal selector focus', async ({ gamePage: page }) => {
  await prefs(page); const module = await delayedModule(page);
  try {
    await open(page, query); await choose(page, 'neon-district'); await module.seen;
    await choose(page, 'original'); const stored = await page.evaluate(() => localStorage.getItem('threejs-snake-settings'));
    const focusState = () => page.evaluate(() => ({ tag: document.activeElement.tagName,
      id: document.activeElement.id, choice: document.activeElement.getAttribute('data-presentation-choice'),
      mode: document.activeElement.getAttribute('data-mode') }));
    const pointerFocus = await focusState();
    const originalChoice = page.locator('#presentationSelector [data-presentation-choice="original"]');
    // Pointer-click focus is platform policy. Establish the state whose
    // preservation the obsolete completion must prove through the DOM API.
    await originalChoice.focus(); await expect(originalChoice).toBeFocused();
    const beforeRelease = await focusState();
    module.release(); await module.done; await selected(page, 'original');
    await expect(page.locator('body')).toHaveAttribute('data-presentation-requested', 'original');
    await expect(originalChoice).toBeFocused();
    const afterRelease = await focusState();
    expect(await page.evaluate(() => localStorage.getItem('threejs-snake-settings'))).toBe(stored);
    await choose(page, 'neon-district'); await selected(page); expect(module.requests).toHaveLength(1);
    await test.info().attach('obsolete-import-focus-timeline', { body: JSON.stringify({
      method: 'Actual pointer selection, then explicit public DOM focus precondition before releasing the obsolete import; strict before/after selector-focus, preference/storage and successful namespace reuse assertions retained.',
      pointerFocus, beforeRelease, afterRelease, requests: module.requests }), contentType: 'application/json' });
  } finally { module.release(); }
});

for (const action of ['start', 'settings']) {
  test(`ACC-PRES-06 native ${action} helper resolves the visible control after a cold descriptor race`, async ({ gamePage: page }) => {
    await prefs(page); const module = await delayedModule(page);
    await page.addInitScript(() => {
      window.__neonNativeControls = [];
      document.addEventListener('click', event => {
        const button = event.target.closest?.('#actionBtn,#neonActionBtn,#settingsBtn,#neonSettingsBtn');
        if (button) window.__neonNativeControls.push({ id: button.id, trusted: event.isTrusted, presentation: document.body.dataset.presentation });
      }, true);
    });
    const locate = page.locator.bind(page); let raced = false;
    try {
      await open(page, query); await selected(page, 'original'); await choose(page, 'neon-district'); await module.seen;
      page.locator = (...args) => {
        const locator = locate(...args);
        if (args[0] === 'body') {
          const get = locator.getAttribute.bind(locator);
          locator.getAttribute = async (name, ...rest) => {
            const value = await get(name, ...rest);
            if (!raced && name === 'data-presentation') {
              raced = true; expect(value).toBe('original'); module.release();
              await page.waitForFunction(() => document.body.dataset.presentation === 'neon-district');
            }
            return value;
          };
        }
        return locator;
      };
      if (action === 'start') await start(page); else await settings(page);
      expect(raced).toBe(true);
      expect((await page.evaluate(() => window.__neonNativeControls)).at(-1)).toEqual({
        id: action === 'start' ? 'neonActionBtn' : 'neonSettingsBtn', trusted: true, presentation: 'neon-district' });
      if (action === 'start') await expect(page.locator('body')).toHaveAttribute('data-screen', 'playing');
      else { await expect(page.locator('#settingsModal')).toBeVisible(); await page.locator('#closeSettingsBtnAction').click(); }
      await selected(page);
    } finally { page.locator = locate; module.release(); }
  });
}

test('ACC-PRES-06 ACC-PRES-08 failed real ESM evaluation falls back and explicit retry uses a new fixed-path token once', async ({ gamePage: page }) => {
  await prefs(page); const requests = [];
  await page.route('**/assets/neon-view.js*', async route => {
    requests.push(route.request().url());
    if (requests.length === 1) return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'throw new Error("ND07 declared module-evaluation failure");' });
    return route.continue();
  });
  await open(page, query); await selected(page, 'original'); await choose(page, 'neon-district');
  await expect(page.locator('#presentationStatus')).toContainText('could not load');
  await expect(page.locator('body')).toHaveAttribute('data-presentation', 'original');
  await expect(page.locator('body')).toHaveAttribute('data-presentation-requested', 'neon-district');
  const requested = await page.evaluate(() => localStorage.getItem('threejs-snake-settings'));
  await page.locator('#presentationRetryBtn').click(); await selected(page);
  expect(requests).toHaveLength(2); expect(new URL(requests[0]).search).toBe('');
  expect(new URL(requests[1]).search).toBe('?retry=1');
  expect(new URL(requests[0]).pathname).toBe(new URL(requests[1]).pathname);
  expect(await page.evaluate(() => localStorage.getItem('threejs-snake-settings'))).toBe(requested);
  await settings(page); await page.locator('#settingsPresentationSelector [data-presentation-choice="original"]').click();
  await page.locator('#settingsPresentationSelector [data-presentation-choice="neon-district"]').click();
  await page.locator('#closeSettingsBtnAction').click(); await selected(page);
  expect(requests).toHaveLength(2);
  await test.info().attach('declared-module-fault', { body: JSON.stringify({ declaration: 'Exact local ESM URL; controlled200 evaluation rejection, caught import promise; no diagnostics exemptions', requests }), contentType: 'application/json' });
});

test('ACC-PRES-06 factory failure rolls back and reuses the successful namespace on explicit retry', async ({ gamePage: page }) => {
  await prefs(page); const requests = [];
  await page.route('**/assets/neon-view.js*', async route => {
    requests.push(route.request().url()); const response = await route.fetch();
    const body = (await response.text()).replace('export function createNeonView(', 'function acceptedFactory(') +
      '\nlet declaredAttempts=0;export function createNeonView(options){if(++declaredAttempts===1)throw new Error("ND07 declared factory failure");return acceptedFactory(options);}\n';
    await route.fulfill({ response, body });
  });
  await open(page, query); await selected(page, 'original'); await choose(page, 'neon-district');
  await expect(page.locator('#presentationStatus')).toContainText('could not start');
  await expect(page.locator('body')).toHaveAttribute('data-presentation', 'original');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.locator('#presentationRetryBtn').click(); await selected(page);
  expect(requests).toHaveLength(1);
});

test.describe('explicit controlled optional font decode', () => {
  test.use({ declaredOptionalFontFault: 'oxanium-decode' });
  test('ACC-PRES-06 ACC-PRES-08 declared portrait-image and font decode faults retain matte/system-font playable Neon', async ({ gamePage: page }) => {
  await prefs(page, 'neon-district'); const responses = [], warnings = [];
  const paths = ['assets/neon/city-portrait.jpg', 'assets/neon/oxanium-ui.woff2'];
  for (const relative of paths) await page.route(`**/${relative}`, async route => {
    responses.push({ url: route.request().url(), status: 200, declared: 'Controlled invalid bytes for this exact local optional asset' });
    await route.fulfill({ status: 200, contentType: relative.endsWith('.jpg') ? 'image/jpeg' : 'font/woff2', body: DECLARED_OXANIUM_FAULT_BYTES });
  });
  page.on('console', message => { if (message.type() === 'warning' || message.type() === 'warn') warnings.push({ text: message.text(), location: message.location() }); });
  if (!process.env.RELEASE_DIST) await page.route('**/snake-three.html*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: sourceAdapter(localImports(await response.text(), new URL(route.request().url()).origin + '/'),
      { hooks: 'window.__neonMatte=()=>PRESENTATION.view.scene.getObjectByName("Wet city").material.map===null;' }) });
  });
  await open(page, query); await selected(page); await page.evaluate(() => document.fonts.ready);
  const observed = await page.evaluate(() => ({ boardWidth: document.getElementById('neonBoardViewport').getBoundingClientRect().width,
    fontUsable: document.fonts.check('500 16px Oxanium'), cssBackground: getComputedStyle(document.body).backgroundImage }));
  const fontEvidence = await page.evaluate(observeDeclaredFontFaces);
  observed.fontEvidence = fontEvidence; observed.fontFailed = fontEvidence.declared.some(font => font.status === 'error');
  observed.fontLoad = await page.evaluate(observeDeclaredFontLoadFailure);
  expect(observed.boardWidth).toBeLessThan(600); expect(observed.fontFailed).toBe(true);
  expect(observed.fontLoad).toHaveLength(1);
  expect(observed.fontLoad[0]).toMatchObject({ status: 'error', rejected: true });
  // FontFaceSet.check may report usable system fallback; the actual face load is the failure witness.
  expect(observed.cssBackground).toContain('city-wide.jpg'); expect(responses).toHaveLength(2);
  if (!process.env.RELEASE_DIST) expect(await page.evaluate(() => window.__neonMatte())).toBe(true);
  await start(page); await expect(page.locator('body')).toHaveAttribute('data-screen', 'playing');
  for (const response of responses) expect(paths.some(path => new URL(response.url).pathname.endsWith('/' + path))).toBe(true);
  const fontURL = responses.find(response => response.url.endsWith('/assets/neon/oxanium-ui.woff2')).url;
  const diagnostics = validateDeclaredFontWarnings(warnings, { documentURL: page.url(), fontURL,
    sfntVersion: Buffer.from('ND07').readUInt32BE(0) });
  await test.info().attach('declared-optional-asset-faults', { body: JSON.stringify({ declaration: paths,
    ordinaryConsoleErrorGuardUnchanged: true, declaredException: 'Only explicit controlled200 knownbytes Oxanium decode case admits one exact local Firefox sanitizer consoleerror; pageErrors and unrelated/ordinary consoleerrors remain forbidden.', responses, observed, warnings, diagnostics, intendedBoardPlate: 'portrait', cssBackdrop: 'wide' }), contentType: 'application/json' });
  });
});

test('ACC-PRES-06 actual native context restore rebuilds selected Neon without automatic Resume or extra canvas', async ({ gamePage: page }) => {
  await prefs(page, 'neon-district'); await open(page, query); await selected(page); await start(page);
  await nativeLoss(page); await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  expect(await page.locator('body').getAttribute('data-presentation-rendered')).toBeNull();
  const before = await page.locator('#pauseTelemetry').textContent(); await nativeRestore(page); await selected(page);
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  expect(await page.locator('#pauseTelemetry').textContent()).toBe(before);
  await expect(page.locator('#neonActionBtn')).toBeEnabled(); await expect(page.locator('#neonActionBtn')).toBeFocused();
  await page.locator('#neonActionBtn').click(); await expect(page.locator('body')).toHaveAttribute('data-screen', 'playing');
  await test.info().attach('native-neon-context-recovery', { body: JSON.stringify({ method: 'Actual native WEBGL_lose_context loss/restore', canvasCount: await page.locator('canvas').count(), explicitResume: 1 }), contentType: 'application/json' });
});

test('ACC-PRES-06 cold import completed during native loss re-evaluates after restore with no prior Neon view', async ({ gamePage: page }) => {
  await prefs(page); const module = await delayedModule(page);
  try {
    await open(page, query); await choose(page, 'neon-district'); await module.seen; await start(page);
    await nativeLoss(page); module.release(); await module.done;
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'original');
    await nativeRestore(page); await selected(page);
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused'); expect(module.requests).toHaveLength(1);
  } finally { module.release(); }
});

test('ACC-PRES-06 background import cannot attach until visible focus returns and never resumes play', async ({ gamePage: page }) => {
  await prefs(page); const module = await delayedModule(page);
  try {
    await open(page, query); await choose(page, 'neon-district'); await module.seen; await start(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
    module.release(); await module.done; await expect(page.locator('body')).toHaveAttribute('data-presentation', 'original');
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await selected(page);
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  } finally { module.release(); }
});

test('ACC-PRES-06 declared visible-unfocused API stimulus cannot adopt a pending view or Resume', async ({ gamePage: page }) => {
  await prefs(page); const module = await delayedModule(page);
  try {
    await open(page, query); await choose(page, 'neon-district'); await module.seen; await start(page);
    const native = await page.evaluate(() => ({ hidden: document.hidden, focused: document.hasFocus() }));
    const visible = await page.evaluate(() => {
      // Controlled public DOM lifecycle inputs; no private game state is assigned.
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false });
      window.dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange'));
      return { hidden: document.hidden, focused: document.hasFocus(), screen: document.body.dataset.screen };
    });
    expect(visible).toEqual({ hidden: false, focused: false, screen: 'paused' });
    module.release(); await module.done;
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'original');
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
    await page.evaluate(() => { delete document.hidden; delete document.visibilityState; delete document.hasFocus; window.dispatchEvent(new Event('focus')); });
    await selected(page);
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
    await test.info().attach('native-focus-visible-stimulus', { body: JSON.stringify({ native,
      declaredVisibleStimulus: visible, method: 'Real native Start and external module request; controlled DOM visibility/focus API inputs and lifecycle events. This is policy proof, not OS focus-loss certification.' }), contentType: 'application/json' });
  } finally { module.release(); }
});

if (!process.env.RELEASE_DIST) {
  test('ACC-PRES-06 source title dialogs suspend owned Neon cosmetics while legacy beam and essential snapshot remain independent', async ({ gamePage: page }) => {
    await prefs(page, 'neon-district');
    await page.route('**/snake-three.html*', async route => {
      const response = await route.fetch();
      const hooks = `window.__neonCosmetics=()=>{const view=PRESENTATION.view,frame=PRESENTATION.snapshot(1),food=view.scene.getObjectByName('Actual food slots'),matrix=new THREE.Matrix4();food.getMatrixAt(0,matrix);return {suspended:frame.suspended,engineBeam:HAZARDS.beam.pos,ownedBeam:view.scene.getObjectByName('Existing sweeping perimeter light').position.toArray(),food:matrix.elements.slice(),clock:SIMULATION.simNowMs,run:RUN_STATS.run};};`;
      await route.fulfill({ response, body: sourceAdapter(localImports(await response.text(), new URL(route.request().url()).origin + '/'), { hooks }) });
    });
    await open(page, query); await selected(page);
    await settings(page, { advanced: true }); await page.locator('#tierPills [data-tier="balanced"]').click();
    await page.locator('#closeSettingsBtnAction').click(); await selected(page);
    for (const dialog of ['settings', 'rankings']) {
      if (dialog === 'settings') await settings(page); else await page.locator('#neonRankingsBtn').click();
      const before = await page.evaluate(() => window.__neonCosmetics());
      expect(before).toMatchObject({ suspended: true, clock: 0, run: null });
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => window.__neonCosmetics());
      expect(after.ownedBeam).toEqual(before.ownedBeam); expect(after.food).toEqual(before.food);
      expect(after.engineBeam).not.toBe(before.engineBeam); expect(after.clock).toBe(0);
      if (dialog === 'settings') await page.locator('#closeSettingsBtnAction').click(); else await page.locator('#neonRankingsDoneBtn').click();
    }
  });

  test('ACC-PRES-06 source switch and native recovery preserve exact player state Original camera preferences and allocation owner', async ({ gamePage: page }) => {
    await prefs(page, 'neon-district');
    await page.route('**/snake-three.html*', async route => {
      const response = await route.fetch();
      const hooks = `const lifeRenderer=renderer,lifeCamera=camera,lifeCanvas=renderer.domElement,lifeObserver=PRESENTATION.observer;
        window.__neonLife={snap(){return JSON.stringify({run:RUN_STATS.run,summary:RUN_STATS.lastSummary,score,best,
        seed:RNG.seed,initialSeed:RNG.initialSeed,identity:RNG.identity,rng:[prng.state,hazardPrng.state,RNG.stepCount,RNG.hazardCount],
        cells:segs.map(s=>[s.x,s.z,s.px,s.pz]),dir,inputQueue,food,food2,foodVisible:[foodMesh.visible,foodMesh2.visible],
        prey:PREY_FX.entities.map(e=>[e.type,e.deadlineMs,e.hasHopped]),pillars:HAZARDS.getPillarPositions(),
        clock:[SIMULATION.simNowMs,SIMULATION.fractionMs,SIMULATION.lastMoveMs,SIMULATION.nextMoveMs,SIMULATION.movements],
        metrics:[RUN_STATS.timeAlive,RUN_STATS.maxSpeedLevel,RUN_STATS.maxCombo,RUN_STATS.foodBreakdown],stored:localStorage.getItem(SCORE_KEY)});},
        owners(){return {sameRenderer:renderer===lifeRenderer,sameCamera:camera===lifeCamera,sameCanvas:renderer.domElement===lifeCanvas,
          sameObserver:PRESENTATION.observer===lifeObserver,context:renderer.getContext()===window.__neonLoss?.gl,
          canvasOriginal:PRESENTATION.placeholder.nextSibling===renderer.domElement,
          size:renderer.getSize(new THREE.Vector2()).toArray(),window:[innerWidth,innerHeight],
          prefs:JSON.parse(localStorage.getItem('threejs-snake-settings')).values,frameSuspended:PRESENTATION.snapshot(1).suspended};}};`;
      await route.fulfill({ response, body: sourceAdapter(localImports(await response.text(), new URL(route.request().url()).origin + '/'), { hooks }) });
    });
    await open(page, query); await selected(page); await start(page); await page.locator('#neonPauseBtn').click();
    const before = await page.evaluate(() => window.__neonLife.snap()), owner = await page.evaluate(() => window.__neonLife.owners());
    await settings(page); await page.locator('#settingsPresentationSelector [data-presentation-choice="original"]').click();
    const original = await page.evaluate(() => window.__neonLife.owners());
    expect(original).toMatchObject({ sameRenderer: true, sameCamera: true, sameCanvas: true, sameObserver: true });
    expect(original.canvasOriginal).toBe(true); expect(original.size).toEqual(original.window);
    await page.locator('#settingsPresentationSelector [data-presentation-choice="neon-district"]').click();
    await page.locator('#closeSettingsBtnAction').click(); await selected(page);
    expect(await page.evaluate(() => window.__neonLife.snap())).toBe(before);
    await nativeLoss(page); await nativeRestore(page); await selected(page);
    expect(await page.evaluate(() => window.__neonLife.snap())).toBe(before);
    const after = await page.evaluate(() => window.__neonLife.owners());
    expect(owner).toMatchObject({ sameRenderer: true, sameCamera: true, sameCanvas: true, sameObserver: true });
    expect(after).toMatchObject({ sameRenderer: true, sameCamera: true, sameCanvas: true, sameObserver: true, context: true, frameSuspended: true });
    expect(after.prefs).toMatchObject({ presentation: 'neon-district', quality: 'low', aa: 'none', bodyMode: 'segments' });
    expect(after.prefs).not.toHaveProperty('reducedMotion'); expect(after.prefs).not.toHaveProperty('highContrast');
  });
}

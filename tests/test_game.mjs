/* SPEC-V2 §8 criterion 7 / SPEC-V1 §9 "test3" — gameplay autopilot regression.

   The V1/V2 acceptance notes both quote a green "gameplay autopilot" run, but the script that
   produced it lived in /tmp and was never committed, so criterion 7 was not reproducible.
   This is that harness: it plays the real page (start · eat · grow · pause · resize · tier cycle ·
   B/M toggles · die · restart) and asserts on game state plus render-target sanity.

   Stepping is deterministic: the sim is parked (`state = 'paused'`, no overlay) and `step()` is
   driven by hand, so a slow software renderer cannot make the run flaky. Real-time play is then
   exercised separately (phase 3) to catch loop regressions the manual path cannot see.

   Needs: python3 -m http.server 8099 running in the project root.
   Env:   CHROME=path/to/chrome  GAME=path/to/game.html */
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';

function decodeHalf(v) {
  const s = (v >> 15) & 1, e = (v >> 10) & 0x1f, f = v & 0x3ff;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * f / 1024;
  if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}
for (const [bits, value] of [[0x0001, 2 ** -24], [0x8001, -(2 ** -24)], [0x0400, 2 ** -14], [0x3c00, 1]]) assert.equal(decodeHalf(bits), value);
console.log('PASS shared half-float decoder: four independent reference values');


const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;   // project root, one level up
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_game.html';

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'CHECK'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`);
};

const hook = `
window.__g = {
  /* keep the tier we ask for; the auto-tuner would downgrade software rendering */
  tune: () => {
    autoTune = function () {};
    window.__loopEvents = [];
    const original = renderer.setAnimationLoop.bind(renderer);
    renderer.setAnimationLoop = callback => { window.__loopEvents.push({active:!!callback,now:performance.now(),origin:new Error().stack});return original(callback); };
  },

  st:   () => ({ state, score, len: segs.length, stepMs, dir: { ...dir }, food: { ...food },
                 head: segs.length ? { x: segs[0].x, z: segs[0].z } : null }),
  hud:  () => ({ tier: document.getElementById('tier').textContent,
                 score: document.getElementById('score').textContent,
                 overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
                 title: document.getElementById('title').textContent }),
  post: () => ({ enabled: POST.enabled, mask: POST.mask, bloomOn: POST.bloomOn, levels: POST.levels,
                 aa: POST.aa, tier: quality.tier, w: POST.w, h: POST.h,
                 scene: POST.sceneRT ? POST.sceneRT.width + 'x' + POST.sceneRT.height : null,
                 bloom: POST.bloomRT ? POST.bloomRT.width + 'x' + POST.bloomRT.height : null,
                 tags: bloomTagCount, requested: SETTINGS.requested() }),
  programs: () => renderer.info.programs.length,
  /* Count simulation steps: proves the rAF loop drives step() by itself. */
  hookSteps: () => {
    const orig = step;
    window.__steps = 0;
    step = function () { window.__steps++; return orig(); };
  },
  steps: () => window.__steps || 0,
  timing: () => ({state,screen:UI_SCREEN.screen,simNow:SIMULATION.simNowMs,nextMove:SIMULATION.nextMoveMs,lastTime,now:performance.now(),frames:renderedFrames,background:RECOVERY.background,lost:RECOVERY.lost,failed:RECOVERY.failed,diagnostic:RECOVERY.diagnostic,nativeLost:renderer.getContext().isContextLost(),xr:renderer.xr.isPresenting,hidden:document.hidden,focus:document.activeElement.tagName,tier:quality.tier,loopEvents:window.__loopEvents}),
  setTier: (t) => applyQuality(t, true),

  /* A phase that let the snake wander may have ended the run; get back to a live game. */
  ensure: () => { if (state !== 'playing') startGame(); },
  play: () => { transitionScreen('playing'); acc = 0; lastTime = performance.now(); overlay.classList.add('hidden'); },

  /* Greedy but never suicidal: pick the safe neighbour cell that closes the distance to the prey. */
  auto: (targetEats, maxSteps) => {
    let eats = 0, steps = 0;
    transitionScreen('paused');
    while (eats < targetEats && steps < maxSteps) {
      const head = segs[0];
      const free = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }].filter((d) => {
        if (d.x === -dir.x && d.z === -dir.z) return false;              // no reversing into the neck
        const nx = head.x + d.x, nz = head.z + d.z;
        if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) return false;  // wall
        for (let i = 0; i < segs.length - 1; i++)                        // body (the tail cell frees up)
          if (segs[i].x === nx && segs[i].z === nz) return false;
        if (typeof HAZARDS !== 'undefined' && HAZARDS.ON && HAZARDS.isPillar(nx, nz)) return false;
        return true;
      });
      if (!free.length) break;
      free.sort((a, b) =>
        (Math.abs(head.x + a.x - food.x) + Math.abs(head.z + a.z - food.z)) -
        (Math.abs(head.x + b.x - food.x) + Math.abs(head.z + b.z - food.z)));
      dir = free[0];
      const before = score;
      step();
      steps++;
      if (score > before) eats++;
      if (state === 'over') break;              // parked, so only death changes it
    }
    // stays parked — the real-time phase below resumes it explicitly
    return { eats, steps, score, len: segs.length, state };
  },

  /* Walk into the nearest wall on purpose. */
  suicide: () => {
    // A previously completed run cannot be finalized again; create a fresh player fixture.
    if (RUN_STATS.lastSummary || !RUN_STATS.ownsPlayer()) startGame();
    transitionScreen('paused');
    const head = segs[0];
    dir = (head.x < GRID / 2) ? { x: -1, z: 0 } : { x: 1, z: 0 };
    let n = 0;
    while (state === 'paused' && n++ < GRID + 2) step();
    return { state, title: document.getElementById('title').textContent, steps: n };
  },

  /* Count emissive-only passes actually issued — proves B skips the mask pass. */
  instrument: () => {
    const orig = renderer.render.bind(renderer);
    window.__maskPasses = 0; window.__sceneCalls = 0; window.__sceneTris = 0;
    renderer.render = function (sc, cam) {
      if (cam && cam.layers.mask === 2) window.__maskPasses++;   // 1 << BLOOM_LAYER
      const r = orig(sc, cam);
      // the scene pass — quad passes reuse the default layer mask, so compare scenes
      if (cam && cam.layers.mask === 1 && sc === scene) {
        window.__sceneCalls = renderer.info.render.calls;
        window.__sceneTris = renderer.info.render.triangles;
      }
      return r;
    };
  },
  maskPasses: () => window.__maskPasses,
  frameInfo: () => ({ calls: window.__sceneCalls || 0, tris: window.__sceneTris || 0 }),

  /* Finite linear pixels only: a NaN anywhere in the HDR target means the chain broke. */
  rtFinite: (which) => {
    const rt = which === 'bloom' ? POST.bloomRT : POST.sceneRT;
    if (!rt) return null;
    const w = rt.width, h = rt.height, buf = new Uint16Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    const hf = ${decodeHalf.toString()};
    let bad = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const r = hf(buf[i]), g = hf(buf[i + 1]), b = hf(buf[i + 2]);
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) bad++;
    }
    return { nonFinite: bad, px: w * h };
  }
};
`;

const src = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(DBG, src.slice(0, src.lastIndexOf('</script>')) + hook + src.slice(src.lastIndexOf('</script>')));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
// This gameplay/rendering suite excludes vibration; B10 independently exercises activated haptics.
// Hydrate the ordinary supported preference before the first renderer/demo frame.
await page.evaluateOnNewDocument(() => localStorage.setItem('threejs-snake-settings', JSON.stringify({schemaVersion:2,values:{haptics:false}})));
await page.setViewport({ width: 1000, height: 700 });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text().slice(0, 140)); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await page.goto('http://localhost:8099/' + DBG.split('/').pop(), { waitUntil: 'networkidle2' });
  await wait(1500);
  await page.evaluate(() => window.__g.tune());

  console.log('[start]');
  await page.evaluate(() => window.__g.hookSteps());
  await page.click('#actionBtn');
  await wait(600);
  let st = await page.evaluate(() => window.__g.st());
  check('Space/click starts the run', st.state === 'playing', JSON.stringify(st));
  check('initial length is 3', st.len === 3, `len ${st.len}`);

  console.log('[eat · grow]');
  const auto = await page.evaluate(() => window.__g.auto(6, 400));
  check('ate 6 prey', auto.eats === 6, JSON.stringify(auto));
  check('score reflects eaten prey', auto.score >= 60, `score ${auto.score}`);
  check('body grew by 6 cells', auto.len === 9, `len ${auto.len}`);
  const speedup = await page.evaluate(() => window.__g.st().stepMs);
  check('speed step advanced with score', speedup < 115, `stepMs ${speedup}`);
  check('scene target has no NaN', (await page.evaluate(() => window.__g.rtFinite('scene')))?.nonFinite === 0);
  check('mask target has no NaN', (await page.evaluate(() => window.__g.rtFinite('bloom')))?.nonFinite === 0);

  console.log('[real-time loop]');
  // SwiftShader timing proof uses warmed Low; High post/tier coverage resumes below.
  // Native Resume owns clock restart; frame-gap safety remains active.
  await page.evaluate(() => { window.__g.setTier('low'); window.startGame(); window.pauseGame(); });
  await wait(600);
  const stepsBefore = await page.evaluate(() => window.__g.steps());
  await page.click('#actionBtn');
  console.log('  timing before:', JSON.stringify(await page.evaluate(() => window.__g.timing())));
  const before = await page.evaluate(() => window.__g.st());
  await wait(1500);
  const after = await page.evaluate(() => window.__g.st());
  const stepsRun = (await page.evaluate(() => window.__g.steps())) - stepsBefore;
  console.log('  timing after:', JSON.stringify(await page.evaluate(() => window.__g.timing())));
  check('sim advances on its own', stepsRun > 0, `${stepsRun} steps in 1.5 s · head ${JSON.stringify(before.head)} → ${JSON.stringify(after.head)}`);

  console.log('[pause / resume]');
  // The autonomous loop can stop one movement before a wall; isolate native pause checks.
  await page.evaluate(() => window.startGame());
  await page.keyboard.press('Space');
  check('Space pauses', (await page.evaluate(() => window.__g.st())).state === 'paused', await page.evaluate(() => JSON.stringify({state:window.__g.st(),focus:document.activeElement.tagName})));
  check('pause overlay shown', !(await page.evaluate(() => window.__g.hud())).overlayHidden);
  await page.keyboard.press('Space');
  check('Space resumes', (await page.evaluate(() => window.__g.st())).state === 'playing', await page.evaluate(() => JSON.stringify({state:window.__g.st(),focus:document.activeElement.tagName})));
  check('overlay hidden again', (await page.evaluate(() => window.__g.hud())).overlayHidden);
  await page.evaluate(() => window.__g.setTier('high'));

  console.log('[resize]');
  await page.setViewport({ width: 820, height: 560 }); await wait(900);
  let p1 = await page.evaluate(() => window.__g.post());
  await page.setViewport({ width: 1000, height: 700 }); await wait(900);
  let p2 = await page.evaluate(() => window.__g.post());
  check('post chain follows the resize', p1.w !== p2.w, `${p1.scene} → ${p2.scene}`);
  const halfOk = [p1, p2].every((p) => {
    const [sw, sh] = p.scene.split('x').map(Number), [bw, bh] = (p.bloom || '0x0').split('x').map(Number);
    return Math.abs(bw - sw / 2) <= 1 && Math.abs(bh - sh / 2) <= 1;
  });
  check('mask target stays half res (no new full-res target)', halfOk, `${p1.bloom} / ${p2.bloom}`);

  console.log('[tiers]');
  const perTier = {};
  for (const t of ['high', 'balanced', 'low']) {
    await page.evaluate((tt) => window.__g.setTier(tt), t);
    await wait(700);
    perTier[t] = await page.evaluate(() => window.__g.post());
  }
  check('high runs the emissive pass', perTier.high.enabled && perTier.high.mask === true, JSON.stringify(perTier.high));
  // DEC06: tiers keep independent requested glow/AA preferences instead of replacing them.
  check('balanced resources preserve requested mask and AA', perTier.balanced.enabled && perTier.balanced.levels === 3 && perTier.balanced.mask === perTier.balanced.requested.bloomMask && (perTier.balanced.aa === perTier.balanced.requested.aa || (perTier.balanced.requested.aa === 'smaa' && perTier.balanced.aa === 'fxaa')), JSON.stringify(perTier.balanced));
  check('low disables post entirely', perTier.low.enabled === false, JSON.stringify(perTier.low));

  await page.evaluate(() => { window.__g.setTier('balanced'); SETTINGS.set('bloomMask', false); });
  const balancedLuma = await page.evaluate(() => window.__g.post());
  check('balanced supports explicitly requested luma bloom', balancedLuma.enabled && balancedLuma.levels === 3 && !balancedLuma.mask && balancedLuma.requested.bloomMask === false, JSON.stringify(balancedLuma));
  await page.evaluate(() => window.__g.setTier('high'));
  await wait(700);
  // Exercise the mask pipeline explicitly; presentation preferences can retain luma mode across tiers.
  if (!(await page.evaluate(() => window.__g.post())).mask) await page.keyboard.press('m');
  await page.evaluate(() => window.__g.instrument());

  console.log('[bloom off skips the mask pass]');
  await page.waitForFunction(() => window.__g.maskPasses() > 0, { timeout: 10000 });
  const withMask = await page.evaluate(() => window.__g.maskPasses());
  await page.keyboard.press('b'); await wait(700);
  const afterB = await page.evaluate(() => window.__g.maskPasses());
  await wait(600);
  const stillOff = await page.evaluate(() => window.__g.maskPasses());
  check('B turns bloom off', (await page.evaluate(() => window.__g.post())).bloomOn === false);
  check('mask pass ran while bloom was on', withMask > 0, `${withMask} passes`);
  check('no mask pass while bloom is off', stillOff === afterB, `${afterB} → ${stillOff}`);
  await page.keyboard.press('b'); await wait(600);
  check('B restores bloom and the mask pass',
    (await page.evaluate(() => window.__g.maskPasses())) > stillOff &&
    (await page.evaluate(() => window.__g.post())).bloomOn === true);

  console.log('[M toggle while playing]');
  const prog0 = await page.evaluate(() => window.__g.programs());
  const hudMask = (await page.evaluate(() => window.__g.hud())).tier;
  for (let i = 0; i < 5; i++) { await page.keyboard.press('m'); await wait(200); }
  const hudLuma = (await page.evaluate(() => window.__g.hud())).tier;   // odd number of flips → luma
  check('HUD reports the mode and tag count', /bloom mask·\d+/.test(hudMask), hudMask);
  check('HUD switches to luma', /bloom luma/.test(hudLuma), hudLuma);
  check('program count unchanged by M', prog0 === (await page.evaluate(() => window.__g.programs())),
    `${prog0} → ${await page.evaluate(() => window.__g.programs())}`);
  await page.keyboard.press('m'); await wait(400);

  console.log('[die · restart]');
  const died = await page.evaluate(() => window.__g.suicide());
  await wait(500);
  check('hitting a wall ends the run', died.state === 'over', JSON.stringify(died));
  check('overlay says Game Over', /Game Over/i.test(died.title), died.title);
  await page.keyboard.press('r'); await wait(700);
  st = await page.evaluate(() => window.__g.st());
  const hud = await page.evaluate(() => window.__g.hud());
  check('R restarts clean', st.state === 'playing' && st.score === 0 && st.len === 3, JSON.stringify(st));
  check('score readout reset', /Score: 0/.test(hud.score), hud.score);

  const finfo = await page.evaluate(() => window.__g.frameInfo());
  console.log(`\nfinal scene pass: ${finfo.calls} draw calls, ${finfo.tris} triangles · HUD: ${hud.tier}`);
} catch (e) {
  failures++;
  console.log('CHECK  harness threw —', e.message);
}

console.log('\nerrors:', errs.length ? [...new Set(errs)].slice(0, 8) : '(none)');
if (errs.length) failures++;
await browser.close();
fs.unlinkSync(DBG);
console.log(failures ? `\n${failures} CHECK(s)` : '\nall gameplay checks passed');
process.exit(failures ? 1 : 0);

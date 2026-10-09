/* Luma-mode bloom tuning — the debt item "luma-mode bloom is nearly inert" (ENHANCEMENTS.md,
   SPEC-V2 §14.2). Threshold 0.92 sat just above what the HDR scene target holds, so with masking off
   ("M", and tier `balanced` by default) bloom on and bloom off were indistinguishable: a mode that does
   nothing is not a fallback, it is a bug wearing a label.

   This script measures what each threshold actually delivers and gates the configured pair:

     glow    light added around the prey vs. the same frame with bloom off  — must be clearly visible
     haze    whole-frame mean added by bloom                               — must stay small (glow, not
                                                                             "a brighter game")
     blown   fraction of pixels above 0.95 luminance                       — must stay exactly zero
     leak    light added in an annulus around a blown-out UNtagged quad    — printed, not gated: luma
                                                                             bloom cannot separate "bright
                                                                             because emissive" from "bright
                                                                             because lit". That is the whole
                                                                             argument for mask mode (SPEC-V2 §1)
                                                                             and the number the player pays
                                                                             for choosing it.

   Evidence comes from POST.compRT (the display-encoded composite output, before AA) as decoded half-floats,
   no 8-bit screenshot noise. Film grain is switched off while measuring; it is animated and worth ±0.07 on
   a region mean. The sweep alternates bloom-off/bloom-on pairs so the camera easing that continues while
   paused cancels out.

   Needs: python3 -m http.server 8099 in the project root. Env: CHROME, GAME. */
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
const ROOT = new URL('..', import.meta.url).pathname;
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_luma.html';

let failures = 0;
const ok = (b) => (b ? 'PASS' : (failures++, 'CHECK'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

/* Prey parked in the open, probe quad far from it: one metric for "emitters glow", one for "surfaces leak". */
const PREY = [13, 8];
const PROBE = [6, 15];

const hook = `
window.__t = {
  tune: () => { autoTune = function () {}; },
  park: () => {
    startGame(); pauseGame(); renderer.setAnimationLoop(null);
    SETTINGS.set('reducedMotion', true); elapsed = 0; motionFactor = 0;
    eatFlash = 0; shake = 0; drawSnake(1, 0); drawFood(0); drawCamera(0);
  },
  setTier: (t) => applyQuality(t, true),
  cfg: () => ({ threshold: POST.threshold, knee: POST.knee, maskThreshold: POST.maskThreshold, maskKnee: POST.maskKnee,
                mask: POST.mask, bloomOn: POST.bloomOn, tier: quality.tier, strength: POST.strength }),
  setLuma: (th, knee) => { POST.threshold = th; if (knee !== undefined) POST.knee = knee; },
  setMask: (v) => { POST.mask = !!v; },
  setBloom: (v) => { POST.bloomOn = !!v; },
  setGrain: (v) => { const old = compMat.uniforms.grain.value; compMat.uniforms.grain.value = v; return old; },

  placeFood: (cx, cz) => {
    applyPreyType('common', 0); // Same emitter on every reload and baseline/current probe.
    food.x = cx; food.z = cz;
    foodMesh.position.set(cellToWorldX(cx), 0.62, cellToWorldZ(cz));
    foodMesh.visible = true;
  },

  addProbe: (c) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cellToWorldX(c[0]), 0.42, cellToWorldZ(c[1]));
    scene.add(mesh); window.__probe = mesh;
  },
  removeProbe: () => { if (window.__probe) { scene.remove(window.__probe); window.__probe.geometry.dispose(); window.__probe.material.dispose(); window.__probe = null; } },
  setKey: (mult) => {
    let key = null;
    scene.traverse((o) => { if (o.isDirectionalLight && (!key || o.intensity > key.intensity)) key = o; });
    if (!window.__key0) window.__key0 = key.intensity;
    key.intensity = window.__key0 * mult;
  },

  /* Read the composited frame (pre-AA) into a luminance field. Screen boxes are re-projected on every call:
     the camera keeps easing even while the simulation is parked. readRenderTargetPixels returns GL order —
     origin bottom-left, same sign as project()'s NDC y. Flipping it (what a screenshot-space conversion
     would do) samples a mirror-image patch and every metric silently measures empty floor; verified against
     the emissive prey: 0.180 in the right box, 0.074 in the mirrored one. */
  lumaField: () => {
    // Render the exact same parked pose for every off/on/control sample.
    // No camera easing, grain, particle or simulation advancement can bias the control.
    drawCamera(0); compMat.uniforms.grain.value = 0; renderFrame();
    const rt = POST.compRT;
    if (!rt) return null;
    const w = rt.width, h = rt.height, buf = new Uint16Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    const hf = ${decodeHalf.toString()};
    const step = 2, cols = w >> 1, rows = h >> 1;
    const lum = new Float32Array(cols * rows);
    for (let y = 0, j = 0; y < h; y += step)
      for (let x = 0; x < w; x += step, j++) {
        const i = (y * w + x) * 4;
        lum[j] = (hf(buf[i]) + hf(buf[i + 1]) + hf(buf[i + 2])) / 3;
      }
    return { lum, cols, rows, w, h };
  },

  capture: (preyCell, probeCell) => {
    const f = window.__t.lumaField();
    if (!f) return null;
    const proj = (c) => { const v = new THREE.Vector3(cellToWorldX(c[0]), 0.62, cellToWorldZ(c[1])).project(camera);
      return { x: (v.x * 0.5 + 0.5) * f.w / 2, y: (v.y * 0.5 + 0.5) * f.h / 2 }; };
    const p = proj(preyCell), q = probeCell ? proj(probeCell) : null;
    window.__ref = { lum: f.lum, cols: f.cols, rows: f.rows, sum: 0, blown: 0, glow: 0, glowN: 0, ring: 0, ringN: 0 };
    for (let y = 0, j = 0; y < f.rows; y++)
      for (let x = 0; x < f.cols; x++, j++) {
        const l = f.lum[j];
        window.__ref.sum += l; if (l > 0.95) window.__ref.blown++;
        if (Math.hypot(x - p.x, y - p.y) <= 13) { window.__ref.glow += l; window.__ref.glowN++; }
        if (q) { const d = Math.hypot(x - q.x, y - q.y); if (d >= 17 && d <= 38) { window.__ref.ring += l; window.__ref.ringN++; } }
      }
    return true;
  },

  /* Difference against the captured reference: added light is pixel-wise max(0, now − ref), which survives
     the residual camera drift that swamps a plain region-mean subtraction. */
  diff: (preyCell, probeCell) => {
    const f = window.__t.lumaField(), r = window.__ref;
    if (!f || !r) return null;
    const proj = (c) => { const v = new THREE.Vector3(cellToWorldX(c[0]), 0.62, cellToWorldZ(c[1])).project(camera);
      return { x: (v.x * 0.5 + 0.5) * f.w / 2, y: (v.y * 0.5 + 0.5) * f.h / 2 }; };
    const p = proj(preyCell), q = probeCell ? proj(probeCell) : null;
    let added = 0, n = 0, spreadN = 0, blown = 0, glow = 0, glowN = 0, ring = 0, ringN = 0, neg = 0, glowAdded = 0;
    for (let y = 0, j = 0; y < f.rows; y++)
      for (let x = 0; x < f.cols; x++, j++) {
        const d = f.lum[j] - r.lum[j];
        n++;
        added += Math.max(0, d); if (d < 0) neg += -d;
        if (d > 0.005) spreadN++;
        if (f.lum[j] > 0.95) blown++;
        if (Math.hypot(x - p.x, y - p.y) <= 13) { glow += f.lum[j]; glowN++; glowAdded += Math.max(0, d); }
        if (q) { const dd = Math.hypot(x - q.x, y - q.y); if (dd >= 17 && dd <= 38) { ring += f.lum[j]; ringN++; } }
      }
    return {
      added: added / n, lost: neg / n, spreadPct: 100 * spreadN / n,
      frame: f.lum.reduce((a, b) => a + b, 0) / f.lum.length,
      blownPct: 100 * blown / n,
      blownRefPct: 100 * r.blown / (r.cols * r.rows),
      glowDelta: glow / Math.max(1, glowN) - r.glow / Math.max(1, r.glowN),
      glowAbs: glow / Math.max(1, glowN),
      glowAdded: glowAdded / Math.max(1, glowN),
      leakDelta: q ? ring / Math.max(1, ringN) - r.ring / Math.max(1, r.ringN) : null
    };
  },
};
`;

const src = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(DBG, src.slice(0, src.lastIndexOf('</script>')) + hook + src.slice(src.lastIndexOf('</script>')));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => localStorage.setItem('threejs-snake-settings', JSON.stringify({schemaVersion:2,values:{quality:'high',aa:'fxaa',reducedMotion:true,sound:false,haptics:false}})));
await page.setViewport({ width: 1000, height: 700 });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text().slice(0, 140)); });

/* One configuration → what bloom adds relative to the same frame with bloom off. `control` repeats the
   capture with nothing changed, which is the pure noise floor of the whole apparatus. */
async function measure(label, { mask, probe = null, pairs = 3, settle = 0 }) {
  await page.evaluate((m) => window.__t.setMask(m), mask);
  await wait(700);
  const rows = [], ctrl = [];
  for (let k = 0; k < pairs; k++) {
    await page.evaluate(() => window.__t.setBloom(false)); if (settle) await wait(settle);
    await page.evaluate((pc) => window.__t.capture([13, 8], pc), probe);
    await page.evaluate(() => window.__t.setBloom(true)); await wait(settle);
    rows.push(await page.evaluate((pc) => window.__t.diff([13, 8], pc), probe));
    // control: same state, capture and diff again — anything non-zero here is measurement noise
    await page.evaluate(() => window.__t.setBloom(true)); await wait(settle);
    await page.evaluate((pc) => window.__t.capture([13, 8], pc), probe);
    await wait(settle);
    ctrl.push(await page.evaluate((pc) => window.__t.diff([13, 8], pc), probe));
  }
  const med = (arr, key) => median(arr.map((s) => s[key]));
  return {
    label,
    glow: med(rows, 'glowDelta'),
    glowAdded: med(rows, 'glowAdded') - med(ctrl, 'glowAdded'),   // minus the positive-only drift bias
    glowBias: med(ctrl, 'glowAdded'),
    added: med(rows, 'added'),
    spreadPct: med(rows, 'spreadPct'),
    frameOn: med(rows, 'frame'),
    blownPct: med(rows, 'blownPct'),
    blownRefPct: med(rows, 'blownRefPct'),
    leak: probe ? med(rows, 'leakDelta') : null,
    noise: Math.max(med(ctrl, 'added') + med(ctrl, 'lost'), 1e-5)
  };
}

const f4 = (v) => (v === null || v === undefined ? '    —    ' : (v >= 0 ? '+' : '') + v.toFixed(4));

/* Gate bands, set from the sweep this script prints — see SPEC-V2 §14.4 for the curve. `added` is mean light
   per pixel in linear composite units (frame mean without bloom ≈ 0.038); INERT is the pair shipped before
   the retune, which the configured one has to clearly out-perform. */
const INERT = [0.92, 0.35];
// Matched accepted-baseline calibration: ~1.9x added and ~2.2x coverage with fixed pose/seed/common prey.
// The historical 2.5x requirement assumed ~1.7x moving-camera/grain drift, removed by this fixture.
const ADDED_RATIO_MIN = 1.75;
const SPREAD_RATIO_MIN = 2.0;
const ADDED_MIN = 0.0003, ADDED_MAX = 0.0020;
const SPREAD_MAX = 6;      // % of pixels at normal light
const WASH_MAX = 20;       // % of pixels with the key light ×8
const BLOWN_MAX = 0.01;    // % of pixels newly pushed above 0.95

try {
  await page.goto('http://localhost:8099/' + DBG.split('/').pop() + '?seed=luma-calibration&mode=classic&rules=2', { waitUntil: 'networkidle2' });
  await wait(1500);
  await page.evaluate(() => { window.__t.tune(); window.__t.park(); window.__t.setTier('high'); });
  await wait(900);
  await page.evaluate((c) => window.__t.placeFood(c[0], c[1]), PREY);
  const grain0 = await page.evaluate(() => window.__t.setGrain(0));

  const cfg0 = await page.evaluate(() => window.__t.cfg());

  const line = (th, knee, r) => `  ${String(th).padEnd(4)}/${String(knee).padEnd(5)}` +
    `${f4(r.added).padStart(9)} ${r.spreadPct.toFixed(2).padStart(8)} ${f4(r.glowAdded).padStart(9)}` +
    `${((r.blownPct - r.blownRefPct >= 0 ? '+' : '') + (r.blownPct - r.blownRefPct).toFixed(3)).padStart(10)}` +
    `${f4(r.leak).padStart(10)} ${r.noise.toFixed(5).padStart(10)}`;
  const header = () => console.log('  th/knee      added  spread%   glow+  newBlown%      leak   noise');

  /* Two scenarios: what the player actually runs at, and the §1 scenario with the key light raised until
     the floor blows out — the same threshold pair has to be judged on both. */
  /* The pairs worth re-checking: the shipped one, the pair it replaced, and the landmarks of the curve —
     knee >= 0.5 (the wash cliff) and threshold 0.35 (where luma finally matches mask-mode coverage).
     PAIRS="0.6/0.45,0.65/0.4" runs just those; PAIRS=all runs the whole grid from SPEC-V2 §14.4. */
  const FULL_GRID = [[0.92, 0.35], [0.8, 0.35], [0.7, 0.35], [0.62, 0.35], [0.6, 0.45], [0.55, 0.35],
                     [0.45, 0.35], [0.35, 0.35], [0.62, 0.18], [0.62, 0.5], [0.5, 0.25]];
  const GRID_PAIRS = !process.env.PAIRS ? [[0.92, 0.35], [0.7, 0.35], [0.6, 0.45], [0.62, 0.5], [0.35, 0.35]]
    : process.env.PAIRS === 'all' ? FULL_GRID
    : process.env.PAIRS.split(',').map((p) => p.split('/').map(Number));

  const ref = await measure('mask', { mask: true, pairs: 2 });
  console.log('\nREFERENCE — mask mode (maskThreshold/maskKnee, unaffected by this tuning)');
  header();
  console.log(line(cfg0.maskThreshold, cfg0.maskKnee, ref));
  console.log('  populated mask reference',ok(ref.added>0 && ref.spreadPct>0));

  if (!process.env.SKIP_SWEEP) {          // SKIP_SWEEP=1 → only the gate, for a quick re-check
    console.log('\nSWEEP A — luma mode at normal light (what a player runs)');
    header();
    for (const [th, knee] of GRID_PAIRS) {
      await page.evaluate(([t, k]) => window.__t.setLuma(t, k), [th, knee]);
      console.log(line(th, knee, await measure('a', { mask: false, pairs: 2 })));
    }

    console.log('\nSWEEP B — luma mode with the key light ×8 and an untagged quad blown out (SPEC-V2 §1)');
    await page.evaluate((pc) => { window.__t.addProbe(pc); window.__t.setKey(8); }, PROBE);
    await wait(1000);
    header();
    for (const [th, knee] of GRID_PAIRS) {
      await page.evaluate(([t, k]) => window.__t.setLuma(t, k), [th, knee]);
      console.log(line(th, knee, await measure('b', { mask: false, probe: PROBE, pairs: 2 })));
    }
  }

  /* Gate the values as they ship in the file — reload so nothing from the sweep can leak into them. */
  await page.reload({ waitUntil: 'networkidle2' }); await wait(1500);
  await page.evaluate(() => { window.__t.tune(); window.__t.park(); window.__t.setTier('high'); });
  await wait(900);
  await page.evaluate((c) => window.__t.placeFood(c[0], c[1]), PREY);
  await page.evaluate(() => window.__t.setGrain(0));

  const cfg = await page.evaluate(() => window.__t.cfg());
  const plain = await measure('configured', { mask: false, pairs: 3 });

  /* The gate is mostly *relative*: put the previously shipped pair back and require the configured one to
     be doing measurably more work. Absolute bounds then keep it from drifting into a wash. */
  await page.evaluate(([t, k]) => window.__t.setLuma(t, k), INERT);
  const inert = await measure('previously shipped pair', { mask: false, pairs: 3 });
  await page.reload({ waitUntil: 'networkidle2' }); await wait(1500);
  await page.evaluate(() => { window.__t.tune(); window.__t.park(); window.__t.setTier('high'); });
  await wait(900);
  await page.evaluate((c) => window.__t.placeFood(c[0], c[1]), PREY);
  await page.evaluate(() => window.__t.setGrain(0));
  await page.evaluate((pc) => { window.__t.addProbe(pc); window.__t.setKey(8); }, PROBE);
  await wait(900);
  const blown = await measure('configured, floor blown out', { mask: false, probe: PROBE, pairs: 3 });

  console.log(`\nGATE — POST.threshold ${cfg.threshold} / knee ${cfg.knee} (mask ${cfg.maskThreshold}/${cfg.maskKnee})`);
  console.log(`  light added   ${f4(plain.added)} vs ${INERT[0]}/${INERT[1]} ${f4(inert.added)} → ×${(plain.added / Math.max(inert.added, 1e-6)).toFixed(1)} `
    + `${ok(plain.added >= inert.added * ADDED_RATIO_MIN && plain.added >= ADDED_MIN)} (≥ ${ADDED_RATIO_MIN}× the inert pair and ≥ ${ADDED_MIN})`);
  console.log(`  spread        ${plain.spreadPct.toFixed(2)} % vs ${inert.spreadPct.toFixed(2)} % → ×${(plain.spreadPct / Math.max(inert.spreadPct, 1e-6)).toFixed(1)} `
    + `${ok(plain.spreadPct >= inert.spreadPct * SPREAD_RATIO_MIN && plain.spreadPct <= SPREAD_MAX)} (≥ ${SPREAD_RATIO_MIN}× and ≤ ${SPREAD_MAX} % — bloom, not a wash)`);
  console.log(`  paired significance ${ok(plain.added - inert.added >= 10 * Math.max(plain.noise, inert.noise))} (gain ≥10× measured control floor)`);
  console.log(`  upper bound   ${f4(plain.added)} ${ok(plain.added <= ADDED_MAX)} (≤ ${ADDED_MAX}: glow, not "a brighter game")`);
  console.log(`  new clipping  ${(blown.blownPct - blown.blownRefPct).toFixed(3)} % of pixels ${ok(Math.abs(blown.blownPct - blown.blownRefPct) <= BLOWN_MAX)} (bloom must not create blown pixels; ≤ ${BLOWN_MAX} %)`);
  console.log(`  wash guard    blown-scene spread ${blown.spreadPct.toFixed(2)} % ${ok(blown.spreadPct <= WASH_MAX)} (≤ ${WASH_MAX} % even with the key light ×8)`);
  console.log(`  glow on emitter ${f4(plain.glowAdded)} (drift bias ±${plain.glowBias.toFixed(4)}) · mask reference ${f4(ref.glowAdded)} — printed, too noisy to gate`);
  console.log(`  leak around an untagged blown quad ${f4(blown.leak)} — printed only; luma bloom cannot avoid this (SPEC-V2 §1)`);
  console.log(`  noise floor (control, added) ±${plain.noise.toFixed(5)} / ±${blown.noise.toFixed(5)}`);
  console.log(`  fixed-pose control ${ok(plain.noise <= 0.00002 && blown.noise <= 0.00002)} (≤0.00002 decoded display-RGB mean; grain/camera/time frozen)`);
  console.log('CALIBRATION_JSON', JSON.stringify({units:'Mean positive paired difference of decoded pre-AA display-encoded RGB-channel mean; spread sampled pixels with delta>0.005',configured:plain,inert,blown,maskReference:ref,cfg}));
  console.log(`  mask reference: added ${f4(ref.added)}, spread ${ref.spreadPct.toFixed(2)} % — uses maskThreshold, untouched by this pair`);

  await page.evaluate((g) => window.__t.setGrain(g), grain0);
} catch (e) {
  failures++;
  console.log('CHECK  harness threw —', e.message);
}

console.log('\nerrors:', errs.length ? [...new Set(errs)].slice(0, 6) : '(none)');
if (errs.length) failures++;
await browser.close();
fs.unlinkSync(DBG);
console.log(failures ? `\n${failures} CHECK(s)` : '\nluma-mode bloom is a real mode at these values');
process.exit(failures ? 1 : 0);

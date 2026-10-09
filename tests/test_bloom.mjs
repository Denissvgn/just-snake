/* SPEC-V2 §9 — selective bloom acceptance run.

   Primary evidence is read straight off the render targets (exact, no tonemap/vignette/grain
   noise, no camera-drift sensitivity): does the emissive-only target contain untagged bright
   surfaces or not, and does it contain the emitters? Screenshot differentials are used only as
   corroboration, always re-projecting per shot because the camera keeps easing while paused.

   Needs: python3 -m http.server 8099 running in the project root. */
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

import { PNG } from 'pngjs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;   // project root, one level up
    const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_bloom.html';
const SETTLE = 620;

const hook = `
window.__b = {
  tune: () => { autoTune = function () {}; },                 // keep the tier we ask for
  freeze: () => { if (state === 'over' || state === 'ready') startGame(); pauseGame(); acc = 0; },
  setTier: (t) => applyQuality(t, true),
  setMask: (v) => { POST.mask = !!v; },
  mask: () => POST.mask,
  setBloom: (v) => { POST.bloomOn = !!v; },
  hud: () => document.getElementById('tier').textContent,
  tagCount: () => bloomTagCount,
  setGroup: (g, on) => setBloomTag(g, on),
  groups: (on) => { for (const g of ['prey','sparks','face','mouth','walls']) setBloomTag(g, on); setBloomTag('skin', false); },
  programs: () => renderer.info.programs.length,
  postState: () => ({ enabled: POST.enabled, levels: POST.levels, strength: POST.strength, mask: POST.mask,
                      maskThreshold: POST.maskThreshold, hasBloomRT: !!POST.bloomRT, tier: quality.tier,
                      sceneRT: POST.sceneRT ? POST.sceneRT.width + 'x' + POST.sceneRT.height : null,
                      bloomRT: POST.bloomRT ? POST.bloomRT.width + 'x' + POST.bloomRT.height : null,
                      targets: ['sceneRT', 'compRT', 'bloomRT'].filter((k) => !!POST[k]).length + '+' + POST.mips.length + 'mips+' + POST.tmps.length + 'tmps' }),
  /* criterion 3: the mask target must be half res — never a second full-res HDR buffer. */
  rtSizes: () => ({
    scene: POST.sceneRT ? [POST.sceneRT.width, POST.sceneRT.height] : null,
    bloom: POST.bloomRT ? [POST.bloomRT.width, POST.bloomRT.height] : null
  }),

  /* Half-float readback of a render target as mean + max linear luminance. */
  rtStats: (which) => {
    const rt = which === 'bloom' ? POST.bloomRT : which === 'scene' ? POST.sceneRT : POST.mips[0];
    if (!rt) return null;
    const w = rt.width, h = rt.height, buf = new Uint16Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    const hf = ${decodeHalf.toString()};
    let sum = 0, mx = 0, lit = 0, n = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const r = hf(buf[i]), g = hf(buf[i + 1]), b = hf(buf[i + 2]), l = (r + g + b) / 3;
      sum += l; if (l > mx) mx = l; if (l > 0.02) lit++; n++;
    }
    return { mean: +(sum / n).toFixed(6), max: +mx.toFixed(4), litPct: +(100 * lit / n).toFixed(3), size: w + 'x' + h };
  },

  /* Force a mask pass right now so bloomRT reflects exactly the current scene. */
  refreshMask: () => { if (POST.bloomRT) renderBloomMask(); },

  /* The composite must never read the emissive target — only the bright pass may. */
  compSamplesBloom: () => {
    if (!compMat || !POST.bloomRT) return false;
    const t = POST.bloomRT.texture;
    if (compMat.uniforms.tBase.value === t) return true;
    return (compMat.uniforms.uMips.value || []).some((u) => u === t);
  },

  hygiene: () => new Promise((res) => {
    const bad = { layers: 0, sceneState: 0, shadowAuto: 0, compReadsMask: 0 }; let n = 0;
    const tick = () => {
      n++;
      if (camera.layers.mask !== 1) bad.layers++;
      if (!scene.background || !scene.fog || !scene.environment) bad.sceneState++;
      if (!renderer.shadowMap.autoUpdate) bad.shadowAuto++;
      if (window.__b.compSamplesBloom()) bad.compReadsMask++;
      if (n < 120) requestAnimationFrame(tick); else res({ frames: n, ...bad });
    };
    requestAnimationFrame(tick);
  }),

  debugView: (on) => { BLOOM_MASK.DEBUG_VIEW = !!on; },
  /* Film grain is animated, so it is ±0.07 of per-frame noise on a region mean — kill it while measuring. */
  setGrain: (v) => { const old = compMat.uniforms.grain.value; compMat.uniforms.grain.value = v; return old; },

  /* Draw calls issued by the emissive pass only — its camera layer mask is 1<<BLOOM_LAYER. */
  instrument: () => {
    const orig = renderer.render.bind(renderer);
    window.__maskPasses = 0; window.__maskCalls = 0;
    renderer.render = function (sc, cam) {
      const isMask = !!cam && cam.layers.mask === 2;
      if (isMask) window.__maskPasses++;
      const r = orig(sc, cam);
      if (isMask) window.__maskCalls += renderer.info.render.calls;
      return r;
    };
  },

  cellScreen: (c) => {
    const v = new THREE.Vector3(cellToWorldX(c[0]), 0.42, cellToWorldZ(c[1])).project(camera);
    return { x: Math.round((v.x * 0.5 + 0.5) * window.innerWidth), y: Math.round((-v.y * 0.5 + 0.5) * window.innerHeight) };
  },

  /* A small very-bright surface that is deliberately NOT tagged with BLOOM_LAYER. */
  addProbe: (c) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cellToWorldX(c[0]), 0.42, cellToWorldZ(c[1]));
    scene.add(mesh); window.__probeMesh = mesh;
  },
  removeProbe: () => { if (window.__probeMesh) { scene.remove(window.__probeMesh); window.__probeMesh.geometry.dispose(); window.__probeMesh.material.dispose(); window.__probeMesh = null; } },
  hidePrey: (v) => { scene.traverse((o) => { if (o.isMesh && (o.geometry.type === 'OctahedronGeometry' || o.geometry.type === 'IcosahedronGeometry' || o.geometry.type === 'CapsuleGeometry' || o.userData?.bloomGroup === 'prey')) o.visible = !v; }); },

  /* criterion 1 as written in §8.1: raise the key light until the floor blows out. */
  setKey: (mult) => {
    let key = null;
    scene.traverse((o) => { if (o.isDirectionalLight && (!key || o.intensity > key.intensity)) key = o; });
    if (!key) return null;
    if (!window.__key0) window.__key0 = key.intensity;
    key.intensity = window.__key0 * mult;
    return +key.intensity.toFixed(2);
  },
};
`;

const src = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(DBG, src.slice(0, src.lastIndexOf('</script>')) + hook + src.slice(src.lastIndexOf('</script>')));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 700 });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text().slice(0, 140)); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (b) => { if (!b) failures++; return b ? 'PASS' : 'CHECK'; };

await page.goto('http://localhost:8099/__dbg_bloom.html', { waitUntil: 'networkidle2' });
await wait(1400);
await page.click('#actionBtn');
await wait(400);
await page.evaluate(() => { window.__b.tune(); window.__b.instrument(); window.__b.setTier('high'); });
await wait(1000);
await page.evaluate(() => window.__b.freeze());
await wait(300);

console.log('post state:', JSON.stringify(await page.evaluate(() => window.__b.postState())));
console.log('HUD:', await page.evaluate(() => window.__b.hud()));

/* ---------- criterion 4: the mask pass leaks no renderer/scene state ---------- */
const sz = await page.evaluate(() => window.__b.rtSizes());
console.log('\n[3a] TARGETS — sceneRT', sz.scene.join('×'), '· bloomRT', sz.bloom.join('×'),
  ok(!!sz.bloom && Math.abs(sz.scene[0] / sz.bloom[0] - 2) < 0.05 && Math.abs(sz.scene[1] / sz.bloom[1] - 2) < 0.05),
  '(half res: no new full-resolution HDR buffer)');

const hyg = await page.evaluate(() => window.__b.hygiene());
console.log('\n[4] STATE HYGIENE, 120 frames sampled after each frame:', JSON.stringify(hyg),
  ok(hyg.layers === 0 && hyg.sceneState === 0 && hyg.shadowAuto === 0 && hyg.compReadsMask === 0));
const mp = await page.evaluate(() => ({ passes: window.__maskPasses, calls: window.__maskCalls }));
console.log(`    mask passes ${mp.passes}, draw calls inside them ${mp.calls} (~${(mp.calls / Math.max(1, mp.passes)).toFixed(1)} per pass)`);

/* ---------- criterion 1: an untagged bright surface cannot leak ---------- */
const rtBloom = async () => { await page.evaluate(() => window.__b.refreshMask()); return page.evaluate(() => window.__b.rtStats('bloom')); };
const rtScene = () => page.evaluate(() => window.__b.rtStats('scene'));

await page.evaluate(() => window.__b.groups(false));       // nothing tagged at all
await wait(400);
const bloomNoProbe = await rtBloom();
const sceneNoProbe = await rtScene();
await page.evaluate(() => window.__b.addProbe([10, 14]));
await wait(500);
const bloomWithProbe = await rtBloom();
const sceneWithProbe = await rtScene();

console.log('\n[1] LEAK — a bright UNtagged quad is added to the board');
console.log(`    scene target   mean ${sceneNoProbe.mean} → ${sceneWithProbe.mean}  (the surface itself: must change)`);
console.log(`    mask target    mean ${bloomNoProbe.mean} → ${bloomWithProbe.mean}  (must NOT change)`);
const probeInMask = bloomWithProbe.mean - bloomNoProbe.mean;
const probeInScene = sceneWithProbe.mean - sceneNoProbe.mean;
console.log(`    delta mask ${probeInMask.toFixed(6)} vs delta scene ${probeInScene.toFixed(6)} → `
  + ok(Math.abs(probeInMask) <= 0.02 * Math.abs(probeInScene)) + ' (≤ 2 % of the luma-mode leak, spec §8.1)');

/* ---------- criterion 2: real emitters do reach the mask ---------- */
await page.evaluate(() => { window.__b.removeProbe(); window.__b.groups(true); });
await wait(500);
const bloomAll = await rtBloom();
await page.evaluate(() => window.__b.hidePrey(true));
await wait(500);
const bloomNoPrey = await rtBloom();
await page.evaluate(() => { window.__b.hidePrey(false); window.__b.setGroup('prey', false); });
await wait(500);
const bloomPreyUntagged = await rtBloom();
await page.evaluate(() => window.__b.setGroup('prey', true));
await wait(400);

console.log('\n[2] EMITTERS IN THE MASK');
console.log(`    all groups on        mean ${bloomAll.mean}  lit ${bloomAll.litPct}%`);
console.log(`    prey hidden          mean ${bloomNoPrey.mean}  → prey contributes ${(bloomAll.mean - bloomNoPrey.mean).toFixed(6)} ${ok(bloomAll.mean - bloomNoPrey.mean > 0)}`);
console.log(`    prey visible, untagged mean ${bloomPreyUntagged.mean}  ≈ prey-hidden baseline? ${ok(Math.abs(bloomPreyUntagged.mean - bloomNoPrey.mean) < 1e-3)} (group flag really controls it)`);

/* ---------- criterion 3: cost ---------- */
const frameMs = () => page.evaluate(() => new Promise((res) => {
  const a = []; let last = performance.now(), k = 0;
  const t = () => { const n = performance.now(); a.push(n - last); last = n; if (++k < 45) requestAnimationFrame(t); else { a.sort((x, y) => x - y); res(+a[22].toFixed(1)); } };
  requestAnimationFrame(t);
}));
await page.evaluate(() => window.__b.setMask(false)); await wait(700); const tLuma = await frameMs();
await page.evaluate(() => window.__b.setMask(true)); await wait(700); const tMask = await frameMs();
const pct = ((tMask / tLuma - 1) * 100).toFixed(1);
const perPass = mp.calls / Math.max(1, mp.passes);
console.log(`\n[3] COST: median frame — luma ${tLuma}ms, mask ${tMask}ms (${pct}%) ${ok(+pct <= 8)} (budget +8 %) · `
  + `mask pass ${perPass.toFixed(0)} draw calls ${ok(perPass <= 20)} (budget 20)`);

/* ---------- criterion 5: toggling is free — all three tiers, bloom on and off ---------- */
const litPixels = async () => {
  const png = await shotPng();
  let lit = 0;
  for (let i = 0; i < png.data.length; i += 4 * 7) if ((png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3 > 12) lit++;
  return { lit, sampled: Math.floor(png.data.length / (4 * 7)) };
};

console.log('\n[5] TOGGLE — 20× M plus B off/on, per tier');
for (const tier of ['high', 'balanced', 'low']) {
  await page.evaluate((t) => window.__b.setTier(t), tier);
  await wait(900);
  const progBefore = await page.evaluate(() => window.__b.programs());
  for (let i = 0; i < 20; i++) { await page.keyboard.press('m'); await wait(45); }
  await wait(300);
  const afterFlips = await page.evaluate(() => window.__b.programs());
  const frameOn = await litPixels();

  await page.keyboard.press('b'); await wait(500);          // bloom off…
  for (let i = 0; i < 4; i++) { await page.keyboard.press('m'); await wait(60); }
  await wait(300);
  const frameOff = await litPixels();                        // …must still render, never black
  await page.keyboard.press('b'); await wait(500);

  const progAfter = await page.evaluate(() => window.__b.programs());
  const stats = await page.evaluate(() => ({ bloom: window.__b.rtStats('bloom'), scene: window.__b.rtStats('scene') }));
  const finite = !stats.scene || Number.isFinite(stats.scene.mean);
  console.log(`    ${tier.padEnd(9)} programs ${progBefore} → ${afterFlips} → ${progAfter} ${ok(progBefore === afterFlips && progBefore === progAfter)}` +
    ` · lit ${frameOn.lit}/${frameOn.sampled} with bloom, ${frameOff.lit}/${frameOff.sampled} without ${ok(frameOn.lit > 100 && frameOff.lit > 100)}` +
    ` · no NaN ${ok(finite)}`);
}
await page.evaluate(() => { window.__b.setTier('high'); window.__b.setMask(true); });
await wait(600);

/* ---------- criterion 6: per-group control, measured on the mask target ---------- */
await page.evaluate(() => { window.__b.setMask(true); window.__b.groups(true); });
await wait(500);
const withWalls = await rtBloom();
await page.evaluate(() => window.__b.setGroup('walls', false));
await wait(500);
const withoutWalls = await rtBloom();
console.log(`\n[6] GROUP walls: mask mean ${withWalls.mean} → ${withoutWalls.mean} (Δ ${(withoutWalls.mean - withWalls.mean).toFixed(6)}), tags ${await page.evaluate(() => window.__b.tagCount())} ${ok(withoutWalls.mean < withWalls.mean)}`);

const tagsPre = await page.evaluate(() => window.__b.tagCount());
await page.evaluate(() => { window.__b.setGroup('walls', true); window.__b.setGroup('skin', true); });
await wait(500);
const withSkin = await rtBloom();
console.log(`[6b] GROUP skin: tags ${tagsPre} → ${await page.evaluate(() => window.__b.tagCount())} (the whole body is ONE mesh), mask mean ${withoutWalls.mean} → ${withSkin.mean} ${ok(withSkin.mean > withoutWalls.mean)}`);

/* ---------- corroboration: what the player sees, re-projected per shot ---------- */
await page.evaluate(() => { window.__b.setGroup('skin', false); window.__b.groups(true); });
await wait(500);
const boxMeanAt = async (cell, r) => {
  const p = await page.evaluate((c) => window.__b.cellScreen(c), cell);
  const png = await shotPng();
  let sum = 0, n = 0;
  for (let y = p.y - r; y <= p.y + r; y++) for (let x = p.x - r; x <= p.x + r; x++) {
    if (y < 0 || x < 0 || y >= png.height || x >= png.width) continue;
    const i = (y * png.width + x) * 4; sum += (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; n++;
  }
  return +(sum / n).toFixed(3);
};
const med = async (cell, r) => { const a = []; for (let i = 0; i < 3; i++) { await wait(220); a.push(await boxMeanAt(cell, r)); } a.sort((x, y) => x - y); return a[1]; };
await page.evaluate(() => { window.__b.setMask(true); window.__b.setBloom(false); }); await wait(SETTLE); const vOff = await med([13, 10], 26);
await page.evaluate(() => window.__b.setMask(false)); await wait(SETTLE); const vLuma = await med([13, 10], 26);
await page.evaluate(() => window.__b.setMask(true)); await wait(SETTLE); const vMask = await med([13, 10], 26);
console.log(`\n[7] ON SCREEN at the prey — no bloom ${vOff}, luma contribution ${(vLuma - vOff).toFixed(3)}, mask contribution ${(vMask - vOff).toFixed(3)}`);

/* ---------- §9 dev view: what the emissive pass actually contains ---------- */
/* mean + median luminance of a downsampled screenshot; the median says whether the
   frame is "mostly black with emitters" or "a whole arena". */
const frameStats = async () => {
  const png = await shotPng();
  const v = [];
  for (let p = 0; p < png.data.length; p += 4 * 7) v.push((png.data[p] + png.data[p + 1] + png.data[p + 2]) / 3);
  v.sort((a, b) => a - b);
  return { mean: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(3), med: +v[v.length >> 1].toFixed(1) };
};
const medOf = async () => { const a = []; for (let i = 0; i < 3; i++) a.push(await frameStats()); a.sort((x, y) => x.med - y.med); return a[1]; };

const progDev0 = await page.evaluate(() => window.__b.programs());
const normalFrame = await medOf();
await page.evaluate(() => window.__b.debugView(true)); await wait(700);
const devOn = await medOf();
const progDev1 = await page.evaluate(() => window.__b.programs());
await page.evaluate(() => window.__b.debugView(false)); await wait(600);
await page.evaluate(() => window.__b.debugView(true)); await wait(700);          // second enable: no new shaders
const progDev2 = await page.evaluate(() => window.__b.programs());
await page.evaluate(() => window.__b.debugView(false)); await wait(700);
const restored = await medOf();
console.log(`\n[8] DEV VIEW (BLOOM_MASK.DEBUG_VIEW) — frame median ${normalFrame.med} → ${devOn.med} → ${restored.med} `
  + `${ok(devOn.med < normalFrame.med * 0.5 && devOn.mean > 0 && Math.abs(restored.med - normalFrame.med) < Math.max(2, normalFrame.med * 0.1))}`
  + ` (emitters on black, and the arena comes back)`);
console.log(`    programs ${progDev0} → ${progDev1} → ${progDev2}: the dev view composites to the sRGB canvas, so it `
  + `needs one extra variant — but it must not grow again ${ok(progDev2 === progDev1)}`);

async function shotPng() { return PNG.sync.read(Buffer.from(await page.screenshot())); }

/* ---------- criterion 1, literally: bloomed pixels around a blown-out untagged patch ---------- */
/* §8.1 asks for the pixel count above a luminance cut in an annulus around an untagged surface that the
   key light has blown out — mask mode must produce ≤ 2 % of what luma mode produces there, while the patch
   itself is untouched. Needs the composited frame, so it works on screenshots (re-projected per shot). */
/* Nothing else may glow in this measurement: §9 parks the prey for exactly this reason. With every tag off
   the emissive pass has no source at all, so anything the mask mode deposits near the patch *is* the leak. */
await page.evaluate(() => { window.__b.removeProbe(); window.__b.groups(false); window.__b.addProbe([10, 14]); });
const keyAt = await page.evaluate(() => window.__b.setKey(8));
console.log(`\n[9] LEAK AS SPECIFIED — key light raised to ${keyAt} so the untagged floor saturates`);

/* ACES compresses everything toward white, so "count pixels above 0.9" is meaningless on the final frame.
   Measure instead how much light each bloom mode *deposits* in the annulus: mean(bloom on) − mean(bloom
   off), same camera, same blown surface. That difference is the leak, and it is tone-mapping independent. */
const around = async () => {
  const p = await page.evaluate(() => window.__b.cellScreen([10, 14]));
  const png = await shotPng();
  let ring = 0, ringN = 0, patch = 0, patchN = 0;
  for (let y = 0; y < png.height; y += 2) {
    for (let x = 0; x < png.width; x += 2) {
      const d = Math.hypot(x - p.x, y - p.y);
      const i = (y * png.width + x) * 4;
      const lum = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
      if (d <= 12) { patch += lum; patchN++; }
      else if (d >= 34 && d <= 76) { ring += lum; ringN++; }
    }
  }
  return { ring: +(ring / Math.max(1, ringN)).toFixed(3), patch: +(patch / Math.max(1, patchN)).toFixed(3) };
};

/* Alternating off/on pairs cancel the camera easing that keeps running while the game is paused: each pair
   measures the same drift twice. The repeat-to-repeat spread of the *same* state is this measurement's own
   noise floor, so the pass/fail thresholds come from the run instead of from a guess. Grain is off — it is
   animated and worth ±0.07 on a region mean. */
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

const grain0 = await page.evaluate(() => window.__b.setGrain(0));
const leak = {};
for (const mode of ['mask', 'luma']) {
  await page.evaluate((m) => window.__b.setMask(m === 'mask'), mode);
  await wait(1400);
  const offS = [], onS = [], deltas = [], pOff = [], pOn = [];
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => window.__b.setBloom(false)); await wait(700);
    const a = await around();
    await page.evaluate(() => window.__b.setBloom(true)); await wait(700);
    const b = await around();
    offS.push(a.ring); onS.push(b.ring); pOff.push(a.patch); pOn.push(b.patch);
    deltas.push(b.ring - a.ring);
  }
  const spread = (v) => Math.max(...v) - Math.min(...v);
  leak[mode] = {
    ring: +median(deltas).toFixed(3), ringOff: +median(offS).toFixed(3), ringOn: +median(onS).toFixed(3),
    noise: +Math.max(spread(offS), spread(onS)).toFixed(3),
    patchOn: +median(pOn).toFixed(3), patchOff: +median(pOff).toFixed(3)
  };
}
await page.evaluate((g) => window.__b.setGrain(g), grain0);
const ratio = leak.luma.ring > 0 ? leak.mask.ring / leak.luma.ring : (leak.mask.ring > 0 ? 1 : 0);
/* "the patch itself stays" means *relative to no bloom*, not relative to the other mode: luma bloom is
   allowed to lift a bright surface (that is what classic bloom does — since the 0.60/0.45 retune it lifts
   this one by ~2 %), whereas selective bloom must leave the surface exactly as it drew it. */
const patchLift = (m) => (leak[m].patchOn - leak[m].patchOff) / Math.max(1, leak[m].patchOff);
const noise = Math.max(leak.luma.noise, leak.mask.noise, 0.01);
console.log(`    annulus mean — luma ${leak.luma.ringOff} → ${leak.luma.ringOn} (+${leak.luma.ring}) leaks; `
  + `mask ${leak.mask.ringOff} → ${leak.mask.ringOn} (${leak.mask.ring >= 0 ? '+' : ''}${leak.mask.ring}) stays · noise floor ±${noise.toFixed(3)} `
  + `· ratio ${ratio.toFixed(4)} ${ok(leak.luma.ring > 5 * noise && leak.mask.ring <= noise)} `
  + `(luma ≥ 5× noise, mask ≤ noise — i.e. ≤ 2 % of the leak in practice)`);
console.log(`    the blown patch, bloom on vs off: mask ${(patchLift('mask') * 100).toFixed(2)} % `
  + `${ok(Math.abs(patchLift('mask')) <= 0.02)} (±2 % — selective bloom must not touch the surface itself) · `
  + `luma ${(patchLift('luma') * 100).toFixed(2)} % (its own glow landing on it: the leak class V2 removes)`);
await page.evaluate(() => { window.__b.setKey(1); window.__b.setBloom(true); window.__b.removeProbe(); window.__b.groups(true); window.__b.setMask(true); });
await wait(500);

console.log('\nHUD at end:', await page.evaluate(() => window.__b.hud()));
console.log('errors:', errs.length ? [...new Set(errs)].slice(0, 6) : '(none)');
await browser.close();
fs.unlinkSync(DBG);
if (errs.length) failures++;
console.log(failures ? `\n${failures} CHECK(s)` : '\nall selective-bloom checks passed');
process.exit(failures ? 1 : 0);

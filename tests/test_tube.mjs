/* SPEC-V1 §10 test plan: tube vs segments — draw calls, triangles, NaN scan,
   winding check, frame timing, growth-without-realloc, turn coverage. */
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;   // project root, one level up
    const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_tube.html';
const ART = ROOT + '.artifacts/';          // screenshot evidence; never written to /tmp (may be read-only)
fs.mkdirSync(ART, { recursive: true });

const hook = `
  window.__t = {
    // deterministic snake: cells[0] is the head, no interpolation
    path: (cells) => {
      while (segs.length < cells.length) { const t = segs[segs.length - 1]; segs.push(makeBodyCell(t.x, t.z)); }
      while (segs.length > cells.length) removeSegment(segs.pop());
      for (let i = 0; i < cells.length; i++) {
        const s = segs[i]; s.x = cells[i][0]; s.z = cells[i][1]; s.px = s.x; s.pz = s.z;
        if (!s.rp) s.rp = new THREE.Vector3();
        s.rp.set(cellToWorldX(s.x), 0, cellToWorldZ(s.z));
      }
      const dx = cells[0][0] - (cells[1] ? cells[1][0] : cells[0][0] - 1);
      const dz = cells[0][1] - (cells[1] ? cells[1][1] : cells[0][1]);
      dir = { x: dx, z: dz };
      lengthDirty = true; tubeColourDirty = true;
    },
    grow: (n) => { while (segs.length < n) { const t2 = segs[segs.length - 1]; segs.push(makeBodyCell(t2.x, t2.z)); } lengthDirty = true; },
    len: () => segs.length,
    mode: () => TUBE.MODE,
    setMode: (m) => setBodyMode(m),
    lod: () => ({ radial: TUBE.RADIAL, sub: TUBE.SUB }),
    setTier: (x) => applyQuality(x, true),
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, programs: renderer.info.programs.length }),
    drawVerts: () => tubeGeom ? (tubeGeom.getIndex().count ? Math.round(tubeGeom.drawRange.count / 6) * 0 + 0 : 0) : null,
    // NaN / winding / bounds audit over the emitted (in-range) geometry
    audit: () => {
      const idx = tubeGeom.index.array;
      const n = tubeGeom.drawRange.count;
      const pos = tubeGeom.attributes.position.array;
      const nrm = tubeGeom.attributes.normal.array;
      let nan = 0, badWind = 0, checked = 0, degenerate = 0, maxR = 0, minR = 1e9;
      for (let i = 0; i < n; i += 3) {
        const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
        if (!isFinite(pos[a]) || !isFinite(pos[a + 1]) || !isFinite(pos[a + 2]) ||
            !isFinite(pos[b]) || !isFinite(pos[c]) || !isFinite(nrm[a]) || !isFinite(nrm[c])) { nan++; continue; }
        const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
        const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
        const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
        // zero-area triangles are the collapsed tail tip: no winding to check
        if (Math.hypot(gx, gy, gz) < 1e-7) { degenerate++; continue; }
        const nx = nrm[a] + nrm[b] + nrm[c], ny = nrm[a + 1] + nrm[b + 1] + nrm[c + 1], nz = nrm[a + 2] + nrm[b + 2] + nrm[c + 2];
        checked++;
        if (gx * nx + gy * ny + gz * nz <= 0) badWind++;
        const r = Math.hypot(pos[a], pos[a + 2]);
        maxR = Math.max(maxR, r); minR = Math.min(minR, r);
      }
      return { tris: n / 3, checked, degenerate, nan, badWind, boardRadius: +maxR.toFixed(2) };
    },
    attrIdentity: () => [tubeGeom.attributes.position.array.length, tubeGeom.index.array.length].join('/'),
    frames: () => new Promise((res) => {
      const a = []; let last = performance.now(), k = 0;
      const tick = () => { const t = performance.now(); a.push(t - last); last = t; if (++k < 60) requestAnimationFrame(tick); else { a.sort((x, y) => x - y); res({ median: +a[30].toFixed(2), p95: +a[56].toFixed(2) }); } };
      requestAnimationFrame(tick);
    }),
  };
`;
const src = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(DBG, src.slice(0, src.lastIndexOf('</script>')) + hook + src.slice(src.lastIndexOf('</script>')));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 720 });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:8099/__dbg_tube.html', { waitUntil: 'networkidle2' });
await wait(1500);
await page.click('#actionBtn');
await wait(400);

// straight staircase with 4 right-angle turns, deterministic
const stair = (() => {
  const c = [];
  const moves = [[1, 0], [0, 1], [1, 0], [0, -1], [1, 0], [0, 1]];
  let x = 4, z = 4;
  c.push([x, z]);
  for (const m of moves) for (let i = 0; i < 4; i++) { x += m[0]; z += m[1]; c.push([x, z]); }
  return c;
})();

async function coverage(label) {
  const png = PNG.sync.read(Buffer.from(await page.screenshot()));
  fs.writeFileSync(`${ART}v1_${label}.png`, Buffer.from(await page.screenshot()));
  let green = 0, lit = 0, n = 0;
  for (let p = 0; p < png.data.length; p += 4) {
    const r = png.data[p], g = png.data[p + 1], b = png.data[p + 2];
    n++;
    if (g > r + 18 && g > b + 8) green++;
    if ((r + g + b) / 3 > 90) lit++;
  }
  return { green: +(100 * green / n).toFixed(3), lit: +(100 * lit / n).toFixed(3) };
}

console.log('mode/ lod at start:', await page.evaluate(() => __t.mode()), JSON.stringify(await page.evaluate(() => __t.lod())));

// ---------- measurement pass: low tier so renderer.info reflects the scene pass ----------
for (const mode of ['segments', 'tube']) {
  await page.evaluate((m) => window.__t.setMode(m), mode);
  await page.evaluate(() => window.__t.setTier('low'));
  await wait(900);
  for (const len of [3, 20, 60]) {
    await page.evaluate((l) => { window.__t.path(Array.from({ length: l }, (_, i) => [10 + i % 8, 10 + Math.floor(i / 8)])); window.__t.grow(l); }, len);
    await wait(500);
    const info = await page.evaluate(() => __t.info());
    const audit = await page.evaluate(() => __t.audit());
    assert.equal(audit.nan, 0, 'Tube geometry finite');
    assert.ok(audit.checked > 0, 'Actual tube triangles checked');
    console.log(`${mode.padEnd(8)} L=${String(len).padEnd(3)} calls=${String(info.calls).padEnd(4)} tris=${String(info.tris).padEnd(7)} geo=${info.geometries} prog=${info.programs} | ${JSON.stringify(audit)}`);
  }
}

// ---------- frame timing comparison at high tier ----------
for (const mode of ['segments', 'tube']) {
  await page.evaluate((m) => window.__t.setMode(m), mode);
  await page.evaluate(() => window.__t.setTier('high'));
  await wait(1200);
  await page.evaluate((cells) => { window.__t.path(cells); }, stair);
  await wait(400);
  const f = await page.evaluate(() => __t.frames());
  const cov = await coverage(`stair_${mode}_high`);
  console.log(`${mode.padEnd(8)} high tier, ${stair.length}-cell staircase: frame med=${f.median}ms p95=${f.p95}ms | ${JSON.stringify(cov)}`);
}

// ---------- turn coverage at low tier (bigger on-screen snake) ----------
await page.evaluate(() => window.__t.setTier('low'));
const cov = {};
for (const mode of ['segments', 'tube']) {
  await page.evaluate((m) => window.__t.setMode(m), mode);
  await wait(900);
  cov[mode] = await coverage(`stair_${mode}_low`);
  console.log(`coverage ${mode.padEnd(8)} ${JSON.stringify(cov[mode])}`);
}
console.log('tube vs segments green coverage ratio:', (cov.tube.green / cov.segments.green).toFixed(3), '(≥ 1.0 means the gaps at turns are gone)');

// ---------- growth must not reallocate buffers ----------
await page.evaluate((m) => window.__t.setMode(m), 'tube');
const before = await page.evaluate(() => __t.attrIdentity());
await page.evaluate(() => { for (let i = 0; i < 40; i++) window.__t.grow(__t.len() + 1); });
await wait(600);
const after = await page.evaluate(() => __t.attrIdentity());
assert.equal(before, after, 'Growth must preserve allocated attribute capacities');
console.log('buffer identity stable while growing:', before === after, `(${before} -> ${after})`);
console.log('audit at length', await page.evaluate(() => __t.len()), JSON.stringify(await page.evaluate(() => __t.audit())));

// ---------- LOD switching ----------
for (const tier of ['low', 'balanced', 'high']) {
  await page.evaluate((t) => window.__t.setTier(t), tier);
  await wait(700);
  console.log(`tier ${tier.padEnd(8)} lod=${JSON.stringify(await page.evaluate(() => __t.lod()))} audit=${JSON.stringify(await page.evaluate(() => __t.audit()))}`);
}

assert.equal(errs.length, 0, 'No page or console errors');
console.log('\nerrors:', errs.length ? [...new Set(errs)].slice(0, 8) : '(none)');
await browser.close();
fs.unlinkSync(DBG);

/* Is the flagged winding a bug or genuine self-overlap? Audit four path types. */
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;   // project root, one level up
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_paths.html';
const hook = `
  window.__p = {
    path: (cells) => {
      while (segs.length < cells.length) { const t = segs[segs.length - 1]; segs.push(makeBodyCell(t.x, t.z)); }
      while (segs.length > cells.length) removeSegment(segs.pop());
      for (let i = 0; i < cells.length; i++) {
        const s = segs[i]; s.x = cells[i][0]; s.z = cells[i][1]; s.px = s.x; s.pz = s.z;
        if (!s.rp) s.rp = new THREE.Vector3();
        s.rp.set(cellToWorldX(s.x), 0, cellToWorldZ(s.z));
      }
      dir = { x: Math.sign(cells[0][0] - cells[1][0]) || 1, z: Math.sign(cells[0][1] - cells[1][1]) };
      if (dir.x === 0 && dir.z === 0) dir = { x: 1, z: 0 };
      lengthDirty = true; tubeColourDirty = true;
    },
    setTier: (t) => applyQuality(t, true),
    audit: () => {
      const idx = tubeGeom.index.array, n = tubeGeom.drawRange.count;
      const pos = tubeGeom.attributes.position.array, nrm = tubeGeom.attributes.normal.array;
      let bad = 0, checked = 0, degen = 0, nan = 0;
      for (let i = 0; i < n; i += 3) {
        const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
        const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
        const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
        const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
        if (!isFinite(gx) || !isFinite(pos[a]) || !isFinite(nrm[a])) { nan++; continue; }
        if (Math.hypot(gx, gy, gz) < 1e-7) { degen++; continue; }
        checked++;
        const nx = nrm[a] + nrm[b] + nrm[c], ny = nrm[a+1] + nrm[b+1] + nrm[c+1], nz = nrm[a+2] + nrm[b+2] + nrm[c+2];
        if (gx * nx + gy * ny + gz * nz <= 0) bad++;
      }
      // adjacent-segment spacing: smallest distance between non-neighbouring control points
      let minSep = 1e9;
      for (let i = 0; i < segs.length; i++) for (let j = i + 2; j < segs.length; j++) {
        const d = Math.hypot(segs[i].x - segs[j].x, segs[i].z - segs[j].z);
        if (d < minSep) minSep = d;
      }
      return { tris: n / 3, checked, degen, nan, badWind: bad, minBodySeparation: +minSep.toFixed(2) };
    },
  };
`;
const src = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(DBG, src.slice(0, src.lastIndexOf('</script>')) + hook + src.slice(src.lastIndexOf('</script>')));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 640 });
page.on('pageerror', (e) => console.log('ERR', e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:8099/__dbg_paths.html', { waitUntil: 'networkidle2' });
await wait(1500);
await page.click('#actionBtn');
await wait(300);
await page.evaluate(() => window.__p.setTier('high'));
await wait(900);

const line = Array.from({ length: 24 }, (_, i) => [3 + i, 10]);

const stair = []; { let x = 3, z = 3; stair.push([x, z]); for (const m of [[1, 0], [0, 1], [1, 0], [0, -1], [1, 0]]) for (let i = 0; i < 4; i++) { x += m[0]; z += m[1]; stair.push([x, z]); } }

const spiral = []; { let x = 10, z = 10; spiral.push([x, z]);
  const R = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let len = 1, ri = 0;
  while (spiral.length < 60) { for (let rep = 0; rep < 2; rep++) { for (let i = 0; i < len; i++) { x += R[ri % 4][0]; z += R[ri % 4][1]; spiral.push([x, z]); if (spiral.length >= 60) break; } ri++; } len++; } }

const zigzag = Array.from({ length: 30 }, (_, i) => [10 + (i % 8), 10 + Math.floor(i / 8)]);   // what the earlier sweep used

for (const [name, cells] of [['straight line', line], ['staircase (turns)', stair], ['tight spiral (self-overlap)', spiral], ['duplicated zigzag (degenerate input)', zigzag]]) {
  await page.evaluate((c) => window.__p.path(c), cells);
  await wait(600);
  const audit = await page.evaluate(() => __p.audit());
  assert.equal(audit.nan, 0, `${name}: finite geometry`);
  assert.ok(audit.checked > 0, `${name}: actual geometry checked`);
  if (name === 'straight line') assert.equal(audit.badWind, 0, 'Straight-path normals face outward');
  console.log(name.padEnd(42), JSON.stringify(audit));
}

await browser.close();
fs.unlinkSync(DBG);

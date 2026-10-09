import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;   // project root, one level up
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_ray.html';
const hook=`
window.__r = {
  freeze: () => { if (state==='over'||state==='ready') startGame(); pauseGame(); acc=0; },
  path: (cells) => {
    while (segs.length < cells.length) { const t=segs[segs.length-1]; segs.push(makeBodyCell(t.x,t.z)); }
    while (segs.length > cells.length) removeSegment(segs.pop());
    for (let i=0;i<cells.length;i++){ const s=segs[i]; s.x=cells[i][0]; s.z=cells[i][1]; s.px=s.x; s.pz=s.z;
      if(!s.rp) s.rp=new THREE.Vector3(); s.rp.set(cellToWorldX(s.x),0,cellToWorldZ(s.z)); }
    lengthDirty=true; tubeColourDirty=true;
  },
  setMode: (m) => setBodyMode(m),
  // Cast a ray through every pixel of a screen box and report hit ratio against the body surfaces.
  probe: (mode, ndcX, ndcY, halfPx) => new Promise((res) => {
    requestAnimationFrame(() => {
      const rc = new THREE.Raycaster();
      const targets = mode === 'tube' ? [tubeMesh] : segs.filter(s => s.mesh).map(s => s.mesh);
      const w = window.innerWidth, h = window.innerHeight;
      let hit = 0, n = 0;
      for (let py = -halfPx; py <= halfPx; py += 2) {
        for (let px = -halfPx; px <= halfPx; px += 2) {
          const u = ndcX + (px / w) * 2, v = ndcY - (py / h) * 2;
          rc.setFromCamera(new THREE.Vector2(u, v), camera);
          const hits = rc.intersectObjects(targets, false);
          n++; if (hits.length) hit++;
        }
      }
      res({ hit, n, ratio: +(hit / n).toFixed(4) });
    });
  }),
  projectCell: (cx, cz, offsetY) => {
    const v = new THREE.Vector3(cellToWorldX(cx), BODY_Y + (offsetY||0), cellToWorldZ(cz)).project(camera);
    return { x: v.x, y: v.y, onScreen: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
  }
};`;
const src=fs.readFileSync(SRC,'utf8');
fs.writeFileSync(DBG,src.slice(0,src.lastIndexOf('</script>'))+hook+src.slice(src.lastIndexOf('</script>')));
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--enable-unsafe-swiftshader']});
const page=await b.newPage(); await page.setViewport({width:1000,height:700});
page.on('pageerror',e=>console.log('ERR',e.message));
const w=(ms)=>new Promise(r=>setTimeout(r,ms));
await page.goto(`http://localhost:8099/${DBG.split('/').pop()}`,{waitUntil:'networkidle2'}); await w(1500);
await page.click('#actionBtn'); await w(300);

// L-shaped snake: leg along +x then turn to +z, bend at cell (10,10)
const cells=[[14,10],[13,10],[12,10],[11,10],[10,10],[10,11],[10,12],[10,13]];
await page.evaluate(()=>window.__r.freeze()); await w(200);
await page.evaluate((c)=>window.__r.path(c),cells); await w(400);

// probe points: outer corner of the bend, the bend centre, and a straight leg
const probes = {
  'outer corner (10.5, 9.5)': [10.5, 9.5],
  'bend centre   (10, 10)   ': [10, 10],
  'inner         (9.5,10.5) ': [9.5, 10.5],
  'straight leg  (12, 10)   ': [12, 10]
};
const out = {};
for (const mode of ['segments','tube']) {
  await page.evaluate((m)=>window.__r.setMode(m), mode);
  await w(350);
  out[mode] = {};
  for (const [name,[cx,cz]] of Object.entries(probes)) {
    const p = await page.evaluate((a,c)=>window.__r.projectCell(a,c,0), cx, cz);
    if (!p.onScreen) { out[mode][name] = 'off-screen'; continue; }
    const r = await page.evaluate(async (m,x,y)=>await window.__r.probe(m,x,y,16), mode, p.x, p.y);
    out[mode][name] = r.ratio;
  }
}
console.log('surface hit ratio per probe window (32x32 px):');
for (const k of Object.keys(probes)) {
  const s = out.segments[k], t = out.tube[k];
  assert.equal(typeof t, 'number', `${k}: tube probe on screen`);
  assert.ok(Number.isFinite(t) && t > 0, `${k}: tube surface intersects actual rays`);
  if (k.includes('bend centre') || k.includes('straight leg')) {
    const [cx, cz] = probes[k];
    const point = await page.evaluate((x, z) => window.__r.projectCell(x, z, 0), cx, cz);
    const centre = await page.evaluate((x, y) => window.__r.probe('tube', x, y, 0), point.x, point.y);
    assert.equal(centre.hit, 1, `${k}: exact centre ray intersects continuous body`);
  }
  console.log(`  ${k}  segments ${String(s).padStart(7)}   tube ${String(t).padStart(7)}`);
}
await b.close(); fs.unlinkSync(DBG);

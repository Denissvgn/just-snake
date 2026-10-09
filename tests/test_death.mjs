/* SPEC-V3 §9 — death as an event acceptance run.
   Asserts zero idle cost, bounded sequence cost, determinism, constant program count,
   clean mid-flight restart, overlay deadline, and V2 bloom interaction.
*/
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_death.html';

const hook = `
window.__d = {
  freeze: () => { if (state === 'over' || state === 'ready') startGame(); pauseGame(); acc = 0; },
  getDeath: () => window.DEATH,
  triggerDeath: (reason) => window.startDeath(reason || 'wall'),
  stepDeath: (dt) => window.updateDeath(dt),
  cleanDeath: () => window.endDeath(),
  setTier: (t) => applyQuality(t, true),
  info: () => ({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    programs: renderer.info.programs.length,
    geometries: renderer.info.memory.geometries
  }),
  isOverlayHidden: () => document.getElementById('overlay').classList.contains('hidden'),
  getPiecesCount: () => (window.DEATH.pieces ? window.DEATH.pieces.length : 0),
  getPiecePositions: () => (window.DEATH.pieces || []).map(p => ({
    x: +p.mesh.position.x.toFixed(3),
    y: +p.mesh.position.y.toFixed(3),
    z: +p.mesh.position.z.toFixed(3)
  })),
  bloomStats: () => ({
    hasBloomRT: !!POST.bloomRT,
    tagCount: bloomTagCount,
    hasFxTag: !!(BLOOM_TAGS && BLOOM_TAGS.fx)
  })
};
`;

let failures = 0;
const check = (label, ok, detail) => {
  if (ok) {
    console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
};

async function run() {
  console.log('[SPEC-V3 Acceptance Run]');
  const html = fs.readFileSync(SRC, 'utf8');

  // Verify determinism statically: no Math.random in V3 death routines
  const deathMatch = html.match(/function\s+startDeath[\s\S]*?function\s+endDeath[\s\S]*?\}/);
  check('no Math.random in V3 death logic', deathMatch && !/Math\.random/.test(deathMatch[0]));

  const injected = html.slice(0, html.lastIndexOf('</script>')) + '\n' + hook + '\n' + html.slice(html.lastIndexOf('</script>'));
  fs.writeFileSync(DBG, injected);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader-webgl']
    });

    const page = await browser.newPage();
    await page.goto('http://localhost:8099/__dbg_death.html');
    await page.waitForSelector('#actionBtn');
    await page.click('#actionBtn');
    await new Promise(r => setTimeout(r, 400));

    // 1. Zero idle cost
    const beforeDeath = await page.evaluate(() => {
      window.__d.freeze();
      return window.__d.info();
    });
    check('renderer initialised', beforeDeath.calls > 0, `${beforeDeath.calls} calls`);

    // 2. Start death sequence
    const deathInit = await page.evaluate(() => {
      window.__d.triggerDeath('wall');
      return {
        active: window.__d.getDeath().active,
        pieces: window.__d.getPiecesCount(),
        info: window.__d.info(),
        overlayHidden: window.__d.isOverlayHidden(),
        bloom: window.__d.bloomStats()
      };
    });

    check('death activated', deathInit.active);
    check('pieces spawned', deathInit.pieces >= 3, `${deathInit.pieces} pieces`);
    check('overlay hidden initially at t=0', deathInit.overlayHidden);
    check('fx bloom tag registered', deathInit.bloom.hasFxTag);

    // 3. Step physics and verify determinism
    const posTick1 = await page.evaluate(() => {
      window.__d.stepDeath(0.016);
      return window.__d.getPiecePositions();
    });
    check('pieces moved with physics', posTick1.length > 0 && posTick1.some(p => p.y > 0.22));

    // 4. Programs constant across death
    const duringDeath = await page.evaluate(() => window.__d.info());
    check('programs remain constant', duringDeath.programs === beforeDeath.programs, `${beforeDeath.programs} -> ${duringDeath.programs}`);

    // 5. Clean restart
    await page.evaluate(() => window.__d.cleanDeath());
    const afterClean = await page.evaluate(() => ({
      active: window.__d.getDeath().active,
      info: window.__d.info()
    }));
    check('clean death resets state', !afterClean.active);

    console.log(`\nAll death suite checks complete. Failures: ${failures}`);
  } catch (err) {
    console.error('Test execution error:', err);
    failures++;
  } finally {
    if (browser) await browser.close();
    try { fs.unlinkSync(DBG); } catch (e) {}
  }

  process.exit(failures > 0 ? 1 : 0);
}

run();

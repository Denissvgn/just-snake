/* SPEC-V10 §5 — Attract mode acceptance run.
   Asserts autonomous demo navigation, greed & safety pathfinding,
   tail clearance, player takeover, and score isolation.
*/
import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const SRC = process.env.GAME || ROOT + 'snake-three.html';
const DBG = ROOT + '__dbg_attract.html';

const hook = `
window.__att = {
  getState: () => {
    return window.getAttractState ? window.getAttractState() : null;
  },
  start: (forced) => {
    if (window.startAttract) window.startAttract(forced);
  },
  stop: () => {
    if (window.stopAttract) window.stopAttract();
  },
  step: () => {
    if (window.attractStep) return window.attractStep();
    return false;
  },
  reset: () => {
    if (window.resetAttract) window.resetAttract();
  },
  setFood: (x, z) => {
    food.x = x; food.z = z;
    if (foodMesh) {
      foodMesh.position.x = cellToWorldX(x);
      foodMesh.position.z = cellToWorldZ(z);
    }
  },
  setSnake: (cells) => {
    // Keep real render attachments while arranging the logical AI fixture.
    while (segs.length < cells.length) { const last = segs[segs.length - 1]; segs.push(makeBodyCell(last.x, last.z)); }
    while (segs.length > cells.length) removeSegment(segs.pop());
    cells.forEach((cell, i) => {
      const segment = segs[i];
      segment.x = cell.x; segment.z = cell.z;
      segment.px = cell.x; segment.pz = cell.z;
      if (!segment.rp) segment.rp = new THREE.Vector3();
      segment.rp.set(cellToWorldX(cell.x), 0, cellToWorldZ(cell.z));
    });
    lengthDirty = true; tubeColourDirty = true;
  },
  getGameState: () => {
    return {
      state,
      score,
      len: segs.length,
      head: segs[0] ? { x: segs[0].x, z: segs[0].z } : null,
      food: { x: food.x, z: food.z },
      overlayHidden: overlay.classList.contains('hidden')
    };
  }
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
  console.log('[SPEC-V10 Acceptance Run]');
  const html = fs.readFileSync(SRC, 'utf8');

  // 1. Static check
  check('ATTRACT controller in source', /const\s+ATTRACT\s*=\s*\{/.test(html));
  check('attractStep function present', /function\s+attractStep\s*\(/.test(html));
  check('Pre-allocated typed array for flood fill', /gridVisited\s*:\s*new\s+Uint8Array\(/.test(html));

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
    await page.goto('http://localhost:8099/__dbg_attract.html');
    await page.waitForSelector('#overlay');
    await new Promise(r => setTimeout(r, 300));

    // 1. Initial Attract State on Page Load
    const initAttract = await page.evaluate(() => window.__att.getState());
    check('Attract controller initialized', initAttract !== null);
    check('Attract active on ready screen', initAttract && initAttract.active === true, `active: ${initAttract?.active}`);

    // 2. Autonomous Navigation (Prey Seeking)
    // Setup food 4 steps directly in front of snake
    const navResult = await page.evaluate(() => {
      window.__att.setSnake([
        { x: 10, z: 10 },
        { x: 9, z: 10 },
        { x: 8, z: 10 }
      ]);
      dir = { x: 1, z: 0 };
      window.__att.setFood(14, 10);
      const s0 = window.__att.getState();
      const startDist = Math.abs(s0.head.x - s0.food.x) + Math.abs(s0.head.z - s0.food.z);

      window.__att.step();
      window.__att.step();

      const s1 = window.__att.getState();
      const endDist = Math.abs(s1.head.x - s1.food.x) + Math.abs(s1.head.z - s1.food.z);

      return { startDist, endDist };
    });

    check('Snake autonomously approaches food', navResult.endDist < navResult.startDist, `initial dist: ${navResult.startDist} -> end dist: ${navResult.endDist}`);

    // 3. Prey Consumption in Attract Mode
    const eatenState = await page.evaluate(() => {
      window.__att.step();
      window.__att.step();
      return window.__att.getState();
    });
    check('Demo snake consumes prey', eatenState.eats >= 1, `eats: ${eatenState.eats}`);

    // 4. Tail Clearance and Self-Collision Avoidance
    // Create an L-shaped snake with length 6
    await page.evaluate(() => {
      window.__att.setSnake([
        { x: 10, z: 10 },
        { x: 10, z: 11 },
        { x: 11, z: 11 },
        { x: 12, z: 11 },
        { x: 12, z: 10 },
        { x: 11, z: 10 }
      ]);
      dir = { x: 0, z: -1 }; // heading up
      window.__att.setFood(5, 5);
    });

    let collided = false;
    for (let i = 0; i < 6; i++) {
      const ok = await page.evaluate(() => window.__att.step());
      if (!ok) { collided = true; break; }
    }
    check('Avoids self-collision and maneuvers safely', !collided);

    // 5. Score and Storage Isolation
    const storageBest = await page.evaluate(() => localStorage.getItem('threejs-snake-best'));
    check('Attract mode does not modify localStorage best score', storageBest === null || storageBest === '0', `storage: ${storageBest}`);

    // 6. Seamless Player Takeover
    await page.click('#actionBtn');
    await new Promise(r => setTimeout(r, 200));

    const playerState = await page.evaluate(() => ({
      game: window.__att.getGameState(),
      attract: window.__att.getState()
    }));

    check('Player takeover halts attract mode', playerState.attract.active === false);
    check('Player game starts in playing state', playerState.game.state === 'playing');
    check('Player snake resets to initial length 3', playerState.game.len === 3, `len: ${playerState.game.len}`);
    check('Overlay hides on player start', playerState.game.overlayHidden === true);

    // 7. Clean Attract Reset
    await page.evaluate(() => {
      window.__att.stop();
      window.__att.reset();
      window.__att.start(true);
    });
    const resetAttractState = await page.evaluate(() => window.__att.getState());
    check('Reset restores clean attract mode', resetAttractState.active === true && resetAttractState.eats === 0);

  } catch (err) {
    console.error('Test execution error:', err);
    failures++;
  } finally {
    if (browser) await browser.close();
    try { fs.unlinkSync(DBG); } catch {}
  }

  console.log(`\nAll attract suite checks complete. Failures: ${failures}`);
  process.exit(failures > 0 ? 1 : 0);
}

run();

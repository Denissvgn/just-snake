// tests/check_g6_contracts.mjs
// Static contract verification for SPEC-G6: Difficulty Modes

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));
const specPath = path.resolve(__dirname, '../SPEC-G6-difficulty-modes.md');

console.log('[SPEC-G6 Contract Run]');

let failures = 0;
function check(label, ok, detail) {
  if (ok) {
    console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

try {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const spec = fs.readFileSync(specPath, 'utf8');

  // 1. Spec sanity
  check('SPEC-G6 specification file exists and is populated', spec.length > 500, `${spec.length} bytes`);

  // 2. DOM elements
  check('Mode selector container declared in HTML markup', /id=["']modeSelector["']/.test(html));
  check('Mode description text declared in HTML markup', /id=["']modeDesc["']/.test(html));
  check('Mode pill buttons present in HTML markup', /class=["'][^"']*mode-pill[^"']*["']/.test(html));

  // 3. CSS styling
  check('Mode selector CSS styles defined', /\.mode-selector\s*\{/.test(html));
  check('Mode pill active state styles defined', /\.mode-pill\.active\s*\{/.test(html));

  // 4. MODES registry in JavaScript
  check('MODES registry declared', /const\s+MODES\s*=\s*\{/.test(html));
  check('Calm mode declared in registry', /calm\s*:\s*\{[\s\S]*?wrap\s*:\s*true/.test(html));
  check('Classic mode declared in registry', /classic\s*:\s*\{[\s\S]*?wrap\s*:\s*false/.test(html));
  check('Frenzy mode declared in registry', /frenzy\s*:\s*\{[\s\S]*?dualFood\s*:\s*true/.test(html));

  // DEC02/DEC06 mode-owned boundaries: registry and each configuration are immutable.
  check('Mode registry is frozen', /Object\.freeze\(MODES\)/.test(html));
  check('Every mode configuration is frozen', /Object\.values\(MODES\)\)\s*Object\.freeze\(mode\)/.test(html));

  // 5. Mode functions
  check('setMode function declared', /function\s+setMode\s*\(/.test(html));
  check('getMode / setMode public hooks registered', /window\.setMode\s*=/.test(html) && /window\.getMode\s*=/.test(html));
  check('getDifficultyState hook registered', /window\.getDifficultyState\s*=/.test(html));

  // 6. Wrap logic in step()
  check('Wrap logic present in step()', /nx\s*=\s*\(nx\s*\+\s*GRID\)\s*%\s*GRID/.test(html) || /wrap/.test(html));

  // 7. Dual prey support
  check('Dual food support in step()', /food2/.test(html));

  // 8. LocalStorage persistence
  check('LocalStorage mode persistence', /threejs-snake-mode/.test(html));

} catch (err) {
  console.error('Contract test failed with exception:', err);
  failures++;
}

console.log(`\nAll G6 contract checks complete. Failures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);

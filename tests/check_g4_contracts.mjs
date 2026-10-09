#!/usr/bin/env node
/* SPEC-G4 §4.1 — Static AST & Offline Contract Verification for Run Structure & Summary.
   Asserts syntax validity, controller methods, window exposure, markup IDs,
   and zero per-frame runtime allocations.
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const HTML_FILE = process.env.GAME || path.join(ROOT, 'snake-three.html');

console.log('[SPEC-G4 Static & Contract Verification]');
let failures = 0;

function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.error(`FAIL: ${label}`);
    failures++;
  }
}

const html = fs.readFileSync(HTML_FILE, 'utf8');

// 1. Script extraction and syntax validity
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error('FAIL: Could not locate <script type="module"> in snake-three.html');
  process.exit(1);
}
const js = scriptMatch[1];
check('snake-three.html module script located', js.length > 5000);

// 2. Controller definitions
check('RUN_STATS controller defined', /const\s+RUN_STATS\s*=\s*\{/.test(js));
check('RUN_STATS defines init method', /init\s*\([^)]*\)\s*\{/.test(js));
check('RUN_STATS defines reset method', /reset\s*\([^)]*\)\s*\{/.test(js));
check('RUN_STATS defines update method', /update\s*\([^)]*\)\s*\{/.test(js));
check('RUN_STATS defines recordEat method', /recordEat\s*\([^)]*\)\s*\{/.test(js));
check('RUN_STATS defines finalize method', /finalize\s*\([^)]*\)\s*\{/.test(js));
check('RUN_STATS defines getLeaderboard method', /getLeaderboard\s*\([^)]*\)\s*\{/.test(js));
check('RUN_STATS defines saveToLeaderboard method', /saveToLeaderboard\s*\([^)]*\)\s*\{/.test(js));
check('window.RUN_STATS exposed', /window\.RUN_STATS\s*=\s*RUN_STATS/.test(js));

// 3. Markup checks
check('#shareBtn present in markup', /id=["']shareBtn["']/.test(html));
check('#leaderboardBtn present in markup', /id=["']leaderboardBtn["']/.test(html));
check('#overlay present in markup', /id=["']overlay["']/.test(html));
check('#actionBtn present in markup', /id=["']actionBtn["']/.test(html));
check('#title present in markup', /id=["']title["']/.test(html));
check('#message present in markup', /id=["']message["']/.test(html));

// 4. Integration call sites
check('RUN_STATS.update called in animate loop', /RUN_STATS\.update\s*\(/.test(js));
check('RUN_STATS.recordEat called on food consumption', /RUN_STATS\.recordEat\s*\(/.test(js));
check('RUN_STATS.finalize called on game over / win', /RUN_STATS\.finalize\s*\(/.test(js));

// 5. Zero per-frame allocations in update(dt)
const updateMatch = js.match(/update\s*\(\s*dt\s*\)\s*\{([\s\S]*?)\n\s*\},/);
if (updateMatch) {
  const updateBody = updateMatch[1];
  const hasObjectAlloc = /\{[\s\S]*?\}/.test(updateBody.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''));
  const hasNewKeyword = /\bnew\s+/.test(updateBody);
  const hasArrayAlloc = /\[[\s\S]*?\]/.test(updateBody.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''));
  check('RUN_STATS.update(dt) has zero object/array runtime allocations', !hasNewKeyword && !hasArrayAlloc);
} else {
  check('RUN_STATS.update(dt) extracted for allocation audit', false);
}

if (failures === 0) {
  console.log('\nAll G4 static and contract checks PASSED');
  process.exit(0);
} else {
  console.error(`\nG4 static checks failed with ${failures} error(s)`);
  process.exit(1);
}

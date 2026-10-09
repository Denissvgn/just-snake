// tests/check_v10_contracts.mjs
// Static AST and contract verification for SPEC-V10: Attract mode

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-V10 Static & Contract Verification]');

if (!fs.existsSync(htmlPath)) {
  console.error(`FAIL: ${htmlPath} does not exist`);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');

// Extract inline script
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error('FAIL: No <script type="module"> tag found in snake-three.html');
  process.exit(1);
}
const code = scriptMatch[1];

// 1. Verify JS syntax
try {
  new Function(code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, ''));
  console.log('PASS: snake-three.html inline JavaScript syntax is valid');
} catch (err) {
  console.error('FAIL: Syntax error in snake-three.html:', err.message);
  process.exit(1);
}

function check(desc, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${desc} ${detail ? '(' + detail + ')' : ''}`);
    process.exit(1);
  }
  console.log(`PASS: ${desc}`);
}

// 2. Controller and core methods
check('ATTRACT controller defined', /const\s+ATTRACT\s*=\s*\{/.test(code));
check('buildAttract function present', /function\s+buildAttract\s*\(/.test(code));
check('startAttract function present', /function\s+startAttract\s*\(/.test(code));
check('stopAttract function present', /function\s+stopAttract\s*\(/.test(code));
check('attractStep function present', /function\s+attractStep\s*\(/.test(code));
check('updateAttract function present', /function\s+updateAttract\s*\(/.test(code));
check('resetAttract function present', /function\s+resetAttract\s*\(/.test(code));

// 3. Headless contracts & window hooks
check('window.ATTRACT exposed', /window\.ATTRACT\s*=\s*ATTRACT/.test(code));
check('window.startAttract exposed', /window\.startAttract\s*=\s*startAttract/.test(code));
check('window.stopAttract exposed', /window\.stopAttract\s*=\s*stopAttract/.test(code));
check('window.attractStep exposed', /window\.attractStep\s*=\s*attractStep/.test(code));
check('window.getAttractState exposed', /window\.getAttractState\s*=\s*getAttractState/.test(code));
check('window.resetAttract exposed', /window\.resetAttract\s*=\s*resetAttract/.test(code));

// 4. Memory hygiene: pre-allocated typed arrays
check('Pre-allocated typed array for flood fill', /gridVisited\s*:\s*new\s+Uint8Array\(/.test(code));

// 5. Game integration
check('boot initializes or starts attract mode', /buildAttract\s*\(/.test(code));
check('startGame stops attract mode', /stopAttract\s*\(/.test(code));
check('animate loops updateAttract', /updateAttract\s*\(/.test(code));
// B05/B08: demo presentation must not write rankings. Legacy score keys are read-only;
// a validated, eligible immutable player summary is inserted through finalization.
check('Demo score updates return before HUD or best changes',
  /function\s+updateScore\(\)\s*\{\s*if \(isDemoContext\(\)\) return;/.test(code) &&
  /function\s+updateBest\(\)\s*\{\s*if \(isDemoContext\(\)\) return;/.test(code));
check('Run finalization requires player ownership and is idempotent per runId',
  /ownsPlayer\(\)\s*\{[^}]*this\.run\.kind === 'player'[^}]*!isDemoContext\(\)/.test(code) &&
  /finalize\(reason\)\s*\{\s*if \(!this\.ownsPlayer\(\)\) return null;\s*if \(this\.lastSummary\?\.runId === this\.run\.runId\) return this\.lastSummary;/.test(code));
check('Only eligible finalized player summary enters validated scores-v2 storage',
  /const SCORE_KEY = 'threejs-snake-scores-v2'/.test(code) &&
  /if \(descriptor\.category !== 'practice'\) this\.saveToLeaderboard\(summary\)/.test(code) &&
  /saveToLeaderboard\(summary\)\s*\{\s*if \(!this\.ownsPlayer\(\) \|\| summary !== this\.lastSummary \|\| summary\.runId !== this\.run\.runId\) return false;\s*return SCORE_STORE\.insert\(summary\);/.test(code) &&
  /if \(!record \|\| record\.category==='practice' \|\| this\.seen\.has\(record\.runId\)\) return false;/.test(code) &&
  (code.match(/SCORE_STORE\.insert\(/g) || []).length === 1 &&
  /this\.memory\.records\.push\(record\);\s*this\.persist\(\);\s*return true;/.test(code) &&
  /localStorage\.setItem\(SCORE_KEY,\s*JSON\.stringify\(envelope\)\)/.test(code));
check('Legacy best and leaderboard keys are never written',
  !/localStorage\.setItem\(\s*['"]threejs-snake-(?:best|leaderboard)['"]/.test(code) &&
  /this\.read\('threejs-snake-best'/.test(code) && /this\.read\('threejs-snake-leaderboard'/.test(code));

console.log('\nAll V10 static and contract checks PASSED');

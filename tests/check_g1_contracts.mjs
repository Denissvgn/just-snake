// tests/check_g1_contracts.mjs
// Static AST and contract verification for SPEC-G1: Combo multiplier

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-G1 Static & Contract Verification]');

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
check('COMBO_FX controller defined', /const\s+COMBO_FX\s*=\s*\{/.test(code));
check('COMBO_FX defines onEat method', /onEat\s*\(/i.test(code) && /COMBO_FX[\s\S]*?onEat/.test(code));
check('COMBO_FX defines update method', /update\s*\(/i.test(code) && /COMBO_FX[\s\S]*?update/.test(code));
check('COMBO_FX defines getWindow method', /getWindow\s*\(/i.test(code) && /COMBO_FX[\s\S]*?getWindow/.test(code));
check('COMBO_FX defines reset method', /reset\s*\(/i.test(code) && /COMBO_FX[\s\S]*?reset/.test(code));

// 3. Headless contracts & window hooks
check('window.COMBO_FX exposed', /window\.COMBO_FX\s*=\s*COMBO_FX/.test(code));

// 4. Integration into scoring and animation loop
check('step uses COMBO_FX.onEat for scoring', /COMBO_FX\.onEat\s*\(/.test(code));
check('animate calls COMBO_FX.update', /COMBO_FX\.update\s*\(/.test(code));
check('COMBO_FX.update calls HUD_FX.setCombo', /HUD_FX\.setCombo\s*\(/.test(code));

// 5. Preservation of backward-compatible strings
check('Score format contains Score: ${score}', /Score:\s*\$\{score\}/.test(code) || /Score:\s*'\s*\+\s*score/.test(code));
check('Best format contains Best: ${best}', /Best:\s*\$\{best\}/.test(code) || /Best:\s*'\s*\+\s*best/.test(code));

console.log('\nAll G1 static and contract checks PASSED');

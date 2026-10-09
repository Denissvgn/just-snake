// tests/check_v12_contracts.mjs
// Static AST and contract verification for SPEC-V12: HUD design

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-V12 Static & Contract Verification]');

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
check('HUD_FX controller defined', /const\s+HUD_FX\s*=\s*\{/.test(code));
check('HUD_FX defines update method', /update\s*\(/i.test(code) && /HUD_FX[\s\S]*?update/.test(code));
check('HUD_FX defines setCombo method', /setCombo\s*\(/i.test(code) && /HUD_FX[\s\S]*?setCombo/.test(code));
check('HUD_FX defines reset method', /reset\s*\(/i.test(code) && /HUD_FX[\s\S]*?reset/.test(code));

// 3. Headless contracts & window hooks
check('window.HUD_FX exposed', /window\.HUD_FX\s*=\s*HUD_FX/.test(code));

// 4. HTML Elements & Structure
check('Speed meter track in HTML markup', /id=["']speedTrack["']/.test(html));
check('Speed meter fill in HTML markup', /id=["']speedFill["']/.test(html));
check('Speed level badge in HTML markup', /id=["']levelBadge["']/.test(html));
check('Combo wrapper in HTML markup', /id=["']comboWrapper["']/.test(html));
check('Combo fill in HTML markup', /id=["']comboFill["']/.test(html));
check('Selected-map controls help and accessible title help markup', /id=["']hint["']/.test(html) && /id=["']steeringHelp["']/.test(html) && /function refreshHelp\(/.test(code));

// 5. Integration into updateScore
check('updateScore calls HUD_FX.update', /HUD_FX\.update\s*\(/.test(code));

// 6. Preservation of backward-compatible strings
check('Score format contains Score: ${score}', /Score:\s*\$\{score\}/.test(code) || /Score:\s*'\s*\+\s*score/.test(code));
check('Best format contains Best: ${best}', /Best:\s*\$\{best\}/.test(code) || /Best:\s*'\s*\+\s*best/.test(code));

console.log('\nAll V12 static and contract checks PASSED');

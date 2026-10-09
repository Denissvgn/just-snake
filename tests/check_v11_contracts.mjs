// tests/check_v11_contracts.mjs
// Static AST and contract verification for SPEC-V11: High-tier extras

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-V11 Static & Contract Verification]');

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
check('HIGH_FX controller defined', /const\s+HIGH_FX\s*=\s*\{/.test(code));
check('buildHighFx function present', /function\s+buildHighFx\s*\(/.test(code));
check('updateHighFx function present', /function\s+updateHighFx\s*\(/.test(code));
check('applyHighQuality function present', /function\s+applyHighQuality\s*\(/.test(code));
check('resetHighFx function present', /function\s+resetHighFx\s*\(/.test(code));

// 3. Post-processing tilt-shift uniforms in COMP_FS
check('COMP_FS declares uTiltShift', /uniform\s+float\s+uTiltShift;/.test(code));
check('COMP_FS declares uFocusCenter', /uniform\s+float\s+uFocusCenter;/.test(code));
check('COMP_FS declares uFocusBand', /uniform\s+float\s+uFocusBand;/.test(code));
check('COMP_FS declares uBlurSpread', /uniform\s+float\s+uBlurSpread;/.test(code));

// 4. Inverted reflection setup
check('reflectionGroup instantiated', /reflectionGroup/.test(code));
check('reflectedSnake mesh present', /reflectedSnake/.test(code));

// 5. Headless contracts & window hooks
check('window.HIGH_FX exposed', /window\.HIGH_FX\s*=\s*HIGH_FX/.test(code));
check('window.applyHighQuality exposed', /window\.applyHighQuality\s*=\s*applyHighQuality/.test(code));
check('window.resetHighFx exposed', /window\.resetHighFx\s*=\s*resetHighFx/.test(code));

// 6. Tier integration
check('applyQuality invokes applyHighQuality', /applyHighQuality\(tier\)/.test(code) || /applyHighQuality\(quality\.tier\)/.test(code));

console.log('\nAll V11 static and contract checks PASSED');

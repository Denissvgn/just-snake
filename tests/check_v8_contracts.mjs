// tests/check_v8_contracts.mjs
// Static AST and contract verification for SPEC-V8: Skin liveliness

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-V8 Static & Contract Verification]');

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
check('SKIN_FX controller defined', /const\s+SKIN_FX\s*=\s*\{/.test(code));
check('buildSkinFx function present', /function\s+buildSkinFx\s*\(/.test(code));
check('updateSkinFx function present', /function\s+updateSkinFx\s*\(/.test(code));
check('applySkinQuality function present', /function\s+applySkinQuality\s*\(/.test(code));
check('resetSkinFx function present', /function\s+resetSkinFx\s*\(/.test(code));

// 3. Headless contracts & window hooks
check('window.SKIN_FX exposed', /window\.SKIN_FX\s*=\s*SKIN_FX/.test(code));
check('window.resetSkinFx exposed', /window\.resetSkinFx\s*=\s*resetSkinFx/.test(code));
check('window.setSkinScrollSpeed exposed', /window\.setSkinScrollSpeed\s*=\s*setSkinScrollSpeed/.test(code));
check('window.getSkinState exposed', /window\.getSkinState\s*=\s*getSkinState/.test(code));

// 4. Iridescence and physical material integration
check('Iridescence property configured on skin materials', /iridescence:\s*(?:0\.45|SKIN_FX\.iridescence)/.test(code));
check('iridescenceIOR configured', /iridescenceIOR:\s*(?:1\.33|SKIN_FX\.iridescenceIOR)/.test(code));
check('iridescenceThicknessRange configured', /iridescenceThicknessRange/.test(code));

// 5. Motion coupling and slither roll in emitRings
check('updateSkinFx updates texture matrix offset', /normalMap\.offset\.y\s*=\s*SKIN_FX\.scrollOffset/.test(code));
check('emitRings incorporates per-segment slither muscle roll', /rollAmp|thetaRoll|rollTorsion/.test(code));

// 6. Tier gating and reset lifecycle
check('applyQuality invokes applySkinQuality', /applySkinQuality\s*\(tier\)/.test(code));
check('resetGame invokes resetSkinFx', /resetGame[\s\S]*?resetSkinFx\(\)/.test(code));

console.log('\nAll V8 static and contract checks PASSED');

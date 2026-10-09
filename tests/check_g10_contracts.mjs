// tests/check_g10_contracts.mjs
// Static contract verification for SPEC-G10: Accessibility (A11y)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));
const content = fs.readFileSync(htmlPath, 'utf8');

console.log('[SPEC-G10 Static & Contract Verification]');

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.error(`FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

// 1. Script extraction & syntax validity
const scriptMatch = content.match(/<script type="module">([\s\S]*?)<\/script>/);
check('Module script present', Boolean(scriptMatch));
const code = scriptMatch ? scriptMatch[1] : '';

try {
  new Function(code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, ''));
  check('snake-three.html inline JavaScript syntax is valid', true);
} catch (err) {
  check('snake-three.html inline JavaScript syntax is valid', false, err.message);
}

// 2. A11Y Controller
check('A11Y controller defined', /const\s+A11Y\s*=\s*\{|let\s+A11Y\s*=\s*\{|var\s+A11Y\s*=\s*\{/.test(code));
check('Reduced motion handling present', /reducedMotion|prefers-reduced-motion/.test(code));
check('Colorblind palette mapping present', /colorblind|0x06b6d4|0xfbbf24/.test(code));
check('High contrast styling present in CSS', /\.high-contrast/.test(content));
check('Key remapping logic present', /keymap|ijkl|hjkl/i.test(code));

// 3. UI Controls in Settings Modal
check('Accessibility controls present in settings modal', /reducedMotion|colorblind|keymap|high-contrast/i.test(content));

// 4. Global Window Contracts
check('window.A11Y exposed', /window\.A11Y\s*=\s*A11Y/.test(code));
check('window.setReducedMotion exposed', /window\.setReducedMotion\s*=/.test(code));
check('window.setHighContrast exposed', /window\.setHighContrast\s*=/.test(code));
check('window.setColorblindMode exposed', /window\.setColorblindMode\s*=/.test(code));
check('window.setKeymap exposed', /window\.setKeymap\s*=/.test(code));
check('window.getA11yState exposed', /window\.getA11yState\s*=/.test(code));

if (failures > 0) {
  console.error(`\nTotal contract failures: ${failures}`);
  process.exit(1);
} else {
  console.log('\nAll G10 static and contract checks PASSED');
  process.exit(0);
}

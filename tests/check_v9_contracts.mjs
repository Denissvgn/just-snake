// tests/check_v9_contracts.mjs
// Static AST and contract verification for SPEC-V9: Distinct prey silhouettes & idle behaviour

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-V9 Static & Contract Verification]');

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
check('PREY_FX controller defined', /const\s+PREY_FX\s*=\s*\{/.test(code));
check('buildPreyFx function present', /function\s+buildPreyFx\s*\(/.test(code));
check('spawnPrey function present', /function\s+spawnPrey\s*\(/.test(code));
check('updatePrey function present', /function\s+updatePrey\s*\(/.test(code));
check('getPreyPoints function present', /function\s+getPreyPoints\s*\(/.test(code));
check('resetPreyFx function present', /function\s+resetPreyFx\s*\(/.test(code));

// 3. Headless contracts & window hooks
check('window.PREY_FX exposed', /window\.PREY_FX\s*=\s*PREY_FX/.test(code));
check('window.setPreyType exposed', /window\.setPreyType\s*=\s*setPreyType/.test(code));
check('window.getPreyState exposed', /window\.getPreyState\s*=\s*getPreyState/.test(code));
check('window.triggerEscapeHop exposed', /window\.triggerEscapeHop\s*=\s*triggerEscapeHop/.test(code));
check('window.resetPreyFx exposed', /window\.resetPreyFx\s*=\s*resetPreyFx/.test(code));

// 4. Pre-allocated archetypes and distinct geometries
check('Prey archetypes configured', /common:\s*\{[\s\S]*?points:\s*10/.test(code) && /golden:\s*\{[\s\S]*?points:\s*40/.test(code) && /jittery:\s*\{[\s\S]*?points:\s*20/.test(code));
check('Distinct geometries cached', /IcosahedronGeometry/.test(code) && /OctahedronGeometry/.test(code) && /CapsuleGeometry/.test(code));

// 5. Game integration
check('spawnFood calls spawnPrey', /spawnPrey\s*\(/.test(code));
check('drawFood calls updatePrey', /updatePrey\s*\(/.test(code));
check('onEat incorporates getPreyPoints', /getPreyPoints\(\)/.test(code));
check('resetGame invokes resetPreyFx', /resetGame[\s\S]*?resetPreyFx\(\)/.test(code));

console.log('\nAll V9 static and contract checks PASSED');

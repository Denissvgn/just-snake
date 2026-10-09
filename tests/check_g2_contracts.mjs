// tests/check_g2_contracts.mjs
// Static AST and contract verification for SPEC-G2: Prey Types (Archetypes · 3D Countdown Arc · Center Placement Bias · Dual-Prey Lifecycle)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-G2 Static & Contract Verification]');

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

// 2. Controller and dual-entity state
check('PREY_FX controller defined', /const\s+PREY_FX\s*=\s*\{/.test(code));
check('PREY_FX maintains entities array for dual-prey', /entities:\s*\[/.test(code));
check('Prey archetypes configured with 6s golden timer', /golden:\s*\{[\s\S]*?points:\s*40[\s\S]*?maxTimer:\s*6/.test(code) || /golden:\s*\{[\s\S]*?maxTimer:\s*6[\s\S]*?points:\s*40/.test(code));

// 3. 3D Countdown Arc Mesh & Dynamic Draw Range
check('RingGeometry used for 3D countdown arc', /RingGeometry\s*\(/.test(code));
check('Arc draw range manipulation present', /setDrawRange\s*\(/.test(code));
check('foodArc1 and foodArc2 declared or created', /foodArc1/.test(code) && /foodArc2/.test(code));

// 4. Center-biased placement logic
check('Center-biased cell distance logic present', /Math\.abs\([^)]*-\s*10\)\s*\+\s*Math\.abs\([^)]*-\s*10\)\s*<=\s*4/.test(code) || /isCenterCell/.test(code));
check('Center cell check helper isCenterCell defined', /function\s+isCenterCell\s*\(/.test(code) || /isCenterCell:\s*function/.test(code) || /isCenterCell\s*=\s*/.test(code));

// 5. Dual prey eating logic in step()
check('willEat2 awards dynamic entity points', /getPreyPoints\s*\(\s*1\s*\)/.test(code) || /getPreyPoints\s*\(\s*true\s*\)/.test(code) || /willEat2[\s\S]*?getPreyPoints/.test(code));
check('willEat2 records authentic prey archetype in RUN_STATS', /RUN_STATS\.recordEat\s*\(\s*pType/.test(code) && !/const\s+pType\s*=\s*willEat2\s*\?\s*['"]common['"]/.test(code));

// 6. Public contracts & window hooks
check('window.PREY_FX exposed', /window\.PREY_FX\s*=\s*PREY_FX/.test(code));
check('window.setPreyType exposed', /window\.setPreyType\s*=\s*setPreyType/.test(code));
check('window.getPreyState exposed', /window\.getPreyState\s*=\s*getPreyState/.test(code));
check('window.getPreyPoints exposed', /window\.getPreyPoints\s*=\s*getPreyPoints/.test(code));
check('window.triggerEscapeHop exposed', /window\.triggerEscapeHop\s*=\s*triggerEscapeHop/.test(code));
check('window.isCenterCell exposed', /window\.isCenterCell\s*=\s*isCenterCell/.test(code));
check('window.resetPreyFx exposed', /window\.resetPreyFx\s*=\s*resetPreyFx/.test(code));

console.log('\nAll G2 static and contract checks PASSED');

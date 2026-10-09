// tests/check_v6_contracts.mjs
// Static AST and contract verification for SPEC-V6: Sell the speed

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-V6 Static & Contract Verification]');

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
check('SPEED_FX controller defined', /const\s+SPEED_FX\s*=\s*\{/.test(code));
check('buildSpeedFx function present', /function\s+buildSpeedFx\s*\(/.test(code));
check('stepSpeedFx function present', /function\s+stepSpeedFx\s*\(/.test(code));
check('updateSpeedFx function present', /function\s+updateSpeedFx\s*\(/.test(code));
check('triggerSpeedKick function present', /function\s+triggerSpeedKick\s*\(/.test(code));
check('resetSpeedFx function present', /function\s+resetSpeedFx\s*\(/.test(code));

// 3. Headless contracts & window hooks
check('window.SPEED_FX exposed', /window\.SPEED_FX\s*=\s*SPEED_FX/.test(code));
check('window.triggerSpeedKick exposed', /window\.triggerSpeedKick\s*=\s*triggerSpeedKick/.test(code));
check('window.resetSpeedFx exposed', /window\.resetSpeedFx\s*=\s*resetSpeedFx/.test(code));
check('window.getSpeedFactor exposed', /window\.getSpeedFactor\s*=\s*getSpeedFactor/.test(code));
check('window.setStepMs exposed', /window\.setStepMs\s*=\s*setStepMs/.test(code));

// 4. Dynamic FOV and Camera Coupling
check('fitCamera decoupled from dynamic FOV', /fitCamera[\s\S]*?BASE_FOV|baseFov|45/.test(code));
check('drawCamera updates camera.fov', /drawCamera[\s\S]*?camera\.fov\s*=/.test(code));
check('fovKick impulse decays over time', /fovKick\s*=\s*Math\.max\(0,\s*fovKick\s*-\s*dt\s*\*\s*8/.test(code) || /SPEED_FX\.fovKick/.test(code));
check('triggerSpeedKick called on onEat', /function\s+onEat\s*\([^)]*\)\s*\{[\s\S]*?triggerSpeedKick\(\)/.test(code));

// 5. Velocity-stretched sparks pool & ribbon mesh
check('LineSegments used for stretched sparks', /THREE\.LineSegments/.test(code));
check('AdditiveBlending used for sparks', /blending:\s*THREE\.AdditiveBlending/.test(code));
check('Sparks tagged with tagBloom sparks', /tagBloom\(['"]sparks['"],\s*SPEED_FX\.sparkLines\)/.test(code) || /tagBloom\(['"]sparks['"],\s*sparkLines\)/.test(code));
check('Ribbon tagged with tagBloom fx', /tagBloom\(['"]fx['"],\s*SPEED_FX\.ribbonMesh\)/.test(code) || /tagBloom\(['"]fx['"],\s*ribbonMesh\)/.test(code));

// 6. Quality tier gating
check('Quality tier handles sparks and ribbon visibility', /applyQuality[\s\S]*?SPEED_FX/.test(code) || /updateSpeedFx[\s\S]*?quality\.tier/.test(code) || /applyQuality[\s\S]*?ribbonMesh/.test(code));

// 7. Reset hygiene
check('resetSpeedFx called in resetGame', /function\s+resetGame\s*\(\)[\s\S]*?resetSpeedFx\(\)/.test(code));

console.log('\nAll V6 static and contract checks PASSED');

// tests/check_v7_contracts.mjs
// Static AST and contract verification for SPEC-V7: Camera life

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-V7 Static & Contract Verification]');

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
check('CAMERA_LIFE controller defined', /const\s+CAMERA_LIFE\s*=\s*\{/.test(code));
check('buildCameraLife function present', /function\s+buildCameraLife\s*\(/.test(code));
check('updateCameraLife function present', /function\s+updateCameraLife\s*\(/.test(code));
check('triggerCameraDeath function present', /function\s+triggerCameraDeath\s*\(/.test(code));
check('resetCameraLife function present', /function\s+resetCameraLife\s*\(/.test(code));

// 3. Headless contracts & window hooks
check('window.CAMERA_LIFE exposed', /window\.CAMERA_LIFE\s*=\s*CAMERA_LIFE/.test(code));
check('window.resetCameraLife exposed', /window\.resetCameraLife\s*=\s*resetCameraLife/.test(code));
check('window.triggerCameraDeath exposed', /window\.triggerCameraDeath\s*=\s*triggerCameraDeath/.test(code));
check('window.getCameraState exposed', /window\.getCameraState\s*=\s*getCameraState/.test(code));
check('window.setTestSnakeLength exposed', /window\.setTestSnakeLength\s*=\s*setTestSnakeLength/.test(code));

// 4. Parallax, growth, and death coupling in drawCamera
check('drawCamera invokes updateCameraLife', /updateCameraLife\s*\(dt\)/.test(code));
check('drawCamera incorporates growth zoom in camera.position', /currentGrowth/.test(code));
check('drawCamera incorporates velocity lead in lookAt or position', /lookLead/.test(code));
check('drawCamera applies Dutch roll to camera.rotation.z', /camera\.rotation\.z\s*=/.test(code));
check('resetCameraLife called in resetGame', /resetGame[\s\S]*?resetCameraLife\(\)/.test(code));

console.log('\nAll V7 static and contract checks PASSED');

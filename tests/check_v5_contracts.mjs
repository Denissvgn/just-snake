import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const htmlPath = process.env.GAME || path.join(ROOT, 'snake-three.html');

if (!fs.existsSync(htmlPath)) {
  console.error('FAIL: snake-three.html not found at ' + htmlPath);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');

// 1. Extract script tag (<script type="module">)
const scriptMatch = html.match(/<script\s+type="module">([\s\S]*?)<\/script>/i);
if (!scriptMatch) {
  console.error('FAIL: Could not find <script> in snake-three.html');
  process.exit(1);
}

const jsCode = scriptMatch[1];

// 2. Syntax check for ES module
try {
  const tmpDir = process.env.TMPDIR || os.tmpdir();
  const tmpFile = path.join(tmpDir, `check-syntax-v5-${Date.now()}.mjs`);
  fs.writeFileSync(tmpFile, jsCode, 'utf8');
  execSync(`node --check "${tmpFile}"`, { stdio: 'pipe' });
  try { fs.unlinkSync(tmpFile); } catch (e) {}
  console.log('PASS: snake-three.html inline JavaScript syntax is valid');
} catch (err) {
  console.error('FAIL: Syntax error in snake-three.html JavaScript:', err.message);
  process.exit(1);
}

// 3. Check ARENA_FX identifiers
const requiredIdentifiers = [
  'ARENA_FX',
  'buildArenaFx',
  'updateArenaFx',
  'resetArenaFx',
  'stepArenaTrail',
  'triggerWallPulse'
];

for (const id of requiredIdentifiers) {
  const re = new RegExp(`\\b${id}\\b`);
  if (!re.test(jsCode)) {
    console.error(`FAIL: Missing required identifier '${id}' in snake-three.html`);
    process.exit(1);
  }
}
console.log('PASS: All required V5 functions and ARENA_FX controller present');

// 4. Verify composite shader includes uZoneTint uniform
if (!/uniform\s+vec3\s+uZoneTint\b/.test(jsCode) || !/uZoneTint:\s*\{\s*value:/.test(jsCode)) {
  console.error('FAIL: COMP_FS or compMat missing uZoneTint uniform');
  process.exit(1);
}
console.log('PASS: Composite shader COMP_FS includes uZoneTint uniform');

// 5. Check trail elevation 0.016 configured
if (!/0\.016/.test(jsCode)) {
  console.error('FAIL: Floor trail elevation 0.016 missing');
  process.exit(1);
}
console.log('PASS: Floor trail elevation 0.016 configured');

// 6. Check call sites: stepArenaTrail in step() and triggerWallPulse in startDeath()
if (!/stepArenaTrail\(/.test(jsCode) || !/triggerWallPulse\(/.test(jsCode)) {
  console.error('FAIL: Missing call sites for stepArenaTrail or triggerWallPulse');
  process.exit(1);
}
console.log('PASS: Call sites for stepArenaTrail and triggerWallPulse present');

// 7. Check selective bloom tagging for arena fx
const tagMatches = (jsCode.match(/tagBloom\(\s*['"]fx['"]/g) || []).length;
if (tagMatches < 2) {
  console.error('FAIL: tagBloom("fx", ...) must be called for arena trail and wall pulse pools');
  process.exit(1);
}
console.log('PASS: Arena fx registered with tagBloom("fx", ...)');

// 8. Check pool bounds and uZoneTint pre-tonemap order in COMP_FS
if (!/TRAIL_MAX:\s*24/.test(jsCode)) {
  console.error('FAIL: ARENA_FX.TRAIL_MAX must be 24');
  process.exit(1);
}
const compFsMatch = jsCode.match(/const COMP_FS = `([\s\S]*?)`;/);
if (compFsMatch) {
  const compCode = compFsMatch[1];
  const tintIdx = compCode.indexOf('uZoneTint');
  const acesIdx = compCode.indexOf('aces(');
  if (tintIdx === -1 || acesIdx === -1 || tintIdx >= acesIdx) {
    console.error('FAIL: uZoneTint must be multiplied before aces() tone mapping in COMP_FS');
    process.exit(1);
  }
}
console.log('PASS: Arena pool bounds verified and uZoneTint applied pre-tonemap');

console.log('\nAll V5 static and contract checks PASSED');

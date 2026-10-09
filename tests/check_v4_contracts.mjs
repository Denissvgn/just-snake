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
  const tmpFile = path.join(os.tmpdir(), `check-syntax-${Date.now()}.mjs`);
  fs.writeFileSync(tmpFile, jsCode, 'utf8');
  execSync(`node --check "${tmpFile}"`, { stdio: 'pipe' });
  fs.unlinkSync(tmpFile);
  console.log('PASS: snake-three.html inline JavaScript syntax is valid');
} catch (err) {
  console.error('FAIL: Syntax error in snake-three.html JavaScript:', err.message);
  process.exit(1);
}

// 3. Check EAT_FX identifiers
const requiredIdentifiers = [
  'EAT_FX',
  'buildEatFx',
  'updateEatFx',
  'resetEatFx',
  'onEat',
  'popScore'
];

for (const id of requiredIdentifiers) {
  const re = new RegExp(`\\b${id}\\b`);
  if (!re.test(jsCode)) {
    console.error(`FAIL: Missing required identifier '${id}' in snake-three.html`);
    process.exit(1);
  }
}
console.log('PASS: All required V4 functions and EAT_FX controller present');

// 4. Verify DOM floatScore element creation is removed
const hasDomFloatScore = /document\.createElement\(['"]div['"]\)[\s\S]{0,100}floatScore/.test(jsCode);
if (hasDomFloatScore) {
  console.error('FAIL: DOM floatScore element creation still exists in JavaScript');
  process.exit(1);
}
console.log('PASS: DOM floatScore element creation removed; world-space score sprite used');

// 5. Check particle custom shader attributes
if (!/pSize/.test(jsCode) || !/pAlpha/.test(jsCode)) {
  console.error('FAIL: Missing pSize or pAlpha attribute in particle system');
  process.exit(1);
}
console.log('PASS: Particle system includes pSize and pAlpha attributes');

// 6. Check shockwave ring floor height
if (!/0\.025/.test(jsCode)) {
  console.error('FAIL: Ground shockwave floor elevation 0.025 missing');
  process.exit(1);
}
console.log('PASS: Ground shockwave floor elevation 0.025 configured');

console.log('\nAll V4 static and contract checks PASSED');

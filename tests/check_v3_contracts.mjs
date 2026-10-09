import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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

// 3. Check DEATH config and functions
const requiredIdentifiers = [
  'DEATH',
  'buildDeathPool',
  'startDeath',
  'updateDeath',
  'endDeath',
  'showDeathOverlay'
];

for (const id of requiredIdentifiers) {
  const re = new RegExp(`\\b${id}\\b`);
  if (!re.test(jsCode)) {
    console.error(`FAIL: Missing required identifier '${id}' in snake-three.html`);
    process.exit(1);
  }
}
console.log('PASS: All required V3 functions and DEATH object present');

// 4. Check BLOOM_TAGS fx group
if (!/fx\s*:\s*true/.test(jsCode)) {
  console.error("FAIL: Missing 'fx: true' in BLOOM_TAGS");
  process.exit(1);
}
console.log('PASS: BLOOM_TAGS.fx is present');

// 5. Check determinism: no Math.random in V3 death functions
const deathBlockMatch = jsCode.match(/(?:function\s+startDeath[\s\S]*?function\s+endDeath[\s\S]*?\})/);
if (deathBlockMatch && /Math\.random/.test(deathBlockMatch[0])) {
  console.error('FAIL: SPEC-V3 §3.4 violation: Math.random() found in death routines');
  process.exit(1);
}
console.log('PASS: Zero Math.random() in V3 death logic (deterministic)');

// 6. Check tests/test_death.mjs
const deathTestPath = path.join(ROOT, 'tests', 'test_death.mjs');
if (!fs.existsSync(deathTestPath)) {
  console.error('FAIL: tests/test_death.mjs not found');
  process.exit(1);
}

const testContent = fs.readFileSync(deathTestPath, 'utf8');
try {
  execSync(`node --check "${deathTestPath}"`, { stdio: 'pipe' });
  console.log('PASS: tests/test_death.mjs syntax is valid');
} catch (err) {
  console.error('FAIL: Syntax error in tests/test_death.mjs:', err.message);
  process.exit(1);
}

console.log('\nALL V3 CONTRACT CHECKS PASSED.');

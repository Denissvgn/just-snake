// tests/check_g9_contracts.mjs
// Static contract verification for SPEC-G9: Settings & Pause Menu

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));
const content = fs.readFileSync(htmlPath, 'utf8');

console.log('[SPEC-G9 Static & Contract Verification]');

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

// 2. SETTINGS Controller
check('SETTINGS controller defined', /const\s+SETTINGS\s*=\s*\{|let\s+SETTINGS\s*=\s*\{|var\s+SETTINGS\s*=\s*\{/.test(code));
// DEC06 supersedes manual-high defaults: requested quality defaults Auto.
check('SETTINGS requested quality defaults Auto', /const\s+SETTINGS\s*=\s*\{\s*quality\s*:\s*['"]auto['"]/.test(code));
check('Settings schemaVersion2 envelope is present', /schemaVersion:\s*2,\s*values:\s*this\.requested\(\)/.test(code));
check('Settings cannot mutate mode wrap', !/MODES\[currentMode\]\.wrap\s*=/.test(code));
check('SETTINGS handles bloomOn property', /bloomOn\s*:\s*(?:true|false)/.test(code));
check('SETTINGS handles aa property', /aa\s*:\s*['"](?:smaa|fxaa|none)['"]/.test(code));
check('SETTINGS handles bodyMode property', /bodyMode\s*:\s*['"](?:tube|segments)['"]/.test(code));
check('SETTINGS handles sound property', /sound\s*:\s*(?:true|false)/.test(code));
check('Settings persistence via localStorage present', /threejs-snake-settings|localStorage\.getItem\(.*settings/.test(code));

// 3. UI Elements in markup
check('Settings button #settingsBtn present in markup', /id=["']settingsBtn["']/.test(content));
check('Settings modal or panel markup present', /id=["']settingsModal["']|id=["']settingsPanel["']|class=["'][^"']*settings-dialog[^"']*["']/.test(content));

// 4. Live Synchronization & Input handling
check('applySetting or setting change method present', /applySetting\s*\(|set\s*\(\s*key\s*,\s*val\s*\)/.test(code));
check('Escape key handles pause or settings toggle', /key\s*===\s*['"]escape['"]|e\.code\s*===\s*['"]Escape['"]/i.test(code));

// 5. Global Window Contracts
check('window.SETTINGS exposed', /window\.SETTINGS\s*=\s*SETTINGS/.test(code));
check('window.openSettings exposed', /window\.openSettings\s*=/.test(code));
check('window.closeSettings exposed', /window\.closeSettings\s*=/.test(code));
check('window.getSettings exposed', /window\.getSettings\s*=/.test(code));
check('window.applySetting exposed', /window\.applySetting\s*=/.test(code));

if (failures > 0) {
  console.error(`\nTotal contract failures: ${failures}`);
  process.exit(1);
} else {
  console.log('\nAll G9 static and contract checks PASSED');
  process.exit(0);
}

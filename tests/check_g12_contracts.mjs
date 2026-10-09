// tests/check_g12_contracts.mjs
// Static AST and contract verification for SPEC-G12: Mobile Experience

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-G12 Static & Contract Verification]');

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

// 2. CSS touch-action and styling
check('Canvas CSS enforces touch-action: none', /canvas\s*\{[^}]*touch-action:\s*none/i.test(html));
check('Radial pad styling present in CSS', /\.radial-pad\b/.test(html) && /\.radial-knob\b/.test(html));
check('Radial pip styling present in CSS', /\.radial-pip\b/.test(html));

// 3. Markup elements
check('Radial pad DOM markup present', /id=["']radialPad["']/.test(html));
check('Fullscreen button DOM markup present', /id=["']fullscreenBtn["']/.test(html));

// 4. MOBILE controller & logic
check('MOBILE controller defined', /const\s+MOBILE\s*=\s*\{|var\s+MOBILE\s*=\s*\{|let\s+MOBILE\s*=\s*\{/.test(code));
check('Radial pad show/hide logic present', /showRadialPad|hideRadialPad/.test(code));
check('Haptic vibration logic present', /navigator\.vibrate/.test(code));
check('Fullscreen toggle logic present', /requestFullscreen|webkitRequestFullscreen/.test(code));

// 5. Hooks into gameplay lifecycle
check('Haptics hooked into gameOver', /gameOver[\s\S]*?(?:vibrate|triggerHaptic)/.test(code) || /(?:triggerHaptic|vibrate)[\s\S]*?gameOver/.test(code));
check('Haptics hooked into eat', /(?:onEat|step)[\s\S]*?(?:vibrate|triggerHaptic)/.test(code));

// 6. Global Window Contracts
check('window.MOBILE exposed', /window\.MOBILE\s*=\s*MOBILE/.test(code));
check('window.showRadialPad exposed', /window\.showRadialPad\s*=/.test(code));
check('window.hideRadialPad exposed', /window\.hideRadialPad\s*=/.test(code));
check('window.triggerHaptic exposed', /window\.triggerHaptic\s*=/.test(code));
check('window.toggleFullscreen exposed', /window\.toggleFullscreen\s*=/.test(code));
check('window.getMobileState exposed', /window\.getMobileState\s*=/.test(code));

console.log('\nAll G12 static and contract checks PASSED');
process.exit(0);

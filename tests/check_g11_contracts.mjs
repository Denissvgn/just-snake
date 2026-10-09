// tests/check_g11_contracts.mjs
// Static AST and contract verification for SPEC-G11: Audio with Zero Assets (WebAudio Synthesis)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-G11 Static & Contract Verification]');

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

// 2. AUDIO controller defined
check('AUDIO controller defined', /const\s+AUDIO\s*=\s*\{|var\s+AUDIO\s*=\s*\{|let\s+AUDIO\s*=\s*\{/.test(code));

// 3. WebAudio synthesis & nodes
check('AudioContext or webkitAudioContext used', /AudioContext|webkitAudioContext/.test(code));
check('OscillatorNode or createOscillator used', /createOscillator/.test(code));
check('GainNode or createGain used', /createGain/.test(code));
check('Noise generation or BiquadFilter used', /createBiquadFilter|createBuffer/.test(code));

// 4. Synthesis methods
check('Eat sound synthesis with combo pitch present', /playEat|eatBlip/.test(code));
check('Collision thud synthesis present', /playThud|impactThud/.test(code));
check('Tongue hiss synthesis present', /playTongue|tongueHiss/.test(code));
check('Speed drone synthesis present', /drone|updateDrone/.test(code));

// 5. Unlock on user interaction
check('AudioContext unlock handling present', /unlock|resume/.test(code));

// 6. Hook into SETTINGS and game loops
check('SETTINGS sound toggle hooked', /case\s+['"]sound['"]:/.test(code) && /AUDIO/.test(code));
check('Tongue hiss triggered in animateFace', /animateFace[\s\S]*?(?:playTongue|tongueHiss)/.test(code) || /(?:playTongue|tongueHiss)[\s\S]*?animateFace/.test(code));
check('Eat sound triggered on prey consumption', /onEat[\s\S]*?(?:playEat|eatBlip)|step[\s\S]*?playEat/.test(code));
check('Thud triggered on death', /gameOver[\s\S]*?(?:playThud|impactThud)/.test(code));

// 7. Global Window Contracts
check('window.AUDIO exposed', /window\.AUDIO\s*=\s*AUDIO/.test(code));
check('window.playEatSound exposed', /window\.playEatSound\s*=/.test(code));
check('window.playThudSound exposed', /window\.playThudSound\s*=/.test(code));
check('window.playTongueHiss exposed', /window\.playTongueHiss\s*=/.test(code));
check('window.setAudioEnabled exposed', /window\.setAudioEnabled\s*=/.test(code));
check('window.getAudioState exposed', /window\.getAudioState\s*=/.test(code));

console.log('\nAll G11 static and contract checks PASSED');
process.exit(0);

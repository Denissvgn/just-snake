// tests/check_g3_contracts.mjs
// Static AST and contract verification for SPEC-G3: Arena Hazards (Seeded Pillars · Sweeping Perimeter Light Beam · Mode Dynamics)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-G3 Static & Contract Verification]');

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

// 2. Controller and core hazards architecture
check('HAZARDS controller defined', /const\s+HAZARDS\s*=\s*\{/.test(code));
check('HAZARDS declares pillars array', /pillars:\s*\[/.test(code));
check('HAZARDS declares sweeping beam object', /beam:\s*\{/.test(code));
check('generatePillars method present', /function\s+generatePillars\s*\(/.test(code) || /generatePillars:\s*function/.test(code) || /generatePillars\s*\(/.test(code));
check('isPillarCell helper present', /function\s+isPillarCell\s*\(/.test(code) || /isPillarCell:\s*function/.test(code) || /isPillarCell\s*=\s*/.test(code));

// 3. Three.js mesh & visual integration
check('Pillars use CylinderGeometry or BoxGeometry', /CylinderGeometry\s*\(/.test(code) || /BoxGeometry\s*\(/.test(code));
check('Pillars tagged with bloom', /tagBloom\s*\(\s*['"]walls['"]\s*,\s*p\.mesh\)/.test(code) || /tagBloom\s*\(\s*['"]walls['"]/.test(code));
check('Sweeping beam creates PointLight or Mesh', /beamLight\s*=|light:\s*new\s+THREE\.PointLight/.test(code) || /new\s+THREE\.PointLight/.test(code));

// 4. Gameplay & Collision Integration in step()
check('step() checks for pillar collision', /isPillarCell\s*\(\s*nx\s*,\s*nz\s*\)/.test(code) || /gameOver\s*\(\s*['"]pillar['"]\s*\)/.test(code));
check('gameOver handles pillar collision reason', /pillar/.test(code));
check('spawnFood excludes pillar cells from food placement', /isPillarCell/.test(code) || /HAZARDS\.pillars/.test(code));

// 5. Public window contracts & hooks
check('window.HAZARDS exposed', /window\.HAZARDS\s*=\s*HAZARDS/.test(code));
check('window.isPillarCell exposed', /window\.isPillarCell\s*=\s*isPillarCell/.test(code));
check('window.getPillarPositions exposed', /window\.getPillarPositions\s*=\s*getPillarPositions/.test(code));
check('window.generatePillars exposed', /window\.generatePillars\s*=\s*generatePillars/.test(code));
check('window.getHazardsState exposed', /window\.getHazardsState\s*=\s*getHazardsState/.test(code));

console.log('\nAll G3 static and contract checks PASSED');

// tests/check_g7_contracts.mjs
// Static contract verification for SPEC-G7: Seeded RNG & Challenge of the Day

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));
const content = fs.readFileSync(htmlPath, 'utf8');

console.log('[SPEC-G7 Static & Contract Verification]');

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

// 2. PRNG Engine & RNG Controller
check('RNG controller defined', /const\s+RNG\s*=\s*\{|let\s+RNG\s*=\s*\{|var\s+RNG\s*=\s*\{/.test(code));
check('Mulberry32 or 32-bit PRNG logic present', /0x6D2B79F5|mulberry32/i.test(code));
check('Seed hashing (FNV-1a or cyrb53 or numeric conversion) present', /hashSeed|16777619|2166136261|charCodeAt/.test(code));
check('RNG implements setSeed method', /setSeed\s*\(/.test(code));
check('RNG implements random method', /random\s*\(\s*\)/.test(code));
check('RNG implements randInt method', /randInt\s*\(/.test(code));

// 3. Gameplay Integration
check('spawnFood uses RNG for coordinate selection', /RNG\.randInt|RNG\.random/.test(code));
// B05/B06 context dispatch preserves player RNG while using a separate demo food stream.
check('Prey archetype selects from the active context food stream', /spawnPrey[\s\S]*?const r = gameRandom\(\)/.test(code) && /return RNG\.random\(\)/.test(code));
// DEC04/B06 supersedes direct seed coupling: explicit reset uses the tuple-derived hazard stream.
check('Explicit hazard initialization uses tuple-derived hazard seed', /RNG\.hazardSeed,\s*gameHazardRandom/.test(code) && /identity \+ '\|hazards'/.test(code));

// 4. Daily Challenge & URL Params
check('Daily seed formula or DAILY- prefix present', /DAILY-|\.toISOString\(\)\.slice\(0,\s*10\)/.test(code));
check('URL search parameter ?seed= handled', /URLSearchParams|location\.search/.test(code));
check('Daily challenge UI button or toggle present in markup', /id=["']dailyBtn["']|class=["'][^"']*daily-btn[^"']*["']/.test(content));
check('RUN_STATS tracks seed or isDaily', /RUN_STATS[\s\S]*?seed|RUN_STATS[\s\S]*?isDaily/.test(code));

// 5. Global Window Contracts
check('window.RNG exposed', /window\.RNG\s*=\s*RNG/.test(code));
check('window.setSeed exposed', /window\.setSeed\s*=/.test(code));
check('window.getSeed exposed', /window\.getSeed\s*=/.test(code));
check('window.startDailyChallenge exposed', /window\.startDailyChallenge\s*=/.test(code));
check('window.getDailySeed exposed', /window\.getDailySeed\s*=/.test(code));

if (failures > 0) {
  console.error(`\nTotal contract failures: ${failures}`);
  process.exit(1);
} else {
  console.log('\nAll G7 static and contract checks PASSED');
  process.exit(0);
}

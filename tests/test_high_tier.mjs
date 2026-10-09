// tests/test_high_tier.mjs
// Dynamic Puppeteer acceptance tests for SPEC-V11: High-tier extras

import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = (process.env.GAME || path.resolve(__dirname, '../snake-three.html'));

console.log('[SPEC-V11 Acceptance Run]');

let failures = 0;
function pass(desc, val = '') {
  console.log(`  PASS  ${desc}${val !== '' ? ' — ' + val : ''}`);
}
function fail(desc, val = '') {
  console.error(`  FAIL  ${desc}${val !== '' ? ' — ' + val : ''}`);
  failures++;
}

// 1. Static checks
const html = fs.readFileSync(htmlPath, 'utf8');
if (html.includes('const HIGH_FX =') || html.includes('HIGH_FX =')) {
  pass('HIGH_FX controller in source');
} else {
  fail('HIGH_FX controller missing in source');
}

if (html.includes('uniform float uTiltShift;')) {
  pass('COMP_FS declares uTiltShift');
} else {
  fail('COMP_FS missing uTiltShift');
}

if (html.includes('function buildHighFx')) {
  pass('buildHighFx function present');
} else {
  fail('buildHighFx function missing');
}

// 2. Dynamic tests with Puppeteer
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader-webgl']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700 });

  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto('http://localhost:8099/snake-three.html', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));

  // Check HIGH_FX initialized
  const highState = await page.evaluate(() => {
    if (typeof window.HIGH_FX === 'undefined') return null;
    return {
      active: window.HIGH_FX.ON,
      reflection: window.HIGH_FX.reflection,
      tiltShift: window.HIGH_FX.tiltShift,
      floorGloss: window.HIGH_FX.floorGloss,
      hasGroup: !!window.HIGH_FX.reflectionGroup,
      groupVisible: window.HIGH_FX.reflectionGroup ? window.HIGH_FX.reflectionGroup.visible : false,
      groundOpacity: window.groundMesh ? window.groundMesh.material.opacity : (window.ground ? window.ground.material.opacity : null),
      groundRoughness: window.groundMesh ? window.groundMesh.material.roughness : (window.ground ? window.ground.material.roughness : null),
      tiltShiftUniform: window.compMat && window.compMat.uniforms.uTiltShift ? window.compMat.uniforms.uTiltShift.value : null
    };
  });

  if (highState && highState.active) {
    pass('High-tier extras controller initialized');
  } else {
    fail('High-tier extras controller failed to initialize', JSON.stringify(highState));
  }

  // Verify High Tier Defaults
  if (highState && highState.reflection && highState.groupVisible) {
    pass('Reflection group active and visible on high tier', `visible: ${highState.groupVisible}`);
  } else {
    fail('Reflection group not active on high tier', JSON.stringify(highState));
  }

  if (highState && highState.tiltShift && highState.tiltShiftUniform === 1.0) {
    pass('Tilt-shift active in composite uniforms on high tier', `uTiltShift: ${highState.tiltShiftUniform}`);
  } else {
    fail('Tilt-shift not active on high tier', JSON.stringify(highState));
  }

  if (highState && highState.groundOpacity !== null && highState.groundOpacity <= 0.95) {
    pass('Ground plane opacity tuned for reflection transparency', `opacity: ${highState.groundOpacity}`);
  } else {
    fail('Ground plane opacity not tuned on high tier', JSON.stringify(highState));
  }

  if (highState && highState.groundRoughness !== null && highState.groundRoughness <= 0.60) {
    pass('Ground plane polished gloss active', `roughness: ${highState.groundRoughness}`);
  } else {
    fail('Ground plane roughness not tuned on high tier', JSON.stringify(highState));
  }

  // Verify Reflected Snake Geometry (negative Y coordinates)
  const refGeoCheck = await page.evaluate(() => {
    if (!window.HIGH_FX || !window.HIGH_FX.reflectedSnake) return null;
    const pos = window.HIGH_FX.reflectedSnake.geometry.attributes.position;
    if (!pos || pos.count === 0) return null;
    let maxNegY = 0;
    let hasNegY = false;
    for (let i = 0; i < Math.min(pos.count, 64); i++) {
      const y = pos.getY(i);
      if (y < -0.05) {
        hasNegY = true;
        if (y < maxNegY) maxNegY = y;
      }
    }
    return { hasNegY, maxNegY, count: pos.count };
  });

  if (refGeoCheck && refGeoCheck.hasNegY) {
    pass('Reflected snake vertex buffer mirrors tube with y < 0', `deepest y: ${refGeoCheck.maxNegY.toFixed(2)}, verts: ${refGeoCheck.count}`);
  } else {
    fail('Reflected snake vertex buffer missing negative Y coords', JSON.stringify(refGeoCheck));
  }

  // Verify Reflected Snake Draw Range matches Tube Mesh Draw Range
  const drawRangeCheck = await page.evaluate(() => {
    if (!window.HIGH_FX || !window.HIGH_FX.reflectedSnake || !window.tubeMesh) return null;
    const refRange = window.HIGH_FX.reflectedSnake.geometry.drawRange;
    const tubeRange = window.tubeMesh.geometry.drawRange;
    return {
      refStart: refRange.start,
      refCount: refRange.count,
      tubeStart: tubeRange.start,
      tubeCount: tubeRange.count,
      matched: refRange.start === tubeRange.start && refRange.count === tubeRange.count
    };
  });

  if (drawRangeCheck && drawRangeCheck.matched) {
    pass('Reflected snake draw range matches tube mesh draw range', `start: ${drawRangeCheck.refStart}, count: ${drawRangeCheck.refCount}`);
  } else {
    fail('Reflected snake draw range mismatch with tube mesh', JSON.stringify(drawRangeCheck));
  }

  // Verify Reflected Prey Proxy
  const refPreyCheck = await page.evaluate(() => {
    if (!window.HIGH_FX || !window.HIGH_FX.reflectedPrey || !window.foodMesh) return null;
    const preyY = window.HIGH_FX.reflectedPrey.position.y;
    const foodY = window.foodMesh.position.y;
    return { preyY, foodY, mirrored: Math.abs(preyY - (-foodY)) < 0.05 };
  });

  if (refPreyCheck && refPreyCheck.mirrored) {
    pass('Reflected prey mirrors food position with y < 0', `food y: ${refPreyCheck.foodY} vs ref y: ${refPreyCheck.preyY}`);
  } else {
    fail('Reflected prey position mismatch', JSON.stringify(refPreyCheck));
  }

  // Switch to Balanced Tier
  const balState = await page.evaluate(() => {
    window.applyQuality('balanced');
    return {
      reflection: window.HIGH_FX.reflection,
      tiltShift: window.HIGH_FX.tiltShift,
      groupVisible: window.HIGH_FX.reflectionGroup ? window.HIGH_FX.reflectionGroup.visible : false,
      groundOpacity: window.groundMesh ? window.groundMesh.material.opacity : (window.ground ? window.ground.material.opacity : null),
      groundRoughness: window.groundMesh ? window.groundMesh.material.roughness : (window.ground ? window.ground.material.roughness : null),
      tiltShiftUniform: window.compMat && window.compMat.uniforms.uTiltShift ? window.compMat.uniforms.uTiltShift.value : null
    };
  });

  if (balState && !balState.reflection && !balState.groupVisible) {
    pass('Balanced tier deactivates reflection group and sets visible to false');
  } else {
    fail('Balanced tier failed to deactivate reflection', JSON.stringify(balState));
  }

  if (balState && !balState.tiltShift && balState.tiltShiftUniform === 0.0) {
    pass('Balanced tier zeroes tilt-shift uniform', `uTiltShift: ${balState.tiltShiftUniform}`);
  } else {
    fail('Balanced tier failed to zero tilt-shift', JSON.stringify(balState));
  }

  if (balState && balState.groundOpacity !== null && balState.groundOpacity >= 0.99) {
    pass('Balanced tier restores opaque ground plane', `opacity: ${balState.groundOpacity}`);
  } else {
    fail('Balanced tier failed to restore ground opacity', JSON.stringify(balState));
  }

  // Switch to Low Tier
  const lowState = await page.evaluate(() => {
    window.applyQuality('low');
    return {
      reflection: window.HIGH_FX.reflection,
      tiltShift: window.HIGH_FX.tiltShift,
      groupVisible: window.HIGH_FX.reflectionGroup ? window.HIGH_FX.reflectionGroup.visible : false
    };
  });

  if (lowState && !lowState.reflection && !lowState.groupVisible) {
    pass('Low tier deactivates all high-tier extras');
  } else {
    fail('Low tier failed to deactivate extras', JSON.stringify(lowState));
  }

  // Restore High Tier
  const restoredHigh = await page.evaluate(() => {
    window.applyQuality('high');
    return {
      reflection: window.HIGH_FX.reflection,
      tiltShift: window.HIGH_FX.tiltShift,
      groupVisible: window.HIGH_FX.reflectionGroup ? window.HIGH_FX.reflectionGroup.visible : false,
      tiltShiftUniform: window.compMat && window.compMat.uniforms.uTiltShift ? window.compMat.uniforms.uTiltShift.value : null
    };
  });

  if (restoredHigh && restoredHigh.reflection && restoredHigh.groupVisible && restoredHigh.tiltShiftUniform === 1.0) {
    pass('Restoring high tier cleanly reactivates reflection and tilt-shift');
  } else {
    fail('Failed to restore high tier', JSON.stringify(restoredHigh));
  }

  // Reset Cleanliness
  const resetState = await page.evaluate(() => {
    window.resetHighFx();
    return {
      active: window.HIGH_FX.ON,
      groupVisible: window.HIGH_FX.reflectionGroup ? window.HIGH_FX.reflectionGroup.visible : false
    };
  });

  if (resetState && resetState.active) {
    pass('Reset preserves clean controller state');
  } else {
    fail('Reset failed to preserve clean state', JSON.stringify(resetState));
  }

  if (pageErrors.length > 0) {
    fail('Browser reported unexpected errors', pageErrors.join('; '));
  }

} catch (err) {
  fail('Dynamic test execution threw exception', err.stack);
} finally {
  if (browser) await browser.close();
}

console.log(`\nAll high-tier extras suite checks complete. Failures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);

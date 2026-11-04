import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playwrightSpecPattern, assertPlaywrightPartition } from '../helpers/playwright-spec-pattern.mjs';

test('Playwright partition patterns select exact escaped repository files without suffix collisions', () => {
  const exact = new RegExp(playwrightSpecPattern('accessibility.spec.mjs'));
  for (const file of ['tests/release/accessibility.spec.mjs', '/workspace/tests/release/accessibility.spec.mjs']) assert.equal(exact.test(file), true);
  for (const file of ['/workspace/tests/release/presentation-accessibility.spec.mjs',
    '/workspace/tests/release/accessibilityXspecYmjs', '/workspace/tests/release/accessibility.spec.mjs.bak',
    '/workspace/other/accessibility.spec.mjs', '/workspace/tests/release/nested/accessibility.spec.mjs']) assert.equal(exact.test(file), false);
  const unusual = new RegExp(playwrightSpecPattern('a+[1].spec.mjs'));
  assert.equal(unusual.test('/workspace/tests/release/a+[1].spec.mjs'), true);
  assert.equal(unusual.test('/workspace/tests/release/aa1.spec.mjs'), false);
  for (const file of [null, '', '../accessibility.spec.mjs', 'nested/accessibility.spec.mjs', 'a.js']) assert.throws(() => playwrightSpecPattern(file));
});

test('Passing raw partition reports still reject extra files, different roots and empty selections', () => {
  const root = '/workspace/tests/release';
  const report = files => ({ config: { rootDir: root }, suites: [{ suites: [{ specs: files.map(file => ({ file })) }] }] });
  assert.deepEqual(assertPlaywrightPartition(report(['accessibility.spec.mjs']), 'accessibility.spec.mjs', root),
    { spec: 'accessibility.spec.mjs', discoveredSpecs: 1 });
  for (const files of [[], ['presentation-accessibility.spec.mjs'],
    ['accessibility.spec.mjs', 'presentation-accessibility.spec.mjs'], ['nested/accessibility.spec.mjs']]) {
    assert.throws(() => assertPlaywrightPartition(report(files), 'accessibility.spec.mjs', root));
  }
  assert.throws(() => assertPlaywrightPartition(report(['accessibility.spec.mjs']), 'accessibility.spec.mjs', '/other/root'));
});

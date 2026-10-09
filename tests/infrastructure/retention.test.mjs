import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, BROWSER_PATH } from '../helpers/config.mjs';
import { runWorker } from '../helpers/process.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function attachments(report) {
  const found = [];
  const visit = suite => {
    for (const spec of suite.specs || []) for (const test of spec.tests || []) for (const result of test.results || []) {
      for (const attachment of result.attachments || []) if (attachment.path) found.push(attachment.path);
    }
    for (const nested of suite.suites || []) visit(nested);
  };
  visit(report); return found;
}

test('Later engine/spec invocations retain every file linked by earlier partition JSON', { timeout: 60000 }, async () => {
  const base = path.join(ROOT, '.artifacts/tasks/A01/retention-probe');
  await fs.mkdir(base, { recursive: true });
  const evidence = { invocations: [], filesVerified: [] };
  async function invocation() {
    const worker = await runWorker(process.execPath, [path.join(ROOT, 'scripts/run-tests.mjs'), 'release', '--only=A01 redirects'], {
      timeoutMs: 25000, cwd: ROOT,
      env: { ...process.env, BASE_URL: 'http://127.0.0.1:9/', TEST_ARTIFACTS: base, PLAYWRIGHT_BROWSERS_PATH: BROWSER_PATH }
    });
    assert.equal(worker.timedOut, false); assert.equal(worker.exitCode, 0, worker.output.toString());
    const report = JSON.parse(await fs.readFile(path.join(base, 'release-results.json')));
    assert.equal(report.passed, true);
    const immutableReport = path.join(report.invocationDirectory, 'release-results.json');
    assert.deepEqual(JSON.parse(await fs.readFile(immutableReport)), report);
    evidence.invocations.push({ directory: report.invocationDirectory, report: immutableReport });
    return report;
  }
  const first = await invocation();
  const immutable = new Map();
  for (const check of first.checks.filter(check => check.caseResults)) {
    const jsonPath = path.join(check.evidence, 'playwright-results.json');
    const jsonBytes = await fs.readFile(jsonPath); immutable.set(jsonPath, hash(jsonBytes));
    const files = attachments(JSON.parse(jsonBytes));
    assert.ok(files.some(file => file.endsWith('trace.zip')), `${check.name}: trace exists`);
    assert.ok(files.some(file => file.endsWith('.png')), `${check.name}: screenshot exists`);
    for (const file of files) {
      assert.ok(file.startsWith(first.invocationDirectory), `Evidence scoped to invocation: ${file}`);
      immutable.set(file, hash(await fs.readFile(file)));
    }
  }
  assert.equal(first.checks.filter(check => check.caseResults).length, 3);
  const second = await invocation();
  assert.notEqual(first.invocationDirectory, second.invocationDirectory);
  for (const [file, digest] of immutable) {
    assert.equal(hash(await fs.readFile(file)), digest, `Retained unchanged after later invocation: ${file}`);
    evidence.filesVerified.push({ file, sha256: digest, retained: true });
  }
  evidence.passed = true;
  await fs.writeFile(path.join(base, 'retention-result.json'), JSON.stringify(evidence, null, 2));
});

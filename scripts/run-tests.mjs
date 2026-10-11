import {acceptanceIds, presentationAttachments} from './presentation-report.mjs';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import {cleanupFixture} from '../tests/infrastructure/fixture-ownership.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runWorker, evidenceFailed } from '../tests/helpers/process.mjs';
import { playwrightSpecPattern, assertPlaywrightPartition } from '../tests/helpers/playwright-spec-pattern.mjs';
import { createServer } from './serve.mjs';
import { node24, ROOT, GAME, ARTIFACTS, BROWSER_PATH } from '../tests/helpers/config.mjs';
node24();
const group = process.argv[2] || 'all';
if(process.argv.slice(3).some(x=>!x.startsWith('--only=')&&!x.startsWith('--engines=')&&x!=='--production-ui')||process.argv.filter(x=>x.startsWith('--engines=')).length>1)throw Error('Unknown/duplicate runner option');
const engineArg = process.argv.find(x => x.startsWith('--engines='));
const {parseEngines,tapIsPassing} = await import('./release-contract.mjs');
const engines = parseEngines(engineArg?.slice(10));
let only = process.argv.find(x => x.startsWith('--only='))?.slice(7);const productionUi=process.argv.includes('--production-ui');if(productionUi&&(group!=='release'||process.env.RELEASE_DIST!=='1'||only))throw Error('Production UI mode requires ordinary dist and no subset');
const files = (await fs.readdir(path.join(ROOT, 'tests'))).sort();
const suiteManifest = JSON.parse(await fs.readFile(path.join(ROOT, 'tests/suites.json')));
const registry = Object.fromEntries(['static', 'legacy'].map(kind => [kind, suiteManifest[kind].map(suite => suite.file)]));
for (const [kind, pattern] of [['static', /^check_.*\.mjs$/], ['legacy', /^test_.*\.mjs$/]]) if (JSON.stringify(files.filter(f => pattern.test(f))) !== JSON.stringify(registry[kind])) throw new Error(`Unregistered ${kind} suite`);
if (registry.static.length !== 20 || registry.legacy.length !== 26) throw new Error('Legacy registry changed; account for every suite explicitly.');
const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'tests/support/release-cases.json')));
const sourceHash = await fs.readFile(GAME).then(bytes => createHash('sha256').update(bytes).digest('hex')).catch(() => null);
const report = { sourceHash, schemaVersion: 1, group, failFast: process.env.GITHUB_ACTIONS === 'true', filter: only || null, scope: productionUi?'full_production_ui':only ? 'filtered_subset' : 'full_group', node: process.version, architecture: process.arch, platform: process.platform, engines, game: GAME, registry, acceptanceCatalog: catalog.cases.map(c => ({ id: c.id, type: c.type, gate: c.gate })), checks: [], startedAt: new Date().toISOString() };
await fs.mkdir(ARTIFACTS, { recursive: true });
const invocationDirectory = await fs.mkdtemp(path.join(ARTIFACTS, `${group}-`));
report.invocationDirectory = invocationDirectory;
let app, active, activeDirectory, stopping = false;
const kill = signal => { if (!active) return; try { process.kill(-active.pid, signal); } catch {} };
async function cleanup() {
  if (stopping) return; stopping = true;
  const child = active, directory = activeDirectory;
  kill('SIGKILL');
  if (child && child.exitCode === null && child.signalCode === null) await once(child, 'close');
  if (directory) { try { const evidence = JSON.parse(await fs.readFile(path.join(directory, 'browser.json'))); if (evidence.browserPid) process.kill(-evidence.browserPid, 'SIGKILL'); } catch {} }
  if (app) await app.close();
  if (directory) {
    const suite = path.basename(directory).replace(/_mjs$/, '.mjs');
    if (registry.legacy.includes(suite)) await cleanupFixture(ROOT, directory, suite);
  }
}
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { kill('SIGKILL'); await cleanup(); process.exit(1); });
async function run(name, args, timeoutMs, envOverrides = {}, partitionSpec = null) {
  if (stopping) return {passed:false,directory:null};
  const directory = path.join(invocationDirectory, name.replace(/[^a-zA-Z0-9_-]/g, '_'));
  await fs.mkdir(directory, { recursive: true });
  const playwrightRun = name.startsWith('release-') && name !== 'release-inventory';
  const playwrightReport = path.join(directory, 'playwright-results.json');
  const browserOutput = path.join(directory, 'browser');
  const workerArgs = playwrightRun ? [...args, `--output=${browserOutput}`] : args;
  const start = Date.now();
  const worker = await runWorker(process.execPath, workerArgs, { timeoutMs, cwd: ROOT, onSpawn: child => { active = child; activeDirectory = directory; }, env: { ...process.env, GAME, BASE_URL: process.env.BASE_URL || app?.baseURL || 'http://127.0.0.1:8099/', TEST_ARTIFACTS: directory, LEGACY_SUITE: registry.legacy.includes(name) ? name : '', PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || BROWSER_PATH, ...envOverrides, PLAYWRIGHT_JSON_REPORT_PATH: playwrightReport, PLAYWRIGHT_OUTPUT_DIR: browserOutput } });
  active = null; activeDirectory = null;
  let { exitCode, timedOut } = worker;if(name==='infrastructure'&&!tapIsPassing(worker.stdout))exitCode=1;
  let fixtureCleanup;
  if (registry.legacy.includes(name)) {
    try { fixtureCleanup = await cleanupFixture(ROOT, directory, name); }
    catch (error) { fixtureCleanup = {error:error.message}; exitCode = 1; }
  }
  try {
    const browser = JSON.parse(await fs.readFile(path.join(directory, 'browser.json')));
    if (evidenceFailed(browser)) exitCode = 1;
    if (browser.browserPid) { try { process.kill(-browser.browserPid, 'SIGKILL'); } catch {} }
  } catch {}
  await fs.writeFile(path.join(directory, 'output.log'), worker.output);
  await fs.writeFile(path.join(directory, 'stdout.log'), worker.stdout);
  await fs.writeFile(path.join(directory, 'stderr.log'), worker.stderr);
  let caseResults;
  if (playwrightRun) {
    try {
      const json = JSON.parse(await fs.readFile(playwrightReport));
      assertPlaywrightPartition(json, partitionSpec, path.join(ROOT, 'tests/release'));
      caseResults = [];
      const visit = async suite => { for (const spec of suite.specs || []) for (const test of spec.tests || []) caseResults.push({ title: spec.title, engine: test.projectName, expectedStatus: test.expectedStatus, statuses: test.results.map(result => result.status), ...await presentationAttachments(test.results, directory) }); for (const nested of suite.suites || []) await visit(nested); };
      await visit(json);
      if (!caseResults.length || caseResults.some(result => result.expectedStatus !== 'passed' || !result.statuses.length || result.statuses.some(status => status !== 'passed'))) exitCode = 1;
      // The reporter writes directly into this immutable partition directory.
    } catch (error) { if (exitCode === 0) exitCode = 1; caseResults = { error: error.message }; }
  }
  const check = { name, fixtureCleanup, caseResults, target: envOverrides.RELEASE_DIST === '1' || process.env.RELEASE_DIST ? 'dist' : 'source', command: ['node', ...workerArgs].join(' '), exitCode, timedOut, timeoutMs, durationMs: Date.now() - start, evidence: directory };
  report.checks.push(check); await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(check, null, 2));
  console.log(`${exitCode === 0 && !timedOut ? 'PASS' : 'FAIL'} ${name} (${check.durationMs}ms)`);
  if (report.failFast && name.startsWith('release-') && (exitCode !== 0 || timedOut)) {
    report.incomplete = true;
    report.intendedScope = report.scope;
    report.scope = 'partial_failed';
    report.status = 'partial_failed';
    report.abortedAfter = name;
    throw Error('Hosted release stopped after failed partition: ' + name);
  }
  return { passed: exitCode === 0 && !timedOut, directory };
}
try {
  if (['all', 'legacy', 'release'].includes(group) && !process.env.BASE_URL) app = await createServer(process.env.RELEASE_DIST ? { root: process.env.DIST_ROOT || path.join(ROOT, 'dist'), source: false, prefix: process.env.SERVE_PREFIX || '/just-snake/' } : { prefix: process.env.SERVE_PREFIX || '/' });
  report.baseURL = process.env.BASE_URL || app?.baseURL || null;
  for (const selected of group === 'all' ? ['infrastructure', 'static', 'legacy', 'release'] : [group]) {
    if (selected === 'infrastructure') {
      const infrastructureFiles = (await fs.readdir(path.join(ROOT, 'tests/infrastructure'))).filter(file => file.endsWith('.test.mjs')).sort();
      await run('infrastructure', ['--test', '--test-reporter=tap', '--test-concurrency=1', ...infrastructureFiles.map(file => path.join(ROOT, 'tests/infrastructure', file))], 90000);
    } else if (selected === 'release') {
      const cli = path.join(ROOT, 'node_modules/@playwright/test/cli.js');
      const inventory = await run('release-inventory', [cli, 'test', '--list', '--reporter=json'], 30000);
      let discovered = [], discoveredSpecs = [];
      try {
        const listing = JSON.parse(await fs.readFile(path.join(inventory.directory, 'stdout.log'), 'utf8'));
        const visit = suite => { for (const spec of suite.specs || []) { discovered.push(spec.title); discoveredSpecs.push({ title: spec.title, file: spec.file }); } for (const child of suite.suites || []) visit(child); };
        visit(listing);
      } catch (error) { report.inventoryError = error.message; }
      const missingCases = catalog.cases.filter(c => c.gate === 'local_qualification' && !['ACC-CI-01','ACC-CI-02','ACC-DOC-01'].includes(c.id) && !discovered.some(title => acceptanceIds(title).includes(c.id))).map(c => c.id);
      report.acceptanceCoverage = { missingCases, discovered, complete: missingCases.length === 0 };
      if (!productionUi && !only && missingCases.length) report.checks.push({ name: 'acceptance-coverage', exitCode: 1, missingCases, evidence: 'tests/support/release-cases.json' });
      const filterRegex = only ? new RegExp(only) : null;
      if (filterRegex && !discoveredSpecs.some(test => filterRegex.test(test.title))) report.checks.push({ name: 'no-tests-selected', exitCode: 1, filter: only, evidence: 'release-inventory/stdout.log' });
      const specFiles = (await fs.readdir(path.join(ROOT, 'tests/release'))).filter(file => file.endsWith('.spec.mjs'));
      for (const engine of engines) {
        for (const spec of specFiles) {
          if (only && !discoveredSpecs.some(test => path.basename(test.file) === spec && filterRegex.test(test.title))) continue;
          await run(`release-${engine}-${spec}`, [cli, 'test', playwrightSpecPattern(spec), `--project=${engine}`, ...(only ? ['--grep', only] : [])], 180000, {}, spec);
        }
      }
      if (!only && !process.env.RELEASE_DIST && !process.env.BASE_URL) {
        const distRoot = process.env.DIST_ROOT || path.join(ROOT, 'dist');
        try {
          await fs.access(path.join(distRoot, 'index.html'));
          await app.close();
          app = await createServer({ root: distRoot, source: false, prefix: process.env.SERVE_PREFIX || '/just-snake/' });
          for (const engine of engines) for (const spec of specFiles) {
            await run(`release-dist-${engine}-${spec}`, [cli, 'test', playwrightSpecPattern(spec), `--project=${engine}`], 180000, { BASE_URL: app.baseURL, RELEASE_DIST: '1', RELEASE_SOURCE_HOOKS: '0' }, spec);
          }
        } catch (error) { report.checks.push({ name: 'production-artifact', target: 'dist', exitCode: 1, owner: 'A02', error: error.message, evidence: distRoot }); }
      }
    } else {
      if (!registry[selected]) throw new Error(`Unknown test group ${selected}`);
      for (const file of registry[selected].filter(f => !only || only.split(',').some(part => f.includes(part)))) {
        const timeout = suiteManifest[selected].find(suite => suite.file === file).timeoutMs;
        await run(file, [path.join(ROOT, 'tests', file)], timeout);
      }
    }
  }
} catch (error) {
  report.checks.push({ name: 'runner-orchestration', exitCode: 1, error: error.message, evidence: 'orchestration failure' });
  process.exitCode = 1;
} finally {
  await cleanup(); report.finishedAt = new Date().toISOString(); report.passed = report.checks.length > 0 && report.checks.every(c => c.exitCode === 0 && !c.timedOut);
  const reportBytes = JSON.stringify(report, null, 2);
  await fs.writeFile(path.join(invocationDirectory, `${group}-results.json`), reportBytes);
  // Keep the historical latest-result interface; immutable reports remain isolated above.
  await fs.writeFile(path.join(ARTIFACTS, `${group}-results.json`), reportBytes);
}
if (!report.passed) process.exitCode = 1;

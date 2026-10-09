import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../../scripts/serve.mjs';
import { sourceAdapter, rendererReady } from '../helpers/source-adapter.mjs';
import { transform } from 'esbuild';
import { runWorker, evidenceFailed } from '../helpers/process.mjs';

test('Prefix server rejects private paths, root assets and ancestor symlink escapes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'snake-server-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'snake-outside-'));
  let app;
  try {
    await fs.writeFile(path.join(root, 'snake-three.html'), '<script type="module">let game=true;</script>');
    await fs.writeFile(path.join(root, '.env'), 'local-test-only');
    await fs.writeFile(path.join(outside, 'out.js'), 'outside');
    await fs.symlink(outside, path.join(root, 'assets'));
    app = await createServer({ root, game: path.join(root, 'snake-three.html'), prefix: '/just-snake/' });
    assert.equal((await fetch(`${app.baseURL}snake-three.html`)).status, 200);
    for (const relative of ['.env', '.git/config', '.aws/credentials', '../assets/out.js']) assert.equal((await fetch(new URL(relative, app.baseURL))).status, 404);
    assert.equal((await fetch(`${app.baseURL}assets/out.js`)).status, 403);
    await app.close();
    app = await createServer({ root, prefix: '/just-snake/', source: false });
    assert.equal((await fetch(`${app.baseURL}assets/out.js`)).status, 403);
  } finally { if (app) await app.close(); await fs.rm(root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true }); }
});
test('Source-only compile adapter leaves original source bytes unchanged', () => {
  const source = '<script type="module">if (typeof __SNAKE_TEST_BUILD__ !== "undefined" && __SNAKE_TEST_BUILD__) window.x=1;</script></body>';
  const adapted = sourceAdapter(source);
  assert.match(adapted, /<script type="module">\nconst __SNAKE_TEST_BUILD__ = true;/);
  assert.doesNotMatch(source, /const __SNAKE_TEST_BUILD__/);
  assert.throws(() => sourceAdapter('<script type="module" src="assets/game.js"></script>'), /inline game module/);
});
test('Hidden browser evidence overrides a worker nominal success', () => {
  for (const evidence of [{ failures: ['external request'] }, { pages: [{ pageErrors: ['broken frame'] }] }, { pages: [{ consoleErrors: ['GPU unavailable'] }] }]) assert.equal(evidenceFailed(evidence), true);
  assert.equal(evidenceFailed({ pages: [{ pageErrors: [], consoleErrors: [] }], failures: [] }), false);
});
test('Timeout escalation cannot kill a subsequent worker and failures remain nonzero', async () => {
  const timed = await runWorker(process.execPath, ['-e', "process.on('SIGTERM',()=>process.exit());setInterval(()=>{},1000)"], { timeoutMs: 100, graceMs: 100 });
  assert.equal(timed.timedOut, true);
  const next = await runWorker(process.execPath, ['-e', 'setTimeout(()=>console.log("next survived"),250)'], { timeoutMs: 2000 });
  assert.equal(next.exitCode, 0); assert.match(next.output.toString(), /next survived/);
  const fail = await runWorker(process.execPath, ['-e', 'process.exit(7)'], { timeoutMs: 2000 }); assert.equal(fail.exitCode, 7);
});
test('Ordinary renderer readiness requires a completed draw, not boot flag/static DOM', async () => {
  const previous = { document: globalThis.document, window: globalThis.window, getComputedStyle: globalThis.getComputedStyle };
  const gl = { isContextLost: () => false };
  globalThis.document = { querySelector: () => ({ width: 10, height: 10, getContext: () => gl }), getElementById: () => ({}) };
  globalThis.getComputedStyle = () => ({ display: 'none' }); globalThis.window = { __snakeBooted: true, __snakeRenderedFrames: 0 };
  try {
    let predicate;
    await rendererReady({ waitForFunction: async (fn, arg) => { predicate = fn; assert.equal(fn(arg), false); globalThis.window.__snakeRenderedFrames = 1; assert.equal(fn(arg), true); }, evaluate: async () => {} });
    assert.equal(typeof predicate, 'function');
  } finally { Object.assign(globalThis, previous); }
});

test('Production compile definition eliminates every legacy mutable window export', async () => {
  const source = await fs.readFile(new URL('../../snake-three.html', import.meta.url), 'utf8');
  const inline = source.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const compiled = await transform(inline, { loader: 'js', define: { __SNAKE_TEST_BUILD__: 'false' }, minifySyntax: true });
  const assigned = [...compiled.code.matchAll(/window\.(\w+)\s*=/g)].map(match => match[1]);
  assert.ok(assigned.every(name => name === '__snakeBooted'), `Unexpected exports: ${assigned}`);
  const getters = [...compiled.code.matchAll(/Object\.defineProperty\(window, ["']([^"']+)["']/g)].map(match => match[1]);
  assert.deepEqual(getters, ['__snakeRenderedFrames', '__snakeFailure']);
  assert.match(compiled.code, /Object\.defineProperty\(window, ["']__snakeFailure["'],\s*\{\s*get:/);
  assert.doesNotMatch(compiled.code, /Object\.defineProperty\(window, ["']__snakeFailure["'],[^;]*\bset:/);
});

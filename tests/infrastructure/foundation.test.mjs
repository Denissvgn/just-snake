import {checkDistribution} from '../../scripts/check-dist.mjs';
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

test('Inline CSS and SVG resource guards reject missing remote private and escaping dependencies', async () => {
  const { checkDistribution } = await import('../../scripts/check-dist.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'snake-resource-check-'));
  const entry = '<!doctype html><html><head></head><body></body></html>';
  try {
    await fs.mkdir(path.join(root, 'assets'));
    for (const name of ['index.html', 'snake-three.html', '404.html']) await fs.writeFile(path.join(root, name), entry);
    await fs.writeFile(path.join(root, 'THIRD_PARTY_NOTICES.txt'), 'fixture');
    await fs.writeFile(path.join(root, 'assets/local.jpg'), 'local image fixture');
    await fs.writeFile(path.join(root, 'assets/local.woff2'), 'local font fixture');
    const checks = [
      ['<script src=https://example.invalid/app.js></script>', /Remote runtime resource/],
      ['<img src=//example.invalid/image.jpg>', /Remote runtime resource/],
      ['<link rel=stylesheet href=https://example.invalid/app.css>', /Remote runtime resource/],
      ['<script src=&#104;ttps://example.invalid/app.js></script>', /Remote runtime resource/],
      ['<img alt="quoted > caption" src=https://example.invalid/image.jpg>', /Remote runtime resource/],
      ["<img src=https://example.invalid/image.jpg'>", /Remote runtime resource/],
      ['<img src=https://example.invalid/image.jpg<suffix>', /Remote runtime resource/],
      ['<script type=importmap>{"imports":{}}</script>', /Production import map/],
      ['<img src=./assets/missing.jpg>', /Missing resource/],
      ['<img src=../outside.jpg>', /Resource escapes distribution/],
      ['<img src=./assets/.env>', /Private or unpackageable resource/],
      ['<style>body{background:url("./assets/missing.jpg")}</style>', /Missing resource/],
      ['<style>@font-face{font-family:test;src:url("./assets/missing.woff2")}</style>', /Missing resource/],
      ['<style>@import "https://example.invalid/font.css";</style>', /Remote or unpackageable resource/],
      ['<style>body{background:url("//example.invalid/remote.jpg")}</style>', /Remote or unpackageable resource/],
      ['<div style="background:url(&quot;https://example.invalid/image.jpg&quot;)"></div>', /Remote or unpackageable resource/],
      ['<style>body{background:url("../outside.jpg")}</style>', /Resource escapes distribution/],
      ['<style>body{background:url("%2e%2e/outside.jpg")}</style>', /Resource escapes distribution/],
      ['<style>body{background:url("./assets/.env")}</style>', /Private or unpackageable resource/],
      ['<svg><image href="https://example.invalid/image.jpg"/></svg>', /Remote or unpackageable resource/],
      ['<svg><use xlink:href="./assets/missing.svg#symbol"/></svg>', /Missing resource/],
      ['<svg><path fill="url(../outside.svg#paint)"/></svg>', /Resource escapes distribution/],
      ['<svg><image href="./assets/%2e%2e/%2e%2e/outside.jpg"/></svg>', /Resource escapes distribution/],
      ['<svg><style>image{filter:url("https://example.invalid/filter.svg#id")}</style></svg>', /Remote or unpackageable resource/]
    ];
    for (const [markup, expected] of checks) {
      await fs.writeFile(path.join(root, 'index.html'), entry.replace('</head>', markup + '</head>'));
      await fs.copyFile(path.join(root, 'index.html'), path.join(root, 'snake-three.html'));
      await assert.rejects(() => checkDistribution(root, { verifyManifest: false }), expected, markup);
    }
    const valid = entry.replace('</head>', '<style>@font-face{font-family:test;src:url("./assets/local.woff2")}body{background:url("./assets/local.jpg")}</style></head>')
      .replace('</body>', '<img alt="quoted > caption" src=./assets/local.jpg><link rel=canonical href=https://example.invalid/game/><div style="background:url(&quot;./assets/local.jpg&quot;)"></div><svg><defs><linearGradient id="local"/></defs><path fill="url(#local)"/><image href="./assets/local.jpg"/></svg></body>');
    await fs.writeFile(path.join(root, 'index.html'), valid);await fs.writeFile(path.join(root, 'snake-three.html'), valid);
    await fs.writeFile(path.join(root, 'assets/local.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><image href="./local.jpg"/><style>image{mask:url(#mask)}</style></svg>');
    assert.equal((await checkDistribution(root, { verifyManifest: false })).passed, true);
    for (const markup of ['<svg><image href="../missing.jpg"/></svg>', '<svg><style>image{filter:url("https://example.invalid/filter.svg#id")}</style></svg>', '<svg><use href="../../outside.svg#id"/></svg>']) {
      await fs.writeFile(path.join(root, 'assets/local.svg'), markup);
      await assert.rejects(() => checkDistribution(root, { verifyManifest: false }), /resource|distribution/, markup);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Introduced JPEG and WOFF2 MIME types preserve bytes and mount restrictions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'snake-asset-mime-'));
  try {
    await fs.mkdir(path.join(root, 'assets'));
    await fs.writeFile(path.join(root, 'snake-three.html'), '<script type="module">let source=true;</script>');
    const resources = [['local.jpg','image/jpeg'],['local.jpeg','image/jpeg'],['local.woff2','font/woff2']];
    for (const [name] of resources) await fs.writeFile(path.join(root, 'assets', name), Buffer.from('fixture-' + name));
    for (const [source,prefix] of [[true,'/'],[false,'/'],[false,'/just-snake/']]) {
      const app = await createServer({ root, game: path.join(root, 'snake-three.html'), source, prefix });
      try {
        for (const [name,mime] of resources) {
          const response = await fetch(app.baseURL + 'assets/' + name);
          assert.equal(response.status, 200);assert.equal(response.headers.get('content-type'), mime);
          assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from('fixture-' + name));
        }
        if (prefix !== '/') assert.equal((await fetch(new URL('/assets/local.jpg', app.baseURL))).status, 404);
        assert.equal((await fetch(app.baseURL + '.git/config')).status, 404);
      } finally { await app.close(); }
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Neon per-asset and combined budgets keep the global payload ceilings', async () => {
  const { checkDistribution } = await import('../../scripts/check-dist.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'snake-neon-budget-'));
  try {
    await fs.mkdir(path.join(root, 'assets/neon'), { recursive: true });
    for (const name of ['index.html','snake-three.html','404.html','THIRD_PARTY_NOTICES.txt']) await fs.writeFile(path.join(root, name), 'fixture');
    for (const [name,kib] of [['city-wide.jpg',420],['city-portrait.jpg',240],['oxanium-ui.woff2',96]]) {
      await fs.writeFile(path.join(root, 'assets/neon', name), Buffer.alloc(kib*1024+1));
      await assert.rejects(() => checkDistribution(root, { verifyManifest: false }), /Neon asset exceeds/);
      await fs.rm(path.join(root, 'assets/neon', name));
    }
    await fs.writeFile(path.join(root, 'assets/neon', 'extra.jpg'), Buffer.alloc(768*1024+1));
    await assert.rejects(() => checkDistribution(root, { verifyManifest: false }), /Neon raster\/font\/license assets exceed 768KiB/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Document-relative external runtime URL guards include required Neon module and reject escaped remote data dependencies',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'snake-runtime-url-'));
 try{
  await fs.mkdir(path.join(root,'assets'));await fs.writeFile(path.join(root,'404.html'),'not found');await fs.writeFile(path.join(root,'THIRD_PARTY_NOTICES.txt'),'fixture');
  const entry='<html><body><main id="neonCabinet"></main><script type="module" src="./assets/game-aaaaaaaaaaaaaaaa.js"></script></body></html>';
  for(const name of ['index.html','snake-three.html'])await fs.writeFile(path.join(root,name),entry);
  const script=ref=>`import(new URL(${JSON.stringify(ref)},document.baseURI).href);`;
  await fs.writeFile(path.join(root,'assets/game-aaaaaaaaaaaaaaaa.js'),script('./assets/neon-view.js'));
  await assert.rejects(()=>checkDistribution(root,{verifyManifest:false}),/Missing.*Neon|Missing resource/);
  await fs.writeFile(path.join(root,'assets/neon-view.js'),'export const createNeonView=()=>null;');
  assert.equal((await checkDistribution(root,{verifyManifest:false})).passed,true);
  for(const ref of ['https://example.invalid/module.js','/assets/neon-view.js','../outside.js','./assets/%2e%2e/%2e%2e/outside.js','./assets/.env','data:application/javascript,export default 1']){
   await fs.writeFile(path.join(root,'assets/game-aaaaaaaaaaaaaaaa.js'),script(ref));
   await assert.rejects(()=>checkDistribution(root,{verifyManifest:false}),/resource|runtime URL|module reference/);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

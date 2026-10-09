import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { buildDistribution } from '../../scripts/build.mjs';
import { checkDistribution } from '../../scripts/check-dist.mjs';
import { createServer } from '../../scripts/serve.mjs';
import { ROOT } from '../helpers/config.mjs';
import {payloadMap} from '../../scripts/release-contract.mjs';
import { rendererReady } from '../helpers/source-adapter.mjs';
import { settings } from '../helpers/player-flow.mjs';

test('ACC-PACK-01 reproducible payload and rejecting distribution checker', async ({}, info) => {
  const base = path.join(ROOT, '.artifacts/packaging', info.project.name);
  const one = path.join(base, 'one'), two = path.join(base, 'two'), bad = path.join(base, 'bad');
  try {
    const a = await buildDistribution({ output: one });
    const b = await buildDistribution({ output: two });
    expect(a.payload).toEqual(b.payload);
    expect(await payloadMap(path.join(ROOT,'dist')), 'Fresh reproduction matches the actual checked candidate bytes').toEqual(a.payload);
    expect(a).toEqual(b);
    const checked = await checkDistribution(one, { verifyManifest: false });
    expect(checked.totalBytes).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(checked.codeGzipBytes).toBeLessThanOrEqual(1024 * 1024);
    expect(checked.files.some(file => file.startsWith('.'))).toBe(false);
    await fs.cp(one, bad, { recursive: true });
    await fs.writeFile(path.join(bad, '.env'), 'TEST_ONLY_NOT_A_SECRET=1');
    await expect(checkDistribution(bad, { verifyManifest: false })).rejects.toThrow(/Not allowlisted|Private/);
    await fs.rm(path.join(bad, '.env'));
    await fs.symlink('../index.html', path.join(bad, 'assets/link.js'));
    await expect(checkDistribution(bad, { verifyManifest: false })).rejects.toThrow(/Symlink/);
    await fs.rm(path.join(bad, 'assets/link.js'));
    await fs.link(path.join(bad, 'index.html'), path.join(bad, 'assets/hardlink.txt'));
    await expect(checkDistribution(bad, { verifyManifest: false })).rejects.toThrow(/Hard link/);
    await fs.rm(path.join(bad, 'assets/hardlink.txt'));
    for (const code of ['import "https://example.invalid/remote.js";', 'import "three";', 'export * from "https://example.invalid/remote.js";']) {
      await fs.writeFile(path.join(bad, 'assets/external.js'), code);
      await expect(checkDistribution(bad, { verifyManifest: false })).rejects.toThrow(/resource|import/);
    }
    await fs.rm(path.join(bad, 'assets/external.js'));
    for (const code of ['@import "https://example.invalid/remote.css";', 'body { background:url("https://example.invalid/remote.png"); }']) {
      await fs.writeFile(path.join(bad, 'assets/external.css'), code);
      await expect(checkDistribution(bad, { verifyManifest: false })).rejects.toThrow(/resource/);
    }
    await fs.rm(path.join(bad, 'assets/external.css'));
    await fs.rm(path.join(bad, b.bundle));
    await expect(checkDistribution(bad, { verifyManifest: false })).rejects.toThrow(/Missing resource/);
    await info.attach('payload', { body: JSON.stringify(checked, null, 2), contentType: 'application/json' });
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('ACC-PACK-02 ordinary distribution plays at root and prefix without external requests', async ({ browser }, info) => {
  const artifacts = [];
  for (const prefix of ['/', '/just-snake/']) {
    const app = await createServer({ root: path.join(ROOT, 'dist'), source: false, prefix });
    const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const page = await context.newPage(), unexpected = [], errors = [];
    try {
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.route('**/*', route => {
        const url = route.request().url();
        if (/^(?:data|blob):/.test(url) || new URL(url).origin === new URL(app.baseURL).origin) return route.continue();
        unexpected.push(url); return route.abort();
      });
      const response = await page.goto(`${app.baseURL}?seed=pack-smoke-15738&mode=classic&rules=2`);
      expect(response.status()).toBe(200);
      await rendererReady(page);
      expect(await page.evaluate(() => ['RNG', 'SETTINGS', 'MODES', 'renderer', 'scene', 'segs', 'setSeed', 'setStepMs', 'startGame'].filter(key => key in window))).toEqual([]);
      if (prefix !== '/') expect((await context.request.get(new URL('/assets/does-not-exist.js', app.baseURL).href)).status()).toBe(404);
      await settings(page, { advanced: true });
      await page.locator('#tierPills button[data-tier="high"]').click();
      await page.locator('#aaPills button[data-aa="smaa"]').click();
      await expect(page.locator('#tier')).toHaveText(/(?:\bSMAA\b(?!\.\.\.)|\bFXAA\*?)/, { timeout: 15000 });
      const aaStatus = await page.locator('#tier').textContent();
      await page.locator('#closeSettingsBtn').click();
      await page.locator('#actionBtn').waitFor({ state: 'visible' });
      await page.locator('#actionBtn').click();
      await expect(page.locator('#overlay')).not.toBeVisible();
      await expect.poll(async () => Number((await page.locator('#score').textContent()).match(/\d+/)?.[0] || 0), { timeout: 10000 }).toBeGreaterThan(0);
      await page.locator('#settingsBtn').click();
      await expect(page.locator('#settingsModal')).toBeVisible();
      await page.locator('#closeSettingsBtn').click();
      await page.locator('#actionBtn').click();
      await expect(page.locator('#overlay')).not.toBeVisible();
      await expect(page.locator('#title')).toHaveText(/Game Over|You Win!/, { timeout: 15000 });
      await page.locator('#actionBtn').waitFor({ state: 'visible' });
      await page.locator('#actionBtn').click();
      await expect(page.locator('#overlay')).not.toBeVisible();
      expect(unexpected).toEqual([]); expect(errors).toEqual([]);
      artifacts.push({ prefix, engine: info.project.name, version: browser.version(), aaStatus, eatObserved: true, requestedExternal: unexpected, errors, script: await page.locator('script[type="module"]').getAttribute('src') });
    } finally { await context.close(); await app.close(); }
  }
  await info.attach('prefix-smoke', { body: JSON.stringify(artifacts, null, 2), contentType: 'application/json' });
});

test('ACC-PACK-03 exact just-snake metadata and local release assets under root prefix and alias', async ({browser}, info) => {
  const expectedDescription='A glowing 3D snake game with three difficulty modes, daily challenges, and scores saved on your device.';
  const source=!process.env.RELEASE_DIST;
  const evidence=[];
  for(const prefix of ['/', '/just-snake/']) {
    const app=await createServer({root:source?ROOT:path.join(ROOT,'dist'),source,prefix});
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    const page=await context.newPage(), errors=[],external=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>localStorage.setItem('threejs-snake-settings',JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',sound:false,haptics:false}})));
    await page.route('**/*',route=>{const url=route.request().url();if(/^(?:data|blob):/.test(url)||new URL(url).origin===new URL(app.baseURL).origin)return route.continue();external.push(url);return route.abort();});
    try {
      for(const entry of ['', 'snake-three.html']) {
        const response=await page.goto(app.baseURL+entry+'?seed=asset-metadata&mode=classic&rules=2');expect(response.status()).toBe(200);await rendererReady(page);
        await expect(page).toHaveTitle('just-snake');
        for(const selector of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]'])await expect(page.locator(selector)).toHaveAttribute('content',expectedDescription);
        for(const selector of ['meta[property="og:title"]','meta[property="og:site_name"]','meta[name="twitter:title"]'])await expect(page.locator(selector)).toHaveAttribute('content','just-snake');
        expect(await page.locator('link[rel="canonical"],meta[property="og:url"],meta[name="twitter:site"]').count()).toBe(0);
        await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href','./assets/favicon.svg');
        await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content','./assets/social-preview.png');
        await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content','./assets/social-preview.png');
        const loaded=await page.evaluate(async()=>{const icon=new URL(document.querySelector('link[rel="icon"]').getAttribute('href'),location.href),social=new URL(document.querySelector('meta[property="og:image"]').content,location.href);const responses=await Promise.all([fetch(icon),fetch(social)]);const image=new Image();image.src=social.href;await image.decode();return {urls:[icon.href,social.href],status:responses.map(r=>r.status),types:responses.map(r=>r.headers.get('content-type')),dimensions:[image.naturalWidth,image.naturalHeight],svg:await responses[0].text()};});
        expect(loaded.status).toEqual([200,200]);expect(loaded.types[0]).toContain('image/svg+xml');expect(loaded.types[1]).toContain('image/png');expect(loaded.dimensions).toEqual([1200,630]);expect(loaded.svg).toContain('<title>just-snake</title>');expect(loaded.svg).toContain('<path');
        expect(loaded.urls.every(url=>new URL(url).pathname.startsWith(prefix+'assets/'))).toBe(true);
        expect(await page.evaluate(()=>['__social','__benchmark','RNG','SETTINGS','renderer','startGame'].filter(k=>k in window))).toEqual([]);
        if(prefix!=='/')expect((await context.request.get(new URL('/assets/favicon.svg',app.baseURL).href)).status()).toBe(404);
        evidence.push({prefix,entry,loaded});
      }
      if(prefix==='/just-snake/'&&info.project.name==='chromium') {
        await info.attach('title-desktop',{body:await page.screenshot(),contentType:'image/png'});
        await page.setViewportSize({width:390,height:844});await info.attach('title-mobile',{body:await page.screenshot(),contentType:'image/png'});
      }
      expect(errors).toEqual([]);expect(external).toEqual([]);
    }finally{await context.close();await app.close();}
  }
  const social=await fs.readFile(path.join(ROOT,'assets/social-preview.png'));expect(social.length).toBeLessThanOrEqual(1024*1024);expect(social.subarray(1,4).toString()).toBe('PNG');expect([social.readUInt32BE(16),social.readUInt32BE(20)]).toEqual([1200,630]);
  const notices=await fs.readFile(path.join(ROOT,'THIRD_PARTY_NOTICES.txt'),'utf8');for(const name of ['Three.js 0.169.0','SMAA v2.8','esbuild generated runtime helpers'])expect(notices).toContain(name);
  if(!source)expect(await fs.readFile(path.join(ROOT,'dist/THIRD_PARTY_NOTICES.txt'),'utf8')).toBe(notices);
  await info.attach('metadata-assets',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
});

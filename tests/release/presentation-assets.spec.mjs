import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { test, expect } from '../helpers/release-fixture.mjs';
import { attachPresentationEvidence } from '../helpers/presentation-evidence.mjs';
import { observeDeclaredFontFaces } from '../helpers/presentation-fault-evidence.mjs';
import { ROOT } from '../helpers/config.mjs';

const assets = ['assets/neon-district.css', 'assets/neon-view.js', 'assets/neon/city-wide.jpg',
  'assets/neon/city-portrait.jpg', 'assets/neon/oxanium-ui.woff2'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const expected = Object.fromEntries(await Promise.all(assets.map(async relative =>
  [relative, digest(await fs.readFile(path.join(ROOT, relative)))])));

for (const entry of ['', 'snake-three.html']) {
  test(`ACC-PRES-08 ordinary ${entry ? 'alias' : 'root'} loads exact local external module city font and actual selected views`, async ({ gamePage: page, baseURL }, info) => {
    const responses = [], pending = [], requests = [];
    const urls = Object.fromEntries(assets.map(relative => [relative, new URL(relative, baseURL).href]));
    page.on('request', request => { if (assets.includes(new URL(request.url()).pathname.slice(new URL(baseURL).pathname.length))) requests.push(request.url()); });
    page.on('response', response => {
      const relative = assets.find(relative => urls[relative] === response.url());
      if (relative) pending.push((async () => responses.push({ relative, url: response.url(), status: response.status(),
        type: response.headers()['content-type'], sha256: digest(await response.body()) }))());
    });
    await page.addInitScript(() => localStorage.setItem('threejs-snake-settings', JSON.stringify({ schemaVersion: 2,
      values: { presentation: 'original', quality: 'low', aa: 'none', sound: false, haptics: false } })));
    const navigation = await page.goto(new URL(entry + '?seed=local-assets&mode=classic&rules=2', baseURL).href);
    expect(navigation.status()).toBe(200);
    await attachPresentationEvidence(page, info, 'original');
    expect(requests.some(url => url === urls['assets/neon-view.js']), 'Neon module remains lazy before selection').toBe(false);
    await page.locator('#presentationSelector [data-presentation-choice="neon-district"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'neon-district');
    await attachPresentationEvidence(page, info, 'neon-district');
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => new Set(responses.map(response => response.relative)).size).toBe(assets.length);
    await Promise.all(pending);
    for (const relative of assets) {
      const served = responses.filter(response => response.relative === relative);
      expect(served.length, relative + ' actual runtime request').toBeGreaterThan(0);
      for (const response of served) {
        expect(response.status, relative).toBe(200); expect(response.sha256, relative).toBe(expected[relative]);
        expect(new URL(response.url).origin).toBe(new URL(baseURL).origin);
        expect(new URL(response.url).pathname).toBe(new URL(urls[relative]).pathname);
      }
    }
    expect(requests.filter(url => url === urls['assets/neon-view.js'])).toHaveLength(1);
    const decoded = await page.evaluate(async urls => {
      const images = await Promise.all(['assets/neon/city-wide.jpg', 'assets/neon/city-portrait.jpg'].map(async relative => {
        const image = new Image(); image.src = urls[relative]; await image.decode();
        return { relative, width: image.naturalWidth, height: image.naturalHeight };
      }));
      return { images,
        fontUsable: document.fonts.check('500 16px Oxanium'),
        css: getComputedStyle(document.querySelector('.neon-wordmark')).fontFamily,
        rendered: document.body.dataset.presentationRendered, canvases: document.querySelectorAll('canvas').length };
    }, urls);
    const fontEvidence = await page.evaluate(observeDeclaredFontFaces);
    decoded.font = fontEvidence.declared.map(font => font.status); decoded.fontEvidence = fontEvidence;
    await Promise.all(pending);
    expect(decoded.images.every(image => image.width > 500 && image.height > 500)).toBe(true);
    expect(decoded.font).toEqual(['loaded']); expect(decoded.fontUsable).toBe(true); expect(decoded.css).toContain('Oxanium');
    expect(decoded.rendered).toBe('neon-district'); expect(decoded.canvases).toBe(1);
    if (process.env.RELEASE_DIST) {
      expect(await page.evaluate(() => ['PRESENTATION','RNG','SETTINGS','renderer','scene','segs','startGame','setSeed',
        'advanceSimulation','arrangeNextMovement','__benchmark','__presentationRenderer','__presentationReplay','__neonMatte']
        .filter(key => key in window))).toEqual([]);
      const module = await fs.readFile(path.join(ROOT, 'dist/assets/neon-view.js'), 'utf8');
      expect(module).not.toMatch(/__SNAKE_TEST_BUILD__|window\.__|export\s+(?:const|let|var)\s+(?:scene|renderer|PRESENTATION)/);
    }
    await attachPresentationEvidence(page, info, 'neon-district');
    await info.attach('presentation-local-asset-bytes', { body: JSON.stringify({ entry: entry || 'root', mount: new URL(baseURL).pathname,
      expected, responses, requests, decoded, method: 'Ordinary browser runtime responses hashed against current local CSS/raw external ESM/images/font, both effective completed view witnesses; image decode and actual FontFace status. Production-only no-QA-export assertion; source adapters intentionally excluded.' }), contentType: 'application/json' });
  });
}

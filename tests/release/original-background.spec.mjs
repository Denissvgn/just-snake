import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { test, expect } from '../helpers/release-fixture.mjs';
import { ROOT } from '../helpers/config.mjs';
import { sourceAdapter, localImports } from '../helpers/source-adapter.mjs';
import { attachPresentationEvidence } from '../helpers/presentation-evidence.mjs';
import { open, start, waitForScoreWithNativeResume, createNativeResumeBudget, beginNativeCompletionPhase, finishWithNativeResume } from '../helpers/player-flow.mjs';

const relative = 'assets/original/ion-vault.jpg';
const expectedBytes = await fs.readFile(path.join(ROOT, relative));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const query = '?seed=pack-smoke-15738&mode=classic&rules=2';
async function prefs(page) {
  await page.addInitScript(() => localStorage.setItem('threejs-snake-settings', JSON.stringify({ schemaVersion: 2,
    values: { presentation: 'original', quality: 'low', aa: 'none', sound: false, haptics: false, highContrast: false, reducedMotion: true } })));
}

test('ACC-PRES-08 ordinary Original Ion Vault loads exact local image while both views retain completed renders', async ({ gamePage: page, baseURL }, info) => {
  await prefs(page); const url = new URL(relative, baseURL).href, responses = [];
  page.on('response', response => { if (response.url() === url) responses.push(response); });
  await open(page, query);
  await expect(page.locator('body')).toHaveAttribute('data-original-background', 'ready');
  await attachPresentationEvidence(page, info, 'original');
  expect(responses).toHaveLength(1); expect(responses[0].status()).toBe(200);
  expect(responses[0].headers()['content-type']).toBe('image/jpeg');
  expect(sha(await responses[0].body())).toBe(sha(expectedBytes));
  expect(expectedBytes.length).toBeLessThanOrEqual(240 * 1024);
  const decoded = await page.evaluate(async url => { const image = new Image(); image.src = url; await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight }; }, url);
  expect(decoded.width).toBeGreaterThan(1000); expect(decoded.height).toBeGreaterThan(500);
  await page.locator('#presentationSelector [data-presentation-choice="neon-district"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-presentation', 'neon-district');
  await attachPresentationEvidence(page, info, 'neon-district');
  await info.attach('original-background-local-asset', { body: JSON.stringify({ url, sha256: sha(expectedBytes),
    bytes: expectedBytes.length, decoded, method: 'Ordinary runtime local image response and decode; completed Original and Neon scene witnesses. No private controller exports.' }), contentType: 'application/json' });
});

test('ACC-PRES-08 ordinary declared invalid Original image keeps matte native Score10 summary and restart playable', async ({ gamePage: page }, info) => {
  await prefs(page); let requests = 0;
  await page.route('**/assets/original/ion-vault.jpg', async route => { requests++;
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: 'Declared invalid optional Original background bytes' }); });
  await open(page, query);
  await expect(page.locator('body')).toHaveAttribute('data-original-background', 'unavailable');
  await attachPresentationEvidence(page, info, 'original');
  await start(page); const budget = createNativeResumeBudget({ maxResumes: 3, timeoutMs: 10000 });
  await waitForScoreWithNativeResume(page, { score: 10, timeoutMs: 10000, budget, info });
  beginNativeCompletionPhase(budget); await finishWithNativeResume(page, { budget, info });
  await page.locator('#actionBtn').click();
  await expect(page.locator('#score')).toHaveText('Score: 0');
  expect(requests).toBe(1);
  await info.attach('declared-original-image-fault', { body: JSON.stringify({ requests, status: 200,
    body: 'Declared invalid optional Original background bytes', nativeProgressAndSummary: true,
    method: 'Exact optional asset corruption; ordinary error guards retained, real native play and fresh restart, no logical instrumentation.' }), contentType: 'application/json' });
});

test('ACC-PRES-04 ordinary Original HUD protects score contrast over any image and contains longer counter labels', async ({ gamePage: page }, info) => {
  await prefs(page); const rows = [];
  for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height }); await open(page, query);
    await expect(page.locator('body')).toHaveAttribute('data-original-background', 'ready');
    await attachPresentationEvidence(page, info, 'original'); await start(page);
    await expect(page.locator('#ui')).toBeVisible();
    const row = await page.evaluate(() => {
      const elements = ['score', 'best'].map(id => ({ element: document.getElementById(id), id, text: document.getElementById(id).textContent }));
      for (const { element, id } of elements) element.textContent = id === 'score' ? 'Score: 123456' : 'Best: 987654';
      const ui = document.getElementById('ui'), bounds = ui.getBoundingClientRect(), backing = getComputedStyle(ui, '::before');
      const rgba = value => value.match(/[0-9.]+/g).map(Number), color = rgba(backing.backgroundColor), alpha = color[3] ?? 1;
      const background = color.slice(0, 3).map(channel => channel * alpha + 255 * (1 - alpha));
      const luminance = rgb => rgb.map(channel => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; })
        .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
      const panel = { left: bounds.left + parseFloat(backing.left), right: bounds.right - parseFloat(backing.right),
        top: bounds.top + parseFloat(backing.top), bottom: bounds.bottom - parseFloat(backing.bottom) };
      const captions = elements.map(({ element, id }) => {
        const css = getComputedStyle(element), rgb = rgba(css.color), opacity = parseFloat(css.opacity) * (rgb[3] ?? 1);
        const foreground = rgb.slice(0, 3).map((channel, index) => channel * opacity + background[index] * (1 - opacity));
        const range = document.createRange(); range.selectNodeContents(element); const rect = range.getBoundingClientRect().toJSON();
        return { id, rect, ratio: (luminance(foreground) + .05) / (luminance(background) + .05) };
      });
      for (const { element, text } of elements) element.textContent = text;
      return { width: innerWidth, height: innerHeight, alpha, panel, captions, screen: document.body.dataset.screen,
        content: backing.content, isolation: getComputedStyle(ui).isolation };
    });
    expect(row.screen).toBe('playing'); expect(row.content).not.toBe('none'); expect(row.isolation).toBe('isolate');
    expect(row.alpha).toBeGreaterThanOrEqual(.9);
    for (const caption of row.captions) {
      expect(caption.ratio).toBeGreaterThanOrEqual(4.5);
      expect(caption.rect.left).toBeGreaterThanOrEqual(row.panel.left); expect(caption.rect.right).toBeLessThanOrEqual(row.panel.right);
      expect(caption.rect.top).toBeGreaterThanOrEqual(row.panel.top); expect(caption.rect.bottom).toBeLessThanOrEqual(row.panel.bottom);
    }
    rows.push(row);
  }
  await info.attach('original-hud-protection', { body: JSON.stringify({ rows,
    method: 'Live normal Original play at three CSS viewports. Worst-case white canvas under computed backing, authored color/opacity contrast, temporary synchronous DOM-only six-digit text widths restored before paint; no gameplay score fabrication or physical-device claim.' }), contentType: 'application/json' });
});

if (!process.env.RELEASE_DIST) {
  test('ACC-PRES-08 source Original cover crop contrast and native recovery preserve one retained decorative owner and player state', async ({ gamePage: page }, info) => {
    await prefs(page);
    await page.route('**/snake-three.html*', async route => { const response = await route.fetch();
      const hooks = `window.__originalBackdropProbe={
        park(){renderer.setAnimationLoop(null);RESIZE.cancel();stopAttract(true,false);startGame();pauseGame();},
        parkOnly(){renderer.setAnimationLoop(null);RESIZE.cancel();},
        lost(){return RECOVERY.lost;},
        logical(){return JSON.stringify({cells:segs.map(s=>[s.x,s.z,s.px,s.pz]),dir,inputQueue,food,food2,score,
          streams:[prng.state,RNG.stepCount,hazardPrng.state,RNG.hazardCount],clock:[SIMULATION.simNowMs,SIMULATION.fractionMs,SIMULATION.nextMoveMs],run:RUN_STATS.run,stored:localStorage.getItem(SCORE_KEY)});},
        state(){const o=ORIGINAL_BACKDROP;return{ready:o.ready,visible:o.mesh.visible,status:document.body.dataset.originalBackground,
          geometry:o.geometry.uuid,material:o.material.uuid,texture:o.texture.uuid,image:[o.texture.image.width,o.texture.image.height],
          cover:o.material.uniforms.cover.value.toArray(),aspect:o.aspect,depthTest:o.material.depthTest,depthWrite:o.material.depthWrite,
          layer:o.mesh.layers.mask,parent:o.mesh.parent===scene,backgroundColor:scene.background.isColor,
          ground:[groundMesh.geometry.parameters.width,groundMesh.geometry.parameters.height],board:BOARD};},
        contrast(value){A11Y.setHighContrast(value,false);renderFrame();},
        restore(){const ext=renderer.getContext().getExtension('WEBGL_lose_context');if(!ext)throw Error('Native context extension missing');ext.loseContext();return ext;}
      };`;
      await route.fulfill({ response, body: sourceAdapter(localImports(await response.text(), new URL(route.request().url()).origin + '/'), { hooks }) });
    });
    await open(page, query); await expect(page.locator('body')).toHaveAttribute('data-original-background', 'ready');
    await attachPresentationEvidence(page, info, 'original');
    await page.evaluate(() => window.__originalBackdropProbe.park());
    const logical = await page.evaluate(() => window.__originalBackdropProbe.logical()), rows = [];
    for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => page.evaluate(() => window.__originalBackdropProbe.state().aspect)).toBe(width / height);
      const row = await page.evaluate(() => window.__originalBackdropProbe.state());
      const imageAspect = row.image[0] / row.image[1], x = Math.min(1, width / height / imageAspect), y = Math.min(1, imageAspect / (width / height));
      expect(row.cover).toEqual([x, y, (1 - x) / 2, (1 - y) / 2]);
      expect(row).toMatchObject({ ready: true, visible: true, status: 'ready', depthTest: false, depthWrite: false, layer: 1, parent: true, backgroundColor: true });
      expect(row.ground).toEqual([row.board + .8, row.board + .8]); rows.push(row);
    }
    await page.evaluate(() => window.__originalBackdropProbe.contrast(true));
    expect(await page.evaluate(() => window.__originalBackdropProbe.state())).toMatchObject({ visible: false, status: 'suppressed' });
    await page.evaluate(() => window.__originalBackdropProbe.contrast(false));
    const before = await page.evaluate(() => window.__originalBackdropProbe.state());
    await page.evaluate(() => { window.__originalBackdropExtension = window.__originalBackdropProbe.restore(); });
    await expect.poll(() => page.evaluate(() => window.__originalBackdropProbe.lost())).toBe(true);
    await page.evaluate(() => window.__originalBackdropExtension.restoreContext());
    await expect(page.locator('#gpuStatus')).toHaveText('Graphics restored. Resume when you are ready.');
    await page.evaluate(() => window.__originalBackdropProbe.parkOnly());
    const after = await page.evaluate(() => window.__originalBackdropProbe.state());
    expect(after).toMatchObject({ ready: true, visible: true, geometry: before.geometry, material: before.material, texture: before.texture });
    expect(await page.evaluate(() => window.__originalBackdropProbe.logical())).toBe(logical);
    await info.attach('original-background-owner-proof', { body: JSON.stringify({ rows, before, after, logicalUnchanged: true,
      method: 'Source-only paused player; actual viewport cover math, real contrast, real WEBGL_lose_context restore, retained owner UUIDs and exact logical state. CSS viewport evidence, no physical device/FPS claim.' }), contentType: 'application/json' });
  });
}

import { test, expect } from '../helpers/release-fixture.mjs';
import { open, start, finishWithNativeResume, settings } from '../helpers/player-flow.mjs';
const completePositive=page=>finishWithNativeResume(page,{info:test.info()});
import { localImports, sourceAdapter } from '../helpers/source-adapter.mjs';
const key = 'threejs-snake-settings';
const titleQuery = '?seed=settings-regression&mode=classic&rules=2';
const pill = (page, group, attribute, value) => page.locator(`#${group} [${attribute}="${value}"]`);
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function pausedSettings(page, query = titleQuery, options) { await open(page, query); await start(page); await settings(page, options); }
async function close(page) { await page.locator('#closeSettingsBtnAction').click(); }
async function pressed(locator, value = true) { await expect(locator).toHaveAttribute('aria-pressed', String(value)); }
async function installStorage(page, { raw = null, denied = false } = {}) {
  await page.addInitScript(({ key, raw, denied }) => {
    // Seed once per origin/session; reload must exercise the game's saved bytes.
    if (raw !== null && !sessionStorage.getItem('__releaseSettingsSeeded')) {
      localStorage.setItem(key, raw);
      sessionStorage.setItem('__releaseSettingsSeeded', '1');
    }
    window.__settingsWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) window.__settingsWrites.push(value);
      if (denied) throw new DOMException('Storage unavailable', 'SecurityError');
      return original.call(this, name, value);
    };
    if (denied) Storage.prototype.getItem = function () { throw new DOMException('Storage unavailable', 'SecurityError'); };
  }, { key, raw, denied });
}

test('ACC-SET-01 low/off/none/segments and explicit accessibility survive reload', async ({ gamePage: page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference', contrast: 'no-preference' });
  await pausedSettings(page,titleQuery,{advanced:true});
  await page.locator('#bloomToggleBtn').click();
  await pill(page, 'aaPills', 'data-aa', 'none').click();
  await pill(page, 'bodyPills', 'data-body', 'segments').click();
  await page.locator('#motionToggleBtn').click(); await page.locator('#contrastToggleBtn').click();
  await pill(page, 'tierPills', 'data-tier', 'low').click();
  const before = await stored(page);
  expect(before.schemaVersion).toBe(2);
  expect(before.values).toMatchObject({ quality: 'low', bloomOn: false, aa: 'none', bodyMode: 'segments', reducedMotion: true, highContrast: true });
  expect(before.values).not.toHaveProperty('wrap'); expect(before.values).not.toHaveProperty('tier');
  await page.reload(); await start(page); await settings(page,{advanced:true});
  for (const [group, attr, value] of [['tierPills','data-tier','low'], ['aaPills','data-aa','none'], ['bodyPills','data-body','segments']]) await pressed(pill(page,group,attr,value));
  await pressed(page.locator('#bloomToggleBtn'), false); await pressed(page.locator('#motionToggleBtn')); await pressed(page.locator('#contrastToggleBtn'));
  await expect(page.locator('#graphicsEffective')).toContainText('Effective: low; glow off, AA none');
  expect(await stored(page)).toEqual(before);
});

for (const [label, raw, denied] of [
  ['absent', null, false], ['malformed', '{broken', false], ['wrong envelope', '{"schemaVersion":2,"values":[]}', false],
  ['invalid fields', JSON.stringify({schemaVersion:2,values:{ quality:['high'],bloomOn:'false',aa:{toString:'smaa'},bodyMode:1,sound:'yes',haptics:null,reducedMotion:0,highContrast:[],colorblind:'evil',keymap:'evil',wrap:true }}), false],
  ['storage denied', null, true]
]) {
  test(`ACC-SET-02 ${label} settings use write-free inherited defaults and session changes`, async ({ gamePage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
    await installStorage(page, { raw, denied }); await pausedSettings(page,titleQuery,{advanced:true});
    expect(await page.evaluate(() => window.__settingsWrites)).toEqual([]);
    await pressed(pill(page,'tierPills','data-tier','auto'));
    await pressed(pill(page,'palettePills','data-palette','default'));
    await pressed(pill(page,'keymapPills','data-keymap','wasd_arrows'));
    await pressed(page.locator('#motionToggleBtn')); await pressed(page.locator('#contrastToggleBtn'));
    await pill(page,'bodyPills','data-body','segments').click();
    const savedText = await page.evaluate(() => window.__settingsWrites.at(-1));
    const envelope = JSON.parse(savedText);
    expect(envelope.values.quality).toBe('auto');
    expect(envelope.values).not.toHaveProperty('reducedMotion'); expect(envelope.values).not.toHaveProperty('highContrast');
    await page.locator('#motionToggleBtn').click(); await pressed(page.locator('#motionToggleBtn'), false);
    expect(JSON.parse(await page.evaluate(() => window.__settingsWrites.at(-1))).values.reducedMotion).toBe(false);
    await pressed(pill(page,'bodyPills','data-body','segments'));
    await pill(page,'tierPills','data-tier','auto').click();
    expect(JSON.parse(await page.evaluate(() => window.__settingsWrites.at(-1))).values.quality).toBe('auto');
    await pressed(pill(page,'tierPills','data-tier','auto'));
  });
}

test('ACC-SET-02 legacy valid preferences migrate on mutation; Low constraints preserve presentation requests', async ({ gamePage: page }) => {
  const legacy = {tier:'low',bloomOn:true,bloomMask:false,aa:'smaa',bodyMode:'segments',sound:false,haptics:false,reducedMotion:false,highContrast:false,keymap:'ijkl',colorblind:'colorblind',wrap:true};
  await installStorage(page,{raw:JSON.stringify(legacy)}); await pausedSettings(page,titleQuery,{advanced:true});
  expect(await page.evaluate(() => window.__settingsWrites)).toEqual([]);
  await pressed(pill(page,'tierPills','data-tier','low')); await pressed(pill(page,'aaPills','data-aa','smaa'));
  await pressed(page.locator('#bloomToggleBtn')); await pressed(page.locator('#soundToggleBtn'),false);
  await expect(page.locator('#graphicsEffective')).toContainText('glow off, AA none');
  await pill(page,'tierPills','data-tier','balanced').click();
  await expect(page.locator('#graphicsEffective')).toContainText('glow on');
  const values = (await stored(page)).values;
  expect(values).toMatchObject({quality:'balanced',bloomOn:true,bloomMask:false,aa:'smaa',bodyMode:'segments',sound:false,haptics:false,reducedMotion:false,highContrast:false,keymap:'ijkl',colorblind:'colorblind'});
  expect(values).not.toHaveProperty('wrap'); expect(values).not.toHaveProperty('tier');
});

test('ACC-SET-02 ordinary Low High Low UI transitions keep requests and render the arena', async ({ gamePage: page }) => {
  await installStorage(page,{raw:JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',bodyMode:'segments',bloomOn:false,bloomMask:false}})});
  await pausedSettings(page,titleQuery,{advanced:true});
  const frames = await page.evaluate(()=>window.__snakeRenderedFrames);
  await pill(page,'tierPills','data-tier','high').click();
  await page.waitForFunction(frames=>window.__snakeRenderedFrames>frames+2,frames);
  await expect(page.locator('#graphicsEffective')).toContainText('Requested: high. Effective: high; glow off, AA none');
  expect((await stored(page)).values).toMatchObject({quality:'high',aa:'none',bodyMode:'segments',bloomOn:false,bloomMask:false});
  expect(await page.evaluate(()=>typeof window.SETTINGS)).toBe('undefined');
  await pill(page,'tierPills','data-tier','low').click();
  await expect(page.locator('#graphicsEffective')).toContainText('Requested: low. Effective: low');
  await pressed(pill(page,'bodyPills','data-body','segments'));
  expect((await stored(page)).values.quality).toBe('low');
});

test('ACC-SET-03 Q/B/M/T persist requested choices across settings and reload', async ({ gamePage: page }) => {
  await installStorage(page,{raw:JSON.stringify({schemaVersion:2,values:{quality:'balanced',bloomOn:true,bloomMask:true,aa:'none',bodyMode:'tube'}})});
  await open(page,titleQuery); await start(page);
  for (const key of ['q','b','m','t']) await page.keyboard.press(key);
  await settings(page,{advanced:true});
  const envelope = await stored(page);
  expect(envelope.values).toMatchObject({quality:'low',bloomOn:false,bloomMask:false,bodyMode:'segments'});
  await pressed(pill(page,'tierPills','data-tier','low')); await pressed(page.locator('#bloomToggleBtn'),false); await pressed(page.locator('#bloomModeBtn'),false); await pressed(pill(page,'bodyPills','data-body','segments'));
  await close(page);
  if (await page.locator('#actionBtn').textContent() === 'Resume') await page.locator('#actionBtn').click();
  await completePositive(page); await expect(page.locator('#message strong')).toHaveText('settings-regression'); await expect(page.locator('.mode-badge-pill')).toContainText('Classic');
  await page.reload(); await start(page); await settings(page,{advanced:true});
  expect(await stored(page)).toEqual(envelope);
  await pressed(pill(page,'tierPills','data-tier','low')); await pressed(pill(page,'bodyPills','data-body','segments'));
});

test('ACC-SET-04 legacy wrap cannot alter active difficulty; paused selection applies on next run', async ({ gamePage: page }) => {
  await installStorage(page,{raw:JSON.stringify({tier:'low',wrap:true})});
  await pausedSettings(page);
  await expect(page.locator('#wallsPolicy')).toContainText('Current: Classic (lethal walls)');
  await pill(page,'settingsModeSelector','data-mode','calm').click(); await pressed(pill(page,'settingsModeSelector','data-mode','calm'));
  await expect(page.locator('#wallsPolicy')).toContainText('Current: Classic (lethal walls). Next run: Calm');
  await close(page); await page.locator('#actionBtn').click(); await completePositive(page);
  await expect(page.locator('.mode-badge-pill')).toContainText('Classic'); await expect(page.locator('.summary-cause')).toContainText('wall');
  await page.locator('#actionBtn').click(); await settings(page,{advanced:true});
  await expect(page.locator('#wallsPolicy')).toContainText('Current: Calm (wrap-around)');
  await pill(page,'settingsModeSelector','data-mode','frenzy').click(); await expect(page.locator('#wallsPolicy')).toContainText('Current: Calm (wrap-around). Next run: Frenzy');
  await pill(page,'bodyPills','data-body','segments').click(); expect((await stored(page)).values).not.toHaveProperty('wrap');
});

if (!process.env.RELEASE_DIST) {
  test.describe('B01 source arrangements', () => {
    test.use({ sourceHooks: true });
    async function arrange(page) {
      await page.route('**/snake-three.html*', async route => {
        const response = await route.fetch();
        const hooks = `window.__settingsScenario = {
          downgrade() { tuned=0; tuneWarmup=0; frameCount=89; frameAcc=89*0.04; autoTune(0.04); },
          aaFailure() { failSMAA(); },
          shadows() {
            const casters=[]; const lights=[]; let decorativeCasting=0;
            scene.traverse(o=>{
              if(o.userData.qualityShadow) casters.push({kind:o.type,casting:o.castShadow});
              if(o.isLight && o.userData.qualityShadow && o.shadow) lights.push({
                casting:o.castShadow,size:[o.shadow.mapSize.x,o.shadow.mapSize.y],
                map:o.shadow.map?[o.shadow.map.width,o.shadow.map.height]:null});
              if(o.isMesh && !o.userData.qualityShadow && o.castShadow) decorativeCasting++;
            });
            return {casters,lights,decorativeCasting};
          },
          snapshot() { return JSON.stringify({mode:currentMode, seed:RNG.seed, draws:RNG.stepCount,
            cells:segs.map(s=>[s.x,s.z]), food:[food.x,food.z,food2.x,food2.z], base:BASE_STEP_MS,min:MIN_STEP_MS,step:stepMs,pillars:HAZARDS.getPillarPositions(), score,dir,inputQueue,metrics:RUN_STATS.foodBreakdown}); }
        };`;
        await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),page.url() === 'about:blank' ? new URL(route.request().url()).origin+'/' : new URL('.',page.url()).href),{hooks})});
      });
    }
    test('ACC-SET-02 source-arranged safety/AA fallback retain Auto and manual requests without writes', async ({ gamePage: page }) => {
      await arrange(page); await installStorage(page); await pausedSettings(page,titleQuery,{advanced:true});
      await pill(page,'tierPills','data-tier','high').click();
      const before = await stored(page); const writes = await page.evaluate(()=>window.__settingsWrites.length);
      await page.evaluate(()=>window.__settingsScenario.downgrade());
      await expect(page.locator('#graphicsEffective')).toContainText('Requested: high. Effective: low');
      expect(await stored(page)).toEqual(before); expect(await page.evaluate(()=>window.__settingsWrites.length)).toBe(writes);
      await pill(page,'tierPills','data-tier','auto').click(); const auto = await stored(page);
      await page.evaluate(()=>window.__settingsScenario.downgrade()); await pressed(pill(page,'tierPills','data-tier','auto')); expect(await stored(page)).toEqual(auto);
      await pill(page,'tierPills','data-tier','high').click(); await pill(page,'aaPills','data-aa','smaa').click();
      const smaa = await stored(page); await page.evaluate(()=>window.__settingsScenario.aaFailure());
      await expect(page.locator('#graphicsEffective')).toContainText('SMAA unavailable; using FXAA'); expect(await stored(page)).toEqual(smaa);
      await pill(page,'aaPills','data-aa','none').click(); const off = await stored(page);
      await page.evaluate(()=>window.__settingsScenario.aaFailure());
      await expect(page.locator('#graphicsEffective')).toContainText('AA none'); expect(await stored(page)).toEqual(off);
    });
    test('ACC-SET-02 source-arranged Low High Low restores actual owned shadow resources without game changes', async ({ gamePage: page }) => {
      await arrange(page); await installStorage(page,{raw:JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none'}})});
      await pausedSettings(page,titleQuery,{advanced:true});
      const before = await page.evaluate(()=>window.__settingsScenario.snapshot());
      let shadows = await page.evaluate(()=>window.__settingsScenario.shadows());
      expect(shadows.lights.length).toBeGreaterThan(0); expect(shadows.lights.every(l=>!l.casting && l.map===null)).toBe(true);
      await pill(page,'tierPills','data-tier','high').click();
      await page.waitForFunction(()=>window.__settingsScenario.shadows().lights.every(l=>l.casting && l.size[0]===2048 && l.map?.[0]===2048));
      shadows = await page.evaluate(()=>window.__settingsScenario.shadows());
      expect(shadows.casters.every(c=>c.casting)).toBe(true); expect(shadows.decorativeCasting).toBe(0);
      expect(await page.evaluate(()=>window.__settingsScenario.snapshot())).toBe(before);
      await pill(page,'tierPills','data-tier','low').click();
      shadows = await page.evaluate(()=>window.__settingsScenario.shadows());
      expect(shadows.lights.every(l=>!l.casting && l.size[0]===1024 && l.map===null)).toBe(true);
      expect(shadows.casters.every(c=>!c.casting)).toBe(true); expect(shadows.decorativeCasting).toBe(0);
      expect(await page.evaluate(()=>window.__settingsScenario.snapshot())).toBe(before);
    });
    test('ACC-SET-03 source-arranged cosmetic changes preserve active cells/RNG/seed/mode; selection remains pending', async ({ gamePage: page }) => {
      await arrange(page); await pausedSettings(page); await close(page);
      const before = await page.evaluate(()=>window.__settingsScenario.snapshot());
      for (const key of ['q','b','m','t']) await page.keyboard.press(key);
      expect(await page.evaluate(()=>window.__settingsScenario.snapshot())).toBe(before);
      await settings(page); await pill(page,'settingsModeSelector','data-mode','frenzy').click();
      expect(await page.evaluate(()=>window.__settingsScenario.snapshot())).toBe(before);
      expect(await page.evaluate(()=>Object.isFrozen(window.MODES) && Object.values(window.MODES).every(Object.isFrozen))).toBe(true);
      expect(await page.evaluate(()=>window.applySetting('wrap',true))).toBe(false);
    });
  });
}

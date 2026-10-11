import { test, expect } from '../helpers/release-fixture.mjs';
import { open, start, settings, createNativeResumeBudget, waitForScoreWithNativeResume,
  beginNativeCompletionPhase, finishWithNativeResume } from '../helpers/player-flow.mjs';
import { localImports, sourceAdapter } from '../helpers/source-adapter.mjs';
import { attachPresentationEvidence } from '../helpers/presentation-evidence.mjs';

const key = 'threejs-snake-settings';
const query = '?seed=presentation-regression&mode=classic&rules=2';
const choice = (page, group, value) => page.locator(`#${group} [data-presentation-choice="${value}"]`);

async function preferences(page, values, { denied = false } = {}) {
  await page.addInitScript(({ key, values, denied }) => {
    if (values !== null && !sessionStorage.getItem('__presentationSeeded')) {
      localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, values }));
      sessionStorage.setItem('__presentationSeeded', '1');
    }
    window.__presentationWrites = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) window.__presentationWrites.push(value);
      if (denied) throw new DOMException('Storage unavailable', 'SecurityError');
      return set.call(this, name, value);
    };
    if (denied) Storage.prototype.getItem = function () { throw new DOMException('Storage unavailable', 'SecurityError'); };
  }, { key, values, denied });
}

test('ACC-PRES-01 Original default and independent selectors preserve requested preferences on reload', async ({ gamePage: page }) => {
  const retained = { quality: 'low', aa: 'none', bodyMode: 'segments', bloomOn: false, sound: false, keymap: 'ijkl' };
  await preferences(page, retained);
  await open(page, query);
  await expect(page.locator('body')).toHaveAttribute('data-presentation', 'original');
  await expect(choice(page, 'presentationSelector', 'original')).toHaveAttribute('aria-pressed', 'true');
  await attachPresentationEvidence(page, test.info(), 'original');
  expect(await page.evaluate(() => window.__presentationWrites)).toEqual([]);
  await choice(page, 'presentationSelector', 'neon-district').click();
  await expect(page.locator('body')).toHaveAttribute('data-presentation-requested', 'neon-district');
  await expect(page.locator('body')).toHaveAttribute('data-presentation', 'neon-district');
  await attachPresentationEvidence(page, test.info(), 'neon-district');
  await expect(page.locator('#presentationStatus')).toBeHidden();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(saved.values).toMatchObject({ ...retained, presentation: 'neon-district' });
  expect(saved.values).not.toHaveProperty('reducedMotion');
  expect(saved.values).not.toHaveProperty('highContrast');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-presentation', 'neon-district');
  await expect(choice(page, 'presentationSelector', 'neon-district')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__presentationWrites)).toEqual([]);
  await settings(page);
  await expect(choice(page, 'settingsPresentationSelector', 'neon-district')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#settingsModeSelector [data-mode="classic"]')).toHaveAttribute('aria-pressed', 'true');
  await choice(page, 'settingsPresentationSelector', 'original').click();
  await page.locator('#closeSettingsBtnAction').click();
  await expect(choice(page, 'presentationSelector', 'original')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#presentationStatus')).toBeHidden();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).values, key)).toMatchObject({ ...retained, presentation: 'original' });
  expect(await page.locator('.presentation-pill.mode-pill').count()).toBe(0);
  await attachPresentationEvidence(page, test.info(), 'original');
});

for (const [label, value] of [['unknown', 'rainy'], ['array', ['neon-district']], ['object', { id: 'neon-district' }], ['null', null]]) {
  test(`ACC-PRES-01 ${label} presentation falls back without corrupting valid settings or writing`, async ({ gamePage: page }) => {
    await preferences(page, { presentation: value, quality: 'low', sound: false });
    await open(page, query);
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'original');
    await expect(page.locator('body')).toHaveAttribute('data-presentation-requested', 'original');
    await attachPresentationEvidence(page, test.info(), 'original');
    expect(await page.evaluate(() => window.__presentationWrites)).toEqual([]);
    await choice(page, 'presentationSelector', 'original').click();
    const values = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).values, key);
    expect(values).toMatchObject({ presentation: 'original', quality: 'low', sound: false });
    expect(values).not.toHaveProperty('reducedMotion');
    expect(values).not.toHaveProperty('highContrast');
  });
}

test('ACC-PRES-01 denied storage retains session selection and inherited accessibility', async ({ gamePage: page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
  await preferences(page, null, { denied: true });
  await open(page, query);
  expect(await page.evaluate(() => window.__presentationWrites)).toEqual([]);
  await choice(page, 'presentationSelector', 'neon-district').click();
  await expect(page.locator('body')).toHaveAttribute('data-presentation', 'neon-district');
  await attachPresentationEvidence(page, test.info(), 'neon-district');
  await settings(page);
  await expect(choice(page, 'settingsPresentationSelector', 'neon-district')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#motionToggleBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#contrastToggleBtn')).toHaveAttribute('aria-pressed', 'true');
  const envelope = JSON.parse(await page.evaluate(() => window.__presentationWrites.at(-1)));
  expect(envelope.values.presentation).toBe('neon-district');
  expect(envelope.values).not.toHaveProperty('reducedMotion');
  expect(envelope.values).not.toHaveProperty('highContrast');
});

async function neon(page, query = '?seed=pack-smoke-15738&mode=classic&rules=2') {
  await preferences(page, { presentation: 'neon-district', quality: 'low', aa: 'none', sound: false });
  await open(page, query);
  await expect(page.locator('body')).toHaveAttribute('data-presentation', 'neon-district');
  await attachPresentationEvidence(page, test.info(), 'neon-district');
}

test('ACC-PRES-04 native rail controls follow title playing paused restart and next-run difficulty', async ({ gamePage: page }) => {
  await neon(page);
  await expect(page.locator('#neonActionBtn')).toHaveText('Start game');
  for (const id of ['neonPauseBtn', 'neonRestartBtn', 'neonTitleBtn']) await expect(page.locator(`#${id}`)).toBeDisabled();
  await expect(page.locator('#neonScore')).toHaveText('00000');
  await expect(page.locator('#neonLevel')).toHaveText('01');
  await expect(page.locator('#neonCombo')).toHaveText('—');
  await expect(page.locator('#neonSpeedMeter')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('#actionBtn')).toBeHidden();
  await expect(page.locator('#settingsBtn')).toBeHidden();
  await start(page);
  await expect(page.locator('#neonActionBtn')).toHaveText('Running');
  await expect(page.locator('#neonActionBtn')).toBeDisabled();
  await page.locator('#neonPauseBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  await expect(page.locator('#neonActionBtn')).toHaveText('Resume');
  await expect(page.locator('#neonPauseBtn')).toHaveText('Resume');
  await settings(page, { advanced: true });
  await expect(page.locator('#bodyPresentationNote')).toBeVisible();
  await page.locator('#settingsModeSelector [data-mode="frenzy"]').click();
  await expect(page.locator('#neonContext')).toContainText('Classic');
  await page.locator('#closeSettingsBtnAction').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  await page.locator('#neonActionBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'playing');
  await page.locator('#neonRestartBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-active-mode', 'frenzy');
  await expect(page.locator('#neonContext')).toContainText('Frenzy');
  await page.locator('#neonTitleBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
  await expect(page.locator('#neonScore')).toHaveText('00000');
  await expect(page.locator('#neonLevel')).toHaveText('01');
  await expect(page.locator('#neonCombo')).toHaveText('—');
  await expect(page.locator('#neonContext')).toContainText('Frenzy');
});

test('ACC-PRES-04 native Neon Score10 natural summary and fresh run use actual visible controls', async ({ gamePage: page }, info) => {
  await neon(page); await start(page);
  const budget = createNativeResumeBudget({ maxResumes: 3, timeoutMs: 10000 });
  await waitForScoreWithNativeResume(page, { score: 10, maxResumes: 3, timeoutMs: 10000, budget, info });
  await expect(page.locator('#neonScore')).toHaveText('00010');
  beginNativeCompletionPhase(budget);
  await finishWithNativeResume(page, { maxResumes: 3, timeoutMs: 15000, budget, info });
  await expect(page.locator('.summary-grid')).toBeVisible();
  await expect(page.locator('#shareBtn')).toBeVisible();
  await expect(page.locator('#leaderboardBtn')).toBeHidden();
  await expect(page.locator('#neonActionBtn')).toHaveText('New run');
  await page.locator('#neonActionBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#neonScore')).toHaveText('00000');
});

test('ACC-PRES-02 open Settings switches keep canvas inert and restore the active view focus', async ({ gamePage: page }) => {
  await neon(page);
  const canvas = page.locator('canvas');
  expect(await canvas.evaluate(node => node.inert)).toBe(false);
  await settings(page);
  for (const selected of ['original', 'neon-district', 'original']) {
    await choice(page, 'settingsPresentationSelector', selected).click();
    await expect(page.locator('body')).toHaveAttribute('data-presentation', selected);
    expect(await canvas.evaluate(node => node.inert)).toBe(true);
    await canvas.evaluate(node => node.focus());
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('#settingsModal')))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('#settingsModal')))).toBe(true);
  }
  await page.locator('#closeSettingsBtnAction').click();
  expect(await canvas.evaluate(node => node.inert)).toBe(false);
  await expect(page.locator('#actionBtn')).toBeFocused();
  await expect(page.locator('#settingsModal')).toBeHidden();
  await attachPresentationEvidence(page, test.info(), 'original');
});

for (const [width, height] of [[1600, 900], [390, 844], [844, 390]]) {
  test(`ACC-PRES-04 cabinet first-pass ${width}x${height} keeps square board metrics actions and local art`, async ({ gamePage: page }) => {
    await page.setViewportSize({ width, height });
    await neon(page); await start(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const board = document.getElementById('neonBoardViewport').getBoundingClientRect();
      return { board: [board.width, board.height], overflow: document.documentElement.scrollWidth > innerWidth + 1,
        controls: ['neonActionBtn','neonPauseBtn','neonRestartBtn','neonSettingsBtn','neonRankingsBtn','neonTitleBtn','neonFullscreenBtn']
          .map(id => { const node = document.getElementById(id), rect = node.getBoundingClientRect(); return { id, width: rect.width, height: rect.height, visible: getComputedStyle(node).display !== 'none' }; }),
        fonts: document.fonts.check('500 16px Oxanium'), canvasCount: document.querySelectorAll('canvas').length,
        background: getComputedStyle(document.body).backgroundImage };
    });
    expect(Math.abs(geometry.board[0] - geometry.board[1])).toBeLessThanOrEqual(1);
    expect(geometry.board[0]).toBeGreaterThan(200);
    expect(geometry.overflow).toBe(false); expect(geometry.fonts).toBe(true); expect(geometry.canvasCount).toBe(1);
    expect(geometry.background).toContain('city-');
    for (const control of geometry.controls) { expect(control.visible).toBe(true); expect(control.width).toBeGreaterThanOrEqual(44); expect(control.height).toBeGreaterThanOrEqual(44); }
    await test.info().attach('cabinet-ordinary-viewport', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await test.info().attach('cabinet-first-pass-geometry', { body: JSON.stringify(geometry), contentType: 'application/json' });
  });
}

const scoreKey = 'threejs-snake-scores-v2';
function rankedRecord({ id, seed = 'rank-scope', score = 10, mode = 'classic', category = 'custom' }) {
  const total = score / 10, timing = { calm: [140, 95, 3], classic: [115, 62, 4], frenzy: [90, 45, 4] }[mode];
  return { schemaVersion: 2, rulesVersion: 2, runId: id, seed, score, mode, category,
    isDaily: category === 'daily', dailyDate: category === 'daily' ? seed.slice(6) : null,
    length: 3 + total, timeMs: total * timing[0], maxCombo: 1,
    maxSpeedLevel: 1 + Math.ceil((timing[0] - Math.max(timing[1], timing[0] - Math.floor(score / 30) * timing[2])) / timing[2]),
    foodBreakdown: { common: total, golden: 0, jittery: 0, total }, outcome: mode === 'calm' ? 'self' : 'wall',
    completedAt: '2026-10-10T12:00:00.000Z' };
}
async function rankingStorage(page, { records = [], denied = false, legacy = { best: null, records: [] } } = {}) {
  await page.addInitScript(({ scoreKey, records, denied, legacy }) => {
    if (!sessionStorage.getItem('__rankingSeeded')) {
      localStorage.setItem(scoreKey, JSON.stringify({ schemaVersion: 2, records, legacy, legacyImported: true }));
      sessionStorage.setItem('__rankingSeeded', '1');
    }
    const get = Storage.prototype.getItem, put = Storage.prototype.setItem;
    window.__rankingWrites = 0;
    window.__rankingPeek = () => get.call(localStorage, scoreKey);
    Storage.prototype.setItem = function (name, value) { if (name === scoreKey) window.__rankingWrites++; return put.call(this, name, value); };
    if (denied) Storage.prototype.getItem = function (name) { if (name === scoreKey) throw new DOMException('Denied', 'SecurityError'); return get.call(this, name); };
  }, { scoreKey, records, denied, legacy });
}
const rankingBytes = page => page.evaluate(() => ({ raw: window.__rankingPeek(), writes: window.__rankingWrites }));

test('ACC-PRES-05 title rankings filter real scopes safely and preserve score bytes with earlier-rule cues', async ({ gamePage: page }) => {
  const malicious = '<img src=x onerror="window.__rankingsXSS=1">雪🐍';
  await rankingStorage(page, { records: [rankedRecord({ id: 'rank20', score: 20 }), rankedRecord({ id: 'rank10' }),
    rankedRecord({ id: 'opaque', seed: malicious }), rankedRecord({ id: 'daily', mode: 'frenzy', category: 'daily', seed: 'DAILY-2026-10-10' })],
    legacy: { best: 41, records: [{ score: 41, length: 4, timeSec: 1, maxCombo: 1, maxSpeedLevel: 1, mode: 'classic', date: '2026-10-08T12:00:00.000Z' }] } });
  await neon(page, '?seed=rank-scope&mode=classic&rules=2');
  const before = await rankingBytes(page);
  await expect(page.locator('#neonRankingsBtn')).toBeEnabled(); await page.locator('#neonRankingsBtn').click();
  await expect(page.locator('#neonRankingsDialog')).toBeVisible();
  await expect(page.locator('#neonRankingMode')).toHaveValue('classic');
  await expect(page.locator('#neonRankingCategory')).toHaveValue('custom');
  await expect(page.locator('#neonRankingChallenge')).toHaveValue('rank-scope');
  await expect(page.locator('#neonRankingsList li')).toHaveCount(2);
  await expect(page.locator('#neonRankingsList li').first()).toContainText('20 pts');
  await expect(page.locator('#neonRankingsEarlier')).toBeVisible();
  await page.locator('#neonRankingChallenge').selectOption(malicious);
  await expect(page.locator('#neonRankingsScope')).toContainText(malicious);
  await expect(page.locator('#neonRankingsDialog img')).toHaveCount(0);
  expect(await page.evaluate(() => '__rankingsXSS' in window)).toBe(false);
  await page.locator('#neonRankingMode').selectOption('frenzy');
  await page.locator('#neonRankingCategory').selectOption('daily');
  await expect(page.locator('#neonRankingChallenge')).toHaveValue('DAILY-2026-10-10');
  await expect(page.locator('#neonRankingsList li')).toHaveCount(1);
  await expect(page.locator('#neonRankingsList')).toContainText('10 pts');
  await page.locator('#neonRankingMode').selectOption('calm');
  await page.locator('#neonRankingCategory').selectOption('casual');
  await expect(page.locator('#neonRankingsEmpty')).toBeVisible();
  await expect(page.locator('#neonRankingChallengeField')).toBeHidden();
  await expect(page.locator('#neonContext')).toContainText('Classic');
  expect(await rankingBytes(page)).toEqual(before);
  await page.locator('#neonRankingMode').selectOption('classic');
  await page.locator('#neonRankingCategory').selectOption('custom');
  await page.locator('#neonRankingChallenge').selectOption('rank-scope');
  await test.info().attach('rankings-ordinary-state', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#neonRankingsDialog')).toBeHidden();
  await expect(page.locator('#neonRankingsBtn')).toBeFocused();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
  expect(await rankingBytes(page)).toEqual(before);
});

test('ACC-PRES-05 active-run rankings pause own focus block background keys and close without Resume', async ({ gamePage: page }) => {
  await rankingStorage(page); await neon(page); await start(page);
  const budget = createNativeResumeBudget({ maxResumes: 3, timeoutMs: 10000 });
  await waitForScoreWithNativeResume(page, { score: 10, maxResumes: 3, timeoutMs: 10000, budget });
  const before = await rankingBytes(page);
  await page.locator('#neonRankingsBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  await expect(page.locator('#neonRankingMode')).toBeFocused();
  await expect(page.locator('#neonRankingChallenge')).toHaveValue('pack-smoke-15738');
  await page.locator('#neonRankingsDialog').focus();
  for (const key of ['r', 'Space', 'ArrowUp']) await page.keyboard.press(key);
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  await expect(page.locator('#neonScore')).toHaveText('00010');
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => Boolean(document.activeElement.closest('#neonRankingsDialog')))).toBe(true); }
  await page.locator('#neonRankingsDoneBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  await expect(page.locator('#neonRankingsBtn')).toBeFocused();
  await expect(page.locator('#neonActionBtn')).toHaveText('Resume');
  expect(await rankingBytes(page)).toEqual(before);
});

test('ACC-PRES-05 summary rankings preserve immutable summary and manual Share fallback', async ({ gamePage: page }, info) => {
  await rankingStorage(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await neon(page); await start(page);
  await finishWithNativeResume(page, { maxResumes: 3, timeoutMs: 15000, info });
  await page.locator('#shareBtn').click();
  await expect(page.locator('#shareFallback')).toBeVisible();
  const share = await page.locator('#shareFallback').inputValue(), summary = await page.locator('#message').innerHTML(), before = await rankingBytes(page);
  await page.locator('#neonRankingsBtn').click();
  await page.locator('#neonRankingCategory').selectOption('casual');
  await page.locator('#neonRankingsDoneBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'summary');
  expect(await page.locator('#message').innerHTML()).toBe(summary);
  expect(await page.locator('#shareFallback').inputValue()).toBe(share);
  await expect(page.locator('#shareFallback')).toBeVisible();
  expect(await rankingBytes(page)).toEqual(before);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText() { return new Promise((resolve, reject) => { window.__rankingCopyResolve = resolve; window.__rankingCopyReject = reject; }); }
  } }));
  for (const completion of ['resolve', 'reject']) {
    await page.locator('#shareBtn').click();
    await page.locator('#neonRankingsBtn').click();
    await page.locator('#neonRankingsDoneBtn').click();
    await page.evaluate(completion => completion === 'resolve' ? window.__rankingCopyResolve() : window.__rankingCopyReject(new Error('Late clipboard fixture rejection')), completion);
    await expect(page.locator('#shareStatus')).toBeHidden();
    await expect(page.locator('#shareFallback')).toBeHidden();
    await expect(page.locator('#neonRankingsBtn')).toBeFocused();
    expect(await page.locator('#message').innerHTML()).toBe(summary);
    expect(await rankingBytes(page)).toEqual(before);
  }
});

test('ACC-PRES-05 denied score storage exposes honest session-only empty rankings without writes', async ({ gamePage: page }) => {
  await rankingStorage(page, { denied: true }); await neon(page);
  const before = await rankingBytes(page);
  await page.locator('#neonRankingsBtn').click();
  await expect(page.locator('#neonRankingsStorageStatus')).toHaveText('Scores are saved for this session only.');
  await expect(page.locator('#neonRankingsStorageStatus')).toBeVisible();
  await expect(page.locator('#neonRankingsEmpty')).toBeVisible();
  await page.locator('#neonRankingCategory').selectOption('daily');
  await page.locator('#neonRankingMode').selectOption('frenzy');
  await page.locator('#neonRankingsCloseBtn').click();
  expect(await rankingBytes(page)).toEqual(before);
});

if (!process.env.RELEASE_DIST) {
  test('ACC-PRES-05 source ranking ownership preserves paused engine practice eligibility and shared modal canvas ledger', async ({ gamePage: page }) => {
    await rankingStorage(page);
    await page.route('**/snake-three.html*', async route => {
      const response = await route.fetch();
      const hooks = `let rankingPauseCount=0,rankingPauseCheckpoint=null;const liveRankingPause=pauseGame;
        const rankSnapshot=()=>JSON.stringify({run:RUN_STATS.run,summary:RUN_STATS.lastSummary,best,score,
          seed:RNG.seed,initialSeed:RNG.initialSeed,identity:RNG.identity,rng:[prng.state,hazardPrng.state,RNG.stepCount,RNG.hazardCount],
          cells:segs.map(s=>[s.x,s.z,s.px,s.pz]),food,food2,foodVisible:[foodMesh.visible,foodMesh2.visible],
          prey:PREY_FX.entities.map(e=>[e.type,e.deadlineMs,e.hasHopped]),dir,inputQueue,pillars:HAZARDS.getPillarPositions(),
          clock:[SIMULATION.simNowMs,SIMULATION.fractionMs,SIMULATION.lastMoveMs,SIMULATION.nextMoveMs],
          metrics:[RUN_STATS.timeAlive,RUN_STATS.maxSpeedLevel,RUN_STATS.maxCombo,RUN_STATS.foodBreakdown],
          records:SCORE_STORE.memory,stored:localStorage.getItem(SCORE_KEY)});
        pauseGame=function(...args){const playing=state==='playing';const result=liveRankingPause(...args);
          if(playing){rankingPauseCount++;rankingPauseCheckpoint=rankSnapshot();}return result;};
        window.__rankOwnership={snap:rankSnapshot,count:()=>rankingPauseCount,checkpoint:()=>rankingPauseCheckpoint,
          titleProtected:()=>JSON.stringify({run:RUN_STATS.run,summary:RUN_STATS.lastSummary,best,
            seed:RNG.seed,initialSeed:RNG.initialSeed,identity:RNG.identity,rng:[prng.state,hazardPrng.state,RNG.stepCount,RNG.hazardCount],
            clock:[SIMULATION.simNowMs,SIMULATION.fractionMs,SIMULATION.nextMoveMs],records:SCORE_STORE.memory,
            stored:localStorage.getItem(SCORE_KEY)}),
          noOverlap(){SETTINGS.open();return {settings:SETTINGS.isOpen,rankings:NEON_RANKINGS.isOpen};},
          toOriginal(){PRESENTATION.request('original',{persist:false});},
          practice(){RUN_STATS.run=Object.freeze({...RUN_STATS.run,category:'practice'});PRESENTATION.syncHUD();},
          owner(){return {run:RUN_STATS.run,records:SCORE_STORE.memory.records.length,summary:RUN_STATS.lastSummary,
            modalEntries:UI_SCREEN.inertBefore.filter(entry=>entry.el===renderer.domElement).length};}};`;
      await route.fulfill({ response, body: sourceAdapter(localImports(await response.text(), new URL(route.request().url()).origin + '/'), { hooks }) });
    });
    await neon(page);
    const title = await page.evaluate(() => window.__rankOwnership.titleProtected());
    expect(JSON.parse(title)).toMatchObject({ run: null, summary: null });
    await page.locator('#neonRankingsBtn').click();
    await page.locator('#neonRankingCategory').selectOption('casual');
    expect(await page.evaluate(() => window.__rankOwnership.titleProtected())).toBe(title);
    await page.locator('#neonRankingsDoneBtn').click();
    expect(await page.evaluate(() => window.__rankOwnership.titleProtected())).toBe(title);
    await start(page);
    const count = await page.evaluate(() => window.__rankOwnership.count());
    await page.locator('#neonRankingsBtn').click();
    expect(await page.evaluate(() => window.__rankOwnership.count())).toBe(count + 1);
    const checkpoint = await page.evaluate(() => window.__rankOwnership.checkpoint());
    expect(await page.evaluate(() => window.__rankOwnership.snap())).toBe(checkpoint);
    await page.locator('#neonRankingMode').selectOption('frenzy');
    await page.locator('#neonRankingCategory').selectOption('daily');
    expect(await page.evaluate(() => window.__rankOwnership.snap())).toBe(checkpoint);
    expect(await page.evaluate(() => window.__rankOwnership.noOverlap())).toEqual({ settings: false, rankings: true });
    await page.locator('#neonRankingsDoneBtn').click();
    expect(await page.evaluate(() => window.__rankOwnership.snap())).toBe(checkpoint);
    await page.evaluate(() => window.__rankOwnership.practice());
    const practice = await page.evaluate(() => window.__rankOwnership.owner());
    await page.locator('#neonRankingsBtn').click();
    await expect(page.locator('#neonRankingCategory')).toHaveValue('practice');
    await expect(page.locator('#neonRankingsPractice')).toBeVisible();
    await expect(page.locator('#neonRankingsList li')).toHaveCount(0);
    await page.locator('#neonRankingCategory').selectOption('casual');
    expect((await page.evaluate(() => window.__rankOwnership.owner())).run).toEqual(practice.run);
    await page.evaluate(() => window.__rankOwnership.toOriginal());
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'original');
    expect(await page.locator('canvas').evaluate(node => node.inert)).toBe(true);
    expect((await page.evaluate(() => window.__rankOwnership.owner())).modalEntries).toBe(1);
    await page.locator('canvas').evaluate(node => node.focus());
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('#neonRankingsDialog')))).toBe(true);
    await page.locator('#neonRankingsDoneBtn').click();
    expect(await page.locator('canvas').evaluate(node => node.inert)).toBe(false);
    await expect(page.locator('#actionBtn')).toBeFocused();
    const after = await page.evaluate(() => window.__rankOwnership.owner());
    expect(after).toMatchObject({ run: practice.run, records: practice.records, summary: null });
  });
  test('ACC-PRES-04 source HUD queries pending scope read-only and invalidates same-length record replacement', async ({ gamePage: page }) => {
    await page.route('**/snake-three.html*', async route => {
      const response = await route.fetch();
      const hooks = `window.__neonHUD = {
        idle(){PRESENTATION.syncHUD();const observer=new MutationObserver(()=>{});
          observer.observe(document.getElementById('neonCabinet'),{subtree:true,attributes:true,childList:true,characterData:true});
          for(let i=0;i<20;i++)PRESENTATION.syncHUD();const records=observer.takeRecords();observer.disconnect();
          return {mutations:records.length,samples:20};},
        state(){PRESENTATION.syncHUD();return {scope:PRESENTATION.scopeForHUD(),best,run:RUN_STATS.run,
          stored:localStorage.getItem(SCORE_KEY),score:document.getElementById('neonScore').textContent,
          displayedBest:document.getElementById('neonBest').textContent,level:document.getElementById('neonLevel').textContent,
          combo:document.getElementById('neonCombo').textContent};},
        replace(scoreValue){const total=scoreValue/10;SCORE_STORE.memory.records=[validatedScore({schemaVersion:2,rulesVersion:2,
          runId:'hud-fixture-'+scoreValue,mode:'classic',seed:'presentation-regression',isDaily:false,dailyDate:null,category:'custom',
          score:scoreValue,length:3+total,timeMs:total*115,maxSpeedLevel:1,maxCombo:1,
          foodBreakdown:{common:total,golden:0,jittery:0,total},outcome:'wall',completedAt:'2026-10-10T00:00:00.000Z'})];
          if(!SCORE_STORE.memory.records[0])throw Error('Invalid HUD source fixture');}
      };`;
      await route.fulfill({ response, body: sourceAdapter(localImports(await response.text(), new URL(route.request().url()).origin + '/'), { hooks }) });
    });
    await neon(page, query);
    expect(await page.evaluate(() => window.__neonHUD.idle())).toEqual({ mutations: 0, samples: 20 });
    const initial = await page.evaluate(() => window.__neonHUD.state());
    expect(initial).toMatchObject({ run: null, score: '00000', level: '01', combo: '—',
      scope: { rulesVersion: 2, mode: 'classic', seed: 'presentation-regression', category: 'custom' } });
    await page.evaluate(() => window.__neonHUD.replace(10));
    expect((await page.evaluate(() => window.__neonHUD.state())).displayedBest).toBe('00010');
    await page.evaluate(() => window.__neonHUD.replace(20));
    const updated = await page.evaluate(() => window.__neonHUD.state());
    expect(updated).toMatchObject({ displayedBest: '00020', best: initial.best, run: null, stored: initial.stored });
    await start(page); await settings(page);
    const active = await page.evaluate(() => window.__neonHUD.state());
    await page.locator('#settingsModeSelector [data-mode="frenzy"]').click();
    const pending = await page.evaluate(() => window.__neonHUD.state());
    expect(pending.scope).toEqual(active.scope); expect(pending.run).toEqual(active.run);
    expect(pending.scope.mode).toBe('classic'); expect(pending.stored).toBe(initial.stored);
  });
  test('ACC-PRES-03 source parked switch preserves run simulation streams cells metrics and score bytes', async ({ gamePage: page }) => {
    await page.route('**/snake-three.html*', async route => {
      const response = await route.fetch();
      const hooks = `window.__presentationState = () => JSON.stringify({
        run: RUN_STATS.run, seedIntent: challengeSelection.seedIntent,
        seed: RNG.seed, initialSeed: RNG.initialSeed, identity: RNG.identity,
        rng: [prng.state, hazardPrng.state, RNG.stepCount, RNG.hazardCount],
        cells: segs.map(s => [s.x,s.z,s.px,s.pz]), dir, inputQueue, score,
        clock: [SIMULATION.simNowMs,SIMULATION.fractionMs,SIMULATION.lastMoveMs,SIMULATION.nextMoveMs,SIMULATION.movements],
        prey: PREY_FX.entities.map(e => ({type:e.type,deadline:e.deadlineMs,hasHopped:e.hasHopped})),
        food, food2, foodVisible:[foodMesh.visible,foodMesh2.visible], pillars:HAZARDS.getPillarPositions(),
        combo:[COMBO_FX.streak,COMBO_FX.multiplier,COMBO_FX.deadlineMs],
        metrics:[RUN_STATS.timeAlive,RUN_STATS.maxSpeedLevel,RUN_STATS.maxCombo,RUN_STATS.foodBreakdown],
        summary:RUN_STATS.lastSummary, stored:localStorage.getItem(SCORE_KEY)
      });`;
      await route.fulfill({ response, body: sourceAdapter(localImports(await response.text(), new URL(route.request().url()).origin + '/'), { hooks }) });
    });
    await preferences(page, { quality: 'low', aa: 'none', sound: false });
    await open(page, query); await attachPresentationEvidence(page, test.info(), 'original');
    await choice(page, 'presentationSelector', 'neon-district').click();
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'neon-district');
    await attachPresentationEvidence(page, test.info(), 'neon-district');
    await choice(page, 'presentationSelector', 'original').click();
    await attachPresentationEvidence(page, test.info(), 'original');
    await start(page); await settings(page);
    const before = await page.evaluate(() => window.__presentationState());
    expect(JSON.parse(before)).toMatchObject({
      seedIntent: 'pinned', seed: 'presentation-regression', initialSeed: 'presentation-regression',
      identity: JSON.stringify([2, 'classic', 'presentation-regression']),
      run: { seed: 'presentation-regression', rulesVersion: 2, mode: 'classic', category: 'custom' }
    });
    await choice(page, 'settingsPresentationSelector', 'neon-district').click();
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'neon-district');
    expect(await page.evaluate(() => window.__presentationState())).toBe(before);
    await choice(page, 'settingsPresentationSelector', 'original').click();
    expect(await page.evaluate(() => window.__presentationState())).toBe(before);
  });
}

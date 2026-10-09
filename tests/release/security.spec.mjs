import { test, expect } from '../helpers/release-fixture.mjs';
import { open, start } from '../helpers/player-flow.mjs';
// Explicit security fixture preferences; default Auto cold-gap ownership is retained
// separately in the E04 diagnostic. This does not bypass the runtime's >250ms policy.
test.beforeEach(async({gamePage:page})=>{
  await page.addInitScript(()=>localStorage.setItem('threejs-snake-settings',JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',sound:false,haptics:false}})));
});
async function finish(page){
  for(let attempt=0;attempt<4;attempt++){
    await page.waitForFunction(()=>['paused','summary'].includes(document.body.dataset.screen),undefined,{timeout:5000});
    await expect(page.locator('#bootError')).toBeHidden();
    expect(await page.evaluate(()=>({hidden:document.hidden,failure:window.__snakeFailure,lost:(document.querySelector('canvas').getContext('webgl2')||document.querySelector('canvas').getContext('webgl')).isContextLost()}))).toEqual({hidden:false,failure:null,lost:false});
    if(await page.locator('body').getAttribute('data-screen')==='summary'){await expect(page.locator('.summary-grid')).toBeVisible();await expect(page.locator('#title')).toHaveText(/Game Over|You Win!/);return;}
    await expect(page.locator('#title')).toHaveText('Paused');await expect(page.locator('#actionBtn')).toHaveText('Resume');await expect(page.locator('#actionBtn')).toBeEnabled();
    await page.locator('#actionBtn').click(); // Bounded explicit trusted Resume, never automatic runtime resume.
  }
  throw Error('Security fixture did not reach a completed summary after bounded native resumes');
}
const hostile = '<img src=x onerror="window.__releaseProbe=1">';
const fallback = 'This challenge cannot be loaded. Starting a new Classic game.';
const query = values => `?${new URLSearchParams(values)}`;
async function inert(page) {
  expect(await page.evaluate(() => window.__releaseProbe)).toBeUndefined();
  expect(await page.locator('#message img, #message script, #challengeStatus img, #challengeStatus script').count()).toBe(0);
}
async function titleArmed(page, mode = 'classic') {
  await expect(page.locator('#actionBtn')).toHaveText('Start game');
  await expect(page.locator(`#modeSelector [data-mode="${mode}"]`)).toHaveClass(/active/);
  await expect(page.locator('#overlay')).toBeVisible();
  expect(await page.evaluate(() => typeof window.RUN_STATS)).toBe('undefined');
}
test('ACC-SEC-01 hostile URL seed remains literal in summary', async ({ gamePage: page }) => {
  const injectedRequests = [];
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/x')) injectedRequests.push(request.url()); });
  await open(page, query({ seed: hostile, mode: 'classic', rules: '2' }));
  await titleArmed(page);
  await start(page); await finish(page);
  await expect(page.locator('#message strong')).toHaveText(hostile);
  await inert(page);
  expect(injectedRequests).toEqual([]);
});
test('ACC-SEC-02 poisoned v2 metadata and earlier-rules archive remain safe and isolated through real UI', async ({ gamePage: page }) => {
  const legacy = { score: 987654, length: 12, timeSec: 30, maxCombo: 2, maxSpeedLevel: 3, mode: 'classic', date: '2026-10-08T12:00:00.000Z', seed: hostile, outcome: 'wall' };
  const legacyPoison = [
    ...['score','length','timeSec','maxCombo','maxSpeedLevel','mode','date','outcome'].map(field=>({...legacy,score:999999,[field]:hostile})),
    ...[['classic'],{toString:'classic'},1].map(mode=>({...legacy,score:999999,mode}))
  ];
  const valid={schemaVersion:2,rulesVersion:2,runId:'security-current-valid',mode:'classic',category:'custom',seed:hostile,isDaily:false,dailyDate:null,score:20,length:5,timeMs:30000,maxSpeedLevel:1,maxCombo:1,foodBreakdown:{common:2,golden:0,jittery:0,total:2},outcome:'wall',completedAt:'2026-10-08T12:00:00.000Z'};
  const poisoned=[
    ...['schemaVersion','rulesVersion','mode','category','isDaily','dailyDate','score','length','timeMs','maxSpeedLevel','maxCombo','foodBreakdown','outcome','completedAt'].map(field=>({...valid,runId:'poison-'+field,[field]:hostile})),
    ...[['classic'],{toString:'classic'},1].map((mode,i)=>({...valid,runId:'poison-mode-'+i,mode})),
    {...valid,runId:{toString:hostile}},
    {...valid,runId:'poison-total',foodBreakdown:{common:2,golden:0,jittery:0,total:3}},
    {...valid,runId:'poison-date',completedAt:'2026-02-30T12:00:00.000Z'}
  ];
  const otherScope={...valid,runId:'security-other-scope',seed:'separate-challenge',score:30,length:6,foodBreakdown:{common:3,golden:0,jittery:0,total:3},maxSpeedLevel:2};
  await page.addInitScript(({legacy,legacyPoison,valid,poisoned,otherScope})=>{
    if(!sessionStorage.getItem('__securityStorageSeeded')){
      localStorage.setItem('threejs-snake-leaderboard',JSON.stringify([legacy,...legacyPoison]));
      localStorage.setItem('threejs-snake-best','<img src=x onerror="window.__releaseProbe=1">');
      localStorage.setItem('threejs-snake-mode','__proto__');
      localStorage.setItem('threejs-snake-scores-v2',JSON.stringify({schemaVersion:2,records:[valid,otherScope,...poisoned],legacy:{best:null,records:[]},legacyImported:false}));
      sessionStorage.setItem('__securityStorageSeeded','1');
    }
    window.__legacyOriginal={best:localStorage.getItem('threejs-snake-best'),records:localStorage.getItem('threejs-snake-leaderboard')};window.__legacyWrites=[];
    const put=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(['threejs-snake-best','threejs-snake-leaderboard'].includes(key))window.__legacyWrites.push(key);return put.call(this,key,value);};
  },{legacy,legacyPoison,valid,poisoned,otherScope});
  const injectedRequests=[];page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/x'))injectedRequests.push(r.url());});
  await open(page); // Ordinary saved-mode validation remains unmasked by URL mode.
  await titleArmed(page);expect(await page.evaluate(()=>window.__legacyWrites)).toEqual([]);await inert(page);
  await open(page,query({seed:hostile,mode:'classic',rules:'2'}));
  await titleArmed(page);await start(page);await finish(page);await inert(page);
  await expect(page.locator('#message strong')).toHaveText(hostile);await page.locator('#leaderboardBtn').click();
  await expect(page.locator('#rankingMode')).toHaveValue('classic');await expect(page.locator('#rankingCategory')).toHaveValue('custom');await expect(page.locator('#rankingChallenge')).toHaveValue(hostile);
  await expect(page.locator('.lb-list .lb-score').filter({hasText:/^20 pts$/})).toHaveCount(1);
  await expect(page.locator('.lb-list')).not.toContainText('987654 pts');await expect(page.locator('.lb-list')).not.toContainText('30 pts');
  await expect(page.locator('.earlier-rules')).toContainText('Legacy scores — earlier rules');
  await expect(page.locator('.earlier-rules .lb-score').filter({hasText:/^987654 pts$/})).toHaveCount(1);
  await expect(page.locator('#message')).not.toContainText('999999 pts');
  await page.locator('#rankingChallenge').selectOption('separate-challenge');await expect(page.locator('.lb-list .lb-score').filter({hasText:/^30 pts$/})).toHaveCount(1);await expect(page.locator('.lb-list')).not.toContainText('20 pts');
  await page.locator('#rankingChallenge').selectOption(hostile);await inert(page);
  const stored=await page.evaluate(()=>({mode:localStorage.getItem('threejs-snake-mode'),writes:window.__legacyWrites,best:localStorage.getItem('threejs-snake-best'),legacy:localStorage.getItem('threejs-snake-leaderboard'),original:window.__legacyOriginal,records:JSON.parse(localStorage.getItem('threejs-snake-scores-v2')).records}));
  expect(stored.mode).toBe('__proto__');expect(stored.writes).toEqual([]);expect(stored.best).toBe(stored.original.best);expect(stored.legacy).toBe(stored.original.records);
  expect(stored.records.some(r=>r.runId==='security-current-valid')).toBe(true);expect(stored.records.some(r=>r.runId?.startsWith('poison-')||r.score===999999)).toBe(false);expect(injectedRequests).toEqual([]);
});
for (const seed of ['雪🐍e\u0301<&"\' >', '  space matters  ', '🐍'.repeat(128), 'DAILY-2024-02-29']) {
  test(`ACC-SEC-03 valid Unicode/calendar seed round-trips unchanged ${seed.slice(0, 12)}`, async ({ gamePage: page }) => {
    await page.addInitScript(() => localStorage.setItem('threejs-snake-mode', 'frenzy'));
    await open(page, query({ seed }));
    await titleArmed(page);
    await start(page); await finish(page);
    await expect(page.locator('#message strong')).toHaveText(seed, { useInnerText: false });
    expect(await page.locator('#message strong').textContent()).toBe(seed);
    expect(await page.evaluate(() => localStorage.getItem('threejs-snake-mode'))).toBe('frenzy');
    await inert(page);
  });
}
for (const [name, values] of [
  ['empty', { seed: '' }], ['C0', { seed: 'bad\u0000seed' }], ['C1', { seed: 'bad\u0085seed' }],
  ['129 codepoints', { seed: '🐍'.repeat(129) }], ['unsupported rules', { seed: 'safe', rules: '999' }],
  ['impossible day', { seed: 'DAILY-2026-02-29' }], ['impossible month', { seed: 'DAILY-2026-13-01' }],
  ['prototype mode with invalid rules', { seed: 'safe', mode: '__proto__', rules: '999' }]
]) {
  test(`ACC-SEC-03 invalid ${name} uses fixed fallback and ordinary Classic`, async ({ gamePage: page }) => {
    await page.addInitScript(() => localStorage.setItem('threejs-snake-mode', 'frenzy'));
    await open(page, query(values));
    await titleArmed(page);
    await expect(page.locator('#challengeStatus')).toHaveText(fallback);
    expect(await page.evaluate(() => localStorage.getItem('threejs-snake-mode'))).toBe('frenzy');
    await start(page); await finish(page);
    await expect(page.locator('#message strong')).toHaveText(/^CASUAL-[0-9a-f]{32}$/);
    await inert(page);
  });
}
test('ACC-SEC-03 first duplicate parameters win and unknown mode uses Classic without storing fallback', async ({ gamePage: page }) => {
  await page.addInitScript(() => localStorage.setItem('threejs-snake-mode', 'calm'));
  await open(page, '?seed=first&seed=second&mode=__proto__&mode=frenzy&rules=2&rules=999');
  await titleArmed(page);
  await expect(page.locator('#challengeStatus')).toHaveText('Unknown difficulty. Using Classic.');
  expect(await page.evaluate(() => localStorage.getItem('threejs-snake-mode'))).toBe('calm');
  await start(page); await finish(page);
  await expect(page.locator('#message strong')).toHaveText('first');
});

test('ACC-SEC-03 supported modes and daily shorthand arm title; ordinary visits use saved mode', async ({ gamePage: page }) => {
  await page.addInitScript(() => localStorage.setItem('threejs-snake-mode', 'calm'));
  await open(page); await titleArmed(page, 'calm');
  for (const mode of ['calm', 'classic', 'frenzy']) {
    await open(page, query({ seed: 'mode-enum', mode, rules: '2' }));
    await titleArmed(page, mode);
    expect(await page.evaluate(() => localStorage.getItem('threejs-snake-mode'))).toBe('calm');
  }
  await open(page, query({ seed: 'daily', mode: 'frenzy', rules: '2' }));
  await titleArmed(page, 'frenzy');
  await expect(page.locator('#dailyBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#dailyBtn')).toContainText(await page.evaluate(() => new Date().toISOString().slice(0, 10)));
});

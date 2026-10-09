import { test, expect } from '../helpers/release-fixture.mjs';
import { open, start, finishWithNativeResume, settings } from '../helpers/player-flow.mjs';
const completePositive=page=>finishWithNativeResume(page,{info:test.info()});
import { localImports, sourceAdapter } from '../helpers/source-adapter.mjs';
const query='?seed=input-regression&mode=classic&rules=2';
async function seedSettings(page, keymap='wasd_arrows') {
  await page.addInitScript(keymap=>localStorage.setItem('threejs-snake-settings',JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',sound:false,haptics:false,keymap}})),keymap);
}
async function playingSettings(page) { await open(page,query); await start(page); await settings(page); }
const screen=(page,value)=>expect(page.locator('body')).toHaveAttribute('data-screen',value);

test('ACC-INPUT-01 settings native activation never moves/restarts hidden player and blocks global shortcuts', async ({gamePage:page})=>{
  await seedSettings(page); await playingSettings(page);
  await screen(page,'paused');
  const telemetry=await page.locator('#settingsTelemetry').textContent();
  await page.locator('#settingsModal').focus();
  for(const key of ['Space','Enter','r','q','b','m','t','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d']) await page.keyboard.press(key);
  await screen(page,'paused'); await expect(page.locator('#settingsTelemetry')).toHaveText(telemetry);
  await expect(page.locator('#settingsModal')).toBeVisible();
  await page.locator('#soundToggleBtn').focus();
  await page.keyboard.press('Space'); await expect(page.locator('#soundToggleBtn')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Enter'); await expect(page.locator('#soundToggleBtn')).toHaveAttribute('aria-pressed','false');
  await screen(page,'paused');
  await page.keyboard.press('Escape'); await screen(page,'paused');
  // Editable content owns global keys even outside a modal.
  await page.evaluate(()=>{const input=document.createElement('input');input.id='editableProbe';document.body.append(input);input.focus();});
  await page.keyboard.type('rqbmt'); await page.keyboard.press('Space'); await page.keyboard.press('ArrowUp');
  await screen(page,'paused'); await expect(page.locator('#editableProbe')).toHaveValue('rqbmt ');
});

test('ACC-INPUT-02 modal traps focus and Escape restores Resume; native Space resumes once', async ({gamePage:page})=>{
  await seedSettings(page); await playingSettings(page);
  await expect(page.locator('#settingsModeSelector [data-mode="classic"]')).toBeVisible();
  await expect(page.locator('#settingsModeSelector [data-mode="classic"]')).toBeFocused();
  await page.locator('#closeSettingsBtn').focus(); await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#closeSettingsBtnAction')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#closeSettingsBtn')).toBeFocused();
  expect(await page.evaluate(()=>document.getElementById('overlay').inert && document.querySelector('canvas').inert)).toBe(true);
  await page.evaluate(()=>document.getElementById('actionBtn').focus());
  expect(await page.evaluate(()=>document.getElementById('settingsModal').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await screen(page,'paused'); await expect(page.locator('#actionBtn')).toBeFocused();
  expect(await page.evaluate(()=>document.getElementById('overlay').inert)).toBe(false);
  await page.keyboard.press('Space'); await screen(page,'playing'); await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  await page.keyboard.press('Space'); await screen(page,'paused');
});

test('ACC-INPUT-02 title and summary modal return preserves their screen and summary', async ({gamePage:page})=>{
  await seedSettings(page); await open(page,query); await settings(page); await screen(page,'title');
  await page.keyboard.press('Escape'); await screen(page,'title'); await expect(page.locator('#settingsBtn')).toBeFocused();
  await start(page); await completePositive(page); await screen(page,'summary');
  const summary=await page.locator('#message').textContent();
  await settings(page); await screen(page,'summary'); await page.keyboard.press('Escape');
  await screen(page,'summary'); await expect(page.locator('#message')).toHaveText(summary);
});

test('ACC-INPUT-02 keyboard from nonfocusable body restores the meaningful title action',async({gamePage:page})=>{
  await seedSettings(page); await open(page,query);
  await page.evaluate(()=>document.activeElement.blur());
  expect(await page.evaluate(()=>document.activeElement===document.body)).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.locator('#settingsModal')).toBeVisible();
  await page.keyboard.press('Escape'); await screen(page,'title'); await expect(page.locator('#actionBtn')).toBeFocused();
});

for(const [map,legal,illegal] of [['wasd','w','ArrowUp'],['arrows','ArrowUp','w'],['ijkl','i','w'],['hjkl','k','ArrowUp']]) {
  test(`ACC-INPUT-03 ${map} title takeover accepts its map and ignores unmapped keys`,async({gamePage:page})=>{
    await seedSettings(page); await open(page,query); await settings(page);
    await page.locator(`#keymapPills [data-keymap="${map}"]`).click(); await page.keyboard.press('Escape');
    await page.keyboard.press(illegal); await screen(page,'title');
    await page.keyboard.press(legal); await screen(page,'playing');
  });
}

test('ACC-INPUT-04 explicit pause telemetry Restart and Return to title close modal before transition',async({gamePage:page})=>{
  await seedSettings(page); await playingSettings(page);
  await expect(page.locator('#settingsTelemetry')).toHaveText(/Score: \d+ · Length: \d+ · Time: \d+:\d{2}/);
  await page.locator('#settingsRestartBtn').click(); await screen(page,'playing'); await expect(page.locator('#settingsModal')).toBeHidden();
  await page.keyboard.press('Space'); await screen(page,'paused'); await expect(page.locator('#pauseTelemetry')).toHaveText(/Score: 0 · Length: 3 · Time:/);
  await page.locator('#returnTitleBtn').click(); await screen(page,'title'); await expect(page.locator('#actionBtn')).toHaveText('Start game');
  await start(page); await settings(page); await page.locator('#settingsTitleBtn').click();
  await screen(page,'title'); await expect(page.locator('#settingsModal')).toBeHidden();
});

if(!process.env.RELEASE_DIST) {
 test.describe('source invariant arrangements',()=>{
  test.use({sourceHooks:true});
  async function arrange(page) {
    await page.route('**/snake-three.html*',async route=>{
      const response=await route.fetch();
      const hooks=`const realStart=startGame;startGame=function(){realStart();stepMs=100000;};
        const realResume=resumeGame;window.__resumeCalls=0;resumeGame=function(){window.__resumeCalls++;return realResume();};
        window.__inputScenario={
          snapshot(){return JSON.stringify({state,screen:UI_SCREEN.screen,seed:RNG.seed,cells:segs.map(s=>[s.x,s.z]),score,time:RUN_STATS.timeAlive});},
          queue(){return inputQueue.map(d=>({...d}));}, direction(){return {...dir};}, move(){step();},
          telemetry(){score=120;RUN_STATS.timeAlive=63.7;},
          stale(){DEATH.OVERLAY_DELAY_MS=1000;showDeathOverlay('Game Over','Old callback','Play again');},
          held(){window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',repeat:true,bubbles:true}));}
        };`;
      await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL(route.request().url()).origin+'/'),{hooks})});
    });
  }
  test('ACC-INPUT-01 source input/audio clear and held repeats cannot repopulate queue after Resume',async({gamePage:page})=>{
    await seedSettings(page); await arrange(page); await open(page,query); await start(page);
    await page.keyboard.press('ArrowUp'); expect(await page.evaluate(()=>window.__inputScenario.queue())).toEqual([{x:0,z:-1}]);
    await settings(page); expect(await page.evaluate(()=>window.__inputScenario.queue())).toEqual([]);
    const before=await page.evaluate(()=>window.__inputScenario.snapshot());
    for(const key of ['Space','Enter','r','ArrowUp','w','q']) {await page.locator('#settingsModal').focus();await page.keyboard.press(key);}
    expect(await page.evaluate(()=>window.__inputScenario.snapshot())).toBe(before);
    expect(await page.evaluate(()=>window.__resumeCalls)).toBe(0);
    expect(await page.evaluate(()=>window.AUDIO.droneSilent)).toBe(true);
    await page.locator('#closeSettingsBtnAction').focus();
    await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
    await screen(page,'paused'); expect(await page.evaluate(()=>window.__resumeCalls)).toBe(0);
    await page.keyboard.press('Space'); expect(await page.evaluate(()=>window.__resumeCalls)).toBe(1);
    await page.evaluate(()=>window.__inputScenario.held()); expect(await page.evaluate(()=>window.__inputScenario.queue())).toEqual([]);
  });
  test('ACC-INPUT-03 source first legal title direction is queued and applied; reversal ignored',async({gamePage:page})=>{
    await seedSettings(page,'ijkl'); await arrange(page); await open(page,query);
    await page.keyboard.press('j'); await screen(page,'title');
    await page.keyboard.press('i'); await screen(page,'playing');
    expect(await page.evaluate(()=>window.__inputScenario.queue())).toEqual([{x:0,z:-1}]);
    await page.evaluate(()=>window.__inputScenario.move());
    expect(await page.evaluate(()=>window.__inputScenario.direction())).toEqual({x:0,z:-1});
  });
  test('ACC-INPUT-04 source telemetry and stale death callback canceled on modal Restart and Return to title',async({gamePage:page})=>{
    await seedSettings(page); await arrange(page); await open(page,query); await start(page); await page.keyboard.press('Space');
    await page.evaluate(()=>window.__inputScenario.telemetry()); await settings(page);
    await expect(page.locator('#settingsTelemetry')).toHaveText('Score: 120 · Length: 3 · Time: 01:03');
    await page.evaluate(()=>window.__inputScenario.stale()); await page.locator('#settingsRestartBtn').click();
    await page.waitForTimeout(1100); await screen(page,'playing'); await expect(page.locator('#overlay')).toHaveClass(/hidden/);
    await settings(page); await page.evaluate(()=>window.__inputScenario.stale()); await page.locator('#settingsTitleBtn').click();
    await settings(page); await page.waitForTimeout(1100); await screen(page,'title');
    await expect(page.locator('#title')).not.toHaveText('Game Over');
  });
 });
}

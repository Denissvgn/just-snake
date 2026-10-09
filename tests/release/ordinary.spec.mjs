import { test, expect } from '../helpers/release-fixture.mjs';
import { open, start, finish, settings } from '../helpers/player-flow.mjs';
test('A01 ordinary page boots with no mutable legacy globals', async ({ gamePage: page }) => {
  await open(page);
  const names = ['RNG', 'SETTINGS', 'MODES', 'renderer', 'scene', 'food', 'segs', 'setSeed', 'startGame', 'setStepMs', 'compMat', 'HUD_FX'];
  expect(await page.evaluate(keys => keys.filter(key => key in window), names)).toEqual([]);
  await start(page); await expect(page.locator('#overlay')).not.toBeVisible();
});

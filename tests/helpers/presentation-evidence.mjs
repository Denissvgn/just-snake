// Fixed public UI contracts. Never derive selectors or executable code from storage.
export function presentationDescriptor(id = 'original') {
  id ??= 'original';
  if (!['original', 'neon-district'].includes(id)) throw Error('Unknown effective presentation');
  return Object.freeze(id === 'original'
    ? { id, primary: '#actionBtn', settings: '#settingsBtn', score: '#score' }
    : { id, primary: '#neonActionBtn', settings: '#neonSettingsBtn', score: '#neonScore' });
}

export async function activePresentationDescriptor(page) {
  return presentationDescriptor(await page.locator('body').getAttribute('data-presentation'));
}

export function activeControlSelector(action) {
  if (!['primary', 'settings'].includes(action)) throw Error('Unknown native action');
  // Locator resolution stays live while a cold view commits asynchronously.
  // Unknown body values match neither branch, and no selector comes from storage.
  const original = presentationDescriptor('original')[action], neon = presentationDescriptor('neon-district')[action];
  return `body:is([data-presentation="original"],:not([data-presentation])) ${original}, body[data-presentation="neon-district"] ${neon}`;
}

export function observationPrimary(value) {
  const descriptor = presentationDescriptor(value.presentation);
  if (value.action?.selector && value.action.selector !== descriptor.primary) throw Error('Stale primary control');
  return descriptor.primary;
}

export function observedScore(value) {
  const { id } = presentationDescriptor(value.presentation);
  if (value.screen === 'playing' && (id === 'neon-district' ? value.scoreVisible !== true : value.scoreVisible === false)) throw Error('Playing score must be visible');
  const text = value.scoreText || '';
  const match = (id === 'original' ? /^Score: (0|[1-9]\d*)$/ : /^(\d{5,})$/).exec(text);
  const actual = match ? Number(match[1]) : NaN;
  return id === 'neon-district' && text !== String(actual).padStart(5, '0') ? NaN : actual;
}

// Self-contained because Playwright serializes this function into the browser.
// All reads in a progress poll form one atomic observation, including the view.
export function observePresentation({ expectedPresentation = null, wait = null, score = 10, comparison = 'exact' } = {}) {
  const id = document.body.dataset.presentation || 'original';
  const known = id === 'original' || id === 'neon-district';
  const primary = id === 'neon-district' ? '#neonActionBtn' : '#actionBtn';
  const scoreSelector = id === 'neon-district' ? '#neonScore' : '#score';
  const visible = el => Boolean(el && !el.hidden && !el.closest('[hidden],[inert]') &&
    getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility === 'visible' &&
    [...el.getClientRects()].some(r => r.width > 0 && r.height > 0));
  const canvas = document.querySelector('canvas');
  const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
  const action = document.querySelector(primary), scoreElement = document.querySelector(scoreSelector);
  const board = document.querySelector(id === 'neon-district' ? '#neonBoardViewport' : 'canvas');
  const value = {
    capturedAt: performance.now(), presentation: id, presentationDeclared: document.body.hasAttribute('data-presentation'), requestedPresentation: document.body.dataset.presentationRequested,
    renderedPresentation: document.body.dataset.presentationRendered,
    presentationError: !known ? 'Unknown effective presentation' : expectedPresentation && id !== expectedPresentation ? 'Effective presentation changed' : null,
    screen: document.body.dataset.screen, title: document.getElementById('title')?.textContent.trim(),
    scoreText: scoreElement?.textContent, scoreVisible: visible(scoreElement), scoreSelector,
    overlayVisible: visible(document.getElementById('overlay')), hidden: document.hidden,
    visibility: document.visibilityState, focused: document.hasFocus(),
    modalVisible: ['settingsModal', 'neonRankingsDialog'].some(name => visible(document.getElementById(name))),
    bootErrorVisible: visible(document.getElementById('bootError')), failure: window.__snakeFailure ?? null,
    lost: gl ? gl.isContextLost() : null, booted: window.__snakeBooted === true,
    renderedFrames: window.__snakeRenderedFrames, boardVisible: visible(board),
    boardBounds: board?.getBoundingClientRect().toJSON(), canvasCount: document.querySelectorAll('canvas').length,
    summaryVisible: visible(document.querySelector('.summary-grid')),
    action: { selector: primary, text: action?.textContent.trim(), visible: visible(action),
      enabled: Boolean(action && !action.matches(':disabled') && action.getAttribute('aria-disabled') !== 'true') },
    pauseTelemetry: document.getElementById('pauseTelemetry')?.textContent
  };
  if (!wait) return value;
  const healthy = !value.presentationError && !value.hidden && value.visibility === 'visible' && value.focused &&
    !value.modalVisible && !value.bootErrorVisible && value.failure === null && value.lost === false && value.booted;
  if (!healthy) return value;
  if (wait === 'rendered') return value.renderedPresentation === undefined && value.presentationDeclared ? false : value;
  if (wait === 'summary') return value.screen !== 'summary' ||
    value.summaryVisible && /^(Game Over|You Win!)$/.test(value.title) ? value : false;
  if (wait === 'completion') return value.screen === 'playing' ? false : value;
  const match = (id === 'original' ? /^Score: (0|[1-9]\d*)$/ : /^(\d{5,})$/).exec(value.scoreText || '');
  let actual = match ? Number(match[1]) : NaN;
  if (id === 'neon-district' && value.scoreText !== String(actual).padStart(5, '0')) actual = NaN;
  if (value.screen === 'playing' && value.scoreVisible && Number.isSafeInteger(actual) && actual >= 0 && actual < score) return false;
  return value;
}

export async function attachPresentationEvidence(page, info, expected) {
  expected ??= (await activePresentationDescriptor(page)).id;
  // A count left over from Original cannot certify the newly selected scene.
  // Call before source fixtures park the animation owner; parked fixtures attach
  // their independently instrumented explicit-view draw proof instead.
  const before = await page.evaluate(() => window.__snakeRenderedFrames || 0);
  await page.waitForFunction(({ before, expected }) => {
    const canvas = document.querySelector('canvas'), gl = canvas?.getContext('webgl2');
    return window.__snakeRenderedFrames >= before + 2 || window.__snakeFailure ||
      !gl || gl.isContextLost() || (document.body.dataset.presentation || 'original') !== expected;
  }, { before, expected }, { timeout: 10000 });
  const value = await page.evaluate(observePresentation, { expectedPresentation: expected });
  if (value.presentationError || value.renderedPresentation !== value.presentation || !value.booted || value.lost !== false || !value.boardVisible ||
      !value.renderedFrames || value.canvasCount !== 1) throw Error('Presentation needs an actual visible completed render');
  if (info) await info.attach('presentation-evidence', { body: JSON.stringify(value), contentType: 'application/json' });
  return value;
}

export function sourceAdapter(html, { hooks = '' } = {}) {
  if (!/<script type="module">/.test(html)) throw new Error('Source adapter requires canonical inline game module; built artifacts must use real UI tests.');
  return html.replace('<script type="module">', '<script type="module">\nconst __SNAKE_TEST_BUILD__ = true;\n')
    .replace(/<\/script>\s*<\/body>/, `window.advanceSimulation = ms => activeClock().advanceTo(activeClock().simNowMs + ms);
window.simulationTime = () => activeClock().simNowMs;
window.arrangeNextMovement = ms => { stepMs = ms; activeClock().lastMoveMs = activeClock().simNowMs; activeClock().nextMoveMs = activeClock().simNowMs + ms; };
${hooks}\n</script>\n</body>`);
}
export function localImports(html, base) {
  return html.replaceAll('https://cdn.jsdelivr.net/npm/three@0.169.0/', new URL('vendor/three/', base).href);
}
export async function rendererReady(page, { instrumented = false } = {}) {
  await page.waitForFunction((adapted) => {
    const canvas = document.querySelector('canvas');
    const error = document.getElementById('bootError');
    if (!canvas || canvas.width < 1 || canvas.height < 1 || (error && getComputedStyle(error).display !== 'none')) return false;
    if (adapted) return window.__snakeRenderedFrames > 0 && window.renderer?.info?.render?.frame > 0 && !window.renderer.getContext().isContextLost();
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl || gl.isContextLost()) return false;
    return window.__snakeBooted === true && window.__snakeRenderedFrames > 0;
  }, instrumented, { timeout: 30000 });
  // Require two browser frames after a successfully usable context, not just pre-boot DOM.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

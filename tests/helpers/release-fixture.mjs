import { test as base, expect } from '@playwright/test';
import { installReleaseRoutes } from './request-policy.mjs';
import { localImports, rendererReady, sourceAdapter } from './source-adapter.mjs';
import { validateDeclaredFontResponse, validateDeclaredFirefoxFontErrors } from './presentation-fault-evidence.mjs';
export { expect };
export const test = base.extend({
  sourceHooks: [false, { option: true }],
  declaredOptionalFontFault: [null, { option: true }],
  gamePage: async ({ page, baseURL, sourceHooks, declaredOptionalFontFault }, use, testInfo) => {
    if (declaredOptionalFontFault !== null && declaredOptionalFontFault !== 'oxanium-decode') throw Error('Unknown optional-font fault declaration');
    const errors = { pageErrors: [], consoleErrors: [], unexpectedRequests: [] };
    const consoleDiagnostics = [], fontResponses = [];
    const fontURL = new URL('./assets/neon/oxanium-ui.woff2', baseURL).href;
    page.on('pageerror', err => errors.pageErrors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') {
      errors.consoleErrors.push(msg.text()); consoleDiagnostics.push({ text: msg.text(), location: msg.location() });
    } });
    if (declaredOptionalFontFault) page.on('response', response => {
      if (response.url() === fontURL) fontResponses.push((async () => ({ url: response.url(), status: response.status(),
        type: response.headers()['content-type'], body: await response.text() }))());
    });
    const source = !process.env.RELEASE_DIST;
    await installReleaseRoutes(page, { baseURL, source, sourceHooks, errors,
      adapt: body => {
        body = localImports(body, baseURL);
        if ((sourceHooks || process.env.RELEASE_SOURCE_HOOKS === '1') && !testInfo.title.startsWith('A01 ordinary')) body = sourceAdapter(body);
        return body;
      }
    });
    const goto = page.goto.bind(page);
    page.goto = async (...args) => { const response = await goto(...args); await rendererReady(page, { instrumented: source && (sourceHooks || process.env.RELEASE_SOURCE_HOOKS === '1') && !testInfo.title.startsWith('A01 ordinary') }); return response; };
    await use(page);
    let declaredDiagnostics = null;
    if (declaredOptionalFontFault) {
      const responses = await Promise.all(fontResponses);
      expect(responses, 'One explicitly controlled local font response').toHaveLength(1);
      const declaration = { kind: declaredOptionalFontFault, engine: testInfo.project.name,
        documentURL: page.url(), fontURL, response: responses[0] };
      validateDeclaredFontResponse(responses[0], declaration);
      if (testInfo.project.name === 'firefox') declaredDiagnostics = validateDeclaredFirefoxFontErrors(consoleDiagnostics, declaration);
      else expect(errors.consoleErrors, 'Console errors').toEqual([]);
      await testInfo.attach('declared-optional-font-diagnostics', { body: JSON.stringify({ declaration,
        consoleDiagnostics, accepted: declaredDiagnostics }), contentType: 'application/json' });
    }
    await testInfo.attach('browser-evidence', { body: JSON.stringify({ ...errors, consoleDiagnostics, declaredDiagnostics,
      engine: testInfo.project.name, architecture: process.arch, platform: process.platform, version: page.context().browser().version() }, null, 2), contentType: 'application/json' });
    expect(errors.pageErrors, 'Page errors').toEqual([]);
    if (!declaredOptionalFontFault) expect(errors.consoleErrors, 'Console errors').toEqual([]);
    expect(errors.unexpectedRequests, 'Non-origin runtime requests').toEqual([]);
  }
});

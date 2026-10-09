import { test as base, expect } from '@playwright/test';
import { installReleaseRoutes } from './request-policy.mjs';
import { localImports, rendererReady, sourceAdapter } from './source-adapter.mjs';
export { expect };
export const test = base.extend({
  sourceHooks: [false, { option: true }],
  gamePage: async ({ page, baseURL, sourceHooks }, use, testInfo) => {
    const errors = { pageErrors: [], consoleErrors: [], unexpectedRequests: [] };
    page.on('pageerror', err => errors.pageErrors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.consoleErrors.push(msg.text()); });
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
    await testInfo.attach('browser-evidence', { body: JSON.stringify({ ...errors, engine: testInfo.project.name, architecture: process.arch, platform: process.platform, version: page.context().browser().version() }, null, 2), contentType: 'application/json' });
    expect(errors.pageErrors, 'Page errors').toEqual([]);
    expect(errors.consoleErrors, 'Console errors').toEqual([]);
    expect(errors.unexpectedRequests, 'Non-origin runtime requests').toEqual([]);
  }
});

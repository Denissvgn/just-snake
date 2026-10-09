import puppeteer from 'puppeteer-core';
import {LEGACY_FIXTURES,registerFixture} from '../infrastructure/fixture-ownership.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { BASE_URL, ARTIFACTS, ROOT } from './config.mjs';
import { fetchLegacyDocument, allowedRequest } from './request-policy.mjs';
import { sourceAdapter, rendererReady } from './source-adapter.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(ROOT, '.tools/playwright');
const { chromium } = await import('@playwright/test');
const live = new Set();
const evidence = { architecture: process.arch, platform: process.platform, node: process.version, browser: null, puppeteer: JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/node_modules/puppeteer-core/package.json'))).version, pages: [], failures: [] };
const save = () => { fs.mkdirSync(ARTIFACTS, { recursive: true }); fs.writeFileSync(path.join(ARTIFACTS, 'browser.json'), JSON.stringify(evidence, null, 2)); };
async function cleanup() { await Promise.allSettled([...live].map(b => b.close())); save(); }
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await cleanup(); process.exit(1); });
process.once('beforeExit', cleanup);
process.on('exit', () => { for (const browser of live) browser.process()?.kill('SIGKILL'); save(); });
export default {
  async launch(options = {}) {
    const browser = await puppeteer.launch({ ...options, headless: options.headless === 'new' ? true : (options.headless ?? true), executablePath: process.env.CHROME || chromium.executablePath(), timeout: 30000,
      args: [...new Set([...(options.args || []).filter(a => !a.startsWith('--use-angle=') && !a.startsWith('--use-gl=')), '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'])] });
    live.add(browser); evidence.browserPid = browser.process()?.pid; evidence.browser = await browser.version(); save();
    const close = browser.close.bind(browser);
    browser.close = async () => { try { for (const page of await browser.pages()) { const record = evidence.pages.find(r => r.pageId === page); if (record) { try { await page.screenshot({ path: record.screenshot }); } catch (error) { record.screenshotError = error.message; } } } if (evidence.tracingPage) { try { await evidence.tracingPage.tracing.stop(); } catch (error) { evidence.failures.push(`Trace finalization: ${error.message}`); } } await close(); } finally { live.delete(browser); save(); } };
    browser.newPage = async () => {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(30000);
      const record = { pageErrors: [], consoleErrors: [], consoleWarnings: [], actions: [], requests: [], trace: path.join(ARTIFACTS, `trace-${evidence.pages.length}.json`), screenshot: path.join(ARTIFACTS, `page-${evidence.pages.length}.png`) };
      Object.defineProperty(record, 'pageId', { value: page, enumerable: false });
      evidence.pages.push(record);
      page.on('pageerror', e => { record.pageErrors.push(e.stack || e.message); process.exitCode = 1; save(); });
      page.on('console', m => { if (m.type() === 'warn' || m.type() === 'warning') { record.consoleWarnings.push(m.text()); save(); } if (m.type() === 'error') { record.consoleErrors.push(m.text()); process.exitCode = 1; save(); } });
      if (!evidence.tracingPage) {
        await page.tracing.start({ path: record.trace, screenshots: true });
        Object.defineProperty(evidence, 'tracingPage', { value: page, enumerable: false });
        evidence.trace = record.trace;
      } else record.trace = evidence.trace;
      await page.setRequestInterception(true);
      page.on('request', async req => {
        try {
          record.requests.push(req.url().startsWith('data:') ? `${req.url().split(',')[0]},[omitted]` : req.url());
          if (!allowedRequest(req.url(), BASE_URL)) {
            evidence.failures.push(`Unexpected external request ${req.url()}`); process.exitCode = 1; await req.abort(); return;
          }
          if (req.resourceType() === 'document') {
            const filename = new URL(req.url()).pathname.split('/').pop();
            if (process.env.LEGACY_SUITE && filename === LEGACY_FIXTURES[process.env.LEGACY_SUITE]) await registerFixture(ROOT, ARTIFACTS, process.env.LEGACY_SUITE, filename);
            const response = await fetchLegacyDocument(req.url(), BASE_URL);
            let body = await response.text();
            if (response.ok && /<script type="module">/.test(body)) body = sourceAdapter(body);
            await req.respond({ status: response.status, contentType: 'text/html', body });
          } else await req.continue();
        } catch (error) { evidence.failures.push(error.message); process.exitCode = 1; if (!req.isInterceptResolutionHandled()) await req.abort(); }
      });
      const goto = page.goto.bind(page);
      page.goto = async (url, options) => {
        const original = new URL(url);
        const file = original.pathname.split('/').pop() || 'snake-three.html';
        const target = new URL(`${file}${original.search}`, BASE_URL).href;
        const response = await goto(target, options);
        await rendererReady({ waitForFunction: (fn, arg, options) => page.waitForFunction(fn, options, arg), evaluate: page.evaluate.bind(page) }, { instrumented: true });
        save();
        return response;
      };
      const reload = page.reload.bind(page);
      page.reload = async (...args) => { const response = await reload(...args); await rendererReady({ waitForFunction: (fn, arg, options) => page.waitForFunction(fn, options, arg), evaluate: page.evaluate.bind(page) }, { instrumented: true }); return response; };
      const click = page.click.bind(page);
      page.click = async (selector, ...args) => {
        const snapshot = await page.evaluate(sel => { const element = document.querySelector(sel), overlay = document.getElementById('overlay'); return { selector: sel, state: window.state, demoActive: window.ATTRACT?.active, title: document.getElementById('title')?.textContent, overlayDisplay: overlay && getComputedStyle(overlay).display, button: element ? { display: getComputedStyle(element).display, rect: element.getBoundingClientRect().toJSON() } : null }; }, selector);
        record.actions.push(snapshot); save();
        try { await page.waitForSelector(selector, { visible: true }); return await click(selector, ...args); } catch (error) { snapshot.error = error.message; save(); throw error; }
      };
      return page;
    };
    return browser;
  }
};

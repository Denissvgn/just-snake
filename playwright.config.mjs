import { defineConfig } from '@playwright/test';
import { ROOT, BROWSER_PATH, BASE_URL } from './tests/helpers/config.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= BROWSER_PATH;
export default defineConfig({
  testDir: `${ROOT}/tests/release`, timeout: 30000, expect: { timeout: 8000 }, workers: 1, fullyParallel: false, retries: 0,
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || `${ROOT}/.artifacts/release/browser`, reporter: [['list'], ['json', { outputFile: process.env.PLAYWRIGHT_JSON_REPORT_PATH || `${ROOT}/.artifacts/release/playwright-results.json` }]],
  use: { baseURL: BASE_URL, viewport: { width: 1000, height: 700 }, screenshot: 'on', trace: { mode: 'on', screenshots: false, snapshots: true, sources: true }, video: 'off' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] } } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } }
  ]
});

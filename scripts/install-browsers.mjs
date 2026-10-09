import path from 'node:path';
import { ROOT, BROWSER_PATH, node24 } from '../tests/helpers/config.mjs';
import { runWorker } from '../tests/helpers/process.mjs';
node24();
const result = await runWorker(process.execPath, [path.join(ROOT, 'node_modules/@playwright/test/cli.js'), 'install', 'chromium', 'firefox', 'webkit'], { timeoutMs: 300000, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || BROWSER_PATH } });
process.stdout.write(result.output); process.exitCode = result.timedOut ? 1 : result.exitCode;

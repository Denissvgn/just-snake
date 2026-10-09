import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const GAME = path.resolve(process.env.GAME || path.join(ROOT, 'snake-three.html'));
export const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8099/';
export const ARTIFACTS = path.resolve(process.env.TEST_ARTIFACTS || path.join(ROOT, '.artifacts/tests'));
export const BROWSER_PATH = path.join(ROOT, '.tools/playwright');
export function node24() {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Node 24 is required. Use nvm use, or PATH="$PWD/.tools/node_modules/node/bin:$PATH".');
  if (process.arch !== 'arm64') throw new Error(`Native ARM64 required; observed ${process.arch}`);
}
export function targetURL(file = 'snake-three.html') { return new URL(file.replace(/^\//, ''), BASE_URL).href; }

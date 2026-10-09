import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { ROOT, node24 } from '../tests/helpers/config.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (parent, child) => child.startsWith(`${parent}${path.sep}`);
export async function buildDistribution({ source = path.join(ROOT, 'snake-three.html'), output = path.join(ROOT, 'dist') } = {}) {
  node24();
  output = path.resolve(output);
  if (output !== path.join(ROOT, 'dist') && !inside(path.join(ROOT, '.artifacts'), output)) throw new Error('Build output must be dist or a generated .artifacts subdirectory');
  const sourceBytes = await fs.readFile(source);
  const html = sourceBytes.toString('utf8');
  const modules = [...html.matchAll(/<script\s+type="module">([\s\S]*?)<\/script>/g)];
  if (modules.length !== 1) throw new Error('Expected one canonical inline game module');
  const result = await bundle({
    stdin: { contents: modules[0][1], resolveDir: ROOT, sourcefile: 'snake-three.html.js', loader: 'js' },
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    minify: true, splitting: false, sourcemap: false, write: false,
    define: { __SNAKE_TEST_BUILD__: 'false' }, legalComments: 'none', metafile: true
  });
  const script = result.outputFiles[0].contents;
  const scriptName = `assets/game-${sha(script).slice(0, 16)}.js`;
  const page = html.replace(/\s*<script\s+type="importmap">[\s\S]*?<\/script>/g, '')
    .replace(modules[0][0], `<script type="module" src="./${scriptName}"></script>`);
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(path.join(output, 'assets'), { recursive: true });
  await fs.writeFile(path.join(output, scriptName), script);
  await fs.writeFile(path.join(output, 'index.html'), page);
  await fs.writeFile(path.join(output, 'snake-three.html'), page);
  await fs.copyFile(path.join(ROOT, 'THIRD_PARTY_NOTICES.txt'), path.join(output, 'THIRD_PARTY_NOTICES.txt'));
  await fs.writeFile(path.join(output, '404.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>just-snake — page not found</title></head><body><main><h1>Page not found</h1><p><a href="./">Play just-snake</a></p></main></body></html>\n');
  async function copyAssets(directory, relative = '') {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = path.posix.join(relative, entry.name), from = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Asset symlink rejected: ${rel}`);
      if (entry.name.startsWith('.') || /(?:credentials?|endpoint|__dbg|\.env)/i.test(entry.name)) throw new Error(`Private asset name rejected: ${rel}`);
      if (entry.isDirectory()) await copyAssets(from, rel);
      else if (entry.isFile()) {
        if (!/\.(?:svg|png|jpg|jpeg|webp|avif|woff2|css|js|txt)$/i.test(entry.name)) throw new Error(`Unexpected asset type: ${rel}`);
        const to = path.join(output, 'assets', rel);
        if (to === path.join(output, scriptName)) throw new Error('Source asset collides with generated bundle');
        await fs.mkdir(path.dirname(to), { recursive: true }); await fs.copyFile(from, to);
      } else throw new Error(`Special asset file rejected: ${rel}`);
    }
  }
  const assetRoot = path.join(ROOT, 'assets');
  const stat = await fs.lstat(assetRoot).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (stat) {
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Asset root must be a regular directory');
    await copyAssets(assetRoot);
  }
  const payload = {};
  async function collect(directory, relative = '') {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = path.posix.join(relative, entry.name), file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file, rel);
      else payload[rel] = { sha256: sha(await fs.readFile(file)), bytes: (await fs.stat(file)).size };
    }
  }
  await collect(output);
  const manifest = { schemaVersion: 1, product: 'just-snake', source: path.relative(ROOT, source), sourceSha256: sha(sourceBytes), lockSha256: sha(await fs.readFile(path.join(ROOT, 'package-lock.json'))), buildScriptSha256: sha(await fs.readFile(fileURLToPath(import.meta.url))), bundle: scriptName, dependencies: Object.keys(result.metafile.inputs).sort(), payload };
  await fs.mkdir(path.join(ROOT, '.artifacts/build'), { recursive: true });
  await fs.writeFile(path.join(ROOT, '.artifacts/build/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await buildDistribution();
  console.log(`Built ${Object.keys(manifest.payload).length} local files: ${manifest.bundle}`);
}

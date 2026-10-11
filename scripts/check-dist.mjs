import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build as parseAsset } from 'esbuild';
import { ROOT, node24 } from '../tests/helpers/config.mjs';

export async function checkDistribution(root = path.join(ROOT, 'dist'), { verifyManifest = true } = {}) {
  const problems = [], files = [], payload = {};
  let total = 0, codeGzip = 0, socialBytes = 0, neonAssetBytes = 0, neonCabinet = false, neonModuleReferenced = false;
  const realRoot = await fs.realpath(root);
  if ((await fs.lstat(root)).isSymbolicLink()) problems.push('Distribution root is a symlink');
  async function reference(ref, name, { module = false } = {}) {
    ref = ref.trim();
    if (!ref || ref.startsWith('#') || (!module && ref.startsWith('data:'))) return;
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(ref)) { problems.push(`Remote or unpackageable resource in ${name}: ${ref}`); return; }
    if (ref.startsWith('/')) { problems.push(`Root-relative resource in ${name}: ${ref}`); return; }
    if (module && !ref.startsWith('./') && !ref.startsWith('../')) { problems.push(`Unresolved bare import in ${name}: ${ref}`); return; }
    let pathname;
    try { pathname = decodeURIComponent(ref.split(/[?#]/)[0]); } catch { problems.push(`Invalid encoded resource in ${name}: ${ref}`); return; }
    if (pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.') && part !== '.' && part !== '..') || /(?:__dbg|credentials?|endpoint|\.env|\.map$|node_modules)/i.test(pathname)) { problems.push(`Private or unpackageable resource in ${name}: ${ref}`); return; }
    const resolved = path.resolve(root, path.dirname(name), pathname);
    if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) { problems.push(`Resource escapes distribution in ${name}: ${ref}`); return; }
    try { await fs.access(resolved); } catch { problems.push(`Missing resource in ${name}: ${ref}`); }
  }
  const decodeEntities = value => value.replace(/&(?:#(x[0-9a-f]+|\d+)|([a-z]+));/gi, (token, number, name) => {
    if (!number) return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[name.toLowerCase()] ?? token;
    const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : token;
  });
  async function dependencies(contents, name, loader) {
    try {
      const parsed = await parseAsset({ stdin: { contents, sourcefile: name, loader }, bundle: false, write: false, metafile: true, logLevel: 'silent' });
      for (const output of Object.values(parsed.metafile.outputs)) for (const dependency of output.imports || []) await reference(dependency.path, name, { module: loader === 'js' });
    } catch (error) { problems.push(`Asset parse failed in ${name}: ${error.message}`); }
  }
  async function inlineResources(markup, name, { svg = false } = {}) {
    // Parse CSS so quoted/escaped url(), @import and font sources use the same
    // dependency checks as standalone stylesheets, relative to their document.
    for (const match of markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) await dependencies(match[1], name, 'css');
    for (const match of markup.matchAll(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) await dependencies(`x { ${decodeEntities(match[2])} }`, name, 'css');
    if (!svg && !/<svg\b/i.test(markup)) return;
    for (const match of markup.matchAll(/<(?:image|use|feImage|script|textPath|mpath|font-face-uri)\b[^>]*>/gi)) {
      for (const attribute of match[0].matchAll(/\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi)) await reference(decodeEntities(attribute[2]), name);
    }
    for (const match of markup.matchAll(/\b(fill|stroke|filter|mask|clip-path|marker(?:-start|-mid|-end)?)\s*=\s*(["'])(.*?)\2/gi)) {
      if (/url\s*\(/i.test(match[3])) await dependencies(`x { ${match[1]}: ${decodeEntities(match[3])} }`, name, 'css');
    }
  }
  async function visit(directory, prefix = '') {
    for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.posix.join(prefix, item.name), file = path.join(directory, item.name);
      if (item.isSymbolicLink()) { problems.push(`Symlink: ${name}`); continue; }
      const real = await fs.realpath(file);
      if (!real.startsWith(`${realRoot}${path.sep}`)) { problems.push(`Ancestor path escape: ${name}`); continue; }
      if (item.isDirectory()) { if (name !== 'assets' && !name.startsWith('assets/')) problems.push(`Disallowed directory: ${name}`); await visit(file, name); continue; }
      if (!item.isFile()) { problems.push(`Special file: ${name}`); continue; }
      const stat = await fs.stat(file); if (stat.nlink !== 1) problems.push(`Hard link: ${name}`);
      if (!['index.html', 'snake-three.html', '404.html', 'THIRD_PARTY_NOTICES.txt'].includes(name) && !name.startsWith('assets/')) problems.push(`Not allowlisted: ${name}`);
      if (name.split('/').some(part => part.startsWith('.')) || /(?:__dbg|credentials?|endpoint|\.env|\.map$|node_modules)/i.test(name)) problems.push(`Private/debug path: ${name}`);
      if (name.startsWith('assets/') && !/\.(?:js|css|svg|png|jpg|jpeg|webp|avif|woff2|txt)$/i.test(name)) problems.push(`Unexpected asset type: ${name}`);
      const bytes = await fs.readFile(file); total += bytes.length;
      if (name.startsWith('assets/neon/') && /\.(?:png|jpg|jpeg|webp|avif|woff2|txt)$/i.test(name)) neonAssetBytes += bytes.length;
      const neonLimit = { 'assets/neon/city-wide.jpg': 420, 'assets/neon/city-portrait.jpg': 240, 'assets/neon/oxanium-ui.woff2': 96 }[name];
      if (neonLimit && bytes.length > neonLimit * 1024) problems.push(`Neon asset exceeds ${neonLimit}KiB: ${name}`);
      if (name === 'assets/original/ion-vault.jpg' && bytes.length > 240 * 1024) problems.push('Original background exceeds 240KiB');
      if (/\.(?:html|js|css)$/.test(name)) codeGzip += gzipSync(bytes).length;
      if (/social.*\.(?:png|jpg|jpeg|webp)$/i.test(name)) socialBytes += bytes.length;
      payload[name] = createHash('sha256').update(bytes).digest('hex'); files.push(name);
      if (/\.(?:html|js|css|svg|txt)$/.test(name) && /(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16})/.test(bytes.toString())) problems.push(`Credential-like content: ${name}`);
      if (name.endsWith('.html')) {
        const html = bytes.toString();
        if (/\bid=["']neonCabinet["']/.test(html)) neonCabinet = true;
        await inlineResources(html, name);
        if (/<script[^>]*type=["']importmap/i.test(html)) problems.push(`Production import map: ${name}`);
        for (const match of html.matchAll(/<(script|img|link)\b[^>]*?\b(src|href)=["']([^"']+)["'][^>]*>/gi)) {
          const ref = decodeEntities(match[3]);
          if (/^data:/.test(ref)) continue;
          if (/^(?:https?:)?\/\//.test(ref)) {
            if (match[1].toLowerCase() === 'link' && /\brel=["']canonical["']/i.test(match[0])) continue;
            problems.push(`Remote runtime resource in ${name}: ${ref}`); continue;
          }
          await reference(ref, name);
        }
      }
      if (name.endsWith('.svg')) await inlineResources(bytes.toString(), name, { svg: true });
      if (name.endsWith('.js')) {
        const script = bytes.toString();
        // These fixed URLs resolve against the entry document, not this asset's
        // directory. esbuild's import metadata cannot see dynamic URL imports.
        for (const match of script.matchAll(/new\s+URL\s*\(\s*(["'])([^"']+)\1\s*,\s*document\.baseURI\s*\)/g)) {
          const ref = match[2];
          if (/^data:/i.test(ref)) { problems.push(`Unpackageable document runtime URL in ${name}: ${ref}`); continue; }
          await reference(ref, 'index.html', { module: /\.js(?:[?#]|$)/.test(ref) });
          if (ref.split(/[?#]/)[0] === './assets/neon-view.js') neonModuleReferenced = true;
        }
        if (/__SNAKE_TEST_BUILD__|window\.(?:RNG|SETTINGS|MODES|renderer|scene|setSeed|setStepMs|startGame|segs|HUD_FX)\s*=/.test(script)) problems.push(`Legacy test controls in bundle: ${name}`);
      }
      if (/\.(?:js|css)$/.test(name)) {
        await dependencies(bytes.toString(), name, name.endsWith('.css') ? 'css' : 'js');
      }
    }
  }
  await visit(root);
  for (const required of ['index.html', 'snake-three.html', '404.html', 'THIRD_PARTY_NOTICES.txt']) if (!files.includes(required)) problems.push(`Missing entry/notice: ${required}`);
  const neonRelease = neonCabinet || neonModuleReferenced || files.includes('assets/neon-district.css');
  if (neonRelease && !files.includes('assets/neon-view.js')) problems.push('Missing required Neon runtime module: assets/neon-view.js');
  if (neonRelease && !neonModuleReferenced) problems.push('Missing fixed document-relative Neon module reference');
  // The unchanged reviewed Original build has 242236 aggregate gzip bytes.
  if (neonRelease && codeGzip - 242236 > 80 * 1024) problems.push(`Neon added code exceeds 80KiB gzip: ${codeGzip - 242236}`);
  if (payload['index.html'] !== payload['snake-three.html']) problems.push('Compatibility entry differs from index');
  if (total > 5 * 1024 * 1024) problems.push(`Payload exceeds 5MiB: ${total}`);
  if (codeGzip > 1024 * 1024) problems.push(`Code gzip exceeds 1MiB: ${codeGzip}`);
  if (socialBytes > 1024 * 1024) problems.push(`Social assets exceed 1MiB: ${socialBytes}`);
  if (neonAssetBytes > 768 * 1024) problems.push(`Neon raster/font/license assets exceed 768KiB: ${neonAssetBytes}`);
  if (verifyManifest) {
    const manifest = JSON.parse(await fs.readFile(path.join(ROOT, '.artifacts/build/manifest.json')));
    if (JSON.stringify(files.sort()) !== JSON.stringify(Object.keys(manifest.payload).sort())) problems.push('Payload file set differs from build manifest');
    for (const name of files) if (manifest.payload[name]?.sha256 !== payload[name]) problems.push(`Payload digest mismatch: ${name}`);
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return { schemaVersion: 1, files, payload, totalBytes: total, codeGzipBytes: codeGzip, socialBytes, neonAssetBytes, passed: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  node24(); const result = await checkDistribution();
  await fs.writeFile(path.join(ROOT, '.artifacts/build/check.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`PASS dist: ${result.files.length} files; ${result.totalBytes} bytes; code gzip ${result.codeGzipBytes} bytes`);
}

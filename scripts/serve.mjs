import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME, ROOT, node24 } from '../tests/helpers/config.mjs';
import { localImports } from '../tests/helpers/source-adapter.mjs';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' };
export async function createServer({ root = ROOT, game = GAME, prefix = '/', port = 0, source = true } = {}) {
  prefix = `/${prefix.split('/').filter(Boolean).join('/')}${prefix === '/' ? '' : '/'}`;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let decoded = decodeURIComponent(url.pathname);
      if (!decoded.startsWith(prefix)) { res.writeHead(404).end('Outside mount'); return; }
      decoded = decoded.slice(prefix.length);
      if (decoded.split('/').some(part => part.startsWith('.'))) { res.writeHead(404).end('Private path'); return; }
      if (decoded === 'favicon.ico') { res.writeHead(204).end(); return; }
      const vendor = source && decoded.startsWith('vendor/three/');
      if (source && !vendor && decoded && decoded !== 'snake-three.html' && !decoded.startsWith('assets/') && !/^__dbg[\w-]*\.html$/.test(decoded)) { res.writeHead(404).end('Outside source fixture allowlist'); return; }
      const base = vendor ? path.join(ROOT, 'node_modules/three') : path.resolve(root);
      const rel = vendor ? decoded.slice('vendor/three/'.length) : decoded || (source ? 'snake-three.html' : 'index.html');
      let file = path.resolve(base, rel);
      if (!file.startsWith(`${base}${path.sep}`) && file !== base) { res.writeHead(403).end(); return; }
      if (source && rel === 'snake-three.html') file = game;
      const real = await fs.realpath(file);
      const allowedBase = await fs.realpath(source && rel === 'snake-three.html' ? path.dirname(game) : base);
      if (!real.startsWith(`${allowedBase}${path.sep}`)) { res.writeHead(403).end(); return; }
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) { res.writeHead(404).end(); return; }
      let body = await fs.readFile(file);
      if (source && file.endsWith('.html')) body = Buffer.from(localImports(body.toString(), `http://127.0.0.1:${server.address().port}${prefix}`));
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, baseURL: `http://127.0.0.1:${server.address().port}${prefix}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  node24(); const app = await createServer({ root: process.env.SERVE_ROOT || ROOT, prefix: process.env.SERVE_PREFIX || '/', port: Number(process.env.PORT || 8099), source: !process.env.SERVE_ROOT });
  console.log(app.baseURL); for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(); });
}

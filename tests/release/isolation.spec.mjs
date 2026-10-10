import { test, expect } from '@playwright/test';
import http from 'node:http';
import { fetchLegacyDocument, installReleaseRoutes } from '../helpers/request-policy.mjs';
test.use({ headless: true });
async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
test('A01 redirects cannot contact a non-origin destination through either adapter', async ({ page }) => {
  let destinationHits = 0;
  const destination = await listen((req, res) => { destinationHits++; res.end('harmless forbidden destination'); });
  const origin = await listen((req, res) => res.writeHead(302, { Location: destination.url }).end());
  const errors = { unexpectedRequests: [] };
  try {
    await expect(fetchLegacyDocument(origin.url, origin.url)).rejects.toThrow();
    expect(destinationHits).toBe(0);
    await installReleaseRoutes(page, { baseURL: origin.url, source: true, errors });
    await expect(page.goto(origin.url)).rejects.toThrow();
    expect(errors.unexpectedRequests).toEqual([destination.url]);
    expect(destinationHits).toBe(0);
  } finally { await origin.close(); await destination.close(); }
});

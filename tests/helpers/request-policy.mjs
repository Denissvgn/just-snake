export function allowedRequest(url, baseURL) {
  return /^(data|blob):/.test(url) || new URL(url).origin === new URL(baseURL).origin;
}
export async function fetchLegacyDocument(url, baseURL) {
  if (!allowedRequest(url, baseURL)) throw new Error(`Blocked non-origin document ${url}`);
  // Node fetch must never follow a redirect behind browser interception.
  return fetch(url, { redirect: 'error' });
}
export async function installReleaseRoutes(page, { baseURL, source, sourceHooks = false, errors, adapt }) {
  await page.route('**/*', async route => {
    const request = route.request(), url = request.url();
    if (!allowedRequest(url, baseURL)) { errors.unexpectedRequests.push(url); return route.abort(); }
    if (/^(data|blob):/.test(url)) return route.continue();
    if (source && request.resourceType() === 'document') {
      const response = await route.fetch({ maxRedirects: 0 });
      const location = response.headers().location;
      if (response.status() >= 300 && response.status() < 400 && location && !allowedRequest(new URL(location, url).href, baseURL)) {
        errors.unexpectedRequests.push(new URL(location, url).href);
        return route.abort();
      }
      const body = adapt ? adapt(await response.text(), sourceHooks) : await response.text();
      return route.fulfill({ response, body });
    }
    return route.continue();
  });
}

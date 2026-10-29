import {createServer} from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {commercialBlockers, hostedCheckoutUrl, recordSourceOrder} from './commerce.mjs';

const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const brandRoot = fileURLToPath(new URL('../../public/brand/', import.meta.url));
const page = (title, content) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font:16px system-ui;max-width:760px;margin:64px auto;padding:0 24px;line-height:1.6;color:#172c2a;background:#f5f7f6}a{color:#036a60}nav{display:flex;gap:24px}main{background:white;border:1px solid #c9d8d3;border-radius:12px;padding:28px;margin-top:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}.button{display:inline-block;padding:10px 18px;background:#075b52;color:white;border-radius:6px;text-decoration:none}</style></head><body><nav><a href="/">Shpitto source</a><a href="/docs">Docs</a><a href="/legal">Terms and support</a></nav><main><h1>${title}</h1>${content}</main></body></html>`;

export function salesHandler(config, docsOrigin = 'http://127.0.0.1:3100') {
  const docsUrl = new URL(docsOrigin);
  if (docsUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(docsUrl.hostname)
    || docsUrl.username || docsUrl.password || docsUrl.pathname !== '/' || docsUrl.search || docsUrl.hash) throw new Error('Docs preview origin must be a loopback HTTP origin.');
  return async (request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, {Allow: 'GET, HEAD'}); response.end(); return;
    }
    const requestUrl = new URL(request.url, 'http://localhost');
    const route = requestUrl.pathname;
    if (route.startsWith('/brand/')) {
      const assetName = route.slice('/brand/'.length);
      if (!/^[a-z0-9-]+\.(?:png|svg|webp)$/i.test(assetName)) { response.writeHead(404); response.end(); return; }
      const assetPath = path.resolve(brandRoot, assetName);
      if (!assetPath.startsWith(`${path.resolve(brandRoot)}${path.sep}`) || !existsSync(assetPath)) { response.writeHead(404); response.end(); return; }
      const contentType = assetName.endsWith('.svg') ? 'image/svg+xml' : assetName.endsWith('.webp') ? 'image/webp' : 'image/png';
      response.writeHead(200, {'Content-Type': contentType, 'Cache-Control': 'no-store'});
      response.end(readFileSync(assetPath));
      return;
    }
    if (route === '/docs' || route.startsWith('/docs/') || route.startsWith('/_next/static/')) {
      try {
        const headers = Object.fromEntries(['accept', 'rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-url'].filter((key) => typeof request.headers[key] === 'string').map((key) => [key, request.headers[key]]));
        const upstream = await fetch(new URL(`${route}${requestUrl.search}`, docsOrigin), {method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(10000)});
        response.statusCode = upstream.status;
        response.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
        response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
        const location = upstream.headers.get('location');
        if (location && /^\/docs(?:\/|\?|$)/.test(location)) response.setHeader('Location', location);
        response.end(request.method === 'HEAD' ? undefined : Buffer.from(await upstream.arrayBuffer()));
      } catch { response.statusCode = 503; response.end(page('Docs temporarily unavailable', '<p>Start the local application on port 3100 to preview the shared release documentation.</p>')); }
      return;
    }
    let content;
    if (route === '/') {
      content = page('Shpitto local source-license demo', '<p>Explore source checkout and delivery using a local fixture. This sales preview is separate from your video SaaS subscription.</p><p>No real order, payment or repository invitation is created.</p><a class="button" href="/checkout">Preview source checkout</a>');
    } else if (route === '/checkout') {
      if (config.mode !== 'mock') {
        try { response.writeHead(303, {Location: hostedCheckoutUrl(config)}); response.end(); return; }
        catch { response.statusCode = 503; content = page('Checkout unavailable', '<p>Merchant configuration and approved terms are required before checkout opens.</p>'); }
      } else content = page('Mock source checkout', '<p>No payment is collected. Price, license limits and affiliate economics remain unresolved; this preview grants no commercial rights.</p><p>The fixture demonstrates twelve months of updates and basic support, with acquired releases retained afterward.</p><a class="button" href="/demo/receipt">View simulated order and entitlement</a>');
    } else if (route === '/demo/receipt' && config.mode === 'mock') {
      const fixture = recordSourceOrder([], {provider: 'lemon-squeezy', mode: 'mock', merchantId: config.merchantId, status: 'paid', id: 'local-preview-order', buyerId: 'local-preview-buyer', githubIdentity: 'local-preview-github', purchasedAt: '2026-10-07T00:00:00.000Z'}, {version: 'fixture-v1', artifactSha256: '0'.repeat(64)}, config);
      content = page('Simulated source order', `<p>Fixture only. The zero digest identifies no deliverable archive. No download, account, credit or external entitlement is created.</p><pre>${escape(JSON.stringify(fixture[0], null, 2))}</pre><a href="/">Return to preview</a>`);
    } else if (route === '/legal') {
      content = page('Draft terms — not approved for public orders', `<p>The proposed source purchase includes twelve months of updates and basic technical support. Acquired source remains usable after expiry. Future updates stop until renewal. Custom development and deployment assistance are separately scoped and priced.</p><p>Project/seat limits, price/currency, refund rules, support response commitments, service rates and source-affiliate economics require approval.</p><p>Open prerequisites: ${escape(commercialBlockers(config).join(', '))}.</p>`);
    } else { response.statusCode = 404; content = page('Not found', '<a href="/">Return to preview</a>'); }
    response.end(request.method === 'HEAD' ? undefined : content);
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(readFileSync(new URL('./commerce.config.json', import.meta.url), 'utf8'));
  createServer(salesHandler(config)).listen(3200, '127.0.0.1', () => console.log('Vendor sales preview: http://127.0.0.1:3200 (local-only; no external orders)'));
}

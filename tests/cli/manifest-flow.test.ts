import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { describe, it } from 'node:test';
import { runManifestFlow } from '../../src/cli/manifest-flow.ts';

describe('manifest flow callback server', () => {
  it('serves the auto-submitting form, rejects a wrong state, and exchanges the code', async () => {
    let exchanged = '';
    const api = createServer((req, res) => {
      exchanged = `${req.method} ${req.url}`;
      res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 42, slug: 'viewer', client_id: 'Iv1.42', pem: 'PEM', client_secret: 'drop-me', webhook_secret: 'drop-me' }));
    });
    await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
    const apiBaseUrl = `http://127.0.0.1:${(api.address() as { port: number }).port}`;

    let startUrl = '';
    const done = runManifestFlow({ apiBaseUrl, webBaseUrl: 'https://github.example', owner: { type: 'org', login: 'acme' }, appName: 'viewer', onUrl: (u) => (startUrl = u), timeoutMs: 10_000 });
    while (!startUrl) await new Promise((r) => setTimeout(r, 10));

    const page = await fetch(startUrl);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy')!, /form-action https:\/\/github\.example/);
    const action = html.match(/action="([^"]+)"/)![1]!.replace(/&amp;/g, '&');
    assert.ok(action.startsWith('https://github.example/organizations/acme/settings/apps/new?state='));
    const state = new URL(action).searchParams.get('state')!;
    const manifest = JSON.parse(html.match(/name="manifest" value="([^"]+)"/)![1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    assert.equal(manifest.redirect_url, startUrl.replace('/start', '/callback'));
    assert.ok(Object.values(manifest.default_permissions).every((v) => v === 'read'));

    const base = startUrl.replace('/start', '');
    assert.equal((await fetch(`${base}/callback?code=abc&state=wrong`)).status, 400);
    // fetch can't set Host, so use node:http for the DNS-rebinding check.
    const rebind = await new Promise<number>((resolve) => get(`${base}/start`, { headers: { host: 'evil.example' }, agent: false }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }));
    assert.equal(rebind, 421);

    const cb = await fetch(`${base}/callback?code=abc123&state=${encodeURIComponent(state)}`);
    assert.equal(cb.status, 200);
    const conv = await done;
    assert.equal(exchanged, 'POST /app-manifests/abc123/conversions');
    assert.deepEqual({ id: conv.id, slug: conv.slug, clientId: conv.clientId, pem: conv.pem }, { id: 42, slug: 'viewer', clientId: 'Iv1.42', pem: 'PEM' });
    assert.ok(!JSON.stringify(conv).includes('drop-me'));
    api.close();
    api.closeAllConnections();
  });
});

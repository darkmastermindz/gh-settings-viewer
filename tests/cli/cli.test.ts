import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCli, DEFAULT_PORT } from '../../src/cli/args.ts';
import { enterpriseSteps } from '../../src/cli/init.ts';
import { buildManifest, exchangeCode, registrationUrl } from '../../src/cli/manifest-flow.ts';
import { findFreePort } from '../../src/cli/ports.ts';
import { isNewer } from '../../src/cli/update-check.ts';
import { createServer } from 'node:net';

describe('CLI arguments', () => {
  it('defaults to start on 127.0.0.1:4783 and opens the browser', () => {
    const a = parseCli([]);
    assert.equal(a.command, 'start');
    assert.equal(a.port, DEFAULT_PORT);
    assert.equal(a.host, '127.0.0.1');
    assert.equal(a.open, true);
    assert.equal(a.unsafeBind, false);
  });
  it('parses commands and flags', () => {
    const a = parseCli(['doctor', '--json', '--config', '/x.json', '--app-id', '5', '--api-url', 'https://ghe.example/api/v3']);
    assert.equal(a.command, 'doctor');
    assert.equal(a.json, true);
    assert.equal(a.config, '/x.json');
    assert.equal(a.appId, '5');
    const s = parseCli(['start', '--port', '9000', '--no-open', '--host', '0.0.0.0', '--unsafe-bind']);
    assert.deepEqual([s.port, s.open, s.host, s.unsafeBind], [9000, false, '0.0.0.0', true]);
  });
  it('rejects bad input', () => {
    assert.throws(() => parseCli(['--port', '0']));
    assert.throws(() => parseCli(['--port', 'abc']));
    assert.throws(() => parseCli(['deploy']));
    assert.throws(() => parseCli(['--nope']));
  });
  it('auto-increments past a busy port', async () => {
    const busy = createServer();
    await new Promise<void>((r) => busy.listen(0, '127.0.0.1', r));
    const port = (busy.address() as { port: number }).port;
    assert.equal(await findFreePort(port, '127.0.0.1'), port + 1 <= 65535 ? await findFreePort(port + 1, '127.0.0.1') : port);
    busy.close();
  });
});

describe('manifest flow', () => {
  const m = buildManifest('viewer', 'http://127.0.0.1:5000/callback');
  it('requests read-only permissions only, and no enterprise permissions', () => {
    const levels = new Set(Object.values(m.default_permissions));
    assert.deepEqual([...levels], ['read']);
    assert.ok(Object.keys(m.default_permissions).length > 50);
    assert.ok(!Object.keys(m.default_permissions).some((k) => k.startsWith('enterprise_')));
    assert.ok(m.default_permissions.metadata && m.default_permissions.organization_administration && m.default_permissions.members);
  });
  it('is private, has no active webhook, and returns to localhost', () => {
    assert.equal(m.public, false);
    assert.equal(m.hook_attributes.active, false);
    assert.equal(m.redirect_url, 'http://127.0.0.1:5000/callback');
    assert.deepEqual(m.default_events, []);
  });
  it('posts to the personal or organization registration page with state', () => {
    assert.equal(registrationUrl('https://github.com', { type: 'user' }, 's1'), 'https://github.com/settings/apps/new?state=s1');
    assert.equal(registrationUrl('https://github.com', { type: 'org', login: 'acme' }, 's 2'), 'https://github.com/organizations/acme/settings/apps/new?state=s%202');
  });
  it('exchanges the code and keeps only the ID, client ID and key', async () => {
    let called = '';
    const conv = await exchangeCode('https://api.github.test', 'abc123', (async (url: string, init: RequestInit) => {
      called = `${init.method} ${url}`;
      return new Response(JSON.stringify({ id: 9, slug: 'viewer', client_id: 'Iv1.9', pem: 'PEM', client_secret: 'cs', webhook_secret: 'ws', owner: { login: 'acme' } }), { status: 201 });
    }) as typeof fetch);
    assert.equal(called, 'POST https://api.github.test/app-manifests/abc123/conversions');
    assert.deepEqual(Object.keys(conv).sort(), ['clientId', 'htmlUrl', 'id', 'owner', 'pem', 'slug']);
  });
  it('prints manual enterprise steps listing the enterprise permissions', () => {
    const steps = enterpriseSteps('https://github.com', 'enterprise-owned', 'octo');
    assert.match(steps, /enterprises\/octo\/settings\/apps\/new/);
    assert.match(steps, /Enterprise permissions/);
    assert.match(steps, /Read-only/);
  });
});

describe('update notice', () => {
  it('compares versions', () => {
    assert.ok(isNewer('0.2.0', '0.1.9'));
    assert.ok(isNewer('1.0.0', '0.9.9'));
    assert.ok(!isNewer('0.1.0', '0.1.0'));
    assert.ok(!isNewer('0.1.0', '0.2.0'));
  });
});

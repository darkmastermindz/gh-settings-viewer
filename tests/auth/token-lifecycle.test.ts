import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOKEN_EXPIRY_SKEW_MS } from '../../src/core/auth/installation-tokens.ts';
import { GitHubRequestError } from '../../src/core/github/client.ts';
import { makeStack } from '../helpers/setup.ts';

const HOOKS = { status: 200, body: [{ id: 1, name: 'web', active: true, config: { url: 'https://example.com/hook' } }] };

describe('installation tokens', () => {
  it('reuses one token across N requests with exactly 1 mint', async () => {
    const { gh, readerFor, tokens } = makeStack();
    gh.on('GET /orgs/acme/hooks', HOOKS);
    const reader = readerFor(11);
    for (let i = 0; i < 25; i++) await reader.get('/orgs/{org}/hooks', { org: 'acme' }, { refresh: true });
    assert.equal(gh.mints.length, 1);
    assert.equal(tokens.mintCount(11), 1);
    const auths = new Set(gh.settingsRequests.map((r) => r.authorization));
    assert.equal(gh.settingsRequests.length, 25);
    assert.deepEqual([...auths], [`token ${gh.mints[0]!.token}`]);
  });

  it('does not refresh before expires_at - 60s, and refreshes exactly once after', async () => {
    const { gh, readerFor } = makeStack();
    gh.on('GET /orgs/acme/hooks', HOOKS);
    const reader = readerFor(11);
    await reader.get('/orgs/{org}/hooks', { org: 'acme' }, { refresh: true });
    const expiresAt = gh.clock.now() + gh.tokenLifetimeMs;

    gh.clock.t = expiresAt - TOKEN_EXPIRY_SKEW_MS - 1; // 1 ms before the refresh point
    await reader.get('/orgs/{org}/hooks', { org: 'acme' }, { refresh: true });
    assert.equal(gh.mints.length, 1, 'no refresh before expires_at - 60s');

    gh.clock.t = expiresAt - TOKEN_EXPIRY_SKEW_MS; // the refresh point
    for (let i = 0; i < 5; i++) await reader.get('/orgs/{org}/hooks', { org: 'acme' }, { refresh: true });
    assert.equal(gh.mints.length, 2, 'exactly one refresh after');
    const last = gh.settingsRequests.at(-1)!;
    assert.equal(last.authorization, `token ${gh.mints[1]!.token}`);
  });

  it('50 concurrent requests on a cold cache produce 1 mint (single-flight)', async () => {
    const { gh, readerFor } = makeStack();
    gh.mintDelayMs = 25;
    gh.on('GET /orgs/acme/hooks', HOOKS);
    const reader = readerFor(11);
    const results = await Promise.all(Array.from({ length: 50 }, () => reader.get('/orgs/{org}/hooks', { org: 'acme' }, { refresh: true })));
    assert.equal(results.length, 50);
    assert.equal(gh.mints.length, 1);
    assert.equal(gh.requests.filter((r) => r.method === 'POST').length, 1);
  });

  it('mints lazily, per installation, never at construction', async () => {
    const { gh, readerFor } = makeStack();
    gh.on('GET /orgs/acme/hooks', HOOKS).on('GET /orgs/beta/hooks', HOOKS);
    readerFor(11);
    readerFor(12);
    assert.equal(gh.mints.length, 0);
    await readerFor(11).get('/orgs/{org}/hooks', { org: 'acme' });
    assert.deepEqual(gh.mints.map((m) => m.installationId), [11]);
    await readerFor(12).get('/orgs/{org}/hooks', { org: 'beta' });
    assert.deepEqual(gh.mints.map((m) => m.installationId), [11, 12]);
  });

  it('a 401 triggers exactly one re-mint and one retry', async () => {
    const { gh, readerFor } = makeStack();
    let calls = 0;
    gh.on('GET /orgs/acme/hooks', () => (++calls === 1 ? { status: 401, body: { message: 'Bad credentials' } } : HOOKS));
    const res = await readerFor(11).get('/orgs/{org}/hooks', { org: 'acme' });
    assert.equal(res.status, 200);
    assert.equal(gh.mints.length, 2);
    assert.equal(gh.settingsRequests.length, 2);
    assert.equal(gh.settingsRequests[1]!.authorization, `token ${gh.mints[1]!.token}`);
  });

  it('a second 401 fails cleanly, without looping', async () => {
    const { gh, readerFor } = makeStack();
    gh.on('GET /orgs/acme/hooks', { status: 401, body: { message: 'Bad credentials' } });
    await assert.rejects(readerFor(11).get('/orgs/{org}/hooks', { org: 'acme' }), (e: unknown) => e instanceof GitHubRequestError && e.status === 401 && e.endpoint === 'GET /orgs/acme/hooks');
    assert.equal(gh.mints.length, 2, 'one initial mint + one re-mint');
    assert.equal(gh.settingsRequests.length, 2, 'one request + one retry');
  });

  it('concurrent 401s share one re-mint', async () => {
    const { gh, readerFor } = makeStack();
    const bad = new Set<string>();
    gh.on('GET /orgs/acme/hooks', (req) => {
      if (gh.mints.length === 1 && req.authorization === `token ${gh.mints[0]!.token}`) {
        bad.add(req.authorization!);
        return { status: 401, body: { message: 'Bad credentials' } };
      }
      return HOOKS;
    });
    const reader = readerFor(11);
    await reader.get('/orgs/{org}/hooks', { org: 'acme' }, { refresh: true }).catch(() => undefined);
    const before = gh.mints.length;
    await Promise.all(Array.from({ length: 10 }, () => reader.get('/orgs/{org}/hooks', { org: 'acme' }, { refresh: true })));
    assert.ok(gh.mints.length - before <= 1);
    assert.equal(bad.size, 1);
  });

  it('reports token status without the token', async () => {
    const { gh, readerFor, tokens } = makeStack();
    gh.on('GET /orgs/acme/hooks', HOOKS);
    assert.equal(tokens.status(11).state, 'none');
    await readerFor(11).get('/orgs/{org}/hooks', { org: 'acme' });
    const s = tokens.status(11);
    assert.equal(s.state, 'valid');
    assert.equal(s.msRemaining, gh.tokenLifetimeMs);
    assert.ok(!JSON.stringify(s).includes('ghs_'));
  });
});

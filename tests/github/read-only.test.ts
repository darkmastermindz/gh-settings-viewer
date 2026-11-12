import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertGraphqlQuery, assertReadOnlyRequest, ReadOnlyViolation } from '../../src/core/github/client.ts';
import { API } from '../helpers/fake-github.ts';
import { makeStack } from '../helpers/setup.ts';

const bases = { apiBaseUrl: API, graphqlUrl: `${API}/graphql` };

describe('read-only wrapper', () => {
  it('rejects every non-GET method on REST paths', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.throws(() => assertReadOnlyRequest({ method, url: `${API}/orgs/acme/hooks` }, bases), ReadOnlyViolation, method);
    }
    assert.doesNotThrow(() => assertReadOnlyRequest({ method: 'GET', url: `${API}/orgs/acme/hooks?per_page=1` }, bases));
  });

  it('makes the mint endpoint and other /app paths unreachable', async () => {
    assert.throws(() => assertReadOnlyRequest({ method: 'POST', url: `${API}/app/installations/1/access_tokens` }, bases), ReadOnlyViolation);
    for (const p of ['/app', '/app/installations', '/app/installations/1/access_tokens', '/app-manifests/abc/conversions']) {
      assert.throws(() => assertReadOnlyRequest({ method: 'GET', url: `${API}${p}` }, bases), ReadOnlyViolation, p);
    }
    const { gh, readerFor } = makeStack();
    await assert.rejects(readerFor(11).get('/app/installations/{id}/access_tokens', { id: 11 }), ReadOnlyViolation);
    await assert.rejects(readerFor(11).get('/app'), ReadOnlyViolation);
    assert.equal(gh.requests.length, 0, 'nothing was sent, not even a mint');
  });

  it('rejects paths outside the settings allowlist, other hosts and traversal', () => {
    for (const url of [`${API}/user`, `${API}/gists`, 'https://evil.example/orgs/acme', `${API}/orgs/../app`, `${API}/orgs/acme/%2e%2e/app`]) {
      assert.throws(() => assertReadOnlyRequest({ method: 'GET', url }, bases), ReadOnlyViolation, url);
    }
  });

  it('allows POST only to /graphql, and only queries', () => {
    assert.doesNotThrow(() => assertReadOnlyRequest({ method: 'POST', url: `${API}/graphql`, body: JSON.stringify({ query: '{ viewer { login } }' }) }, bases));
    assert.throws(() => assertReadOnlyRequest({ method: 'POST', url: `${API}/graphql`, body: JSON.stringify({ query: 'mutation { addStar(input: {starrableId: "x"}) { clientMutationId } }' }) }, bases), ReadOnlyViolation);
    assert.throws(() => assertReadOnlyRequest({ method: 'POST', url: `${API}/graphqlx`, body: '{}' }, bases), ReadOnlyViolation);
  });

  it('rejects GraphQL mutations however they are written', () => {
    const bad = [
      'mutation { x }',
      'MUTATION { x }',
      'query A { a } mutation B { b }',
      'subscription { x }',
      '# comment\nmutation\n{ x }',
      '  mutation($id: ID!) { deleteRepository(input: {repositoryId: $id}) { clientMutationId } }',
    ];
    for (const q of bad) assert.throws(() => assertGraphqlQuery(q), ReadOnlyViolation, q);
    assert.throws(() => assertGraphqlQuery(''), ReadOnlyViolation);
    assert.throws(() => assertGraphqlQuery(undefined), ReadOnlyViolation);
    // The word inside a string or comment is fine.
    assert.doesNotThrow(() => assertGraphqlQuery('query { search(query: "mutation", type: REPOSITORY) { repositoryCount } } # mutation'));
  });

  it('refuses a mutation through reader.graphql before sending anything', async () => {
    const { gh, readerFor } = makeStack();
    await assert.rejects(readerFor(11).graphql('mutation { x }'), ReadOnlyViolation);
    assert.equal(gh.requests.length, 0);
  });
});

describe('conditional requests and rate limits', () => {
  it('sends If-None-Match and serves a 304 from the cache', async () => {
    const { gh, readerFor, rateLimits } = makeStack();
    let n = 0;
    gh.on('GET /orgs/acme', (req) => {
      n++;
      if (req.ifNoneMatch === '"v1"') return { status: 304, headers: { etag: '"v1"', 'x-ratelimit-remaining': '4999' } };
      return { status: 200, body: { login: 'acme', plan: { name: 'enterprise' } }, headers: { etag: '"v1"', 'x-ratelimit-remaining': '4998' } };
    });
    const r = readerFor(11);
    const first = await r.get('/orgs/{org}', { org: 'acme' });
    const second = await r.get('/orgs/{org}', { org: 'acme' }, { refresh: true });
    assert.equal(n, 2);
    assert.equal(gh.settingsRequests[1]!.ifNoneMatch, '"v1"');
    assert.equal(second.status, 304);
    assert.deepEqual(second.data, first.data);
    assert.equal(rateLimits.get(11)?.remaining, 4999);
    assert.ok(rateLimits.get(11)?.resetAt);
  });

  it('serves within the TTL without a request, and refresh bypasses it', async () => {
    const { gh, readerFor } = makeStack();
    gh.on('GET /orgs/acme', { status: 200, body: { login: 'acme' } });
    const r = readerFor(11);
    await r.get('/orgs/{org}', { org: 'acme' });
    const cached = await r.get('/orgs/{org}', { org: 'acme' });
    assert.equal(cached.fromCache, true);
    assert.equal(gh.settingsRequests.length, 1);
    gh.clock.advance(5 * 60_000);
    await r.get('/orgs/{org}', { org: 'acme' });
    assert.equal(gh.settingsRequests.length, 2);
  });

  it('paginates fully', async () => {
    const { gh, readerFor } = makeStack();
    gh.on('GET /orgs/acme/members', (req) => {
      const page = Number(new URL(req.url).searchParams.get('page') ?? '1');
      const next: Record<string, string> = page < 3 ? { link: `<${API}/orgs/acme/members?per_page=100&page=${page + 1}>; rel="next"` } : {};
      return { status: 200, body: [{ login: `user${page}` }], headers: next };
    });
    const res = await readerFor(11).get('/orgs/{org}/members', { org: 'acme' }, { paginate: true });
    assert.deepEqual((res.data as { login: string }[]).map((m) => m.login), ['user1', 'user2', 'user3']);
  });
});

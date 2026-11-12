import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAppApi } from '../../src/core/auth/app-api.ts';
import { candidateFeatures, discover, probeOutcome } from '../../src/core/discovery/discover.ts';
import type { Feature } from '../../src/core/registry/types.ts';
import { API } from '../helpers/fake-github.ts';
import { makeStack } from '../helpers/setup.ts';

const f = (id: string, scope: Feature['scope'], path: `/${string}`, perm: Feature['requiredPermission']): Feature => ({
  id,
  scope,
  section: 'Test',
  label: id,
  requiredPermission: perm,
  endpoints: [{ kind: 'rest', path }],
  renderer: { type: 'keyValue' },
});
const read = (name: string) => ({ name, access: 'read' as const });

const REGISTRY: Feature[] = [
  f('org-hooks', 'org', '/orgs/{org}/hooks', read('organization_hooks')),
  f('org-secrets', 'org', '/orgs/{org}/actions/secrets', read('organization_secrets')),
  f('org-members', 'org', '/orgs/{org}/members', read('members')),
  f('org-etag', 'org', '/orgs/{org}/teams', read('members')),
  f('org-profile', 'org', '/orgs/{org}', 'installation'),
  f('repo-general', 'repo', '/repos/{owner}/{repo}', read('metadata')),
  f('repo-keys', 'repo', '/repos/{owner}/{repo}/keys', read('administration')),
  f('ent-teams', 'enterprise', '/enterprises/{enterprise}/teams', read('enterprise_teams')),
  f('ent-billing', 'enterprise', '/enterprises/{enterprise}/settings/billing/usage/summary', read('enterprise_billing')),
];

function setup() {
  const stack = makeStack();
  const { gh } = stack;
  gh.installations = [
    { id: 1, login: 'octo-ent', slug: 'octo-ent', targetType: 'Enterprise', permissions: { enterprise_teams: 'read', enterprise_billing: 'read' } },
    { id: 2, login: 'acme', targetType: 'Organization', permissions: { organization_hooks: 'read', organization_secrets: 'read', members: 'read', metadata: 'read', administration: 'read' } },
    { id: 3, login: 'beta', targetType: 'Organization', permissions: { organization_hooks: 'read', metadata: 'read' } },
  ];
  gh.on('GET /enterprises/octo-ent/teams', { status: 200, body: [] })
    .on('GET /enterprises/octo-ent/settings/billing/usage/summary', { status: 403, body: { message: 'Resource not accessible by integration' } })
    .on('GET /orgs/acme/hooks', { status: 200, body: [] })
    .on('GET /orgs/acme/actions/secrets', { status: 404, body: { message: 'Not Found' } })
    .on('GET /orgs/acme/members', { status: 200, body: [] })
    .on('GET /orgs/acme/teams', { status: 304 })
    .on('GET /orgs/acme', { status: 200, body: { login: 'acme' } })
    .on('GET /orgs/beta/hooks', { status: 200, body: [] })
    .on('GET /orgs/beta', { status: 200, body: { login: 'beta' } })
    .on('GET /installation/repositories', (req) => ({ status: 200, body: { total_count: 1, repositories: [{ name: req.authorization === `token ${gh.mints.find((m) => m.installationId === 2)?.token}` ? 'api' : 'web', owner: { login: req.authorization === `token ${gh.mints.find((m) => m.installationId === 2)?.token}` ? 'acme' : 'beta' }, default_branch: 'main' }] } }))
    .on('GET /repos/acme/api', { status: 200, body: { name: 'api' } })
    .on('GET /repos/acme/api/keys', { status: 403, body: { message: 'Resource not accessible by integration' } })
    .on('GET /repos/beta/web', { status: 200, body: { name: 'web' } });
  const appApi = createAppApi({ apiBaseUrl: API, jwt: stack.jwt, fetch: gh.fetch });
  return { ...stack, appApi };
}

describe('probe outcome', () => {
  it('2xx and 304 register; 403 and 404 hide', () => {
    for (const s of [200, 201, 204, 304]) assert.equal(probeOutcome(s), 'register', String(s));
    for (const s of [401, 403, 404, 410, 422]) assert.equal(probeOutcome(s), 'hide', String(s));
    for (const s of [0, 429, 500, 502]) assert.equal(probeOutcome(s), 'error', String(s));
  });
});

describe('capability discovery', () => {
  it('filters by granted permission, then registers only pages whose probe passes', async () => {
    const { gh, appApi, readerFor } = setup();
    const caps = await discover({ appApi, readerFor, registry: REGISTRY, now: () => gh.clock.now() });
    const by = Object.fromEntries(caps.installations.map((i) => [i.key, i.features.sort()]));
    assert.deepEqual(by['octo-ent'], ['ent-teams']); // billing probe → 403 → hidden
    assert.deepEqual(by.acme, ['org-etag', 'org-hooks', 'org-members', 'org-profile', 'repo-general']); // secrets 404, keys 403 hidden; 304 registers
    assert.deepEqual(by.beta, ['org-hooks', 'org-profile', 'repo-general']); // per-org: no members/secrets permission
  });

  it('never probes an endpoint whose permission is not granted', async () => {
    const { gh, appApi, readerFor } = setup();
    await discover({ appApi, readerFor, registry: REGISTRY, now: () => gh.clock.now() });
    assert.ok(!gh.requests.some((r) => r.path === '/orgs/beta/members'));
    assert.ok(!gh.requests.some((r) => r.path === '/orgs/beta/actions/secrets'));
  });

  it('probes cheaply (per_page=1) and mints one token per installation', async () => {
    const { gh, appApi, readerFor } = setup();
    await discover({ appApi, readerFor, registry: REGISTRY, now: () => gh.clock.now() });
    const probes = gh.settingsRequests.filter((r) => r.path !== '/installation/repositories');
    assert.ok(probes.every((r) => new URL(r.url).searchParams.get('per_page') === '1'));
    assert.deepEqual(gh.mints.map((m) => m.installationId).sort(), [1, 2, 3]);
  });

  it('candidate filtering respects scope: enterprise installations get enterprise pages only', () => {
    const ent = candidateFeatures(REGISTRY, { scope: 'enterprise', permissions: { enterprise_teams: 'read', members: 'read', metadata: 'read' } });
    assert.deepEqual(ent.map((x) => x.id), ['ent-teams']);
    const user = candidateFeatures(REGISTRY, { scope: 'user', permissions: { metadata: 'read' } });
    assert.deepEqual(user.map((x) => x.id), ['repo-general']);
  });
});

// A local HTTP mock of the GitHub API (built on FakeGitHub) for end-to-end runs of the real CLI and server.
// Usage: node tests/e2e/mock-github.ts [port]  → prints the API base URL and writes a test key.
import { createServer, type Server } from 'node:http';
import { writeFileSync } from 'node:fs';
import { FakeClock, FakeGitHub, testKeys } from '../helpers/fake-github.ts';

export function seed(gh: FakeGitHub): FakeGitHub {
  gh.appPermissions = { metadata: 'read', members: 'read', organization_hooks: 'read', organization_secrets: 'read', organization_administration: 'read', administration: 'read', repository_hooks: 'read', secrets: 'read', actions_variables: 'read', enterprise_teams: 'read', enterprise_organization_installations: 'read' };
  gh.installations = [
    { id: 1, login: 'octo-corp', slug: 'octo-corp', targetType: 'Enterprise', permissions: { enterprise_teams: 'read', enterprise_organization_installations: 'read' } },
    { id: 2, login: 'acme', targetType: 'Organization', permissions: { metadata: 'read', members: 'read', organization_hooks: 'read', organization_secrets: 'read', organization_administration: 'read', administration: 'read', repository_hooks: 'read', secrets: 'read', actions_variables: 'read' } },
    { id: 3, login: 'globex', targetType: 'Organization', permissions: { metadata: 'read', members: 'read', organization_hooks: 'read', organization_administration: 'read', administration: 'read' } },
  ];
  const tokenFor = (id: number) => gh.mints.filter((m) => m.installationId === id).map((m) => `token ${m.token}`);
  const orgOf = (auth: string | null) => (tokenFor(2).includes(auth ?? '') ? 'acme' : 'globex');

  gh.on('GET /enterprises/octo-corp/teams', { status: 200, body: [{ name: 'Platform', slug: 'platform', description: 'Platform engineering', group_name: 'eng-platform', created_at: '2026-03-01T10:00:00Z' }, { name: 'Security', slug: 'security', description: 'AppSec', group_name: null, created_at: '2026-04-11T10:00:00Z' }] });
  gh.on('GET /enterprises/octo-corp/apps/installable_organizations', { status: 200, body: [{ id: 10, login: 'acme' }, { id: 11, login: 'globex' }, { id: 12, login: 'initech' }] });
  for (const org of ['acme', 'globex']) {
    gh.on(`GET /orgs/${org}`, { status: 200, body: { login: org, id: org === 'acme' ? 10 : 11, name: org === 'acme' ? 'Acme Inc.' : 'Globex', description: 'Example org', two_factor_requirement_enabled: org === 'acme', default_repository_permission: org === 'acme' ? 'read' : 'none', members_can_create_repositories: org !== 'acme', web_commit_signoff_required: false, plan: { name: 'enterprise', seats: 50 } } });
    gh.on(`GET /orgs/${org}/members`, (req) => ({ status: 200, body: new URL(req.url).searchParams.get('role') === 'admin' ? [{ login: 'octocat', type: 'User', site_admin: false }] : [{ login: 'octocat', type: 'User', site_admin: false }, { login: 'hubot', type: 'Bot', site_admin: false }, { login: `${org}-dev`, type: 'User', site_admin: false }] }));
    gh.on(`GET /orgs/${org}/hooks`, { status: 200, body: [{ id: 7, name: 'web', active: true, events: ['push', 'pull_request'], config: { url: `https://ci.${org}.example/hook`, content_type: 'json', insecure_ssl: '0', secret: '********' }, updated_at: '2026-10-01T09:00:00Z' }] });
    gh.on(`GET /orgs/${org}/actions/permissions`, { status: 200, body: { enabled_repositories: 'all', allowed_actions: org === 'acme' ? 'selected' : 'all', sha_pinning_required: org === 'acme' } });
    gh.on(`GET /orgs/${org}/actions/permissions/workflow`, { status: 200, body: { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false } });
    gh.on(`GET /orgs/${org}/actions/permissions/selected-actions`, org === 'acme' ? { status: 200, body: { github_owned_allowed: true, verified_allowed: false, patterns_allowed: ['actions/*'] } } : { status: 409, body: { message: 'Allowed actions is not set to selected' } });
    gh.on(`GET /installation/repositories`, (req) => {
      const o = orgOf(req.authorization);
      return { status: 200, body: { total_count: 2, repositories: [{ name: 'api', full_name: `${o}/api`, owner: { login: o }, private: true, archived: false, default_branch: 'main', has_pages: false }, { name: 'docs', full_name: `${o}/docs`, owner: { login: o }, private: false, archived: false, default_branch: 'main', has_pages: true }] } };
    });
  }
  gh.on('GET /orgs/acme/actions/secrets', { status: 200, body: { total_count: 2, secrets: [{ name: 'NPM_TOKEN', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', visibility: 'private' }, { name: 'DEPLOY_KEY', created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z', visibility: 'all' }] } });
  for (const [owner, repo] of [['acme', 'api'], ['acme', 'docs'], ['globex', 'api'], ['globex', 'docs']] as const) {
    gh.on(`GET /repos/${owner}/${repo}`, { status: 200, body: { name: repo, full_name: `${owner}/${repo}`, private: repo === 'api', default_branch: 'main', allow_squash_merge: true, allow_merge_commit: owner === 'globex', delete_branch_on_merge: owner === 'acme', security_and_analysis: { secret_scanning: { status: 'enabled' } } } });
    gh.on(`GET /repos/${owner}/${repo}/hooks`, { status: 200, body: [] });
    gh.on(`GET /repos/${owner}/${repo}/keys`, { status: 200, body: [{ id: 1, title: 'deploy', key: 'ssh-ed25519 AAAAC3Nza...', read_only: true, verified: true, created_at: '2026-05-05T00:00:00Z', last_used: '2026-11-01T00:00:00Z', added_by: 'octocat' }] });
    gh.on(`GET /repos/${owner}/${repo}/teams`, { status: 200, body: [{ name: 'Platform', slug: 'platform', permission: 'admin', privacy: 'closed' }] });
    gh.on(`GET /repos/${owner}/${repo}/rulesets`, { status: 200, body: [{ id: 1, name: 'Protect main', source_type: 'Organization', source: owner, target: 'branch', enforcement: 'active', updated_at: '2026-08-01T00:00:00Z' }] });
    gh.on(`GET /repos/${owner}/${repo}/actions/secrets`, { status: 200, body: { total_count: 1, secrets: [{ name: 'API_KEY', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }] } });
    gh.on(`GET /repos/${owner}/${repo}/actions/variables`, { status: 200, body: { total_count: 1, variables: [{ name: 'REGION', value: 'us-east-1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }] } });
  }
  return gh;
}

export async function startMockGitHub(port = 0): Promise<{ url: string; server: Server; gh: FakeGitHub }> {
  const gh = seed(new FakeGitHub(new FakeClock(Date.now())));
  gh.clock.now = () => Date.now();
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks).toString() : undefined;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers[k] = v;
    const r = await gh.fetch(`${API_BASE}${req.url}`, { method: req.method, headers, body });
    const out: Record<string, string> = {};
    r.headers.forEach((v, k) => (out[k] = v));
    res.writeHead(r.status, out);
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const addr = server.address();
  const url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : port}`;
  return { url, server, gh };
}

const API_BASE = 'https://api.github.test';

if (import.meta.main) {
  const port = Number(process.argv[2] ?? 0);
  const { url } = await startMockGitHub(port);
  const keyPath = process.argv[3];
  if (keyPath) writeFileSync(keyPath, testKeys().pem, { mode: 0o600 });
  console.log(url);
}

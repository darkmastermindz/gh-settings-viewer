// Capability discovery: GET /app → GET /app/installations → registry filtered by granted permissions →
// one cheap probe per candidate page. Only pages whose probe answers 2xx or 304 are registered.
import type { AppApi, AppInfo, InstallationInfo } from '../auth/app-api.ts';
import { GitHubRequestError, type GitHubReader } from '../github/client.ts';
import { mapLimit } from '../github/limiter.ts';
import type { Feature, Scope } from '../registry/types.ts';
import { log } from '../security/redact.ts';

export type InstallationScope = 'enterprise' | 'org' | 'user';

export interface SampleRepo {
  owner: string;
  name: string;
  defaultBranch: string;
}

export interface DiscoveredInstallation {
  id: number;
  account: { login: string; type: string; slug?: string };
  scope: InstallationScope;
  /** The enterprise slug or the org/user login, as used in URLs. */
  key: string;
  permissions: Record<string, string>;
  repositorySelection?: string;
  suspended: boolean;
  /** IDs of pages that passed discovery for this installation. */
  features: string[];
  sampleRepo?: SampleRepo;
  writePermissions: string[];
}

export interface Capabilities {
  app: AppInfo;
  installations: DiscoveredInstallation[];
  appWritePermissions: string[];
  discoveredAt: number;
  probes: { total: number; registered: number; transientErrors: number };
}

export type ProbeOutcome = 'register' | 'hide' | 'error';

/** 2xx and 304 register the page. 403 and 404 (and other 4xx) hide it. Anything else is a transient error (hidden too). */
export function probeOutcome(status: number): ProbeOutcome {
  if ((status >= 200 && status < 300) || status === 304) return 'register';
  if (status >= 400 && status < 500 && status !== 429) return 'hide';
  return 'error';
}

export function installationScope(i: Pick<InstallationInfo, 'targetType'>): InstallationScope {
  if (i.targetType === 'Enterprise') return 'enterprise';
  if (i.targetType === 'Organization') return 'org';
  return 'user';
}

/** Which registry scopes an installation can serve. Enterprise installations get enterprise permissions only. */
export function scopesFor(scope: InstallationScope): Scope[] {
  if (scope === 'enterprise') return ['enterprise'];
  if (scope === 'org') return ['org', 'repo'];
  return ['repo'];
}

export function hasPermission(granted: Record<string, string>, name: string): boolean {
  const level = granted[name];
  return level === 'read' || level === 'write' || level === 'admin';
}

export function writePermissionsOf(granted: Record<string, string>): string[] {
  return Object.entries(granted)
    .filter(([, level]) => level === 'write' || level === 'admin')
    .map(([name]) => name)
    .sort();
}

/** Registry entries this installation's permissions allow (before probing). */
export function candidateFeatures(registry: readonly Feature[], inst: Pick<DiscoveredInstallation, 'scope' | 'permissions'>): Feature[] {
  const scopes = scopesFor(inst.scope);
  return registry.filter((f) => {
    if (!scopes.includes(f.scope)) return false;
    if (f.requiredPermission === 'installation' || f.requiredPermission === 'graphql-probe') return true;
    if (!hasPermission(inst.permissions, f.requiredPermission.name)) return false;
    return (f.additionalPermissions ?? []).every((p) => hasPermission(inst.permissions, p.name));
  });
}

export function pathParams(scope: Scope, inst: Pick<DiscoveredInstallation, 'key'>, repo?: SampleRepo): Record<string, string> {
  if (scope === 'enterprise') return { enterprise: inst.key };
  if (scope === 'org') return { org: inst.key };
  if (!repo) throw new Error('Repository pages need a repository');
  return { owner: repo.owner, repo: repo.name, branch: repo.defaultBranch };
}

export function graphqlVars(scope: Scope, inst: Pick<DiscoveredInstallation, 'key'>, repo?: SampleRepo): Record<string, string> {
  if (scope === 'enterprise') return { slug: inst.key };
  if (scope === 'org') return { login: inst.key };
  return { owner: repo!.owner, name: repo!.name };
}

/** Runs one probe and classifies it. */
export async function probeFeature(reader: GitHubReader, feature: Feature, inst: DiscoveredInstallation, repo?: SampleRepo): Promise<ProbeOutcome> {
  const ep = feature.probe ?? feature.endpoints[0];
  if (!ep) return 'hide';
  try {
    if (ep.kind === 'graphql') {
      const res = await reader.graphql(ep.probe, graphqlVars(feature.scope, inst, repo), { probe: true });
      const root = res.data && typeof res.data === 'object' ? Object.values(res.data as Record<string, unknown>)[0] : null;
      return root === null || root === undefined ? 'hide' : 'register';
    }
    const res = await reader.get(ep.path, pathParams(feature.scope, inst, repo), { probe: true, query: ep.query });
    return probeOutcome(res.status);
  } catch (e) {
    if (e instanceof GitHubRequestError) {
      const outcome = e.status ? probeOutcome(e.status) : 'error';
      if (outcome === 'error') log.warn(`probe for ${feature.id} on ${inst.key}: ${e.endpoint} → ${e.status || 'network error'}`);
      return outcome;
    }
    log.warn(`probe for ${feature.id} on ${inst.key} failed: ${(e as Error).message}`);
    return 'error';
  }
}

interface RepoRow {
  name: string;
  owner?: { login: string };
  default_branch?: string;
  has_pages?: boolean;
  archived?: boolean;
}

export interface DiscoverDeps {
  appApi: AppApi;
  readerFor(installationId: number): GitHubReader;
  registry: readonly Feature[];
  now(): number;
  /** Max probes in flight across all installations. */
  concurrency?: number;
}

export async function discover(deps: DiscoverDeps): Promise<Capabilities> {
  const app = await deps.appApi.getApp();
  const raw = await deps.appApi.listInstallations();
  let total = 0;
  let registered = 0;
  let transientErrors = 0;

  const installations = await mapLimit(raw, 4, async (i): Promise<DiscoveredInstallation> => {
    const scope = installationScope(i);
    const inst: DiscoveredInstallation = {
      id: i.id,
      account: i.account,
      scope,
      key: scope === 'enterprise' ? (i.account.slug ?? i.account.login) : i.account.login,
      permissions: i.permissions,
      repositorySelection: i.repositorySelection,
      suspended: i.suspended,
      features: [],
      writePermissions: writePermissionsOf(i.permissions),
    };
    if (inst.suspended) return inst;

    const candidates = candidateFeatures(deps.registry, inst);
    if (candidates.length === 0) return inst;
    const reader = deps.readerFor(inst.id); // the first probe mints this installation's token

    let repos: RepoRow[] = [];
    if (candidates.some((f) => f.scope === 'repo')) {
      try {
        const res = await reader.get('/installation/repositories', {}, { query: { per_page: 100 } });
        repos = ((res.data as { repositories?: RepoRow[] }).repositories ?? []).filter((r) => !r.archived);
      } catch (e) {
        log.warn(`could not list repositories for ${inst.key}: ${(e as Error).message}`);
      }
      const first = repos[0];
      if (first) inst.sampleRepo = toSample(first, inst.key);
    }

    const outcomes = await mapLimit(candidates, deps.concurrency ?? 6, async (f) => {
      let repo: SampleRepo | undefined;
      if (f.scope === 'repo') {
        const match = f.probeRepoWhere?.has_pages ? repos.find((r) => r.has_pages) : repos[0];
        if (!match) return { f, outcome: 'hide' as ProbeOutcome };
        repo = toSample(match, inst.key);
      }
      total++;
      return { f, outcome: await probeFeature(reader, f, inst, repo) };
    });
    for (const { f, outcome } of outcomes) {
      if (outcome === 'register') {
        inst.features.push(f.id);
        registered++;
      } else if (outcome === 'error') transientErrors++;
    }
    return inst;
  });

  return {
    app,
    installations,
    appWritePermissions: writePermissionsOf(app.permissions),
    discoveredAt: deps.now(),
    probes: { total, registered, transientErrors },
  };
}

function toSample(r: RepoRow, fallbackOwner: string): SampleRepo {
  return { owner: r.owner?.login ?? fallbackOwner, name: r.name, defaultBranch: r.default_branch ?? 'main' };
}

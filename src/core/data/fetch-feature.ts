// Fetches one page's data for one target. Errors after discovery stay inline (per section).
import { API_VERSION } from '../auth/http.ts';
import { graphqlVars, pathParams, type DiscoveredInstallation, type SampleRepo } from '../discovery/discover.ts';
import { GitHubRequestError, type GitHubReader } from '../github/client.ts';
import type { Endpoint, Feature, GraphqlEndpoint, RestEndpoint } from '../registry/types.ts';
import { redact } from '../security/redact.ts';
import { getPath, omitPaths } from './shape.ts';
import type { FeatureData, SectionData, Target } from './types.ts';

const MAX_GRAPHQL_PAGES = 50;
const MAX_SCIM_PAGES = 50;

export interface RepoSummary {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  archived: boolean;
  defaultBranch: string;
  hasPages: boolean;
}

export async function listRepos(reader: GitHubReader, refresh = false): Promise<RepoSummary[]> {
  const res = await reader.get('/installation/repositories', {}, { paginate: true, refresh });
  return (res.data as Record<string, unknown>[]).map((r) => ({
    owner: (r.owner as { login: string }).login,
    name: r.name as string,
    fullName: r.full_name as string,
    private: Boolean(r.private),
    archived: Boolean(r.archived),
    defaultBranch: (r.default_branch as string) ?? 'main',
    hasPages: Boolean(r.has_pages),
  }));
}

export function curlFor(ep: Endpoint, url: string): string {
  const h = `-H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: ${API_VERSION}" -H "Authorization: Bearer $GITHUB_INSTALLATION_TOKEN"`;
  if (ep.kind === 'graphql') {
    const body = JSON.stringify({ query: ep.query.replace(/\s+/g, ' ').trim() }).replace(/'/g, "'\\''");
    return `curl -sS -X POST ${h} "${url}" -d '${body}'`;
  }
  return `curl -sS ${h} "${url}"`;
}

function expand(path: string, params: Record<string, string>): string {
  return path.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(params[k] ?? `{${k}}`));
}

export interface FetchFeatureOptions {
  refresh?: boolean;
  filter?: string;
}

export async function fetchFeature(reader: GitHubReader, feature: Feature, inst: DiscoveredInstallation, target: Target, repo: SampleRepo | undefined, opts: FetchFeatureOptions = {}): Promise<FeatureData> {
  const sections = await Promise.all(feature.endpoints.map((ep) => fetchSection(reader, feature, ep, inst, repo, opts)));
  return { featureId: feature.id, label: feature.label, target, sections, rateLimit: reader.rateLimit };
}

async function fetchSection(reader: GitHubReader, feature: Feature, ep: Endpoint, inst: DiscoveredInstallation, repo: SampleRepo | undefined, opts: FetchFeatureOptions): Promise<SectionData> {
  const view = ep.view ?? feature.renderer;
  if (ep.kind === 'graphql') return fetchGraphql(reader, feature, ep, inst, repo, opts, view);
  const params = pathParams(feature.scope, inst, repo);
  const query: Record<string, string> = { ...(ep.query ?? {}) };
  if (ep.filterParam && opts.filter) query[ep.filterParam] = opts.filter.slice(0, 500);
  const shownQuery = new URLSearchParams(query).toString();
  const display = `GET ${expand(ep.path, params)}${shownQuery ? `?${shownQuery}` : ''}`;
  const qs = new URLSearchParams({ ...query, ...(ep.paginate ? { per_page: '100' } : {}) }).toString();
  const url = `${reader.apiBaseUrl}${expand(ep.path, params)}${qs ? `?${qs}` : ''}`;
  const base: SectionData = { title: ep.title, endpoint: display, url, curl: curlFor(ep, url), view, filterParam: ep.filterParam };
  try {
    if (ep.scim) return { ...base, ...(await fetchScim(reader, ep, params, opts)) };
    const res = await reader.get(ep.path, params, { paginate: ep.paginate, maxPages: ep.maxPages, refresh: opts.refresh, query });
    if (view.type === 'status') return { ...base, status: res.status, fetchedAt: res.fetchedAt, fromCache: res.fromCache, data: view.meaning[res.status] ?? `HTTP ${res.status}` };
    return { ...base, status: res.status, fetchedAt: res.fetchedAt, fromCache: res.fromCache, data: shape(res.data, ep) };
  } catch (e) {
    const err = toInline(e, display);
    if (view.type === 'status' && view.meaning[err.status]) return { ...base, status: err.status, fetchedAt: Date.now(), data: view.meaning[err.status] };
    return { ...base, error: err };
  }
}

async function fetchScim(reader: GitHubReader, ep: RestEndpoint, params: Record<string, string>, opts: FetchFeatureOptions) {
  const all: unknown[] = [];
  let startIndex = 1;
  let last = { fetchedAt: 0, fromCache: false, status: 200 };
  for (let page = 0; page < MAX_SCIM_PAGES; page++) {
    const res = await reader.get(ep.path, params, { refresh: opts.refresh, query: { startIndex, count: 100 } });
    const body = res.data as { Resources?: unknown[]; totalResults?: number };
    const batch = body.Resources ?? [];
    all.push(...batch);
    last = { fetchedAt: res.fetchedAt, fromCache: res.fromCache, status: res.status };
    startIndex += batch.length;
    if (!batch.length || startIndex > (body.totalResults ?? 0)) break;
  }
  return { ...last, data: omitPaths(all, ep.omit) };
}

async function fetchGraphql(reader: GitHubReader, feature: Feature, ep: GraphqlEndpoint, inst: DiscoveredInstallation, repo: SampleRepo | undefined, opts: FetchFeatureOptions, view: SectionData['view']): Promise<SectionData> {
  const vars = graphqlVars(feature.scope, inst, repo);
  const base: SectionData = { title: ep.title, endpoint: 'POST /graphql', url: reader.graphqlUrl, curl: curlFor(ep, reader.graphqlUrl), view };
  try {
    if (!ep.connection) {
      const res = await reader.graphql(ep.query, vars, { refresh: opts.refresh });
      return { ...base, status: 200, fetchedAt: res.fetchedAt, fromCache: res.fromCache, data: shape(res.data, ep) };
    }
    const items: unknown[] = [];
    let cursor: string | null = null;
    let last = { fetchedAt: 0, fromCache: false };
    for (let page = 0; page < MAX_GRAPHQL_PAGES; page++) {
      const res = await reader.graphql(ep.query, { ...vars, cursor }, { refresh: opts.refresh });
      const conn = getPath(res.data, ep.connection) as { nodes?: unknown[]; edges?: unknown[]; pageInfo?: { hasNextPage: boolean; endCursor: string | null } } | null;
      items.push(...(conn?.nodes ?? conn?.edges ?? []));
      last = { fetchedAt: res.fetchedAt, fromCache: res.fromCache };
      if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      cursor = conn.pageInfo.endCursor;
    }
    return { ...base, status: 200, ...last, data: omitPaths(items, ep.omit) };
  } catch (e) {
    return { ...base, error: toInline(e, 'POST /graphql') };
  }
}

function shape(data: unknown, ep: Endpoint): unknown {
  const selected = ep.select ? getPath(data, ep.select) : data;
  return omitPaths(selected, ep.omit);
}

function toInline(e: unknown, endpoint: string): { status: number; endpoint: string; message: string } {
  if (e instanceof GitHubRequestError) return { status: e.status, endpoint: e.endpoint || endpoint, message: redact(e.message) };
  return { status: 0, endpoint, message: redact((e as Error).message ?? 'Request failed') };
}

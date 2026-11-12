// App-level reads authenticated with the app JWT: GET /app and GET /app/installations only.
// Fixed paths; no caller-supplied paths. The JWT is never used for settings calls.
import type { AppJwt } from './jwt.ts';
import { errorMessage, GitHubHttpError, jsonHeaders, type FetchLike } from './http.ts';

export interface AppInfo {
  id: number;
  slug: string;
  name: string;
  clientId?: string;
  owner?: { login: string; type: string };
  htmlUrl?: string;
  permissions: Record<string, string>;
  events: string[];
  installationsCount?: number;
}

export interface InstallationInfo {
  id: number;
  account: { login: string; type: string; slug?: string };
  targetType: 'Organization' | 'User' | 'Enterprise' | string;
  permissions: Record<string, string>;
  repositorySelection?: 'all' | 'selected' | string;
  suspended: boolean;
  htmlUrl?: string;
}

export interface AppApi {
  getApp(): Promise<AppInfo>;
  listInstallations(): Promise<InstallationInfo[]>;
}

export function createAppApi(opts: { apiBaseUrl: string; jwt: AppJwt; fetch?: FetchLike }): AppApi {
  const doFetch = opts.fetch ?? fetch;
  const get = async (path: '/app' | '/app/installations', query = '') => {
    const res = await doFetch(`${opts.apiBaseUrl}${path}${query}`, { method: 'GET', headers: jsonHeaders(`Bearer ${opts.jwt.get()}`) });
    if (!res.ok) throw new GitHubHttpError(res.status, `GET ${path}`, `GET ${path} failed: ${res.status} ${await errorMessage(res)}`);
    return res;
  };
  return {
    async getApp() {
      const a = (await (await get('/app')).json()) as Record<string, unknown>;
      const owner = a.owner as { login?: string; slug?: string; type?: string } | null;
      return {
        id: a.id as number,
        slug: a.slug as string,
        name: a.name as string,
        clientId: a.client_id as string | undefined,
        owner: owner ? { login: owner.login ?? owner.slug ?? '', type: owner.type ?? (owner.slug ? 'Enterprise' : '') } : undefined,
        htmlUrl: a.html_url as string | undefined,
        permissions: (a.permissions as Record<string, string>) ?? {},
        events: (a.events as string[]) ?? [],
        installationsCount: a.installations_count as number | undefined,
      };
    },
    async listInstallations() {
      const out: InstallationInfo[] = [];
      for (let page = 1; page <= 100; page++) {
        const res = await get('/app/installations', `?per_page=100&page=${page}`);
        const rows = (await res.json()) as Record<string, unknown>[];
        for (const i of rows) {
          const account = (i.account ?? {}) as { login?: string; slug?: string; type?: string; name?: string };
          out.push({
            id: i.id as number,
            account: { login: account.login ?? account.slug ?? account.name ?? '', type: account.type ?? (i.target_type as string), slug: account.slug },
            targetType: i.target_type as string,
            permissions: (i.permissions as Record<string, string>) ?? {},
            repositorySelection: i.repository_selection as string | undefined,
            suspended: Boolean(i.suspended_at),
            htmlUrl: i.html_url as string | undefined,
          });
        }
        if (!/rel="next"/.test(res.headers.get('link') ?? '') || rows.length === 0) break;
      }
      return out;
    },
  };
}

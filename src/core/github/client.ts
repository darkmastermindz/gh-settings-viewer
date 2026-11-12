// The general GitHub client. Read-only by construction: GET, plus POST /graphql for queries.
// It can't reach /app/* (JWT endpoints) or the token mint, and it never sees the app JWT.
import { Octokit } from '@octokit/core';
import { paginateRest } from '@octokit/plugin-paginate-rest';
import { throttling } from '@octokit/plugin-throttling';
import type { Clock } from '../auth/clock.ts';
import type { InstallationTokenStore } from '../auth/installation-tokens.ts';
import { API_VERSION, USER_AGENT, type FetchLike } from '../auth/http.ts';
import type { KeyValueCache } from '../cache/types.ts';
import { redact, redactDeep } from '../security/redact.ts';
import { Limiter } from './limiter.ts';
import type { RateLimitInfo, RateLimitTracker } from './ratelimit.ts';

const ReadOctokit = Octokit.plugin(paginateRest, throttling);
type ReadOctokitInstance = InstanceType<typeof ReadOctokit>;

// Settings paths come from the registry at runtime, so Octokit's per-route typings don't apply.
interface LooseOctokit {
  request: ((route: string, params?: object) => Promise<{ status: number; data: unknown }>) & {
    endpoint: (route: string | object, params?: object) => { method: string; url: string; body?: unknown };
  };
  paginate: (route: string, params?: object, mapFn?: (response: { data: unknown }, done: () => void) => unknown) => Promise<unknown[]>;
}

/** Path prefixes the general client may GET. Everything else is refused. */
export const ALLOWED_GET_PREFIXES = ['/enterprises/', '/orgs/', '/repos/', '/installation/repositories', '/scim/v2/enterprises/', '/rate_limit'] as const;

export class ReadOnlyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadOnlyViolation';
  }
}

export class GitHubRequestError extends Error {
  status: number;
  endpoint: string;
  constructor(status: number, endpoint: string, message: string) {
    super(redact(message));
    this.name = 'GitHubRequestError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

/** Strips comments and string literals, then rejects any mutation or subscription. */
export function assertGraphqlQuery(document: unknown): void {
  if (typeof document !== 'string' || document.trim() === '') throw new ReadOnlyViolation('GraphQL request without a query');
  const stripped = document
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/#[^\n\r]*/g, '');
  if (/\b(mutation|subscription)\b/i.test(stripped)) throw new ReadOnlyViolation('GraphQL mutations and subscriptions are not allowed');
}

/**
 * The single gate every request passes through. `url` is the final absolute URL.
 */
export function assertReadOnlyRequest(req: { method: string; url: string; body?: unknown }, bases: { apiBaseUrl: string; graphqlUrl: string }): void {
  const method = req.method.toUpperCase();
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    throw new ReadOnlyViolation(`Not an absolute URL: ${req.url}`);
  }
  if (/\/(?:\.|%2e){1,2}(?:[/?#]|$)/i.test(req.url) || /%2f|%5c/i.test(req.url.split('?')[0]!)) throw new ReadOnlyViolation('Dot segments and encoded slashes are not allowed');
  if (method === 'POST') {
    if (`${url.origin}${url.pathname}` !== bases.graphqlUrl) throw new ReadOnlyViolation(`POST is only allowed to ${bases.graphqlUrl}`);
    const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
    assertGraphqlQuery((body as { query?: unknown } | undefined)?.query);
    return;
  }
  if (method !== 'GET') throw new ReadOnlyViolation(`${method} is not allowed: this client is read-only`);
  const base = new URL(bases.apiBaseUrl);
  const basePath = base.pathname.replace(/\/+$/, '');
  if (url.origin !== base.origin || !url.pathname.startsWith(`${basePath}/`)) throw new ReadOnlyViolation(`Request outside the GitHub API base URL: ${url.origin}${url.pathname}`);
  const path = url.pathname.slice(basePath.length);
  if (path.split('/').some((seg) => seg === '..' || seg === '.')) throw new ReadOnlyViolation('Path traversal is not allowed');
  if (path === '/app' || path.startsWith('/app/') || path.startsWith('/app-manifests')) throw new ReadOnlyViolation('App (JWT) endpoints are not reachable through the general client');
  if (!ALLOWED_GET_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}`))) throw new ReadOnlyViolation(`GET ${path} is not an allowed settings path`);
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

export interface FetchResult {
  /** Absolute URL without credentials, for "Copy as curl" and diagnostics. */
  url: string;
  status: number;
  data: unknown;
  fetchedAt: number;
  fromCache: boolean;
}

export interface ReaderOptions {
  installationId: number;
  tokens: InstallationTokenStore;
  apiBaseUrl: string;
  graphqlUrl: string;
  cache: KeyValueCache;
  rateLimits: RateLimitTracker;
  clock: Clock;
  limiter: Limiter;
  fetch?: FetchLike;
  /** How long a fetched page is served without asking GitHub again (default 5 min). */
  ttlMs?: number;
}

export interface GetOptions {
  paginate?: boolean;
  refresh?: boolean;
  /** Probe mode: per_page=1, no pagination, no result cache. */
  probe?: boolean;
  query?: Record<string, string | number | boolean>;
  /** Stop paginating after this many pages. */
  maxPages?: number;
}

/** Read-only GitHub client for one installation. */
export class GitHubReader {
  readonly installationId: number;
  #o: ReadOptsResolved;
  #octokit: ReadOctokitInstance;
  #loose: LooseOctokit;

  constructor(opts: ReaderOptions) {
    this.installationId = opts.installationId;
    this.#o = { ...opts, ttlMs: opts.ttlMs ?? 5 * 60_000 };
    this.#octokit = new ReadOctokit({
      baseUrl: opts.apiBaseUrl,
      userAgent: USER_AGENT,
      request: opts.fetch ? { fetch: opts.fetch } : {},
      throttle: {
        // Primary limit: don't wait; surface it (the banner shows the reset time).
        onRateLimit: () => false,
        // Secondary limit: one short retry.
        onSecondaryRateLimit: (retryAfter: number, _o: unknown, _k: unknown, retryCount: number) => retryCount < 1 && retryAfter <= 10,
      },
    });
    this.#loose = this.#octokit as unknown as LooseOctokit;
    this.#octokit.hook.wrap('request', (request, options) => this.#wrap(request as RequestFn, options as unknown as RequestOptions));
  }

  get apiBaseUrl(): string {
    return this.#o.apiBaseUrl;
  }

  get graphqlUrl(): string {
    return this.#o.graphqlUrl;
  }

  get rateLimit(): RateLimitInfo | undefined {
    return this.#o.rateLimits.get(this.installationId);
  }

  async #wrap(request: RequestFn, options: RequestOptions): Promise<OctoResponse> {
    const ep = this.#loose.request.endpoint(options);
    assertReadOnlyRequest(ep, this.#o);
    const isGet = ep.method.toUpperCase() === 'GET';
    const etagKey = `etag:${this.installationId}:${ep.url}`;
    const cached = isGet ? this.#o.cache.get(etagKey) : undefined;

    const attempt = async (token: string): Promise<OctoResponse> => {
      // before-after-hook binds the original options object into inner hooks (throttling), so headers
      // must be set on that object in place; passing a copy would be ignored.
      const headers: Record<string, string> = { ...(options.headers ?? {}), authorization: `token ${token}`, 'x-github-api-version': API_VERSION };
      if (cached?.etag) headers['if-none-match'] = cached.etag;
      options.headers = headers;
      try {
        const res = await request(options);
        this.#o.rateLimits.update(this.installationId, res.headers as Record<string, string>, this.#o.clock.now());
        const etag = (res.headers as Record<string, string | undefined>).etag;
        if (isGet && etag) {
          this.#o.cache.set(etagKey, { etag, link: (res.headers as Record<string, string | undefined>).link, data: redactDeep(res.data), status: res.status, url: ep.url, fetchedAt: this.#o.clock.now() });
        }
        return res;
      } catch (e) {
        const err = e as { status?: number; response?: { headers?: Record<string, string> } };
        if (err.response?.headers) this.#o.rateLimits.update(this.installationId, err.response.headers, this.#o.clock.now());
        if (err.status === 304 && cached) {
          this.#o.cache.set(etagKey, { ...cached, fetchedAt: this.#o.clock.now() });
          return { status: 304, url: ep.url, headers: { etag: cached.etag, link: cached.link }, data: cached.data };
        }
        throw e;
      }
    };

    const token = await this.#o.tokens.get(this.installationId);
    try {
      return await attempt(token);
    } catch (e) {
      if ((e as { status?: number }).status !== 401) throw e;
      // Exactly one re-mint and one retry. A second 401 is surfaced.
      const fresh = await this.#o.tokens.refreshAfter401(this.installationId, token);
      return await attempt(fresh);
    }
  }

  /** GET a REST path template, e.g. get('/orgs/{org}/hooks', { org: 'acme' }). */
  async get(path: string, params: Record<string, string | number> = {}, opts: GetOptions = {}): Promise<FetchResult> {
    if (!path.startsWith('/')) throw new ReadOnlyViolation('Paths must start with /');
    const query = { ...(opts.query ?? {}), ...(opts.probe ? { per_page: 1 } : opts.paginate ? { per_page: 100 } : {}) };
    const route = `GET ${path}`;
    const url = this.#loose.request.endpoint(route, { ...params, ...query }).url;
    const resultKey = `res:${this.installationId}:${opts.paginate && !opts.probe ? `all${opts.maxPages ?? ''}:` : ''}${url}`;
    const now = this.#o.clock.now();

    if (!opts.probe) {
      if (opts.refresh) this.#o.cache.delete(resultKey);
      else {
        const hit = this.#o.cache.get(resultKey);
        if (hit && now - hit.fetchedAt < this.#o.ttlMs) return { url, status: hit.status, data: hit.data, fetchedAt: hit.fetchedAt, fromCache: true };
      }
    }

    const endpoint = `GET ${new URL(url).pathname}`;
    try {
      const result = await this.#o.limiter.run(async () => {
        if (opts.paginate && !opts.probe) {
          let pages = 0;
          const data = await this.#loose.paginate(route, { ...params, ...query }, (response, done) => {
            if (opts.maxPages && ++pages >= opts.maxPages) done();
            return response.data;
          });
          return { status: 200, data };
        }
        const res = await this.#loose.request(route, { ...params, ...query });
        return { status: res.status, data: res.data };
      });
      const data = redactDeep(result.data);
      const fetchedAt = this.#o.clock.now();
      if (!opts.probe) this.#o.cache.set(resultKey, { data, status: result.status, url, fetchedAt });
      return { url, status: result.status, data, fetchedAt, fromCache: false };
    } catch (e) {
      throw toRequestError(e, endpoint);
    }
  }

  /** A GraphQL query (mutations are refused before anything is sent). */
  async graphql(query: string, variables: Record<string, unknown> = {}, opts: { refresh?: boolean; probe?: boolean } = {}): Promise<FetchResult> {
    assertGraphqlQuery(query);
    const resultKey = `res:${this.installationId}:graphql:${hash(query + JSON.stringify(variables))}`;
    const now = this.#o.clock.now();
    if (!opts.probe && !opts.refresh) {
      const hit = this.#o.cache.get(resultKey);
      if (hit && now - hit.fetchedAt < this.#o.ttlMs) return { url: this.#o.graphqlUrl, status: hit.status, data: hit.data, fetchedAt: hit.fetchedAt, fromCache: true };
    }
    const baseUrl = this.#o.graphqlUrl.replace(/\/graphql$/, '');
    try {
      const res = await this.#o.limiter.run(() => this.#loose.request('POST /graphql', { baseUrl, query, variables }));
      const body = res.data as { data?: unknown; errors?: { message: string; type?: string }[] };
      if (body.errors?.length) {
        const forbidden = body.errors.some((er) => /FORBIDDEN|NOT_FOUND|INSUFFICIENT_SCOPES/i.test(er.type ?? '') || /not accessible|permission|resource not accessible/i.test(er.message));
        throw new GitHubRequestError(forbidden ? 403 : 422, 'POST /graphql', body.errors.map((er) => er.message).join('; '));
      }
      const data = redactDeep(body.data ?? null);
      const fetchedAt = this.#o.clock.now();
      if (!opts.probe) this.#o.cache.set(resultKey, { data, status: 200, url: this.#o.graphqlUrl, fetchedAt });
      return { url: this.#o.graphqlUrl, status: 200, data, fetchedAt, fromCache: false };
    } catch (e) {
      throw toRequestError(e, 'POST /graphql');
    }
  }
}

function toRequestError(e: unknown, endpoint: string): Error {
  if (e instanceof GitHubRequestError || e instanceof ReadOnlyViolation) return e;
  const err = e as { status?: number; message?: string; response?: { data?: { message?: string } } };
  const status = typeof err.status === 'number' ? err.status : 0;
  const message = err.response?.data?.message ?? err.message ?? 'Request failed';
  return new GitHubRequestError(status, endpoint, message);
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}

type ReadOptsResolved = ReaderOptions & { ttlMs: number };
interface RequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  [k: string]: unknown;
}
interface OctoResponse {
  status: number;
  url: string;
  headers: Record<string, string | undefined>;
  data: unknown;
}
type RequestFn = (options: RequestOptions) => Promise<OctoResponse>;

// A fake GitHub API (as a fetch function) and a controllable clock for tests.
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import type { Clock } from '../../src/core/auth/clock.ts';

export class FakeClock implements Clock {
  t: number;
  constructor(start = Date.UTC(2026, 10, 12, 12, 0, 0)) {
    this.t = start;
  }
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

let cachedKeys: { privateKey: KeyObject; publicKey: KeyObject; pem: string } | null = null;
export function testKeys() {
  if (!cachedKeys) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    cachedKeys = { privateKey, publicKey, pem: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString() };
  }
  return cachedKeys;
}

export interface Route {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type RouteHandler = (req: RecordedRequest) => Route;

export interface RecordedRequest {
  method: string;
  url: string;
  path: string;
  authorization: string | null;
  ifNoneMatch: string | null;
  body?: string;
}

export interface FakeInstallation {
  id: number;
  login: string;
  targetType: 'Organization' | 'Enterprise' | 'User';
  permissions: Record<string, string>;
  slug?: string;
}

export const API = 'https://api.github.test';

export class FakeGitHub {
  clock: FakeClock;
  requests: RecordedRequest[] = [];
  mints: { installationId: number; token: string }[] = [];
  tokenLifetimeMs = 60 * 60_000;
  installations: FakeInstallation[] = [];
  appPermissions: Record<string, string> = { metadata: 'read', members: 'read' };
  routes = new Map<string, Route | RouteHandler>();
  /** Delay (ms of real time) before the mint responds, to widen race windows. */
  mintDelayMs = 5;
  #seq = 0;

  constructor(clock = new FakeClock()) {
    this.clock = clock;
  }

  /** Register a response for "GET /orgs/acme/hooks" (path only; the query string is ignored). */
  on(methodPath: string, route: Route | RouteHandler) {
    this.routes.set(methodPath, route);
    return this;
  }

  get settingsRequests() {
    return this.requests.filter((r) => !r.path.startsWith('/app'));
  }

  fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input);
    const headers = new Headers(init.headers as HeadersInit);
    const method = (init.method ?? 'GET').toUpperCase();
    const req: RecordedRequest = {
      method,
      url: url.toString(),
      path: url.pathname,
      authorization: headers.get('authorization'),
      ifNoneMatch: headers.get('if-none-match'),
      body: typeof init.body === 'string' ? init.body : undefined,
    };
    this.requests.push(req);

    const mint = url.pathname.match(/^\/app\/installations\/(\d+)\/access_tokens$/);
    if (mint && method === 'POST') {
      if (!req.authorization?.startsWith('Bearer ey')) return json(401, { message: 'Bad JWT' });
      await new Promise((r) => setTimeout(r, this.mintDelayMs));
      const installationId = Number(mint[1]);
      const token = `ghs_${'A'.repeat(20)}${String(++this.#seq).padStart(16, '0')}`;
      this.mints.push({ installationId, token });
      const inst = this.installations.find((i) => i.id === installationId);
      return json(201, { token, expires_at: new Date(this.clock.now() + this.tokenLifetimeMs).toISOString(), permissions: inst?.permissions ?? {}, repository_selection: 'all' });
    }
    if (url.pathname === '/app' && method === 'GET') {
      return json(200, { id: 1, slug: 'settings-viewer', name: 'Settings Viewer', client_id: 'Iv1.test', owner: { login: 'acme', type: 'Organization' }, permissions: this.appPermissions, events: [] });
    }
    if (url.pathname === '/app/installations' && method === 'GET') {
      return json(
        200,
        this.installations.map((i) => ({
          id: i.id,
          account: i.targetType === 'Enterprise' ? { slug: i.slug ?? i.login, name: i.login } : { login: i.login, type: i.targetType },
          target_type: i.targetType,
          permissions: i.permissions,
          repository_selection: 'all',
          suspended_at: null,
        })),
      );
    }

    const key = `${method} ${url.pathname}`;
    const route = this.routes.get(key);
    if (!route) return json(404, { message: 'Not Found' });
    const r = typeof route === 'function' ? route(req) : route;
    const resHeaders: Record<string, string> = { 'content-type': 'application/json', 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': String(Math.floor(this.clock.now() / 1000) + 3600), ...(r.headers ?? {}) };
    if (r.status === 304 || r.status === 204) return new Response(null, { status: r.status, headers: resHeaders });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: resHeaders });
  };
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

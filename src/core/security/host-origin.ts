// DNS-rebinding and cross-site protection for the local server.

const LOOPBACK_NAMES = ['127.0.0.1', 'localhost', '[::1]'];

export function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

/** Host header values this server answers to, e.g. ["127.0.0.1:4783", "localhost:4783", "[::1]:4783"]. */
export function allowedHosts(bindHost: string, port: number): string[] {
  const names = isLoopbackHost(bindHost) ? LOOPBACK_NAMES : [bindHost.includes(':') && !bindHost.startsWith('[') ? `[${bindHost}]` : bindHost];
  return names.map((n) => `${n}:${port}`);
}

export interface RequestHeaders {
  host?: string | null;
  origin?: string | null;
  secFetchSite?: string | null;
  method: string;
}

export type GuardResult = { ok: true } | { ok: false; status: 403 | 421; reason: string };

/**
 * - Host must be one of ours (blocks DNS rebinding: evil.example resolving to 127.0.0.1).
 * - Origin, when sent, must be ours (blocks cross-site fetches and form posts).
 * - Unsafe methods must carry our Origin.
 * - Sec-Fetch-Site: cross-site is refused.
 */
export function checkRequest(h: RequestHeaders, hosts: readonly string[]): GuardResult {
  const host = (h.host ?? '').toLowerCase();
  if (!hosts.includes(host)) return { ok: false, status: 421, reason: 'Unexpected Host header' };
  const origins = hosts.map((x) => `http://${x}`);
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(h.method.toUpperCase());
  if (h.origin && h.origin !== 'null' && !origins.includes(h.origin.toLowerCase())) return { ok: false, status: 403, reason: 'Cross-origin request' };
  if (h.origin === 'null') return { ok: false, status: 403, reason: 'Opaque origin' };
  if (unsafe && !h.origin) return { ok: false, status: 403, reason: 'Missing Origin on a state-changing request' };
  if (h.secFetchSite === 'cross-site') return { ok: false, status: 403, reason: 'Cross-site request' };
  return { ok: true };
}

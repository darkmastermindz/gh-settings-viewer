export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  used?: number;
  /** Reset time, ms since epoch. */
  resetAt?: number;
  resource?: string;
  updatedAt: number;
}

type HeaderBag = Record<string, string | number | undefined> | Headers;

const read = (h: HeaderBag, name: string): string | undefined => {
  if (h instanceof Headers) return h.get(name) ?? undefined;
  const v = h[name];
  return v === undefined ? undefined : String(v);
};

/** Tracks x-ratelimit-* per installation token (keyed by installation ID). */
export class RateLimitTracker {
  #byInstallation = new Map<number, RateLimitInfo>();

  update(installationId: number, headers: HeaderBag, now = Date.now()): void {
    const remaining = read(headers, 'x-ratelimit-remaining');
    if (remaining === undefined) return;
    const reset = read(headers, 'x-ratelimit-reset');
    this.#byInstallation.set(installationId, {
      limit: num(read(headers, 'x-ratelimit-limit')),
      remaining: num(remaining),
      used: num(read(headers, 'x-ratelimit-used')),
      resetAt: reset ? Number(reset) * 1000 : undefined,
      resource: read(headers, 'x-ratelimit-resource'),
      updatedAt: now,
    });
  }

  get(installationId: number): RateLimitInfo | undefined {
    return this.#byInstallation.get(installationId);
  }
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// Wires config, auth, cache and discovery together. Used by the web server and by `doctor`.
import { createAppApi, type AppApi } from './auth/app-api.ts';
import { systemClock, type Clock } from './auth/clock.ts';
import type { FetchLike } from './auth/http.ts';
import { InstallationTokenStore, type TokenStatus } from './auth/installation-tokens.ts';
import { AppJwt } from './auth/jwt.ts';
import { createMinter } from './auth/mint.ts';
import { MemoryCache } from './cache/memory.ts';
import { SqliteCache, TieredCache } from './cache/sqlite.ts';
import type { KeyValueCache } from './cache/types.ts';
import { loadPrivateKey } from './config/load-key.ts';
import { appPaths } from './config/paths.ts';
import { jwtIssuer, type ResolvedConfig } from './config/resolve.ts';
import { discover, type Capabilities, type DiscoveredInstallation } from './discovery/discover.ts';
import { GitHubReader } from './github/client.ts';
import { Limiter } from './github/limiter.ts';
import { RateLimitTracker, type RateLimitInfo } from './github/ratelimit.ts';
import { registry } from './registry/index.ts';
import type { Feature, Scope } from './registry/types.ts';
import { log } from './security/redact.ts';

/** Discovery results are reused for this long, or until "Refresh capabilities". */
export const CAPABILITIES_TTL_MS = 10 * 60_000;

export interface RuntimeOptions {
  fetch?: FetchLike;
  clock?: Clock;
  /** Defaults to memory in front of the SQLite file in the user cache dir. */
  cache?: KeyValueCache;
  features?: readonly Feature[];
}

export interface InstallationDiagnostics {
  id: number;
  account: string;
  scope: DiscoveredInstallation['scope'];
  repositorySelection?: string;
  suspended: boolean;
  permissions: Record<string, string>;
  writePermissions: string[];
  token: TokenStatus;
  rateLimit?: RateLimitInfo;
  pages: number;
}

export class Runtime {
  readonly config: ResolvedConfig;
  readonly clock: Clock;
  readonly tokens: InstallationTokenStore;
  readonly rateLimits = new RateLimitTracker();
  readonly appApi: AppApi;
  readonly keyDescription: string;
  readonly warnings: string[];
  readonly features: readonly Feature[];
  #cache: KeyValueCache;
  #fetch?: FetchLike;
  #limiter = new Limiter(8);
  #readers = new Map<number, GitHubReader>();
  #caps: Capabilities | null = null;
  #capsInflight: Promise<Capabilities> | null = null;

  private constructor(config: ResolvedConfig, jwt: AppJwt, keyDescription: string, warnings: string[], opts: RuntimeOptions) {
    this.config = config;
    this.clock = opts.clock ?? systemClock;
    this.#fetch = opts.fetch;
    this.keyDescription = keyDescription;
    this.warnings = warnings;
    this.features = opts.features ?? registry;
    this.appApi = createAppApi({ apiBaseUrl: config.apiBaseUrl, jwt, fetch: opts.fetch });
    this.tokens = new InstallationTokenStore(createMinter({ apiBaseUrl: config.apiBaseUrl, jwt, fetch: opts.fetch }), this.clock);
    this.#cache = opts.cache ?? defaultCache();
  }

  static async create(config: ResolvedConfig, opts: RuntimeOptions = {}): Promise<Runtime> {
    const key = await loadPrivateKey(config); // parsed once; the PEM text isn't kept
    const clock = opts.clock ?? systemClock;
    const jwt = new AppJwt(key.key, jwtIssuer(config), clock);
    for (const w of key.warnings) log.warn(w);
    return new Runtime(config, jwt, key.description, key.warnings, opts);
  }

  readerFor(installationId: number): GitHubReader {
    let r = this.#readers.get(installationId);
    if (!r) {
      r = new GitHubReader({
        installationId,
        tokens: this.tokens,
        apiBaseUrl: this.config.apiBaseUrl,
        graphqlUrl: this.config.graphqlUrl,
        cache: this.#cache,
        rateLimits: this.rateLimits,
        clock: this.clock,
        limiter: this.#limiter,
        fetch: this.#fetch,
      });
      this.#readers.set(installationId, r);
    }
    return r;
  }

  /** Cached for a short TTL; `refresh` re-runs discovery. Concurrent callers share one run. */
  async capabilities(refresh = false): Promise<Capabilities> {
    const fresh = this.#caps && this.clock.now() - this.#caps.discoveredAt < CAPABILITIES_TTL_MS;
    if (fresh && !refresh) return this.#caps!;
    if (this.#capsInflight) return this.#capsInflight;
    this.#capsInflight = discover({ appApi: this.appApi, readerFor: (id) => this.readerFor(id), registry: this.features, now: () => this.clock.now() })
      .then((c) => {
        this.#caps = c;
        const writes = [...c.appWritePermissions, ...c.installations.flatMap((i) => i.writePermissions)];
        if (writes.length) log.warn(`THIS APP HOLDS WRITE PERMISSIONS (${[...new Set(writes)].join(', ')}). gh-settings-viewer only reads, but the key could write. Set every permission to read-only in the app's settings.`);
        return c;
      })
      .finally(() => {
        this.#capsInflight = null;
      });
    return this.#capsInflight;
  }

  /** Last discovery, without triggering one. */
  get lastCapabilities(): Capabilities | null {
    return this.#caps;
  }

  diagnostics(caps: Capabilities): InstallationDiagnostics[] {
    return caps.installations.map((i) => ({
      id: i.id,
      account: i.key,
      scope: i.scope,
      repositorySelection: i.repositorySelection,
      suspended: i.suspended,
      permissions: i.permissions,
      writePermissions: i.writePermissions,
      token: this.tokens.status(i.id),
      rateLimit: this.rateLimits.get(i.id),
      pages: i.features.length,
    }));
  }

  findInstallation(caps: Capabilities, scope: Scope, key: string): DiscoveredInstallation | undefined {
    const k = key.toLowerCase();
    if (scope === 'enterprise') return caps.installations.find((i) => i.scope === 'enterprise' && i.key.toLowerCase() === k);
    if (scope === 'org') return caps.installations.find((i) => i.scope === 'org' && i.key.toLowerCase() === k);
    return caps.installations.find((i) => (i.scope === 'org' || i.scope === 'user') && i.key.toLowerCase() === k);
  }

  clearCache(): void {
    this.#cache.clearPrefix('res:');
  }

  close(): void {
    this.#cache.close();
  }
}

function defaultCache(): KeyValueCache {
  try {
    return new TieredCache(new MemoryCache(), new SqliteCache(appPaths().cacheDb));
  } catch (e) {
    log.warn(`SQLite cache unavailable (${(e as Error).message}); using memory only`);
    return new MemoryCache();
  }
}

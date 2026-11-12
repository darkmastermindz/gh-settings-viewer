import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InstallationTokenStore } from '../../src/core/auth/installation-tokens.ts';
import { AppJwt } from '../../src/core/auth/jwt.ts';
import { createMinter } from '../../src/core/auth/mint.ts';
import { MemoryCache } from '../../src/core/cache/memory.ts';
import type { KeyValueCache } from '../../src/core/cache/types.ts';
import { GitHubReader } from '../../src/core/github/client.ts';
import { Limiter } from '../../src/core/github/limiter.ts';
import { RateLimitTracker } from '../../src/core/github/ratelimit.ts';
import { API, FakeGitHub, testKeys } from './fake-github.ts';

export function makeStack(opts: { cache?: KeyValueCache; gh?: FakeGitHub } = {}) {
  const gh = opts.gh ?? new FakeGitHub();
  const jwt = new AppJwt(testKeys().privateKey, 'Iv1.test', gh.clock);
  const tokens = new InstallationTokenStore(createMinter({ apiBaseUrl: API, jwt, fetch: gh.fetch }), gh.clock);
  const cache = opts.cache ?? new MemoryCache();
  const rateLimits = new RateLimitTracker();
  const limiter = new Limiter(8);
  const readers = new Map<number, GitHubReader>();
  const readerFor = (installationId: number) => {
    let r = readers.get(installationId);
    if (!r) readers.set(installationId, (r = new GitHubReader({ installationId, tokens, apiBaseUrl: API, graphqlUrl: `${API}/graphql`, cache, rateLimits, clock: gh.clock, limiter, fetch: gh.fetch })));
    return r;
  };
  return { gh, jwt, tokens, cache, rateLimits, readerFor };
}

export function tempDir(prefix = 'ghsv-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Captures console.error/console.log output while fn runs. */
export async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; output: string }> {
  const lines: string[] = [];
  const origErr = console.error;
  const origLog = console.log;
  const origWarn = console.warn;
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
  console.log = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
  console.warn = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
  try {
    const result = await fn();
    return { result, output: lines.join('\n') };
  } finally {
    console.error = origErr;
    console.log = origLog;
    console.warn = origWarn;
  }
}

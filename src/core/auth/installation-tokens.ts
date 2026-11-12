import type { Clock } from './clock.ts';
import type { Minter, MintedToken } from './mint.ts';

/** A token counts as expired at expires_at - 60s; the skew only avoids expiring mid-request. */
export const TOKEN_EXPIRY_SKEW_MS = 60_000;

export interface TokenStatus {
  installationId: number;
  state: 'none' | 'valid' | 'expired';
  expiresAt?: string;
  msRemaining?: number;
  mints: number;
}

interface Entry {
  token?: MintedToken;
  inflight?: Promise<MintedToken>;
  mints: number;
}

/**
 * Installation tokens, in memory only. Minted lazily on first use, reused until expiry,
 * refreshed only at expiry (no timers, no background refresh), single-flight per installation.
 */
export class InstallationTokenStore {
  #mint: Minter;
  #clock: Clock;
  #entries = new Map<number, Entry>();

  constructor(mint: Minter, clock: Clock) {
    this.#mint = mint;
    this.#clock = clock;
  }

  #entry(id: number): Entry {
    let e = this.#entries.get(id);
    if (!e) this.#entries.set(id, (e = { mints: 0 }));
    return e;
  }

  #fresh(t: MintedToken | undefined): t is MintedToken {
    return Boolean(t) && this.#clock.now() < t!.expiresAt - TOKEN_EXPIRY_SKEW_MS;
  }

  #startMint(id: number, e: Entry): Promise<MintedToken> {
    if (e.inflight) return e.inflight;
    e.mints++;
    const p = this.#mint(id)
      .then((t) => {
        e.token = t;
        return t;
      })
      .finally(() => {
        if (e.inflight === p) e.inflight = undefined;
      });
    e.inflight = p;
    return p;
  }

  /** Returns the cached token, or awaits one shared mint. */
  async get(installationId: number): Promise<string> {
    const e = this.#entry(installationId);
    if (this.#fresh(e.token)) return e.token.token;
    return (await this.#startMint(installationId, e)).token;
  }

  /**
   * After a 401: drop the token that failed and mint once. If another request already replaced it,
   * reuse the replacement instead of minting again.
   */
  async refreshAfter401(installationId: number, failedToken: string): Promise<string> {
    const e = this.#entry(installationId);
    if (e.inflight) return (await e.inflight).token;
    if (e.token && e.token.token !== failedToken && this.#fresh(e.token)) return e.token.token;
    e.token = undefined;
    return (await this.#startMint(installationId, e)).token;
  }

  status(installationId: number): TokenStatus {
    const e = this.#entries.get(installationId);
    if (!e?.token) return { installationId, state: 'none', mints: e?.mints ?? 0 };
    const msRemaining = e.token.expiresAt - this.#clock.now();
    return {
      installationId,
      state: this.#fresh(e.token) ? 'valid' : 'expired',
      expiresAt: new Date(e.token.expiresAt).toISOString(),
      msRemaining: Math.max(0, msRemaining),
      mints: e.mints,
    };
  }

  mintCount(installationId: number): number {
    return this.#entries.get(installationId)?.mints ?? 0;
  }
}

import { sign, type KeyObject } from 'node:crypto';
import type { Clock } from './clock.ts';

/** iat is backdated 60s for clock drift; exp is 9 minutes ahead (GitHub's maximum is 10). */
export const JWT_BACKDATE_S = 60;
export const JWT_LIFETIME_S = 9 * 60;
/** Re-sign this long before exp. */
export const JWT_RENEW_BEFORE_S = 30;

const b64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

export function signAppJwt(key: KeyObject, issuer: string, nowMs: number): { jwt: string; exp: number } {
  const now = Math.floor(nowMs / 1000);
  const exp = now + JWT_LIFETIME_S;
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - JWT_BACKDATE_S, exp, iss: issuer }));
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), key).toString('base64url');
  return { jwt: `${header}.${payload}.${signature}`, exp };
}

/** Holds one app JWT in memory and reuses it until about 30s before it expires. */
export class AppJwt {
  #key: KeyObject;
  #issuer: string;
  #clock: Clock;
  #current: { jwt: string; exp: number } | null = null;
  signCount = 0;

  constructor(key: KeyObject, issuer: string, clock: Clock) {
    this.#key = key;
    this.#issuer = issuer;
    this.#clock = clock;
  }

  get(): string {
    const nowS = Math.floor(this.#clock.now() / 1000);
    if (!this.#current || nowS >= this.#current.exp - JWT_RENEW_BEFORE_S) {
      this.#current = signAppJwt(this.#key, this.#issuer, this.#clock.now());
      this.signCount++;
    }
    return this.#current.jwt;
  }
}

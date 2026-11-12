import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Per-launch random session token, passed once in the opened URL and then kept in an httpOnly cookie. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokensMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const sessionCookieName = (port: number | string) => `ghsv_session_${port}`;

// Non-blocking update notice: one registry lookup a day, 1.5s timeout, no telemetry.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { APP_NAME, appPaths } from '../core/config/paths.ts';

const DAY = 24 * 60 * 60_000;
/** Only a plain semver string is trusted from the registry or the cache (no terminal escapes, no paths). */
const SEMVER = /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[0-9A-Za-z.-]{1,40})?$/;

export function isTrustedVersion(v: unknown): v is string {
  return typeof v === 'string' && SEMVER.test(v);
}

export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('-')[0]!.split('.').map((n) => Number(n) || 0);
  const [a, b] = [parse(latest), parse(current)];
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** Resolves to a message (or null). Never throws, never delays startup: callers don't await it before starting. */
export async function checkForUpdate(current: string, now = Date.now()): Promise<string | null> {
  if (process.env.CI || process.env.NO_UPDATE_NOTIFIER || process.env.GH_SETTINGS_VIEWER_NO_UPDATE_CHECK) return null;
  const file = appPaths().updateCheckFile;
  let latest: string | undefined;
  try {
    const cached = JSON.parse(readFileSync(file, 'utf8')) as { checkedAt: number; latest: string };
    if (now - cached.checkedAt < DAY && isTrustedVersion(cached.latest)) latest = cached.latest;
  } catch {
    /* no cache yet */
  }
  if (!latest) {
    try {
      const res = await fetch(`https://registry.npmjs.org/${APP_NAME}/latest`, { signal: AbortSignal.timeout(1500), headers: { accept: 'application/json' } });
      if (!res.ok) return null;
      const version = ((await res.json()) as { version?: unknown }).version;
      if (!isTrustedVersion(version)) return null;
      latest = version;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ checkedAt: now, latest }));
    } catch {
      return null;
    }
  }
  return isNewer(latest, current) ? `Update available: ${current} → ${latest}. Run npx ${APP_NAME}@latest` : null;
}

// Non-blocking update notice: one registry lookup a day, 1.5s timeout, no telemetry.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { appPaths } from '../core/config/paths.ts';

const DAY = 24 * 60 * 60_000;

export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('-')[0]!.split('.').map((n) => Number(n) || 0);
  const [a, b] = [parse(latest), parse(current)];
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** Resolves to a message (or null). Never throws, never delays startup: callers don't await it before starting. */
export async function checkForUpdate(name: string, current: string, now = Date.now()): Promise<string | null> {
  if (process.env.CI || process.env.NO_UPDATE_NOTIFIER || process.env.GH_SETTINGS_VIEWER_NO_UPDATE_CHECK) return null;
  const file = appPaths().updateCheckFile;
  let latest: string | undefined;
  try {
    const cached = JSON.parse(readFileSync(file, 'utf8')) as { checkedAt: number; latest: string };
    if (now - cached.checkedAt < DAY) latest = cached.latest;
  } catch {
    /* no cache yet */
  }
  if (!latest) {
    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, { signal: AbortSignal.timeout(1500), headers: { accept: 'application/json' } });
      if (!res.ok) return null;
      latest = ((await res.json()) as { version?: string }).version;
      if (!latest) return null;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ checkedAt: now, latest }));
    } catch {
      return null;
    }
  }
  return isNewer(latest, current) ? `Update available: ${current} → ${latest}. Run npx ${name}@latest` : null;
}

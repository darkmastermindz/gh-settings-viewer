// Shared by `doctor`, `init` and the "App & permissions" page.
import type { Capabilities } from './discovery/discover.ts';
import type { Runtime } from './runtime.ts';

export interface MissingOrgs {
  /** Orgs in the enterprise without an installation of this app. Undefined when the app can't list them. */
  missing?: string[];
  enterprise?: string;
}

/**
 * Lists enterprise orgs without an installation, when the enterprise installation can read
 * "Enterprise organization installations" (GET /enterprises/{e}/apps/installable_organizations).
 */
export async function missingOrgInstallations(rt: Runtime, caps: Capabilities): Promise<MissingOrgs> {
  const ent = caps.installations.find((i) => i.scope === 'enterprise' && !i.suspended && i.features.includes('enterprise-organizations'));
  if (!ent) return {};
  try {
    const res = await rt.readerFor(ent.id).get('/enterprises/{enterprise}/apps/installable_organizations', { enterprise: ent.key }, { paginate: true });
    const all = (res.data as { login: string }[]).map((o) => o.login);
    const installed = new Set(caps.installations.filter((i) => i.scope === 'org').map((i) => i.key.toLowerCase()));
    return { enterprise: ent.key, missing: all.filter((o) => !installed.has(o.toLowerCase())).sort() };
  } catch {
    return { enterprise: ent.key };
  }
}

export function installUrl(webBaseUrl: string, appSlug: string): string {
  return `${webBaseUrl}/apps/${encodeURIComponent(appSlug)}/installations/new`;
}

export function formatRemaining(ms?: number): string {
  if (ms === undefined) return '';
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

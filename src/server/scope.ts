import 'server-only';
import { notFound } from 'next/navigation';
import { scopeHref } from '../core/data/hrefs.ts';
import type { DiscoveredInstallation } from '../core/discovery/discover.ts';
import { getFeature, type Feature, type Scope } from '../core/registry/index.ts';
import { isAccountKey, isFeatureId, isRepoName } from '../core/security/validate.ts';
import type { Crumb } from '../components/Breadcrumbs.tsx';
import { enterpriseInstallation } from './nav.ts';
import type { PageContext } from './page-context.ts';
import { findRepo } from './resolve-target.ts';

type Ok = Extract<PageContext, { ok: true }>;

/** The installation behind a URL, or 404. */
export function installationOr404(ctx: Ok, scope: Scope, key: string): DiscoveredInstallation {
  if (!isAccountKey(key)) notFound();
  const inst = ctx.rt.findInstallation(ctx.caps, scope, key);
  if (!inst || inst.suspended) notFound();
  return inst;
}

/** A page that discovery registered for this installation, or 404 (never a placeholder). */
export function featureOr404(inst: DiscoveredInstallation, scope: Scope, id: string): Feature {
  if (!isFeatureId(id)) notFound();
  const f = getFeature(id);
  if (!f || f.scope !== scope || !inst.features.includes(id)) notFound();
  return f;
}

export async function repoOr404(ctx: Ok, inst: DiscoveredInstallation, name: string) {
  if (!isRepoName(name)) notFound();
  const repo = await findRepo(ctx.rt, inst, name).catch(() => undefined);
  if (!repo) notFound();
  return repo;
}

export function crumbs(ctx: Ok, parts: { org?: string; repo?: string; enterprise?: string }): Crumb[] {
  const out: Crumb[] = [];
  const ent = parts.enterprise ? { key: parts.enterprise } : enterpriseInstallation(ctx.caps);
  if (ent && ent.key) out.push({ kind: 'Enterprise', label: ent.key, href: scopeHref('enterprise', ent.key) });
  if (parts.org) out.push({ kind: 'Org', label: parts.org, href: scopeHref('org', parts.org) });
  if (parts.org && parts.repo) out.push({ kind: 'Repo', label: parts.repo, href: scopeHref('repo', parts.org, parts.repo) });
  return out;
}

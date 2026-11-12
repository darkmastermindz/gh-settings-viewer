import 'server-only';
import type { Capabilities, DiscoveredInstallation } from '../core/discovery/discover.ts';
import { pageHref } from '../core/data/hrefs.ts';
import { getFeature, type Feature, type Scope } from '../core/registry/index.ts';

export interface NavPage {
  id: string;
  label: string;
  href: string;
}

export interface NavSection {
  name: string;
  pages: NavPage[];
}

/** Sidebar sections for one target, in registry order, from discovered pages only. */
export function sidebarFor(inst: DiscoveredInstallation, scope: Scope, key: string, repo?: string): NavSection[] {
  const sections = new Map<string, NavPage[]>();
  for (const id of inst.features) {
    const f = getFeature(id);
    if (!f || f.scope !== scope) continue;
    (sections.get(f.section) ?? sections.set(f.section, []).get(f.section)!).push({ id: f.id, label: f.label, href: pageHref(scope, key, f.id, repo) });
  }
  return [...sections].map(([name, pages]) => ({ name, pages }));
}

export function firstPage(inst: DiscoveredInstallation, scope: Scope): Feature | undefined {
  for (const id of inst.features) {
    const f = getFeature(id);
    if (f?.scope === scope) return f;
  }
  return undefined;
}

export interface JumpEntry {
  label: string;
  group: string;
  href: string;
}

/** Everything the jump box can find: discovered scopes and their pages (repos are searched on demand). */
export function jumpEntries(caps: Capabilities): JumpEntry[] {
  const out: JumpEntry[] = [];
  for (const inst of caps.installations) {
    if (inst.suspended) continue;
    const scope: Scope | null = inst.scope === 'enterprise' ? 'enterprise' : inst.scope === 'org' ? 'org' : null;
    if (scope) {
      for (const id of inst.features) {
        const f = getFeature(id);
        if (f?.scope === scope) out.push({ label: `${f.label}`, group: `${scope === 'enterprise' ? 'Enterprise' : 'Org'} ${inst.key} · ${f.section}`, href: pageHref(scope, inst.key, f.id) });
      }
    }
    if (inst.features.some((id) => id.startsWith('repo-'))) out.push({ label: `Repositories in ${inst.key}`, group: inst.key, href: `/org/${encodeURIComponent(inst.key)}/repos` });
  }
  return out;
}

export function enterpriseInstallation(caps: Capabilities): DiscoveredInstallation | undefined {
  return caps.installations.find((i) => i.scope === 'enterprise' && !i.suspended);
}

import type { ReactNode } from 'react';
import { ScopeShell } from '../../../components/ScopeShell.tsx';
import { SetupNeeded } from '../../../components/SetupNeeded.tsx';
import { reposHref } from '../../../core/data/hrefs.ts';
import { sidebarFor } from '../../../server/nav.ts';
import { loadContext } from '../../../server/page-context.ts';
import { crumbs, installationOr404 } from '../../../server/scope.ts';

export default async function OrgLayout({ children, params }: { children: ReactNode; params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await loadContext();
  if (!ctx.ok) return <SetupNeeded error={ctx.error} />;
  const decoded = decodeURIComponent(key);
  // Personal accounts have repository pages only, so fall back to the repo-scope lookup.
  const inst = ctx.rt.findInstallation(ctx.caps, 'org', decoded) ?? installationOr404(ctx, 'repo', decoded);
  const hasRepos = inst.features.some((id) => id.startsWith('repo-'));
  return (
    <ScopeShell title={inst.scope === 'org' ? 'Organization' : 'Account'} crumbs={crumbs(ctx, { org: inst.key })} sections={sidebarFor(inst, 'org', inst.key)} extra={hasRepos ? [{ label: 'Repositories', href: reposHref(inst.key) }] : undefined}>
      {children}
    </ScopeShell>
  );
}

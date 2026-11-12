import type { ReactNode } from 'react';
import { ScopeShell } from '../../../../components/ScopeShell.tsx';
import { SetupNeeded } from '../../../../components/SetupNeeded.tsx';
import { sidebarFor } from '../../../../server/nav.ts';
import { loadContext } from '../../../../server/page-context.ts';
import { crumbs, installationOr404, repoOr404 } from '../../../../server/scope.ts';

export default async function RepoLayout({ children, params }: { children: ReactNode; params: Promise<{ owner: string; repo: string }> }) {
  const p = await params;
  const ctx = await loadContext();
  if (!ctx.ok) return <SetupNeeded error={ctx.error} />;
  const inst = installationOr404(ctx, 'repo', decodeURIComponent(p.owner));
  const repo = await repoOr404(ctx, inst, decodeURIComponent(p.repo));
  return (
    <ScopeShell title="Repository" crumbs={crumbs(ctx, { org: inst.key, repo: repo.name })} sections={sidebarFor(inst, 'repo', inst.key, repo.name)}>
      {children}
    </ScopeShell>
  );
}

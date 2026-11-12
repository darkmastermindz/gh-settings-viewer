import type { ReactNode } from 'react';
import { ScopeShell } from '../../../components/ScopeShell.tsx';
import { SetupNeeded } from '../../../components/SetupNeeded.tsx';
import { sidebarFor } from '../../../server/nav.ts';
import { loadContext } from '../../../server/page-context.ts';
import { crumbs, installationOr404 } from '../../../server/scope.ts';

export default async function EnterpriseLayout({ children, params }: { children: ReactNode; params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await loadContext();
  if (!ctx.ok) return <SetupNeeded error={ctx.error} />;
  const inst = installationOr404(ctx, 'enterprise', decodeURIComponent(key));
  return (
    <ScopeShell title="Enterprise" crumbs={crumbs(ctx, { enterprise: inst.key })} sections={sidebarFor(inst, 'enterprise', inst.key)}>
      {children}
    </ScopeShell>
  );
}

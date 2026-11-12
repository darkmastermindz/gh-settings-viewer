import type { ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from './Breadcrumbs.tsx';
import { Sidebar, type SidebarSection } from './Sidebar.tsx';

export function ScopeShell({ title, crumbs, sections, extra, children }: { title: string; crumbs: Crumb[]; sections: SidebarSection[]; extra?: { label: string; href: string }[]; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <Breadcrumbs items={crumbs} />
      <div className="flex flex-col gap-6 md:flex-row">
        <Sidebar title={title} sections={sections} extra={extra} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export interface SidebarSection {
  name: string;
  pages: { id: string; label: string; href: string }[];
}

export function Sidebar({ title, sections, extra }: { title: string; sections: SidebarSection[]; extra?: { label: string; href: string }[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <nav aria-label={`${title} settings`} className="md:w-60 md:shrink-0">
      <button type="button" className="md:hidden mb-3 w-full rounded-md border border-border px-3 py-2 text-left text-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Show'} {title} pages
      </button>
      <div className={`${open ? 'block' : 'hidden'} md:block space-y-5`}>
        {extra?.length ? (
          <ul className="space-y-0.5">
            {extra.map((x) => (
              <li key={x.href}>
                <Link href={x.href} aria-current={pathname === x.href ? 'page' : undefined} className={`block rounded-md px-2 py-1.5 text-sm no-underline ${pathname === x.href ? 'bg-muted font-semibold text-fg' : 'text-fg hover:bg-subtle'}`}>
                  {x.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {sections.map((s) => (
          <div key={s.name}>
            <h2 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">{s.name}</h2>
            <ul className="space-y-0.5">
              {s.pages.map((p) => {
                const active = pathname === p.href;
                return (
                  <li key={p.id}>
                    <Link href={p.href} aria-current={active ? 'page' : undefined} onClick={() => setOpen(false)} className={`block rounded-md px-2 py-1.5 text-sm no-underline ${active ? 'bg-muted font-semibold text-fg' : 'text-fg hover:bg-subtle'}`}>
                      {p.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

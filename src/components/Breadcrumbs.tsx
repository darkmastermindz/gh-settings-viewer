import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
  kind?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-fg-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {c.kind ? <span className="text-xs uppercase tracking-wide">{c.kind}</span> : null}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="font-medium">
                {c.label}
              </Link>
            ) : (
              <span className="font-medium text-fg" aria-current={i === items.length - 1 ? 'page' : undefined}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

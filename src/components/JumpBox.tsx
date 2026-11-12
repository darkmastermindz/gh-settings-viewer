'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface JumpEntry {
  label: string;
  group: string;
  href: string;
}

/** Global jump/search over discovered scopes and pages. Press "/" to focus. */
export function JumpBox({ entries }: { entries: JumpEntry[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return entries.filter((e) => terms.every((t) => `${e.label} ${e.group}`.toLowerCase().includes(t))).slice(0, 12);
  }, [q, entries]);

  const go = (href: string) => {
    setQ('');
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="relative w-full sm:w-80">
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="jump-results"
        aria-label="Jump to a page"
        placeholder="Jump to… (press /)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter' && results[active]) go(results[active]!.href);
          else if (e.key === 'Escape') setOpen(false);
        }}
        className="w-full rounded-md border border-border bg-canvas px-3 py-1.5 text-sm"
      />
      {open && results.length > 0 ? (
        <ul id="jump-results" role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-canvas shadow-lg">
          {results.map((r, i) => (
            <li key={r.href} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(r.href)} className={`block w-full px-3 py-2 text-left text-sm ${i === active ? 'bg-muted' : ''}`}>
                <span className="block font-medium">{r.label}</span>
                <span className="block text-xs text-fg-muted">{r.group}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

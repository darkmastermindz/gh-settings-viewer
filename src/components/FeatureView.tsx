'use client';
import { useEffect, useState } from 'react';
import type { FeatureData, SectionData, Target } from '../core/data/types.ts';
import { CopyButton } from './CopyButton.tsx';
import { DataView } from './DataView.tsx';
import { RateLimitBanner } from './RateLimitBanner.tsx';

function query(target: Target, featureId: string, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ scope: target.scope, key: target.key, feature: featureId, ...extra });
  if (target.repo) p.set('repo', target.repo);
  return p.toString();
}

async function fetchFeatureData(target: Target, featureId: string, refresh: boolean, filter: string): Promise<{ data: FeatureData } | { error: string }> {
  try {
    const res = await fetch(`/api/data?${query(target, featureId, { ...(refresh ? { refresh: '1' } : {}), ...(filter ? { filter } : {}) })}`, { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) return { error: body.error ?? `HTTP ${res.status}` };
    return { data: body as FeatureData };
  } catch (e) {
    return { error: navigator.onLine ? (e as Error).message : 'You are offline. Settings are fetched live from GitHub and are never stored for offline use.' };
  }
}

function Section({ s, raw }: { s: SectionData; raw: boolean }) {
  return (
    <section className="space-y-2">
      {s.title ? <h2 className="text-base font-semibold">{s.title}</h2> : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <code className="font-mono rounded bg-subtle px-1.5 py-0.5 break-all">{s.endpoint}</code>
        <CopyButton text={s.curl} label="Copy as curl (redacted)" />
        {s.fetchedAt ? <span>Fetched {new Date(s.fetchedAt).toLocaleString()}{s.fromCache ? ' (cached)' : ''}</span> : null}
      </div>
      {s.error ? (
        <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
          <code className="font-mono">{s.error.endpoint}</code> returned {s.error.status || 'an error'}: {s.error.message}
        </p>
      ) : raw ? (
        <pre className="overflow-x-auto rounded-md border border-border bg-subtle p-3 text-xs font-mono">{JSON.stringify(s.data, null, 2)}</pre>
      ) : (
        <DataView data={s.data} view={s.view} />
      )}
    </section>
  );
}

export function FeatureView({ target, featureId, label, description }: { target: Target; featureId: string; label: string; description?: string }) {
  const [data, setData] = useState<FeatureData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState(false);
  const [filter, setFilter] = useState('');
  const [applied, setApplied] = useState('');
  // Bumped by "Refresh"; a non-zero value asks the server to bypass its cache.
  const [refreshes, setRefreshes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchFeatureData(target, featureId, refreshes > 0, applied).then((r) => {
      if (cancelled) return;
      if ('error' in r) setError(r.error);
      else {
        setData(r.data);
        setError(null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [target, featureId, applied, refreshes]);

  const load = (refresh: boolean) => {
    setLoading(true);
    if (refresh) setRefreshes((n) => n + 1);
  };

  const filterParam = data?.sections.find((s) => s.filterParam)?.filterParam;
  const exportQs = query(target, featureId, applied ? { filter: applied } : {});

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{label}</h1>
            {description ? <p className="text-sm text-fg-muted max-w-prose">{description}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
              <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
              Raw JSON
            </label>
            <button
              type="button"
              onClick={() => load(true)}
              disabled={loading} className="rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-50">
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <a className="rounded-md border border-border px-2 py-1 hover:bg-muted no-underline text-fg" href={`/api/export?${exportQs}&format=json`}>
              Export JSON
            </a>
            <a className="rounded-md border border-border px-2 py-1 hover:bg-muted no-underline text-fg" href={`/api/export?${exportQs}&format=csv`}>
              Export CSV
            </a>
          </div>
        </div>
        <RateLimitBanner rateLimit={data?.rateLimit} />
        {filterParam ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setLoading(true);
              setApplied(filter.trim());
            }}
          >
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter, e.g. action:repo.create actor:octocat" aria-label="Filter" className="flex-1 rounded-md border border-border bg-canvas px-2 py-1 text-sm" />
            <button type="submit" className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted">
              Apply
            </button>
          </form>
        ) : null}
      </header>
      {error ? (
        <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!data && loading ? <p className="text-sm text-fg-muted">Loading…</p> : null}
      {data ? (
        <div className="space-y-8">
          {data.sections.map((s, i) => (
            <Section key={`${s.endpoint}-${i}`} s={s} raw={raw} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

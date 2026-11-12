'use client';
import { useEffect, useMemo, useState } from 'react';
import { diffSection } from '../core/data/diff.ts';
import { toCsv } from '../core/data/shape.ts';
import type { FeatureData, Target } from '../core/data/types.ts';
import { targetLabel } from '../core/data/types.ts';

export interface CompareInstallation {
  key: string;
  scope: 'enterprise' | 'org' | 'user';
  features: string[];
}

export interface FeatureMeta {
  id: string;
  label: string;
  section: string;
  scope: 'enterprise' | 'org' | 'repo';
}

interface Item {
  target: Target;
  features: string[];
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Compare({ installations, features }: { installations: CompareInstallation[]; features: FeatureMeta[] }) {
  const [mode, setMode] = useState<'org' | 'repo'>('org');
  const [selected, setSelected] = useState<string[]>([]);
  const [repoLists, setRepoLists] = useState<Record<string, { name: string }[]>>({});
  const [repoQuery, setRepoQuery] = useState('');
  const [featureId, setFeatureId] = useState('');
  const [results, setResults] = useState<(FeatureData | { error: string; target: Target })[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(true);

  const orgs = installations.filter((i) => i.scope === 'org');
  const repoOwners = installations.filter((i) => i.features.some((f) => f.startsWith('repo-')));

  useEffect(() => {
    if (mode !== 'repo') return;
    for (const o of repoOwners) {
      if (repoLists[o.key]) continue;
      fetch(`/api/repos?owner=${encodeURIComponent(o.key)}`)
        .then((r) => (r.ok ? r.json() : { repos: [] }))
        .then((b: { repos: { name: string }[] }) => setRepoLists((prev) => ({ ...prev, [o.key]: b.repos })))
        .catch(() => undefined);
    }
  }, [mode, repoOwners, repoLists]);

  const items: Item[] = useMemo(() => {
    if (mode === 'org') return selected.map((k) => ({ target: { scope: 'org', key: k }, features: orgs.find((o) => o.key === k)?.features ?? [] }));
    return selected.map((full) => {
      const [owner, repo] = full.split('/') as [string, string];
      return { target: { scope: 'repo', key: owner, repo }, features: repoOwners.find((o) => o.key === owner)?.features ?? [] };
    });
  }, [mode, selected, orgs, repoOwners]);

  // Only pages available for every selected item.
  const common = useMemo(() => {
    if (items.length < 2) return [];
    return features.filter((f) => f.scope === mode && items.every((i) => i.features.includes(f.id)));
  }, [items, features, mode]);

  const toggle = (k: string) => {
    setResults(null);
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  };

  const run = async () => {
    setLoading(true);
    setResults(null);
    const out = await Promise.all(
      items.map(async ({ target }) => {
        const p = new URLSearchParams({ scope: target.scope, key: target.key, feature: featureId });
        if (target.repo) p.set('repo', target.repo);
        try {
          const r = await fetch(`/api/data?${p}`);
          const b = await r.json();
          return r.ok ? (b as FeatureData) : { error: b.error ?? `HTTP ${r.status}`, target };
        } catch (e) {
          return { error: (e as Error).message, target };
        }
      }),
    );
    setResults(out);
    setLoading(false);
  };

  const sections = useMemo(() => {
    if (!results) return [];
    const ok = results.filter((r): r is FeatureData => !('error' in r));
    if (!ok.length) return [];
    return ok[0]!.sections.map((s, idx) => ({
      title: s.title ?? 'Settings',
      rows: diffSection(
        results.map((r) => ('error' in r ? null : (r.sections[idx]?.error ? { error: `${r.sections[idx]!.error!.status} ${r.sections[idx]!.error!.message}` } : r.sections[idx]?.data))),
        s.view.type === 'table' ? s.view.columns : undefined,
      ),
    }));
  }, [results]);

  const labels = items.map((i) => targetLabel(i.target));

  const exportCsv = () => {
    const rows = sections.flatMap((s) => s.rows.filter((r) => !onlyDiff || r.differs).map((r) => [s.title, r.key, ...r.values]));
    download(`compare-${featureId}.csv`, toCsv(['Section', 'Setting', ...labels], rows), 'text/csv');
  };
  const exportJson = () => download(`compare-${featureId}.json`, JSON.stringify({ page: featureId, targets: labels, results }, null, 2), 'application/json');

  const repoChoices = repoOwners.flatMap((o) => (repoLists[o.key] ?? []).map((r) => `${o.key}/${r.name}`)).filter((r) => r.toLowerCase().includes(repoQuery.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex gap-2 text-sm" role="tablist" aria-label="Compare">
        {(['org', 'repo'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            type="button"
            className={`rounded-md border px-3 py-1 ${mode === m ? 'border-accent bg-muted font-semibold' : 'border-border'}`}
            onClick={() => {
              setMode(m);
              setSelected([]);
              setFeatureId('');
              setResults(null);
            }}
          >
            {m === 'org' ? 'Organizations' : 'Repositories'}
          </button>
        ))}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Pick two or more</legend>
        {mode === 'repo' ? <input value={repoQuery} onChange={(e) => setRepoQuery(e.target.value)} placeholder="Filter repositories…" aria-label="Filter repositories" className="w-full rounded-md border border-border bg-canvas px-3 py-1.5 text-sm sm:w-80" /> : null}
        <ul className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
          {(mode === 'org' ? orgs.map((o) => o.key) : repoChoices.slice(0, 200)).map((k) => (
            <li key={k}>
              <label className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${selected.includes(k) ? 'border-accent bg-muted' : 'border-border'}`}>
                <input type="checkbox" checked={selected.includes(k)} onChange={() => toggle(k)} />
                {k}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {items.length >= 2 ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block font-semibold">Page (available for all selected)</span>
            <select value={featureId} onChange={(e) => setFeatureId(e.target.value)} className="mt-1 rounded-md border border-border bg-canvas px-2 py-1.5">
              <option value="">Choose…</option>
              {common.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.section}: {f.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!featureId || loading} onClick={run} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
            {loading ? 'Comparing…' : 'Compare'}
          </button>
          {common.length === 0 ? <p className="text-sm text-fg-muted">No page is available for all of these.</p> : null}
        </div>
      ) : null}

      {results ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Only differences
            </label>
            <button type="button" onClick={exportJson} className="rounded-md border border-border px-2 py-1 hover:bg-muted">
              Export JSON
            </button>
            <button type="button" onClick={exportCsv} className="rounded-md border border-border px-2 py-1 hover:bg-muted">
              Export CSV
            </button>
          </div>
          {results.filter((r) => 'error' in r).map((r) => (
            <p key={targetLabel(r.target)} role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
              {targetLabel(r.target)}: {(r as { error: string }).error}
            </p>
          ))}
          {sections.map((s) => {
            const rows = s.rows.filter((r) => !onlyDiff || r.differs);
            return (
              <section key={s.title} className="space-y-2">
                <h2 className="font-semibold">{s.title}</h2>
                {rows.length === 0 ? (
                  <p className="text-sm text-fg-muted">No differences.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-subtle text-left">
                        <tr>
                          <th className="px-3 py-2">Setting</th>
                          {labels.map((l) => (
                            <th key={l} className="px-3 py-2 whitespace-nowrap">
                              {l}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.key} className={`border-t border-border align-top ${r.differs ? 'bg-subtle' : ''}`}>
                            <td className="px-3 py-2 font-mono text-xs break-all">{r.key}</td>
                            {r.values.map((v, i) => (
                              <td key={i} className={`px-3 py-2 max-w-[24rem] break-words ${v === '(missing)' ? 'text-fg-muted italic' : ''}`}>
                                {v || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

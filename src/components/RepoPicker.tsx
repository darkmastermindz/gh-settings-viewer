'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface Repo {
  name: string;
  fullName: string;
  private: boolean;
  archived: boolean;
}

export function RepoPicker({ owner, firstPage }: { owner: string; firstPage: string }) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    fetch(`/api/repos?owner=${encodeURIComponent(owner)}`, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        setRepos(body.repos);
      })
      .catch((e: Error) => setError(e.message));
  }, [owner]);

  const shown = useMemo(() => (repos ?? []).filter((r) => (showArchived || !r.archived) && r.name.toLowerCase().includes(q.toLowerCase())), [repos, q, showArchived]);

  if (error) return <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">GET /installation/repositories: {error}</p>;
  if (!repos) return <p className="text-sm text-fg-muted">Loading repositories…</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a repository…" aria-label="Find a repository" className="flex-1 min-w-48 rounded-md border border-border bg-canvas px-3 py-1.5 text-sm" />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived
        </label>
      </div>
      <p className="text-xs text-fg-muted">
        {shown.length} of {repos.length} repositories this installation can read
      </p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {shown.map((r) => (
          <li key={r.fullName} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <Link href={`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(r.name)}/${firstPage}`} className="font-medium break-all">
              {r.name}
            </Link>
            <span className="flex gap-1 text-xs text-fg-muted">
              {r.private ? <span className="rounded-full border border-border px-2">Private</span> : null}
              {r.archived ? <span className="rounded-full border border-border px-2">Archived</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

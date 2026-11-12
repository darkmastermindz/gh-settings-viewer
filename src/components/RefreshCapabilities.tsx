'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RefreshCapabilities() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch('/api/capabilities/refresh', { method: 'POST' });
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Checking…' : 'Refresh capabilities'}
      </button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

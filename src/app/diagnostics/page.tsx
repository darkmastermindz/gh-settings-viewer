import Link from 'next/link';
import { SetupNeeded } from '../../components/SetupNeeded.tsx';
import { formatRemaining, installUrl, missingOrgInstallations } from '../../core/diagnostics.ts';
import { loadContext } from '../../server/page-context.ts';

export const metadata = { title: 'App & permissions' };

function Perms({ perms }: { perms: Record<string, string> }) {
  const entries = Object.entries(perms).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return <span className="text-fg-muted">None</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <li key={k} className={`rounded-full border px-2 py-0.5 font-mono text-xs ${v === 'read' ? 'border-border' : 'border-danger text-danger'}`}>
          {k}: {v}
        </li>
      ))}
    </ul>
  );
}

export default async function Diagnostics() {
  const ctx = await loadContext();
  if (!ctx.ok) return <SetupNeeded error={ctx.error} />;
  const { rt, caps } = ctx;
  const diag = rt.diagnostics(caps);
  const writes = [...new Set([...caps.appWritePermissions, ...diag.flatMap((d) => d.writePermissions)])];
  const missing = await missingOrgInstallations(rt, caps);
  const pages = diag.reduce((n, d) => n + d.pages, 0);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">App &amp; permissions</h1>
      {writes.length ? (
        <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
          This app holds write permissions ({writes.join(', ')}). The viewer only reads, but anyone with the private key could write. Set every permission to read-only in the app&apos;s settings.
        </p>
      ) : null}
      {rt.warnings.map((w) => (
        <p key={w} role="alert" className="rounded-md border border-warn px-3 py-2 text-sm text-warn">
          {w}
        </p>
      ))}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">App</h2>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-fg-muted">Name</dt>
          <dd>
            {caps.app.name} (<code className="font-mono">{caps.app.slug}</code>)
          </dd>
          <dt className="text-fg-muted">Owner</dt>
          <dd>{caps.app.owner?.login ?? 'unknown'}</dd>
          <dt className="text-fg-muted">API</dt>
          <dd className="font-mono break-all">{rt.config.apiBaseUrl}</dd>
          <dt className="text-fg-muted">Private key</dt>
          <dd className="break-all">{rt.keyDescription}</dd>
          <dt className="text-fg-muted">Install link</dt>
          <dd className="break-all">
            <a href={installUrl(rt.config.webBaseUrl, caps.app.slug)} rel="noreferrer noopener" target="_blank">
              {installUrl(rt.config.webBaseUrl, caps.app.slug)}
            </a>
          </dd>
        </dl>
        <h3 className="pt-2 text-sm font-semibold">Granted permissions (app registration)</h3>
        <Perms perms={caps.app.permissions} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Installations</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-subtle text-left">
              <tr>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Repositories</th>
                <th className="px-3 py-2">Token</th>
                <th className="px-3 py-2">Expires at</th>
                <th className="px-3 py-2">Time left</th>
                <th className="px-3 py-2">Rate limit</th>
                <th className="px-3 py-2">Pages</th>
              </tr>
            </thead>
            <tbody>
              {diag.map((d) => (
                <tr key={d.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium">{d.account}{d.suspended ? ' (suspended)' : ''}</td>
                  <td className="px-3 py-2">{d.scope}</td>
                  <td className="px-3 py-2">{d.repositorySelection ?? '—'}</td>
                  <td className="px-3 py-2">{d.token.state === 'valid' ? 'valid' : 'none'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.token.expiresAt ?? '—'}</td>
                  <td className="px-3 py-2">{d.token.state === 'valid' ? formatRemaining(d.token.msRemaining) : '—'}</td>
                  <td className="px-3 py-2">{d.rateLimit?.remaining !== undefined ? `${d.rateLimit.remaining}/${d.rateLimit.limit ?? '?'} (resets ${d.rateLimit.resetAt ? new Date(d.rateLimit.resetAt).toLocaleTimeString() : '?'})` : '—'}</td>
                  <td className="px-3 py-2">{d.pages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fg-muted">Tokens are minted on first use, kept in memory only, and reused until they expire. They are never shown or stored.</p>
        {diag.map((d) => (
          <details key={d.id} className="rounded-md border border-border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">{d.account}: granted permissions</summary>
            <div className="pt-2">
              <Perms perms={d.permissions} />
            </div>
          </details>
        ))}
      </section>

      {missing.missing?.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Organizations without an installation</h2>
          <p className="text-sm text-fg-muted">In {missing.enterprise}. Install the app on these to see their settings.</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {missing.missing.map((o) => (
              <li key={o} className="rounded-full border border-border px-2 py-0.5 font-mono">
                {o}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-1 text-sm">
        <h2 className="text-lg font-semibold">Discovery</h2>
        <p>
          {pages} pages available across {diag.filter((d) => d.pages > 0).length} installations. Last checked {new Date(caps.discoveredAt).toLocaleString()}.
        </p>
        {caps.probes.transientErrors ? <p className="text-warn">{caps.probes.transientErrors} checks hit a network or server error. Use “Refresh capabilities” to retry them.</p> : null}
        <p>
          <Link href="/">Back to the overview</Link>
        </p>
      </section>
    </div>
  );
}

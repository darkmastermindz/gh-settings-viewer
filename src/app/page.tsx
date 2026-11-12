import Link from 'next/link';
import { SetupNeeded } from '../components/SetupNeeded.tsx';
import { firstPage } from '../server/nav.ts';
import { loadContext } from '../server/page-context.ts';
import { pageHref, reposHref } from '../core/data/hrefs.ts';

export default async function Home() {
  const ctx = await loadContext();
  if (!ctx.ok) return <SetupNeeded error={ctx.error} />;
  const live = ctx.caps.installations.filter((i) => !i.suspended && i.features.length > 0);
  const groups = [
    { title: 'Enterprise', items: live.filter((i) => i.scope === 'enterprise') },
    { title: 'Organizations', items: live.filter((i) => i.scope === 'org') },
    { title: 'Personal accounts', items: live.filter((i) => i.scope === 'user') },
  ].filter((g) => g.items.length);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{ctx.caps.app.name}</h1>
        <p className="text-sm text-fg-muted">
          Read-only. Showing only what this GitHub App can read. Last checked {new Date(ctx.caps.discoveredAt).toLocaleTimeString()}.
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-md border border-border p-4 text-sm">
          The app has no installations it can read from yet. Install it on your enterprise or an organization, then use “Refresh capabilities”. See <Link href="/diagnostics">App &amp; permissions</Link>.
        </p>
      ) : null}
      {groups.map((g) => (
        <section key={g.title} className="space-y-3">
          <h2 className="text-lg font-semibold">{g.title}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((i) => {
              const scope = i.scope === 'enterprise' ? 'enterprise' : 'org';
              const first = i.scope === 'user' ? undefined : firstPage(i, scope);
              const repoPages = i.features.filter((id) => id.startsWith('repo-')).length;
              const ownPages = i.features.length - repoPages;
              return (
                <li key={i.id} className="rounded-md border border-border p-4 space-y-2">
                  <p className="font-semibold">{first ? <Link href={pageHref(scope, i.key, first.id)}>{i.key}</Link> : i.key}</p>
                  <p className="text-sm text-fg-muted">
                    {ownPages ? `${ownPages} ${scope === 'enterprise' ? 'enterprise' : 'organization'} pages` : null}
                    {ownPages && repoPages ? ' · ' : null}
                    {repoPages ? `${repoPages} repository pages` : null}
                  </p>
                  {repoPages ? (
                    <Link className="text-sm" href={reposHref(i.key)}>
                      Browse repositories
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

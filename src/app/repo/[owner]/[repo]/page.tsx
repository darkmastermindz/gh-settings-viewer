import { notFound, redirect } from 'next/navigation';
import { pageHref } from '../../../../core/data/hrefs.ts';
import { firstPage } from '../../../../server/nav.ts';
import { loadContext } from '../../../../server/page-context.ts';
import { installationOr404, repoOr404 } from '../../../../server/scope.ts';

export default async function RepoIndex({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const p = await params;
  const ctx = await loadContext();
  if (!ctx.ok) notFound();
  const inst = installationOr404(ctx, 'repo', decodeURIComponent(p.owner));
  const repo = await repoOr404(ctx, inst, decodeURIComponent(p.repo));
  const first = firstPage(inst, 'repo');
  if (!first) notFound();
  redirect(pageHref('repo', inst.key, first.id, repo.name));
}

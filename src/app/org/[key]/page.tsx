import { notFound, redirect } from 'next/navigation';
import { pageHref, reposHref } from '../../../core/data/hrefs.ts';
import { firstPage } from '../../../server/nav.ts';
import { loadContext } from '../../../server/page-context.ts';
import { installationOr404 } from '../../../server/scope.ts';

export default async function OrgIndex({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await loadContext();
  if (!ctx.ok) notFound();
  const decoded = decodeURIComponent(key);
  const inst = ctx.rt.findInstallation(ctx.caps, 'org', decoded) ?? installationOr404(ctx, 'repo', decoded);
  const first = firstPage(inst, 'org');
  if (first) redirect(pageHref('org', inst.key, first.id));
  if (inst.features.some((id) => id.startsWith('repo-'))) redirect(reposHref(inst.key));
  notFound();
}

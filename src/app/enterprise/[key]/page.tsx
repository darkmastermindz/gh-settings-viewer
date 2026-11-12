import { notFound, redirect } from 'next/navigation';
import { pageHref } from '../../../core/data/hrefs.ts';
import { firstPage } from '../../../server/nav.ts';
import { loadContext } from '../../../server/page-context.ts';
import { installationOr404 } from '../../../server/scope.ts';

export default async function EnterpriseIndex({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await loadContext();
  if (!ctx.ok) notFound();
  const inst = installationOr404(ctx, 'enterprise', decodeURIComponent(key));
  const first = firstPage(inst, 'enterprise');
  if (!first) notFound();
  redirect(pageHref('enterprise', inst.key, first.id));
}

import { notFound } from 'next/navigation';
import { RepoPicker } from '../../../../components/RepoPicker.tsx';
import { firstPage } from '../../../../server/nav.ts';
import { loadContext } from '../../../../server/page-context.ts';
import { installationOr404 } from '../../../../server/scope.ts';

export const metadata = { title: 'Repositories' };

export default async function Repos({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await loadContext();
  if (!ctx.ok) notFound();
  const inst = installationOr404(ctx, 'repo', decodeURIComponent(key));
  const first = firstPage(inst, 'repo');
  if (!first) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Repositories</h1>
      <RepoPicker owner={inst.key} firstPage={first.id} />
    </div>
  );
}

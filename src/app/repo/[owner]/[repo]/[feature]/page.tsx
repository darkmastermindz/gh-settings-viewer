import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FeaturePage } from '../../../../../components/FeaturePage.tsx';
import { getFeature } from '../../../../../core/registry/index.ts';
import { loadContext } from '../../../../../server/page-context.ts';
import { featureOr404, installationOr404, repoOr404 } from '../../../../../server/scope.ts';

type Params = { params: Promise<{ owner: string; repo: string; feature: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = await params;
  return { title: `${getFeature(p.feature)?.label ?? 'Settings'} · ${decodeURIComponent(p.owner)}/${decodeURIComponent(p.repo)}` };
}

export default async function RepoFeature({ params }: Params) {
  const p = await params;
  const ctx = await loadContext();
  if (!ctx.ok) notFound();
  const inst = installationOr404(ctx, 'repo', decodeURIComponent(p.owner));
  const repo = await repoOr404(ctx, inst, decodeURIComponent(p.repo));
  const f = featureOr404(inst, 'repo', p.feature);
  return <FeaturePage target={{ scope: 'repo', key: inst.key, repo: repo.name }} featureId={f.id} label={f.label} description={f.description} />;
}

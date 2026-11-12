import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FeaturePage } from '../../../../components/FeaturePage.tsx';
import { getFeature } from '../../../../core/registry/index.ts';
import { loadContext } from '../../../../server/page-context.ts';
import { featureOr404, installationOr404 } from '../../../../server/scope.ts';

type Params = { params: Promise<{ key: string; feature: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { key, feature } = await params;
  return { title: `${getFeature(feature)?.label ?? 'Settings'} · ${decodeURIComponent(key)}` };
}

export default async function EnterpriseFeature({ params }: Params) {
  const { key, feature } = await params;
  const ctx = await loadContext();
  if (!ctx.ok) notFound();
  const inst = installationOr404(ctx, 'enterprise', decodeURIComponent(key));
  const f = featureOr404(inst, 'enterprise', feature);
  return <FeaturePage target={{ scope: 'enterprise', key: inst.key }} featureId={f.id} label={f.label} description={f.description} />;
}

import type { Target } from '../core/data/types.ts';
import { FeatureView } from './FeatureView.tsx';

export function FeaturePage({ target, featureId, label, description }: { target: Target; featureId: string; label: string; description?: string }) {
  return <FeatureView key={`${target.scope}:${target.key}:${target.repo ?? ''}:${featureId}`} target={target} featureId={featureId} label={label} description={description} />;
}

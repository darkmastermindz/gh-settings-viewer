import { enterpriseFeatures } from './enterprise.ts';
import { orgFeatures } from './org.ts';
import { repoFeatures } from './repo.ts';
import type { Feature, Scope } from './types.ts';

export const registry: readonly Feature[] = [...enterpriseFeatures, ...orgFeatures, ...repoFeatures];

const byId = new Map(registry.map((f) => [f.id, f]));

export function getFeature(id: string): Feature | undefined {
  return byId.get(id);
}

export function featuresForScope(scope: Scope): Feature[] {
  return registry.filter((f) => f.scope === scope);
}

export * from './types.ts';

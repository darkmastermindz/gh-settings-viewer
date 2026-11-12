import type { Scope } from '../registry/types.ts';

const e = encodeURIComponent;

export function scopeHref(scope: Scope, key: string, repo?: string): string {
  if (scope === 'enterprise') return `/enterprise/${e(key)}`;
  if (scope === 'org') return `/org/${e(key)}`;
  return `/repo/${e(key)}/${e(repo ?? '')}`;
}

export function pageHref(scope: Scope, key: string, featureId: string, repo?: string): string {
  return `${scopeHref(scope, key, repo)}/${e(featureId)}`;
}

export function reposHref(owner: string): string {
  return `/org/${e(owner)}/repos`;
}

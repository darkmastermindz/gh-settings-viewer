import type { RateLimitInfo } from '../github/ratelimit.ts';
import type { Scope, View } from '../registry/types.ts';

export interface Target {
  scope: Scope;
  /** Enterprise slug or org login. For repos, the owner. */
  key: string;
  repo?: string;
}

export interface SectionData {
  title?: string;
  /** e.g. "GET /orgs/acme/hooks" */
  endpoint: string;
  url: string;
  /** "Copy as curl" with the token replaced by a placeholder. */
  curl: string;
  view: View;
  status?: number;
  fetchedAt?: number;
  fromCache?: boolean;
  data?: unknown;
  error?: { status: number; endpoint: string; message: string };
  filterParam?: string;
}

export interface FeatureData {
  featureId: string;
  label: string;
  target: Target;
  sections: SectionData[];
  rateLimit?: RateLimitInfo;
}

export function targetLabel(t: Target): string {
  return t.scope === 'repo' ? `${t.key}/${t.repo}` : t.key;
}

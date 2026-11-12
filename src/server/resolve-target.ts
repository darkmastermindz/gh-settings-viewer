import 'server-only';
import type { DiscoveredInstallation, SampleRepo } from '../core/discovery/discover.ts';
import { listRepos } from '../core/data/fetch-feature.ts';
import type { Target } from '../core/data/types.ts';
import { getFeature, type Feature } from '../core/registry/index.ts';
import { isAccountKey, isFeatureId, isRepoName } from '../core/security/validate.ts';
import type { Runtime } from '../core/runtime.ts';

export type Resolved = { ok: true; feature: Feature; inst: DiscoveredInstallation; target: Target; repo?: SampleRepo } | { ok: false; status: 400 | 404; message: string };

/**
 * Turns URL input into a page the app can show, or 404. A page that discovery didn't register is a 404,
 * never a placeholder.
 */
export async function resolveTarget(rt: Runtime, input: { scope: unknown; key: unknown; repo?: unknown; feature: unknown }): Promise<Resolved> {
  const scope = input.scope;
  if (scope !== 'enterprise' && scope !== 'org' && scope !== 'repo') return { ok: false, status: 400, message: 'Unknown scope' };
  if (!isAccountKey(input.key)) return { ok: false, status: 400, message: 'Invalid account name' };
  if (!isFeatureId(input.feature)) return { ok: false, status: 400, message: 'Invalid page' };
  if (scope === 'repo' && !isRepoName(input.repo)) return { ok: false, status: 400, message: 'Invalid repository name' };
  const feature = getFeature(input.feature);
  if (!feature || feature.scope !== scope) return { ok: false, status: 404, message: 'Page not available' };
  const caps = await rt.capabilities();
  const inst = rt.findInstallation(caps, scope, input.key);
  if (!inst || inst.suspended || !inst.features.includes(feature.id)) return { ok: false, status: 404, message: 'Page not available' };
  const target: Target = { scope, key: inst.key, repo: scope === 'repo' ? (input.repo as string) : undefined };
  if (scope !== 'repo') return { ok: true, feature, inst, target };
  const repo = await findRepo(rt, inst, input.repo as string);
  if (!repo) return { ok: false, status: 404, message: 'Repository not found for this installation' };
  return { ok: true, feature, inst, target: { ...target, repo: repo.name }, repo };
}

export async function findRepo(rt: Runtime, inst: DiscoveredInstallation, name: string): Promise<SampleRepo | undefined> {
  const repos = await listRepos(rt.readerFor(inst.id));
  const r = repos.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return r ? { owner: r.owner, name: r.name, defaultBranch: r.defaultBranch } : undefined;
}

// Fails when a registry entry disagrees with GitHub's permissions dataset (data/github-app-permissions.json):
// a REST endpoint that the declared permission doesn't cover, an endpoint that needs write, or duplicate IDs.
import { readFileSync } from 'node:fs';
import { registry } from '../src/core/registry/index.ts';
import type { RestEndpoint } from '../src/core/registry/types.ts';

interface Dataset {
  source: { commit: string };
  permissions: Record<string, { category: string; get: { path: string; access: string; additional: boolean }[] }>;
}
const data = JSON.parse(readFileSync(new URL('../data/github-app-permissions.json', import.meta.url), 'utf8')) as Dataset;

const byPath = new Map<string, { perm: string; access: string }[]>();
for (const [perm, p] of Object.entries(data.permissions)) for (const g of p.get) (byPath.get(g.path) ?? byPath.set(g.path, []).get(g.path)!).push({ perm, access: g.access });

// Endpoints any installation can read, and which the dataset therefore doesn't list under a permission.
const NO_PERMISSION_PATHS = new Set(['/orgs/{org}']);

export function checkRegistry(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const f of registry) {
    if (ids.has(f.id)) errors.push(`${f.id}: duplicate id`);
    ids.add(f.id);
    const rests = [...f.endpoints, ...(f.probe ? [f.probe] : [])].filter((e): e is RestEndpoint => e.kind === 'rest');
    if (f.requiredPermission === 'graphql-probe' && f.endpoints.some((e) => e.kind === 'rest')) errors.push(`${f.id}: 'graphql-probe' is only for GraphQL-only pages`);
    for (const e of rests) {
      if (!e.path.startsWith(f.scope === 'enterprise' ? '/' : f.scope === 'org' ? '/orgs/{org}' : '/repos/{owner}/{repo}')) errors.push(`${f.id}: ${e.path} doesn't match scope ${f.scope}`);
      const listed = byPath.get(e.path);
      if (f.requiredPermission === 'installation') {
        if (!NO_PERMISSION_PATHS.has(e.path)) errors.push(`${f.id}: 'installation' is only for ${[...NO_PERMISSION_PATHS].join(', ')}`);
        continue;
      }
      if (typeof f.requiredPermission !== 'object') continue;
      if (!listed) {
        errors.push(`${f.id}: GET ${e.path} isn't available to GitHub Apps per github/docs@${data.source.commit.slice(0, 12)}`);
        continue;
      }
      const reads = listed.filter((l) => l.access === 'read');
      if (reads.length === 0) {
        errors.push(`${f.id}: GET ${e.path} needs write (${listed.map((l) => l.perm).join(', ')}); a read-only app can't read it`);
        continue;
      }
      const declared = [f.requiredPermission, ...(f.additionalPermissions ?? [])].map((p) => p.name);
      if (!reads.some((l) => declared.includes(l.perm))) errors.push(`${f.id}: GET ${e.path} needs ${reads.map((l) => l.perm).join(' or ')}:read, registry says ${declared.join(', ')}`);
    }
    if (typeof f.requiredPermission === 'object' && !data.permissions[f.requiredPermission.name]) errors.push(`${f.id}: unknown permission ${f.requiredPermission.name}`);
  }
  return errors;
}

if (import.meta.main) {
  const errors = checkRegistry();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(`Registry OK: ${registry.length} pages checked against github/docs@${data.source.commit.slice(0, 12)}`);
}

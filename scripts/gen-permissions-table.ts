// Generates docs/permissions.md from the feature registry. Run: npm run gen:permissions
// CI fails if the committed file is out of date (scripts/gen-permissions-table.ts --check).
import { readFileSync, writeFileSync } from 'node:fs';
import { registry } from '../src/core/registry/index.ts';
import { SCOPE_LABEL, type Feature } from '../src/core/registry/types.ts';

const data = JSON.parse(readFileSync(new URL('../data/github-app-permissions.json', import.meta.url), 'utf8')) as { source: { commit: string }; permissions: Record<string, { title: string; category: string }> };

const permLabel = (f: Feature): string => {
  const rp = f.requiredPermission;
  if (rp === 'installation') return 'Any installation on the account';
  if (rp === 'graphql-probe') return 'Not documented for GraphQL; shown when the check query succeeds';
  const p = data.permissions[rp.name];
  const extra = (f.additionalPermissions ?? []).map((a) => `${data.permissions[a.name]?.title ?? a.name} (\`${a.name}\`)`);
  return `${p ? `${cap(p.category)}: ${p.title}` : rp.name} (\`${rp.name}\`): read${extra.length ? `, plus ${extra.join(', ')}` : ''}`;
};
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const endpoints = (f: Feature) => f.endpoints.map((e) => (e.kind === 'rest' ? `\`GET ${e.path}${e.query ? `?${new URLSearchParams(e.query)}` : ''}\`` : '`POST /graphql` (query)')).join('<br>');

let md = `# Permissions and pages

Generated from the feature registry (\`src/core/registry/\`) by \`npm run gen:permissions\`. Do not edit by hand.
Permission names and endpoint requirements are checked in CI against GitHub's own dataset
([github/docs@${data.source.commit.slice(0, 12)}](https://github.com/github/docs/tree/${data.source.commit}/src/github-apps/data), the source of
"[Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)").

A page appears only when the installation holds the permission **and** a one-time check request to its endpoint answers 2xx or 304.
Everything is read-only: the app never needs a write permission.

`;
for (const scope of ['enterprise', 'org', 'repo'] as const) {
  const rows = registry.filter((f) => f.scope === scope);
  md += `## ${SCOPE_LABEL[scope]} (${rows.length} pages)\n\n| Section | Page | Permission | Endpoints | Plan |\n| --- | --- | --- | --- | --- |\n`;
  for (const f of rows) md += `| ${f.section} | ${f.label} | ${permLabel(f)} | ${endpoints(f)} | ${f.planRequirement === 'ghec' ? 'Enterprise Cloud' : f.planRequirement === 'enterprise' ? 'Enterprise' : ''} |\n`;
  md += '\n';
}
md += `## Not shown, and why

These settings exist in GitHub's UI, but a read-only GitHub App can't read them, so the viewer has no page for them:

| Setting | Why |
| --- | --- |
| Enterprise audit log | The REST endpoint needs a personal access token, and GraphQL has no enterprise audit log field. The organization audit log is available. |
| Enterprise and organization rulesets | \`GET\` requires Enterprise Ruleset / Organization Administration **write**. Repository pages list inherited rulesets instead (\`includes_parents=true\`, Metadata read). |
| Enterprise Actions and repository policies (REST) | Not available to GitHub Apps. Repository-related enterprise policies are shown through GraphQL where the check query succeeds. |
| Tag protection | The API was removed; rulesets replace it. |
| Secret and variable values | Never shown. GitHub doesn't return secret values; variable values are removed on the server. |
| SAML recovery codes | Never requested. |
`;

if (process.argv.includes('--check')) {
  const current = readFileSync(new URL('../docs/permissions.md', import.meta.url), 'utf8');
  if (current !== md) {
    console.error('docs/permissions.md is out of date. Run npm run gen:permissions');
    process.exit(1);
  }
  console.log('docs/permissions.md is up to date');
} else {
  writeFileSync(new URL('../docs/permissions.md', import.meta.url), md);
  console.log(`Wrote docs/permissions.md (${registry.length} pages)`);
}

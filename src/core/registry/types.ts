// The feature registry: every page the UI can show. The sidebar, breadcrumbs, search, compare view
// and export are all generated from these entries, filtered by what discovery found.

export type Scope = 'enterprise' | 'org' | 'repo';

/** This tool only ever asks for read. The type has no 'write'. */
export interface PermissionRequirement {
  /** The permission key as GitHub names it, e.g. "organization_hooks". */
  name: string;
  access: 'read';
}

/**
 * What an installation must hold before a page is probed:
 * - a named permission (the common case; checked against GitHub's permissions dataset in CI),
 * - 'installation': any installation on the account can read it (e.g. GET /orgs/{org}),
 * - 'graphql-probe': GitHub doesn't document the permission for this GraphQL field; only the probe decides.
 */
export type RequiredPermission = PermissionRequirement | 'installation' | 'graphql-probe';

export interface Column {
  /** Dot path into a row, e.g. "config.url". "labels[].name" joins an array. */
  key: string;
  label: string;
  format?: 'date' | 'bool' | 'code' | 'list';
}

export type View = { type: 'keyValue' } | { type: 'table'; columns?: Column[] } | { type: 'status'; meaning: Record<number, string> };

interface EndpointBase {
  /** Section heading when a page has more than one endpoint. */
  title?: string;
  /** Dot path to the data inside the response, e.g. "runners" for { total_count, runners: [...] }. */
  select?: string;
  /** Fields removed on the server before anything reaches the browser (secret values, public keys, variable values). */
  omit?: string[];
  view?: View;
}

export interface RestEndpoint extends EndpointBase {
  kind: 'rest';
  /** Path template with {enterprise}, {org}, {owner}, {repo} or {branch}. */
  path: `/${string}`;
  query?: Record<string, string>;
  paginate?: boolean;
  /** Stop after this many pages (for very long lists like the audit log). */
  maxPages?: number;
  /** SCIM endpoints page with startIndex/count instead of per_page/page. */
  scim?: boolean;
  /** A free-text filter the UI can pass as this query parameter (e.g. "phrase" for the audit log). */
  filterParam?: string;
}

export interface GraphqlEndpoint extends EndpointBase {
  kind: 'graphql';
  /** Variables available: $slug (enterprise), $login (org), $owner and $name (repo), $cursor. */
  query: string;
  /** A cheap version used once at discovery. */
  probe: string;
  /** Dot path to a connection to page through with $cursor (pageInfo { hasNextPage endCursor }). */
  connection?: string;
}

export type Endpoint = RestEndpoint | GraphqlEndpoint;

export interface Feature {
  id: string;
  scope: Scope;
  /** Sidebar group, mirroring GitHub's Settings layout. */
  section: string;
  label: string;
  description?: string;
  requiredPermission: RequiredPermission;
  /** Other permissions GitHub lists for the same endpoint. */
  additionalPermissions?: PermissionRequirement[];
  endpoints: Endpoint[];
  /** A hint only. The probe decides. */
  planRequirement?: 'ghec' | 'enterprise';
  /**
   * The endpoint probed at discovery, when endpoints[0] can return 404 for reasons other than access
   * (e.g. branch protection on an unprotected branch). Must need the same permission.
   */
  probe?: RestEndpoint | GraphqlEndpoint;
  /** For repo pages: pick a sample repository that has this property set (e.g. has_pages) to probe against. */
  probeRepoWhere?: { has_pages?: true };
  /** Default view for endpoints that don't set one. */
  renderer: View;
}

/** What the browser receives: no probe internals. */
export type PublicFeature = Pick<Feature, 'id' | 'scope' | 'section' | 'label' | 'description' | 'requiredPermission' | 'planRequirement'> & {
  endpoints: { title?: string; kind: 'rest' | 'graphql'; path?: string; filterParam?: string }[];
};

export function toPublicFeature(f: Feature): PublicFeature {
  return {
    id: f.id,
    scope: f.scope,
    section: f.section,
    label: f.label,
    description: f.description,
    requiredPermission: f.requiredPermission,
    planRequirement: f.planRequirement,
    endpoints: f.endpoints.map((e) => ({ title: e.title, kind: e.kind, path: e.kind === 'rest' ? e.path : undefined, filterParam: e.kind === 'rest' ? e.filterParam : undefined })),
  };
}

export const SCOPE_LABEL: Record<Scope, string> = { enterprise: 'Enterprise', org: 'Organization', repo: 'Repository' };

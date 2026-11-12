import { col, created, keyValue, read, rest, table } from './helpers.ts';
import type { Feature } from './types.ts';

// Enterprise installations get enterprise permissions only (no org or repo access).
// Not here, because GitHub Apps can't read them: the enterprise audit log (REST needs a PAT; GraphQL has no
// Enterprise.auditLog), enterprise rulesets (GET requires Enterprise Ruleset *write*), Actions policies.

const PAGE = 'pageInfo { hasNextPage endCursor }';

export const enterpriseFeatures: Feature[] = [
  {
    id: 'enterprise-overview',
    scope: 'enterprise',
    section: 'Overview',
    label: 'Profile',
    requiredPermission: 'graphql-probe',
    endpoints: [
      {
        kind: 'graphql',
        query: 'query($slug: String!) { enterprise(slug: $slug) { name slug description location url websiteUrl billingEmail createdAt updatedAt } }',
        probe: 'query($slug: String!) { enterprise(slug: $slug) { slug } }',
        select: 'enterprise',
      },
    ],
    renderer: keyValue,
  },
  {
    id: 'enterprise-members',
    scope: 'enterprise',
    section: 'People',
    label: 'Members',
    requiredPermission: 'graphql-probe',
    endpoints: [
      {
        kind: 'graphql',
        query: `query($slug: String!, $cursor: String) { enterprise(slug: $slug) { members(first: 100, after: $cursor) { totalCount ${PAGE} nodes { __typename ... on EnterpriseUserAccount { login name createdAt } ... on User { login name createdAt } } } } }`,
        probe: 'query($slug: String!) { enterprise(slug: $slug) { members(first: 1) { totalCount } } }',
        connection: 'enterprise.members',
      },
    ],
    renderer: table(col('login', 'Login', 'code'), col('name', 'Name'), col('__typename', 'Account type'), col('createdAt', 'Joined', 'date')),
  },
  {
    id: 'enterprise-owners',
    scope: 'enterprise',
    section: 'People',
    label: 'Owners',
    requiredPermission: 'graphql-probe',
    endpoints: [
      {
        kind: 'graphql',
        query: `query($slug: String!, $cursor: String) { enterprise(slug: $slug) { ownerInfo { admins(first: 100, after: $cursor) { totalCount ${PAGE} edges { role node { login name } } } } } }`,
        probe: 'query($slug: String!) { enterprise(slug: $slug) { ownerInfo { admins(first: 1) { totalCount } } } }',
        connection: 'enterprise.ownerInfo.admins',
      },
    ],
    renderer: table(col('node.login', 'Login', 'code'), col('node.name', 'Name'), col('role', 'Role')),
  },
  {
    id: 'enterprise-teams',
    scope: 'enterprise',
    section: 'People',
    label: 'Enterprise teams',
    requiredPermission: read('enterprise_teams'),
    endpoints: [rest('/enterprises/{enterprise}/teams', { paginate: true })],
    renderer: table(col('name', 'Name'), col('slug', 'Slug', 'code'), col('description', 'Description'), col('group_name', 'IdP group'), created),
  },
  {
    id: 'enterprise-roles',
    scope: 'enterprise',
    section: 'People',
    label: 'Enterprise roles',
    requiredPermission: read('enterprise_custom_enterprise_roles'),
    endpoints: [rest('/enterprises/{enterprise}/enterprise-roles', { paginate: true })],
    renderer: table(col('name', 'Name'), col('description', 'Description'), col('source', 'Source'), col('permissions', 'Permissions', 'list')),
  },
  {
    id: 'enterprise-scim-users',
    scope: 'enterprise',
    section: 'Identity provisioning',
    label: 'Provisioned users (SCIM)',
    description: 'Users provisioned by your identity provider (Enterprise Managed Users).',
    requiredPermission: read('enterprise_scim'),
    planRequirement: 'enterprise',
    endpoints: [rest('/scim/v2/enterprises/{enterprise}/Users', { scim: true, select: 'Resources' })],
    renderer: table(col('userName', 'User name', 'code'), col('displayName', 'Display name'), col('active', 'Active', 'bool'), col('externalId', 'External ID', 'code'), col('roles[].value', 'Roles', 'list')),
  },
  {
    id: 'enterprise-scim-groups',
    scope: 'enterprise',
    section: 'Identity provisioning',
    label: 'Provisioned groups (SCIM)',
    requiredPermission: read('enterprise_scim'),
    planRequirement: 'enterprise',
    endpoints: [rest('/scim/v2/enterprises/{enterprise}/Groups', { scim: true, select: 'Resources' })],
    renderer: table(col('displayName', 'Display name'), col('externalId', 'External ID', 'code'), col('members', 'Members', 'list')),
  },
  {
    id: 'enterprise-organizations',
    scope: 'enterprise',
    section: 'Organizations',
    label: 'Organizations',
    requiredPermission: read('enterprise_organization_installations'),
    endpoints: [rest('/enterprises/{enterprise}/apps/installable_organizations', { paginate: true })],
    renderer: table(col('login', 'Organization', 'code'), col('id', 'ID')),
  },
  {
    id: 'enterprise-policies',
    scope: 'enterprise',
    section: 'Policies',
    label: 'Repository and member policies',
    requiredPermission: 'graphql-probe',
    endpoints: [
      {
        kind: 'graphql',
        query: `query($slug: String!) { enterprise(slug: $slug) { ownerInfo {
          defaultRepositoryPermissionSetting membersCanCreateRepositoriesSetting membersCanCreatePublicRepositoriesSetting
          membersCanCreatePrivateRepositoriesSetting membersCanCreateInternalRepositoriesSetting membersCanChangeRepositoryVisibilitySetting
          membersCanDeleteRepositoriesSetting membersCanDeleteIssuesSetting membersCanInviteCollaboratorsSetting
          membersCanUpdateProtectedBranchesSetting membersCanViewDependencyInsightsSetting membersCanMakePurchasesSetting
          allowPrivateRepositoryForkingSetting allowPrivateRepositoryForkingSettingPolicyValue repositoryDeployKeySetting
          organizationProjectsSetting repositoryProjectsSetting notificationDeliveryRestrictionEnabledSetting
          twoFactorRequiredSetting twoFactorDisallowedMethodsSetting
        } } }`,
        probe: 'query($slug: String!) { enterprise(slug: $slug) { ownerInfo { defaultRepositoryPermissionSetting } } }',
        select: 'enterprise.ownerInfo',
      },
    ],
    renderer: keyValue,
  },
  {
    id: 'enterprise-custom-properties',
    scope: 'enterprise',
    section: 'Policies',
    label: 'Repository custom properties',
    requiredPermission: read('enterprise_custom_properties'),
    endpoints: [rest('/enterprises/{enterprise}/properties/schema')],
    renderer: table(col('property_name', 'Name', 'code'), col('value_type', 'Type'), col('required', 'Required', 'bool'), col('default_value', 'Default'), col('allowed_values', 'Allowed values', 'list'), col('values_editable_by', 'Editable by')),
  },
  {
    id: 'enterprise-org-properties',
    scope: 'enterprise',
    section: 'Policies',
    label: 'Organization custom properties',
    requiredPermission: read('enterprise_custom_properties_for_organizations'),
    endpoints: [
      rest('/enterprises/{enterprise}/org-properties/schema', { title: 'Schema' }),
      rest('/enterprises/{enterprise}/org-properties/values', { title: 'Values', paginate: true, view: table(col('organization_login', 'Organization', 'code'), col('properties', 'Properties', 'list')) }),
    ],
    renderer: table(col('property_name', 'Name', 'code'), col('value_type', 'Type'), col('required', 'Required', 'bool'), col('default_value', 'Default'), col('allowed_values', 'Allowed values', 'list')),
  },
  {
    id: 'enterprise-ip-allow-list',
    scope: 'enterprise',
    section: 'Authentication security',
    label: 'IP allow list',
    requiredPermission: 'graphql-probe',
    endpoints: [
      {
        kind: 'graphql',
        title: 'Settings',
        query: 'query($slug: String!) { enterprise(slug: $slug) { ownerInfo { ipAllowListEnabledSetting ipAllowListForInstalledAppsEnabledSetting } } }',
        probe: 'query($slug: String!) { enterprise(slug: $slug) { ownerInfo { ipAllowListEnabledSetting } } }',
        select: 'enterprise.ownerInfo',
        view: keyValue,
      },
      {
        kind: 'graphql',
        title: 'Entries',
        query: `query($slug: String!, $cursor: String) { enterprise(slug: $slug) { ownerInfo { ipAllowListEntries(first: 100, after: $cursor) { ${PAGE} nodes { allowListValue name isActive createdAt updatedAt } } } } }`,
        probe: 'query($slug: String!) { enterprise(slug: $slug) { ownerInfo { ipAllowListEntries(first: 1) { totalCount } } } }',
        connection: 'enterprise.ownerInfo.ipAllowListEntries',
        view: table(col('allowListValue', 'IP or range', 'code'), col('name', 'Name'), col('isActive', 'Active', 'bool'), col('updatedAt', 'Updated', 'date')),
      },
    ],
    renderer: keyValue,
  },
  {
    id: 'enterprise-sso',
    scope: 'enterprise',
    section: 'Authentication security',
    label: 'Single sign-on',
    description: 'SAML or OIDC identity provider. Recovery codes are never requested.',
    requiredPermission: 'graphql-probe',
    endpoints: [
      {
        kind: 'graphql',
        // Never add recoveryCodes here: they are credentials.
        query: 'query($slug: String!) { enterprise(slug: $slug) { ownerInfo { samlIdentityProvider { ssoUrl issuer digestMethod signatureMethod } oidcProvider { providerType tenantId } } } }',
        probe: 'query($slug: String!) { enterprise(slug: $slug) { ownerInfo { samlIdentityProvider { issuer } oidcProvider { providerType } } } }',
        select: 'enterprise.ownerInfo',
      },
    ],
    renderer: keyValue,
  },
  {
    id: 'enterprise-dependabot-access',
    scope: 'enterprise',
    section: 'Code security',
    label: 'Dependabot repository access',
    requiredPermission: read('enterprise_security_products'),
    endpoints: [rest('/enterprises/{enterprise}/dependabot/repository-access')],
    renderer: keyValue,
  },
  {
    id: 'enterprise-billing-usage',
    scope: 'enterprise',
    section: 'Billing and licensing',
    label: 'Usage summary',
    requiredPermission: read('enterprise_billing'),
    endpoints: [rest('/enterprises/{enterprise}/settings/billing/usage/summary')],
    renderer: keyValue,
  },
  {
    id: 'enterprise-budgets',
    scope: 'enterprise',
    section: 'Billing and licensing',
    label: 'Budgets',
    requiredPermission: read('enterprise_billing'),
    endpoints: [rest('/enterprises/{enterprise}/settings/billing/budgets', { select: 'budgets' })],
    renderer: table(col('id', 'ID', 'code'), col('budget_type', 'Type'), col('budget_scope', 'Scope'), col('budget_entity_name', 'Applies to'), col('budget_amount', 'Amount'), col('prevent_further_usage', 'Stops usage', 'bool')),
  },
  {
    id: 'enterprise-cost-centers',
    scope: 'enterprise',
    section: 'Billing and licensing',
    label: 'Cost centers',
    requiredPermission: read('enterprise_billing'),
    endpoints: [rest('/enterprises/{enterprise}/settings/billing/cost-centers', { select: 'costCenters' })],
    renderer: table(col('name', 'Name'), col('id', 'ID', 'code'), col('state', 'State'), col('resources[].name', 'Resources', 'list')),
  },
  {
    id: 'enterprise-copilot-seats',
    scope: 'enterprise',
    section: 'Copilot',
    label: 'Copilot seats',
    requiredPermission: read('enterprise_copilot_licenses'),
    endpoints: [rest('/enterprises/{enterprise}/copilot/billing/seats', { paginate: true })],
    renderer: table(col('assignee.login', 'User', 'code'), col('plan_type', 'Plan'), col('assigning_team.slug', 'Via team'), col('last_activity_at', 'Last activity', 'date'), created),
  },
  {
    id: 'enterprise-ai-policies',
    scope: 'enterprise',
    section: 'Copilot',
    label: 'AI controls',
    requiredPermission: read('enterprise_ai_controls'),
    endpoints: [
      rest('/enterprises/{enterprise}/copilot/feature-policies', { title: 'Feature policies' }),
      rest('/enterprises/{enterprise}/copilot/model-policies', { title: 'Model policies' }),
      rest('/enterprises/{enterprise}/copilot/content_exclusion', { title: 'Content exclusion' }),
    ],
    renderer: keyValue,
  },
  {
    id: 'enterprise-copilot-metrics',
    scope: 'enterprise',
    section: 'Copilot',
    label: 'Copilot usage (28 days)',
    requiredPermission: read('enterprise_copilot_metrics'),
    endpoints: [rest('/enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest')],
    renderer: keyValue,
  },
];

# Permissions and pages

Generated from the feature registry (`src/core/registry/`) by `npm run gen:permissions`. Do not edit by hand.
Permission names and endpoint requirements are checked in CI against GitHub's own dataset
([github/docs@dd7d394b2d2b](https://github.com/github/docs/tree/dd7d394b2d2b43d3f4f51091026921d7f539f7e8/src/github-apps/data), the source of
"[Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)").

A page appears only when the installation holds the permission **and** a one-time check request to its endpoint answers 2xx or 304.
Everything is read-only: the app never needs a write permission.

## Enterprise (20 pages)

| Section | Page | Permission | Endpoints | Plan |
| --- | --- | --- | --- | --- |
| Overview | Profile | Not documented for GraphQL; shown when the check query succeeds | `POST /graphql` (query) |  |
| People | Members | Not documented for GraphQL; shown when the check query succeeds | `POST /graphql` (query) |  |
| People | Owners | Not documented for GraphQL; shown when the check query succeeds | `POST /graphql` (query) |  |
| People | Enterprise teams | Enterprise: Enterprise teams (`enterprise_teams`): read | `GET /enterprises/{enterprise}/teams` |  |
| People | Enterprise roles | Enterprise: Custom enterprise roles (`enterprise_custom_enterprise_roles`): read | `GET /enterprises/{enterprise}/enterprise-roles` |  |
| Identity provisioning | Provisioned users (SCIM) | Enterprise: Enterprise SCIM (`enterprise_scim`): read | `GET /scim/v2/enterprises/{enterprise}/Users` | Enterprise |
| Identity provisioning | Provisioned groups (SCIM) | Enterprise: Enterprise SCIM (`enterprise_scim`): read | `GET /scim/v2/enterprises/{enterprise}/Groups` | Enterprise |
| Organizations | Organizations | Enterprise: Enterprise organization installations (`enterprise_organization_installations`): read | `GET /enterprises/{enterprise}/apps/installable_organizations` |  |
| Policies | Repository and member policies | Not documented for GraphQL; shown when the check query succeeds | `POST /graphql` (query) |  |
| Policies | Repository custom properties | Enterprise: Custom properties (`enterprise_custom_properties`): read | `GET /enterprises/{enterprise}/properties/schema` |  |
| Policies | Organization custom properties | Enterprise: Enterprise custom properties for organizations (`enterprise_custom_properties_for_organizations`): read | `GET /enterprises/{enterprise}/org-properties/schema`<br>`GET /enterprises/{enterprise}/org-properties/values` |  |
| Authentication security | IP allow list | Not documented for GraphQL; shown when the check query succeeds | `POST /graphql` (query)<br>`POST /graphql` (query) |  |
| Authentication security | Single sign-on | Not documented for GraphQL; shown when the check query succeeds | `POST /graphql` (query) |  |
| Code security | Dependabot repository access | Enterprise: Enterprise security products (`enterprise_security_products`): read | `GET /enterprises/{enterprise}/dependabot/repository-access` |  |
| Billing and licensing | Usage summary | Enterprise: Enterprise billing (`enterprise_billing`): read | `GET /enterprises/{enterprise}/settings/billing/usage/summary` |  |
| Billing and licensing | Budgets | Enterprise: Enterprise billing (`enterprise_billing`): read | `GET /enterprises/{enterprise}/settings/billing/budgets` |  |
| Billing and licensing | Cost centers | Enterprise: Enterprise billing (`enterprise_billing`): read | `GET /enterprises/{enterprise}/settings/billing/cost-centers` |  |
| Copilot | Copilot seats | Enterprise: Enterprise Copilot license management (`enterprise_copilot_licenses`): read | `GET /enterprises/{enterprise}/copilot/billing/seats` |  |
| Copilot | AI controls | Enterprise: Enterprise AI controls (`enterprise_ai_controls`): read | `GET /enterprises/{enterprise}/copilot/feature-policies`<br>`GET /enterprises/{enterprise}/copilot/model-policies`<br>`GET /enterprises/{enterprise}/copilot/content_exclusion` |  |
| Copilot | Copilot usage (28 days) | Enterprise: Enterprise Copilot metrics (`enterprise_copilot_metrics`): read | `GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest` |  |

## Organization (29 pages)

| Section | Page | Permission | Endpoints | Plan |
| --- | --- | --- | --- | --- |
| General | Profile | Any installation on the account | `GET /orgs/{org}` |  |
| General | Immutable releases | Organization: Administration (`organization_administration`): read | `GET /orgs/{org}/settings/immutable-releases` |  |
| Access | Members | Organization: Members (`members`): read | `GET /orgs/{org}/members`<br>`GET /orgs/{org}/members?role=admin` |  |
| Access | Outside collaborators | Organization: Members (`members`): read | `GET /orgs/{org}/outside_collaborators` |  |
| Access | Pending invitations | Organization: Members (`members`): read | `GET /orgs/{org}/invitations` |  |
| Access | Teams | Organization: Members (`members`): read | `GET /orgs/{org}/teams` |  |
| Access | Organization roles | Organization: Custom organization roles (`organization_custom_org_roles`): read | `GET /orgs/{org}/organization-roles` |  |
| Access | Repository roles | Organization: Custom repository roles (`organization_custom_roles`): read, plus Administration (`organization_administration`) | `GET /orgs/{org}/custom-repository-roles` |  |
| Access | Security managers | Organization: Administration (`organization_administration`): read | `GET /orgs/{org}/security-managers` |  |
| Moderation | Blocked users | Organization: Blocking users (`organization_user_blocking`): read | `GET /orgs/{org}/blocks` |  |
| Actions | General | Organization: Administration (`organization_administration`): read | `GET /orgs/{org}/actions/permissions`<br>`GET /orgs/{org}/actions/permissions/workflow`<br>`GET /orgs/{org}/actions/permissions/selected-actions`<br>`GET /orgs/{org}/actions/permissions/artifact-and-log-retention`<br>`GET /orgs/{org}/actions/permissions/fork-pr-contributor-approval` |  |
| Actions | Self-hosted runners | Organization: Self-hosted runners (`organization_self_hosted_runners`): read | `GET /orgs/{org}/actions/runners` |  |
| Actions | Runner groups | Organization: Self-hosted runners (`organization_self_hosted_runners`): read | `GET /orgs/{org}/actions/runner-groups` |  |
| Actions | Larger hosted runners | Organization: Administration (`organization_administration`): read | `GET /orgs/{org}/actions/hosted-runners` |  |
| Secrets and variables | Actions secrets | Organization: Secrets (`organization_secrets`): read | `GET /orgs/{org}/actions/secrets` |  |
| Secrets and variables | Actions variables | Organization: Variables (`organization_actions_variables`): read | `GET /orgs/{org}/actions/variables` |  |
| Secrets and variables | Dependabot secrets | Organization: Organization dependabot secrets (`organization_dependabot_secrets`): read | `GET /orgs/{org}/dependabot/secrets` |  |
| Secrets and variables | Codespaces secrets | Organization: Organization codespaces secrets (`organization_codespaces_secrets`): read | `GET /orgs/{org}/codespaces/secrets` |  |
| Integrations | Webhooks | Organization: Webhooks (`organization_hooks`): read | `GET /orgs/{org}/hooks` |  |
| Integrations | Installed GitHub Apps | Organization: Administration (`organization_administration`): read | `GET /orgs/{org}/installations` |  |
| Integrations | Private registries | Organization: Organization private registries (`organization_private_registries`): read | `GET /orgs/{org}/private-registries` |  |
| Repository | Custom properties | Organization: Custom properties (`organization_custom_properties`): read | `GET /orgs/{org}/properties/schema` |  |
| Planning | Issue types | Organization: Issue Types (`issue_types`): read | `GET /orgs/{org}/issue-types` |  |
| Code security | Configurations | Organization: Administration (`organization_administration`): read | `GET /orgs/{org}/code-security/configurations`<br>`GET /orgs/{org}/code-security/configurations/defaults` |  |
| Logs | Audit log | Organization: Administration (`organization_administration`): read | `GET /orgs/{org}/audit-log` | Enterprise Cloud |
| Authentication security | IP allow list | Not documented for GraphQL; shown when the check query succeeds | `POST /graphql` (query)<br>`POST /graphql` (query) | Enterprise Cloud |
| Authentication security | SAML single sign-on | Not documented for GraphQL; shown when the check query succeeds | `POST /graphql` (query) | Enterprise Cloud |
| Copilot | Copilot settings | Organization: GitHub Copilot Business (`organization_copilot_seat_management`): read, plus Administration (`organization_administration`) | `GET /orgs/{org}/copilot/billing` |  |
| Copilot | Copilot seats | Organization: GitHub Copilot Business (`organization_copilot_seat_management`): read, plus Administration (`organization_administration`) | `GET /orgs/{org}/copilot/billing/seats` |  |

## Repository (19 pages)

| Section | Page | Permission | Endpoints | Plan |
| --- | --- | --- | --- | --- |
| General | General | Repository: Metadata (`metadata`): read | `GET /repos/{owner}/{repo}` |  |
| General | Custom properties | Repository: Metadata (`metadata`): read | `GET /repos/{owner}/{repo}/properties/values` |  |
| General | Immutable releases | Repository: Administration (`administration`): read | `GET /repos/{owner}/{repo}/immutable-releases` |  |
| Access | Collaborators | Repository: Metadata (`metadata`): read | `GET /repos/{owner}/{repo}/collaborators` |  |
| Access | Teams | Repository: Administration (`administration`): read | `GET /repos/{owner}/{repo}/teams` |  |
| Access | Pending invitations | Repository: Administration (`administration`): read | `GET /repos/{owner}/{repo}/invitations` |  |
| Code and automation | Rulesets | Repository: Metadata (`metadata`): read | `GET /repos/{owner}/{repo}/rulesets?includes_parents=true` |  |
| Code and automation | Branch protection | Repository: Administration (`administration`): read, plus Contents (`contents`) | `GET /repos/{owner}/{repo}/branches/{branch}/protection`<br>`GET /repos/{owner}/{repo}/branches?protected=true` |  |
| Actions | General | Repository: Administration (`administration`): read | `GET /repos/{owner}/{repo}/actions/permissions`<br>`GET /repos/{owner}/{repo}/actions/permissions/workflow`<br>`GET /repos/{owner}/{repo}/actions/permissions/selected-actions`<br>`GET /repos/{owner}/{repo}/actions/permissions/access`<br>`GET /repos/{owner}/{repo}/actions/permissions/artifact-and-log-retention`<br>`GET /repos/{owner}/{repo}/actions/permissions/fork-pr-contributor-approval` |  |
| Actions | Self-hosted runners | Repository: Administration (`administration`): read | `GET /repos/{owner}/{repo}/actions/runners` |  |
| Actions | Environments | Repository: Actions (`actions`): read | `GET /repos/{owner}/{repo}/environments` |  |
| Secrets and variables | Actions secrets | Repository: Secrets (`secrets`): read | `GET /repos/{owner}/{repo}/actions/secrets` |  |
| Secrets and variables | Actions variables | Repository: Variables (`actions_variables`): read | `GET /repos/{owner}/{repo}/actions/variables` |  |
| Secrets and variables | Dependabot secrets | Repository: Dependabot secrets (`dependabot_secrets`): read | `GET /repos/{owner}/{repo}/dependabot/secrets` |  |
| Integrations | Webhooks | Repository: Webhooks (`repository_hooks`): read | `GET /repos/{owner}/{repo}/hooks` |  |
| Security | Deploy keys | Repository: Administration (`administration`): read | `GET /repos/{owner}/{repo}/keys` |  |
| Security | Advanced security | Repository: Administration (`administration`): read, plus Metadata (`metadata`) | `GET /repos/{owner}/{repo}/code-security-configuration`<br>`GET /repos/{owner}/{repo}/vulnerability-alerts`<br>`GET /repos/{owner}/{repo}/automated-security-fixes`<br>`GET /repos/{owner}/{repo}/private-vulnerability-reporting`<br>`GET /repos/{owner}/{repo}/code-scanning/default-setup` |  |
| Integrations | Autolink references | Repository: Administration (`administration`): read | `GET /repos/{owner}/{repo}/autolinks` |  |
| Pages | Pages | Repository: Pages (`pages`): read | `GET /repos/{owner}/{repo}/pages` |  |

## Not shown, and why

These settings exist in GitHub's UI, but a read-only GitHub App can't read them, so the viewer has no page for them:

| Setting | Why |
| --- | --- |
| Enterprise audit log | The REST endpoint needs a personal access token, and GraphQL has no enterprise audit log field. The organization audit log is available. |
| Enterprise and organization rulesets | `GET` requires Enterprise Ruleset / Organization Administration **write**. Repository pages list inherited rulesets instead (`includes_parents=true`, Metadata read). |
| Enterprise Actions and repository policies (REST) | Not available to GitHub Apps. Repository-related enterprise policies are shown through GraphQL where the check query succeeds. |
| Tag protection | The API was removed; rulesets replace it. |
| Secret and variable values | Never shown. GitHub doesn't return secret values; variable values are removed on the server. |
| SAML recovery codes | Never requested. |

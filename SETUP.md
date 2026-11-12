# Setting up the GitHub App

gh-settings-viewer reads through **one GitHub App that has read-only permissions only**. The quickest path is:

```sh
npx gh-settings-viewer init
```

This page covers what `init` does, how to do each step by hand, and the enterprise cases the wizard can't automate.

## Which kind of app?

| You want to see | App owner | How to create it |
| --- | --- | --- |
| Organization and repository settings | An organization (or your personal account) | `init` → *Create a new read-only app* (manifest flow) |
| Also enterprise settings | The enterprise, or an organization in it | Manifest flow, then add enterprise permissions by hand; or create an enterprise-owned app by hand (below) |

GitHub's App Manifest flow **can't create enterprise-owned apps and can't set enterprise permissions** (per the [manifest docs](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest)). Enterprise permissions always take one manual step.

## Option A: the manifest flow (`init`)

1. `init` asks where your GitHub is (github.com, GHE.com or GitHub Enterprise Server) and who should own the app.
2. It starts a temporary server on `127.0.0.1` and opens your browser. That page posts a manifest to GitHub's *Create GitHub App* page. The manifest:
   - requests **every repository, organization and account permission that has a read-only level, all set to read**;
   - is private (`public: false`), with no webhook (`active: false`) and no event subscriptions.
3. You confirm the name on GitHub. GitHub then redirects back to the temporary server with a one-time code, which `init` exchanges (`POST /app-manifests/{code}/conversions`) for the App ID, client ID and private key. The client secret and webhook secret GitHub also returns are discarded. GitHub requires this whole flow to finish within an hour.
4. The key is saved as a `0600` file in your config directory (or in the OS keychain if keytar is available), and `config.json` gets the IDs and the key's location.
5. `init` runs `doctor`, then prints the install link and any organizations that still lack an installation.

## Option B: create the app by hand

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**. For an organization-owned app, start from the organization's settings instead.
2. **Homepage URL:** `https://github.com/darkmastermindz/gh-settings-viewer` (any URL works).
3. **Webhook:** clear **Active**.
4. **Permissions:** set each permission you want to see to **Read-only**, and never to *Read and write*. [docs/permissions.md](docs/permissions.md) lists which permission unlocks which page. Leaving a permission at *No access* simply hides its pages.
5. **Where can this app be installed:** *Only on this account* is fine for a single organization. Choose *Any account* if it must be installed on other organizations in your enterprise.
6. Create the app. Note the **App ID** and **Client ID**, then **Generate a private key** and download the `.pem`.
7. Run `npx gh-settings-viewer init`, choose *Use an app I already have*, and give it the IDs and the key path. Or set the environment variables in [.env.example](.env.example).

## Enterprise-owned app

Only enterprise owners can do this.

1. Open `https://github.com/enterprises/YOUR-ENTERPRISE/settings/apps/new` (**Enterprise settings → GitHub Apps → New GitHub App**).
2. Fill in the app as in Option B, steps 2 to 4.
3. Under **Enterprise permissions**, set each one you want to see to **Read-only**. The ones the viewer uses are Enterprise teams, Custom enterprise roles, Enterprise SCIM, Enterprise organization installations, Custom properties, Enterprise custom properties for organizations, Enterprise security products, Enterprise billing, Enterprise Copilot license management, Enterprise AI controls and Enterprise Copilot metrics.
4. Generate a private key, then run `init` → *Use an app I already have*. The wizard's third option prints these same steps.

To add enterprise permissions to an organization-owned app created with the manifest flow, open the app's **Permissions & events** page, set the enterprise permissions to **Read-only**, and save.

> An app that holds **Enterprise organization installations** can only be installed on the enterprise that owns it. On GHES and Enterprise Managed Users enterprises, apps owned by the enterprise's users count as inside the enterprise.

## Installing the app

Enterprise and organization installations are separate:

- **On the enterprise.** Enterprise owners only: open the app's install page (`https://github.com/apps/APP-SLUG/installations/new`) and choose your enterprise. An enterprise installation grants **enterprise permissions only**: no organization or repository access.
- **On each organization** whose settings you want to see. Pick *All repositories* to see every repo's settings, or *Only select repositories* to limit them. Organization owners can install from the same link; enterprise owners can see which organizations are missing in `doctor` or on the App & permissions page.

After installing, or after changing permissions (each organization must accept the change), press **Refresh capabilities** in the viewer. New pages appear without a restart.

## GitHub Enterprise Server and GHE.com

- **GHES:** `GITHUB_API_URL=https://github.example.com/api/v3`. GraphQL is read from `https://github.example.com/api/graphql`.
- **GHE.com (data residency):** `GITHUB_API_URL=https://api.SUBDOMAIN.ghe.com`.
- Older GHES versions may not know every permission the manifest requests. If GitHub rejects the manifest, create the app by hand (Option B).

## Checking the setup

```sh
npx gh-settings-viewer doctor
```

`doctor` shows:
- the app's permissions, with a loud warning if any is a write permission;
- every installation, with its token status and time left;
- how many pages each installation can show;
- the install link, and which enterprise organizations still lack an installation.

It exits with `0` when the app is read-only and ready, `2` when it holds write permissions, and `1` when it can't authenticate.

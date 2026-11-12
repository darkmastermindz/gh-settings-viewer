# gh-settings-viewer

[![npm](https://img.shields.io/npm/v/gh-settings-viewer)](https://www.npmjs.com/package/gh-settings-viewer)

A read-only, local-only developer tool that shows your GitHub **enterprise, organization and repository settings** in a familiar Settings layout. It reads through a GitHub App that has read-only permissions, and it shows **only what that app can actually read**: no greyed-out pages and no "not available" placeholders.

```sh
npx gh-settings-viewer init   # set up the read-only GitHub App (once)
npx gh-settings-viewer        # start the viewer and open it in your browser
```

Needs Node.js 26 (the current LTS) or newer. Runs on macOS, Linux and Windows.

## What you get

- **Pages from discovery.** At startup, and whenever you press **Refresh capabilities**, the viewer reads the app's granted permissions and its installations. It then checks each candidate page once with a cheap request. A page appears only if that check succeeds, and availability is worked out per organization, so a page can show for one org and not another.
- **Enterprise, organization and repository settings**: members, teams and roles, Actions policies and runners, secrets and variables (names and dates only), webhooks, installed apps, code security configurations, custom properties, the audit log, Copilot, rulesets (including inherited ones), environments, deploy keys, Pages and more. The full list, with the permission each page needs, is in [docs/permissions.md](docs/permissions.md).
- **On every page:** a Raw JSON toggle, *Copy as curl (redacted)* with the exact endpoint, the time each part was fetched, a manual refresh, export to JSON or CSV, and a rate-limit banner with the reset time.
- **Compare** the same page across organizations or repositories (only pages available for all of them), and export the diff.
- **Jump box** (press <kbd>/</kbd>) over every discovered scope and page.
- **App & permissions** page: the app's granted permissions, its installations, each installation token's status and time left, rate limits, and organizations still missing an installation.
- **Installable PWA**, light and dark themes that follow your system, and phone-friendly layouts. The service worker caches only the static shell, never settings data.

## Commands

| Command | What it does |
| --- | --- |
| `npx gh-settings-viewer init` | Setup wizard: create a new read-only app with GitHub's App Manifest flow, or use an existing app. Then runs `doctor` and prints the install link. |
| `npx gh-settings-viewer` (or `start`) | Starts the local server and opens your browser. |
| `npx gh-settings-viewer doctor` | Prints granted permissions, installations and token status, and warns about any write permission. `--json` for scripts. |

| Flag | Default | |
| --- | --- | --- |
| `--port <n>` | `4783` | Uses the next free port if it's busy. |
| `--host <addr>` | `127.0.0.1` | Non-loopback addresses are refused unless you add `--unsafe-bind`. |
| `--no-open` | | Don't open the browser. |
| `--config <path>` | per-user `config.json` | |
| `--app-id`, `--client-id`, `--enterprise`, `--api-url`, `--private-key-path` | | Override config for one run. |

### Configuration

Settings are resolved in this order: **flags**, then **environment variables**, then **config.json**.

| Setting | Env var | config.json |
| --- | --- | --- |
| App ID | `GITHUB_APP_ID` | `appId` |
| Client ID (preferred JWT issuer) | `GITHUB_APP_CLIENT_ID` | `clientId` |
| Private key | `GITHUB_APP_PRIVATE_KEY` (PEM text) or `GITHUB_APP_PRIVATE_KEY_PATH` | `privateKeyPath` (or the OS keychain) |
| Enterprise slug | `GITHUB_ENTERPRISE_SLUG` | `enterpriseSlug` |
| API base URL (GHES, GHE.com) | `GITHUB_API_URL` | `apiBaseUrl` |

Files live in a per-user directory (`~/.config/gh-settings-viewer/` on Linux, `~/Library/Preferences/gh-settings-viewer/` on macOS, `%APPDATA%\gh-settings-viewer\Config` on Windows):

- `config.json`: IDs, URLs and the key's location. Never a secret.
- `private-key.pem`: written with `0600` permissions. If [keytar](https://www.npmjs.com/package/keytar) can be loaded, `init` offers to keep the key in your OS keychain instead.
- `cache.sqlite` (in the cache directory): settings responses and ETags. Never tokens or keys.

See [.env.example](.env.example) and [SETUP.md](SETUP.md) (creating the app by hand, enterprise-owned apps, and installing on the enterprise and each organization).

## Security model

- **Read-only by construction.** The GitHub client allows only `GET`, plus `POST /graphql` for queries; mutations are rejected before anything is sent. The one other request, minting installation tokens, lives in a separate auth module that takes an installation ID, never a path. The app should hold read permissions only: `doctor`, startup and the App & permissions page warn loudly if it holds any write permission.
- **Secrets stay on the server.** All GitHub calls happen in the local server process. The private key, app JWT and installation tokens never reach the browser. Tokens are kept in memory only, never in SQLite, logs or config, and token-like strings are redacted in logs and the UI.
- **Token lifecycle.** An installation token is minted the first time a page needs it, reused until GitHub's `expires_at` (minus 60 seconds), and minted again only after that. No timers or background refresh. Concurrent requests share one mint. A `401` triggers exactly one re-mint and one retry. The app JWT (`iat` 60 s in the past, 9-minute lifetime) is reused until about 30 s before it expires.
- **Local only.** The server binds to `127.0.0.1`. It checks the `Host` and `Origin` headers to block DNS rebinding and cross-site requests. Each launch makes a random session token, which arrives once in the opened URL and is then kept in an `HttpOnly`, `SameSite=Strict` cookie. Pages get a strict nonce-based Content Security Policy, and the viewer loads no third-party scripts and sends no analytics or telemetry.
- **Updates.** At most once a day, the CLI asks the npm registry whether a newer version exists and prints a notice. It doesn't block startup. Turn it off with `NO_UPDATE_NOTIFIER=1`.

## Development

```sh
npm install
npm run dev              # Next.js dev server on http://127.0.0.1:4783 (uses your config/env)
npm test                 # unit and security tests (node:test, mocked clock and GitHub)
npm run lint && npm run typecheck
npm run check:registry   # the registry vs GitHub's permissions dataset
npm run gen:permissions  # regenerate docs/permissions.md
npm run build            # dist/cli (compiled CLI) + dist/web (Next.js standalone)
npm run verify:pack      # pack, then run the tarball with npx in a clean directory against a mock GitHub
```

To try the packed tarball by hand:

```sh
npm run build
npm pack                              # → gh-settings-viewer-<version>.tgz
cd "$(mktemp -d)"
npx --package=/path/to/gh-settings-viewer-<version>.tgz gh-settings-viewer --version
npx --package=/path/to/gh-settings-viewer-<version>.tgz gh-settings-viewer doctor
npx --package=/path/to/gh-settings-viewer-<version>.tgz gh-settings-viewer
```

The page registry is in `src/core/registry/`. Each page declares its scope, sidebar section, the permission it needs, its endpoints and how to render them. The sidebar, breadcrumbs, search, compare view and exports are all generated from it. `data/github-app-permissions.json` is GitHub's own permissions dataset (refresh it with `npm run update:permissions-data`), and CI checks the registry against it.

### Releasing

Same flow as [line-commenter-tool](https://github.com/darkmastermindz/line-commenter-tool):

1. Run the **Bump Version** workflow with the new version. It opens a PR.
2. Merge it, then create a GitHub release.
3. **Node.js Package** checks the version isn't already published, runs the tests, waits for your npm one-time password, and publishes. The build runs in `prepack`.

## License

[Apache-2.0](LICENSE)

# Working on gh-settings-viewer

## Pull requests
- Whenever you push to a branch that has an open pull request, update that PR's description in the same step so it always matches what is on the branch.
- Follow `.github/PULL_REQUEST_TEMPLATE.md` (Summary, Related Issue, Changes Made, How to Test, Additional Notes).

## Checks
- Run `npm run lint`, `npm run typecheck` and `npm test` before pushing. Run `npm run build && npm run verify:pack` when packaging, the CLI or the server changes.
- The tests use Node's built-in runner with native TypeScript (`node --test`), a fake clock and a fake GitHub (`tests/helpers/`).

## Rules that keep the tool safe
- The general GitHub client (`src/core/github/client.ts`) is read-only. Don't add methods or paths to it; the token mint stays in `src/core/auth/mint.ts`.
- Never send tokens, JWTs or keys to the browser, the cache, logs or config. Route anything user-visible through `redact`/`redactDeep`.
- Validate URL input with `src/core/security/validate.ts`, and look up registry entries by ID only (`getFeature`).
- When you add a new way for outside input to reach the viewer (route params, query strings, config, API fields rendered or exported), add payloads to `tests/security/payloads.mjs` and a test.

## Adding a page
- Add it to the registry in `src/core/registry/` with the permission GitHub lists for its endpoint (read only), then run `npm run check:registry` and `npm run gen:permissions`.
- Pages appear only after discovery's probe passes: never add placeholders for pages the app can't read.
- Secrets and variables: names and metadata only (use `omit` for value fields).

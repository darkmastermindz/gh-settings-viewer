# Security Policy

## Supported versions

The latest published version of `gh-settings-viewer` gets security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/darkmastermindz/gh-settings-viewer/security/advisories/new) rather than in a public issue. Include steps to reproduce and the version you tested.

## What the tool protects

- The GitHub App's private key, app JWTs and installation tokens stay in the local server process. They're never sent to the browser, written to the cache, or logged.
- The GitHub client is read-only: `GET`, plus GraphQL queries. Mutations, other methods and app-level endpoints are refused before anything is sent.
- The local server binds to loopback, checks the Host and Origin headers, needs a per-launch session token, and serves a strict Content Security Policy.

Use an app with **read-only** permissions. `npx gh-settings-viewer doctor` warns about any write permission.

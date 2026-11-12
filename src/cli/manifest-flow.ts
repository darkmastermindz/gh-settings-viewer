// GitHub App Manifest flow: a temporary localhost page posts the manifest to GitHub, GitHub redirects back
// with a one-time code, and the code is exchanged for the app's ID and private key.
// Manifests can create personal or organization-owned apps only, and can't set enterprise permissions.
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { MANIFEST_READ_PERMISSIONS } from '../core/registry/manifest-permissions.ts';

export const HOMEPAGE = 'https://github.com/darkmastermindz/gh-settings-viewer';

export function buildManifest(name: string, redirectUrl: string) {
  return {
    name,
    url: HOMEPAGE,
    description: 'Read-only: used by gh-settings-viewer, a local tool that displays settings. Holds read permissions only.',
    public: false,
    redirect_url: redirectUrl,
    hook_attributes: { url: HOMEPAGE, active: false },
    default_events: [] as string[],
    request_oauth_on_install: false,
    default_permissions: Object.fromEntries(MANIFEST_READ_PERMISSIONS.map((p) => [p.name, 'read'])),
  };
}

export function registrationUrl(webBaseUrl: string, owner: { type: 'user' } | { type: 'org'; login: string }, state: string): string {
  const path = owner.type === 'org' ? `/organizations/${encodeURIComponent(owner.login)}/settings/apps/new` : '/settings/apps/new';
  return `${webBaseUrl}${path}?state=${encodeURIComponent(state)}`;
}

export interface Conversion {
  id: number;
  slug: string;
  clientId?: string;
  pem: string;
  owner?: string;
  htmlUrl?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Runs the flow. Resolves with the new app's credentials (the client and webhook secrets are discarded). */
export async function runManifestFlow(opts: { apiBaseUrl: string; webBaseUrl: string; owner: { type: 'user' } | { type: 'org'; login: string }; appName: string; onUrl: (url: string) => void; timeoutMs?: number }): Promise<Conversion> {
  const state = randomBytes(24).toString('base64url');
  let server: Server | undefined;
  try {
    return await new Promise<Conversion>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for GitHub. GitHub requires the flow to finish within an hour; run init again.')), opts.timeoutMs ?? 60 * 60_000);
      server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const host = req.headers.host ?? '';
        if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
          res.writeHead(421).end();
          return;
        }
        const nonce = randomBytes(16).toString('base64');
        const headers = {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action ${new URL(opts.webBaseUrl).origin}; base-uri 'none'; frame-ancestors 'none'`,
        };
        const style = `<style nonce="${nonce}">body{font:16px system-ui;margin:3rem auto;max-width:40rem;padding:0 1rem;color-scheme:light dark}button{font:inherit;padding:.5rem 1rem}</style>`;
        if (url.pathname === '/start') {
          const redirect = `http://${host}/callback`;
          const manifest = JSON.stringify(buildManifest(opts.appName, redirect));
          res.writeHead(200, headers).end(`<!doctype html><meta charset="utf-8"><title>Create GitHub App</title>${style}
<h1>Create the read-only GitHub App</h1><p>You'll be taken to GitHub to confirm the app's name. Every permission it requests is read-only.</p>
<form id="f" method="post" action="${esc(registrationUrl(opts.webBaseUrl, opts.owner, state))}"><input type="hidden" name="manifest" value="${esc(manifest)}"><button type="submit">Continue to GitHub</button></form>
<script nonce="${nonce}">document.getElementById('f').submit()</script>`);
          return;
        }
        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          if (url.searchParams.get('state') !== state || !code || !/^[A-Za-z0-9_-]{1,100}$/.test(code)) {
            res.writeHead(400, headers).end(`<!doctype html><meta charset="utf-8">${style}<h1>That link doesn't match this setup</h1><p>Return to the terminal and run init again.</p>`);
            return;
          }
          try {
            const conv = await exchangeCode(opts.apiBaseUrl, code);
            res.writeHead(200, headers).end(`<!doctype html><meta charset="utf-8"><title>App created</title>${style}<h1>App created</h1><p><strong>${esc(conv.slug)}</strong> is registered. Return to the terminal to finish setup; you can close this tab.</p>`);
            clearTimeout(timer);
            resolve(conv);
          } catch (e) {
            res.writeHead(502, headers).end(`<!doctype html><meta charset="utf-8">${style}<h1>Couldn't finish</h1><p>${esc((e as Error).message)}</p>`);
            clearTimeout(timer);
            reject(e);
          }
          return;
        }
        res.writeHead(404).end();
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server!.address();
        if (addr && typeof addr === 'object') opts.onUrl(`http://127.0.0.1:${addr.port}/start`);
      });
    });
  } finally {
    server?.close();
    server?.closeAllConnections();
  }
}

/** POST /app-manifests/{code}/conversions (no auth). Part of setup only; never reachable from the viewer. */
export async function exchangeCode(apiBaseUrl: string, code: string, doFetch: typeof fetch = fetch): Promise<Conversion> {
  const res = await doFetch(`${apiBaseUrl}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: 'POST',
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'gh-settings-viewer' },
  });
  if (!res.ok) throw new Error(`GitHub rejected the code (${res.status}). The code is single-use and expires after an hour; run init again.`);
  const b = (await res.json()) as { id: number; slug: string; client_id?: string; pem: string; owner?: { login?: string }; html_url?: string };
  if (!b.id || !b.pem) throw new Error('GitHub did not return an app ID and private key');
  return { id: b.id, slug: b.slug, clientId: b.client_id, pem: b.pem, owner: b.owner?.login, htmlUrl: b.html_url };
}

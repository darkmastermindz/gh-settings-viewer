// The ONLY non-GET request this tool makes to GitHub with app credentials:
// POST /app/installations/{installation_id}/access_tokens.
// This module is deliberately not re-exported anywhere, and it takes an installation ID, never a path,
// so it can't be pointed at any other endpoint. The general client (core/github/client.ts) refuses /app paths.
import type { AppJwt } from './jwt.ts';
import { errorMessage, GitHubHttpError, jsonHeaders, type FetchLike } from './http.ts';

export interface MintedToken {
  token: string;
  /** From GitHub's `expires_at`, in ms. Never assumed. */
  expiresAt: number;
  permissions: Record<string, string>;
  repositorySelection?: string;
}

export type Minter = (installationId: number) => Promise<MintedToken>;

export function createMinter(opts: { apiBaseUrl: string; jwt: AppJwt; fetch?: FetchLike }): Minter {
  const doFetch = opts.fetch ?? fetch;
  return async (installationId: number) => {
    if (!Number.isSafeInteger(installationId) || installationId <= 0) throw new Error('Invalid installation ID');
    const endpoint = `POST /app/installations/${installationId}/access_tokens`;
    const res = await doFetch(`${opts.apiBaseUrl}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: jsonHeaders(`Bearer ${opts.jwt.get()}`),
      // No body: the token gets the installation's own permissions and repositories.
    });
    if (!res.ok) throw new GitHubHttpError(res.status, endpoint, `Could not mint an installation token: ${res.status} ${await errorMessage(res)}`);
    const body = (await res.json()) as { token?: string; expires_at?: string; permissions?: Record<string, string>; repository_selection?: string };
    const expiresAt = body.expires_at ? Date.parse(body.expires_at) : NaN;
    if (!body.token || !Number.isFinite(expiresAt)) throw new GitHubHttpError(502, endpoint, 'GitHub returned a token without expires_at');
    return { token: body.token, expiresAt, permissions: body.permissions ?? {}, repositorySelection: body.repository_selection };
  };
}

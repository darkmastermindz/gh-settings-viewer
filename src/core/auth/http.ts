// Shared bits for the app-level (JWT) requests. Not used by the installation-token client.
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const API_VERSION = '2022-11-28';
export const USER_AGENT = 'gh-settings-viewer';

export class GitHubHttpError extends Error {
  status: number;
  endpoint: string;
  constructor(status: number, endpoint: string, message: string) {
    super(message);
    this.name = 'GitHubHttpError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

export function jsonHeaders(authorization: string): Record<string, string> {
  return {
    accept: 'application/vnd.github+json',
    authorization,
    'user-agent': USER_AGENT,
    'x-github-api-version': API_VERSION,
  };
}

export async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

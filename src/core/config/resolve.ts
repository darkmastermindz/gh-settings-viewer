import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { appPaths } from './paths.ts';

/** What config.json may hold. Never a key, token or secret. */
/** Environment variables (a plain record, so tests can pass their own). */
export type Env = Record<string, string | undefined>;

export interface FileConfig {
  appId?: string;
  clientId?: string;
  enterpriseSlug?: string;
  apiBaseUrl?: string;
  privateKeyPath?: string;
  /** The private key is in the OS keychain (keytar), not a file. */
  privateKeyInKeychain?: boolean;
}

export interface ConfigFlags {
  config?: string;
  appId?: string;
  clientId?: string;
  enterprise?: string;
  apiUrl?: string;
  privateKeyPath?: string;
}

export type Source = 'flag' | 'env' | 'file' | 'default';

export type PrivateKeySource =
  | { kind: 'env'; pem: string }
  | { kind: 'path'; path: string; from: Source }
  | { kind: 'keychain' }
  | { kind: 'none' };

export interface ResolvedConfig {
  configPath: string;
  appId?: string;
  clientId?: string;
  enterpriseSlug?: string;
  apiBaseUrl: string;
  webBaseUrl: string;
  graphqlUrl: string;
  privateKey: PrivateKeySource;
  sources: Partial<Record<'appId' | 'clientId' | 'enterpriseSlug' | 'apiBaseUrl' | 'privateKey', Source>>;
}

export const DEFAULT_API_BASE_URL = 'https://api.github.com';
const SECRET_KEYS = /secret|token|pem|password/i;

export function readFileConfig(path: string): FileConfig {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${path} must hold a JSON object`);
  const c = parsed as Record<string, unknown>;
  const str = (k: string) => (typeof c[k] === 'string' && c[k] !== '' ? (c[k] as string) : typeof c[k] === 'number' ? String(c[k]) : undefined);
  return {
    appId: str('appId'),
    clientId: str('clientId'),
    enterpriseSlug: str('enterpriseSlug'),
    apiBaseUrl: str('apiBaseUrl'),
    privateKeyPath: str('privateKeyPath'),
    privateKeyInKeychain: c.privateKeyInKeychain === true,
  };
}

export function writeFileConfig(path: string, config: FileConfig): void {
  for (const k of Object.keys(config)) if (SECRET_KEYS.test(k) && k !== 'privateKeyPath' && k !== 'privateKeyInKeychain') throw new Error(`Refusing to write ${k} to config.json`);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const clean = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined && v !== ''));
  writeFileSync(path, JSON.stringify(clean, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Resolution order, per field: CLI flags, then environment variables, then config.json, then defaults.
 */
export function resolveConfig(flags: ConfigFlags = {}, env: Env = process.env, loadFile: (path: string) => FileConfig = readFileConfig): ResolvedConfig {
  const configPath = flags.config ?? appPaths(env).configFile;
  const file = loadFile(configPath);
  const sources: ResolvedConfig['sources'] = {};

  const pick = <K extends keyof ResolvedConfig['sources']>(field: K, flag: string | undefined, envVal: string | undefined, fileVal: string | undefined): string | undefined => {
    if (nonEmpty(flag)) return (sources[field] = 'flag'), flag!.trim();
    if (nonEmpty(envVal)) return (sources[field] = 'env'), envVal!.trim();
    if (nonEmpty(fileVal)) return (sources[field] = 'file'), fileVal!.trim();
    return undefined;
  };

  const appId = pick('appId', flags.appId, env.GITHUB_APP_ID, file.appId);
  const clientId = pick('clientId', flags.clientId, env.GITHUB_APP_CLIENT_ID, file.clientId);
  const enterpriseSlug = pick('enterpriseSlug', flags.enterprise, env.GITHUB_ENTERPRISE_SLUG, file.enterpriseSlug);
  let apiBaseUrl = pick('apiBaseUrl', flags.apiUrl, env.GITHUB_API_URL, file.apiBaseUrl);
  if (!apiBaseUrl) {
    apiBaseUrl = DEFAULT_API_BASE_URL;
    sources.apiBaseUrl = 'default';
  }
  apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);

  let privateKey: PrivateKeySource = { kind: 'none' };
  if (nonEmpty(flags.privateKeyPath)) privateKey = { kind: 'path', path: flags.privateKeyPath!, from: 'flag' };
  else if (nonEmpty(env.GITHUB_APP_PRIVATE_KEY)) privateKey = { kind: 'env', pem: env.GITHUB_APP_PRIVATE_KEY! };
  else if (nonEmpty(env.GITHUB_APP_PRIVATE_KEY_PATH)) privateKey = { kind: 'path', path: env.GITHUB_APP_PRIVATE_KEY_PATH!, from: 'env' };
  else if (file.privateKeyInKeychain) privateKey = { kind: 'keychain' };
  else if (nonEmpty(file.privateKeyPath)) privateKey = { kind: 'path', path: file.privateKeyPath!, from: 'file' };
  if (privateKey.kind !== 'none') sources.privateKey = privateKey.kind === 'path' ? privateKey.from : privateKey.kind === 'env' ? 'env' : 'file';

  return { configPath, appId, clientId, enterpriseSlug, apiBaseUrl, ...deriveUrls(apiBaseUrl), privateKey, sources };
}

function nonEmpty(v: string | undefined): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

export function normalizeApiBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`GITHUB_API_URL "${raw}" is not a valid URL`);
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('The GitHub API URL must use https');
  if (url.username || url.password) throw new Error('The GitHub API URL must not contain credentials');
  if (url.search || url.hash) throw new Error('The GitHub API URL must not contain a query or fragment');
  return url.toString().replace(/\/+$/, '');
}

/**
 * github.com: api.github.com → github.com. GHE.com (data residency): api.SUBDOMAIN.ghe.com → SUBDOMAIN.ghe.com.
 * GHES: https://HOST/api/v3 → https://HOST, with GraphQL at /api/graphql.
 */
export function deriveUrls(apiBaseUrl: string): { webBaseUrl: string; graphqlUrl: string } {
  const url = new URL(apiBaseUrl);
  if (url.hostname === 'api.github.com') return { webBaseUrl: 'https://github.com', graphqlUrl: 'https://api.github.com/graphql' };
  if (url.hostname.startsWith('api.') && url.hostname.endsWith('.ghe.com')) {
    return { webBaseUrl: `https://${url.hostname.slice(4)}`, graphqlUrl: `${url.origin}/graphql` };
  }
  if (url.pathname.replace(/\/+$/, '').endsWith('/api/v3')) {
    const base = url.pathname.replace(/\/api\/v3\/?$/, '');
    return { webBaseUrl: `${url.origin}${base}`, graphqlUrl: `${url.origin}${base}/api/graphql` };
  }
  return { webBaseUrl: url.origin, graphqlUrl: `${apiBaseUrl}/graphql` };
}

/** The JWT issuer: GitHub recommends the client ID; the app ID also works. */
export function jwtIssuer(config: Pick<ResolvedConfig, 'appId' | 'clientId'>): string {
  const iss = config.clientId ?? config.appId;
  if (!iss) throw new Error('No GitHub App configured. Run `npx gh-settings-viewer init`, or set GITHUB_APP_ID / GITHUB_APP_CLIENT_ID.');
  return iss;
}

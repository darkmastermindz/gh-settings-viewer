import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createAppApi } from '../core/auth/app-api.ts';
import { systemClock } from '../core/auth/clock.ts';
import { AppJwt } from '../core/auth/jwt.ts';
import { loadPrivateKey } from '../core/config/load-key.ts';
import { jwtIssuer, type ResolvedConfig } from '../core/config/resolve.ts';
import { writePermissionsOf } from '../core/discovery/discover.ts';
import { allowedHosts, isLoopbackHost } from '../core/security/host-origin.ts';
import { redact } from '../core/security/redact.ts';
import { newSessionToken } from '../core/security/session-token.ts';
import type { CliArgs } from './args.ts';
import { c } from './colors.ts';
import { openBrowser } from './open-browser.ts';
import { findFreePort } from './ports.ts';
import { checkForUpdate } from './update-check.ts';
import { packageInfo } from './version.ts';

export function serverEntry(): string {
  return join(packageInfo().root, 'dist', 'web', 'server.js');
}

/** Startup self-check with the app JWT only (no installation tokens are minted here). */
async function selfCheck(config: ResolvedConfig, pem?: string): Promise<void> {
  try {
    const key = await loadPrivateKey(pem ? { ...config, privateKey: { kind: 'env', pem } } : config);
    for (const w of key.warnings) console.warn(c.yellow(`⚠ ${w}`));
    const api = createAppApi({ apiBaseUrl: config.apiBaseUrl, jwt: new AppJwt(key.key, jwtIssuer(config), systemClock) });
    const [app, installs] = await Promise.all([api.getApp(), api.listInstallations()]);
    const writes = [...new Set([...writePermissionsOf(app.permissions), ...installs.flatMap((i) => writePermissionsOf(i.permissions))])];
    if (writes.length) {
      console.warn(c.red(c.bold(`\n⚠⚠ THIS APP HOLDS WRITE PERMISSIONS: ${writes.join(', ')}`)));
      console.warn(c.red('   gh-settings-viewer only reads, but this private key could write. Make every permission read-only.\n'));
    }
    if (!installs.length) console.warn(c.yellow('⚠ The app has no installations yet. Run `npx gh-settings-viewer doctor` for the install link.'));
  } catch (e) {
    console.warn(c.yellow(`⚠ Startup check failed: ${redact((e as Error).message)}`));
  }
}

export async function start(args: CliArgs, config: ResolvedConfig): Promise<number> {
  if (!isLoopbackHost(args.host) && !args.unsafeBind) {
    console.error(c.red(`Refusing to bind to ${args.host}: it isn't a loopback address. Pass --unsafe-bind if you really want the viewer reachable from your network.`));
    return 1;
  }
  if (!config.appId && !config.clientId) {
    console.error(c.red('No GitHub App configured yet. Run: npx gh-settings-viewer init'));
    return 1;
  }
  if (config.privateKey.kind === 'none') {
    console.error(c.red('No private key configured. Run: npx gh-settings-viewer init (or set GITHUB_APP_PRIVATE_KEY_PATH)'));
    return 1;
  }
  const entry = serverEntry();
  if (!existsSync(entry)) {
    console.error(c.red(`The web bundle is missing (${entry}). If you're running from a checkout, run npm run build first.`));
    return 1;
  }

  // Keys from the keychain are handed to the server process through its environment (never written to disk).
  let pem: string | undefined;
  if (config.privateKey.kind === 'keychain') {
    const { readKeyFromKeychain } = await import('../core/config/keychain.ts');
    pem = (await readKeyFromKeychain(config.appId ?? '')) ?? undefined;
  }

  if (!isLoopbackHost(args.host)) console.warn(c.red(c.bold(`⚠ Binding to ${args.host}: anyone who can reach this address and has the session link can read your settings.`)));
  await selfCheck(config, pem);

  const { version } = packageInfo();
  const update = checkForUpdate(version); // runs in the background

  const port = await findFreePort(args.port, args.host);
  if (port !== args.port) console.log(c.dim(`Port ${args.port} is busy; using ${port}.`));
  const token = newSessionToken();
  const hosts = [...new Set([...allowedHosts(args.host, port), ...(args.host === '0.0.0.0' || args.host === '::' ? allowedHosts('127.0.0.1', port) : [])])];
  const displayHost = args.host === '0.0.0.0' || args.host === '::' ? '127.0.0.1' : args.host.includes(':') && !args.host.startsWith('[') ? `[${args.host}]` : args.host;
  const base = `http://${displayHost}:${port}`;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(port),
    HOSTNAME: args.host,
    GHSV_PORT: String(port),
    GHSV_SESSION_TOKEN: token,
    GHSV_ALLOWED_HOSTS: hosts.join(','),
    GH_SETTINGS_VIEWER_CONFIG: config.configPath,
    GITHUB_API_URL: config.apiBaseUrl,
  };
  if (config.appId) env.GITHUB_APP_ID = config.appId;
  if (config.clientId) env.GITHUB_APP_CLIENT_ID = config.clientId;
  if (config.enterpriseSlug) env.GITHUB_ENTERPRISE_SLUG = config.enterpriseSlug;
  if (config.privateKey.kind === 'path') env.GITHUB_APP_PRIVATE_KEY_PATH = config.privateKey.path;
  if (pem) env.GITHUB_APP_PRIVATE_KEY = pem;

  const child = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'], cwd: join(packageInfo().root, 'dist', 'web') });
  const forward = (stream: NodeJS.ReadableStream, out: NodeJS.WriteStream) =>
    stream.on('data', (d: Buffer) => {
      const text = redact(d.toString()).replace(/.*(Ready in|Starting\.\.\.|- Local:|- Network:|▲ Next\.js|Running next\.config).*\n?/g, '');
      if (text.trim()) out.write(text);
    });
  forward(child.stdout!, process.stdout);
  forward(child.stderr!, process.stderr);

  const ready = await waitForServer(`${base}/manifest.webmanifest`, 30_000, () => child.exitCode !== null);
  if (!ready) {
    console.error(c.red('The server did not start. See the messages above.'));
    child.kill();
    return 1;
  }
  const url = `${base}/?t=${token}`;
  console.log(`\n${c.bold('gh-settings-viewer')} ${c.dim(`v${version}`)} is running (read-only).`);
  console.log(`  Open: ${c.cyan(url)}`);
  console.log(c.dim('  This link works once per launch. Press Ctrl+C to stop.\n'));
  if (args.open) openBrowser(url);
  void update.then((msg) => msg && console.log(c.yellow(msg)));

  const stop = () => child.kill('SIGTERM');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 0)));
}

async function waitForServer(url: string, timeoutMs: number, dead: () => boolean): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (dead()) return false;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

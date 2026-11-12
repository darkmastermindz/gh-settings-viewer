import { existsSync } from "node:fs";
import { resolve } from 'node:path';
import { checkKeyFilePermissions, parsePrivateKey, readPem, writePrivateKeyFile } from '../core/config/key-file.ts';
import { keychainAvailable, saveKeyToKeychain } from '../core/config/keychain.ts';
import { appPaths } from '../core/config/paths.ts';
import { deriveUrls, normalizeApiBaseUrl, readFileConfig, resolveConfig, writeFileConfig, type ConfigFlags, type FileConfig } from '../core/config/resolve.ts';
import { ENTERPRISE_READ_PERMISSIONS } from '../core/registry/manifest-permissions.ts';
import { redact } from '../core/security/redact.ts';
import { c } from './colors.ts';
import { doctor } from './doctor.ts';
import { runManifestFlow } from './manifest-flow.ts';
import { openBrowser } from './open-browser.ts';
import { ask, choose, confirm } from './prompt.ts';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function enterpriseSteps(webBaseUrl: string, kind: 'enterprise-owned' | 'add-to-existing', enterprise?: string): string {
  const ent = enterprise ?? 'YOUR-ENTERPRISE';
  const perms = ENTERPRISE_READ_PERMISSIONS.map((p) => `      - ${p.title}: Read-only`).join('\n');
  const create =
    kind === 'enterprise-owned'
      ? `  1. Open ${webBaseUrl}/enterprises/${ent}/settings/apps/new (Enterprise settings → GitHub Apps → New GitHub App).
  2. Name it, set Homepage URL to https://github.com/darkmastermindz/gh-settings-viewer, and under Webhook clear "Active".
  3. Under Repository, Organization and Account permissions, set every permission you want to see to "Read-only".`
      : `  1. Open the app's settings (Developer settings → GitHub Apps → your app → Permissions & events).`;
  return `${create}
  ${kind === 'enterprise-owned' ? '4' : '2'}. Under "Enterprise permissions", set these to "Read-only" (the manifest flow can't set them):
${perms}
  ${kind === 'enterprise-owned' ? '5' : '3'}. Save. Under "Private keys", generate a key and keep the .pem file${kind === 'enterprise-owned' ? '; note the App ID and Client ID' : ''}.
  ${kind === 'enterprise-owned' ? '6' : '4'}. Install the app on the enterprise (Install App → your enterprise), then on each organization.
     Enterprise installations only grant enterprise permissions; each org needs its own installation.
  Note: an app with "Enterprise organization installations" can only be installed on the enterprise that owns it.`;
}

export async function init(flags: ConfigFlags): Promise<number> {
  const paths = appPaths();
  const configPath = flags.config ?? paths.configFile;
  const existing: FileConfig = existsSync(configPath) ? readFileConfig(configPath) : {};
  console.log(c.bold('\ngh-settings-viewer setup'));
  console.log(c.dim(`Config: ${configPath}\n`));

  const host = await choose(
    'Where is your GitHub?',
    [
      { value: 'dotcom', label: 'github.com (including GitHub Enterprise Cloud)' },
      { value: 'ghecom', label: 'GHE.com (data residency, e.g. octocorp.ghe.com)' },
      { value: 'ghes', label: 'GitHub Enterprise Server' },
    ],
    existing.apiBaseUrl && existing.apiBaseUrl !== 'https://api.github.com' ? (hostOf(existing.apiBaseUrl).endsWith('.ghe.com') ? 'ghecom' : 'ghes') : 'dotcom',
  );
  let apiBaseUrl = 'https://api.github.com';
  if (host === 'ghecom') apiBaseUrl = `https://api.${(await ask('Your GHE.com subdomain (the part before .ghe.com)')).replace(/\.ghe\.com.*$/, '')}.ghe.com`;
  if (host === 'ghes') apiBaseUrl = `${(await ask('Your server URL, e.g. https://github.example.com')).replace(/\/+$/, '')}/api/v3`;
  apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
  const { webBaseUrl } = deriveUrls(apiBaseUrl);

  const mode = await choose(
    'How do you want to set up the GitHub App?',
    [
      { value: 'manifest', label: 'Create a new read-only app for me (GitHub App Manifest flow)' },
      { value: 'existing', label: 'Use an app I already have (App ID + private key file)' },
      { value: 'enterprise', label: 'Create an enterprise-owned app (manual steps; manifests cannot do this)' },
    ],
    existing.appId ? 'existing' : 'manifest',
  );
  const enterpriseSlug = (await ask('Enterprise slug (optional; blank if you only use organizations)', existing.enterpriseSlug)) || undefined;

  const next: FileConfig = { apiBaseUrl, enterpriseSlug };
  if (mode === 'enterprise') {
    console.log(`\n${c.bold('Create the enterprise-owned app:')}\n${enterpriseSteps(webBaseUrl, 'enterprise-owned', enterpriseSlug)}\n`);
    await ask('Press Enter when the app exists and you have its .pem file');
  }

  if (mode === 'manifest') {
    const ownerType = await choose('Who should own the app?', [{ value: 'org', label: 'An organization (recommended for teams)' }, { value: 'user', label: 'My personal account' }], 'org');
    const owner = ownerType === 'org' ? { type: 'org' as const, login: await ask('Organization login') } : { type: 'user' as const };
    const appName = await ask('App name (must be unique on GitHub)', `settings-viewer-${owner.type === 'org' ? owner.login : 'me'}`.slice(0, 34));
    console.log(c.dim('\nOpening your browser to create the app. Waiting for GitHub…'));
    const conv = await runManifestFlow({
      apiBaseUrl,
      webBaseUrl,
      owner,
      appName,
      onUrl: (url) => {
        console.log(`If the browser doesn't open, visit ${c.cyan(url)}`);
        openBrowser(url);
      },
    });
    console.log(c.green(`\n✔ Created ${conv.slug} (App ID ${conv.id}).`));
    next.appId = String(conv.id);
    next.clientId = conv.clientId;
    await storeKey(conv.pem, next, paths.privateKeyFile);
    if (enterpriseSlug) {
      console.log(`\n${c.bold('Enterprise permissions need one manual step:')}\n${enterpriseSteps(webBaseUrl, 'add-to-existing', enterpriseSlug)}`);
    }
  } else {
    next.appId = await ask('App ID', existing.appId);
    next.clientId = (await ask('Client ID (optional, recommended)', existing.clientId)) || undefined;
    for (;;) {
      const p = resolve(await ask('Path to the private key (.pem)', existing.privateKeyPath));
      try {
        parsePrivateKey(readPem(p));
      } catch (e) {
        console.log(c.red(redact((e as Error).message)));
        continue;
      }
      const copy = await confirm(`Copy it to ${paths.privateKeyFile} with 0600 permissions?`, true);
      if (copy) {
        writePrivateKeyFile(paths.privateKeyFile, readPem(p));
        next.privateKeyPath = paths.privateKeyFile;
      } else {
        const check = checkKeyFilePermissions(p);
        if (check.warning) console.log(c.yellow(`⚠ ${check.warning}`));
        next.privateKeyPath = p;
      }
      if (copy && keychainAvailable() && (await confirm('keytar is available. Store the key in the OS keychain instead of a file?', false))) {
        await saveKeyToKeychain(next.appId!, readPem(p));
        next.privateKeyInKeychain = true;
        next.privateKeyPath = undefined;
      }
      break;
    }
  }

  writeFileConfig(configPath, next);
  console.log(c.green(`✔ Saved ${configPath}`));
  console.log(c.dim('  (App ID, client ID, API URL, enterprise slug and key location. No secrets.)\n'));

  const config = resolveConfig({ ...flags, config: configPath }, {});
  const code = await doctor(config);
  console.log(`\nStart the viewer with: ${c.bold('npx gh-settings-viewer')}`);
  return code === 1 ? 1 : 0;
}

async function storeKey(pem: string, next: FileConfig, file: string): Promise<void> {
  parsePrivateKey(pem);
  if (keychainAvailable() && (await confirm('keytar is available. Store the private key in the OS keychain instead of a file?', false))) {
    if (await saveKeyToKeychain(next.appId!, pem)) {
      next.privateKeyInKeychain = true;
      console.log(c.green('✔ Private key stored in the OS keychain.'));
      return;
    }
  }
  writePrivateKeyFile(file, pem);
  next.privateKeyPath = file;
  console.log(c.green(`✔ Private key saved to ${file} (0600).`));
}


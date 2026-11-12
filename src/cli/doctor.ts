import { formatRemaining, installUrl, missingOrgInstallations } from '../core/diagnostics.ts';
import type { ResolvedConfig } from '../core/config/resolve.ts';
import { Runtime } from '../core/runtime.ts';
import { MemoryCache } from '../core/cache/memory.ts';
import { redact } from '../core/security/redact.ts';
import { c } from './colors.ts';

/** Prints granted permissions, installations and token status; warns on any write permission. Returns an exit code. */
export async function doctor(config: ResolvedConfig, opts: { json?: boolean } = {}): Promise<number> {
  const say = (s = '') => {
    if (!opts.json) console.log(s);
  };
  say(c.bold('gh-settings-viewer doctor'));
  say(`  Config file   ${config.configPath}`);
  say(`  API           ${config.apiBaseUrl}`);
  say(`  App           ${config.appId ? `ID ${config.appId}` : c.red('not set')}${config.clientId ? `, client ID ${config.clientId}` : ''}`);

  let rt: Runtime;
  try {
    rt = await Runtime.create(config, { cache: new MemoryCache() });
  } catch (e) {
    const msg = redact((e as Error).message);
    if (opts.json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(c.red(`\n✖ ${msg}`));
    return 1;
  }
  say(`  Private key   ${rt.keyDescription}`);
  for (const w of rt.warnings) say(c.yellow(`  ⚠ ${w}`));

  let caps;
  try {
    caps = await rt.capabilities(true);
  } catch (e) {
    const msg = redact((e as Error).message);
    if (opts.json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(c.red(`\n✖ Could not reach GitHub as the app: ${msg}`));
    return 1;
  }
  const diag = rt.diagnostics(caps);
  const writes = [...new Set([...caps.appWritePermissions, ...diag.flatMap((d) => d.writePermissions)])];
  const missing = await missingOrgInstallations(rt, caps);
  const link = installUrl(config.webBaseUrl, caps.app.slug);

  if (opts.json) {
    console.log(JSON.stringify({ ok: writes.length === 0, app: { id: caps.app.id, slug: caps.app.slug, name: caps.app.name, owner: caps.app.owner?.login, permissions: caps.app.permissions }, writePermissions: writes, installations: diag, missingOrgInstallations: missing.missing ?? null, installUrl: link }, null, 2));
    return writes.length ? 2 : 0;
  }

  say();
  say(c.bold(`App: ${caps.app.name} (${caps.app.slug})`) + (caps.app.owner ? ` owned by ${caps.app.owner.login}` : ''));
  const perms = Object.entries(caps.app.permissions).sort(([a], [b]) => a.localeCompare(b));
  say(`  ${perms.length} permissions: ${perms.map(([k, v]) => (v === 'read' ? `${k}:${v}` : c.red(`${k}:${v}`))).join(', ') || 'none'}`);
  if (writes.length) {
    say();
    say(c.red(c.bold(`  ⚠ WRITE PERMISSIONS: ${writes.join(', ')}`)));
    say(c.red('    The viewer only reads, but this key could write. Set these to "Read-only" in the app settings,'));
    say(c.red('    then approve the change on each installation.'));
  }

  say();
  say(c.bold(`Installations (${diag.length})`));
  if (!diag.length) say(c.yellow('  None yet. Install the app (link below).'));
  for (const d of diag) {
    const token = d.token.state === 'valid' ? `${c.green('valid')} until ${d.token.expiresAt} (${formatRemaining(d.token.msRemaining)} left)` : 'none';
    say(`  ${c.bold(d.account)} ${c.dim(`#${d.id} ${d.scope}${d.repositorySelection ? `, repos: ${d.repositorySelection}` : ''}${d.suspended ? ', SUSPENDED' : ''}`)}`);
    say(`    token: ${token}`);
    say(`    pages: ${d.pages}   permissions: ${Object.keys(d.permissions).length}${d.rateLimit?.remaining !== undefined ? `   rate limit: ${d.rateLimit.remaining}/${d.rateLimit.limit ?? '?'}` : ''}`);
  }
  if (!diag.some((d) => d.scope === 'enterprise')) say(c.dim('  No enterprise installation: enterprise pages need the app installed on the enterprise (see SETUP.md).'));

  say();
  say(`Install or add accounts: ${c.cyan(link)}`);
  if (missing.missing?.length) say(c.yellow(`Organizations in ${missing.enterprise} without an installation: ${missing.missing.join(', ')}`));
  else if (missing.missing) say(c.green(`Every organization in ${missing.enterprise} has an installation.`));
  if (caps.probes.transientErrors) say(c.yellow(`${caps.probes.transientErrors} checks hit network or server errors; run doctor again.`));
  say(writes.length ? c.red('\nDone, with warnings.') : c.green('\n✔ Read-only and ready.'));
  rt.close();
  return writes.length ? 2 : 0;
}

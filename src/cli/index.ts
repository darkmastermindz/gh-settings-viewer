#!/usr/bin/env node
import { resolveConfig } from '../core/config/resolve.ts';
import { redact } from '../core/security/redact.ts';
import { HELP, parseCli } from './args.ts';
import { c } from './colors.ts';
import { doctor } from './doctor.ts';
import { init } from './init.ts';
import { start } from './start.ts';
import { packageInfo } from './version.ts';

async function main(argv: string[]): Promise<number> {
  const args = parseCli(argv);
  if (args.command === 'help') {
    console.log(HELP);
    return 0;
  }
  if (args.command === 'version') {
    console.log(packageInfo().version);
    return 0;
  }
  const flags = { config: args.config, appId: args.appId, clientId: args.clientId, enterprise: args.enterprise, apiUrl: args.apiUrl, privateKeyPath: args.privateKeyPath };
  if (args.command === 'init') return init(flags);
  const config = resolveConfig(flags);
  if (args.command === 'doctor') return doctor(config, { json: args.json });
  return start(args, config);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: Error) => {
    console.error(c.red(`✖ ${redact(e.message)}`));
    process.exitCode = 1;
  },
);

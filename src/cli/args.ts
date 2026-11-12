import { parseArgs } from 'node:util';

export const DEFAULT_PORT = 4783;
export const DEFAULT_HOST = '127.0.0.1';

export interface CliArgs {
  command: 'start' | 'init' | 'doctor' | 'help' | 'version';
  port: number;
  portExplicit: boolean;
  host: string;
  unsafeBind: boolean;
  open: boolean;
  config?: string;
  appId?: string;
  clientId?: string;
  enterprise?: string;
  apiUrl?: string;
  privateKeyPath?: string;
  json: boolean;
}

export function parseCli(argv: string[]): CliArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      port: { type: 'string', short: 'p' },
      host: { type: 'string' },
      'unsafe-bind': { type: 'boolean', default: false },
      'no-open': { type: 'boolean', default: false },
      config: { type: 'string', short: 'c' },
      'app-id': { type: 'string' },
      'client-id': { type: 'string' },
      enterprise: { type: 'string' },
      'api-url': { type: 'string' },
      'private-key-path': { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
  const cmd = positionals[0] ?? 'start';
  if (positionals.length > 1) throw new Error(`Unexpected argument: ${positionals[1]}`);
  if (!['start', 'init', 'doctor', 'help', 'version'].includes(cmd)) throw new Error(`Unknown command "${cmd}". Run gh-settings-viewer --help.`);
  let port = DEFAULT_PORT;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`--port must be 1-65535 (got ${values.port})`);
  }
  return {
    command: values.help ? 'help' : values.version ? 'version' : (cmd as CliArgs['command']),
    port,
    portExplicit: values.port !== undefined,
    host: values.host ?? DEFAULT_HOST,
    unsafeBind: values['unsafe-bind'] === true,
    open: values['no-open'] !== true,
    config: values.config,
    appId: values['app-id'],
    clientId: values['client-id'],
    enterprise: values.enterprise,
    apiUrl: values['api-url'],
    privateKeyPath: values['private-key-path'],
    json: values.json === true,
  };
}

export const HELP = `gh-settings-viewer: read-only viewer for GitHub enterprise, org and repo settings

Usage
  npx gh-settings-viewer [start]   Start the local viewer and open it in your browser
  npx gh-settings-viewer init      Set up a read-only GitHub App (create one, or use an existing app)
  npx gh-settings-viewer doctor    Check the app: permissions, installations, token status

Options
  -p, --port <n>            Port (default ${DEFAULT_PORT}; the next free port is used if it's busy)
      --host <addr>         Address to bind (default ${DEFAULT_HOST}). Non-loopback needs --unsafe-bind
      --unsafe-bind         Allow binding to a non-loopback address (exposes the viewer on your network)
      --no-open             Don't open the browser
  -c, --config <path>       Use this config.json instead of the per-user one
      --app-id <id>         GitHub App ID                  (env GITHUB_APP_ID)
      --client-id <id>      GitHub App client ID           (env GITHUB_APP_CLIENT_ID)
      --enterprise <slug>   Enterprise slug                (env GITHUB_ENTERPRISE_SLUG)
      --api-url <url>       API base URL (GHES / GHE.com)  (env GITHUB_API_URL)
      --private-key-path <p> Private key file              (env GITHUB_APP_PRIVATE_KEY_PATH or GITHUB_APP_PRIVATE_KEY)
      --json                doctor: print JSON
  -h, --help                Show this help
  -v, --version             Show the version

Settings resolve in this order: flags, environment variables, config.json.
`;

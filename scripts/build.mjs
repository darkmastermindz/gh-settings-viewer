#!/usr/bin/env node
// Builds what the npm package ships:
//   dist/cli, dist/core  the CLI compiled to plain JS (tsc)
//   dist/web             the Next.js standalone server, with its static assets and public files
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, shell: process.platform === 'win32' });
const bin = (name) => join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);

rmSync(join(root, 'dist'), { recursive: true, force: true });
rmSync(join(root, '.next'), { recursive: true, force: true });

console.log('› Compiling the CLI');
run(bin('tsc'), ['-p', 'tsconfig.cli.json']);
const cli = join(root, 'dist/cli/index.js');
const src = readFileSync(cli, 'utf8');
if (!src.startsWith('#!')) writeFileSync(cli, `#!/usr/bin/env node\n${src}`);
chmodSync(cli, 0o755);

console.log('› Building the web app (Next.js standalone)');
run(bin('next'), ['build']);

const standalone = join(root, '.next/standalone');
if (!existsSync(join(standalone, 'server.js'))) throw new Error('Next.js did not produce .next/standalone/server.js');
const web = join(root, 'dist/web');
cpSync(standalone, web, { recursive: true });
cpSync(join(root, '.next/static'), join(web, '.next/static'), { recursive: true });
cpSync(join(root, 'public'), join(web, 'public'), { recursive: true });
for (const f of ['tsconfig.json', '.env', '.env.local']) rmSync(join(web, f), { force: true });
// The standalone package.json only marks the module type for server.js; drop scripts and dev metadata.
const pkg = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8'));
writeFileSync(join(web, 'package.json'), JSON.stringify({ name: 'gh-settings-viewer-web', private: true, type: pkg.type ?? 'commonjs' }, null, 2) + '\n');

console.log('✔ Built dist/cli and dist/web');

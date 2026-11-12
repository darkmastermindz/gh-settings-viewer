#!/usr/bin/env node
// Packs the tarball, checks what's in it, then runs it with npx from a clean directory against a mock GitHub:
//   npx <tarball> --version | doctor | start (and fetches a page through the session cookie).
// Run after `npm run build`: npm run verify:pack
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const win = process.platform === 'win32';
const npm = win ? 'npm.cmd' : 'npm';
const npx = win ? 'npx.cmd' : 'npx';
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

// 1. Pack (dist/ must already be built; prepack would rebuild).
const [packed] = JSON.parse(execFileSync(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', tmpdir()], { cwd: root, shell: win }).toString());
const tarball = join(tmpdir(), packed.filename);
const files = packed.files.map((f) => f.path);
console.log(`› Packed ${packed.filename}: ${files.length} files, ${(packed.size / 1e6).toFixed(1)} MB (${(packed.unpackedSize / 1e6).toFixed(1)} MB unpacked)`);

const must = ['bin/gh-settings-viewer.js', 'dist/cli/index.js', 'dist/web/server.js', 'dist/web/public/sw.js', 'dist/web/public/offline.html', 'dist/web/package.json', 'SETUP.md', 'docs/permissions.md'];
for (const m of must) if (!files.includes(m)) fail(`missing from the tarball: ${m}`);
if (!files.some((f) => f.startsWith('dist/web/.next/static/'))) fail('missing dist/web/.next/static');
if (!files.some((f) => f.startsWith('dist/web/node_modules/next/'))) fail('missing the bundled next runtime');
const forbidden = files.filter((f) => /^(src|tests|scripts|data)\//.test(f) || /\.(pem|key|sqlite)$/.test(f) || (/(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example")) || /node_modules\/(@img|sharp|typescript)\//.test(f));
if (forbidden.length) fail(`unexpected files in the tarball: ${forbidden.slice(0, 10).join(', ')}`);
console.log('✔ Tarball contents');

// 2. Clean directory + mock GitHub.
const work = mkdtempSync(join(tmpdir(), 'ghsv-verify-'));
const keyPath = join(work, 'test-key.pem');
const mock = spawn(process.execPath, [join(root, 'tests/e2e/mock-github.ts'), '0', keyPath], { stdio: ['ignore', 'pipe', 'inherit'] });
const apiUrl = await new Promise((res, rej) => {
  mock.stdout.once('data', (d) => res(d.toString().trim()));
  mock.once('exit', () => rej(new Error('mock GitHub exited')));
});
const env = {
  ...process.env,
  GH_SETTINGS_VIEWER_HOME: join(work, 'home'),
  GH_SETTINGS_VIEWER_NO_UPDATE_CHECK: '1',
  GITHUB_API_URL: apiUrl,
  GITHUB_APP_ID: '1',
  GITHUB_APP_PRIVATE_KEY_PATH: keyPath,
  npm_config_yes: 'true',
  npm_config_update_notifier: 'false',
};
const run = (args) => execFileSync(npx, ['--yes', `--package=${tarball}`, 'gh-settings-viewer', ...args], { cwd: work, env, shell: win, timeout: 180_000 }).toString();

let server;
try {
  const version = run(['--version']).trim();
  if (version !== packed.version) fail(`--version printed ${version}, expected ${packed.version}`);
  console.log(`✔ npx ${packed.filename} --version → ${version}`);

  const doctor = JSON.parse(run(['doctor', '--json']));
  if (doctor.installations?.length !== 3) fail(`doctor saw ${doctor.installations?.length} installations`);
  if (JSON.stringify(doctor).includes('ghs_')) fail('doctor printed a token');
  console.log(`✔ npx … doctor → ${doctor.installations.map((i) => `${i.account}:${i.pages}`).join(', ')}`);

  // 3. start, wait for the session link, fetch a page.
  server = spawn(npx, ['--yes', `--package=${tarball}`, 'gh-settings-viewer', '--no-open', '--port', '48300'], { cwd: work, env, shell: win, detached: !win, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const link = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`server did not start:\n${out}`)), 120_000);
    const onData = (d) => {
      out += d.toString();
      const m = out.match(/Open: \S*(http:\/\/\S+\?t=[A-Za-z0-9_-]+)/);
      if (m) {
        clearTimeout(t);
        // eslint-disable-next-line no-control-regex -- strips ANSI colour codes
        res(m[1].replace(/\u001b\[[0-9;]*m/g, ''));
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
  });
  const url = new URL(link);
  const token = url.searchParams.get('t');
  const cookie = `ghsv_session_${url.port}=${token}`;
  const base = `${url.protocol}//${url.host}`;
  const unauth = await fetch(`${base}/`);
  if (unauth.status !== 401) fail(`expected 401 without the session, got ${unauth.status}`);
  const page = await fetch(`${base}/org/acme/org-webhooks`, { headers: { cookie } });
  if (page.status !== 200) fail(`page returned ${page.status}`);
  const api = await fetch(`${base}/api/data?scope=org&key=acme&feature=org-webhooks`, { headers: { cookie } });
  const body = await api.text();
  if (!api.ok || !body.includes('ci.acme.example')) fail(`API returned ${api.status}: ${body.slice(0, 200)}`);
  if (/ghs_|\*{8}/.test(body)) fail('a token or webhook secret reached the browser');
  console.log(`✔ npx … start → ${base} serves pages and data (401 without the session link)`);
  writeFileSync(join(work, 'ok'), 'ok');
} finally {
  if (server?.pid) {
    if (win) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']);
    else {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        server.kill('SIGTERM');
      }
    }
  }
  mock.kill();
  await new Promise((r) => setTimeout(r, 500));
  rmSync(work, { recursive: true, force: true });
  rmSync(tarball, { force: true });
}
console.log('✔ verify:pack passed');
process.exit(0);

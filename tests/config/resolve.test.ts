import assert from 'node:assert/strict';
import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { checkKeyFilePermissions, writePrivateKeyFile } from '../../src/core/config/key-file.ts';
import { deriveUrls, readFileConfig, resolveConfig, writeFileConfig, type FileConfig } from '../../src/core/config/resolve.ts';
import { tempDir } from '../helpers/setup.ts';

const file: FileConfig = { appId: '100', clientId: 'Iv1.file', enterpriseSlug: 'file-ent', apiBaseUrl: 'https://ghes.example.com/api/v3', privateKeyPath: '/file/key.pem' };
const env = { GITHUB_APP_ID: '200', GITHUB_APP_CLIENT_ID: 'Iv1.env', GITHUB_ENTERPRISE_SLUG: 'env-ent', GITHUB_API_URL: 'https://api.acme.ghe.com', GITHUB_APP_PRIVATE_KEY_PATH: '/env/key.pem' };

describe('config resolution', () => {
  it('flags beat env vars beat config.json', () => {
    const c = resolveConfig({ appId: '300', clientId: 'Iv1.flag', enterprise: 'flag-ent', apiUrl: 'https://api.github.com', privateKeyPath: '/flag/key.pem' }, env, () => file);
    assert.equal(c.appId, '300');
    assert.equal(c.clientId, 'Iv1.flag');
    assert.equal(c.enterpriseSlug, 'flag-ent');
    assert.equal(c.apiBaseUrl, 'https://api.github.com');
    assert.deepEqual(c.privateKey, { kind: 'path', path: '/flag/key.pem', from: 'flag' });
    assert.ok(Object.values(c.sources).every((s) => s === 'flag'));
  });

  it('env vars beat config.json', () => {
    const c = resolveConfig({}, env, () => file);
    assert.equal(c.appId, '200');
    assert.equal(c.enterpriseSlug, 'env-ent');
    assert.equal(c.apiBaseUrl, 'https://api.acme.ghe.com');
    assert.equal(c.webBaseUrl, 'https://acme.ghe.com');
    assert.deepEqual(c.privateKey, { kind: 'path', path: '/env/key.pem', from: 'env' });
  });

  it('GITHUB_APP_PRIVATE_KEY (inline) beats GITHUB_APP_PRIVATE_KEY_PATH', () => {
    const c = resolveConfig({}, { ...env, GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----x' }, () => file);
    assert.equal(c.privateKey.kind, 'env');
  });

  it('falls back to config.json, then defaults', () => {
    const c = resolveConfig({}, {}, () => file);
    assert.equal(c.appId, '100');
    assert.equal(c.webBaseUrl, 'https://ghes.example.com');
    assert.equal(c.graphqlUrl, 'https://ghes.example.com/api/graphql');
    const d = resolveConfig({}, {}, () => ({}));
    assert.equal(d.apiBaseUrl, 'https://api.github.com');
    assert.equal(d.sources.apiBaseUrl, 'default');
    assert.equal(d.privateKey.kind, 'none');
  });

  it('uses --config to pick the file', () => {
    let asked = '';
    resolveConfig({ config: '/custom/config.json' }, {}, (p) => ((asked = p), {}));
    assert.equal(asked, '/custom/config.json');
  });

  it('rejects unsafe API URLs', () => {
    for (const bad of ['http://api.github.com', 'https://user:pass@api.github.com', 'not a url', 'https://api.github.com/?x=1']) {
      assert.throws(() => resolveConfig({ apiUrl: bad }, {}, () => ({})), bad);
    }
  });

  it('derives web and GraphQL URLs', () => {
    assert.deepEqual(deriveUrls('https://api.github.com'), { webBaseUrl: 'https://github.com', graphqlUrl: 'https://api.github.com/graphql' });
    assert.deepEqual(deriveUrls('https://api.octo.ghe.com'), { webBaseUrl: 'https://octo.ghe.com', graphqlUrl: 'https://api.octo.ghe.com/graphql' });
    assert.deepEqual(deriveUrls('https://git.corp/api/v3'), { webBaseUrl: 'https://git.corp', graphqlUrl: 'https://git.corp/api/graphql' });
  });

  it('round-trips config.json without secrets, and refuses secret-looking keys', () => {
    const dir = tempDir();
    const p = join(dir, 'config.json');
    writeFileConfig(p, { appId: '1', privateKeyPath: '/k.pem' });
    assert.deepEqual(readFileConfig(p), { appId: '1', clientId: undefined, enterpriseSlug: undefined, apiBaseUrl: undefined, privateKeyPath: '/k.pem', privateKeyInKeychain: false });
    assert.throws(() => writeFileConfig(p, { appId: '1', clientSecret: 'x' } as FileConfig));
  });
});

describe('private key file', () => {
  it('is written 0600 and too-open files are flagged', { skip: process.platform === 'win32' }, () => {
    const dir = tempDir();
    const p = join(dir, 'k.pem');
    writePrivateKeyFile(p, 'pem');
    assert.equal(statSync(p).mode & 0o777, 0o600);
    assert.equal(checkKeyFilePermissions(p).ok, true);
    const loose = join(dir, 'loose.pem');
    writeFileSync(loose, 'pem', { mode: 0o644 });
    const check = checkKeyFilePermissions(loose);
    assert.equal(check.ok, false);
    assert.match(check.warning!, /chmod 600/);
  });
});

// Tokens must never reach SQLite, logs, config.json, or anything sent to the browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SqliteCache } from '../../src/core/cache/sqlite.ts';
import { writeFileConfig } from '../../src/core/config/resolve.ts';
import { fetchFeature } from '../../src/core/data/fetch-feature.ts';
import { discover } from '../../src/core/discovery/discover.ts';
import { createAppApi } from '../../src/core/auth/app-api.ts';
import { registry, getFeature } from '../../src/core/registry/index.ts';
import { publicCapabilities } from '../../src/server/api-shapes.ts';
import { API } from '../helpers/fake-github.ts';
import { captureLogs, makeStack, tempDir } from '../helpers/setup.ts';

describe('no token leaks', () => {
  it('keeps tokens out of SQLite, logs, config and browser-bound responses', async () => {
    const dir = tempDir();
    const cache = new SqliteCache(join(dir, 'cache.sqlite'));
    const { gh, readerFor, jwt, tokens } = makeStack({ cache });
    gh.installations = [{ id: 2, login: 'acme', targetType: 'Organization', permissions: { organization_hooks: 'read', members: 'read', metadata: 'read' } }];
    gh.on('GET /orgs/acme', { status: 200, body: { login: 'acme' }, headers: { etag: '"e1"' } })
      .on('GET /orgs/acme/hooks', { status: 200, body: [{ id: 1, config: { url: 'https://x', secret: '********' } }], headers: { etag: '"e2"' } })
      .on('GET /orgs/acme/members', { status: 401, body: { message: 'Bad credentials' } })
      .on('GET /installation/repositories', { status: 200, body: { repositories: [] } });

    const { output, result } = await captureLogs(async () => {
      const caps = await discover({ appApi: createAppApi({ apiBaseUrl: API, jwt, fetch: gh.fetch }), readerFor, registry, now: () => gh.clock.now() });
      const inst = caps.installations[0]!;
      const page = await fetchFeature(readerFor(2), getFeature('org-webhooks')!, inst, { scope: 'org', key: 'acme' }, undefined);
      const failing = await fetchFeature(readerFor(2), getFeature('org-members')!, inst, { scope: 'org', key: 'acme' }, undefined);
      return { caps, page, failing, status: tokens.status(2) };
    });

    const minted = gh.mints.map((m) => m.token);
    assert.ok(minted.length >= 1);
    const jwtValue = jwt.get();
    const browserBound = JSON.stringify([publicCapabilities(result.caps), result.page, result.failing, result.status]);
    const sqlite = cache.dump() + readFileSync(join(dir, 'cache.sqlite')).toString('latin1');
    const configPath = join(dir, 'config.json');
    writeFileConfig(configPath, { appId: '1', clientId: 'Iv1.x', privateKeyPath: '/k.pem' });
    const config = readFileSync(configPath, 'utf8');

    for (const secret of [...minted, jwtValue]) {
      assert.ok(!sqlite.includes(secret), 'token in SQLite');
      assert.ok(!output.includes(secret), 'token in logs');
      assert.ok(!config.includes(secret), 'token in config');
      assert.ok(!browserBound.includes(secret), 'token in a browser response');
    }
    assert.ok(!/ghs_|BEGIN [A-Z ]*PRIVATE KEY/.test(sqlite + config + browserBound));
    assert.ok(!browserBound.includes('********'), 'webhook secret placeholder omitted');
    cache.close();
  });

  it('refuses to persist a response that contains something token-shaped', () => {
    const cache = new SqliteCache(':memory:');
    cache.set('res:1:x', { data: { leaked: 'ghs_AAAAAAAAAAAAAAAAAAAAAAAA' }, status: 200, url: 'https://x', fetchedAt: 1 });
    assert.equal(cache.get('res:1:x'), undefined);
    cache.close();
  });
});

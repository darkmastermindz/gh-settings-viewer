import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeApiBaseUrl } from '../../src/core/config/resolve.ts';
import { getPath, omitPaths, toCsv } from '../../src/core/data/shape.ts';
import { allowedHosts, checkRequest, isLoopbackHost } from '../../src/core/security/host-origin.ts';
import { containsSecret, redact, redactDeep } from '../../src/core/security/redact.ts';
import { tokensMatch } from '../../src/core/security/session-token.ts';
import { cleanFilter, isAccountKey, isFeatureId, isRepoName } from '../../src/core/security/validate.ts';
import { getFeature } from '../../src/core/registry/index.ts';
import * as P from './payloads.mjs';

describe('route parameter validation', () => {
  it('rejects hostile account keys, repo names and page IDs', () => {
    for (const p of P.ACCOUNT_KEY_PAYLOADS) assert.equal(isAccountKey(p), false, JSON.stringify(p));
    for (const p of P.REPO_NAME_PAYLOADS) assert.equal(isRepoName(p), false, JSON.stringify(p));
    for (const p of P.FEATURE_ID_PAYLOADS) assert.equal(isFeatureId(p) && getFeature(p) !== undefined, false, JSON.stringify(p));
    assert.ok(isAccountKey('octo-corp') && isRepoName('my.repo_name-1') && isFeatureId('org-webhooks'));
  });

  it('looks up registry entries by own keys only', () => {
    for (const k of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) assert.equal(getFeature(k), undefined);
    assert.equal(getPath({ a: 1 }, '__proto__'), undefined);
    assert.equal(getPath({ a: 1 }, 'constructor'), undefined);
  });

  it('cleans filter text', () => {
    for (const p of P.FILTER_PAYLOADS) {
      const c = cleanFilter(p)!;
      // eslint-disable-next-line no-control-regex -- checking control characters were removed
      assert.ok(!/[\u0000-\u001f]/.test(c), JSON.stringify(p));
      assert.ok(c.length <= 500);
    }
  });
});

describe('CSV export', () => {
  it('neutralises formula injection', () => {
    const csv = toCsv(['v'], P.CSV_INJECTION_PAYLOADS.map((p) => [p]));
    for (const line of csv.split('\r\n').slice(1).filter(Boolean)) assert.match(line, /^"'/, line);
  });
});

describe('Host and Origin checks (DNS rebinding, cross-site)', () => {
  const hosts = allowedHosts('127.0.0.1', 4783);
  it('accepts our own hosts', () => {
    for (const h of hosts) assert.deepEqual(checkRequest({ host: h, method: 'GET' }, hosts), { ok: true });
    assert.deepEqual(checkRequest({ host: '127.0.0.1:4783', origin: 'http://127.0.0.1:4783', method: 'POST' }, hosts), { ok: true });
  });
  it('rejects foreign Host headers', () => {
    for (const h of P.HOST_HEADER_PAYLOADS) assert.equal(checkRequest({ host: h, method: 'GET' }, hosts).ok, false, h);
  });
  it('rejects foreign Origins, cross-site fetches and Origin-less POSTs', () => {
    for (const o of P.ORIGIN_PAYLOADS) assert.equal(checkRequest({ host: '127.0.0.1:4783', origin: o, method: 'POST' }, hosts).ok, false, o);
    assert.equal(checkRequest({ host: '127.0.0.1:4783', method: 'POST' }, hosts).ok, false);
    assert.equal(checkRequest({ host: '127.0.0.1:4783', secFetchSite: 'cross-site', method: 'GET' }, hosts).ok, false);
  });
  it('knows loopback', () => {
    assert.ok(isLoopbackHost('127.0.0.1') && isLoopbackHost('localhost') && isLoopbackHost('::1') && isLoopbackHost('[::1]'));
    assert.ok(!isLoopbackHost('0.0.0.0') && !isLoopbackHost('192.168.1.10') && !isLoopbackHost('127.0.0.1.evil.example'));
  });
  it('compares session tokens safely', () => {
    assert.ok(tokensMatch('abc', 'abc'));
    assert.ok(!tokensMatch('abc', 'abd') && !tokensMatch('', '') && !tokensMatch(undefined, 'x') && !tokensMatch('abc', 'abcd'));
  });
});

describe('config URLs', () => {
  it('rejects unsafe API base URLs', () => {
    for (const u of P.API_URL_PAYLOADS) assert.throws(() => normalizeApiBaseUrl(u), u);
  });
});

describe('redaction', () => {
  it('redacts every token shape', () => {
    for (const t of P.TOKEN_LIKE) {
      assert.ok(containsSecret(t), t);
      assert.ok(!containsSecret(redact(`before ${t} after`)), t);
    }
    assert.equal(redact('Authorization: token ghs_AAAAAAAAAAAAAAAAAAAAAAAA'), 'Authorization: token [REDACTED]');
    assert.deepEqual(redactDeep({ a: [`x ${P.TOKEN_LIKE[0]}`] }), { a: ['x [REDACTED]'] });
  });
  it('omits secret fields from webhook and variable responses', () => {
    const hook = { id: 1, config: { url: 'https://x', secret: '********' } };
    assert.deepEqual(omitPaths([hook], ['config.secret']), [{ id: 1, config: { url: 'https://x' } }]);
    assert.deepEqual(omitPaths([{ name: 'A', value: 'v' }], ['value']), [{ name: 'A' }]);
  });
});

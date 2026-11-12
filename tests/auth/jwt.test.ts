import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import { describe, it } from 'node:test';
import { AppJwt, JWT_LIFETIME_S, JWT_RENEW_BEFORE_S } from '../../src/core/auth/jwt.ts';
import { FakeClock, testKeys } from '../helpers/fake-github.ts';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());

describe('app JWT', () => {
  it('signs RS256 with iat = now - 60s and exp = now + 9 min', () => {
    const clock = new FakeClock();
    const jwt = new AppJwt(testKeys().privateKey, 'Iv1.abc', clock).get();
    const [h, p, s] = jwt.split('.');
    assert.deepEqual(decode(h!), { alg: 'RS256', typ: 'JWT' });
    const now = Math.floor(clock.now() / 1000);
    assert.deepEqual(decode(p!), { iat: now - 60, exp: now + 540, iss: 'Iv1.abc' });
    assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), testKeys().publicKey, Buffer.from(s!, 'base64url')));
  });

  it('reuses the JWT until about 30s before exp, then re-signs', () => {
    const clock = new FakeClock();
    const app = new AppJwt(testKeys().privateKey, '123', clock);
    const first = app.get();
    clock.advance((JWT_LIFETIME_S - JWT_RENEW_BEFORE_S - 1) * 1000);
    assert.equal(app.get(), first);
    assert.equal(app.signCount, 1);
    clock.advance(1000);
    const second = app.get();
    assert.notEqual(second, first);
    assert.equal(app.signCount, 2);
    assert.equal(app.get(), second);
    assert.equal(app.signCount, 2);
  });
});

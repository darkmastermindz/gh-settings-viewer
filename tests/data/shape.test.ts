import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diffSection } from '../../src/core/data/diff.ts';
import { flatten, getPath, tabulate, unwrapList } from '../../src/core/data/shape.ts';
import { registry } from '../../src/core/registry/index.ts';
import { checkRegistry } from '../../scripts/check-registry.ts';

describe('data shaping', () => {
  it('reads dot paths and array paths', () => {
    assert.equal(getPath({ a: { b: 1 } }, 'a.b'), 1);
    assert.deepEqual(getPath({ labels: [{ name: 'x' }, { name: 'y' }] }, 'labels[].name'), ['x', 'y']);
  });
  it('unwraps { total_count, items } lists', () => {
    assert.deepEqual(unwrapList({ total_count: 1, runners: [{ id: 1 }] }), [{ id: 1 }]);
    assert.deepEqual(unwrapList({ enabled: true, list: [] }), { enabled: true, list: [] });
  });
  it('flattens and tabulates', () => {
    assert.deepEqual(flatten({ a: { b: 1, c: [1, 2] }, d: null }), [['a.b', 1], ['a.c', [1, 2]], ['d', null]]);
    assert.deepEqual(tabulate({ enabled: true }), { headers: ['Setting', 'Value'], rows: [['enabled', 'Yes']] });
    assert.deepEqual(tabulate([{ name: 'a' }], [{ key: 'name', label: 'Name' }]), { headers: ['Name'], rows: [['a']] });
  });
  it('diffs objects by setting and lists by identity', () => {
    const rows = diffSection([{ x: 1, y: 2 }, { x: 1, y: 3 }]);
    assert.deepEqual(rows.find((r) => r.key === 'y'), { key: 'y', values: ['2', '3'], differs: true });
    assert.equal(rows.find((r) => r.key === 'x')!.differs, false);
    const lists = diffSection([[{ name: 'A' }, { name: 'B' }], [{ name: 'A' }]]);
    assert.deepEqual(lists.find((r) => r.key === 'B')!.values[1], '(missing)');
  });
});

describe('feature registry', () => {
  it('agrees with GitHub’s permissions dataset', () => {
    assert.deepEqual(checkRegistry(), []);
  });
  it('never requires a write permission and covers all three scopes', () => {
    for (const f of registry) if (typeof f.requiredPermission === 'object') assert.equal(f.requiredPermission.access, 'read');
    assert.deepEqual([...new Set(registry.map((f) => f.scope))].sort(), ['enterprise', 'org', 'repo']);
  });
  it('never queries SAML recovery codes', () => {
    assert.ok(!JSON.stringify(registry).includes('recoveryCodes'));
  });
});

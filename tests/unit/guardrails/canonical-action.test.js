import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalizeActionValue,
  canonicalizePayload,
  canonicalizeTarget,
  fingerprintPreconditions,
} from '../../../server/agent/guardrails/canonical-action.js';

test('canonical serialization sorts object keys and preserves array order', () => {
  assert.equal(canonicalizeTarget({ z: 1, a: { y: 2, b: true } }), '{"a":{"b":true,"y":2},"z":1}');
  assert.equal(canonicalizeActionValue(['a', 'b']), '["a","b"]');
  assert.notEqual(canonicalizeActionValue(['a', 'b']), canonicalizeActionValue(['b', 'a']));
});

test('equivalent payload object order has the same deterministic digest', () => {
  const first = canonicalizePayload({ operation: 'synthetic.write@1', target: { id: '42', kind: 'task' } });
  const second = canonicalizePayload({ target: { kind: 'task', id: '42' }, operation: 'synthetic.write@1' });
  assert.equal(first.serialized, second.serialized);
  assert.equal(first.sha256, second.sha256);
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  assert.equal(fingerprintPreconditions({ version: 1, exists: true }), fingerprintPreconditions({ exists: true, version: 1 }));
});

test('canonicalization rejects unsupported values, getters, cycles, sparse arrays, and special prototypes', () => {
  const cycle = {}; cycle.self = cycle;
  const getter = {};
  Object.defineProperty(getter, 'payload', { enumerable: true, get: () => 'synthetic' });
  const sparse = []; sparse.length = 2; sparse[1] = 'synthetic';
  for (const value of [undefined, () => {}, 1n, Number.NaN, cycle, getter, sparse, new Date()]) {
    assert.throws(() => canonicalizeActionValue(value), TypeError);
  }
});

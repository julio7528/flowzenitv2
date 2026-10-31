import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { validateInputDto, validateGuardrailLocalDate } from '../../../server/agent/guardrails/input-validation.js';
import { RUNTIME_LIMITS } from '../../../server/agent/runtime/limits.js';

const RequestSchema = z.strictObject({
  itemId: z.string().regex(/^[1-9][0-9]*$/),
  date: z.string().refine(value => {
    try { validateGuardrailLocalDate(value); return true; } catch { return false; }
  }),
  status: z.enum(['Backlog', 'Done']).optional(),
  text: z.string().optional(),
});

test('accepts schema-valid bounded input and preserves free-form text as inert data', () => {
  const text = 'SELECT * FROM synthetic_items; <script>synthetic</script>';
  const result = validateInputDto({
    schema: RequestSchema,
    candidate: { itemId: '42', date: '2026-10-29', text },
  });
  assert.equal(result.success, true);
  assert.equal(result.value.text, text);
});

test('strict schemas reject unknown fields, malformed identifiers, and unsupported dates', () => {
  assert.equal(validateInputDto({ schema: RequestSchema, candidate: { itemId: '0', date: '2026-10-29', unexpected: true } }).success, false);
  assert.equal(validateInputDto({ schema: RequestSchema, candidate: { itemId: '42', date: '2026-02-30' } }).success, false);
  assert.equal(validateInputDto({ schema: RequestSchema, candidate: { itemId: '4e2', date: '2026-10-29' } }).success, false);
});

test('structured SQL, executable code, unsupported enums, and control fields reject while text remains unchanged', () => {
  const attacks = [
    { itemId: '42; DROP TABLE synthetic', date: '2026-10-29', status: 'Done' },
    { itemId: '42', date: '2026-10-29', status: '<script>synthetic()</script>' },
    { itemId: '42', date: '2026-10-29', query: 'SELECT * FROM private_data' },
  ];
  for (const candidate of attacks) assert.equal(validateInputDto({ schema: RequestSchema, candidate }).success, false);

  const text = 'SELECT * FROM synthetic data; <script>stored text only</script>';
  const result = validateInputDto({ schema: RequestSchema, candidate: { itemId: '42', date: '2026-10-29', text } });
  assert.equal(result.success, true);
  assert.equal(result.value.text, text);
});

test('rejects excessive request bytes and fails closed when runtime limits are unavailable or overridden', () => {
  const oversized = validateInputDto({
    schema: z.strictObject({ text: z.string() }),
    candidate: { text: 'x'.repeat(RUNTIME_LIMITS.maxRequestBytes + 1) },
  });
  assert.deepEqual(oversized, { success: false, reason: 'input_too_large' });
  assert.deepEqual(validateInputDto({ schema: RequestSchema, candidate: { itemId: '42', date: '2026-10-29' }, runtimeLimits: null }), {
    success: false, reason: 'policy_unavailable',
  });
  assert.deepEqual(validateInputDto({ schema: RequestSchema, candidate: { itemId: '42', date: '2026-10-29' }, runtimeLimits: { maxRequestBytes: 100 } }), {
    success: false, reason: 'policy_unavailable',
  });
});

test('rejects cyclic, sparse, accessor-bearing, and non-JSON structured values', () => {
  const cyclic = {}; cyclic.self = cyclic;
  const sparse = []; sparse.length = 2; sparse[1] = 'synthetic';
  const accessor = {};
  Object.defineProperty(accessor, 'text', { enumerable: true, get: () => 'synthetic' });
  const schema = z.unknown();
  for (const candidate of [cyclic, sparse, accessor, { value: Number.POSITIVE_INFINITY }, new Date()]) {
    assert.equal(validateInputDto({ schema, candidate }).success, false);
  }
});

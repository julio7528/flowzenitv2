import assert from 'node:assert/strict';
import test from 'node:test';
import { createSafeGuardrailError, createSecurityEventFactory } from '../../../server/agent/guardrails/security-events.js';
import { SECRET_SENTINELS } from '../../fixtures/security/secret-sentinels.js';

test('safe events retain correlation and allowlisted fields while omitting sensitive details', () => {
  const factory = createSecurityEventFactory();
  const event = factory.create({
    reasonCategory: 'INVALID_INPUT', decision: 'DENY', eventType: 'validation_failure',
    correlationId: 'e6b28fb4-7930-4bf3-9cb3-56d9d3f47b04',
    operationId: 'synthetic.write@1', policyVersion: 'synthetic-policy@1', graphVersion: 'agent-turn-v1', elapsedMs: 12,
    prompt: SECRET_SENTINELS[0], payload: { secret: SECRET_SENTINELS[1] }, rawError: SECRET_SENTINELS[2],
  });
  const serialized = JSON.stringify(event);
  assert.equal(event.correlationId, 'e6b28fb4-7930-4bf3-9cb3-56d9d3f47b04');
  assert.equal(event.eventClass, 'benign_validation_failure');
  assert.equal(event.operationId, 'synthetic.write@1');
  assert.equal(SECRET_SENTINELS.some(sentinel => serialized.includes(sentinel)), false);
  assert.equal(Object.hasOwn(event, 'prompt'), false);
  assert.equal(Object.hasOwn(event, 'payload'), false);
});

test('automated classifier signals can only produce suspicious events', () => {
  const factory = createSecurityEventFactory({ independentEvidenceVerifier: () => true });
  const event = factory.create({ eventType: 'confirmed_attack', classifierSignal: true, reasonCategory: 'POLICY_DENIED' });
  assert.equal(event.eventClass, 'suspicious_signal');
});

test('confirmed attacks require independent evidence and safe errors expose no raw details', () => {
  const factory = createSecurityEventFactory({ independentEvidenceVerifier: evidence => evidence?.reviewed === true });
  const event = factory.create({ eventType: 'confirmed_attack', independentEvidence: { reviewed: true }, reasonCategory: 'POLICY_DENIED' });
  const safeError = createSafeGuardrailError({ reasonCategory: 'DEPENDENCY_UNAVAILABLE', correlationId: event.correlationId });
  assert.equal(event.eventClass, 'confirmed_attack');
  assert.equal(safeError.error.message, 'A required security check is unavailable.');
  assert.equal(Object.hasOwn(safeError.error, 'details'), false);
  assert.equal(SECRET_SENTINELS.some(sentinel => JSON.stringify(safeError).includes(sentinel)), false);
});

test('accessor-bearing event inputs fail to a safe default without invoking getters', () => {
  let getterCalls = 0;
  const input = {};
  Object.defineProperty(input, 'reasonCategory', {
    enumerable: true,
    get() { getterCalls += 1; return 'POLICY_ALLOWED'; },
  });
  const event = createSecurityEventFactory().create(input);
  assert.equal(getterCalls, 0);
  assert.equal(event.reasonCategory, 'POLICY_DENIED');
  assert.equal(event.eventClass, 'benign_validation_failure');
});

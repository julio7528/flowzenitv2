import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuardrailRedactor, REDACTED_VALUE } from '../../../server/agent/guardrails/redaction.js';
import { SECRET_SENTINELS } from '../../fixtures/security/secret-sentinels.js';

const correlationId = 'f05c6429-3298-4c85-983d-cf427bc70a7c';
const eventId = '37ff7858-e3b0-4e3e-95b4-386f11d79c9a';

function createRedactor() {
  return createGuardrailRedactor({
    toolResultFieldAllowlist: {
      'synthetic.read@1': {
        id: true,
        name: true,
        status: true,
        details: { summary: true },
      },
    },
    secretSentinels: SECRET_SENTINELS,
  });
}

test('response field and tool-result allowlists redact sentinels and omit private or unknown fields', () => {
  const result = createRedactor().redactResponse({
    text: `Safe answer ${SECRET_SENTINELS[0]} Bearer synthetic-auth-value`,
    evidence: [{
      toolName: 'synthetic.read',
      toolVersion: '1',
      id: 'item-42',
      name: SECRET_SENTINELS[1],
      status: 'Done',
      details: { summary: 'Synthetic result', rawPayload: SECRET_SENTINELS[2] },
      privateField: 'must not pass',
    }],
    inference: [{ claimId: 'claim-1', text: `Maybe ${SECRET_SENTINELS[2]}`, prompt: 'drop this' }],
    missingEvidence: ['claim-2'],
    uncompletedActions: [{ actionReference: 'action:42', status: 'uncertain', prompt: 'drop this' }],
    completedActions: [{ actionReference: 'action:41', status: 'executed', safeOutcomeReference: `sha256:${'b'.repeat(64)}`, secret: 'drop this' }],
    prompt: SECRET_SENTINELS[0],
    headers: { authorization: 'synthetic' },
  });

  assert.equal(result.success, true);
  assert.equal(result.value.text.includes(REDACTED_VALUE), true);
  assert.equal(result.value.evidence[0].name, REDACTED_VALUE);
  assert.equal(result.value.evidence[0].privateField, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(result.value.evidence[0].details)), { summary: 'Synthetic result' });
  assert.deepEqual(result.value.inference, [{ claimId: 'claim-1', text: `Maybe ${REDACTED_VALUE}` }]);
  assert.deepEqual(result.value.uncompletedActions, [{ actionReference: 'action:42', status: 'uncertain' }]);
  assert.equal(result.value.prompt, undefined);
  assert.equal(result.value.headers, undefined);
  assert.equal(JSON.stringify(result.value).includes('SYNTHETIC_'), false);
  assert.equal(JSON.stringify(result.value).includes('synthetic-auth-value'), false);
});

test('error redaction replaces caller messages and removes stack, provider, and private details', () => {
  const result = createRedactor().redactError({
    category: 'INVALID_INPUT',
    message: SECRET_SENTINELS[0],
    stack: SECRET_SENTINELS[1],
    providerBody: 'private provider error',
    sql: 'select private data',
    correlationId,
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.value, {
    error: { category: 'INVALID_INPUT', message: 'The proposed action is invalid.' },
    correlationId,
  });
  assert.equal(JSON.stringify(result.value).includes('SYNTHETIC_'), false);
});

test('logs and security events keep only bounded allowlisted metadata', () => {
  const redactor = createRedactor();
  const log = redactor.redactLog({
    eventId,
    correlationId,
    graphVersion: 'agent-graph@2',
    operationId: 'synthetic.read@1',
    reasonCategory: 'POLICY_DENIED',
    decision: 'DENY',
    elapsedMs: 12,
    graphStepsUsed: 2,
    modelCallsUsed: 1,
    toolCallsUsed: 0,
    prompt: SECRET_SENTINELS[0],
    arguments: { private: SECRET_SENTINELS[1] },
  });
  assert.equal(log.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(log.value)), {
    eventId,
    correlationId,
    graphVersion: 'agent-graph@2',
    operationId: 'synthetic.read@1',
    reasonCategory: 'POLICY_DENIED',
    decision: 'DENY',
    elapsedMs: 12,
    graphStepsUsed: 2,
    modelCallsUsed: 1,
    toolCallsUsed: 0,
  });

  const event = redactor.redactSecurityEvent({
    eventId,
    correlationId,
    reasonCategory: 'INVALID_INPUT',
    eventClass: 'suspicious_signal',
    decision: 'DENY',
    policyVersion: 'policy@1',
    graphVersion: 'agent-graph@2',
    operationId: 'synthetic.read@1',
    elapsedMs: 15,
    details: SECRET_SENTINELS[2],
    rawInput: 'do not include',
  });
  assert.equal(event.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(event.value)), {
    eventId,
    correlationId,
    reasonCategory: 'INVALID_INPUT',
    eventClass: 'suspicious_signal',
    decision: 'DENY',
    policyVersion: 'policy@1',
    graphVersion: 'agent-graph@2',
    operationId: 'synthetic.read@1',
    elapsedMs: 15,
  });
  assert.equal(JSON.stringify({ log, event }).includes('SYNTHETIC_'), false);
});

test('unknown tool response schemas and invalid action outcome envelopes fail closed', () => {
  const redactor = createRedactor();
  assert.deepEqual(redactor.redactResponse({
    evidence: [{ toolName: 'unknown.tool', toolVersion: '1', value: 'private' }],
  }), { success: false, reason: 'tool_result_schema_unavailable' });
  assert.deepEqual(redactor.redactResponse({
    completedActions: [{ actionReference: 'action:1', status: 'uncertain', safeOutcomeReference: 'uncertain:hash' }],
  }), { success: false, reason: 'invalid_response' });
  assert.throws(() => createGuardrailRedactor({
    toolResultFieldAllowlist: { 'synthetic.read@1': { accessToken: true } },
  }));
});

test('malformed, accessor-bearing, and cyclic payloads never pass through a surface', () => {
  const redactor = createRedactor();
  const accessor = {};
  Object.defineProperty(accessor, 'category', { enumerable: true, get: () => 'INVALID_INPUT' });
  assert.deepEqual(redactor.redactError(accessor), { success: false, reason: 'invalid_error' });
  const cyclic = {};
  cyclic.self = cyclic;
  assert.deepEqual(redactor.redactLog(cyclic), { success: false, reason: 'invalid_log' });
  assert.deepEqual(redactor.redactResponse({ text: 42 }), { success: false, reason: 'invalid_response' });
});

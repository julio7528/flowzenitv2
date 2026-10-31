import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuardrailRedactor } from '../../../server/agent/guardrails/redaction.js';
import { SECRET_SENTINELS } from '../../fixtures/security/secret-sentinels.js';

test('no synthetic secret sentinel escapes any response, error, log, or security-event surface', () => {
  const redactor = createGuardrailRedactor({
    toolResultFieldAllowlist: {
      'synthetic.read@1': { id: true, name: true },
    },
    secretSentinels: SECRET_SENTINELS,
  });
  const correlationId = 'f05c6429-3298-4c85-983d-cf427bc70a7c';
  const eventId = '37ff7858-e3b0-4e3e-95b4-386f11d79c9a';

  const outputs = [
    redactor.redactResponse({
      text: SECRET_SENTINELS[0],
      evidence: [{ toolName: 'synthetic.read', toolVersion: '1', id: 'synthetic-42', name: SECRET_SENTINELS[1] }],
    }),
    redactor.redactError({ category: 'DEPENDENCY_UNAVAILABLE', message: SECRET_SENTINELS[2], stack: SECRET_SENTINELS[0], correlationId }),
    redactor.redactLog({ correlationId, operationId: 'synthetic.read@1', prompt: SECRET_SENTINELS[1], arguments: SECRET_SENTINELS[2] }),
    redactor.redactSecurityEvent({
      eventId,
      correlationId,
      reasonCategory: 'INVALID_INPUT',
      eventClass: 'suspicious_signal',
      decision: 'DENY',
      details: SECRET_SENTINELS[0],
      rawInput: SECRET_SENTINELS[1],
    }),
  ];

  assert.equal(outputs.every(output => output.success), true);
  const serialized = JSON.stringify(outputs);
  for (const sentinel of SECRET_SENTINELS) assert.equal(serialized.includes(sentinel), false, sentinel);
});

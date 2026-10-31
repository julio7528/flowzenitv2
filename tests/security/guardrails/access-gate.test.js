import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createPolicyEvaluator } from '../../../server/agent/guardrails/policy.js';
import { isAgentAccessGateOpen } from '../../../server/security/accessGate.js';

test('the fixed public POC gate does not let request or model data expand the server tool registry', async () => {
  let gateChecks = 0;
  let matrixReads = 0;
  let preconditionReads = 0;
  let handlerCalls = 0;
  const operationName = 'registered.read';
  const operationVersion = '1';
  const operationKey = `${operationName}@${operationVersion}`;
  const entries = Object.create(null);
  entries[operationKey] = Object.freeze({ outcome: 'ALLOW', confirmationRequired: false });
  const capabilities = new Map([[operationKey, {
    operationName,
    operationVersion,
    capability: operationKey,
    enabled: true,
    inputSchema: z.strictObject({ value: z.string() }),
    isTargetInScope: target => target === '{"id":"synthetic"}',
    readPreconditions: () => {
      preconditionReads += 1;
      return { available: true, valid: true, snapshot: { revision: 1 } };
    },
    handler: () => {
      handlerCalls += 1;
      return 'synthetic-read-result';
    },
  }]]);

  const evaluator = createPolicyEvaluator({
    accessGate: {
      allowsAction: async action => {
        gateChecks += 1;
        assert.deepEqual(Object.keys(action).sort(), [
          'canonicalTarget',
          'capability',
          'operationName',
          'operationVersion',
        ]);
        return isAgentAccessGateOpen({
          passkeyUnlocked: false,
          accessDecision: 'deny',
          modelOutput: { accessDecision: 'deny', tools: ['raw.sql'] },
        });
      },
    },
    matrixProvider: () => {
      matrixReads += 1;
      return { version: 'synthetic-poc-matrix@1', status: 'approved', entries };
    },
    budgetProvider: () => ({ graphStepsUsed: 0, modelCallsUsed: 0, toolCallsUsed: 0 }),
    capabilityRegistry: capabilities,
  });

  const registered = await evaluator.evaluate({
    operationName,
    operationVersion,
    target: { id: 'synthetic' },
    arguments: { value: 'synthetic-request' },
    passkeyUnlocked: false,
    accessDecision: 'deny',
    modelOutput: { accessDecision: 'deny', tools: ['raw.sql'] },
  });
  assert.equal(registered.outcome, 'ALLOW');
  assert.equal(registered.reasonCategory, 'POLICY_ALLOWED');

  const unregistered = await evaluator.evaluate({
    operationName: 'raw.sql',
    operationVersion,
    target: { id: 'synthetic' },
    arguments: { value: 'synthetic-request', sql: 'select * from public.synthetic_table' },
    passkeyUnlocked: true,
    accessDecision: 'allow',
    modelOutput: { accessDecision: 'allow', tools: ['raw.sql'] },
  });
  assert.equal(unregistered.outcome, 'DENY');
  assert.equal(unregistered.reasonCategory, 'CAPABILITY_DISABLED');

  const extraInput = await evaluator.evaluate({
    operationName,
    operationVersion,
    target: { id: 'synthetic' },
    arguments: { value: 'synthetic-request', sql: 'select * from public.synthetic_table' },
  });
  assert.equal(extraInput.outcome, 'DENY');
  assert.equal(extraInput.reasonCategory, 'INVALID_INPUT');

  assert.equal(gateChecks, 1);
  assert.equal(matrixReads, 1);
  assert.equal(preconditionReads, 1);
  assert.equal(handlerCalls, 0, 'evaluate never invokes the registered handler');
});

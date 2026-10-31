import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAccessGate, memoryAccessGate } from '../../../server/agent/memory/access-gate.js';
import { isAgentAccessGateOpen, withAgentAccess } from '../../../server/security/accessGate.js';

const DISABLED = {
  error: {
    code: 'ACCESS_DISABLED',
    message: 'Conversation memory unavailable',
  },
};

test('DEC-001 closed rejects memory access before repository, checkpoint, ledger, or handler calls', async () => {
  let privateCalls = 0;
  const dependencies = {
    repository: { read: () => { privateCalls += 1; } },
    checkpoint: { load: () => { privateCalls += 1; } },
    ledger: { lookup: () => { privateCalls += 1; } },
    privateHandler: () => { privateCalls += 1; },
  };
  const gate = new MemoryAccessGate();

  const result = await gate.run(() => {
    dependencies.repository.read();
    dependencies.checkpoint.load();
    dependencies.ledger.lookup();
    dependencies.privateHandler();
    return { transcript: 'synthetic-private-content' };
  });

  assert.deepEqual(result, DISABLED);
  assert.equal(privateCalls, 0);
});

test('request or passkey-shaped input cannot open the gate', () => {
  assert.equal(memoryAccessGate.isOpen(), false);
  assert.deepEqual(
    memoryAccessGate.check({ passkeyUnlocked: true, ownerId: 'synthetic-owner' }),
    DISABLED,
  );
});

test('the gate does not evaluate a supplied operation, including one that throws', async () => {
  let operationCalls = 0;

  const result = await memoryAccessGate.run(() => {
    operationCalls += 1;
    throw new Error('synthetic private failure');
  });

  assert.deepEqual(result, DISABLED);
  assert.equal(operationCalls, 0);
});

test('the owner-selected agent POC decision is fixed open regardless of request or passkey state', async () => {
  const requests = [
    {},
    { passkeyUnlocked: false, authenticated: false, access: 'deny' },
    { passkeyUnlocked: true, authenticated: true, access: 'allow', role: 'admin' },
    { body: { passkeyVerified: true, accessDecision: 'deny', permissions: ['synthetic'] } },
  ];
  let operationCalls = 0;

  for (const request of requests) {
    assert.equal(isAgentAccessGateOpen(request), true);
    const result = await withAgentAccess(request, async () => {
      operationCalls += 1;
      return { status: 'synthetic-allowed' };
    });
    assert.deepEqual(result, { status: 'synthetic-allowed' });
  }

  assert.equal(operationCalls, requests.length);
});

test('model-provided access decisions do not control the server-owned POC gate', async () => {
  const modelOutputs = [
    { accessDecision: 'deny', tools: [] },
    { accessDecision: 'allow', tools: ['synthetic-unregistered-operation'] },
  ];

  for (const modelOutput of modelOutputs) {
    assert.equal(isAgentAccessGateOpen({ modelOutput }), true);
  }
});

test('the agent gate safely denies invalid operation callbacks without invoking them', async () => {
  assert.deepEqual(await withAgentAccess({}, null), {
    ok: false,
    error: { code: 'CAPABILITY_DISABLED', message: 'Capability unavailable' },
  });
  assert.deepEqual(await withAgentAccess({}, 'synthetic-operation'), {
    ok: false,
    error: { code: 'CAPABILITY_DISABLED', message: 'Capability unavailable' },
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createConfirmationStorePort } from '../../../server/agent/guardrails/confirmation-ports.js';
import { createConfirmationGrantIssuer } from '../../../server/agent/guardrails/confirmation.js';

async function makeGrant() {
  const issuer = createConfirmationGrantIssuer({
    idempotencyKeyPort: { async createKey() { return 'synthetic-idempotency-key'; } },
  });
  return issuer.issue({
    conversationRef: 'synthetic-conversation', operationName: 'synthetic.write', operationVersion: '1',
    target: { id: 'synthetic-target' }, payload: { status: 'Done' }, preconditions: { revision: 1 },
    issuedAt: 100, expiresAt: 200, policyVersion: 'synthetic-policy@1',
  });
}

test('store port delegates issue/reject/consumeOnce without choosing persistence or TTL', async () => {
  const grant = await makeGrant();
  const received = [];
  const port = createConfirmationStorePort({
    async issue(value) { received.push(['issue', value]); return { grantRef: value.grantRef }; },
    async reject(ref) { received.push(['reject', ref]); return { status: 'rejected' }; },
    async consumeOnce(ref, binding) {
      received.push(['consumeOnce', ref, binding]);
      return { status: 'reserved', grant, idempotencyKey: grant.idempotencyKey };
    },
  });
  const issued = await port.issue(grant);
  const rejected = await port.reject(issued.grantRef);
  const consumed = await port.consumeOnce(issued.grantRef, { payloadHash: grant.payloadHash });
  assert.deepEqual(issued, { status: 'issued', grantRef: grant.grantRef });
  assert.deepEqual(rejected, { status: 'rejected' });
  assert.equal(consumed.status, 'reserved');
  assert.equal(consumed.grant, grant);
  assert.equal(consumed.idempotencyKey, grant.idempotencyKey);
  assert.equal(received.length, 3);
});

test('port normalizes malformed adapter outcomes and missing dependencies to unavailable', async () => {
  assert.throws(() => createConfirmationStorePort({ issue() {} }), TypeError);
  const port = createConfirmationStorePort({
    async issue() { return {}; },
    async reject() { throw new Error('synthetic internal failure'); },
    async consumeOnce() { return { status: 'reserved', grant: {}, idempotencyKey: '' }; },
  });
  assert.deepEqual(await port.issue(await makeGrant()), { status: 'unavailable' });
  assert.deepEqual(await port.reject('synthetic-ref'), { status: 'unavailable' });
  assert.deepEqual(await port.consumeOnce('synthetic-ref', {}), { status: 'unavailable' });
});

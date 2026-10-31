import assert from 'node:assert/strict';
import test from 'node:test';
import { createSideEffectSpy } from '../../unit/guardrails/test-helpers.js';
import { createConfirmationGrantIssuer } from '../../../server/agent/guardrails/confirmation.js';
import { createConfirmationStorePort } from '../../../server/agent/guardrails/confirmation-ports.js';
import { canonicalizeActionValue } from '../../../server/agent/guardrails/canonical-action.js';

function bindingOf(grant) {
  return {
    conversationRef: grant.conversationRef,
    operationName: grant.operationName,
    operationVersion: grant.operationVersion,
    canonicalTarget: grant.canonicalTarget,
    payloadHash: grant.payloadHash,
    preconditionFingerprint: grant.preconditionFingerprint,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
    nonce: grant.nonce,
    policyVersion: grant.policyVersion,
    idempotencyKey: grant.idempotencyKey,
    actionHash: grant.actionHash,
  };
}

function makeAtomicFakeStore({ now = 150 } = {}) {
  const records = new Map();
  return Object.freeze({
    async issue(grant) {
      records.set(grant.grantRef, { grant, state: 'issued' });
      return { grantRef: grant.grantRef };
    },
    async reject(grantRef) {
      const record = records.get(grantRef);
      if (!record || record.state !== 'issued') return { status: 'already_final' };
      record.state = 'rejected';
      return { status: 'rejected' };
    },
    consumeOnce(grantRef, expectedBinding) {
      const record = records.get(grantRef);
      if (!record) return { status: 'unavailable' };
      if (now < record.grant.issuedAt || now >= record.grant.expiresAt) return { status: 'expired' };
      if (canonicalizeActionValue(expectedBinding) !== canonicalizeActionValue(bindingOf(record.grant))) {
        return { status: 'mismatch' };
      }
      if (record.state !== 'issued') return { status: 'already_consumed' };
      record.state = 'reserved';
      return { status: 'reserved', grant: record.grant, idempotencyKey: record.grant.idempotencyKey };
    },
  });
}

async function createGrant() {
  const issuer = createConfirmationGrantIssuer({
    idempotencyKeyPort: { async createKey() { return 'synthetic-idempotency-key'; } },
  });
  return issuer.issue({
    conversationRef: 'synthetic-conversation', operationName: 'synthetic.write', operationVersion: '1',
    target: { id: 'synthetic-target' }, payload: { status: 'Done' }, preconditions: { revision: 1 },
    issuedAt: 100, expiresAt: 200, policyVersion: 'synthetic-policy@1',
  });
}

test('concurrent consumeOnce and replay allow at most one handler invocation', async () => {
  const grant = await createGrant();
  const port = createConfirmationStorePort(makeAtomicFakeStore());
  const issued = await port.issue(grant);
  const expected = bindingOf(grant);
  const results = await Promise.all(Array.from({ length: 32 }, () => port.consumeOnce(issued.grantRef, expected)));
  const reserved = results.filter(result => result.status === 'reserved');
  const effects = createSideEffectSpy();
  reserved.forEach(() => effects.invoke('synthetic.write@1'));

  assert.equal(reserved.length, 1);
  assert.equal(results.filter(result => result.status === 'already_consumed').length, 31);
  assert.equal(effects.total, 1);
  assert.equal((await port.consumeOnce(issued.grantRef, expected)).status, 'already_consumed');
  assert.equal(effects.total, 1);
});

test('a mismatched binding cannot consume a grant; exact binding can still be consumed once', async () => {
  const grant = await createGrant();
  const port = createConfirmationStorePort(makeAtomicFakeStore());
  const issued = await port.issue(grant);
  const mismatch = await port.consumeOnce(issued.grantRef, { ...bindingOf(grant), payloadHash: 'different' });
  const valid = await port.consumeOnce(issued.grantRef, bindingOf(grant));
  assert.equal(mismatch.status, 'mismatch');
  assert.equal(valid.status, 'reserved');
});

test('expired grants cannot be reserved by the fake store', async () => {
  const grant = await createGrant();
  const port = createConfirmationStorePort(makeAtomicFakeStore({ now: grant.expiresAt }));
  const issued = await port.issue(grant);
  assert.equal((await port.consumeOnce(issued.grantRef, bindingOf(grant))).status, 'expired');
});
